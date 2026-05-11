import { get, set } from 'idb-keyval';

export interface Task {
  id: string;
  name: string;
  projectId: string;
  nodes?: any[]; // Store react-flow nodes
  edges?: any[]; // Store react-flow edges
  mapData?: any; // Store Map Generator workspace data
}

export interface Project {
  id: string;
  name: string;
  thumbnail: string;
  tasks: Task[];
}

// Initial mock data
const initialProjects: Project[] = [
  {
    id: "proj-1",
    name: "Fantasy RPG Assets",
    thumbnail: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=300&h=200&auto=format&fit=crop",
    tasks: [
      { id: "task-1", name: "Isometric Map Building", projectId: "proj-1" },
      { id: "task-2", name: "Tree Game Asset Generation", projectId: "proj-1" },
    ],
  },
  {
    id: "proj-2",
    name: "Sci-Fi UI Elements",
    thumbnail: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=300&h=200&auto=format&fit=crop",
    tasks: [
      { id: "task-3", name: "Holo-button Design", projectId: "proj-2" },
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
  const projects = await getProjects();
  let updated = false;
  
  const updatedProjects = projects.map(project => {
    const taskIndex = project.tasks.findIndex(t => t.id === taskId);
    if (taskIndex !== -1) {
      updated = true;
      const updatedTasks = [...project.tasks];
      updatedTasks[taskIndex] = { ...updatedTasks[taskIndex], nodes, edges };
      return { ...project, tasks: updatedTasks };
    }
    return project;
  });

  if (updated) {
    await saveProjects(updatedProjects);
  }
};

export const saveMapData = async (taskId: string, mapData: any) => {
  const projects = await getProjects();
  let updated = false;
  
  const updatedProjects = projects.map(project => {
    const taskIndex = project.tasks.findIndex(t => t.id === taskId);
    if (taskIndex !== -1) {
      updated = true;
      const updatedTasks = [...project.tasks];
      updatedTasks[taskIndex] = { ...updatedTasks[taskIndex], mapData };
      return { ...project, tasks: updatedTasks };
    }
    return project;
  });

  if (updated) {
    await saveProjects(updatedProjects);
  }
};
