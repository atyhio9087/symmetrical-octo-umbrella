import React from "react";
import { Building2, CheckCircle, Info } from "lucide-react";
import { CompanyTemplateRow } from "../types";

interface CompanyTemplateSelectorProps {
  matches: CompanyTemplateRow[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  genericTemplate?: CompanyTemplateRow;
}

// Renders a confirmation banner when there's exactly one company-specific match (auto-applied),
// a picker when a company has multiple template rows (e.g. distinct Analytics vs Data Engineering
// formats) so the user resolves the ambiguity explicitly, a muted note when falling back to the
// library's "generic" row, or nothing at all when neither applies.
export default function CompanyTemplateSelector({ matches, selectedId, onSelect, genericTemplate }: CompanyTemplateSelectorProps) {
  if (matches.length === 0) {
    if (!genericTemplate) return null;
    return (
      <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] text-slate-600 flex items-center space-x-1.5">
        <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span>No specific format on file for this company — using the generic format.</span>
      </div>
    );
  }

  if (matches.length === 1) {
    const match = matches[0];
    return (
      <div className="p-2 bg-violet-50 border border-violet-200 rounded-lg text-[10px] text-violet-800 flex items-center space-x-1.5">
        <CheckCircle className="w-3.5 h-3.5 text-violet-600 shrink-0" />
        <span>
          Using {match.company}'s established email format{match.department ? ` (${match.department})` : ""}.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1">
        <Building2 className="w-3 h-3 text-violet-600" />
        <span>Which {matches[0].company} format applies?</span>
      </label>
      <select
        value={selectedId || ""}
        onChange={(e) => onSelect(e.target.value || null)}
        className="w-full px-3 py-1.5 text-xs text-slate-800 bg-white border border-violet-300 rounded-lg focus:ring-2 focus:ring-violet-400 focus:outline-none"
      >
        <option value="">Use generic format instead</option>
        {matches.map((m) => (
          <option key={m.id} value={m.id}>
            {m.department || m.subBrand || `Format ${m.id}`}
          </option>
        ))}
      </select>
    </div>
  );
}
