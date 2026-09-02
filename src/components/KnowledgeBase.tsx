import React from "react";
import { Database, RefreshCw, Eye, AlertTriangle, Loader2 } from "lucide-react";
import { useState } from "react";
import { ProjectRow } from "../types";
import { ConfigModal } from "./PromptConfigPanel";

interface KnowledgeBaseProps {
  projects: ProjectRow[];
  isLoading: boolean;
  loadError: string | null;
  builtAt?: string;
  onReload: () => void;
}

// Read-only status panel: the project knowledge base is no longer uploaded or fetched live by
// testers. It's precomputed offline into a vector DB (see build_knowledge_base.py) and shipped
// with the app — this panel just shows what's currently loaded and lets you re-fetch after a
// redeploy, rather than exposing any upload/ingestion controls.
export default function KnowledgeBase({ projects, isLoading, loadError, builtAt, onReload }: KnowledgeBaseProps) {
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  return (
    <div className="space-y-2 w-full" id="knowledge-base-container">
      <div className="dark-card rounded-xl overflow-hidden border border-slate-300 bg-white shadow-xs">
        <div className="p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-sky-50 rounded-xl text-[#0284c7] border border-sky-100/50 shadow-inner">
              <Database className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-[#0a1128] uppercase tracking-wider flex items-center gap-1.5">
                <span>Knowledge Database</span>
                {isLoading && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-sky-50 text-[#0284c7] border border-sky-200">
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Loading...
                  </span>
                )}
                {!isLoading && projects.length > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 animate-fadeIn">
                    <span className="w-1.5 h-1.5 mr-1 bg-emerald-500 rounded-full animate-pulse"></span>
                    Ingested
                  </span>
                )}
              </h2>
              <p className="text-[10px] text-slate-500">
                {projects.length > 0
                  ? `${projects.length} case studies loaded from the precomputed vector DB${builtAt ? ` (built ${new Date(builtAt).toLocaleDateString()})` : ""}`
                  : "No case studies loaded — run build_knowledge_base.py and redeploy."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            {projects.length > 0 && (
              <button
                onClick={() => setShowPreviewModal(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 text-[10px] font-bold text-[#0284c7] bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition-all btn-animate"
                title="Preview loaded case studies"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Preview</span>
              </button>
            )}
            <button
              onClick={onReload}
              disabled={isLoading}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-[10px] font-bold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-all btn-animate"
              title="Re-fetch after redeploying an updated knowledge base"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              <span>Reload</span>
            </button>
          </div>
        </div>
      </div>

      {loadError && (
        <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-[10px] text-red-800 flex items-start space-x-1.5 leading-normal shadow-xs animate-fadeIn">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span className="flex-1 font-semibold">{loadError}</span>
        </div>
      )}

      {showPreviewModal && (
        <ConfigModal
          icon={<Database className="w-4 h-4 text-[#0284c7]" />}
          title="Knowledge Base Preview (First 5 Rows)"
          maxWidthClass="max-w-3xl"
          maxHeightClass="max-h-[75vh]"
          onClose={() => setShowPreviewModal(false)}
          footer={
            <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50 flex justify-between items-center text-[9px] text-slate-500">
              <span>Showing {Math.min(5, projects.length)} of {projects.length} rows loaded.</span>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="px-3.5 py-1.5 bg-[#0284c7] hover:bg-[#025a87] text-white font-bold rounded-lg shadow-sm transition-all btn-animate"
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
                    <th className="px-3 py-2 w-12">S.No</th>
                    <th className="px-3 py-2">Deliverable Name</th>
                    <th className="px-3 py-2">Business Area</th>
                    <th className="px-3 py-2">Client</th>
                    <th className="px-3 py-2 text-right">Value (Impact)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[10px] text-slate-700">
                  {projects.slice(0, 5).map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/30 transition-colors">
                      <td className="px-3 py-2.5 font-mono text-slate-400">{p.sNo || "-"}</td>
                      <td className="px-3 py-2.5 font-bold text-slate-900">{p.deliverableName}</td>
                      <td className="px-3 py-2.5 text-[#0284c7] font-medium">{p.businessArea}</td>
                      <td className="px-3 py-2.5 text-slate-600">{p.client}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-[#0284c7]">{p.valueImpact}</td>
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
