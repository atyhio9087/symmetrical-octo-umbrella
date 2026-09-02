import { useEffect, useState } from "react";
import { CompanyTemplateRow } from "../types";
import { makeFuzzyRowLookup } from "./fuzzyHeaderLookup";

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Finds every template row whose Company column matches the stakeholder's company exactly
 * (case/punctuation/spacing-insensitive). Distinct entities like "Uber" and "Uber DE" must be
 * separate rows in the sheet — this does not attempt fuzzy inference across name variants, since
 * silently guessing which company someone meant is worse than asking or falling back to generic.
 *
 * Returns 0 rows (no company-specific template — caller should fall back to findGenericTemplate),
 * 1 row (unambiguous — auto-apply), or 2+ rows (same company, different departments — caller
 * should ask the user which one applies).
 */
export function matchCompanyTemplates(templates: CompanyTemplateRow[], company: string): CompanyTemplateRow[] {
  const trimmedCompany = company.trim();
  if (!trimmedCompany || templates.length === 0) return [];
  const target = normalize(trimmedCompany);
  return templates.filter(t => normalize(t.company) === target);
}

/**
 * Finds the row whose Company column is literally "generic" (case-insensitive) — the format to
 * use when a stakeholder's company doesn't match any specific row. Optional: if the library
 * doesn't have a generic row, callers fall back to the app's built-in generic behavior instead.
 */
export function findGenericTemplate(templates: CompanyTemplateRow[]): CompanyTemplateRow | undefined {
  return templates.find(t => normalize(t.company) === "generic");
}

/**
 * Normalizes one raw row (from CSV, Excel, or a Google Sheet) into a CompanyTemplateRow, matching
 * column headers fuzzily/case-insensitively. Shared by the manual CSV/Excel upload path and the
 * admin-configured Google Sheet auto-load path. Returns null for rows missing a Company or
 * Template value, since both are required for a row to be usable.
 */
export function normalizeCompanyTemplateRow(rawRow: Record<string, any>, id: string): CompanyTemplateRow | null {
  const findValue = makeFuzzyRowLookup(rawRow);

  const company = String(findValue(["company"]) || "").trim();
  const template = String(findValue(["template", "format", "emailformat", "emailtemplate"]) || "").trim();
  if (!company || !template) return null;

  return {
    id,
    company,
    subBrand: String(findValue(["subbrand", "entity", "brand"]) || "").trim(),
    department: String(findValue(["department", "team", "practice", "group"]) || "").trim(),
    template,
    raw: rawRow
  };
}

/**
 * Resolves which company template (if any) applies for a single, non-interactive row — batch
 * pipelines (BatchWorkflow, FollowUpWorkflow's batch mode) have no per-row UI to disambiguate
 * multiple department-specific formats for the same company, so an ambiguous match (2+ rows) falls
 * back to the library's "generic" row rather than guessing which one applies. Shared so both batch
 * pipelines resolve a row's template identically.
 */
export function resolveBatchCompanyTemplate(templates: CompanyTemplateRow[], company: string): string | undefined {
  const matches = matchCompanyTemplates(templates, company || "");
  if (matches.length === 1) return matches[0].template;
  if (matches.length === 0) return findGenericTemplate(templates)?.template;
  return undefined;
}

/**
 * Live-resolves which company template applies as `company` changes, for the interactive
 * single-stakeholder forms (SingleStakeholderWorkflow, FollowUpWorkflow's single mode) — these do
 * have UI to let the user pick between multiple department-specific matches for the same company,
 * so unlike resolveBatchCompanyTemplate this exposes the raw match list plus a selection setter.
 */
export function useResolvedCompanyTemplate(templates: CompanyTemplateRow[], company: string) {
  const [matches, setMatches] = useState<CompanyTemplateRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setMatches(matchCompanyTemplates(templates, company));
    setSelectedId(null);
  }, [company, templates]);

  const genericTemplate = findGenericTemplate(templates);
  const activeTemplate =
    matches.length === 1
      ? matches[0].template
      : matches.length > 1
        ? matches.find(m => m.id === selectedId)?.template
        : genericTemplate?.template;

  return { matches, selectedId, setSelectedId, genericTemplate, activeTemplate };
}
