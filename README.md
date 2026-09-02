# LatentView OutreachIQ (CaseMatchAI): Enterprise Cold Outreach Suite

OutreachIQ is a full-stack web app that drafts highly personalized, metrics-driven cold outreach
emails (plus a matching LinkedIn DM) by matching a stakeholder's role and focus areas against your
organization's own track record of case studies.

---

## Key Features

- **Project knowledge base**: precomputed offline into a vector DB and shipped with the app (see
  **Knowledge Base Workflow** below) — the running app never re-embeds anything on a normal
  request. Matching uses a hybrid RAG pipeline (BM25 + embeddings via a persistent Python
  subprocess), falling back to a weaker JS keyword matcher if Python isn't available.
- **Company email format library** (optional): a table of established, company-specific email
  formats (e.g. distinct styles for "Acme" vs "Acme EU", or per-department formats). When a
  stakeholder's company matches a row, that format is used instead of the generic one, and its
  fixed structure (subject line, greeting, sign-off, bracketed placeholders) is followed as
  closely to word-for-word as the model can manage — only the bracketed instructional
  placeholders are filled with generated content. A row with `Company = generic` is used whenever
  no company-specific match is found. Replaceable at any time from the UI — see below.
- **Sender identity fields**: optional "Your Name" / "Your Position" inputs fill the `[Your Name]`
  / `[Your Position]` sign-off placeholders verbatim. Left blank, those literal placeholders are
  preserved in the output instead of the model inventing a fictional name or title.
- **Manual profiling or LinkedIn Research Agent**: type in stakeholder details, or paste a
  LinkedIn URL to have it researched automatically (requires an Apify API key).
- **Single + Batch modes**, for both a first-touch "New Outreach" flow and a "Follow-Up" flow that
  takes a previously-sent email as context. Sender identity and the company template library are
  shared across all of them.
- **Generates a complete email (3 referenced case studies, 250+ words) and a matching LinkedIn DM
  (700–1000 characters, never truncated)** in one call, plus an iterative feedback loop ("make it
  shorter", "add a use case") to refine either.
- **Swappable AI backend**: Gemini (default — use this for local testing via Google AI Studio), a
  local Ollama model, or a Databricks Foundation Model API serving endpoint (e.g. Gemma 3) — see
  `.env.example`.

---

## Technical Stack

- **Frontend**: React 19, TypeScript, TailwindCSS v4, Vite, Lucide-React
- **Backend**: Express, Node.js
- **AI**: Google Gemini, Ollama, or Databricks Foundation Model APIs (configurable via
  `AI_PROVIDER`)
- **Matching**: a persistent Python worker (`sentence-transformers`, `rank-bm25`, `numpy`) serving
  a precomputed vector DB, with a JS fallback if Python isn't available

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- Python 3 with the packages in `requirements.txt` (`pip install -r requirements.txt`) — needed to
  (a) build the knowledge base vector DB and (b) run the matching worker at runtime. The app still
  works without Python at runtime via a weaker JS fallback matcher, but the vector DB can only be
  built with Python.
- An API key/endpoint for whichever AI provider you're using (see `.env.example`). For local
  development and testing, Gemini via [Google AI Studio](https://aistudio.google.com/apikey) is
  the simplest option.

### Installation & Setup

```bash
npm install
pip install -r requirements.txt
cp .env.example .env
# edit .env: at minimum, set GEMINI_API_KEY (or the AI_PROVIDER=ollama/databricks variables)
```

### Build the knowledge base

The project knowledge base is **not** read live from a CSV/Sheet on every request — it's
precomputed once into a small vector DB that ships with the app:

```bash
python build_knowledge_base.py --input assets/knowledge_base.csv --output-prefix assets/knowledge_base_vectordb
```

This produces `assets/knowledge_base_vectordb.npy` (embeddings) and
`assets/knowledge_base_vectordb.json` (row data + document text), which the app loads once at
startup. Re-run this command (and restart the server / redeploy) any time
`assets/knowledge_base.csv` changes — see **Knowledge Base Workflow** below for the full picture.

### Development Server

```bash
npm run dev
```
Open **http://localhost:3000**.

### Production Build

```bash
npm run build
npm run start
```

For deploying to Azure Databricks (Databricks Apps), see `DEPLOY.md`.

---

## Knowledge Base Workflow

There is intentionally **no live link connector** (no Google Sheets integration, no per-request
CSV reads) — this keeps the app fast and keeps API/embedding calls to a minimum. Instead, updating
the knowledge base is a three-step, admin-run offline process:

1. **Edit** `assets/knowledge_base.csv` (or an `.xlsx` with the same base name) with your real case
   studies — see the schema below. `assets/knowledge_base.sample.csv` shows the expected format
   with real example rows (including a multi-line cell, to confirm your spreadsheet tool exports
   multi-line fields correctly); it is never auto-loaded itself, just a reference to copy from.
2. **Rebuild the vector DB**:
   ```bash
   python build_knowledge_base.py --input assets/knowledge_base.csv --output-prefix assets/knowledge_base_vectordb
   ```
   This re-embeds every row with `sentence-transformers/all-MiniLM-L6-v2` and also builds a
   `Keywords:` field per row (Business Area, Project Type, Technology Used, Impact Type) baked
   into the document text purely to strengthen BM25 exact-term matching alongside the semantic
   embeddings.
3. **Redeploy** (or just restart the server locally) so the running app picks up the new
   `.npy`/`.json` files. In the UI, the Knowledge Database panel's **Reload** button re-fetches
   `GET /api/knowledge-base` without a full page reload, but the Python matching worker itself
   still needs a process restart to actually load new embeddings into memory.

This is a deliberate tradeoff: rebuilding is a manual step, but it means the running app makes
**zero** embedding API/model calls on a normal request — only the live query text (a few words)
gets embedded per search, which is what makes matching fast and cheap at scale.

### Project Knowledge Base schema (one row per case study)

| Column | Notes |
|---|---|
| `S.No` | Optional serial number |
| `Insight Period` | e.g. `202506` |
| `Client` | Client/company name |
| `Project Type` | e.g. Data Science / Data Engineering / Business Analysis |
| `Business Area` | e.g. Risk & Fraud, Supply Chain Analytics |
| `Technology Used` | e.g. "Python, SQL, Databricks" |
| `Deliverable Name` | The project's name (only field with a fallback default if missing) |
| `Problem Statement` | The business problem |
| `Objective` | The goal |
| `Approach` | How it was solved |
| `Impact Created` | What resulted |
| `Impact Type` | Category of impact |
| `Value (Impact)` | e.g. "$6.2M in Fuel & Labor Savings" |

Every column except `Deliverable Name` is optional — a row missing some fields is used as-is; the
model is instructed not to invent details for fields that aren't present. Column matching is
fuzzy/case-insensitive, both in the app (TypeScript) and in `build_knowledge_base.py` (Python) —
the same alias list is maintained in both places.

---

## Company Email Format Library

Optional. Unlike the project knowledge base, this **is** read live from
`assets/company_templates.csv` on each request (it's small, so there's no need to precompute it).
Two ways to manage it:

- **Before deploying**: edit `assets/company_templates.csv` directly (an `.xlsx` with the same
  base name also works) and redeploy. `assets/company_templates.sample.csv` shows the expected
  format with real example rows — copy its structure, it's never auto-loaded itself.
- **At any time from the UI**: use the **Upload CSV / Excel** button in the Company Email Format
  Library panel (it reads "Replace with New File" once a library is already loaded) to swap in a
  new file. This both updates the current session immediately and persists to
  `assets/company_templates.csv` on the server via `POST /api/company-templates`, so it survives
  page reloads and is visible to other users without a redeploy. "Clear" only affects your current
  browser session, not the saved file.

### Company Email Format Library schema (one row per format)

| Column | Required? | Notes |
|---|---|---|
| `Company` | Required | Exact match against the stakeholder's Company field. Distinct entities (e.g. "Acme" vs "Acme EU") need separate rows. A row with `Company = generic` is used whenever no company-specific match is found. |
| `Sub-brand` | Optional | Free text, shown in the picker if a company has multiple rows. |
| `Department` | Optional | e.g. "Analytics" vs "Data Engineering" — shown in the picker when a company has more than one row. |
| `Template` | Required | The fixed email format to follow — subject line, greeting, body structure, sign-off. Use bracketed placeholders (e.g. `[Create a compelling subject line...]`, `[Insert the 3 blurb summaries...]`) for the parts you want the model to fill with generated content; everything else is treated as fixed text to reproduce as closely to word-for-word as possible. Use the literal placeholders `[Your Name]` and `[Your Position]` in the sign-off if you want those filled from the Sender Identity fields (see below) rather than left as-is. |

When a company template is active, its fixed structure takes precedence over the generic
tone/style guidance from the relationship presets (New/Existing × Cold/Warm) — but that preset's
tone (how warm the opening is, how formal the language is) still shapes the *content* generated to
fill the template's placeholders. In other words: the template controls structure, the preset
controls tone within that structure.

---

## Sender Identity

The **Sender Sign-Off** panel (Single/Batch/Follow-Up, all modes) takes an optional "Your Name"
and "Your Position". If provided, every `[Your Name]` / `[Your Position]` placeholder in the
generated output — whether from the generic prompt or a company template — is replaced with those
exact values via a deterministic text substitution after generation (not left up to the model to
get right). If left blank, the model is instructed to leave those placeholders exactly as written
rather than inventing a name or title, so you can fill them in yourself before sending.

---

## AI Providers

Set `AI_PROVIDER` in `.env` (defaults to `gemini` if unset). Only one provider's variables need to
be set, matching your choice — see `.env.example` for the full list of each provider's variables.

- **`gemini`** (default): requires `GEMINI_API_KEY` from
  [Google AI Studio](https://aistudio.google.com/apikey). This is the recommended provider for
  local development and testing.
- **`ollama`**: a local model server for dev/testing without API cost. Optional
  `OLLAMA_BASE_URL` (defaults to `http://localhost:11434`) and `OLLAMA_MODEL` (defaults to
  `gemma3`).
- **`databricks`**: routes generation through a Databricks Foundation Model API serving endpoint
  (e.g. Gemma 3 from the Databricks Playground/Foundation Model API). Requires
  `DATABRICKS_HOST`, `DATABRICKS_TOKEN`, and `DATABRICKS_MODEL_ENDPOINT`. This is the intended
  production path once you've created a serving endpoint in your workspace — see `DEPLOY.md` for
  the full Databricks Apps deployment walkthrough, including how the same `app.yaml` handles both
  the Node build and the Python matching worker's dependencies.

---

## Deployment

See `DEPLOY.md` for the full Databricks Apps deployment guide, including secret scope setup,
`app.yaml`, and the knowledge-base-rebuild-before-deploy workflow described above.
