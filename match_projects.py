import sys
import json
import re
import os
import hashlib
import numpy as np
from sentence_transformers import SentenceTransformer
from rank_bm25 import BM25Okapi

VECTOR_DB_PREFIX = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "knowledge_base_vectordb")

# Simple tokenizer helper
def tokenize(text):
    if not text:
        return []
    # Lowercase and split on non-alphanumeric words
    words = re.findall(r'\b\w+\b', text.lower())
    # Exclude single character words to focus on meaningful terms
    return [w for w in words if len(w) > 1]

def build_document(p):
    """Fallback document-builder for the (optional) dynamic path, where a request supplies its own
    `projects` array instead of using the precomputed vector DB — see build_knowledge_base.py's
    build_document() for the richer version baked into the shipped artifact."""
    raw = p.get("raw") or {}
    if not isinstance(raw, dict):
        raw = {}
    deliv = p.get("deliverableName") or p.get("Deliverable name") or raw.get("Deliverable name") or ""
    biz = p.get("businessArea") or p.get("Business Area") or raw.get("Business Area") or ""
    client = p.get("client") or p.get("Client") or raw.get("Client") or ""
    val = p.get("valueImpact") or p.get("Value (Impact)") or p.get("Value") or raw.get("Value (Impact)") or raw.get("Value") or ""
    return f"Deliverable Name: {deliv}. Business Area: {biz}. Client: {client}. Value (Impact): {val}."

def fingerprint_projects(projects):
    h = hashlib.sha256()
    for p in projects:
        h.update(str(p.get("id", "")).encode("utf-8"))
        h.update(b"\0")
        h.update(build_document(p).encode("utf-8"))
        h.update(b"\x1e")
    return h.hexdigest()

class MatcherIndex:
    """Holds the embeddings + BM25 index + source rows for one corpus (either the precomputed
    vector DB loaded once at startup, or a dynamically-supplied project list, cached by content
    fingerprint so an unchanged list doesn't get re-embedded on every request)."""
    def __init__(self, project_map, embeddings, bm25):
        self.project_map = project_map
        self.embeddings = embeddings
        self.bm25 = bm25

def load_vector_db():
    npy_path = f"{VECTOR_DB_PREFIX}.npy"
    json_path = f"{VECTOR_DB_PREFIX}.json"
    if not (os.path.exists(npy_path) and os.path.exists(json_path)):
        return None

    embeddings = np.load(npy_path)
    with open(json_path, "r", encoding="utf-8") as f:
        meta = json.load(f)

    projects = meta.get("projects", [])
    documents = meta.get("documents", [])
    if len(projects) != embeddings.shape[0] or len(documents) != embeddings.shape[0]:
        sys.stderr.write(
            f"knowledge_base_vectordb: row count mismatch (embeddings={embeddings.shape[0]}, "
            f"projects={len(projects)}, documents={len(documents)}) — ignoring vector DB.\n"
        )
        return None

    project_map = {idx: p for idx, p in enumerate(projects)}
    tokenized_corpus = [tokenize(doc) for doc in documents]
    bm25 = BM25Okapi(tokenized_corpus) if tokenized_corpus else None
    return MatcherIndex(project_map, embeddings, bm25)

class DynamicCache:
    """Cache for the optional dynamic path (a request supplying its own `projects` array), keyed
    by content fingerprint so the same list queried repeatedly only gets embedded once."""
    def __init__(self):
        self.fingerprint = None
        self.index = None

    def ensure(self, projects, model):
        fp = fingerprint_projects(projects)
        if fp == self.fingerprint and self.index is not None:
            return self.index

        documents = [build_document(p) for p in projects]
        project_map = {idx: p for idx, p in enumerate(projects)}
        embeddings = model.encode(documents, convert_to_numpy=True)
        tokenized_corpus = [tokenize(doc) for doc in documents]
        bm25 = BM25Okapi(tokenized_corpus) if tokenized_corpus else None

        self.fingerprint = fp
        self.index = MatcherIndex(project_map, embeddings, bm25)
        return self.index

def cosine_similarities(embeddings, query_vector):
    """Brute-force cosine similarity — plenty fast for the case-study database sizes this app
    targets (tens to a few hundred rows), and avoids standing up a vector-DB server for a dataset
    this small."""
    norms = np.linalg.norm(embeddings, axis=1) * np.linalg.norm(query_vector)
    norms = np.where(norms == 0, 1e-9, norms)
    return (embeddings @ query_vector) / norms

def handle_request(input_data, model, static_index, dynamic_cache):
    projects = input_data.get("projects")
    designation = input_data.get("designation", "")
    area_of_focus = input_data.get("areaOfFocus", "")
    company = input_data.get("company", "")
    company_intel = input_data.get("companyIntelligence", "")
    top_k = input_data.get("topK", 5)

    # Prefer the precomputed vector DB (the normal path — no `projects` sent at all). Only fall
    # back to embedding a dynamically-supplied list if the caller explicitly provides one (e.g.
    # during a transition, or if the vector DB hasn't been built yet).
    if projects:
        index = dynamic_cache.ensure(projects, model)
    elif static_index is not None:
        index = static_index
    else:
        return {"matches": [], "warning": "No knowledge_base_vectordb.npy/.json found and no projects supplied."}

    if len(index.project_map) == 0:
        return {"matches": []}

    query_parts = [x for x in [company, designation, area_of_focus, company_intel] if x]
    query = " ".join(query_parts)

    query_vector = model.encode(query, convert_to_numpy=True)
    sims = cosine_similarities(index.embeddings, query_vector)
    semantic_order = np.argsort(-sims)
    semantic_ranks = {int(idx): rank + 1 for rank, idx in enumerate(semantic_order)}

    tokenized_query = tokenize(query)
    n = len(index.project_map)
    bm25_scores = index.bm25.get_scores(tokenized_query) if index.bm25 is not None else [0.0] * n
    bm25_sorted_indices = sorted(range(len(bm25_scores)), key=lambda k: bm25_scores[k], reverse=True)
    bm25_ranks = {idx: rank + 1 for rank, idx in enumerate(bm25_sorted_indices)}

    # Reciprocal Rank Fusion (RRF) Reranking
    rrf_scores = []
    for idx in range(n):
        r_sem = semantic_ranks.get(idx, n)
        r_bm25 = bm25_ranks.get(idx, n)
        rrf_score = 1.0 / (60.0 + r_sem) + 1.0 / (60.0 + r_bm25)
        rrf_scores.append((idx, rrf_score))

    rrf_scores.sort(key=lambda x: x[1], reverse=True)

    top_results = rrf_scores[:top_k]
    matched_projects = []
    for idx, score in top_results:
        p = dict(index.project_map[idx])
        p["matchScore"] = round(score * 3000, 1)
        matched_projects.append(p)

    return {"matches": matched_projects}

def main():
    # Loaded once for the lifetime of this process, not per request.
    model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
    static_index = load_vector_db()
    dynamic_cache = DynamicCache()

    if static_index is not None:
        sys.stderr.write(f"Loaded precomputed knowledge base vector DB ({len(static_index.project_map)} case studies).\n")
    else:
        sys.stderr.write("No knowledge_base_vectordb.npy/.json found — run build_knowledge_base.py, or requests must supply their own `projects`.\n")

    # Signal readiness once the (slow) model load + vector DB load is done, so the Node side knows
    # exactly when this worker can start accepting requests rather than guessing with a timeout.
    print(json.dumps({"ready": True}), flush=True)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        request_id = None
        try:
            input_data = json.loads(line)
            request_id = input_data.get("requestId")
            result = handle_request(input_data, model, static_index, dynamic_cache)
            result["requestId"] = request_id
            print(json.dumps(result), flush=True)
        except Exception as e:
            print(json.dumps({"requestId": request_id, "error": str(e)}), flush=True)

if __name__ == "__main__":
    main()
