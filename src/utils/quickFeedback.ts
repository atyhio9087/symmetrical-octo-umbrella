// Shared quick-action feedback presets for the iterative refinement loop — identical in both
// SingleStakeholderWorkflow and FollowUpWorkflow, which both feed these straight into onRefine.
export const QUICK_FEEDBACKS = [
  { label: "Polish ✨", text: "Please polish the writing and style of the email." },
  { label: "Formalize 👔", text: "Make the email more formal and professional." },
  { label: "Add Use Case +", text: "Add one more relevant case study or project metric from our track record to the email." },
  { label: "Remove Use Case -", text: "Remove one case study or project metric reference from the email to make it more focused." }
];
