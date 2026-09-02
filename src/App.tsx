import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Database,
  Send,
  Layers,
  Users,
  Sliders,
  Activity,
  HeartHandshake,
  ArrowRight,
  ChevronLeft,
  MailQuestion,
  User,
  Linkedin
} from "lucide-react";
import { ProjectRow, PromptConfig, CompanyTemplateRow, OutreachStakeholderPayload, OutreachResult } from "./types";
import KnowledgeBase from "./components/KnowledgeBase";
import CompanyTemplateLibrary from "./components/CompanyTemplateLibrary";
import SenderIdentityPanel from "./components/SenderIdentityPanel";
import PresetToggle from "./components/PresetToggle";
import { normalizeCompanyTemplateRow } from "./utils/companyTemplateMatching";
import { fetchKnowledgeBase, fetchCompanyTemplatesRows } from "./utils/serverData";
import { SystemInstructionsPanel, FewShotExamplesPanel } from "./components/PromptConfigPanel";
import SingleStakeholderWorkflow from "./components/SingleStakeholderWorkflow";
import BatchWorkflow from "./components/BatchWorkflow";
import FollowUpWorkflow from "./components/FollowUpWorkflow";

// Shared few-shot examples for first-touch outreach, reused across all 4 relationship/familiarity
// presets below — only systemInstructions changes between them to shift the tone (cold vs warm,
// generic vs "we already work with your company"). Keeping the examples themselves identical
// means the LLM always sees the same target format/length, and tone is driven purely by the
// system instructions rather than by which example pair happened to be swapped in.
const OUTREACH_SHARED_EXAMPLES = [
  `Subject: Optimizing Last-Mile Logistics Efficiency for Swift Delivery

Hi Robert,

Given your focus on logistics optimization as Director of Inventory Operations, I wanted to share a brief operational benchmark. Supply chain bottlenecks often stem from demand-forecasting lag, which directly inflates overhead.

Recently, our team partnered with a major global distributor on a 'Dynamic Inventory Allocator' deliverable. We solved their demand lag by building an automated, real-time predictive reordering pipeline. This approach secured a $12M realized client impact value and slashed warehouse storage overhead by 22% within nine months.

I'd love to share the brief, 3-page case study detailing how we integrated these forecasting models. Would you be open to a brief 10-minute introduction next Thursday afternoon?

Best regards,
[Your Name]
[Your Position]`,
  `Subject: Slashed Ad-Fraud Losses by 72% at Retail Checkout

Hi Sarah,

As VP of Digital Growth, navigating fragmented ad spend channels is a perpetual challenge for pipeline accuracy and campaign allocation.

Our analytics team recently resolved a similar measurement bottleneck through our 'Unified Customer Graph' project. By engineering a cookies-less cross-channel attribution algorithm, we moved touchpoint accuracy from 60% to 92%. This approach yielded an annualized client impact of $8M, causing an immediate 15% reduction in customer acquisition cost.

I would love to walk you through a brief visual schema of this framework. Would next Tuesday at 2 PM work for a brief conversation?

Best regards,
[Your Name]
[Your Position]`
];

// Dynamic Outreach Presets mapping relationship & familiarity combinations
const OUTREACH_PRESETS: Record<string, PromptConfig> = {
  "new-unknown": {
    systemInstructions: `You are an expert Sales Strategist at LatentView Analytics. Your goal is to draft a punchy, highly personalized cold outreach email blurb for a new stakeholder who does not know us. We are an analytics service provider solving fuzzy, complex business problems with Data & Math. You must explicitly reference 1 or 2 specific matched projects from our track record, including their real metrics and business outcomes. Focus on establishing credibility, introducing our capabilities, and finishing with a low-friction soft call-to-action (CTA).`,
    fewShotExamples: OUTREACH_SHARED_EXAMPLES
  },
  "new-knows": {
    systemInstructions: `You are an expert Sales Strategist at LatentView Analytics. Your goal is to draft a warm, personalized cold outreach email blurb for a new stakeholder who is familiar with us (e.g. attended a webinar, knows our brand, or has mutual connections). Refer to their existing familiarity or mutual touchpoints naturally. We are an analytics service provider solving fuzzy, complex business problems with Data & Math. Reference 1 or 2 matched projects from our database with concrete metrics. Tone should be warm, collaborative, and professional, concluding with a soft check-in CTA.`,
    fewShotExamples: OUTREACH_SHARED_EXAMPLES
  },
  "existing-unknown": {
    systemInstructions: `You are an expert Client Partner at LatentView Analytics. Your goal is to draft a highly targeted email blurb for a stakeholder who does not know us personally, but works at an existing client organization where we already deliver services. Explicitly mention our existing engagement with their company (referencing their company name) and build trust. We are an analytics service provider solving fuzzy, complex business problems with Data & Math. Link our track record of matched projects and metrics directly to their department's goals to explore cross-functional expansion. Keep the tone collaborative, authoritative, and trusted, ending with a check-in CTA.`,
    fewShotExamples: OUTREACH_SHARED_EXAMPLES
  },
  "existing-knows": {
    systemInstructions: `You are a trusted Client Partner at LatentView Analytics. Your goal is to draft a personalized outreach email blurb for an existing stakeholder who knows us well. We currently partner with them and their team. Reference our ongoing collaboration, thank them for their partnership, and propose exploring new advanced analytics solutions. We solve fuzzy, complex business problems with Data & Math. Reference 1 or 2 matched projects and metrics from our database that align with their next-generation goals. Keep the tone very collaborative, warm, and relationship-driven, proposing a regular check-in CTA.`,
    fewShotExamples: OUTREACH_SHARED_EXAMPLES
  }
};

type StakeholderPayload = OutreachStakeholderPayload;

// Shared POST + error-handling + response-shaping logic for the /api/generate and /api/refine
// proxy calls below, which otherwise differ only in endpoint, request body, and error fallback text.
async function postOutreachEndpoint(
  endpoint: string,
  body: Record<string, unknown>,
  errorFallback: string
): Promise<OutreachResult> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || errorFallback);
  }

  const data = await response.json();
  return {
    text: data.text || "",
    linkedinText: data.linkedinText || "",
    referencedProjectIds: data.referencedProjectIds || []
  };
}

export default function App() {
  // Navigation State: "landing" | "reachout" | "followup"
  const [currentFlow, setCurrentFlow] = useState<"landing" | "reachout" | "followup">("landing");

  // Ingestion Profiling State inside outreach mode
  const [researchMode, setResearchMode] = useState<"manual" | "linkedin">("manual");
  const [workflowMode, setWorkflowMode] = useState<"single" | "batch">("single");

  // In-memory global state for the precomputed project knowledge base (Shared between both modes)
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [knowledgeBaseBuiltAt, setKnowledgeBaseBuiltAt] = useState<string | undefined>(undefined);

  // Optional company-specific email format library (Shared between both modes)
  const [companyTemplates, setCompanyTemplates] = useState<CompanyTemplateRow[]>([]);

  // Auto-load status for the two server-hosted local files (assets/knowledge_base_vectordb.*,
  // assets/company_templates.csv — see build_knowledge_base.py and README.md). Loaded once on
  // mount, not on every generation, to avoid re-fetching repeatedly.
  const [isAutoLoadingProjects, setIsAutoLoadingProjects] = useState(false);
  const [projectsAutoLoadError, setProjectsAutoLoadError] = useState<string | null>(null);
  const [isAutoLoadingCompanyTemplates, setIsAutoLoadingCompanyTemplates] = useState(false);
  const [companyTemplatesAutoLoadError, setCompanyTemplatesAutoLoadError] = useState<string | null>(null);

  const loadKnowledgeBase = () => {
    setIsAutoLoadingProjects(true);
    setProjectsAutoLoadError(null);
    fetchKnowledgeBase()
      .then(({ projects: rows, builtAt }) => {
        setProjects(rows);
        setKnowledgeBaseBuiltAt(builtAt);
      })
      .catch((err: any) => {
        setProjectsAutoLoadError(err.message || "Failed to load the knowledge base.");
      })
      .finally(() => {
        setIsAutoLoadingProjects(false);
      });
  };

  const loadCompanyTemplates = () => {
    setIsAutoLoadingCompanyTemplates(true);
    setCompanyTemplatesAutoLoadError(null);
    fetchCompanyTemplatesRows()
      .then((rows) => {
        const normalized = rows
          .map((row, idx) => normalizeCompanyTemplateRow(row, `srv-${idx}`))
          .filter((row): row is CompanyTemplateRow => row !== null);
        if (normalized.length > 0) setCompanyTemplates(normalized);
      })
      .catch((err: any) => {
        setCompanyTemplatesAutoLoadError(err.message || "Failed to load the company template library.");
      })
      .finally(() => {
        setIsAutoLoadingCompanyTemplates(false);
      });
  };

  useEffect(() => {
    loadKnowledgeBase();
    loadCompanyTemplates();
  }, []);

  // Sender identity, used to fill [Your Name] / [Your Position] in generated sign-offs — shared
  // across Single, Batch, and Follow-Up modes so it only needs to be entered once per session.
  const [senderName, setSenderName] = useState("");
  const [senderPosition, setSenderPosition] = useState("");

  // Toggles for relationship and familiarity presets inside outreach mode
  const [relationship, setRelationship] = useState<"new" | "existing">("new");
  const [familiarity, setFamiliarity] = useState<"unknown" | "knows">("unknown");

  // System and few-shot prompt state initialized with cold outreach to new client
  const [promptConfig, setPromptConfig] = useState<PromptConfig>(OUTREACH_PRESETS["new-unknown"]);

  // Handler for dynamic preset switches in outreach mode
  const handleTogglePreset = (rel: "new" | "existing", fam: "unknown" | "knows") => {
    setRelationship(rel);
    setFamiliarity(fam);
    const key = `${rel}-${fam}`;
    setPromptConfig(OUTREACH_PRESETS[key]);
  };

  // Server proxy handler for content generation
  const handleGenerateOutreach = async (
    stakeholder: StakeholderPayload,
    matchedProjects: ProjectRow[],
    customSystemInstructions?: string,
    customFewShotExamples?: string[]
  ): Promise<OutreachResult> => {
    return postOutreachEndpoint(
      "/api/generate",
      {
        stakeholder,
        projects: matchedProjects,
        systemInstructions: customSystemInstructions || promptConfig.systemInstructions,
        fewShotExamples: customFewShotExamples || promptConfig.fewShotExamples,
        useFewShot: promptConfig.useFewShot !== false,
      },
      "Generation endpoint returned an error."
    );
  };

  // Server proxy handler for blurb refinement
  const handleRefineOutreach = async (
    stakeholder: StakeholderPayload,
    originalBlurb: string,
    feedback: string,
    matchedProjects: ProjectRow[],
    customSystemInstructions?: string,
    customFewShotExamples?: string[]
  ): Promise<OutreachResult> => {
    return postOutreachEndpoint(
      "/api/refine",
      {
        stakeholder,
        originalBlurb,
        feedback,
        projects: matchedProjects,
        systemInstructions: customSystemInstructions || promptConfig.systemInstructions,
        fewShotExamples: customFewShotExamples || promptConfig.fewShotExamples,
        useFewShot: promptConfig.useFewShot !== false,
      },
      "Refinement endpoint returned an error."
    );
  };

  const handleClearCompanyTemplates = () => {
    setCompanyTemplates([]);
  };

  const handleResetDefaults = () => {
    const key = `${relationship}-${familiarity}`;
    setPromptConfig(OUTREACH_PRESETS[key]);
  };

  return (
    <div className="min-h-screen light-cyan-bg text-[#1e293b] flex flex-col font-sans antialiased" id="outreach-root">
      
      {/* Upper Navigation and Header (Solid Navy Theme) */}
      <header className="bg-[#0b1329] border-b border-[#1d2d54] sticky top-0 z-40 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {currentFlow !== "landing" && (
              <button
                onClick={() => setCurrentFlow("landing")}
                className="flex items-center space-x-1 px-2.5 py-1.5 text-xs font-bold text-slate-300 hover:text-white bg-[#121b33] border border-[#1d2d54] rounded-lg transition-all btn-animate shrink-0"
                id="btn-back-hub"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Back to Hub</span>
              </button>
            )}
            <div className="p-1 bg-white rounded-lg flex items-center justify-center border border-[#38bdf8]/20">
              <img 
                src="https://dist.neo4j.com/wp-content/uploads/20220920084935/LatentView-Analytics-Logo_Transparent-Background-2048x1448.png" 
                alt="LatentView Logo" 
                className="h-8 md:h-10 w-auto object-contain"
              />
            </div>
            <div>
              <h1 className="text-base md:text-lg font-bold text-white tracking-tight flex items-center gap-1.5">
                LatentView OutreachIQ
              </h1>
              <p className="text-[10px] text-brand-sky font-semibold uppercase tracking-wider">
                {currentFlow === "followup" ? "Client Follow-Up Module" : "Outreach Blurb Suite"}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3 text-xs font-semibold text-brand-sky bg-[#121b33] px-3 py-1.5 rounded-lg border border-[#1d2d54]">
            <Activity className="w-4 h-4 text-[#00f0ff] animate-pulse" />
            <span className="hidden sm:inline">Similarity Matching Engine Online</span>
            <span className="sm:hidden">Engine Active</span>
          </div>
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {/* LANDING PAGE / MAIN HUB SELECTOR */}
        {currentFlow === "landing" && (
          <div className="py-8 space-y-8 animate-fadeIn">
            <div className="text-center max-w-2xl mx-auto space-y-3">
              <h2 className="text-2xl font-extrabold text-[#0a1128] tracking-tight sm:text-3xl">
                LatentView OutreachIQ Hub
              </h2>
              <p className="text-sm sm:text-base text-slate-600">
                Select a client engagement workflow execution room below to begin crafting highly-personalized, metrics-backed outbound email communications.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto pt-4">
              {/* Option 1: New Outreach */}
              <div className="bg-white border border-slate-300 rounded-2xl p-6 shadow-md flex flex-col justify-between hover:shadow-lg transition-all border-t-4 border-t-[#0284c7]">
                <div className="space-y-4">
                  <div className="p-3 bg-sky-50 rounded-xl text-[#0284c7] w-fit border border-sky-100 shadow-sm">
                    <Sparkles className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[#0a1128]">New Outreach Campaign</h3>
                    <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                      Initiate personalized first contact by matching stakeholder strategic focus areas against our solved project database of over 50+ case studies. Automatically embeds verified ROI metrics.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setCurrentFlow("reachout")}
                  className="mt-8 w-full py-3 bg-[#0284c7] hover:bg-[#025a87] text-white font-bold rounded-xl shadow-sm transition-all btn-animate flex items-center justify-center space-x-2"
                >
                  <span>Enter Outreach Workspace</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* Option 2: Client Follow-Up */}
              <div className="bg-white border border-slate-300 rounded-2xl p-6 shadow-md flex flex-col justify-between hover:shadow-lg transition-all border-t-4 border-t-[#034078]">
                <div className="space-y-4">
                  <div className="p-3 bg-sky-50 rounded-xl text-[#034078] w-fit border border-sky-100 shadow-sm">
                    <MailQuestion className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[#0a1128]">Client Follow-Up Module</h3>
                    <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                      Nurture existing threads by drafting highly relevant follow-up emails based on previously sent email communication history. Integrates specialized follow-up preset templates.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setCurrentFlow("followup")}
                  className="mt-8 w-full py-3 bg-[#034078] hover:bg-[#012a52] text-white font-bold rounded-xl shadow-sm transition-all btn-animate flex items-center justify-center space-x-2"
                >
                  <span>Enter Follow-Up Workspace</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* WORKFLOW VIEW: NEW REACHOUT */}
        {currentFlow === "reachout" && (
          <div className="space-y-6 animate-fadeIn">
            {/* SECTION 1: INGESTION & KNOWLEDGE SETUP */}
            <section className="space-y-4">
              <div className="space-y-4">
                {/* Knowledge database control */}
                <div className="w-full">
                  <KnowledgeBase
                    projects={projects}
                    isLoading={isAutoLoadingProjects}
                    loadError={projectsAutoLoadError}
                    builtAt={knowledgeBaseBuiltAt}
                    onReload={loadKnowledgeBase}
                  />
                </div>

                {/* Optional company-specific email format library */}
                <div className="w-full">
                  <CompanyTemplateLibrary
                    templates={companyTemplates}
                    onTemplatesLoaded={setCompanyTemplates}
                    onClear={handleClearCompanyTemplates}
                    isAutoLoading={isAutoLoadingCompanyTemplates}
                    autoLoadError={companyTemplatesAutoLoadError}
                  />
                </div>

                {/* Sender sign-off identity */}
                <SenderIdentityPanel
                  senderName={senderName}
                  senderPosition={senderPosition}
                  onSenderNameChange={setSenderName}
                  onSenderPositionChange={setSenderPosition}
                />

                {/* Preset selection context toggles */}
                <div className="dark-card p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4 border border-slate-300">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-slate-100 rounded-lg text-[#0284c7] border border-slate-200 shadow-inner">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-[#0a1128] uppercase tracking-wider">Outreach Context Presets</h3>
                      <p className="text-[11px] text-slate-500">Auto-align prompts and few-shot instances depending on client relationship parameters</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <PresetToggle relationship={relationship} familiarity={familiarity} onToggle={handleTogglePreset} />
                  </div>
                </div>

                {/* Prompt config split row */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <div className="lg:col-span-5">
                    <SystemInstructionsPanel 
                      config={promptConfig} 
                      onChange={setPromptConfig}
                      onReset={handleResetDefaults}
                    />
                  </div>
                  <div className="lg:col-span-7">
                    <FewShotExamplesPanel 
                      config={promptConfig} 
                      onChange={setPromptConfig}
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* GLOBAL MASTER SELECTOR: Redesigned Segmented iPadOS Pill Toggle */}
            <div className="flex justify-center my-4">
              <div className="inline-flex p-1 bg-slate-100/90 rounded-full border border-slate-200/80 shadow-inner w-full max-w-[480px]">
                <button
                  type="button"
                  onClick={() => setResearchMode("manual")}
                  className={`flex-1 flex items-center justify-center space-x-1.5 px-6 py-2 text-xs font-bold rounded-full transition-all duration-300 btn-animate ${
                    researchMode === "manual"
                      ? "bg-white text-[#0284c7] shadow-sm font-extrabold border border-slate-200/40"
                      : "text-slate-500 hover:text-slate-800 font-semibold"
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Manual Profiling Mode</span>
                </button>
                <button
                  type="button"
                  onClick={() => setResearchMode("linkedin")}
                  className={`flex-1 flex items-center justify-center space-x-1.5 px-6 py-2 text-xs font-bold rounded-full transition-all duration-300 btn-animate ${
                    researchMode === "linkedin"
                      ? "bg-white text-[#0284c7] shadow-sm font-extrabold border border-slate-200/40"
                      : "text-slate-500 hover:text-slate-800 font-semibold"
                  }`}
                >
                  <Linkedin className="w-3.5 h-3.5" />
                  <span>LinkedIn Research Agent</span>
                </button>
              </div>
            </div>

            {/* SECTION 2: WORKFLOW RUNS */}
            <section className="space-y-4" id="workflows-section">
              <div className="flex items-center space-x-2 border-b border-slate-300 pb-1.5">
                <Users className="w-4 h-4 text-[#034078]" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#0a1128]">
                  Operational Workflow Execution Rooms
                </h2>
              </div>

              <div className="space-y-4">
                <div className="flex border-b border-slate-300 justify-center" id="tabs-navigation">
                  <button
                    type="button"
                    onClick={() => setWorkflowMode("single")}
                    className={`pb-3 px-6 text-xs font-bold border-b-2 transition-all flex items-center space-x-2 ${
                      workflowMode === "single"
                        ? "border-[#0284c7] text-[#0284c7] font-extrabold"
                        : "border-transparent text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Single Stakeholder Mode</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setWorkflowMode("batch")}
                    className={`pb-3 px-6 text-xs font-bold border-b-2 transition-all flex items-center space-x-2 ${
                      workflowMode === "batch"
                        ? "border-[#0284c7] text-[#0284c7] font-extrabold"
                        : "border-transparent text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Batch Ingestion Mode</span>
                  </button>
                </div>

                <div className="bg-slate-200/30 rounded-2xl p-6 border border-slate-300/40">
                  {workflowMode === "single" ? (
                    <SingleStakeholderWorkflow
                      projects={projects}
                      companyTemplates={companyTemplates}
                      config={promptConfig}
                      senderName={senderName}
                      senderPosition={senderPosition}
                      onGenerate={handleGenerateOutreach}
                      onRefine={handleRefineOutreach}
                      researchMode={researchMode}
                    />
                  ) : (
                    <BatchWorkflow
                      projects={projects}
                      companyTemplates={companyTemplates}
                      systemInstructions={promptConfig.systemInstructions}
                      fewShotExamples={promptConfig.fewShotExamples}
                      senderName={senderName}
                      senderPosition={senderPosition}
                      onGenerateSingleRow={async (row, matched) => {
                        const res = await handleGenerateOutreach(row, matched);
                        return { text: res.text, linkedinText: res.linkedinText };
                      }}
                      researchMode={researchMode}
                    />
                  )}
                </div>
              </div>
            </section>
          </div>
        )}

        {/* WORKFLOW VIEW: CLIENT FOLLOW-UP */}
        {currentFlow === "followup" && (
          <div className="space-y-6 animate-fadeIn">
            {/* Step 0: Base database control shared */}
            <section className="space-y-4">
              <div className="flex items-center space-x-2 border-b border-slate-300 pb-1.5">
                <Database className="w-4 h-4 text-[#034078]" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#0a1128]">
                  Case Studies Knowledge Repository Base
                </h2>
              </div>
              <div className="w-full">
                <KnowledgeBase
                  projects={projects}
                  isLoading={isAutoLoadingProjects}
                  loadError={projectsAutoLoadError}
                  builtAt={knowledgeBaseBuiltAt}
                  onReload={loadKnowledgeBase}
                />
              </div>
              <div className="w-full">
                <CompanyTemplateLibrary
                  templates={companyTemplates}
                  onTemplatesLoaded={setCompanyTemplates}
                  onClear={handleClearCompanyTemplates}
                  isAutoLoading={isAutoLoadingCompanyTemplates}
                  autoLoadError={companyTemplatesAutoLoadError}
                />
              </div>
              <SenderIdentityPanel
                senderName={senderName}
                senderPosition={senderPosition}
                onSenderNameChange={setSenderName}
                onSenderPositionChange={setSenderPosition}
              />
            </section>

            <FollowUpWorkflow
              projects={projects}
              companyTemplates={companyTemplates}
              senderName={senderName}
              senderPosition={senderPosition}
              onGenerate={async (sh, mp, sys, fs) => {
                return await handleGenerateOutreach(sh, mp, sys, fs);
              }}
              onRefine={async (sh, orig, feed, mp, sys, fs) => {
                return await handleRefineOutreach(sh, orig, feed, mp, sys, fs);
              }}
            />
          </div>
        )}

      </main>

      {/* Footer (LatentView branded) */}
      <footer className="bg-[#0b1329] border-t border-[#1d2d54] py-4 mt-8 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-1">
            <HeartHandshake className="w-3.5 h-3.5 text-[#0ea5e9]" />
            <span>Built with precision for LatentView Analytics Leaders</span>
          </div>
          <span>&copy; {new Date().getFullYear()} LatentView Analytics. Powered by Gemini Flash 3.5.</span>
        </div>
      </footer>
    </div>
  );
}
