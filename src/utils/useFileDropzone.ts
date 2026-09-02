import React, { useRef, useState } from "react";

/**
 * Shared drag-and-drop + click-to-browse file input wiring for the batch upload dropzones
 * (BatchWorkflow, FollowUpWorkflow's batch mode) — both fed a single file into their own
 * per-workflow parser via an identical set of drag/drop/change handlers.
 */
export function useFileDropzone(onFile: (file: File) => void) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFile(e.target.files[0]);
    }
  };

  return { fileInputRef, dragActive, handleDrag, handleDrop, handleFileChange };
}
