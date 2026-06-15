"use client";

import { useEffect, useState } from "react";
import { Plus, Image as ImageIcon, Clock, LayoutGrid } from "lucide-react";
import { Project, Task, getProjects, getRecentTasks, createProject, updateProject, deleteProject, duplicateProject } from "@/lib/store";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SettingsMenu from "@/components/SettingsMenu";
import ProjectCard from "@/components/ProjectCard";

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [recentTasks, setRecentTasks] = useState<Task[]>([]);
  const router = useRouter();

  const loadData = async () => {
    const loadedProjects = await getProjects();
    setProjects(loadedProjects);
    const loadedRecent = await getRecentTasks(4);
    setRecentTasks(loadedRecent);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleNewProject = async () => {
    await createProject("New Project");
    loadData();
  };

  const handleRenameProject = async (id: string) => {
    const project = projects.find(p => p.id === id);
    if (!project) return;
    const newName = prompt("Enter new project name:", project.name);
    if (newName && newName.trim() !== "") {
      await updateProject(id, { name: newName });
      loadData();
    }
  };

  const handleDuplicateProject = async (id: string) => {
    await duplicateProject(id);
    loadData();
  };

  const handleDeleteProject = async (id: string) => {
    if (confirm("Are you sure you want to delete this project? This action cannot be undone.")) {
      await deleteProject(id);
      loadData();
    }
  };

  return (
    <div className="flex-1 p-8 overflow-y-auto bg-[var(--color-blender-bg)]">
      <div className="max-w-6xl mx-auto space-y-10">
        
        {/* Header */}
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 bg-[var(--color-blender-accent)] rounded-lg flex items-center justify-center shadow-lg">
              <ImageIcon className="text-white w-6 h-6" />
            </div>
            Artist Assistant Hub
          </h1>
          <div className="flex items-center gap-4">
            <SettingsMenu />
            <button 
              onClick={handleNewProject}
              className="flex items-center gap-2 bg-[var(--color-blender-accent)] hover:bg-[var(--color-blender-hover)] text-white px-4 py-2 rounded-md transition-colors shadow-md font-medium"
            >
              <Plus className="w-4 h-4" />
              New Project
            </button>
          </div>
        </div>

        {/* Jump Back In (Recent Tasks) */}
        {recentTasks.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4 text-gray-300">
              <Clock className="w-5 h-5 text-[var(--color-blender-accent)]" />
              <h2 className="text-xl font-semibold text-white">Jump Back In</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {recentTasks.map((task) => {
                const project = projects.find(p => p.id === task.projectId);
                return (
                  <Link 
                    key={task.id} 
                    href={`/workspace?task=${task.id}`}
                    className="bg-[var(--color-blender-panel)] border border-[var(--color-blender-border)] rounded-lg p-4 hover:bg-[var(--color-blender-hover)] transition-colors group cursor-pointer"
                  >
                    <div className="text-sm font-medium text-white truncate">{task.name}</div>
                    <div className="text-xs text-gray-400 mt-1 truncate">{project?.name || 'Unknown Project'}</div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* Projects Grid */}
        <section>
          <div className="flex items-center gap-2 mb-4 text-gray-300 border-b border-[var(--color-blender-border)] pb-2">
            <LayoutGrid className="w-5 h-5 text-gray-400" />
            <h2 className="text-xl font-semibold text-white">Projects</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <ProjectCard 
                key={project.id} 
                project={project} 
                onRename={handleRenameProject}
                onDuplicate={handleDuplicateProject}
                onDelete={handleDeleteProject}
              />
            ))}
            
            {projects.length === 0 && (
              <div className="col-span-full py-12 text-center border-2 border-dashed border-[var(--color-blender-border)] rounded-xl bg-black/20">
                <ImageIcon className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-gray-300">No projects yet</h3>
                <p className="text-gray-500 mt-1 mb-4">Create your first project to get started.</p>
                <button 
                  onClick={handleNewProject}
                  className="inline-flex items-center gap-2 bg-[var(--color-blender-panel)] hover:bg-[var(--color-blender-hover)] text-white px-4 py-2 rounded-md transition-colors border border-[var(--color-blender-border)]"
                >
                  <Plus className="w-4 h-4" />
                  New Project
                </button>
              </div>
            )}
          </div>
        </section>

      </div>
    </div>
  );
}
