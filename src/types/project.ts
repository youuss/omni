export interface ProjectInfo {
  path: string;
  name: string;
  is_git: boolean;
  has_specs: boolean;
  active_changes: string[];
  last_opened: string;
}

export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  children?: DirEntry[];
}
