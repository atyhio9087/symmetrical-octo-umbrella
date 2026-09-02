import React from "react";
import { UserCircle } from "lucide-react";

interface SenderIdentityPanelProps {
  senderName: string;
  senderPosition: string;
  onSenderNameChange: (value: string) => void;
  onSenderPositionChange: (value: string) => void;
}

// Fills the sign-off of generated emails ("[Your Name]" / "[Your Position]"). Left blank, the
// server substitutes nothing and leaves those literal placeholders in the output for the real
// sender to fill in by hand — see applySenderPlaceholders() in server.ts.
export default function SenderIdentityPanel({
  senderName,
  senderPosition,
  onSenderNameChange,
  onSenderPositionChange
}: SenderIdentityPanelProps) {
  return (
    <div className="dark-card p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4 border border-slate-300 bg-white">
      <div className="flex items-center space-x-3 shrink-0">
        <div className="p-2 bg-slate-100 rounded-lg text-[#0284c7] border border-slate-200 shadow-inner">
          <UserCircle className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-xs font-bold text-[#0a1128] uppercase tracking-wider">Sender Sign-Off</h3>
          <p className="text-[11px] text-slate-500">Fills [Your Name] / [Your Position] — left blank, the placeholders are kept as-is</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
        <input
          type="text"
          placeholder="Your Name (optional)"
          value={senderName}
          onChange={(e) => onSenderNameChange(e.target.value)}
          className="flex-1 min-w-[160px] px-3 py-1.5 text-xs text-slate-800 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0284c7] focus:outline-none placeholder-slate-400"
        />
        <input
          type="text"
          placeholder="Your Position (optional)"
          value={senderPosition}
          onChange={(e) => onSenderPositionChange(e.target.value)}
          className="flex-1 min-w-[160px] px-3 py-1.5 text-xs text-slate-800 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0284c7] focus:outline-none placeholder-slate-400"
        />
      </div>
    </div>
  );
}
