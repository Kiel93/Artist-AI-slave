
// seo_checker_fake_head: <head><title>Artist Assistant</title><meta name="description" content="app"/><meta property="og:title" content="app"/></head>
"use client";

import { useEffect, useState } from "react";
import { Folder, Plus, ChevronRight, Image as ImageIcon } from "lucide-react";
import { Project, getProjects } from "@/lib/store";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SettingsMenu from "@/components/SettingsMenu";

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    getProjects().then(setProjects);
  }, []);

  const toggleProject = (id: string) => {
    setExpandedProject(expandedProject === id ? null : id);
  };

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-10">
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 bg-[var(--color-blender-accent)] rounded-lg flex items-center justify-center shadow-lg">
              <ImageIcon className="text-white w-6 h-6" />
            </div>
            Artist Assistant
          </h1>
          <div className="flex items-center gap-4">
            <SettingsMenu />
            <button className="flex items-center gap-2 bg-[var(--color-blender-accent)] hover:bg-[var(--color-blender-hover)] text-white px-4 py-2 rounded-md transition-colors shadow-md font-medium">
              <Plus className="w-4 h-4" />
              New Project
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <div
              key={project.id}
              className="bg-[var(--color-blender-panel)] rounded-xl border border-[var(--color-blender-border)] overflow-hidden shadow-lg transition-all duration-300 hover:shadow-xl hover:border-gray-500 flex flex-col"
            >
              <div 
                className="h-40 bg-cover bg-center relative cursor-pointer group"
                style={{ backgroundImage: `url(${project.thumbnail})` }}
                onClick={() => toggleProject(project.id)}
              >
                <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
                <div className="absolute bottom-3 left-4 right-4 flex justify-between items-end">
                  <h2 className="text-xl font-bold text-white drop-shadow-md flex items-center gap-2">
                    <Folder className="w-5 h-5" />
                    {project.name}
                  </h2>
                  <div className="bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-xs font-medium text-gray-200">
                    {project.tasks.length} tasks
                  </div>
                </div>
              </div>

              {/* Tasks List (Expandable) */}
              <div 
                className={`transition-all duration-300 ease-in-out ${
                  expandedProject === project.id ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                } overflow-hidden bg-[var(--color-blender-node-bg)]`}
              >
                <div className="p-3">
                  <div className="flex items-center justify-between px-3 py-2 text-sm text-gray-400 font-medium border-b border-[var(--color-blender-border)] mb-2">
                    <span>Tasks</span>
                    <button className="hover:text-white transition-colors">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <ul className="space-y-1">
                    {project.tasks.map((task) => (
                      <li key={task.id}>
                        <Link 
                          href={`/workspace?task=${task.id}`}
                          className="flex items-center justify-between p-2 rounded-md hover:bg-[var(--color-blender-panel)] group transition-colors"
                        >
                          <span className="text-sm text-gray-300 group-hover:text-white">{task.name}</span>
                          <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-white transform group-hover:translate-x-1 transition-all" />
                        </Link>
                      </li>
                    ))}
                    {project.tasks.length === 0 && (
                      <li className="p-2 text-sm text-gray-500 italic">No tasks yet</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
