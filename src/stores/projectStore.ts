import { create } from 'zustand';
import type { ProjectInfo, ChangeInfo } from '../types';
import * as projectService from '../services/project';
import * as specService from '../services/spec';

interface ProjectState {
  projects: ProjectInfo[];
  currentProject: ProjectInfo | null;
  changes: ChangeInfo[];
  loading: boolean;

  loadProjects: () => Promise<void>;
  openProject: (path: string) => Promise<void>;
  addProject: (path: string, name: string) => Promise<void>;
  removeProject: (path: string) => Promise<void>;
  loadChanges: () => Promise<void>;
  setCurrentProject: (project: ProjectInfo | null) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProject: null,
  changes: [],
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
      await get().loadChanges();
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
      set({ currentProject: null, changes: [] });
    }
    await get().loadProjects();
  },

  loadChanges: async () => {
    const { currentProject } = get();
    if (!currentProject) return;
    try {
      const changes = await specService.listActiveChanges(currentProject.path);
      set({ changes });
    } catch {
      set({ changes: [] });
    }
  },

  setCurrentProject: (project) => set({ currentProject: project }),
}));
