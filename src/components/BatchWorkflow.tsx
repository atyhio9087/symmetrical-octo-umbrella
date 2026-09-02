import React, { useState } from "react";
import * as XLSX from "xlsx";
import { 
  Upload, 
  Layers, 
  Trash2, 
  CheckCircle, 
  AlertTriangle,
  Play,
  RotateCcw,
  Sparkles,
  Download,
  Eye,
  X,
  Database,
  RefreshCw
} from "lucide-react";
import { ProjectRow, CompanyTemplateRow, OutreachStakeholderPayload } from "../types";
import { matchProjects, matchProjectsAsync } from "../utils/matchingEngine";
import { resolveBatchCompanyTemplate } from "../utils/companyTemplateMatching";
import { parseTabularFile } from "../utils/fileParsing";
import { useFileDropzone } from "../utils/useFileDropzone";

interface BatchWorkflowProps {
  projects: ProjectRow[];
  companyTemplates: CompanyTemplateRow[];
  systemInstructions: string;
  fewShotExamples: string[];
  senderName?: string;
  senderPosition?: string;
  onGenerateSingleRow: (
    stakeholder: OutreachStakeholderPayload,
    matchedProjects: ProjectRow[]
  ) => Promise<{ text: string; linkedinText: string }>;
  researchMode: "manual" | "linkedin";
}

interface BatchRecord {
  id: number;
  name: string;
  designation: string;
  areaOfFocus: string;
  company?: string;
  linkedinUrl?: string;

  // Status and Output
  status: "idle" | "matching" | "generating" | "complete" | "failed";
  matchedCaseStudies: ProjectRow[];
  generatedBlurb: string;
  generatedLinkedin: string;
  errorMessage?: string;
}

export default function BatchWorkflow({
  projects,
  companyTemplates,
  senderName,
  senderPosition,
  onGenerateSingleRow,
  researchMode
}: BatchWorkflowProps) {
  const [records, setRecords] = useState<BatchRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Execution state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);

  // Selected row preview slideover/modal
  const [activeRow, setActiveRow] = useState<BatchRecord | null>(null);

  const { fileInputRef, dragActive, handleDrag, handleDrop, handleFileChange } = useFileDropzone((file) => parseBatchFile(file));

  const parseBatchFile = async (file: File) => {
    setError(null);
    setSuccess(null);

    const processData = (jsonData: any[]) => {
      if (jsonData.length === 0) {
        setError("The uploaded file appears to have no records.");
        return;
      }

      // Helper to match column headers case insensitively
      const findHeaderValue = (row: any, keys: string[]) => {
        const rowKeys = Object.keys(row);
        const match = rowKeys.find(rk => {
          const norm = rk.toLowerCase().replace(/[^a-z0-9]/g, "");
          return keys.some(k => norm.includes(k.toLowerCase().replace(/[^a-z0-9]/g, "")));
        });
        return match ? row[match] : undefined;
      };

      try {
        const parsed: BatchRecord[] = jsonData.map((row, idx) => {
          if (researchMode === "linkedin") {
            const linkedinUrl = String(findHeaderValue(row, ["linkedin url", "linkedin", "profile url"]) || "");
            if (!linkedinUrl) {
              throw new Error(`Row ${idx + 2}: Missing required LinkedIn URL column.`);
            }
            return {
              id: idx + 1,
              name: String(findHeaderValue(row, ["name", "stakeholder name"]) || `Lead #${idx + 1}`),
              designation: "Resolving...",
              areaOfFocus: "Resolving...",
              linkedinUrl,
              status: "idle",
              matchedCaseStudies: [],
              generatedBlurb: "",
              generatedLinkedin: ""
            };
          } else {
            const designation = String(findHeaderValue(row, ["designation", "official designation", "title"]) || "");
            const areaOfFocus = String(findHeaderValue(row, ["area of focus", "keywords", "strategic keywords"]) || "");

            if (!designation || !areaOfFocus) {
              throw new Error(`Row ${idx + 2}: Missing required 'Designation' or 'Area of Focus' columns.`);
            }

            return {
              id: idx + 1,
              name: String(findHeaderValue(row, ["name", "stakeholder name"]) || `Lead #${idx + 1}`),
              company: String(findHeaderValue(row, ["company", "organization"]) || ""),
              designation,
              areaOfFocus,
              status: "idle",
              matchedCaseStudies: [],
              generatedBlurb: "",
              generatedLinkedin: ""
            };
          }
        });

        setRecords(parsed);
        setSuccess(`Loaded ${parsed.length} records successfully. Ready for processing.`);
      } catch (err: any) {
        setError(err.message || "Failed to process file layout.");
      }
    };

    try {
      const { rows } = await parseTabularFile(file);
      processData(rows);
    } catch (err: any) {
      setError(err.message || "Failed to read the file.");
    }
  };

  const handleProcessBatch = async () => {
    if (projects.length === 0) {
      setError("Please load the Knowledge base before executing the batch pipeline.");
      return;
    }
    setIsProcessing(true);
    setProcessedCount(0);

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      
      // Update status to matching
      setRecords(prev => prev.map(r => r.id === record.id ? { ...r, status: "matching" } : r));

      try {
        let finalDesignation = record.designation;
        let finalAreaOfFocus = record.areaOfFocus;
        let finalCompany = record.company;
        let companyIntel = "";

        // If LinkedIn Search Agent is selected, trigger research simulation
        if (researchMode === "linkedin" && record.linkedinUrl) {
          // Update status
          setRecords(prev => prev.map(r => r.id === record.id ? { ...r, status: "generating" } : r));

          const response = await fetch("/api/search-linkedin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ linkedinUrl: record.linkedinUrl })
          });

          if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || "LinkedIn research agent failed to gather intelligence.");
          }

          const resolved = await response.json();
          finalDesignation = resolved.designation || "Executive Representative";
          finalAreaOfFocus = resolved.areaOfFocus || "General Business Performance";
          finalCompany = resolved.company || "Target Entity";
          companyIntel = resolved.companyIntelligence || "";

          // Save resolved info on the row
          setRecords(prev => prev.map(r => r.id === record.id ? { 
            ...r, 
            designation: finalDesignation,
            areaOfFocus: finalAreaOfFocus,
            company: finalCompany
          } : r));
        }

        // Run similarity match locally
        const topMatches = await matchProjectsAsync(projects, finalDesignation, finalAreaOfFocus, finalCompany, companyIntel, 5);

        // Update status to generating
        setRecords(prev => prev.map(r => r.id === record.id ? { ...r, status: "generating", matchedCaseStudies: topMatches } : r));

        // Resolve a company-specific email format if there's exactly one unambiguous match — see
        // resolveBatchCompanyTemplate() for the disambiguation/fallback rule.
        const companyTemplate = resolveBatchCompanyTemplate(companyTemplates, finalCompany || "");

        // Call LLM synthesis proxy
        const result = await onGenerateSingleRow({
          name: record.name,
          designation: finalDesignation,
          areaOfFocus: finalAreaOfFocus,
          company: finalCompany,
          companyIntelligence: companyIntel,
          linkedinUrl: record.linkedinUrl,
          companyTemplate,
          senderName,
          senderPosition
        }, topMatches);

        // Update status to complete
        setRecords(prev => prev.map(r => r.id === record.id ? { ...r, status: "complete", generatedBlurb: result.text, generatedLinkedin: result.linkedinText } : r));
      } catch (err: any) {
        setRecords(prev => prev.map(r => r.id === record.id ? { 
          ...r, 
          status: "failed", 
          errorMessage: err.message || "Failed to process record." 
        } : r));
      }

      setProcessedCount(val => val + 1);
    }

    setIsProcessing(false);
  };

  const handleDownloadResults = () => {
    // Generate XLSX with generated emails
    const exportData = records.map(r => {
      if (researchMode === "linkedin") {
        return {
          "LinkedIn URL": r.linkedinUrl,
          "Stakeholder Name": r.name,
          "Resolved Company": r.company || "",
          "Resolved Title": r.designation,
          "Resolved Focus": r.areaOfFocus,
          "Matched Case Studies": r.matchedCaseStudies.map(cs => cs.deliverableName).join("; "),
          "Outreach Blurb": r.generatedBlurb,
          "LinkedIn DM Version": r.generatedLinkedin,
          "Status": r.status,
          "Errors": r.errorMessage || ""
        };
      } else {
        return {
          "Stakeholder Name": r.name,
          "Company": r.company || "",
          "Designation": r.designation,
          "Area of Focus": r.areaOfFocus,
          "Matched Case Studies": r.matchedCaseStudies.map(cs => cs.deliverableName).join("; "),
          "Outreach Blurb": r.generatedBlurb,
          "LinkedIn DM Version": r.generatedLinkedin,
          "Status": r.status,
          "Errors": r.errorMessage || ""
        };
      }
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "OutreachIQ Batch");
    XLSX.writeFile(workbook, `outreach_iq_batch_results_${Date.now()}.xlsx`);
  };

  const handleClear = () => {
    setRecords([]);
    setSuccess(null);
    setError(null);
    setProcessedCount(0);
  };

  return (
    <div className="space-y-6" id="batch-workflow-container">
      {projects.length === 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start space-x-2.5">
          <Database className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong>Knowledge Repository Empty:</strong> Please load or upload a project database first using the 
            <strong> Knowledge Database Control</strong> panel above before running the batch queue.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: UPLOAD CONTROLLER */}
        <div className="lg:col-span-4 space-y-5">
          <div className="dark-card rounded-xl p-5 space-y-4 flex flex-col border border-slate-300">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-xs font-bold text-[#0a1128] uppercase tracking-wide">Batch Ingestion Control</h3>
                <p className="text-[10px] text-slate-500">Upload multiple stakeholder profiles</p>
              </div>
              <div className="flex gap-2">
                {records.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="text-[10px] font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-300 px-2.5 py-1 rounded-lg transition-all btn-animate"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border border-dashed rounded-lg p-7 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                dragActive 
                  ? "border-[#0284c7] bg-sky-50" 
                  : "border-slate-300 bg-slate-50/50 hover:border-sky-400 hover:bg-slate-50"
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".xlsx,.xls,.csv"
                className="hidden"
              />
              <Upload className="w-4 h-4 text-[#0284c7] mb-1.5" />
              <p className="text-xs font-bold text-slate-700">Upload Stakeholder File</p>
              <p className="text-[9px] text-slate-400 mt-0.5">Drag/Drop CSV or Excel files</p>
            </div>

            {/* Expected layout rules */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
              <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wide block">Required Format Columns:</span>
              <p className="text-[9px] text-slate-500 leading-normal">
                {researchMode === "linkedin" 
                  ? "✓ LinkedIn URL (or LinkedIn, Profile URL), Name"
                  : "✓ Designation, Area of Focus, Name, Company"
                }
              </p>
            </div>

            {/* Batch execution controls */}
            {records.length > 0 && (
              <div className="pt-2 border-t border-slate-200 space-y-2">
                <button
                  onClick={handleProcessBatch}
                  disabled={projects.length === 0 || isProcessing}
                  className="w-full py-2 bg-[#0284c7] hover:bg-[#025a87] disabled:bg-slate-300 disabled:text-slate-500 text-white text-xs font-bold rounded-lg shadow-sm flex items-center justify-center space-x-2 transition-all btn-animate"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Running Pipeline ({processedCount}/{records.length})...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      <span>Run Batch Pipeline</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Feedback details */}
          {success && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start space-x-2 leading-relaxed">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start space-x-2 leading-relaxed">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: QUEUE VIEW */}
        <div className="lg:col-span-8 flex flex-col">
          <div className="dark-card rounded-xl border border-slate-300 flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-[#0a1128] uppercase tracking-wide">Processing Queue</h3>
                <p className="text-[10px] text-slate-500">Live monitoring room for generated records</p>
              </div>

              {records.some(r => r.status === "complete") && (
                <button
                  onClick={handleDownloadResults}
                  className="flex items-center space-x-1.5 px-3 py-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-all btn-animate"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download XLSX</span>
                </button>
              )}
            </div>

            <div className="flex-1 overflow-x-auto min-h-[300px]">
              {records.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center text-slate-400">
                  <Layers className="w-8 h-8 mb-2 text-slate-300" />
                  <p className="text-xs">No records loaded yet.</p>
                  <p className="text-[10px] mt-0.5 text-slate-500">Upload a spreadsheet or CSV to fill the batch queue.</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-[9px] font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200">
                      <th className="px-4 py-2.5 w-10 text-center">ID</th>
                      <th className="px-4 py-2.5">Stakeholder Details</th>
                      {researchMode === "linkedin" && <th className="px-4 py-2.5">LinkedIn Profile</th>}
                      <th className="px-4 py-2.5">Matched Case Studies</th>
                      <th className="px-4 py-2.5 text-center">Status</th>
                      <th className="px-4 py-2.5 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs text-slate-700 bg-white">
                    {records.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 text-center font-mono text-slate-400">{r.id}</td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-900">{r.name}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {r.designation !== "Resolving..." ? r.designation : ""} {r.company ? `@ ${r.company}` : ""}
                          </div>
                        </td>
                        {researchMode === "linkedin" && (
                          <td className="px-4 py-3">
                            <span className="font-mono text-[10px] text-[#0284c7] line-clamp-1 max-w-[150px]" title={r.linkedinUrl}>
                              {r.linkedinUrl}
                            </span>
                          </td>
                        )}
                        <td className="px-4 py-3">
                          {r.matchedCaseStudies.length > 0 ? (
                            <div className="space-y-1">
                              {r.matchedCaseStudies.map(cs => (
                                <span 
                                  key={cs.id} 
                                  className="inline-block bg-slate-100 border border-slate-200 text-slate-700 text-[9px] font-bold px-1.5 py-0.5 rounded mr-1"
                                >
                                  {cs.deliverableName}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400">Not matched yet</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-block px-2 py-0.5 text-[9px] font-extrabold uppercase rounded-full tracking-wide ${
                            r.status === "complete" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" :
                            r.status === "failed" ? "bg-red-50 text-red-800 border border-red-200" :
                            r.status === "generating" ? "bg-sky-50 text-[#0284c7] border border-sky-200 animate-pulse" :
                            r.status === "matching" ? "bg-indigo-50 text-indigo-800 border border-indigo-200 animate-pulse" :
                            "bg-slate-100 text-slate-500 border border-slate-200"
                          }`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => setActiveRow(r)}
                            disabled={!r.generatedBlurb && r.status !== "failed"}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 bg-[#0284c7] hover:bg-[#025a87] disabled:bg-slate-100 disabled:text-slate-300 text-white text-[10px] font-bold rounded-md shadow-sm transition-all btn-animate"
                            title="Inspect resolved profile & output blurb"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Inspect</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Row inspector slide-over (Styled in Light Theme) */}
      {activeRow && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end animate-fadeIn">
          <div 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity" 
            onClick={() => setActiveRow(null)}
          />
          <div className="bg-white border-l border-slate-300 w-full max-w-xl h-full shadow-2xl relative z-10 flex flex-col animate-slideLeft">
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Layers className="w-4.5 h-4.5 text-[#0284c7]" />
                <h4 className="text-xs font-bold text-[#0a1128] uppercase tracking-wider">Inspect Pipeline Result (#{activeRow.id})</h4>
              </div>
              <button 
                onClick={() => setActiveRow(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 btn-animate"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <div className="p-5 flex-1 overflow-y-auto space-y-5">
              {/* Profile card details */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="border-b border-slate-200 pb-2">
                  <div className="text-xs font-bold text-[#0a1128]">{activeRow.name}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{activeRow.designation} {activeRow.company ? `@ ${activeRow.company}` : ""}</div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-[11px]">
                  <div>
                    <span className="font-bold text-slate-400 uppercase tracking-wide text-[9px] block">Strategic Focus</span>
                    <span className="text-slate-700">{activeRow.areaOfFocus}</span>
                  </div>
                  {activeRow.linkedinUrl && (
                    <div>
                      <span className="font-bold text-slate-400 uppercase tracking-wide text-[9px] block">LinkedIn URL</span>
                      <span className="font-mono text-xs text-[#0284c7] break-all">{activeRow.linkedinUrl}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Matched Case studies list */}
              {activeRow.matchedCaseStudies.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Context-Matched Case Studies</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {activeRow.matchedCaseStudies.map(cs => (
                      <div key={cs.id} className="bg-white border border-slate-200 rounded-lg p-3 shadow-xs">
                        <div className="text-xs font-bold text-slate-900">{cs.deliverableName}</div>
                        <div className="text-[10px] text-[#0284c7] font-semibold mt-0.5">{cs.businessArea} | {cs.projectType}</div>
                        <div className="text-[10px] text-slate-500 mt-1.5 line-clamp-3">{cs.problemStatement}</div>
                        <div className="mt-2 text-right">
                          <span className="bg-sky-50 text-[#0284c7] border border-sky-100 text-[10px] font-bold font-mono px-2 py-0.5 rounded">
                            {cs.valueImpact}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Generated Blurb Output */}
              <div className="space-y-2">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Synthesized Blurb</span>
                {activeRow.generatedBlurb ? (
                  <div className="p-4 bg-slate-50 border border-slate-200 text-xs text-slate-800 font-sans rounded-xl whitespace-pre-wrap leading-relaxed">
                    {activeRow.generatedBlurb}
                  </div>
                ) : (
                  <div className="p-4 bg-red-50 border border-red-200 text-xs text-red-800 rounded-xl leading-relaxed">
                    <strong>Error processing record:</strong> {activeRow.errorMessage || "Unknown pipeline crash."}
                  </div>
                )}
              </div>

              {/* Generated LinkedIn DM Output */}
              {activeRow.generatedLinkedin && (
                <div className="space-y-2">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <span>LinkedIn DM Version</span>
                    <span className={`px-1.5 py-0.5 rounded-full ${activeRow.generatedLinkedin.length > 1000 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {activeRow.generatedLinkedin.length}/1000
                    </span>
                  </span>
                  <div className="p-4 bg-sky-50/40 border border-sky-200 text-xs text-slate-800 font-sans rounded-xl whitespace-pre-wrap leading-relaxed">
                    {activeRow.generatedLinkedin}
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex justify-between items-center text-[10px]">
              <div className="flex gap-2">
                {activeRow.generatedBlurb && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(activeRow.generatedBlurb);
                      alert("Outreach blurb copied to clipboard!");
                    }}
                    className="px-4 py-1.5 bg-[#0284c7] hover:bg-[#025a87] text-white font-bold rounded-lg shadow-sm transition-all btn-animate flex items-center space-x-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Copy Blurb</span>
                  </button>
                )}
                {activeRow.generatedLinkedin && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(activeRow.generatedLinkedin);
                      alert("LinkedIn DM copied to clipboard!");
                    }}
                    className="px-4 py-1.5 bg-white border border-[#0284c7] text-[#0284c7] font-bold rounded-lg shadow-sm transition-all btn-animate flex items-center space-x-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Copy LinkedIn</span>
                  </button>
                )}
              </div>
              <button
                onClick={() => setActiveRow(null)}
                className="px-4 py-1.5 bg-white border border-slate-300 text-slate-600 font-bold rounded-lg hover:bg-slate-50 transition-all btn-animate"
              >
                Close Slide-over
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
