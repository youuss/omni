import { create } from 'zustand';
import type { ProjectInfo } from '../types';
import type { RunInfo } from '../types/run';
import * as projectService from '../services/project';
import * as runService from '../services/run-service';

interface ProjectState {
  projects: ProjectInfo[];
  currentProject: ProjectInfo | null;
  runs: RunInfo[];
  loading: boolean;

  loadProjects: () => Promise<void>;
  openProject: (path: string) => Promise<void>;
  addProject: (path: string, name: string) => Promise<void>;
  removeProject: (path: string) => Promise<void>;
  loadRuns: () => Promise<void>;
  setCurrentProject: (project: ProjectInfo | null) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProject: null,
  runs: [],
  loading: false,

  loadProjects: async () => {
    set({ loading: true });
    try {
      const projects = await projectService.listProjects();
      set({ projects });
    } catch {
      set({ projects: [] });
    } finally {
      set({ loading: false });
    }
  },

  openProject: async (path: string) => {
    set({ loading: true });
    try {
      const project = await projectService.openProject(path);
      await projectService.addProject(project.path, project.name);
      set({ currentProject: project });
      await get().loadRuns();
      await get().loadProjects();
    } finally {
      set({ loading: false });
    }
  },

  addProject: async (path: string, name: string) => {
    await projectService.addProject(path, name);
    await get().loadProjects();
  },

  removeProject: async (path: string) => {
    await projectService.removeProject(path);
    const { currentProject } = get();
    if (currentProject?.path === path) {
      set({ currentProject: null, runs: [] });
    }
    await get().loadProjects();
  },

  loadRuns: async () => {
    const { currentProject } = get();
    if (!currentProject) return;
    try {
      const runs = await runService.listActiveRuns(currentProject.path);
      set({ runs });
    } catch {
      set({ runs: [] });
    }
  },

  setCurrentProject: (project) => set({ currentProject: project }),
}));
