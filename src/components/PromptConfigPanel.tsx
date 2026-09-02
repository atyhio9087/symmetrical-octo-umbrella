import React, { useState } from "react";
import { Sliders, HelpCircle, RefreshCw, Layers, X } from "lucide-react";
import { PromptConfig } from "../types";

interface SystemInstructionsPanelProps {
  config: PromptConfig;
  onChange: (newConfig: PromptConfig) => void;
  onReset: () => void;
}

interface FewShotExamplesPanelProps {
  config: PromptConfig;
  onChange: (newConfig: PromptConfig) => void;
}

export function SystemInstructionsPanel({ config, onChange, onReset }: SystemInstructionsPanelProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleInstructionsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange({
      ...config,
      systemInstructions: e.target.value,
    });
  };

  return (
    <div className="dark-card rounded-xl overflow-hidden h-full flex flex-col border border-slate-300 bg-white" id="prompt-config-panel">
      <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-sky-50 rounded-lg text-[#0284c7]">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-[#0a1128] uppercase tracking-wider">Prompt &amp; Context Configuration</h2>
            <p className="text-[10px] text-slate-500">Fine-tune instructions sent to Gemini</p>
          </div>
        </div>
        <button
          onClick={onReset}
          className="flex items-center space-x-1 px-2.5 py-1 text-[10px] font-bold text-sky-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 hover:text-sky-800 transition-all btn-animate"
          id="btn-reset-defaults"
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
                className="text-slate-400 hover:text-[#0284c7] transition-colors"
                title="What is this?"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </button>
            </label>
          </div>

          {showTooltip && (
            <div className="p-2.5 bg-sky-50 border border-sky-200 rounded-lg text-[10px] text-slate-700 leading-normal animate-fadeIn">
              <strong>System Instructions</strong> shape Gemini's role, constraints, tone, and formatting.
            </div>
          )}

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] text-slate-600 font-mono h-[80px] overflow-hidden relative">
            <div className="line-clamp-3 leading-relaxed whitespace-pre-wrap">{config.systemInstructions}</div>
            <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-slate-50 to-transparent pointer-events-none"></div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="w-full py-2 bg-[#0284c7]/10 hover:bg-[#0284c7]/20 text-[#0284c7] text-xs font-bold rounded-lg transition-all btn-animate flex items-center justify-center space-x-1.5 mt-1"
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Edit System Instructions</span>
        </button>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4 animate-fadeIn">
          <div 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setIsModalOpen(false)}
          />
          <div className="bg-white rounded-xl border border-slate-300 shadow-xl w-full max-w-2xl overflow-hidden relative z-10 flex flex-col max-h-[80vh]">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-[#0284c7]" />
                <h4 className="text-xs font-bold text-[#0a1128] uppercase tracking-wider">Configure System Instructions</h4>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 btn-animate"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto flex-grow flex flex-col space-y-3">
              <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider">Global System Instructions</label>
              <textarea
                value={config.systemInstructions}
                onChange={handleInstructionsChange}
                className="w-full px-3 py-2 text-xs text-slate-800 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0284c7] focus:outline-none placeholder-slate-400 font-mono leading-relaxed resize-none flex-grow min-h-[300px]"
                placeholder="Provide system directives to shape the AI's writing style..."
              />
            </div>
            
            <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-[#0284c7] hover:bg-[#025a87] text-white text-xs font-bold rounded-lg shadow-sm transition-all btn-animate"
              >
                Save &amp; Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function FewShotExamplesPanel({ config, onChange }: FewShotExamplesPanelProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showTooltip1, setShowTooltip1] = useState(false);
  const [showTooltip2, setShowTooltip2] = useState(false);

  const handleFewShotChange = (index: number, value: string) => {
    const updated = [...config.fewShotExamples];
    updated[index] = value;
    onChange({
      ...config,
      fewShotExamples: updated,
    });
  };

  return (
    <div className="dark-card rounded-xl overflow-hidden h-full flex flex-col border border-slate-300 bg-white" id="few-shot-panel">
      <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-sky-50 rounded-lg text-[#0284c7]">
            <Layers className="w-4 h-4 text-[#0284c7]" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-[#0a1128] uppercase tracking-wider">Few-Shot Reference Examples</h2>
            <p className="text-[10px] text-slate-500">Providing 2 complete examples guides the LLM to mirror exact formats, lengths, and layout structures.</p>
          </div>
        </div>

        {/* Toggle Switch */}
        <label className="relative inline-flex items-center cursor-pointer select-none shrink-0 ml-4">
          <input 
            type="checkbox" 
            checked={config.useFewShot !== false} 
            onChange={(e) => onChange({ ...config, useFewShot: e.target.checked })}
            className="sr-only peer"
          />
          <div className="w-8 h-4.5 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-[#0284c7] relative"></div>
          <span className="ml-2 text-[9px] font-bold text-slate-500 uppercase tracking-wider">
            {config.useFewShot !== false ? "Use Examples" : "Skip Examples"}
          </span>
        </label>
      </div>

      <div className={`p-4 space-y-3.5 flex-grow flex flex-col justify-between bg-white transition-opacity duration-300 ${config.useFewShot === false ? "opacity-40" : ""}`}>
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
              <div className="line-clamp-2 leading-relaxed whitespace-pre-wrap">{config.fewShotExamples[0] || "No example provided."}</div>
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
              <div className="line-clamp-2 leading-relaxed whitespace-pre-wrap">{config.fewShotExamples[1] || "No example provided."}</div>
              <div className="absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-slate-50 to-transparent pointer-events-none"></div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="w-full py-2 bg-[#0284c7]/10 hover:bg-[#0284c7]/20 text-[#0284c7] text-xs font-bold rounded-lg transition-all btn-animate flex items-center justify-center space-x-1.5 mt-1"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Edit Few-Shot Examples</span>
        </button>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4 animate-fadeIn">
          <div 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setIsModalOpen(false)}
          />
          <div className="bg-white rounded-xl border border-slate-300 shadow-xl w-full max-w-4xl overflow-hidden relative z-10 flex flex-col max-h-[85vh]">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-[#0284c7]" />
                <h4 className="text-xs font-bold text-[#0a1128] uppercase tracking-wider">Configure Few-Shot Examples</h4>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 btn-animate"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto flex-grow grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 flex flex-col">
                <textarea
                  value={config.fewShotExamples[0] || ""}
                  onChange={(e) => handleFewShotChange(0, e.target.value)}
                  className="w-full px-3 py-2 text-xs text-slate-800 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0284c7] focus:outline-none placeholder-slate-400 font-mono leading-relaxed resize-none flex-grow min-h-[300px]"
                  placeholder="Enter sample blurb #1..."
                />
              </div>
              <div className="space-y-2 flex flex-col">
                <textarea
                  value={config.fewShotExamples[1] || ""}
                  onChange={(e) => handleFewShotChange(1, e.target.value)}
                  className="w-full px-3 py-2 text-xs text-slate-800 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0284c7] focus:outline-none placeholder-slate-400 font-mono leading-relaxed resize-none flex-grow min-h-[300px]"
                  placeholder="Enter sample blurb #2..."
                />
              </div>
            </div>
            
            <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-[#0284c7] hover:bg-[#025a87] text-white text-xs font-bold rounded-lg shadow-sm transition-all btn-animate"
              >
                Save &amp; Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
