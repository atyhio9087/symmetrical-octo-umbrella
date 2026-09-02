import { ProjectRow } from "../types";

// Common stop words to ignore during matching to focus on high-value terms
const STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "arent",
  "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", "by",
  "can", "cant", "cannot", "could", "couldnt", "did", "didnt", "do", "does", "doesnt", "doing",
  "dont", "down", "during", "each", "few", "for", "from", "further", "had", "hadnt", "has", "hasnt",
  "have", "havent", "having", "he", "hed", "hell", "hes", "her", "here", "heres", "hers", "herself",
  "him", "himself", "his", "how", "hows", "i", "id", "ill", "im", "ive", "if", "in", "into", "is",
  "isnt", "it", "its", "itself", "lets", "me", "more", "most", "mustnt", "my", "myself", "no", "nor",
  "not", "of", "off", "on", "once", "only", "or", "other", "ought", "our", "ours", "ourselves",
  "out", "over", "own", "same", "shant", "she", "shed", "shell", "shes", "should", "shouldnt", "so",
  "some", "such", "than", "that", "thats", "the", "their", "theirs", "them", "themselves", "then",
  "there", "theres", "these", "they", "theyd", "theyll", "theyre", "theyve", "this", "those",
  "through", "to", "too", "under", "until", "up", "very", "was", "wasnt", "we", "wed", "well",
  "were", "weve", "werent", "what", "whats", "when", "whens", "where", "wheres", "which", "while",
  "who", "whos", "whom", "why", "whys", "with", "wont", "would", "wouldnt", "you", "youd", "youll",
  "youre", "youve", "your", "yours", "yourself", "yourselves"
]);

/**
 * Tokenizes a string: low-cases, removes punctuation, filters out stop words.
 */
function tokenize(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter(word => word.length > 1 && !STOP_WORDS.has(word));
}

/**
 * Ranks project rows based on their similarity to a stakeholder's designation and area of focus.
 * Returns the top 3 (or specified count) matching project rows.
 */
export function matchProjects(
  projects: ProjectRow[],
  designation: string,
  areaOfFocus: string,
  companyIntelligence?: string,
  topK = 3
): ProjectRow[] {
  if (projects.length === 0) return [];

  const focusContext = areaOfFocus + (companyIntelligence ? " " + companyIntelligence : "");
  const focusTokens = tokenize(focusContext);
  const titleTokens = tokenize(designation);

  // If both inputs are empty, return the first few projects as a default fallback
  if (focusTokens.length === 0 && titleTokens.length === 0) {
    return projects.slice(0, topK);
  }

  const scored = projects.map(project => {
    let score = 0;

    // Weight fields in the project database differently based on semantic importance
    const fieldsToMatch = [
      { text: project.deliverableName, weight: 2.5 },
      { text: project.businessArea, weight: 2.2 },
      { text: project.objective, weight: 2.0 },
      { text: project.problemStatement, weight: 1.8 },
      { text: project.approach, weight: 1.5 },
      { text: project.technologyUsed, weight: 1.3 },
      { text: project.impactCreated, weight: 1.2 },
      { text: project.projectType, weight: 1.0 },
      { text: project.impactType, weight: 1.0 },
    ];

    // Tokenize each project field and look for token overlaps
    fieldsToMatch.forEach(({ text, weight }) => {
      if (!text) return;
      const fieldTokens = tokenize(text);
      if (fieldTokens.length === 0) return;

      const fieldTokenSet = new Set(fieldTokens);

      // Match Area of Focus tokens (high weight)
      focusTokens.forEach(focusToken => {
        // Direct match
        if (fieldTokenSet.has(focusToken)) {
          score += weight * 3.0;
        } else {
          // Substring/partial match (e.g. "analytic" matches "analytics")
          for (const ft of fieldTokens) {
            if (ft.includes(focusToken) || focusToken.includes(ft)) {
              score += weight * 1.5;
              break;
            }
          }
        }
      });

      // Match Designation/Title tokens (medium weight)
      titleTokens.forEach(titleToken => {
        if (fieldTokenSet.has(titleToken)) {
          score += weight * 1.5;
        } else {
          for (const ft of fieldTokens) {
            if (ft.includes(titleToken) || titleToken.includes(ft)) {
              score += weight * 0.8;
              break;
            }
          }
        }
      });
    });

    return { project, score };
  });

  // Sort descending by similarity score
  scored.sort((a, b) => b.score - a.score);

  // If the top scored element has 0 score, fallback to returning the first topK projects
  if (scored[0].score === 0) {
    return projects.slice(0, topK).map((p, idx) => ({ ...p, matchScore: 70 - idx }));
  }

  const maxScore = scored[0].score || 1;
  return scored.slice(0, topK).map(item => ({
    ...item.project,
    matchScore: Math.round((item.score / maxScore) * 100)
  }));
}

export async function matchProjectsAsync(
  projects: ProjectRow[],
  designation: string,
  areaOfFocus: string,
  company: string,
  companyIntelligence?: string,
  topK = 5
): Promise<ProjectRow[]> {
  if (projects.length === 0) return [];
  try {
    const response = await fetch("/api/match-projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projects,
        designation,
        areaOfFocus,
        company,
        companyIntelligence,
        topK
      })
    });
    if (!response.ok) {
      throw new Error("HTTP error " + response.status);
    }
    const data = await response.json();
    return data.matches || [];
  } catch (err) {
    console.warn("RAG hybrid matching failed on server, falling back to local client-side token search:", err);
    return matchProjects(projects, designation, areaOfFocus, companyIntelligence, topK);
  }
}

