# Skill Kit 设计方案

## 概述

将现有 Extension 系统升级为 **Skill 系统**，支持全局 + 项目双层技能池，技能与 Agent 绑定（Agent 定义级默认 + 节点级覆盖），通过 **Skill Kit（单工具 MCP Server）** 实现运行时隔离。

### 核心设计原则

- **轻量**：Skill Kit 只暴露一个 `skill` 工具（list / load），Level 3 资源由 agent 自身 Read/Bash 工具访问
- **隔离**：agent 只能发现和加载绑定的技能，未绑定技能不可见也不可加载
- **兼容 SDK Skill 标准**：技能目录结构、SKILL.md 格式遵循 Claude Agent Skills 规范
- **渐进式加载**：Level 1 元数据注入 prompt → Level 2 按需加载 SKILL.md → Level 3 agent 自行访问资源

---

## 技能池存储

### 双层技能池

| 层级 | 路径 | 范围 |
|------|------|------|
| 全局 | `~/.claude/skills/{skill-name}/` | 跨项目共享 |
| 项目 | `{project}/.harness/skills/{skill-name}/` | 项目特定 |

项目级同名技能覆盖全局级。

### 技能目录结构

```
{skill-name}/
├── SKILL.md           # 必需，含 YAML 前置元数据
├── *.md               # 可选，额外参考文档
└── scripts/           # 可选，工具脚本
    └── *.py / *.sh
```

### SKILL.md 格式

```yaml
---
name: pdf-processing
description: Extract text and tables from PDF files. Use when working with PDF files.
---

# PDF Processing

## Instructions
...

For form filling, see [FORMS.md](FORMS.md).
Run `scripts/extract.py <file>` for batch extraction.
```

SKILL.md 中通过相对路径引用资源和脚本，agent 加载后用自身 Read/Bash 工具按路径访问。

### 字段约束

- `name`：最多 64 字符，只能包含小写字母、数字和连字符
- `description`：最多 1024 字符，不能为空

---

## 类型定义

### 新增类型

```typescript
// src/types/skill.ts

/** 技能元数据，从 SKILL.md 前置内容解析 */
export interface SkillMeta {
  id: string;                        // 目录名，如 "pdf-processing"
  name: string;                      // YAML name 字段
  description: string;               // YAML description 字段
  path: string;                      // 技能目录绝对路径
  source: 'global' | 'project';
}

/** 技能池配置 */
export interface SkillPoolConfig {
  enabled: string[];
}

/** 传递给 sdk-runner 的技能绑定信息 */
export interface SkillBinding {
  id: string;
  name: string;
  description: string;
  path: string;                      // 技能目录绝对路径
}
```

### 现有类型扩展

```typescript
// src/types/harness.ts — AgentDefinition 增加字段
export interface AgentDefinition {
  id: string;
  name: string;
  description?: string;
  promptTemplate?: string;
  allowedTools?: string[];
  maxTurns?: number;
  builtin?: boolean;
  skills?: string[];                 // +++ Agent 默认绑定的技能 ID 列表
}

// src/types/harness.ts — AgentNodeConfig.overrides 增加字段
export interface AgentNodeConfig {
  agentId?: string;
  inputSlots?: SlotDef[];
  outputSlots?: SlotDef[];
  constraints?: NodeConstraint[];
  contextFilter?: string[];
  overrides?: {
    model?: string;
    maxTurns?: number;
    maxBudgetUsd?: number;
    allowedTools?: string[];
    promptExtra?: string;
    permissionMode?: PermissionMode;
    skills?: string[];               // +++ 节点级覆盖，完全替换 Agent 默认
  };
  routing?: {
    outputKey: string;
    branches: Record<string, string>;
    defaultBranch?: string;
  };
}

// src/types/claude.ts — RunRequest 增加字段
export interface RunRequest {
  projectPath: string;
  prompt: string;
  agents: string[];
  // ...existing fields...
  skills?: SkillBinding[];           // +++ 传递给 sdk-runner
}
```

---

## 服务层

### 新增 `src/services/skill-service.ts`

替代 `extension-service.ts`，核心 API：

```typescript
/** 扫描全局 + 项目技能池，返回合并后的技能列表 */
scanSkills(projectPath: string): Promise<SkillMeta[]>

/** 读取 .harness/skills.json */
loadSkillPoolConfig(projectPath: string): Promise<SkillPoolConfig>

/** 写入 .harness/skills.json */
saveSkillPoolConfig(projectPath: string, config: SkillPoolConfig): Promise<void>

/** 启用/禁用技能 */
toggleSkill(projectPath: string, skillId: string, enabled: boolean): Promise<void>

/** 创建项目技能 */
createSkill(projectPath: string, id: string, name: string, description: string, body: string): Promise<void>

/** 删除项目技能 */
deleteSkill(projectPath: string, skillId: string): Promise<void>

/** 读取 SKILL.md 完整内容 */
readSkillContent(skillPath: string): Promise<string>

/** 解析 agent + 节点覆盖后的最终技能 ID 列表 */
resolveAgentSkills(
  agent: AgentDefinition,
  nodeOverrides?: AgentNodeConfig['overrides']
): string[]
// → nodeOverrides.skills ?? agent.skills ?? []
```

### Rust 后端

在 `src-tauri/src/commands/` 中新增技能相关命令：

- `scan_skills` — 扫描技能目录，解析 SKILL.md YAML 前置元数据
- `write_skill_file` — 创建/更新技能文件
- `delete_skill` — 删除技能目录

注册到 `lib.rs` 的 `invoke_handler!` 中。

---

## Skill Kit（运行时隔离核心）

### 设计

每个 agent 节点执行时，在 `sdk-runner.mjs` 中创建一个名为 `skill-kit` 的 MCP Server，只暴露一个 `skill` 工具，只允许访问该 agent 绑定的技能。

### 实现

```javascript
// scripts/sdk-runner.mjs

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

function createSkillKit(skills) {
  // skills: SkillBinding[]

  return createSdkMcpServer({
    name: 'skill-kit',
    tools: [
      tool(
        'skill',
        'Discover or load agent skills. '
        + 'Use action "list" to see available skills, '
        + 'or action "load" with a skill name to get detailed instructions.',
        {
          action: z.enum(['list', 'load']),
          name: z.string().optional()
            .describe('Skill name, required when action is "load"'),
        },
        async ({ action, name }) => {
          if (action === 'list') {
            const index = skills.map(s => ({
              name: s.name,
              description: s.description,
            }));
            return {
              content: [{ type: 'text', text: JSON.stringify(index, null, 2) }],
            };
          }

          // action === 'load'
          if (!name) {
            return {
              content: [{ type: 'text', text: 'Missing "name" parameter for load action' }],
            };
          }

          const s = skills.find(s => s.name === name || s.id === name);
          if (!s) {
            return {
              content: [{
                type: 'text',
                text: `Skill "${name}" not available. Available: ${skills.map(s => s.name).join(', ')}`,
              }],
            };
          }

          const md = await readFile(join(s.path, 'SKILL.md'), 'utf-8');
          // 去掉 YAML 前置元数据，只返回指令主体
          const body = md.replace(/^---[\s\S]*?---\s*/, '');

          // 将相对路径转为绝对路径，让 agent 可直接用 Read/Bash 访问
          const resolved = body.replace(
            /(?<=\[.*?\]\()([^)]+)(?=\))/g,
            (match) => match.startsWith('/') ? match : join(s.path, match)
          );

          return { content: [{ type: 'text', text: resolved }] };
        }
      ),
    ],
  });
}
```

### 集成到 sdk-runner 主流程

```javascript
const { skills = [] } = request;

if (skills.length > 0) {
  const skillKit = createSkillKit(skills);
  options.mcpServers = {
    ...options.mcpServers,
    'skill-kit': skillKit,
  };
}
```

---

## Prompt 注入（Level 1 元数据）

修改 `src/services/engine/prompt-assembler.ts`：

### AssembleOptions 扩展

```typescript
export interface AssembleOptions {
  node: HarnessNode;
  agent: AgentDefinition;
  allNodes: HarnessNode[];
  connections: HarnessConnection[];
  allContexts: Record<string, NodeContext>;
  extensions?: string[];
  skills?: SkillMeta[];              // +++ 绑定技能元数据
  constraintFailure?: ConstraintFailure;
}
```

### 组装顺序

```
1. Agent prompt template
2. Extensions（如有保留的全局注入）
3. ## Available Skills                    ← 新增
   - pdf-processing: Extract text...
   - code-review: Review code...
   Use the `skill` tool with action "load" and the skill name...
4. Upstream context
5. Constraint failure context
6. Node-level promptExtra
```

### 注入逻辑

```typescript
// assemblePrompt() 中，extensions 之后插入：

if (skills && skills.length > 0) {
  const index = skills.map(s => `- **${s.name}**: ${s.description}`).join('\n');
  parts.push(
    `## Available Skills\n\n${index}\n\n` +
    `Use the \`skill\` tool with action "load" and the skill name to get detailed instructions when relevant.`
  );
}
```

---

## 执行流

```
StateMachine.executeAgentNode(node)
  │
  ├─ resolveAgentSkills(agent, node.overrides)
  │    → ["pdf-processing", "code-review"]
  │
  ├─ scanSkills(projectPath)
  │    → 匹配 ID → SkillMeta[]
  │
  ├─ assemblePrompt({ ..., skills: SkillMeta[] })
  │    → prompt 中包含 ## Available Skills 索引
  │
  └─ runAgent({ ..., skills: SkillBinding[] })
       │
       → sdk-runner.mjs
         ├─ createSkillKit(skills)
         ├─ options.mcpServers['skill-kit'] = skillKit
         └─ query({ prompt, options })
```

---

## Agent 运行时行为

### 正常流程

```
Agent 收到 prompt，看到：
  ## Available Skills
  - pdf-processing: Extract text and tables from PDF files
  - code-review: Review code for best practices
  Use the `skill` tool with action "load" and the skill name...

用户："帮我处理这个 PDF"

Agent 自动关联到 pdf-processing 技能：
  → skill(action: "load", name: "pdf-processing")     # Level 2
  ← 返回 SKILL.md 内容（路径已替换为绝对路径）：
    "...For form filling, see [FORMS.md](/abs/path/FORMS.md).
     Run `/abs/path/scripts/extract.py <file>` for batch extraction."
  → Read("/abs/path/FORMS.md")                         # Level 3
  → Bash("/abs/path/scripts/extract.py doc.pdf")       # Level 3
```

### 隔离拦截

```
Agent 尝试访问未绑定技能：
  → skill(action: "load", name: "api-design")
  ← "Skill "api-design" not available. Available: pdf-processing, code-review"
```

### 三级渐进加载对应

| 级别 | 原生 SDK Skill 行为 | Skill Kit 实现 |
|------|---------------------|---------------|
| Level 1：元数据 | 启动时进系统提示 | prompt 注入 `## Available Skills` |
| Level 2：指令 | Claude 用 bash 读 SKILL.md | `skill(action: "load", name)` |
| Level 3：资源 | Claude 用 bash 读文件/跑脚本 | Agent 用 Read/Bash 访问绝对路径 |

---

## 隔离机制

| 层级 | 机制 | 效果 |
|------|------|------|
| 发现隔离 | Prompt 只注入绑定技能元数据 | Agent 不知道未绑定技能的存在 |
| 加载隔离 | Skill Kit 校验 name 是否在绑定列表 | 即使猜到名字也无法加载指令 |
| 资源访问 | SKILL.md 中相对路径替换为绝对路径 | Agent 用自身 Read/Bash 直接访问 |

---

## 磁盘结构

### 项目级

```
{project}/
├── .harness/
│   ├── skills/                          # 替代 extensions/
│   │   ├── pdf-processing/
│   │   │   ├── SKILL.md
│   │   │   ├── FORMS.md
│   │   │   └── scripts/
│   │   │       └── extract.py
│   │   └── code-review/
│   │       └── SKILL.md
│   ├── skills.json                      # {"enabled": ["pdf-processing", "code-review"]}
│   ├── agents/
│   │   ├── Planner.json                 # 增加 "skills": ["code-review"]
│   │   └── Implementer.json             # 增加 "skills": ["pdf-processing", "code-review"]
│   └── harness.json                     # 节点 overrides.skills 可覆盖
```

### 全局级

```
~/.claude/
└── skills/                              # 全局技能池
    ├── coding-standards/
    │   └── SKILL.md
    └── api-design/
        ├── SKILL.md
        └── templates/
            └── openapi-template.yaml
```

### 废弃

```
{project}/.harness/extensions/           # 废弃
{project}/.harness/extensions.json       # 废弃
```

---

## UI 变更

### Skills 面板（替代 ExtensionPanel）

- 标签切换：**全局** / **项目**
- 技能列表：名称、描述、来源标识（全局/项目）、启用开关
- CRUD：创建、编辑、删除技能
- 全局技能操作读写 `~/.claude/skills/`
- 项目技能操作读写 `.harness/skills/`

### Agent 配置（AgentPanel / NodeDetailPanel）

- 新增 **Skills** 区域
- 从已启用的技能池中多选绑定
- 显示当前绑定的技能列表
- 节点级 overrides 中可覆盖 Agent 默认技能列表

---

## 迁移策略

1. 扫描 `.harness/extensions/` 下的现有 extension
2. 将每个 extension 的 `prompt.md` 转为 `SKILL.md` 格式（补充 YAML 前置元数据 name + description）
3. 移动到 `.harness/skills/{id}/SKILL.md`
4. 从 `extensions.json` 迁移到 `skills.json`
5. `extension-service.ts` 标记 deprecated，保留一个版本周期后删除

---

## 涉及文件清单

### 新增

| 文件 | 说明 |
|------|------|
| `src/types/skill.ts` | SkillMeta, SkillPoolConfig, SkillBinding 类型 |
| `src/services/skill-service.ts` | 技能池扫描、配置、CRUD、解析 |
| `src-tauri/src/commands/skills.rs` | Rust 后端技能文件操作 |

### 修改

| 文件 | 变更 |
|------|------|
| `src/types/harness.ts` | AgentDefinition + skills, AgentNodeConfig.overrides + skills |
| `src/types/claude.ts` | RunRequest + skills, 新增 SkillBinding |
| `src/services/engine/prompt-assembler.ts` | AssembleOptions + skills, 注入 Available Skills |
| `src/services/engine/state-machine.ts` | executeAgentNode 中解析技能并传递 |
| `src/services/claude/claude-runner.ts` | RunAgentOptions + skills, 传入 RunRequest |
| `scripts/sdk-runner.mjs` | 新增 createSkillKit(), 集成到 options.mcpServers |
| `src/stores/harnessStore.ts` | 技能相关状态管理 |
| `src/pages/Workspace/index.tsx` | Skills 面板路由 |
| `src-tauri/src/lib.rs` | 注册新命令 |

### 废弃

| 文件 | 说明 |
|------|------|
| `src/types/extension.ts` | 由 skill.ts 替代 |
| `src/services/extension-service.ts` | 由 skill-service.ts 替代 |
