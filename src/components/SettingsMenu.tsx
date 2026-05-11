"use client";

import { useState, useEffect } from "react";
import { Settings, X } from "lucide-react";

export default function SettingsMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    setApiKey(localStorage.getItem("artist-assistant-image-api") || "");
  }, []);

  const saveApiKey = (value: string) => {
    setApiKey(value);
    localStorage.setItem("artist-assistant-image-api", value);
  };

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 bg-[var(--color-blender-panel)] hover:bg-[var(--color-blender-accent)] text-gray-300 hover:text-white rounded-md transition-colors border border-[var(--color-blender-border)]"
      >
        <Settings className="w-5 h-5" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-[var(--color-blender-panel)] border border-[var(--color-blender-border)] rounded-md shadow-2xl z-50 overflow-hidden">
          <div className="flex justify-between items-center p-3 border-b border-[var(--color-blender-border)] bg-[var(--color-blender-node-header)]">
            <h3 className="font-semibold text-white">Settings</h3>
            <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                PlenxAI API Key
              </label>
              <input 
                type="password" 
                value={apiKey}
                onChange={(e) => saveApiKey(e.target.value)}
                placeholder="Enter PlenxAI API Key..."
                className="w-full bg-[var(--color-blender-input)] text-white text-sm border border-[var(--color-blender-border)] rounded p-2 focus:outline-none focus:border-[var(--color-blender-accent)]"
              />
              <p className="text-xs text-gray-500 mt-1">Required for generating images and refining prompts.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
