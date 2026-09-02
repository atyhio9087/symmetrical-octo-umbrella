import { CompanyTemplateRow } from "../types";

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
  const findValue = (keys: string[]) => {
    const rawKeys = Object.keys(rawRow);
    const matchedKey = rawKeys.find(rk => {
      const normalizedRk = rk.toLowerCase().replace(/[^a-z0-9]/g, "");
      return keys.some(k => normalizedRk.includes(k.toLowerCase().replace(/[^a-z0-9]/g, "")));
    });
    return matchedKey ? rawRow[matchedKey] : undefined;
  };

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
