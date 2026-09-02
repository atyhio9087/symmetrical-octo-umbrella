import * as XLSX from "xlsx";
import { parseCSV } from "./csvParser";

export interface ParsedTabularFile {
  rows: Record<string, any>[];
  csvText: string;
}

/**
 * Reads a .csv or .xlsx/.xls File into rows (via the shared RFC-4180 CSV parser or SheetJS) plus
 * the equivalent raw CSV text. Used by every manual file-upload flow in the app (batch stakeholder
 * uploads, the company template library) so the CSV-vs-Excel branching isn't reimplemented per
 * component.
 */
export function parseTabularFile(file: File): Promise<ParsedTabularFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Failed to read the file."));

    if (file.name.toLowerCase().endsWith(".csv")) {
      reader.onload = (e) => {
        try {
          const csvText = e.target?.result as string;
          resolve({ rows: parseCSV(csvText), csvText });
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsText(file);
    } else {
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          if (workbook.SheetNames.length === 0) {
            reject(new Error("The uploaded spreadsheet contains no worksheets."));
            return;
          }
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          resolve({ rows: XLSX.utils.sheet_to_json(worksheet), csvText: XLSX.utils.sheet_to_csv(worksheet) });
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsArrayBuffer(file);
    }
  });
}
