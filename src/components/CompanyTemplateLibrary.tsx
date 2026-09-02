import React, { useRef, useState } from "react";
import {
  FileSpreadsheet,
  Upload,
  AlertTriangle,
  CheckCircle,
  Trash2,
  Eye,
  Loader2
} from "lucide-react";
import { CompanyTemplateRow } from "../types";
import { normalizeCompanyTemplateRow } from "../utils/companyTemplateMatching";
import { saveCompanyTemplatesCsv } from "../utils/serverData";
import { parseTabularFile } from "../utils/fileParsing";
import { ConfigModal } from "./PromptConfigPanel";

interface CompanyTemplateLibraryProps {
  templates: CompanyTemplateRow[];
  onTemplatesLoaded: (templates: CompanyTemplateRow[]) => void;
  onClear: () => void;
  isAutoLoading?: boolean;
  autoLoadError?: string | null;
}

// Optional feature: if you maintain a library of established, company-specific email formats
// (e.g. distinct formats for "Acme" vs "Acme EU", or per-department styles), load it here as a
// table with Company / Sub-brand / Department / Template columns. When a stakeholder's company
// matches a row, that format is used instead of the generic prompt. A row with Company = "generic"
// is used whenever no company-specific match is found. Uploading a file here both updates the
// current session immediately and persists it server-side (assets/company_templates.csv), so it's
// still there after a page reload or for other users — "Clear" only affects this session.
export default function CompanyTemplateLibrary({ templates, onTemplatesLoaded, onClear, isAutoLoading, autoLoadError }: CompanyTemplateLibraryProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [errorMessages, setErrorMessages] = useState<string[]>([]);
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadFromRows = async (rawJson: Record<string, any>[], csvText: string, sourceLabel: string, idPrefix: string) => {
    if (rawJson.length === 0) {
      setErrorMessages([`"${sourceLabel}" appears to be empty.`]);
      return;
    }
    const parsedRows = rawJson
      .map((row, idx) => normalizeCompanyTemplateRow(row, `${idPrefix}-${idx}`))
      .filter((row): row is CompanyTemplateRow => row !== null);

    if (parsedRows.length === 0) {
      setErrorMessages([`No usable rows found in "${sourceLabel}". Each row needs at least a Company and a Template column.`]);
      return;
    }

    onTemplatesLoaded(parsedRows);
    setSuccessMessage(`Loaded ${parsedRows.length} company email format${parsedRows.length === 1 ? "" : "s"} from "${sourceLabel}".`);

    setIsSaving(true);
    try {
      await saveCompanyTemplatesCsv(csvText);
    } catch (err: any) {
      setErrorMessages(prev => [...prev, `Loaded for this session, but failed to save for future sessions: ${err.message || err}`]);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileProcess = async (file: File) => {
    setErrorMessages([]);
    setSuccessMessage("");
    try {
      const { rows, csvText } = await parseTabularFile(file);
      await loadFromRows(rows, csvText, file.name, file.name);
    } catch (err: any) {
      setErrorMessages([`Failed to parse "${file.name}": ${err.message || err}`]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileProcess(e.target.files[0]);
    }
    // Reset so selecting the same filename again still fires onChange
    e.target.value = "";
  };

  const handleClear = () => {
    onClear();
    setSuccessMessage("");
    setErrorMessages([]);
  };

  return (
    <div className="space-y-2 w-full" id="company-template-library-container">
      <div className="dark-card rounded-xl overflow-hidden border border-slate-300 bg-white shadow-xs">
        <div className="p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-violet-50 rounded-xl text-violet-600 border border-violet-100/50 shadow-inner">
              <FileSpreadsheet className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-[#0a1128] uppercase tracking-wider flex items-center gap-1.5">
                <span>Company Email Format Library</span>
                {isAutoLoading && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-violet-50 text-violet-700 border border-violet-200">
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Loading...
                  </span>
                )}
                {!isAutoLoading && templates.length > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 animate-fadeIn">
                    <span className="w-1.5 h-1.5 mr-1 bg-emerald-500 rounded-full animate-pulse"></span>
                    Active
                  </span>
                )}
              </h2>
              <p className="text-[10px] text-slate-500">
                {templates.length > 0
                  ? `${templates.length} company-specific format${templates.length === 1 ? "" : "s"} loaded — optional, matched companies fall back to generic otherwise`
                  : "Optional: Company / Sub-brand / Department / Template columns"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            {templates.length > 0 && (
              <>
                <button
                  onClick={() => setShowPreviewModal(true)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 text-[10px] font-bold text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 transition-all btn-animate"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Preview</span>
                </button>
                <button
                  onClick={handleClear}
                  className="flex items-center space-x-1.5 px-3 py-1.5 text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100/50 transition-all btn-animate"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSaving}
              className="flex items-center space-x-1.5 px-3.5 py-2 text-[10px] font-bold text-violet-700 bg-white border border-violet-300 rounded-lg hover:bg-violet-50 disabled:opacity-50 transition-all btn-animate"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              <span>{templates.length > 0 ? "Replace with New File" : "Upload CSV / Excel"}</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".xlsx,.xls,.csv"
              className="hidden"
            />
          </div>
        </div>
      </div>

      {autoLoadError && (
        <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[10px] text-amber-800 flex items-start space-x-1.5 leading-normal shadow-xs animate-fadeIn">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span className="flex-1 font-semibold">Failed to load company templates: {autoLoadError}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-[10px] text-emerald-800 flex items-center space-x-1.5 shadow-xs animate-fadeIn">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold">{successMessage}</span>
        </div>
      )}

      {errorMessages.map((msg, i) => (
        <div key={i} className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-[10px] text-red-800 flex items-start space-x-1.5 leading-normal shadow-xs animate-fadeIn">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span className="flex-1 font-semibold">{msg}</span>
        </div>
      ))}

      {showPreviewModal && (
        <ConfigModal
          icon={<FileSpreadsheet className="w-4 h-4 text-violet-600" />}
          title="Company Format Library Preview"
          maxWidthClass="max-w-3xl"
          maxHeightClass="max-h-[75vh]"
          onClose={() => setShowPreviewModal(false)}
          footer={
            <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50 flex justify-between items-center text-[9px] text-slate-500">
              <span>{templates.length} format{templates.length === 1 ? "" : "s"} loaded.</span>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="px-3.5 py-1.5 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-lg shadow-sm transition-all btn-animate"
              >
                Close Preview
              </button>
            </div>
          }
        >
          <div className="p-4 overflow-y-auto bg-slate-50/50">
            <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-[9px] font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200">
                    <th className="px-3 py-2">Company</th>
                    <th className="px-3 py-2">Sub-brand</th>
                    <th className="px-3 py-2">Department</th>
                    <th className="px-3 py-2">Template Preview</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[10px] text-slate-700">
                  {templates.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/30 transition-colors">
                      <td className="px-3 py-2.5 font-bold text-slate-900">{t.company}</td>
                      <td className="px-3 py-2.5 text-slate-600">{t.subBrand || "-"}</td>
                      <td className="px-3 py-2.5 text-violet-700 font-medium">{t.department || "-"}</td>
                      <td className="px-3 py-2.5 text-slate-500 max-w-xs truncate" title={t.template}>{t.template}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </ConfigModal>
      )}
    </div>
  );
}
