import React, { useState, useEffect } from "react";
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
  Eye,
  Linkedin
} from "lucide-react";
import { ProjectRow, PromptConfig, CompanyTemplateRow } from "../types";
import { matchProjects, matchProjectsAsync } from "../utils/matchingEngine";
import { matchCompanyTemplates, findGenericTemplate } from "../utils/companyTemplateMatching";
import CompanyTemplateSelector from "./CompanyTemplateSelector";

interface SingleStakeholderWorkflowProps {
  projects: ProjectRow[];
  companyTemplates: CompanyTemplateRow[];
  config: PromptConfig;
  senderName?: string;
  senderPosition?: string;
  onGenerate: (
    stakeholder: {
      name: string;
      designation: string;
      areaOfFocus: string;
      company?: string;
      companyIntelligence?: string;
      linkedinUrl?: string;
      companyTemplate?: string;
      senderName?: string;
      senderPosition?: string;
    },
    matchedProjects: ProjectRow[]
  ) => Promise<{ text: string; linkedinText: string; referencedProjectIds: string[] }>;
  onRefine: (
    stakeholder: {
      name: string;
      designation: string;
      areaOfFocus: string;
      company?: string;
      companyIntelligence?: string;
      linkedinUrl?: string;
      companyTemplate?: string;
      senderName?: string;
      senderPosition?: string;
    },
    originalBlurb: string,
    feedback: string,
    matchedProjects: ProjectRow[]
  ) => Promise<{ text: string; linkedinText: string; referencedProjectIds: string[] }>;
  researchMode: "manual" | "linkedin";
}

const QUICK_FEEDBACKS = [
  { label: "Polish ✨", text: "Please polish the writing and style of the email." },
  { label: "Formalize 👔", text: "Make the email more formal and professional." },
  { label: "Add Use Case +", text: "Add one more relevant case study or project metric from our track record to the email." },
  { label: "Remove Use Case -", text: "Remove one case study or project metric reference from the email to make it more focused." }
];

export default function SingleStakeholderWorkflow({
  projects,
  companyTemplates,
  config,
  senderName,
  senderPosition,
  onGenerate,
  onRefine,
  researchMode
}: SingleStakeholderWorkflowProps) {
  // Inputs
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  const [areaOfFocus, setAreaOfFocus] = useState("");
  const [company, setCompany] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [companyIntelligence, setCompanyIntelligence] = useState("");

  // Company email-format matching
  const [companyTemplateMatches, setCompanyTemplateMatches] = useState<CompanyTemplateRow[]>([]);
  const [selectedCompanyTemplateId, setSelectedCompanyTemplateId] = useState<string | null>(null);

  // Search Agent State
  const [isResearching, setIsResearching] = useState(false);
  const [researchStatus, setResearchStatus] = useState("");
  const [isResearched, setIsResearched] = useState(false);

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
  const [history, setHistory] = useState<{ feedback: string; blurb: string; linkedinText: string; referencedProjectIds: string[] }[]>([]);

  // Grounding reference states
  const [referencedIds, setReferencedIds] = useState<string[]>([]);
  const [showReferencesPopover, setShowReferencesPopover] = useState(false);

  // Reset inputs on mode change to prevent leak
  useEffect(() => {
    handleClearForm();
  }, [researchMode]);

  // Update matches dynamically as user types or when research agent populates fields.
  // Debounced so a live-matching request only fires once typing pauses, rather than on every
  // keystroke — each request can be genuinely expensive (see matchingEngine.ts / match_projects.py).
  useEffect(() => {
    let active = true;
    const fetchMatches = async () => {
      if (projects.length > 0 && (designation || areaOfFocus || companyIntelligence)) {
        const topMatches = await matchProjectsAsync(projects, designation, areaOfFocus, company, companyIntelligence, 5);
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
  }, [projects, designation, areaOfFocus, companyIntelligence, company]);

  // Resolve which company email format (if any) applies as the company field changes
  useEffect(() => {
    const matches = matchCompanyTemplates(companyTemplates, company);
    setCompanyTemplateMatches(matches);
    setSelectedCompanyTemplateId(null);
  }, [company, companyTemplates]);

  const genericCompanyTemplate = findGenericTemplate(companyTemplates);

  const activeCompanyTemplate =
    companyTemplateMatches.length === 1
      ? companyTemplateMatches[0].template
      : companyTemplateMatches.length > 1
        ? companyTemplateMatches.find(m => m.id === selectedCompanyTemplateId)?.template
        : genericCompanyTemplate?.template;

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please provide a stakeholder name.");
      return;
    }
    setError(null);
    setIsLoading(true);
    setGeneratedBlurb("");
    setLinkedinText("");
    setReferencedIds([]);
    setHistory([]);

    try {
      const finalMatched = await matchProjectsAsync(projects, designation, areaOfFocus, company, companyIntelligence, 5);
      const result = await onGenerate(
        { name, designation, areaOfFocus, company, companyIntelligence, linkedinUrl, companyTemplate: activeCompanyTemplate, senderName, senderPosition },
        finalMatched
      );
      setGeneratedBlurb(result.text);
      setLinkedinText(result.linkedinText);
      setReferencedIds(result.referencedProjectIds);
    } catch (err: any) {
      setError(err.message || "Failed to generate outreach email. Please verify configuration.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim() || !generatedBlurb) return;
    await triggerRefinement(feedback);
    setFeedback("");
  };

  const triggerRefinement = async (feedbackText: string) => {
    setError(null);
    setIsRefining(true);

    const currentBlurb = generatedBlurb;
    const currentLinkedinText = linkedinText;
    const currentReferencedIds = referencedIds;
    try {
      const finalMatched = matched.length > 0
        ? matched
        : await matchProjectsAsync(projects, designation, areaOfFocus, company, companyIntelligence, 5);
      const result = await onRefine(
        { name, designation, areaOfFocus, company, companyIntelligence, linkedinUrl, companyTemplate: activeCompanyTemplate, senderName, senderPosition },
        currentBlurb,
        feedbackText,
        finalMatched
      );

      setHistory((prev) => [
        ...prev,
        { feedback: feedbackText, blurb: currentBlurb, linkedinText: currentLinkedinText, referencedProjectIds: currentReferencedIds }
      ]);
      setGeneratedBlurb(result.text);
      setLinkedinText(result.linkedinText);
      setReferencedIds(result.referencedProjectIds);
    } catch (err: any) {
      setError(err.message || "Failed to refine outreach email.");
    } finally {
      setIsRefining(false);
    }
  };

  const handleLinkedinResearch = async () => {
    if (!linkedinUrl.trim()) {
      setError("Please provide a LinkedIn URL.");
      return;
    }
    setError(null);
    setIsResearching(true);
    setResearchStatus("Initializing search agent...");
    setIsResearched(false);

    // Clear fields
    setName("");
    setDesignation("");
    setCompany("");
    setAreaOfFocus("");
    setCompanyIntelligence("");

    const steps = [
      "Locating profile in public search directories...",
      "Extracting professional biography & job title...",
      "Analyzing latest projects and work focus...",
      "Conducting company-level intelligence query...",
      "Identifying company priorities & strategic challenges...",
      "Compiling profile research report..."
    ];

    let stepIdx = 0;
    const interval = setInterval(() => {
      if (stepIdx < steps.length - 1) {
        setResearchStatus(steps[stepIdx]);
        stepIdx++;
      }
    }, 1500);

    try {
      const response = await fetch("/api/search-linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedinUrl })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "LinkedIn research agent failed to gather intelligence.");
      }

      const data = await response.json();
      clearInterval(interval);
      setResearchStatus("Analysis complete.");

      if (data.name) setName(data.name);
      if (data.designation) setDesignation(data.designation);
      if (data.company) setCompany(data.company);
      if (data.areaOfFocus) setAreaOfFocus(data.areaOfFocus);
      if (data.companyIntelligence) setCompanyIntelligence(data.companyIntelligence);

      setIsResearched(true);
    } catch (err: any) {
      clearInterval(interval);
      setError(err.message || "Search agent failed. Please check the URL or input details manually.");
    } finally {
      setIsResearching(false);
    }
  };

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

  const handleRestoreHistory = (oldBlurb: string, oldLinkedinText?: string, oldReferencedIds?: string[]) => {
    setGeneratedBlurb(oldBlurb);
    if (oldLinkedinText !== undefined) {
      setLinkedinText(oldLinkedinText);
    }
    if (oldReferencedIds) {
      setReferencedIds(oldReferencedIds);
    }
  };

  const handleClearForm = () => {
    setName("");
    setDesignation("");
    setCompany("");
    setAreaOfFocus("");
    setCompanyIntelligence("");
    setLinkedinUrl("");
    setError(null);
    setGeneratedBlurb("");
    setLinkedinText("");
    setReferencedIds([]);
    setHistory([]);
    setIsResearched(false);
    setSelectedCompanyTemplateId(null);
  };

  return (
    <div className="space-y-6" id="single-workflow-container">
      {projects.length === 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start space-x-2.5">
          <Database className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong>Knowledge Repository Empty:</strong> Please load or upload a project database first using the
            <strong> Knowledge Database Control</strong> panel above before generating emails.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Stakeholder Input form */}
        <div className="lg:col-span-5 space-y-5">
          <div className="dark-card rounded-xl p-5 space-y-4 flex flex-col border border-slate-300">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-xs font-bold text-[#0a1128] uppercase tracking-wide">
                  {researchMode === "linkedin" ? "LinkedIn Search Profiler" : "Stakeholder Profiling"}
                </h3>
                <p className="text-[10px] text-slate-500">
                  {researchMode === "linkedin" ? "Input LinkedIn URL to trigger AI agent" : "Provide manual details for matching"}
                </p>
              </div>
              <button
                type="button"
                onClick={handleClearForm}
                className="text-[10px] font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-300 px-2.5 py-1 rounded-lg transition-all btn-animate"
              >
                Clear
              </button>
            </div>

            {/* LinkedIn Mode: URL Input only card (initially) */}
            {researchMode === "linkedin" && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-3">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                    <Link2 className="w-3.5 h-3.5 text-[#0284c7]" />
                    <span>LinkedIn Profile URL</span>
                  </label>
                  <input
                    type="url"
                    placeholder="https://www.linkedin.com/in/username"
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                    disabled={projects.length === 0 || isResearching}
                    className="w-full px-3 py-2 text-xs text-slate-800 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0284c7] focus:outline-none placeholder-slate-400"
                    required
                  />
                </div>

                <button
                  type="button"
                  onClick={handleLinkedinResearch}
                  disabled={projects.length === 0 || isResearching || !linkedinUrl.trim()}
                  className="w-full py-2 bg-[#0284c7] hover:bg-[#025a87] disabled:bg-slate-300 disabled:text-slate-500 text-white text-xs font-bold rounded-lg shadow-sm flex items-center justify-center space-x-2 transition-all btn-animate"
                >
                  {isResearching ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>{researchStatus}</span>
                    </>
                  ) : (
                    <>
                      <Globe className="w-3.5 h-3.5" />
                      <span>Invoke Search Agent</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Editable Profile Information Form */}
            {/* Displayed either in Manual mode, or after LinkedIn Research resolves successfully */}
            {(researchMode === "manual" || isResearched) && (
              <form onSubmit={handleGenerate} className="space-y-3.5 pt-1">
                {isResearched && (
                  <div className="p-2 bg-emerald-50 text-[10px] text-emerald-800 rounded-lg flex items-center space-x-1.5 border border-emerald-200">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Profile successfully resolved. Verify details below.</span>
                  </div>
                )}

                {/* Name */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1">
                    <User className="w-3 h-3 text-[#0284c7]" />
                    <span>Stakeholder Name</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Robert Vance"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={projects.length === 0}
                    className="w-full px-3 py-1.5 text-xs text-slate-800 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0284c7] focus:outline-none placeholder-slate-400"
                    required
                  />
                </div>

                {/* Company */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1">
                    <Building className="w-3 h-3 text-[#0284c7]" />
                    <span>Stakeholder Company</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Acme Corporation"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    disabled={projects.length === 0}
                    className="w-full px-3 py-1.5 text-xs text-slate-800 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0284c7] focus:outline-none placeholder-slate-400"
                  />
                </div>

                {/* Company Email Format matching */}
                <CompanyTemplateSelector
                  matches={companyTemplateMatches}
                  selectedId={selectedCompanyTemplateId}
                  onSelect={setSelectedCompanyTemplateId}
                  genericTemplate={genericCompanyTemplate}
                />

                {/* Designation */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1">
                    <Briefcase className="w-3 h-3 text-[#0284c7]" />
                    <span>Official Designation / Title</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. VP of Inventory & Supply Chain Operations"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    disabled={projects.length === 0}
                    className="w-full px-3 py-1.5 text-xs text-slate-800 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0284c7] focus:outline-none placeholder-slate-400"
                    required
                  />
                </div>

                {/* Area of Focus */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1">
                    <Compass className="w-3 h-3 text-[#0284c7]" />
                    <span>Area of Focus / Strategic Keywords</span>
                  </label>
                  <textarea
                    placeholder="e.g. storage holding overhead, predictive reordering pipelines, warehouse fulfillment lag"
                    value={areaOfFocus}
                    onChange={(e) => setAreaOfFocus(e.target.value)}
                    disabled={projects.length === 0}
                    rows={3}
                    className="w-full px-3 py-1.5 text-xs text-slate-800 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0284c7] focus:outline-none placeholder-slate-400"
                    required
                  />
                </div>

                {/* Company Intelligence (Research Grounding Painpoints) */}
                {researchMode === "linkedin" && companyIntelligence && (
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1">
                      <Globe className="w-3 h-3 text-[#0284c7]" />
                      <span>Company Strategic Intelligence</span>
                    </label>
                    <textarea
                      placeholder="Auto-discovered company-wide issues..."
                      value={companyIntelligence}
                      onChange={(e) => setCompanyIntelligence(e.target.value)}
                      disabled={projects.length === 0}
                      rows={3}
                      className="w-full px-3 py-1.5 text-xs text-slate-800 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0284c7] focus:outline-none placeholder-slate-400"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={projects.length === 0 || isLoading || !name || !designation || !areaOfFocus}
                  className={`w-full py-2 px-4 text-xs font-bold rounded-lg flex items-center justify-center space-x-2 text-white shadow transition-all btn-animate ${
                    (projects.length === 0 || !name || !designation || !areaOfFocus)
                      ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                      : "bg-[#0284c7] hover:bg-[#025a87] active:bg-[#0284c7]"
                  }`}
                  id="btn-generate-blurb"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Synthesizing Blurb...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Generate Blurb</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>

          {/* Dynamic matching card preview */}
          {matched.length > 0 && (
            <div className="bg-slate-100 rounded-xl border border-slate-300 p-4 space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1">
                  <Database className="w-3 h-3" />
                  <span>Matched Case Studies (Top {matched.length})</span>
                </span>
                <span className="text-[9px] text-[#0284c7] font-semibold">Auto-aligning context</span>
              </div>
              <div className="space-y-2.5">
                {matched.map((p, i) => {
                  const isReferenced = referencedIds.includes(p.id);
                  return (
                    <div
                      key={p.id}
                      className={`p-2.5 rounded-lg border shadow-xs text-[11px] transition-all duration-300 ${
                        isReferenced
                          ? "bg-emerald-50/60 border-emerald-300 ring-2 ring-emerald-100/50 shadow-sm"
                          : "bg-white border-slate-200"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-slate-900 line-clamp-1 flex-1 mr-2">{p.deliverableName}</div>
                        <div className="flex items-center space-x-1.5 shrink-0">
                          {p.matchScore !== undefined && (
                            <span className="text-[9px] font-extrabold bg-[#0284c7]/10 text-[#0284c7] px-1.5 py-0.5 rounded-full">
                              {p.matchScore}% RRF
                            </span>
                          )}
                          {isReferenced && (
                            <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full">
                              Grounded
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-slate-500 mt-1 line-clamp-2">
                        {p.problemStatement}
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-[10px]">
                        <span className="text-slate-600 font-semibold">{p.impactType}</span>
                        <span className="font-mono bg-sky-50 text-[#0284c7] px-1.5 py-0.5 rounded border border-sky-100 font-bold">
                          {p.valueImpact}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Output & Feedback Loop */}
        <div className="lg:col-span-7">
          <div className="dark-card rounded-xl overflow-hidden h-full flex flex-col border border-slate-300 min-h-[400px]">
            <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <span className="text-xs font-bold text-[#0a1128] uppercase tracking-wide">Personalized Output Room</span>
              {generatedBlurb && (
                <div className="flex items-center space-x-2 relative">
                  {/* Reference Button */}
                  <button
                    type="button"
                    onClick={() => setShowReferencesPopover(!showReferencesPopover)}
                    className="flex items-center space-x-1 px-3 py-1 text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-all btn-animate"
                  >
                    <Eye className="w-3.5 h-3.5 text-slate-500" />
                    <span>References ({referencedIds.length})</span>
                  </button>

                  {/* References Popover Dropdown */}
                  {showReferencesPopover && (
                    <div className="absolute right-28 top-8 w-72 bg-white border border-slate-200 rounded-lg shadow-lg p-3 z-50 animate-fadeIn text-[11px] text-slate-700 space-y-2 text-left">
                      <div className="font-bold text-slate-800 border-b pb-1 flex items-center justify-between">
                        <span>Grounded Case Studies ({referencedIds.length})</span>
                        <button
                          type="button"
                          onClick={() => setShowReferencesPopover(false)}
                          className="text-slate-400 hover:text-slate-600 font-extrabold text-sm"
                        >
                          &times;
                        </button>
                      </div>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {referencedIds.length === 0 ? (
                          <div className="text-slate-400 italic">No referenced use cases detected.</div>
                        ) : (
                          matched
                            .filter(p => referencedIds.includes(p.id))
                            .map((p, idx) => (
                              <div key={p.id} className="flex items-start space-x-1.5 p-1 hover:bg-slate-50 rounded">
                                <span className="text-emerald-600 font-bold">✓</span>
                                <div>
                                  <div className="font-semibold text-slate-800">{p.deliverableName}</div>
                                  <div className="text-[9px] text-slate-500">{p.impactType} • {p.valueImpact}</div>
                                </div>
                              </div>
                            ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* Copy Button */}
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex items-center space-x-1 px-3 py-1 text-xs font-bold text-white bg-[#0284c7] hover:bg-[#025a87] rounded-lg transition-all btn-animate"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-white" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Blurb</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            <div className="p-5 flex-1 flex flex-col justify-between">
              {/* Main text area / display */}
              <div className="space-y-4">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 font-medium">
                    {error}
                  </div>
                )}

                {generatedBlurb ? (
                  <>
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl whitespace-pre-wrap text-xs text-slate-800 leading-relaxed font-sans max-h-96 overflow-y-auto">
                      {generatedBlurb}
                    </div>

                    {linkedinText && (
                      <div className="border border-sky-200 bg-sky-50/40 rounded-xl overflow-hidden animate-fadeIn">
                        <div className="px-3 py-2 border-b border-sky-200 bg-sky-50 flex items-center justify-between">
                          <div className="flex items-center space-x-1.5">
                            <Linkedin className="w-3.5 h-3.5 text-[#0284c7]" />
                            <span className="text-[10px] font-bold text-[#0a1128] uppercase tracking-wide">LinkedIn DM Version</span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${linkedinText.length > 1000 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                              {linkedinText.length}/1000
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={handleCopyLinkedin}
                            className="flex items-center space-x-1 px-2.5 py-1 text-[10px] font-bold text-white bg-[#0284c7] hover:bg-[#025a87] rounded-lg transition-all btn-animate"
                          >
                            {copiedLinkedin ? (
                              <>
                                <Check className="w-3 h-3" />
                                <span>Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                        <div className="p-3.5 whitespace-pre-wrap text-xs text-slate-800 leading-relaxed font-sans max-h-64 overflow-y-auto">
                          {linkedinText}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400">
                    <Sparkles className="w-8 h-8 mb-2 text-[#0284c7]/20 animate-pulse" />
                    <p className="text-xs font-semibold">No email generated yet.</p>
                    <p className="text-[10px] max-w-xs mt-1 text-slate-500">
                      {researchMode === "linkedin" && !isResearched
                        ? "Enter LinkedIn profile URL and trigger research agent first."
                        : "Input stakeholder information and click Generate Blurb."}
                    </p>
                  </div>
                )}
              </div>

              {/* Feedback Loop form */}
              {generatedBlurb && (
                <div className="mt-6 border-t border-slate-200 pt-5 space-y-4">
                  <div className="flex items-center space-x-1.5 text-xs font-bold text-[#0a1128] uppercase tracking-wider">
                    <History className="w-4 h-4 text-[#0284c7]" />
                    <span>Iterative Feedback Loop</span>
                  </div>

                  {/* Quick Action Preset Buttons */}
                  <div className="space-y-2">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Quick Actions</div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full">
                      {QUICK_FEEDBACKS.map((item, idx) => (
                        <button
                          key={idx}
                          type="button"
                          disabled={isRefining}
                          onClick={() => triggerRefinement(item.text)}
                          className="w-full py-2.5 px-3 text-xs font-bold text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 disabled:bg-slate-100 disabled:text-slate-400 transition-all btn-animate text-center"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <form onSubmit={handleRefine} className="flex flex-col gap-2 pt-1 border-t border-slate-100">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Or Provide Custom Feedback</div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="e.g. 'Make it 30% shorter', 'Focus heavily on the financial ROI', 'Make the CTA softer'"
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        disabled={isRefining}
                        className="flex-1 px-3 py-2 text-xs text-slate-800 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0284c7] focus:outline-none placeholder-slate-400"
                      />
                      <button
                        type="submit"
                        disabled={!feedback.trim() || isRefining}
                        className="px-4 py-2 text-xs font-bold bg-[#0284c7] text-white rounded-lg hover:bg-[#025a87] active:bg-[#0284c7] disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed transition-all shrink-0 flex items-center space-x-1.5 btn-animate"
                      >
                        {isRefining ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        <span>Refine</span>
                      </button>
                    </div>
                  </form>

                  {/* History Logs */}
                  {history.length > 0 && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                      <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Revision History</div>
                      <div className="space-y-1.5 max-h-24 overflow-y-auto">
                        {history.map((hist, i) => (
                          <div key={i} className="flex items-center justify-between text-[11px] p-2 bg-white border border-slate-200 rounded">
                            <span className="text-slate-600 italic truncate max-w-[80%]">
                              &quot;{hist.feedback}&quot;
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRestoreHistory(hist.blurb, hist.linkedinText, hist.referencedProjectIds)}
                              className="text-[9px] font-bold text-[#0284c7] hover:underline"
                            >
                              Restore version
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
