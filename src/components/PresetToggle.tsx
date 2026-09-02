import React from "react";

interface ToggleButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function ToggleButton({ active, onClick, children }: ToggleButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all btn-animate ${
        active ? "bg-[#0284c7] text-white font-extrabold" : "text-slate-600 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

interface PresetToggleProps {
  relationship: "new" | "existing";
  familiarity: "unknown" | "knows";
  onToggle: (relationship: "new" | "existing", familiarity: "unknown" | "knows") => void;
}

// Shared "Client Relation" / "Familiarity" preset toggle pair, used by both the New Outreach
// (App.tsx) and Client Follow-Up (FollowUpWorkflow.tsx) prompt-preset panels.
export default function PresetToggle({ relationship, familiarity, onToggle }: PresetToggleProps) {
  return (
    <>
      <div className="flex items-center space-x-2">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Client Relation:</span>
        <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200">
          <ToggleButton active={relationship === "new"} onClick={() => onToggle("new", familiarity)}>
            New Client
          </ToggleButton>
          <ToggleButton active={relationship === "existing"} onClick={() => onToggle("existing", familiarity)}>
            Existing Client
          </ToggleButton>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Familiarity:</span>
        <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200">
          <ToggleButton active={familiarity === "unknown"} onClick={() => onToggle(relationship, "unknown")}>
            Cold (New Lead)
          </ToggleButton>
          <ToggleButton active={familiarity === "knows"} onClick={() => onToggle(relationship, "knows")}>
            Warm (Knows Us)
          </ToggleButton>
        </div>
      </div>
    </>
  );
}
