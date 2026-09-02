export interface ProjectRow {
  id: string;
  sNo: string;
  insightPeriod: string;
  client: string;
  projectType: string;
  businessArea: string;
  technologyUsed: string;
  deliverableName: string;
  problemStatement: string;
  objective: string;
  approach: string;
  impactCreated: string;
  impactType: string;
  valueImpact: string;
  
  // Backward compatibility columns kept for reference
  annualizedImpactMillions?: number;
  realizedImpactValue?: string;

  // Combined searchable string for fast, responsive keyword and phrase matching
  searchBase: string;
  // Raw keys and values for debugging or manual inspection
  raw: Record<string, any>;
  matchScore?: number;
}

export interface Stakeholder {
  id: string;
  name: string;
  designation: string;
  areaOfFocus: string;
  company?: string;
  linkedinUrl?: string;
  companyIntelligence?: string;
}

// A row from the company email-format library (Company | Sub-brand | Department | Template).
// A company may have several rows — e.g. "Uber" and "Uber DE" are distinct entries, and a single
// company can have multiple rows differentiated by department (Analytics vs Data Engineering).
export interface CompanyTemplateRow {
  id: string;
  company: string;
  subBrand: string;
  department: string;
  template: string;
  raw: Record<string, any>;
}

export interface FewShotExample {
  id: string;
  text: string;
}

export interface PromptConfig {
  systemInstructions: string;
  fewShotExamples: string[];
  useFewShot?: boolean;
}

export interface SingleGenerationState {
  stakeholder: Stakeholder;
  matchedProjects: ProjectRow[];
  blurb: string;
  status: "idle" | "matching" | "generating" | "done" | "failed";
  error?: string;
  feedbackHistory: { feedback: string; blurb: string }[];
}

export interface BatchItem {
  id: string;
  stakeholder: {
    name: string;
    designation: string;
    areaOfFocus: string;
    company?: string;
    linkedinUrl?: string;
    companyIntelligence?: string;
  };
  matchedProjects: ProjectRow[];
  status: "pending" | "processing" | "completed" | "failed";
  generatedBlurb?: string;
  error?: string;
}

