import { invoke } from '@tauri-apps/api/core';

export interface SkillInfo {
  id: string;
  path: string;
  name: string;
  description: string;
}

export interface SkillsConfig {
  enabled: string[]; // skill id 列表
}

const SKILLS_CONFIG_FILE = '.omni/skills-config.json';

function skillsConfigPath(projectPath: string): string {
  return `${projectPath}/${SKILLS_CONFIG_FILE}`;
}

/** 扫描项目 .claude/skills/ 下的所有技能（项目级） */
export async function scanSkills(projectPath: string): Promise<SkillInfo[]> {
  return invoke<SkillInfo[]>('scan_skills', { projectPath });
}

/** 读取技能启用配置，不存在时返回全部启用 */
export async function loadSkillsConfig(
  projectPath: string
): Promise<SkillsConfig> {
  try {
    const content = await invoke<string>('read_text_file', {
      path: skillsConfigPath(projectPath),
    });
    return JSON.parse(content) as SkillsConfig;
  } catch {
    // 配置不存在，默认全部启用
    const skills = await scanSkills(projectPath);
    return { enabled: skills.map((s) => s.id) };
  }
}

/** 保存技能启用配置 */
export async function saveSkillsConfig(
  projectPath: string,
  config: SkillsConfig
): Promise<void> {
  await invoke('write_text_file', {
    path: skillsConfigPath(projectPath),
    content: JSON.stringify(config, null, 2),
  });
}

/** 切换单个技能的启用状态 */
export async function toggleSkill(
  projectPath: string,
  skillId: string,
  enabled: boolean
): Promise<void> {
  const config = await loadSkillsConfig(projectPath);
  const next = new Set(config.enabled);
  if (enabled) {
    next.add(skillId);
  } else {
    next.delete(skillId);
  }
  await saveSkillsConfig(projectPath, { enabled: Array.from(next) });
}

/** 新建技能文件（写入 {project}/.claude/skills/{id}/SKILL.md） */
export async function createSkill(
  projectPath: string,
  id: string,
  name: string,
  description: string,
  body: string
): Promise<void> {
  const frontMatter = `---\nname: ${name}\ndescription: ${description}\n---\n\n`;
  await invoke('write_skill_file', {
    projectPath,
    skillId: id,
    content: frontMatter + body,
  });
  // 新建的技能默认启用
  await toggleSkill(projectPath, id, true);
}

/** 返回当前已启用技能的绝对路径列表（供 runAgent 注入） */
export async function getEnabledSkillPaths(
  projectPath: string
): Promise<string[]> {
  const [skills, config] = await Promise.all([
    scanSkills(projectPath),
    loadSkillsConfig(projectPath),
  ]);
  const enabledSet = new Set(config.enabled);
  return skills.filter((s) => enabledSet.has(s.id)).map((s) => s.path);
}

/** 读取技能文件内容 */
export async function readSkillContent(skillPath: string): Promise<string> {
  return invoke<string>('read_text_file', { path: skillPath });
}

/** 覆盖写入技能文件内容 */
export async function saveSkillContent(
  projectPath: string,
  skillId: string,
  content: string
): Promise<void> {
  await invoke('write_skill_file', { projectPath, skillId, content });
}

/** 删除技能目录 */
export async function deleteSkill(
  projectPath: string,
  skillId: string
): Promise<void> {
  await invoke('delete_skill', { projectPath, skillId });
  await toggleSkill(projectPath, skillId, false);
}

/** 从 URL 下载 SKILL.md 内容并安装为本地技能 */
export async function installSkillFromUrl(
  projectPath: string,
  url: string
): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`请求失败: ${resp.status} ${resp.statusText}`);
  const content = await resp.text();

  // 从 front matter 或 URL 推导 skill id
  const nameMatch = content.match(/^---[\s\S]*?name:\s*(.+?)[\r\n]/m);
  const rawName =
    nameMatch?.[1]?.trim() ??
    url.split('/').slice(-2, -1)[0] ??
    'imported-skill';
  const skillId = rawName
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  await invoke('write_skill_file', { projectPath, skillId, content });
  await toggleSkill(projectPath, skillId, true);
  return skillId;
}
