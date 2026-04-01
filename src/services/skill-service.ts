import { invoke } from '@tauri-apps/api/core';
import type { SkillMeta, SkillPoolConfig, SkillBinding } from '../types/skill';
import type { AgentDefinition, AgentNodeConfig } from '../types/harness';

const SKILLS_CONFIG_FILE = '.harness/skills.json';

function skillsConfigPath(projectPath: string): string {
  return `${projectPath}/${SKILLS_CONFIG_FILE}`;
}

interface RawSkillInfo {
  id: string;
  name: string;
  description: string;
  path: string;
  source: string;
}

export async function scanSkills(projectPath: string): Promise<SkillMeta[]> {
  const raw = await invoke<RawSkillInfo[]>('scan_skills', { projectPath });
  return raw.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    path: s.path,
    source: s.source as 'global' | 'project',
  }));
}

export async function loadSkillPoolConfig(
  projectPath: string,
): Promise<SkillPoolConfig> {
  try {
    const content = await invoke<string>('read_text_file', {
      path: skillsConfigPath(projectPath),
    });
    return JSON.parse(content) as SkillPoolConfig;
  } catch {
    const skills = await scanSkills(projectPath);
    return { enabled: skills.map((s) => s.id) };
  }
}

export async function saveSkillPoolConfig(
  projectPath: string,
  config: SkillPoolConfig,
): Promise<void> {
  await invoke('write_text_file', {
    path: skillsConfigPath(projectPath),
    content: JSON.stringify(config, null, 2),
  });
}

export async function toggleSkill(
  projectPath: string,
  skillId: string,
  enabled: boolean,
): Promise<void> {
  const config = await loadSkillPoolConfig(projectPath);
  const next = new Set(config.enabled);
  if (enabled) {
    next.add(skillId);
  } else {
    next.delete(skillId);
  }
  await saveSkillPoolConfig(projectPath, { enabled: Array.from(next) });
}

export async function createSkill(
  projectPath: string,
  id: string,
  name: string,
  description: string,
  body: string,
): Promise<void> {
  const frontMatter = `---\nname: ${name}\ndescription: ${description}\n---\n\n`;
  await invoke('write_skill_file', {
    projectPath,
    skillId: id,
    content: frontMatter + body,
  });
  await toggleSkill(projectPath, id, true);
}

export async function deleteSkill(
  projectPath: string,
  skillId: string,
): Promise<void> {
  await invoke('delete_skill', { projectPath, skillId });
  await toggleSkill(projectPath, skillId, false);
}

export async function readSkillContent(skillPath: string): Promise<string> {
  const mdPath = skillPath.endsWith('SKILL.md')
    ? skillPath
    : `${skillPath}/SKILL.md`;
  return invoke<string>('read_text_file', { path: mdPath });
}

export async function saveSkillContent(
  projectPath: string,
  skillId: string,
  content: string,
): Promise<void> {
  await invoke('write_skill_file', { projectPath, skillId, content });
}

export function resolveAgentSkills(
  agent: AgentDefinition,
  nodeOverrides?: AgentNodeConfig['overrides'],
): string[] {
  return nodeOverrides?.skills ?? agent.skills ?? [];
}

export function buildSkillBindings(
  skillIds: string[],
  allSkills: SkillMeta[],
): SkillBinding[] {
  return skillIds
    .map((id) => allSkills.find((s) => s.id === id))
    .filter((s): s is SkillMeta => s !== undefined)
    .map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      path: s.path,
    }));
}
