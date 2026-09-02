import React, { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { 
  User, 
  Briefcase, 
  Compass, 
  Send, 
  Sparkles, 
  Copy, 
  Check, 
  RefreshCw, 
  History, 
  Database,
  Link2,
  Globe,
  Building,
  CheckCircle,
  Upload,
  Layers,
  Trash2,
  Download,
  Eye,
  X,
  Sliders,
  HelpCircle,
  FileText,
  Play
} from "lucide-react";
import { ProjectRow, PromptConfig, CompanyTemplateRow, OutreachStakeholderPayload, OutreachResult } from "../types";
import { matchProjects, matchProjectsAsync } from "../utils/matchingEngine";
import { useResolvedCompanyTemplate, resolveBatchCompanyTemplate } from "../utils/companyTemplateMatching";
import { parseTabularFile } from "../utils/fileParsing";
import { QUICK_FEEDBACKS } from "../utils/quickFeedback";
import { useFileDropzone } from "../utils/useFileDropzone";
import PresetToggle from "./PresetToggle";
import CompanyTemplateSelector from "./CompanyTemplateSelector";
import { ConfigModal } from "./PromptConfigPanel";

interface FollowUpWorkflowProps {
  projects: ProjectRow[];
  companyTemplates: CompanyTemplateRow[];
  senderName?: string;
  senderPosition?: string;
  onGenerate: (
    stakeholder: OutreachStakeholderPayload,
    matchedProjects: ProjectRow[],
    customSystemInstructions?: string,
    customFewShotExamples?: string[]
  ) => Promise<OutreachResult>;
  onRefine: (
    stakeholder: OutreachStakeholderPayload,
    originalBlurb: string,
    feedback: string,
    matchedProjects: ProjectRow[],
    customSystemInstructions?: string,
    customFewShotExamples?: string[]
  ) => Promise<OutreachResult>;
}

// Shared few-shot examples for follow-up emails, reused across all 4 relationship/familiarity
// presets below — only systemInstructions changes between them to shift the tone (see App.tsx's
// OUTREACH_PRESETS for the same pattern applied to first-touch outreach).
const FOLLOWUP_SHARED_EXAMPLES = [
  `Subject: Re: Optimizing Last-Mile Logistics Efficiency for Swift Delivery

Hi Robert,

I wanted to send a quick note to follow up on my email last week regarding Dynamic Inventory Allocator models. I understand your schedule is busy.

Given Swift Delivery's focus on warehouse storage carrying costs, I thought our case study showing a 22% overhead reduction might be of interest.

Do you have 5-10 minutes for a brief call next Thursday at 2 PM to explore this?

Best regards,
[Your Name]
[Your Position]`,
  `Subject: Re: Slashed Ad-Fraud Losses by 72% at Retail Checkout

Hi Sarah,

Following up on my message last week regarding cross-channel attribution benchmarks.

We recently helped a growth team boost measurement accuracy from 60% to 92%, resulting in an $8M annualized impact. I'd love to see if a similar attribution model could support your team's current goals.

Would next Wednesday afternoon work for a brief introductory call?

Best regards,
[Your Name]
[Your Position]`
];

// Follow-Up Prompt Presets
const FOLLOWUP_PRESETS: Record<string, PromptConfig> = {
  "new-unknown": {
    systemInstructions: `You are an expert Sales Strategist at LatentView Analytics. Your goal is to draft a polite, professional, and punchy follow-up email to a new stakeholder who does not know us, following up on a previous cold outreach note. Focus on a quick check-in, highlighting a brief outline of how we resolve analytics complexity (with Data & Math), and ask if they had a chance to review the previous thoughts. Keep it under 120 words with a soft CTA.`,
    fewShotExamples: FOLLOWUP_SHARED_EXAMPLES
  },
  "new-knows": {
    systemInstructions: `You are an expert Sales Strategist at LatentView Analytics. Your goal is to draft a warm, engaging follow-up email to a new stakeholder who is familiar with us (e.g. attended a webinar, knows our brand). Reference our previous note and web touchpoint, keeping the tone collaborative, professional, and warm, ending with a low-friction check-in CTA.`,
    fewShotExamples: FOLLOWUP_SHARED_EXAMPLES
  },
  "existing-unknown": {
    systemInstructions: `You are an expert Client Partner at LatentView Analytics. Your goal is to draft a professional follow-up email to a stakeholder in an existing client company where we deliver services, but who does not know us personally yet. Reference our active partnership with their organization (referencing their company name) and check in on our previous correspondence. Keep it collaborative, trusted, and action-oriented.`,
    fewShotExamples: FOLLOWUP_SHARED_EXAMPLES
  },
  "existing-knows": {
    systemInstructions: `You are a trusted Client Partner at LatentView Analytics. Your goal is to draft a warm, friendly follow-up email to an existing stakeholder who knows us well. Refer to our ongoing partnership and prior sync. Propose a short check-in on the advanced analytics ideas we emailed earlier, keeping the tone relationship-driven, warm, and highly collaborative.`,
    fewShotExamples: FOLLOWUP_SHARED_EXAMPLES
  }
};

interface BatchRecord {
  id: number;
  name: string;
  designation: string;
  areaOfFocus: string;
  company?: string;
  linkedinUrl?: string;
  previousEmail: string;

  status: "idle" | "matching" | "generating" | "complete" | "failed";
  matchedCaseStudies: ProjectRow[];
  generatedBlurb: string;
  generatedLinkedin: string;
  errorMessage?: string;
}

export default function FollowUpWorkflow({ projects, companyTemplates, senderName, senderPosition, onGenerate, onRefine }: FollowUpWorkflowProps) {
  const [workflowMode, setWorkflowMode] = useState<"single" | "batch">("single");

  // Outreach Context Presets specific to follow-up
  const [relationship, setRelationship] = useState<"new" | "existing">("new");
  const [familiarity, setFamiliarity] = useState<"unknown" | "knows">("unknown");
  const [promptConfig, setPromptConfig] = useState<PromptConfig>(FOLLOWUP_PRESETS["new-unknown"]);
  const [showTooltip, setShowTooltip] = useState(false);
  const [isSysPromptModalOpen, setIsSysPromptModalOpen] = useState(false);
  const [isFewShotModalOpen, setIsFewShotModalOpen] = useState(false);
  const [showTooltip1, setShowTooltip1] = useState(false);
  const [showTooltip2, setShowTooltip2] = useState(false);

  // Single Stakeholder Inputs
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  const [areaOfFocus, setAreaOfFocus] = useState("");
  const [company, setCompany] = useState("");
  const [previousEmail, setPreviousEmail] = useState("");

  // UI States
  const [matched, setMatched] = useState<ProjectRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedBlurb, setGeneratedBlurb] = useState("");
  const [copied, setCopied] = useState(false);
  const [linkedinText, setLinkedinText] = useState("");
  const [copiedLinkedin, setCopiedLinkedin] = useState(false);

  // Refinement
  const [feedback, setFeedback] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [history, setHistory] = useState<{ feedback: string; blurb: string; linkedinText: string }[]>([]);

  // Batch states
  const [records, setRecords] = useState<BatchRecord[]>([]);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchSuccess, setBatchSuccess] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [activeRow, setActiveRow] = useState<BatchRecord | null>(null);

  // Sync presets
  const handleTogglePreset = (rel: "new" | "existing", fam: "unknown" | "knows") => {
    setRelationship(rel);
    setFamiliarity(fam);
    const key = `${rel}-${fam}`;
    setPromptConfig(FOLLOWUP_PRESETS[key]);
  };

  const handleResetDefaults = () => {
    const key = `${relationship}-${familiarity}`;
    setPromptConfig(FOLLOWUP_PRESETS[key]);
  };

  useEffect(() => {
    handleClearForm();
  }, [workflowMode]);

  // Debounced so a live-matching request only fires once typing pauses — see the matching
  // comment in SingleStakeholderWorkflow.tsx for why this matters.
  useEffect(() => {
    let active = true;
    const fetchMatches = async () => {
      if (projects.length > 0 && (designation || areaOfFocus)) {
        const topMatches = await matchProjectsAsync(projects, designation, areaOfFocus, company, "", 5);
        if (active) {
          setMatched(topMatches);
        }
      } else {
        if (active) {
          setMatched([]);
        }
      }
    };
    const timeoutId = setTimeout(fetchMatches, 400);
    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [projects, designation, areaOfFocus, company]);

  // Resolve which company email format (if any) applies as the company field changes
  const {
    matches: companyTemplateMatches,
    selectedId: selectedCompanyTemplateId,
    setSelectedId: setSelectedCompanyTemplateId,
    genericTemplate: genericCompanyTemplate,
    activeTemplate: activeCompanyTemplate
  } = useResolvedCompanyTemplate(companyTemplates, company);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please provide a stakeholder name.");
      return;
    }
    if (!previousEmail.trim()) {
      setError("Please provide the previously sent email communication.");
      return;
    }
    setError(null);
    setIsLoading(true);
    setGeneratedBlurb("");
    setLinkedinText("");
    setHistory([]);

    try {
      const finalMatched = await matchProjectsAsync(projects, designation, areaOfFocus, company, "", 5);
      const result = await onGenerate(
        { name, designation, areaOfFocus, company, previousEmail, companyTemplate: activeCompanyTemplate, senderName, senderPosition },
        finalMatched,
        promptConfig.systemInstructions,
        promptConfig.fewShotExamples
      );
      setGeneratedBlurb(result.text);
      setLinkedinText(result.linkedinText);
    } catch (err: any) {
      setError(err.message || "Failed to generate follow-up email.");
    } finally {
      setIsLoading(false);
    }
  };

  const triggerRefinement = async (feedbackText: string) => {
    setError(null);
    setIsRefining(true);
    const currentBlurb = generatedBlurb;
    const currentLinkedinText = linkedinText;
    try {
      const finalMatched = await matchProjectsAsync(projects, designation, areaOfFocus, company, "", 5);
      const result = await onRefine(
        { name, designation, areaOfFocus, company, previousEmail, companyTemplate: activeCompanyTemplate, senderName, senderPosition },
        currentBlurb,
        feedbackText,
        finalMatched,
        promptConfig.systemInstructions,
        promptConfig.fewShotExamples
      );
      setHistory((prev) => [...prev, { feedback: feedbackText, blurb: currentBlurb, linkedinText: currentLinkedinText }]);
      setGeneratedBlurb(result.text);
      setLinkedinText(result.linkedinText);
    } catch (err: any) {
      setError(err.message || "Failed to refine follow-up blurb.");
    } finally {
      setIsRefining(false);
    }
  };

  const handleRefineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim() || !generatedBlurb) return;
    await triggerRefinement(feedback);
    setFeedback("");
  };

  const handleRestoreHistory = (oldBlurb: string, oldLinkedinText: string) => {
    setGeneratedBlurb(oldBlurb);
    setLinkedinText(oldLinkedinText);
  };

  const handleClearForm = () => {
    setName("");
    setDesignation("");
    setCompany("");
    setAreaOfFocus("");
    setPreviousEmail("");
    setError(null);
    setGeneratedBlurb("");
    setLinkedinText("");
    setHistory([]);
    setSelectedCompanyTemplateId(null);
  };

  // Drag and Drop helpers
  const { fileInputRef, dragActive, handleDrag, handleDrop, handleFileChange } = useFileDropzone((file) => parseBatchFile(file));

  const handleCopy = () => {
    if (!generatedBlurb) return;
    navigator.clipboard.writeText(generatedBlurb);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLinkedin = () => {
    if (!linkedinText) return;
    navigator.clipboard.writeText(linkedinText);
    setCopiedLinkedin(true);
    setTimeout(() => setCopiedLinkedin(false), 2000);
  };

  // Batch Execution Parsers
  const parseBatchFile = async (file: File) => {
    setBatchError(null);
    setBatchSuccess(null);

    const processJson = (jsonData: any[]) => {
      if (jsonData.length === 0) {
        setBatchError("Empty spreadsheet.");
        return;
      }
      const findVal = (row: any, keys: string[]) => {
        const rowKeys = Object.keys(row);
        const match = rowKeys.find(rk => keys.some(k => rk.toLowerCase().replace(/[^a-z0-9]/g, "").includes(k)));
        return match ? row[match] : undefined;
      };

      try {
        const parsed: BatchRecord[] = jsonData.map((row, idx) => {
          const prevEmail = String(findVal(row, ["previous email", "prev email", "email content", "sent email"]) || "");
          if (!prevEmail) {
            throw new Error(`Row ${idx + 2}: Missing required 'Previously Sent Email' column.`);
          }

          const designation = String(findVal(row, ["designation", "title"]) || "");
          const areaOfFocus = String(findVal(row, ["area of focus", "keywords"]) || "");
          if (!designation || !areaOfFocus) {
            throw new Error(`Row ${idx + 2}: Missing required 'Designation' or 'Area of Focus' columns.`);
          }
          return {
            id: idx + 1,
            name: String(findVal(row, ["name"]) || `Lead #${idx + 1}`),
            company: String(findVal(row, ["company"]) || ""),
            designation,
            areaOfFocus,
            previousEmail: prevEmail,
            status: "idle",
            matchedCaseStudies: [],
            generatedBlurb: "",
            generatedLinkedin: ""
          };
        });
        setRecords(parsed);
        setBatchSuccess(`Successfully loaded ${parsed.length} follow-up records.`);
      } catch (err: any) {
        setBatchError(err.message || "Failed to process layout.");
      }
    };

    try {
      const { rows } = await parseTabularFile(file);
      processJson(rows);
    } catch (err: any) {
      setBatchError(err.message || "Failed to read the file.");
    }
  };

  const handleProcessBatch = async () => {
    setIsProcessing(true);
    setProcessedCount(0);

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      setRecords(prev => prev.map(r => r.id === record.id ? { ...r, status: "matching" } : r));

      try {
        let finalDesignation = record.designation;
        let finalAreaOfFocus = record.areaOfFocus;
        let finalCompany = record.company;

        const topMatches = await matchProjectsAsync(projects, finalDesignation, finalAreaOfFocus, finalCompany, "", 5);
        setRecords(prev => prev.map(r => r.id === record.id ? { ...r, status: "generating", matchedCaseStudies: topMatches } : r));

        const companyTemplate = resolveBatchCompanyTemplate(companyTemplates, finalCompany || "");

        const result = await onGenerate({
          name: record.name,
          designation: finalDesignation,
          areaOfFocus: finalAreaOfFocus,
          company: finalCompany,
          previousEmail: record.previousEmail,
          companyTemplate,
          senderName,
          senderPosition
        }, topMatches, promptConfig.systemInstructions, promptConfig.fewShotExamples);

        setRecords(prev => prev.map(r => r.id === record.id ? { ...r, status: "complete", generatedBlurb: result.text, generatedLinkedin: result.linkedinText } : r));
      } catch (err: any) {
        setRecords(prev => prev.map(r => r.id === record.id ? { ...r, status: "failed", errorMessage: err.message } : r));
      }
      setProcessedCount(val => val + 1);
    }
    setIsProcessing(false);
  };

  const handleDownloadBatch = () => {
    const exportData = records.map(r => ({
      "Name": r.name,
      "Title": r.designation,
      "Company": r.company || "",
      "Area of Focus": r.areaOfFocus,
      "Previously Sent Email": r.previousEmail,
      "Follow-Up Email": r.generatedBlurb,
      "LinkedIn DM Version": r.generatedLinkedin,
      "Status": r.status,
      "Error Messages": r.errorMessage || ""
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Follow-Up Batch");
    XLSX.writeFile(workbook, `followup_batch_results_${Date.now()}.xlsx`);
  };

  const handleClear = () => {
    setRecords([]);
    setBatchSuccess(null);
    setBatchError(null);
    setProcessedCount(0);
  };

  return (
    <div className="space-y-6">
      {/* SECTION 1: INGESTION & TEMPLATES */}
      <section className="space-y-4">
        <div className="space-y-4">
          {/* Outreach presets */}
          <div className="dark-card p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4 border border-slate-300 bg-white">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-slate-100 rounded-lg text-[#0284c7] border border-slate-200 shadow-inner">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-[#0a1128] uppercase tracking-wider">Follow-up Context Presets</h3>
                <p className="text-[11px] text-slate-500">Auto-align follow-up prompt guidelines and templates</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <PresetToggle relationship={relationship} familiarity={familiarity} onToggle={handleTogglePreset} />
            </div>
          </div>

          {/* Prompts layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5">
              <div className="dark-card rounded-xl overflow-hidden h-full flex flex-col border border-slate-300 bg-white">
                <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                  <div className="flex items-center space-x-2">
                    <div className="p-1.5 bg-sky-50 rounded-lg text-[#0284c7]">
                      <Sliders className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-xs font-bold text-[#0a1128] uppercase tracking-wider">Follow-Up Global Prompts</h2>
                      <p className="text-[10px] text-slate-500">Fine-tune directives for follow-up emails</p>
                    </div>
                  </div>
                  <button
                    onClick={handleResetDefaults}
                    className="flex items-center space-x-1 px-2.5 py-1 text-[10px] font-bold text-sky-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-all btn-animate"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Reset Defaults</span>
                  </button>
                </div>

                <div className="p-4 space-y-3.5 flex-grow flex flex-col justify-between bg-white">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1">
                        <span>Global System Instructions</span>
                        <button
                          type="button"
                          onClick={() => setShowTooltip(!showTooltip)}
                          className="text-slate-400 hover:text-[#0284c7]"
                        >
                          <HelpCircle className="w-3.5 h-3.5" />
                        </button>
                      </label>
                    </div>
                    {showTooltip && (
                      <div className="p-2.5 bg-sky-50 border border-sky-200 rounded-lg text-[10px] text-slate-700 leading-normal animate-fadeIn animate-duration-200">
                        Drafts follow-up blurbs specifically built from previous sent email contexts.
                      </div>
                    )}

                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] text-slate-600 font-mono h-[80px] overflow-hidden relative">
                      <div className="line-clamp-3 leading-relaxed whitespace-pre-wrap">{promptConfig.systemInstructions}</div>
                      <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-slate-50 to-transparent pointer-events-none"></div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsSysPromptModalOpen(true)}
                    className="w-full py-2 bg-[#0284c7]/10 hover:bg-[#0284c7]/20 text-[#0284c7] text-xs font-bold rounded-lg transition-all btn-animate flex items-center justify-center space-x-1.5 mt-1"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Edit System Instructions</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="dark-card rounded-xl overflow-hidden h-full flex flex-col border border-slate-300 bg-white">
                <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="p-1.5 bg-sky-50 rounded-lg text-[#0284c7]">
                      <Layers className="w-4 h-4 text-[#0284c7]" />
                    </div>
                    <div>
                      <h2 className="text-xs font-bold text-[#0a1128] uppercase tracking-wider">Follow-Up Few-Shot Examples</h2>
                      <p className="text-[10px] text-slate-500">Providing 2 complete examples guides the LLM to mirror exact formats, lengths, and layout structures.</p>
                    </div>
                  </div>

                  {/* Toggle Switch */}
                  <label className="relative inline-flex items-center cursor-pointer select-none shrink-0 ml-4">
                    <input 
                      type="checkbox" 
                      checked={promptConfig.useFewShot !== false} 
                      onChange={(e) => setPromptConfig({ ...promptConfig, useFewShot: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4.5 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-[#0284c7] relative"></div>
                    <span className="ml-2 text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                      {promptConfig.useFewShot !== false ? "Use Examples" : "Skip Examples"}
                    </span>
                  </label>
                </div>

                <div className={`p-4 space-y-3.5 flex-grow flex flex-col justify-between bg-white transition-opacity duration-300 ${promptConfig.useFewShot === false ? "opacity-40" : ""}`}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                    {/* Example 1 */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1">
                          <span>Example #1</span>
                          <button
                            type="button"
                            onClick={() => setShowTooltip1(!showTooltip1)}
                            className="text-slate-400 hover:text-[#0284c7] transition-colors"
                            title="What is this?"
                          >
                            <HelpCircle className="w-3.5 h-3.5" />
                          </button>
                        </label>
                      </div>
                      {showTooltip1 && (
                        <div className="p-2.5 bg-sky-50 border border-sky-200 rounded-lg text-[10px] text-slate-700 leading-normal animate-fadeIn">
                          Example of a personalized outreach blurb utilizing specific track-record metrics.
                        </div>
                      )}
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] text-slate-600 font-mono h-[80px] overflow-hidden relative w-full">
                        <div className="line-clamp-2 leading-relaxed whitespace-pre-wrap">{promptConfig.fewShotExamples[0] || "No example provided."}</div>
                        <div className="absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-slate-50 to-transparent pointer-events-none"></div>
                      </div>
                    </div>

                    {/* Example 2 */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1">
                          <span>Example #2</span>
                          <button
                            type="button"
                            onClick={() => setShowTooltip2(!showTooltip2)}
                            className="text-slate-400 hover:text-[#0284c7] transition-colors"
                            title="What is this?"
                          >
                            <HelpCircle className="w-3.5 h-3.5" />
                          </button>
                        </label>
                      </div>
                      {showTooltip2 && (
                        <div className="p-2.5 bg-sky-50 border border-sky-200 rounded-lg text-[10px] text-slate-700 leading-normal animate-fadeIn">
                          Example of a personalized outreach blurb utilizing industry-specific value propositions.
                        </div>
                      )}
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] text-slate-600 font-mono h-[80px] overflow-hidden relative w-full">
                        <div className="line-clamp-2 leading-relaxed whitespace-pre-wrap">{promptConfig.fewShotExamples[1] || "No example provided."}</div>
                        <div className="absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-slate-50 to-transparent pointer-events-none"></div>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsFewShotModalOpen(true)}
                    className="w-full py-2 bg-[#0284c7]/10 hover:bg-[#0284c7]/20 text-[#0284c7] text-xs font-bold rounded-lg transition-all btn-animate flex items-center justify-center space-x-1.5 mt-1"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Edit Few-Shot Examples</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: WORKFLOW RUN ROOMS */}
      <section className="space-y-4">
        <div className="flex items-center space-x-2 border-b border-slate-300 pb-1.5">
          <FileText className="w-4 h-4 text-[#034078]" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#0a1128]">
            Operational Follow-up Execution Rooms
          </h2>
        </div>

        <div className="space-y-4">
          <div className="flex border-b border-slate-300 justify-center">
            <button
              type="button"
              onClick={() => setWorkflowMode("single")}
              className={`pb-3 px-6 text-xs font-bold border-b-2 transition-all flex items-center space-x-2 ${
                workflowMode === "single" ? "border-[#0284c7] text-[#0284c7] font-extrabold" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>Single Stakeholder Mode</span>
            </button>
            <button
              type="button"
              onClick={() => setWorkflowMode("batch")}
              className={`pb-3 px-6 text-xs font-bold border-b-2 transition-all flex items-center space-x-2 ${
                workflowMode === "batch" ? "border-[#0284c7] text-[#0284c7] font-extrabold" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Batch Ingestion Mode</span>
            </button>
          </div>

          <div className="bg-slate-200/30 rounded-2xl p-6 border border-slate-300/40">
            {workflowMode === "single" ? (
              /* SINGLE MODE */
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 space-y-5">
                  <div className="dark-card rounded-xl p-5 space-y-4 flex flex-col border border-slate-300 bg-white">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                      <div>
                        <h3 className="text-xs font-bold text-[#0a1128] uppercase tracking-wide">
                          Stakeholder Follow-up Details
                        </h3>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleClearForm}
                          className="text-[10px] font-bold text-slate-600 bg-white border border-slate-300 px-2.5 py-1 rounded-lg transition-all btn-animate"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    <form onSubmit={handleGenerate} className="space-y-3.5 pt-1">
                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider">Stakeholder Name</label>
                        <input
                          type="text"
                          placeholder="e.g. Robert Vance"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs text-slate-800 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0284c7] focus:outline-none"
                          required
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider">Stakeholder Company</label>
                        <input
                          type="text"
                          placeholder="e.g. Swift Delivery"
                          value={company}
                          onChange={(e) => setCompany(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs text-slate-800 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0284c7] focus:outline-none"
                        />
                      </div>

                      <CompanyTemplateSelector
                        matches={companyTemplateMatches}
                        selectedId={selectedCompanyTemplateId}
                        onSelect={setSelectedCompanyTemplateId}
                        genericTemplate={genericCompanyTemplate}
                      />

                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider">Official Designation / Title</label>
                        <input
                          type="text"
                          placeholder="e.g. Director of Operations"
                          value={designation}
                          onChange={(e) => setDesignation(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs text-slate-800 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0284c7] focus:outline-none"
                          required
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider">Area of Focus / Strategic Keywords</label>
                        <textarea
                          placeholder="e.g. warehouse capacity optimization, cargo scheduling"
                          value={areaOfFocus}
                          onChange={(e) => setAreaOfFocus(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs text-slate-800 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0284c7] focus:outline-none"
                          rows={2}
                          required
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold text-[#0a1128] uppercase tracking-wider flex items-center space-x-1.5">
                          <FileText className="w-3.5 h-3.5 text-[#0284c7]" />
                          <span>Previously Sent Exact Email Communication</span>
                        </label>
                        <textarea
                          placeholder="Paste the exact email thread or note sent previously..."
                          value={previousEmail}
                          onChange={(e) => setPreviousEmail(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs text-slate-800 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0284c7] focus:outline-none"
                          rows={5}
                          required
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isLoading || !name || !designation || !areaOfFocus || !previousEmail}
                        className="w-full py-2 bg-[#0284c7] hover:bg-[#025a87] disabled:bg-slate-300 disabled:text-slate-500 text-white text-xs font-bold rounded-lg transition-all btn-animate flex justify-center items-center space-x-2"
                      >
                        {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        <span>Generate Follow-Up</span>
                      </button>
                    </form>
                  </div>
                </div>

                <div className="lg:col-span-7">
                  <div className="dark-card rounded-xl overflow-hidden h-full flex flex-col border border-slate-300 bg-white min-h-[400px]">
                    <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                      <span className="text-xs font-bold text-[#0a1128] uppercase tracking-wide">Personalized Follow-Up Room</span>
                      {generatedBlurb && (
                        <button
                          onClick={handleCopy}
                          className="flex items-center space-x-1 px-3 py-1 text-xs font-bold text-white bg-[#0284c7] rounded-lg transition-all btn-animate"
                        >
                          {copied ? <span>Copied!</span> : <span>Copy Email</span>}
                        </button>
                      )}
                    </div>

                    <div className="p-5 flex-grow flex flex-col justify-between">
                      <div className="space-y-4">
                        {error && <div className="p-3 bg-red-50 text-xs text-red-800 rounded-lg">{error}</div>}
                        {generatedBlurb ? (
                          <>
                            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                              {generatedBlurb}
                            </div>

                            {linkedinText && (
                              <div className="border border-sky-200 bg-sky-50/40 rounded-xl overflow-hidden animate-fadeIn">
                                <div className="px-3 py-2 border-b border-sky-200 bg-sky-50 flex items-center justify-between">
                                  <div className="flex items-center space-x-1.5">
                                    <span className="text-[10px] font-bold text-[#0a1128] uppercase tracking-wide">LinkedIn DM Version</span>
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${linkedinText.length > 1000 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                                      {linkedinText.length}/1000
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={handleCopyLinkedin}
                                    className="px-2.5 py-1 text-[10px] font-bold text-white bg-[#0284c7] rounded-lg transition-all btn-animate"
                                  >
                                    {copiedLinkedin ? "Copied!" : "Copy"}
                                  </button>
                                </div>
                                <div className="p-3.5 whitespace-pre-wrap text-xs text-slate-800 leading-relaxed max-h-64 overflow-y-auto">
                                  {linkedinText}
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400">
                            <Sparkles className="w-8 h-8 mb-2 text-[#0284c7]/20 animate-pulse" />
                            <p className="text-xs font-semibold">No follow-up generated yet.</p>
                          </div>
                        )}
                      </div>

                      {generatedBlurb && (
                        <div className="mt-6 border-t border-slate-200 pt-5 space-y-4 animate-fadeIn">
                          <div className="flex items-center space-x-1.5 text-xs font-bold text-[#0a1128] uppercase tracking-wider">
                            <History className="w-4 h-4 text-[#0284c7]" />
                            <span>Iterative Feedback Loop</span>
                          </div>

                          <div className="space-y-2">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Quick Actions</span>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full">
                              {QUICK_FEEDBACKS.map((item, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => triggerRefinement(item.text)}
                                  disabled={isRefining}
                                  className="w-full py-2.5 px-3 text-xs font-bold text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 disabled:bg-slate-100 transition-all btn-animate text-center"
                                >
                                  {item.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <form onSubmit={handleRefineSubmit} className="flex flex-col gap-2 pt-1 border-t border-slate-100">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Custom Feedback</span>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder="e.g. 'Make it focus heavily on the financial ROI', 'Make it 20% shorter'..."
                                value={feedback}
                                onChange={(e) => setFeedback(e.target.value)}
                                disabled={isRefining}
                                className="flex-grow px-3 py-2 text-xs text-slate-800 bg-white border border-slate-300 rounded-lg focus:outline-none"
                              />
                              <button
                                type="submit"
                                disabled={isRefining || !feedback.trim()}
                                className="px-4 py-2 bg-[#0284c7] text-white text-xs font-bold rounded-lg transition-all btn-animate flex items-center space-x-1 shrink-0"
                              >
                                {isRefining ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                <span>Refine</span>
                              </button>
                            </div>
                          </form>

                          {history.length > 0 && (
                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2 max-h-32 overflow-y-auto shadow-xs">
                              <span className="text-[9px] font-bold text-slate-500 uppercase">Revision History</span>
                              {history.map((hist, i) => (
                                <div key={i} className="flex items-center justify-between text-[11px] p-2 bg-white border rounded">
                                  <span className="text-slate-600 truncate max-w-[80%]">&quot;{hist.feedback}&quot;</span>
                                  <button onClick={() => handleRestoreHistory(hist.blurb, hist.linkedinText)} className="text-[9px] font-bold text-[#0284c7] hover:underline">
                                    Restore
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* BATCH MODE */
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-4 space-y-5">
                  <div className="dark-card rounded-xl p-5 space-y-4 flex flex-col border border-slate-300 bg-white">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                      <div>
                        <h3 className="text-xs font-bold text-[#0a1128] uppercase tracking-wide">Follow-Up Batch Control</h3>
                      </div>
                      <div className="flex gap-2">
                        {records.length > 0 && (
                          <button
                            type="button"
                            onClick={handleClear}
                            className="text-[10px] font-bold text-slate-600 bg-white border border-slate-300 px-2.5 py-1 rounded-lg transition-all btn-animate"
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
                        dragActive ? "border-[#0284c7] bg-sky-50" : "border-slate-300 bg-slate-50/50 hover:bg-slate-50"
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
                      <p className="text-xs font-bold text-slate-700">Upload Follow-Up File</p>
                      <p className="text-[9px] text-slate-400 mt-0.5">Drag/Drop CSV or Excel files</p>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
                      <span className="text-[10px] font-bold text-slate-700 uppercase block">Required Columns:</span>
                      <p className="text-[9px] text-slate-500">
                        ✓ Designation, Area of Focus, Name, Previously Sent Email
                      </p>
                    </div>

                    {records.length > 0 && (
                      <button
                        onClick={handleProcessBatch}
                        disabled={isProcessing}
                        className="w-full py-2 bg-[#0284c7] hover:bg-[#025a87] text-white text-xs font-bold rounded-lg transition-all btn-animate flex justify-center items-center space-x-2"
                      >
                        {isProcessing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                        <span>{isProcessing ? "Processing Queue..." : "Run Batch Pipeline"}</span>
                      </button>
                    )}
                  </div>

                  {batchSuccess && <div className="p-3 bg-emerald-50 text-emerald-800 text-xs rounded-xl border border-emerald-200">{batchSuccess}</div>}
                  {batchError && <div className="p-3 bg-red-50 text-red-800 text-xs rounded-xl border border-red-200">{batchError}</div>}
                </div>

                <div className="lg:col-span-8">
                  <div className="dark-card rounded-xl border border-slate-300 flex flex-col overflow-hidden bg-white min-h-[300px]">
                    <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                      <span className="text-xs font-bold text-[#0a1128] uppercase tracking-wide">Batch Processing Queue</span>
                      {records.some(r => r.status === "complete") && (
                        <button
                          onClick={handleDownloadBatch}
                          className="flex items-center space-x-1 px-3 py-1 text-xs font-bold text-white bg-emerald-600 rounded-lg transition-all btn-animate"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download XLSX</span>
                        </button>
                      )}
                    </div>

                    <div className="flex-grow overflow-x-auto">
                      {records.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400">
                          <Layers className="w-8 h-8 mb-2" />
                          <p className="text-xs">No follow-ups loaded.</p>
                        </div>
                      ) : (
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 text-[9px] font-bold text-slate-500 uppercase border-b border-slate-200">
                              <th className="px-4 py-2 text-center w-10">ID</th>
                              <th className="px-4 py-2">Stakeholder</th>
                              <th className="px-4 py-2 w-32">Previous Note</th>
                              <th className="px-4 py-2 text-center">Status</th>
                              <th className="px-4 py-2 text-center">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-xs bg-white text-slate-700">
                            {records.map(r => (
                              <tr key={r.id} className="hover:bg-slate-50/50">
                                <td className="px-4 py-2.5 text-center font-mono text-slate-400">{r.id}</td>
                                <td className="px-4 py-2.5">
                                  <div className="font-bold">{r.name}</div>
                                  <div className="text-[10px] text-slate-500">{r.designation} {r.company ? `@ ${r.company}` : ""}</div>
                                </td>
                                <td className="px-4 py-2.5">
                                  <div className="text-[10px] text-slate-500 truncate max-w-[120px]" title={r.previousEmail}>
                                    {r.previousEmail}
                                  </div>
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  <span className={`inline-block px-2 py-0.5 text-[9px] font-extrabold uppercase rounded-full border ${
                                    r.status === "complete" ? "bg-emerald-50 text-emerald-800 border-emerald-200" :
                                    r.status === "failed" ? "bg-red-50 text-red-800 border-red-200" :
                                    r.status === "generating" ? "bg-sky-50 text-[#0284c7] border-sky-200 animate-pulse" :
                                    r.status === "matching" ? "bg-indigo-50 text-indigo-800 border-indigo-200 animate-pulse" :
                                    "bg-slate-100 text-slate-500 border-slate-200"
                                  }`}>
                                    {r.status}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  <button
                                    onClick={() => setActiveRow(r)}
                                    disabled={!r.generatedBlurb && r.status !== "failed"}
                                    className="px-2.5 py-1 bg-[#0284c7] text-white font-bold rounded-lg transition-all btn-animate flex items-center space-x-1"
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
            )}
          </div>
        </div>
      </section>

      {/* Row inspector slide-over */}
      {activeRow && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end animate-fadeIn">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setActiveRow(null)} />
          <div className="bg-white border-l border-slate-300 w-full max-w-xl h-full shadow-2xl relative z-10 flex flex-col animate-slideLeft">
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <span className="text-xs font-bold text-[#0a1128] uppercase">Inspect Follow-up (#{activeRow.id})</span>
              <button onClick={() => setActiveRow(null)} className="text-slate-400 p-1 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 flex-1 overflow-y-auto space-y-4 bg-slate-50/50">
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                <div className="font-bold text-slate-900">{activeRow.name}</div>
                <div className="text-[10px] text-slate-500">{activeRow.designation} {activeRow.company ? `@ ${activeRow.company}` : ""}</div>
                <div className="text-[10px] text-slate-700 mt-2 italic">Focus: {activeRow.areaOfFocus}</div>
              </div>

              <div>
                <span className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Previously Sent Email</span>
                <div className="p-3 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-600 whitespace-pre-wrap max-h-40 overflow-y-auto shadow-xs">
                  {activeRow.previousEmail}
                </div>
              </div>

              <div>
                <span className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Generated Follow-up</span>
                {activeRow.generatedBlurb ? (
                  <div className="p-4 bg-white border border-slate-200 text-xs text-slate-800 whitespace-pre-wrap leading-relaxed shadow-xs">
                    {activeRow.generatedBlurb}
                  </div>
                ) : (
                  <div className="p-3 bg-red-50 text-red-800 text-xs rounded-lg border border-red-200">
                    {activeRow.errorMessage}
                  </div>
                )}
              </div>

              {activeRow.generatedLinkedin && (
                <div>
                  <span className="text-[9px] font-bold text-slate-500 uppercase block mb-1 flex items-center gap-1.5">
                    <span>LinkedIn DM Version</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${activeRow.generatedLinkedin.length > 1000 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {activeRow.generatedLinkedin.length}/1000
                    </span>
                  </span>
                  <div className="p-4 bg-sky-50/40 border border-sky-200 text-xs text-slate-800 whitespace-pre-wrap leading-relaxed shadow-xs rounded">
                    {activeRow.generatedLinkedin}
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-between">
              <div className="flex gap-2">
                {activeRow.generatedBlurb && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(activeRow.generatedBlurb);
                      alert("Copied to clipboard!");
                    }}
                    className="px-4 py-1.5 bg-[#0284c7] text-white font-bold rounded-lg flex items-center space-x-1"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Email</span>
                  </button>
                )}
                {activeRow.generatedLinkedin && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(activeRow.generatedLinkedin);
                      alert("LinkedIn DM copied to clipboard!");
                    }}
                    className="px-4 py-1.5 bg-white border border-[#0284c7] text-[#0284c7] font-bold rounded-lg flex items-center space-x-1"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy LinkedIn</span>
                  </button>
                )}
              </div>
              <button onClick={() => setActiveRow(null)} className="px-4 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-600">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Popup for editing Follow-Up System Instructions */}
      {isSysPromptModalOpen && (
        <ConfigModal
          icon={<Sliders className="w-4 h-4 text-[#0284c7]" />}
          title="Configure System Instructions"
          maxWidthClass="max-w-2xl"
          onClose={() => setIsSysPromptModalOpen(false)}
        >
          <div className="p-4 overflow-y-auto flex-grow flex flex-col space-y-3">
            <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider">Global System Instructions</label>
            <textarea
              value={promptConfig.systemInstructions}
              onChange={(e) => setPromptConfig({ ...promptConfig, systemInstructions: e.target.value })}
              className="w-full px-3 py-2 text-xs text-slate-800 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0284c7] focus:outline-none placeholder-slate-400 font-mono leading-relaxed resize-none flex-grow min-h-[300px]"
              placeholder="Provide system directives to shape the AI's writing style..."
            />
          </div>
        </ConfigModal>
      )}

      {/* Modal Popup for editing Follow-Up Few-Shot Examples */}
      {isFewShotModalOpen && (
        <ConfigModal
          icon={<Layers className="w-4 h-4 text-[#0284c7]" />}
          title="Configure Few-Shot Examples"
          maxWidthClass="max-w-4xl"
          onClose={() => setIsFewShotModalOpen(false)}
        >
          <div className="p-4 overflow-y-auto flex-grow grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 flex flex-col">
              <textarea
                value={promptConfig.fewShotExamples[0] || ""}
                onChange={(e) => {
                  const updated = [...promptConfig.fewShotExamples];
                  updated[0] = e.target.value;
                  setPromptConfig({ ...promptConfig, fewShotExamples: updated });
                }}
                className="w-full px-3 py-2 text-xs text-slate-800 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0284c7] focus:outline-none placeholder-slate-400 font-mono leading-relaxed resize-none flex-grow min-h-[300px]"
                placeholder="Enter sample blurb #1..."
              />
            </div>
            <div className="space-y-2 flex flex-col">
              <textarea
                value={promptConfig.fewShotExamples[1] || ""}
                onChange={(e) => {
                  const updated = [...promptConfig.fewShotExamples];
                  updated[1] = e.target.value;
                  setPromptConfig({ ...promptConfig, fewShotExamples: updated });
                }}
                className="w-full px-3 py-2 text-xs text-slate-800 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0284c7] focus:outline-none placeholder-slate-400 font-mono leading-relaxed resize-none flex-grow min-h-[300px]"
                placeholder="Enter sample blurb #2..."
              />
            </div>
          </div>
        </ConfigModal>
      )}
    </div>
  );
}
