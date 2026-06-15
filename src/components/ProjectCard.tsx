"use client";

import { useState, useRef, useEffect } from "react";
import { Project } from "@/lib/store";
import { Folder, MoreVertical, Copy, Edit2, Trash2 } from "lucide-react";
import Link from "next/link";

interface ProjectCardProps {
  project: Project;
  onRename: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function ProjectCard({ project, onRename, onDuplicate, onDelete }: ProjectCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleMenuClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(!menuOpen);
  };

  const handleRename = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    onRename(project.id);
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    onDuplicate(project.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    onDelete(project.id);
  };

  return (
    <div className="relative group">
      <Link href={`/project/${project.id}`}>
        <div className="bg-[var(--color-blender-panel)] rounded-xl border border-[var(--color-blender-border)] overflow-hidden shadow-lg transition-all duration-300 hover:shadow-xl hover:border-gray-500 flex flex-col h-48 cursor-pointer">
          <div 
            className="flex-1 bg-cover bg-center relative"
            style={{ 
              backgroundColor: "#000000",
              backgroundImage: project.thumbnail ? `url(${project.thumbnail})` : 'none' 
            }}
          >
            <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
            <div className="absolute bottom-3 left-4 right-4 flex justify-between items-end">
              <h2 className="text-xl font-bold text-white drop-shadow-md flex items-center gap-2 truncate pr-2">
                <Folder className="w-5 h-5 flex-shrink-0" />
                <span className="truncate">{project.name}</span>
              </h2>
              <div className="bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-xs font-medium text-gray-200 whitespace-nowrap flex-shrink-0">
                {project.tasks.length} tasks
              </div>
            </div>
          </div>
        </div>
      </Link>

      {/* Context Menu Button */}
      <div className="absolute top-3 right-3" ref={menuRef}>
        <button 
          onClick={handleMenuClick}
          className="p-1.5 bg-black/50 hover:bg-black/80 rounded-md text-white transition-colors backdrop-blur-sm opacity-0 group-hover:opacity-100 focus:opacity-100"
        >
          <MoreVertical className="w-5 h-5" />
        </button>

        {/* Dropdown Menu */}
        {menuOpen && (
          <div className="absolute right-0 mt-2 w-48 bg-[var(--color-blender-panel)] border border-[var(--color-blender-border)] rounded-md shadow-2xl z-10 py-1">
            <button 
              onClick={handleRename}
              className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-[var(--color-blender-hover)] hover:text-white flex items-center gap-2 transition-colors"
            >
              <Edit2 className="w-4 h-4" /> Rename
            </button>
            <button 
              onClick={handleDuplicate}
              className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-[var(--color-blender-hover)] hover:text-white flex items-center gap-2 transition-colors"
            >
              <Copy className="w-4 h-4" /> Duplicate
            </button>
            <div className="h-px bg-[var(--color-blender-border)] my-1"></div>
            <button 
              onClick={handleDelete}
              className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 flex items-center gap-2 transition-colors"
            >
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
