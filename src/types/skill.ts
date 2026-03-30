// src/types/skill.ts

/** Skill metadata parsed from SKILL.md YAML front matter */
export interface SkillMeta {
  id: string;
  name: string;
  description: string;
  path: string;
  source: 'global' | 'project';
}

/** Project-level skill pool configuration */
export interface SkillPoolConfig {
  enabled: string[];
}

/** Skill binding passed to sdk-runner */
export interface SkillBinding {
  id: string;
  name: string;
  description: string;
  path: string;
}
