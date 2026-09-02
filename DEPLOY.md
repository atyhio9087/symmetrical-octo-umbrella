# Deploying to Azure Databricks (Databricks Apps)

This app deploys as a **Databricks App** — Databricks' native way to host a persistent
full-stack web app inside your workspace, as opposed to a batch Job/cluster (which isn't
built for serving a live HTTP server).

## Prerequisites

- A Databricks workspace on Azure with **Databricks Apps** enabled.
- The [Databricks CLI](https://docs.databricks.com/dev-tools/cli/index.html) installed and
  authenticated against your workspace (`databricks auth login`).
- Whichever AI backend you're using set up ahead of time:
  - **Gemini** (default): a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).
  - **Databricks Foundation Model API** (e.g. Gemma 3): a model serving endpoint already created
    in your workspace, plus a personal access token or service principal OAuth token that can
    call it.
- If you'll use the LinkedIn Research Agent feature: an Apify API key.

## 1. Store secrets in a Databricks secret scope

Don't put real keys in `app.yaml` or commit them anywhere. Create a secret scope and store each
value your chosen provider needs:

```bash
databricks secrets create-scope outreachiq
databricks secrets put-secret outreachiq gemini-api-key
# ...and/or, if using AI_PROVIDER=databricks:
databricks secrets put-secret outreachiq databricks-token
# optional, only if using the LinkedIn Research Agent:
databricks secrets put-secret outreachiq apify-api-key
```

Then wire these into the app's environment as Databricks App resources (via the Apps UI, or the
`resources` section of `app.yaml` — see the
[Databricks Apps docs](https://docs.databricks.com/en/dev-tools/databricks-apps/index.html) for
the current syntax, since this is evolving product surface). At minimum, the app needs
`GEMINI_API_KEY` (or the three `DATABRICKS_*` vars) set as environment variables at runtime —
see `.env.example` for the full list.

## 2. Build the project knowledge base

The knowledge base is precomputed offline into a small vector DB and shipped as a static asset —
the running app never re-embeds it or calls out to Hugging Face on a normal request. Before you
deploy (and again any time the case-study spreadsheet changes):

```bash
pip install -r requirements.txt
python build_knowledge_base.py --input assets/knowledge_base.csv --output-prefix assets/knowledge_base_vectordb
```

This reads `assets/knowledge_base.csv` (or point `--input` at an `.xlsx` file), embeds each row
with `sentence-transformers/all-MiniLM-L6-v2`, and writes
`assets/knowledge_base_vectordb.npy` + `assets/knowledge_base_vectordb.json`. Commit both files
and redeploy — the app loads them once at startup (see `match_projects.py`). There's no live
Google Sheets or CSV-reading-per-request path any more; updating the knowledge base is always a
"rebuild the vector DB, then redeploy" step.

## 3. Configure the company email format library

`assets/company_templates.csv` ships as an empty template (header row only — see `README.md` for
the column schema). Fill it in with your real per-company formats before deploying, or leave it
empty and use the in-app "Upload CSV / Excel" control after deploying — that persists straight to
`assets/company_templates.csv` on the server via `POST /api/company-templates`, so it survives
page reloads without a redeploy (though it does NOT survive Databricks Apps recreating the
container from source — treat the in-app upload as a between-redeploys convenience, and keep the
authoritative copy of the file in source control for anything you want to persist long-term).

## 4. Deploy

```bash
databricks apps create outreachiq
databricks apps deploy outreachiq --source-code-path .
```

`app.yaml` at the project root tells Databricks Apps how to run this app: it installs Python
dependencies (for the RAG matching worker), installs Node dependencies, builds the production
bundle, and starts the server, all in one command — since Node.js apps don't get an automatic
install/build step the way Databricks' Python app templates do.

## 5. Known open item: the Python matching subprocess

The RAG project-matching endpoint (`/api/match-projects`) talks to a **persistent** Python worker
(`match_projects.py`, needing `sentence-transformers`, `rank-bm25`, `numpy` — see
`requirements.txt`) rather than spawning a new process per request. The Node server starts this
worker once at boot (pre-warming it so the embedding model finishes loading before the first real
request arrives) and keeps it alive for the server's lifetime — a request against an unchanged
knowledge base only needs to embed the new query text, typically tens of milliseconds, instead of
re-loading the model and re-embedding every case study on every single call (which is what used to
make live-matching-as-you-type noticeably slow). If the worker process ever dies, Node detects it,
rejects any in-flight requests with a clear error, and transparently respawns it on the next call.

This works via a plain `python`/`python3` on `PATH`, verified extensively in local dev — but **it
has not been verified inside an actual Databricks Apps container**, since that requires a real
workspace deployment to test. Things to check once deployed:

1. Does the Apps container have `python3` on `PATH`, and can it install packages from
   `requirements.txt`? If not, you'll need either an init script, a custom container image, or to
   vendor the dependencies.
2. Does the container support a long-lived background child process (it should — Databricks Apps
   run as a continuous process, not a serverless function with an idle timeout)?
3. If Python isn't available or the packages aren't installed, this endpoint will fail
   gracefully — the frontend automatically falls back to a weaker in-browser keyword matcher
   (see `src/utils/matchingEngine.ts`), so the app stays usable, just with less precise matching.
4. Optional speed-up: set a `HF_TOKEN` env var (a free Hugging Face account token) to avoid the
   unauthenticated-request rate limit when the embedding model is first downloaded/verified against
   the Hugging Face Hub — this only affects the one-time warm-up at boot, not per-request speed.

## 6. Verify

Once deployed, Databricks Apps gives you a URL for the running app. Check:

- The landing page loads (`GET /`).
- `GET /api/health` returns `{"status":"ok","aiProvider":"..."}` with the provider you expect.
- Generate a real blurb end-to-end to confirm your chosen AI provider is correctly wired.
