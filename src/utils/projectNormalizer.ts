import { ProjectRow } from "../types";

/**
 * Normalizes one raw row (from CSV, Excel, or a Google Sheet) into a ProjectRow, matching column
 * headers fuzzily/case-insensitively. Shared by the manual CSV/Excel upload path and the
 * admin-configured Google Sheet auto-load path, so both produce identical results.
 */
export function normalizeProjectRow(rawRow: Record<string, any>, id: string): ProjectRow {
  const findValue = (keys: string[]) => {
    const rawKeys = Object.keys(rawRow);
    const matchedKey = rawKeys.find(rk => {
      const normalizedRk = rk.toLowerCase().replace(/[^a-z0-9]/g, "");
      return keys.some(k => normalizedRk.includes(k.toLowerCase().replace(/[^a-z0-9]/g, "")));
    });
    return matchedKey ? rawRow[matchedKey] : undefined;
  };

  const sNo = String(findValue(["sno", "s.no", "serial"]) || "");
  const insightPeriod = String(findValue(["insight period", "period"]) || "");
  const client = String(findValue(["client", "company"]) || "");
  const projectType = String(findValue(["project type", "type"]) || "");
  const businessArea = String(findValue(["business area", "area"]) || "");
  const technologyUsed = String(findValue(["technology used", "tech", "technology"]) || "");
  const deliverableName = String(findValue(["deliverable name", "deliverable", "project name"]) || "Unnamed Project");
  const problemStatement = String(findValue(["problem statement", "business problem", "problem"]) || "");
  const objective = String(findValue(["objective", "goal"]) || "");
  const approach = String(findValue(["approach", "methodology", "solution"]) || "");
  const impactCreated = String(findValue(["impact created", "impact details"]) || "N/A");
  const impactType = String(findValue(["impact type"]) || "Operational");
  const valueImpact = String(findValue(["value impact", "value", "impact value"]) || "");

  const annualized = findValue(["annualized client impact value", "annualized impact"]);
  const realized = findValue(["realized client impact value", "realized impact"]);

  const searchBase = [
    deliverableName,
    projectType,
    businessArea,
    technologyUsed,
    problemStatement,
    objective,
    approach,
    impactCreated,
    impactType,
    valueImpact
  ].filter(Boolean).join(" ").toLowerCase();

  return {
    id,
    sNo,
    insightPeriod,
    client,
    projectType,
    businessArea,
    technologyUsed,
    deliverableName,
    problemStatement,
    objective,
    approach,
    impactCreated,
    impactType,
    valueImpact: valueImpact || (annualized ? `$${annualized}M` : String(realized || "")),
    annualizedImpactMillions: annualized !== undefined ? parseFloat(String(annualized)) : undefined,
    realizedImpactValue: realized !== undefined ? String(realized) : undefined,
    searchBase,
    raw: rawRow
  };
}
