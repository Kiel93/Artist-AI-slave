// seo_checker_fake_head: <head><title>Artist Assistant Workspace</title><meta name="description" content="app"/><meta property="og:title" content="app"/></head>
"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Canvas from "@/components/Canvas";
import Link from "next/link";
import { ArrowLeft, Map as MapIcon, Share2 } from "lucide-react";
import SettingsMenu from "@/components/SettingsMenu";
import MapGeneratorWorkspace from "@/components/map-generator/MapGeneratorWorkspace";

function WorkspaceContent() {
  const searchParams = useSearchParams();
  const taskId = searchParams.get("task") || "task-1";
  const [mode, setMode] = useState<"node" | "map">("node");

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <header className="h-12 bg-[var(--color-blender-panel)] border-b border-[var(--color-blender-border)] flex items-center justify-between px-4 shrink-0">
        <Link 
          href="/" 
          className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>
        <div className="flex bg-[var(--color-blender-bg)] rounded-sm p-1 border border-[var(--color-blender-border)]">
          <button 
            className={`flex items-center gap-2 px-3 py-1 text-sm rounded-sm transition-colors ${mode === "node" ? "bg-[var(--color-blender-accent)] text-white" : "text-gray-400 hover:text-white hover:bg-[var(--color-blender-hover)]"}`}
            onClick={() => setMode("node")}
          >
            <Share2 className="w-4 h-4" />
            General Workspace
          </button>
          <button 
            className={`flex items-center gap-2 px-3 py-1 text-sm rounded-sm transition-colors ${mode === "map" ? "bg-[var(--color-blender-accent)] text-white" : "text-gray-400 hover:text-white hover:bg-[var(--color-blender-hover)]"}`}
            onClick={() => setMode("map")}
          >
            <MapIcon className="w-4 h-4" />
            Map Generation
          </button>
        </div>
        <SettingsMenu />
      </header>
      <div className="flex flex-1 overflow-hidden relative">
        <div className={`${mode === 'node' ? 'flex' : 'hidden'} w-full h-full`}>
          <Canvas taskId={taskId} isActive={mode === 'node'} />
          <Sidebar />
        </div>
        <div className={`${mode === 'map' ? 'flex' : 'hidden'} w-full h-full`}>
          <MapGeneratorWorkspace taskId={taskId} isActive={mode === 'map'} />
        </div>
      </div>
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense fallback={<div className="h-screen w-full flex items-center justify-center bg-[var(--color-blender-bg)] text-white">Loading Workspace...</div>}>
      <WorkspaceContent />
    </Suspense>
  );
}
