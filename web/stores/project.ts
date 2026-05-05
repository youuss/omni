import { create } from 'zustand';
import { api } from '@/lib/api';

interface Project {
  id: string;
  name: string;
  description?: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

interface ProjectState {
  projects: Project[];
  current: Project | null;
  fetchProjects: () => Promise<void>;
  fetchProject: (id: string) => Promise<void>;
  createProject: (name: string, description: string) => Promise<Project>;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  current: null,

  fetchProjects: async () => {
    const projects = await api<Project[]>('/projects');
    set({ projects });
  },

  fetchProject: async (id) => {
    const project = await api<Project>(`/projects/${id}`);
    set({ current: project });
  },

  createProject: async (name, description) => {
    const project = await api<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
    set((s) => ({ projects: [project, ...s.projects] }));
    return project;
  },
}));
