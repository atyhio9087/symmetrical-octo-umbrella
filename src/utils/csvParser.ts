/**
 * RFC-4180-style CSV parser: scans the whole text in a single pass and tracks quote state across
 * the entire document, so a quoted cell containing a real line break (very normal for a
 * multi-paragraph "Template" or "Problem Statement" field) is treated as one cell — not split into
 * a fake extra row that shifts every column after it. Also handles escaped quotes ("" inside a
 * quoted field means a literal ") and \r\n / \r line endings.
 *
 * Shared by the project knowledge base, the company email-template library, and Google Sheet
 * ingestion — all three read the same shape of tabular data.
 */
export function parseCSV(csvText: string): Record<string, any>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];

    if (inQuotes) {
      if (char === '"') {
        if (csvText[i + 1] === '"') {
          field += '"';
          i++; // consume the escaped quote's second character
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\r") {
      // Skip bare CR — the following \n (if any) closes the row instead, so \r\n doesn't
      // produce a phantom blank row.
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  // Flush a final row that wasn't newline-terminated
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmptyRows = rows.filter(r => r.some(cell => cell.trim().length > 0));
  if (nonEmptyRows.length === 0) return [];

  const headers = nonEmptyRows[0].map(h => h.trim());
  const data: Record<string, any>[] = [];
  for (let i = 1; i < nonEmptyRows.length; i++) {
    const cells = nonEmptyRows[i];
    const record: Record<string, any> = {};
    headers.forEach((header, index) => {
      record[header] = (cells[index] || "").trim();
    });
    data.push(record);
  }
  return data;
}
