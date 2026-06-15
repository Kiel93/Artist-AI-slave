"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Project, Task, getProjects, createTask, deleteTask, updateProject } from "@/lib/store";
import { ArrowLeft, Plus, Folder, File, Trash2, Edit2 } from "lucide-react";
import Link from "next/link";

export default function ProjectPage() {
  const { id } = useParams();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);

  const loadProject = async () => {
    if (!id || typeof id !== "string") return;
    const projects = await getProjects();
    const found = projects.find(p => p.id === id);
    if (found) {
      setProject(found);
    } else {
      router.push("/");
    }
  };

  useEffect(() => {
    loadProject();
  }, [id]);

  const handleCreateTask = async () => {
    if (!project) return;
    const name = prompt("Enter new task name:", "New Task");
    if (name && name.trim() !== "") {
      await createTask(project.id, name);
      loadProject();
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!project) return;
    if (confirm("Are you sure you want to delete this task?")) {
      await deleteTask(project.id, taskId);
      loadProject();
    }
  };

  const handleUpdateThumbnail = async () => {
    if (!project) return;
    const url = prompt("Enter new thumbnail URL:", project.thumbnail);
    if (url !== null) {
      await updateProject(project.id, { thumbnail: url });
      loadProject();
    }
  };

  if (!project) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center text-white">
        Loading project...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--color-blender-bg)]">
      {/* Banner / Header */}
      <div 
        className="h-64 bg-cover bg-center relative flex items-end group"
        style={{ 
          backgroundColor: "#000",
          backgroundImage: project.thumbnail ? `url(${project.thumbnail})` : 'none' 
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        
        <button 
          onClick={() => router.push("/")}
          className="absolute top-6 left-6 p-2 bg-black/40 hover:bg-black/60 rounded-full text-white backdrop-blur-sm transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <button 
          onClick={handleUpdateThumbnail}
          className="absolute top-6 right-6 px-3 py-1.5 bg-black/40 hover:bg-black/60 rounded-md text-white text-sm font-medium backdrop-blur-sm transition-colors opacity-0 group-hover:opacity-100 flex items-center gap-2"
        >
          <Edit2 className="w-4 h-4" /> Change Cover
        </button>

        <div className="relative p-8 w-full max-w-5xl mx-auto flex items-end justify-between">
          <div>
            <h1 className="text-4xl font-bold text-white tracking-tight flex items-center gap-3 drop-shadow-md">
              <Folder className="w-8 h-8 text-[var(--color-blender-accent)]" />
              {project.name}
            </h1>
            <p className="text-gray-300 mt-2 font-medium drop-shadow-sm">
              {project.tasks.length} {project.tasks.length === 1 ? 'task' : 'tasks'}
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-8 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Tasks</h2>
          <button 
            onClick={handleCreateTask}
            className="flex items-center gap-2 bg-[var(--color-blender-accent)] hover:bg-[var(--color-blender-hover)] text-white px-4 py-2 rounded-md transition-colors shadow-md font-medium"
          >
            <Plus className="w-4 h-4" />
            New Task
          </button>
        </div>

        <div className="bg-[var(--color-blender-panel)] rounded-xl border border-[var(--color-blender-border)] overflow-hidden shadow-lg">
          {project.tasks.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <File className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No tasks in this project yet.</p>
              <button 
                onClick={handleCreateTask}
                className="mt-4 text-[var(--color-blender-accent)] hover:underline font-medium"
              >
                Create your first task
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--color-blender-border)]">
              {project.tasks.map((task) => (
                <li key={task.id} className="group flex items-center justify-between hover:bg-[var(--color-blender-hover)] transition-colors">
                  <Link 
                    href={`/workspace?task=${task.id}`}
                    className="flex-1 p-4 flex items-center gap-4 text-gray-200 group-hover:text-white"
                  >
                    <File className="w-5 h-5 text-gray-500 group-hover:text-[var(--color-blender-accent)] transition-colors" />
                    <div className="font-medium">{task.name}</div>
                  </Link>
                  <div className="px-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => handleDeleteTask(task.id)}
                      className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                      title="Delete Task"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
