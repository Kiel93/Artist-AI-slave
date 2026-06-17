import { get, set, update } from 'idb-keyval';

export interface Task {
  id: string;
  name: string;
  projectId: string;
  nodes?: any[]; // Store react-flow nodes
  edges?: any[]; // Store react-flow edges
  mapData?: any; // Store Map Generator workspace data
  createdAt?: number;
  updatedAt?: number;
}

export interface CompoundNodeData {
  label: string;
  internalNodes: any[]; // Nodes within the compound graph
  internalEdges: any[]; // Edges within the compound graph
  inputPins?: string[]; // E.g. ['text', 'image']
  outputPins?: string[]; // E.g. ['image-out']
}

export interface Project {
  id: string;
  name: string;
  thumbnail: string;
  tasks: Task[];
  createdAt?: number;
  updatedAt?: number;
}

// Initial mock data
const now = Date.now();
const initialProjects: Project[] = [
  {
    id: "proj-1",
    name: "Fantasy RPG Assets",
    thumbnail: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=300&h=200&auto=format&fit=crop",
    createdAt: now - 100000,
    updatedAt: now - 50000,
    tasks: [
      { id: "task-1", name: "Isometric Map Building", projectId: "proj-1", createdAt: now - 100000, updatedAt: now - 50000 },
      { id: "task-2", name: "Tree Game Asset Generation", projectId: "proj-1", createdAt: now - 90000, updatedAt: now - 60000 },
    ],
  },
  {
    id: "proj-2",
    name: "Sci-Fi UI Elements",
    thumbnail: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=300&h=200&auto=format&fit=crop",
    createdAt: now - 200000,
    updatedAt: now - 100000,
    tasks: [
      { id: "task-3", name: "Holo-button Design", projectId: "proj-2", createdAt: now - 200000, updatedAt: now - 100000 },
    ],
  },
];

export const getProjects = async (): Promise<Project[]> => {
  if (typeof window === 'undefined') return initialProjects;
  
  try {
    const stored = await get('artist-assistant-projects');
    if (stored) {
      return stored as Project[];
    }
  } catch (e) {
    console.error("Failed to parse projects from IndexedDB", e);
  }
  
  // Initialize if empty
  await set('artist-assistant-projects', initialProjects);
  return initialProjects;
};

export const saveProjects = async (projects: Project[]) => {
  if (typeof window !== 'undefined') {
    try {
      await set('artist-assistant-projects', projects);
    } catch (e) {
      console.error("Failed to save projects to IndexedDB", e);
    }
  }
};

export const getTask = async (taskId: string): Promise<Task | null> => {
  const projects = await getProjects();
  for (const project of projects) {
    const task = project.tasks.find(t => t.id === taskId);
    if (task) return task;
  }
  return null;
};

export const saveTaskFlow = async (taskId: string, nodes: any[], edges: any[]) => {
  if (typeof window !== 'undefined') {
    try {
      await update('artist-assistant-projects', (val: any) => {
        const projects = val as Project[] || initialProjects;
        let isUpdated = false;
        const updatedProjects = projects.map(project => {
          const taskIndex = project.tasks.findIndex(t => t.id === taskId);
          if (taskIndex !== -1) {
            isUpdated = true;
            const updatedTasks = [...project.tasks];
            updatedTasks[taskIndex] = { ...updatedTasks[taskIndex], nodes, edges };
            return { ...project, tasks: updatedTasks };
          }
          return project;
        });
        return isUpdated ? updatedProjects : projects;
      });
    } catch (e) {
      console.error("Failed to update task flow in IndexedDB", e);
    }
  }
};

export const saveMapData = async (taskId: string, mapData: any) => {
  if (typeof window !== 'undefined') {
    try {
      await update('artist-assistant-projects', (val: any) => {
        const projects = val as Project[] || initialProjects;
        let isUpdated = false;
        const updatedProjects = projects.map(project => {
          const taskIndex = project.tasks.findIndex(t => t.id === taskId);
          if (taskIndex !== -1) {
            isUpdated = true;
            const updatedTasks = [...project.tasks];
            updatedTasks[taskIndex] = { ...updatedTasks[taskIndex], mapData };
            return { ...project, tasks: updatedTasks };
          }
          return project;
        });
        return isUpdated ? updatedProjects : projects;
      });
    } catch (e) {
      console.error("Failed to update map data in IndexedDB", e);
    }
  }
};

export const createProject = async (name: string): Promise<Project> => {
  const projects = await getProjects();
  const newProject: Project = {
    id: `proj-${Date.now()}`,
    name: name || "New Project",
    thumbnail: "", // default solid black logic handles empty string
    tasks: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  
  await saveProjects([newProject, ...projects]);
  return newProject;
};

export const updateProject = async (projectId: string, updates: Partial<Project>) => {
  const projects = await getProjects();
  const updated = projects.map(p => 
    p.id === projectId ? { ...p, ...updates, updatedAt: Date.now() } : p
  );
  await saveProjects(updated);
};

export const deleteProject = async (projectId: string) => {
  const projects = await getProjects();
  const filtered = projects.filter(p => p.id !== projectId);
  await saveProjects(filtered);
};

export const duplicateProject = async (projectId: string): Promise<Project | null> => {
  const projects = await getProjects();
  const source = projects.find(p => p.id === projectId);
  if (!source) return null;
  
  const newProject: Project = {
    ...source,
    id: `proj-${Date.now()}`,
    name: `${source.name} (Copy)`,
    tasks: source.tasks.map(t => ({
      ...t,
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      projectId: `proj-${Date.now()}`, // Note: this logic is a bit flawed since Date.now() might change, but let's fix it by storing the newId.
      createdAt: Date.now(),
      updatedAt: Date.now()
    })),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  
  // Fix projectId in copied tasks
  newProject.tasks = newProject.tasks.map(t => ({ ...t, projectId: newProject.id }));

  await saveProjects([newProject, ...projects]);
  return newProject;
};

export const createTask = async (projectId: string, name: string): Promise<Task | null> => {
  const projects = await getProjects();
  const projectIndex = projects.findIndex(p => p.id === projectId);
  if (projectIndex === -1) return null;
  
  const newTask: Task = {
    id: `task-${Date.now()}`,
    name,
    projectId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  
  projects[projectIndex].tasks.push(newTask);
  projects[projectIndex].updatedAt = Date.now();
  
  await saveProjects(projects);
  return newTask;
};

export const deleteTask = async (projectId: string, taskId: string) => {
  const projects = await getProjects();
  const project = projects.find(p => p.id === projectId);
  if (project) {
    project.tasks = project.tasks.filter(t => t.id !== taskId);
    project.updatedAt = Date.now();
    await saveProjects(projects);
  }
};

export const getRecentTasks = async (limit: number = 5): Promise<Task[]> => {
  const projects = await getProjects();
  const allTasks = projects.flatMap(p => p.tasks);
  return allTasks
    .sort((a, b) => ((b.updatedAt || 0) - (a.updatedAt || 0)))
    .slice(0, limit);
};
