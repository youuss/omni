# Omni Fabric

> AI-powered spec-driven development platform — 基于规格驱动的 AI 开发平台

Omni Fabric 是一个桌面端开发工具，通过可视化编排多个 AI Agent 的工作流来驱动软件开发。开发者定义需求规格，平台自动编排 Planner、Implementer、Verifier 等 Agent 完成从规划到实现到验证的完整流程。

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri v2 (Rust) |
| 前端 | React 19 + TypeScript |
| 状态管理 | Zustand |
| 路由 | React Router DOM v7 |
| 样式 | Tailwind CSS v4 |
| UI 组件 | base-ui + shadcn/ui + Lucide Icons |
| 流程编辑 | ReactFlow (@xyflow/react) |
| Markdown | react-markdown + remark-gfm + react-syntax-highlighter |
| 序列化 | serde / serde_json |
| AI 引擎 | Claude CLI (子进程调用) |

## 核心概念

### 变更 (Change)

变更是开发任务的基本单元。每个变更包含需求文档、开发计划、验证报告等结构化文件，存储在 `.specs/active/{changeName}/` 目录下。完成后可归档到 `.specs/archive/`。

### Agent 池

Agent 是执行具体任务的 AI 角色。平台提供四个内置 Agent：

| Agent | 类别 | 输入 | 输出 | 职责 |
|-------|------|------|------|------|
| Planner | planner | requirements.md | dev-plan.md | 分析需求，制定开发计划 |
| Implementer | implementer | dev-plan.md | 代码 | 按计划实现代码 |
| Verifier | verifier | dev-plan.md | verification-report.md | 验证实现是否符合计划 |
| Analyzer | custom | requirements.md | fix-plan.md | 分析 Bug，制定修复方案 |

支持创建自定义 Agent，配置输入/输出端口 (Port)、提示词模板、工具权限、最大轮次等。

### Pipeline (流程编排)

Pipeline 定义了 Agent 的执行顺序和数据流。通过 ReactFlow 可视化编辑器，将 Agent 拖入画布、连线组成工作流。支持：

- **拓扑排序执行**：自动计算依赖关系，按正确顺序执行
- **端口连接**：Agent 间通过端口传递文件和文本数据
- **模板变量**：`{{changeName}}` 等变量在运行时自动替换
- **节点配置覆盖**：每个节点可单独覆盖 `maxTurns`、`allowedTools`、`promptExtra`
- **模板保存**：将编排方案保存为模板，复用到不同变更

内置模板：
- **SDD (Spec-Driven Development)**：Planner → Implementer → Verifier
- **BugFix**：Analyzer → Implementer → Verifier

### Skill (技能)

Skill 是注入给 Agent 的自定义 MCP 工具，存储在 `.claude/skills/` 下，可按需启用/禁用。

## 架构

### 前端结构

```
src/
├── App.tsx                    # 路由配置
├── components/
│   ├── Layout.tsx             # 全局布局：左侧导航 + 顶栏 + 内容区
│   ├── MarkdownRenderer.tsx   # Markdown 渲染
│   ├── StatusBadge.tsx        # 状态标签
│   └── ui/                    # shadcn/ui 基础组件
├── pages/
│   ├── Projects/              # 项目管理页
│   ├── Workspace/             # 工作台 (核心页面)
│   │   ├── index.tsx          # 工作台主组件
│   │   ├── WorkspaceHeader.tsx
│   │   ├── ContentTabs.tsx    # 变更文件标签编辑器
│   │   ├── PipelineBoard.tsx  # 流程状态条
│   │   ├── PipelineCanvas.tsx # ReactFlow 可视化编排
│   │   ├── AgentNode.tsx      # 编排节点组件
│   │   ├── OutputStream.tsx   # 终端输出面板
│   │   ├── ChangeList.tsx     # 变更列表
│   │   ├── CodebaseTree.tsx   # 代码目录树
│   │   ├── SpecPanel.tsx      # 规格面板
│   │   ├── ArchivePanel.tsx   # 归档面板
│   │   ├── WorkspaceDrawer.tsx # 右侧抽屉面板
│   │   ├── WorkspaceDialogs.tsx
│   │   ├── useChangeFiles.ts  # 变更文件管理 Hook
│   │   ├── useAgentRunner.ts  # Agent 运行 Hook
│   │   └── usePipelineRunner.ts # Pipeline 运行 Hook
│   ├── Agents/                # Agent 管理页
│   ├── Skills/                # Skill 管理页
│   └── Settings/              # 设置页
├── services/
│   ├── agent-service.ts       # Agent 扫描、配置、元数据
│   ├── pipeline-service.ts    # Pipeline 加载/保存/模板
│   ├── pipeline-executor.ts   # Pipeline 执行引擎
│   ├── spec.ts                # 变更/归档/域管理
│   ├── project.ts             # 项目管理
│   ├── skill-service.ts       # Skill 扫描/配置
│   ├── workflow.ts            # 工作流阶段管理
│   └── claude/
│       ├── claude-runner.ts   # Claude CLI 子进程管理
│       ├── agent-config-service.ts
│       ├── agent-configs.ts   # 内置 Agent 配置
│       ├── session-store.ts   # 会话持久化
│       └── stream-parser.ts   # 输出流解析
├── stores/
│   ├── projectStore.ts        # 项目状态
│   ├── workflowStore.ts       # 工作流状态
│   ├── pipelineStore.ts       # Pipeline 状态
│   └── outputStore.ts         # 终端输出
└── types/
    ├── index.ts               # 通用类型
    ├── pipeline.ts            # Pipeline/Agent/Port 类型
    ├── project.ts             # 项目类型
    └── workflow.ts            # 工作流/变更/归档类型
```

### 后端结构 (Tauri/Rust)

```
src-tauri/
├── src/
│   ├── main.rs                # 入口
│   ├── lib.rs                 # Tauri 命令注册
│   └── commands/
│       ├── mod.rs
│       ├── project.rs         # 项目 CRUD
│       ├── spec.rs            # 变更/归档管理
│       ├── file.rs            # 文件读写/目录扫描
│       ├── agents.rs          # Agent 扫描/读写
│       ├── skills.rs          # Skill 扫描/读写
│       └── pipeline.rs        # Pipeline 读写/模板管理
├── resources/agents/          # 内置 Agent Prompt
│   ├── Planner.md
│   ├── Implementer.md
│   ├── Verifier.md
│   └── Analyzer.md
└── Cargo.toml
```

### 项目目录约定

Omni Fabric 在项目中使用以下目录结构存储配置和数据：

```
{project}/
├── .claude/
│   ├── agents/                # Agent 定义文件 (*.md)
│   └── skills/                # Skill 定义
│       └── {SkillId}/SKILL.md
├── .specs/
│   ├── active/                # 活跃变更
│   │   └── {changeName}/
│   │       ├── requirements.md
│   │       ├── dev-plan.md
│   │       ├── verification-report.md
│   │       ├── meta.json      # Pipeline 绑定
│   │       └── images/
│   ├── archive/               # 归档变更
│   │   └── YYYY-MM-DD-{name}/
│   └── domains/               # 领域定义
└── .omni/
    ├── agents-config.json     # Agent 启用配置
    ├── skills-config.json     # Skill 启用配置
    ├── pipeline.json          # 当前 Pipeline
    └── pipelines/             # Pipeline 模板
        └── {templateId}.json
```

## 工作流

```
创建变更 → 编写需求 → 选择/编排 Pipeline → 执行 Pipeline → 归档
   │                        │                    │
   ├── requirements.md      ├── 拖拽 Agent       ├── Planner → dev-plan.md
   └── meta.json             ├── 连线端口          ├── Implementer → 代码
                             └── 配置覆盖          └── Verifier → verification-report.md
```

1. **创建变更**：命名并选择 Pipeline 模板，可预填需求草稿
2. **编写需求**：在 ContentTabs 中编辑 `requirements.md`
3. **编排 Pipeline**：通过 PipelineCanvas 可视化编辑 Agent 工作流
4. **执行 Pipeline**：按拓扑顺序依次调用 Claude CLI 执行每个 Agent
5. **查看结果**：实时查看终端输出，审阅生成的文件
6. **归档**：完成后将变更归档保存

## Pipeline 执行引擎

执行流程：

1. **拓扑排序**：根据边的依赖关系计算节点执行顺序
2. **输入解析**：从上游节点输出或端口默认值获取输入文件内容
3. **模板渲染**：将 `{{changeName}}` 等变量替换为实际值
4. **Agent 调用**：通过 Claude CLI 子进程执行 Agent，流式输出到终端
5. **状态追踪**：实时更新节点状态 (idle → running → success/failure)
6. **错误处理**：节点失败时跳过其下游依赖节点，非依赖节点继续执行

## 开发

### 环境准备

- Node.js
- Rust toolchain
- Tauri CLI
- Claude CLI (用于 Agent 执行)

### 启动开发

```bash
# 安装依赖
npm install

# 启动开发服务器 (Tauri + Vite)
npm run tauri dev
```

### 构建

```bash
npm run tauri build
```

## 许可证

Private
