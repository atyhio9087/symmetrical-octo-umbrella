import { ProjectRow } from "../types";
import { normalizeProjectRow } from "./projectNormalizer";
import { parseCSV } from "./csvParser";

/**
 * Fetches the precomputed project knowledge base from the server (read-only — see
 * build_knowledge_base.py). Server rows are already in normalized field-name shape; running them
 * back through normalizeProjectRow (whose fuzzy header matching tolerates either raw spreadsheet
 * headers or already-camelCased field names) fills in the `searchBase`/`raw` fields the JS
 * fallback matcher and UI expect, without needing the Python side to duplicate that logic.
 */
export async function fetchKnowledgeBase(): Promise<{ projects: ProjectRow[]; builtAt?: string }> {
  const response = await fetch("/api/knowledge-base");
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Failed to load the knowledge base.");
  }
  const rows: Record<string, any>[] = data.projects || [];
  const projects = rows.map((row, idx) => normalizeProjectRow(row, row.id || `kb-${idx}`));
  return { projects, builtAt: data.builtAt };
}

/** Fetches the company email-format library (as CSV rows) currently stored on the server. */
export async function fetchCompanyTemplatesRows(): Promise<Record<string, any>[]> {
  const response = await fetch("/api/company-templates");
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Failed to load the company template library.");
  }
  return data.csv ? parseCSV(data.csv) : [];
}

/**
 * Persists a new company template library to the server (overwrites assets/company_templates.csv)
 * so it survives page reloads and is visible to other sessions — used by the "Replace" upload
 * flow, not by "Clear" (which only affects the current browser session).
 */
export async function saveCompanyTemplatesCsv(csv: string): Promise<void> {
  const response = await fetch("/api/company-templates", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: csv,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Failed to save the company template library.");
  }
}
