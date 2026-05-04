# Omni Fabric v2 — 云端 Agent 团队协作平台

## 1. 愿景定位

### 1.1 一句话描述

云端 agent 团队协作平台，让 AI agent 作为团队成员参与开发工作流，通过 DAG 编排和质量反馈循环保证执行质量。

### 1.2 核心问题

AI 驱动的开发缺乏结构和可重复性。每次都是从零开始的对话，没有流程、没有验证、没有积累。Omni Fabric v2 要解决的是：**让 AI 驱动的开发从"一次性对话"变成"可重复、可迭代、可信赖的流程"**。

### 1.3 目标用户

熟练使用 AI 辅助开发的个人开发者和小团队（3-10 人），已经不满足于单次对话式 AI 编程，想要把复杂的开发任务（端到端功能开发、bug 修复）结构化地交给 agent 执行，并对输出质量有要求。

### 1.4 竞品定位

与 Multica（24k stars）在同一赛道，但差异化明确：

| 维度 | Multica | Omni Fabric v2 |
|------|---------|----------------|
| 工作模型 | Issue 驱动（任务 → 认领 → 执行） | **DAG 编排**（节点 → 质量验证 → 流转） |
| 质量保证 | 基础（任务完成/失败） | **深度**（约束检查、互审、gate、重试路由） |
| 执行模式 | 单 agent 独立执行 | **多 agent 协作执行**（并行、串行、条件分支） |
| 可观测性 | 任务状态 | **执行过程全链路追踪** |

Multica 解决的是"怎么让 agent 融入团队工作流"，Omni Fabric v2 解决的是"怎么让 agent 的执行结果更可靠"。

---

## 2. 技术栈

| 层 | 技术 |
|----|------|
| 前端 | Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4 |
| 图编辑器 | ReactFlow (@xyflow/react) |
| 状态管理 | Zustand |
| UI 组件 | shadcn/ui + Lucide Icons |
| 后端 API | Go (Chi router) |
| 数据库 | PostgreSQL 17 |
| 实时通信 | WebSocket (gorilla/websocket) |
| 任务队列 | 内置 Go job queue（或 Redis-based） |
| Agent 执行 | Local Daemon (Go binary) |
| 部署 | Cloud (Next.js + Go API) + Local Daemon |

### 2.1 仓库结构

```
omni-fabric/
├── web/                    # Next.js 前端
│   ├── app/                # App Router pages
│   ├── components/         # React 组件
│   ├── lib/                # 工具函数、API 客户端
│   ├── stores/             # Zustand stores
│   └── types/              # TypeScript 类型
├── api/                    # Go 后端
│   ├── cmd/                # 入口（api server, daemon）
│   ├── internal/
│   │   ├── handler/        # HTTP handlers
│   │   ├── service/        # 业务逻辑
│   │   ├── repository/     # 数据库访问
│   │   ├── model/          # 数据模型
│   │   └── agent/          # Agent 执行引擎
│   ├── migrations/         # 数据库迁移
│   └── go.mod
├── daemon/                 # Local Daemon
│   ├── cmd/                # Daemon 入口
│   ├── internal/
│   │   ├── executor/       # Agent 执行器
│   │   ├── adapter/        # CLI 适配器
│   │   ├── watcher/        # 文件监听
│   │   └── sync/           # 云端同步
│   └── go.mod
└── shared/                 # 共享协议定义
    └── proto/              # gRPC/WebSocket 协议
```

---

## 3. 核心概念模型

### 3.1 Agent（智能体）

Agent 是平台中的"团队成员"，有身份和能力。

```typescript
interface Agent {
  id: string;
  name: string;              // "Planner", "Implementer", etc.
  description: string;       // 能力描述
  avatar?: string;           // 头像
  tags: string[];            // ["planning", "coding", "review"]
  cliBindings: CLIBinding[]; // 绑定的 CLI 后端
  defaultConfig: AgentConfig;
  isBuiltin: boolean;
}

interface CLIBinding {
  cliType: CLIType;          // "claude-code" | "codex" | "copilot" | ...
  model?: string;            // 默认模型
  maxTurns?: number;
  allowedTools?: string[];
}

type CLIType = "claude-code" | "codex" | "copilot" | "gemini" | "openclaw";
```

### 3.2 Harness（编排）

Harness 是一个 DAG，定义了 agent 之间的协作流程。

```typescript
interface HarnessDefinition {
  id: string;
  name: string;
  description?: string;
  nodes: HarnessNode[];
  edges: HarnessEdge[];
  isTemplate: boolean;
  tags: string[];
  createdBy: string;         // user id
  teamId?: string;           // 团队归属
}

interface HarnessNode {
  id: string;
  type: "agent" | "condition" | "gate" | "merge";
  position: { x: number; y: number };
  config: AgentNodeConfig | ConditionNodeConfig | GateNodeConfig | MergeNodeConfig;
}

interface AgentNodeConfig {
  agentId: string;           // 绑定的 agent
  cliType?: CLIType;         // 覆盖 agent 默认 CLI
  promptTemplate: string;    // 提示模板
  constraints: Constraint[];
  maxRetries: number;
  onFailAction: OnFailAction; // "retry" | "route" | "abort"
  routeToNodeId?: string;    // 失败时路由到的诊断节点
  contextFilter?: ContextFilter;
  slotBindings?: SlotBinding[];
}
```

### 3.3 Run（执行）

Run 是一次 harness 执行实例。

```typescript
interface Run {
  id: string;
  harnessId: string;
  status: RunStatus;
  startedAt: string;
  completedAt?: string;
  triggerType: "manual" | "api" | "schedule";
  executionLog: ExecutionLogEvent[];
  nodeStates: Map<string, NodeExecutionState>;
  metrics: RunMetrics;
}

interface RunMetrics {
  totalDuration: number;       // ms
  totalTokens: number;
  totalCost: number;           // USD
  constraintPassRate: number;  // 0-1
  retryCount: number;
  agentBreakdown: AgentMetrics[];
}

interface AgentMetrics {
  agentId: string;
  cliType: CLIType;
  duration: number;
  tokens: number;
  cost: number;
  turns: number;
}
```

### 3.4 Quality Loop（质量闭环）

质量闭环是 Omni Fabric v2 的核心差异化，由四个机制组成：

1. **约束检查** — 定义可量化的质量标准，自动验证 agent 输出
2. **Agent 互审** — 一个 agent 审查另一个 agent 的输出，形成反馈循环
3. **Gate 节点** — 人类在关键节点介入审查，确认方向正确
4. **自动重试/路由** — 约束失败时自动触发重试或路由到诊断 agent

---

## 4. 系统架构

### 4.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    Cloud Layer                           │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ Next.js  │  │ Go API   │  │ WebSocket│  │ Job     │ │
│  │ Frontend │  │ (Chi)    │  │ Hub      │  │ Queue   │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬────┘ │
│       │              │              │              │      │
│       └──────────────┴──────────────┴──────────────┘      │
│                              │                            │
│                    ┌─────────┴─────────┐                  │
│                    │   PostgreSQL      │                  │
│                    └───────────────────┘                  │
└─────────────────────────────┬───────────────────────────┘
                              │ WebSocket (persistent)
                              │
┌─────────────────────────────┴───────────────────────────┐
│                  Local Daemon                            │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ State    │  │ CLI      │  │ File     │  │ Sync    │ │
│  │ Machine  │  │ Adapters │  │ Watcher  │  │ Client  │ │
│  └────┬─────┘  └────┬─────┘  └──────────┘  └─────────┘ │
│       │              │                                   │
│       ▼              ▼                                   │
│  ┌──────────────────────┐                                │
│  │  Agent CLI Processes │                                │
│  │  ┌─────┐ ┌─────┐    │                                │
│  │  │Claude│ │Codex│ ...│                                │
│  │  └─────┘ └─────┘    │                                │
│  └──────────────────────┘                                │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Cloud Layer

**Next.js Frontend：**
- App Router 路由
- ReactFlow 视觉化 DAG 编辑器
- 实时执行状态（WebSocket）
- Agent 管理、Harness 管理、Run 查看

**Go API (Chi router)：**
- RESTful API（CRUD 操作）
- WebSocket Hub（实时状态推送）
- Job Queue（异步任务 — 调度 daemon 执行、超时检测、指标聚合）
- 认证（JWT，支持邮箱密码注册 + OAuth GitHub/Google）

**PostgreSQL：**
- Users, Teams, Projects
- Agents, AgentProfiles
- Harnesses, HarnessTemplates
- Runs, RunMetrics, ExecutionLogs

### 4.3 Local Daemon

**State Machine：**
- 从云端接收执行指令
- 驱动 harness 执行（并行调度、约束检查、上下文继承）
- 与现有 `src/services/engine/` 的状态机逻辑等价

**CLI Adapters：**
- 统一接口：`Execute(ctx, request) (<-chan Event, error)`
- 每种 CLI 实现独立适配器
- 处理不同 CLI 的 stdin/stdout 协议差异
- 进程管理（启动、心跳、超时、SIGTERM）

**File Watcher：**
- 监听本地项目目录的文件变更
- 当 agent 执行导致文件变更时，通知云端更新（用于实时 diff 预览）
- 检测项目结构变化（新增/删除文件）并同步

**Sync Client：**
- WebSocket 长连接到云端
- 上报执行状态、日志、指标
- 接收控制指令（暂停、恢复、终止）
- 断线重连机制（指数退避）

### 4.4 CLI 适配器协议

```go
// 统一的 Agent 执行接口
type AgentExecutor interface {
    Execute(ctx context.Context, req ExecuteRequest) (<-chan AgentEvent, error)
    Abort(executionID string) error
    SupportsCLI() CLIType
}

type ExecuteRequest struct {
    ExecutionID   string
    AgentConfig   AgentConfig
    Prompt        string
    SystemPrompt  string
    WorkingDir    string
    AllowedTools  []string
    MaxTurns      int
    MaxBudgetUSD  float64
    SessionID     string  // for resume
}

type AgentEvent struct {
    Type      EventType  // "text" | "tool_use" | "tool_result" | "error" | "done"
    Content   string
    ToolName  string
    ToolInput string
    Timestamp time.Time
}
```

---

## 5. 功能模块

### 5.1 Agent 管理

**Agent Profile：**
- 内置预设 agent（Planner、Implementer、Verifier、Analyzer、Reviewer）
- 用户可创建自定义 agent
- Agent 可绑定多个 CLI 后端，执行时选择可用的

**CLI 适配层：**
- Phase 1 只支持 Claude Code CLI
- Phase 2 扩展到 Codex、Copilot 等
- 每种 CLI 的适配器独立实现，遵循统一接口

### 5.2 Harness 编辑器

**Web ReactFlow Canvas：**
- 从侧边栏拖拽 agent 到 canvas
- 连线定义依赖关系
- 节点配置面板（右侧抽屉）
- 内置模板一键使用

**节点类型：**
- Agent 节点（执行 agent）— 绑定一个 agent，执行 prompt，检查约束
- Condition 节点（条件分支）— 表达式求值，选择一条分支激活
- Gate 节点（人类检查点）— 暂停执行，等待人类审批
- Merge 节点（汇合并行分支）— 等待所有上游分支完成，合并上下文后继续

### 5.3 约束系统

**约束类型：**

| 类型 | 描述 | 示例 |
|------|------|------|
| shell | 执行 shell 命令，检查退出码 | `npm test`, `cargo build` |
| file_contains | 检查文件内容是否包含指定文本 | 文件包含特定函数 |
| expression | 表达式求值 | `context.test_pass_rate > 0.8` |
| lint | 执行 linter 并检查无错误 | `eslint --max-warnings 0` |
| type_check | 执行类型检查 | `tsc --noEmit` |
| test_pass | 运行测试并检查通过率 | `pytest --tb=short` |
| agent_eval | 让 agent 自评输出质量 | Verifier agent 评估 |

**约束组合：**
- AND（所有约束必须通过）
- OR（任一约束通过即可）
- 嵌套组合

**失败动作：**
- `retry` — 重试当前节点（最多 N 次）
- `route` — 路由到诊断 agent 节点
- `abort` — 中止整个 harness

### 5.4 Agent 互审模式

内置 "Implement → Review" 模式：

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│ Planner  │ ──▶ │Implementer│ ──▶ │ Reviewer │
│          │     │          │     │          │
└──────────┘     └──────────┘     └────┬─────┘
                                       │
                              ┌────────┴────────┐
                              │                 │
                           通过 ✅           不通过 ❌
                              │                 │
                              ▼                 ▼
                          完成            回到 Implementer
                                          (带审查意见)
```

- Reviewer 的审查意见自动注入 Implementer 的 context
- 最大迭代次数可配置（默认 3 次）
- 超过最大次数转为人工 Gate 节点

### 5.5 Gate 节点（人类检查点）

**功能：**
- 暂停执行，等待人类审批
- 展示上游 agent 的输出（diff 预览、代码高亮）
- 人类可以：批准、拒绝（带意见）、直接编辑
- 审查意见注入下游 agent 的 context

### 5.6 实时执行视图

**DAG 执行状态：**
- 节点颜色反映状态（pending=灰、running=蓝脉冲、success=绿、failed=红）
- 边上显示传递的 context 摘要
- 实时更新，通过 WebSocket 推送

**输出流面板：**
- 底部可展开面板，类似终端
- 按节点分组显示 agent 输出
- 支持搜索和过滤

### 5.7 Run 数据与分析

**每次 Run 自动采集：**
- 总耗时、总 token 消耗、总成本
- 每个节点的耗时、token、成本
- 约束检查结果（通过/失败/重试次数）
- Agent 交互轮次

**Run 对比：**
- 并排对比两次 run 的差异
- 输入差异、配置差异、输出差异、指标差异

---

## 6. Phase 1 详细设计

Phase 1 目标：**核心闭环 Web 版** — 把现有执行引擎搬到 Web 上，支持单 agent CLI（Claude），跑通最小闭环。

### 6.1 Phase 1 范围

**包含：**
- Next.js 前端（DAG 编辑器、执行视图、agent 管理）
- Go API（CRUD、WebSocket、认证）
- PostgreSQL（数据存储）
- Local Daemon（状态机执行引擎 + Claude Code CLI 适配器）
- 约束系统（shell、file_contains、expression）
- Gate 节点（基础人类检查点）
- JSONL 执行日志
- Run 基础指标

**不包含：**
- 多 CLI 支持（Phase 2）
- Agent 互审模式（Phase 2）
- 团队协作（Phase 3）
- Run 对比分析（Phase 4）
- Lint/测试约束（Phase 2）

### 6.2 Phase 1 数据模型

```sql
-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Projects
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agents
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    tags TEXT[] DEFAULT '{}',
    is_builtin BOOLEAN DEFAULT FALSE,
    default_config JSONB DEFAULT '{}',
    system_prompt TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Harnesses
CREATE TABLE harnesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    definition JSONB NOT NULL,  -- nodes, edges
    is_template BOOLEAN DEFAULT FALSE,
    tags TEXT[] DEFAULT '{}',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Runs
CREATE TABLE runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    harness_id UUID REFERENCES harnesses(id),
    status VARCHAR(50) DEFAULT 'pending',  -- pending, running, completed, failed, aborted
    trigger_type VARCHAR(50) DEFAULT 'manual',
    input JSONB DEFAULT '{}',
    metrics JSONB DEFAULT '{}',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Execution Logs (JSONL stored as text)
CREATE TABLE execution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES runs(id),
    node_id VARCHAR(255) NOT NULL,
    attempt INTEGER DEFAULT 1,
    log_type VARCHAR(50) NOT NULL,  -- "node", "harness"
    content TEXT NOT NULL,  -- JSONL lines
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 6.3 Phase 1 API 设计

**REST API：**

```
POST   /api/auth/register
POST   /api/auth/login
GET    /api/users/me

GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
PUT    /api/projects/:id
DELETE /api/projects/:id

GET    /api/projects/:projectId/agents
POST   /api/agents
GET    /api/agents/:id
PUT    /api/agents/:id

GET    /api/projects/:projectId/harnesses
POST   /api/harnesses
GET    /api/harnesses/:id
PUT    /api/harnesses/:id
DELETE /api/harnesses/:id

POST   /api/harnesses/:id/runs
GET    /api/runs/:id
GET    /api/runs/:id/logs
POST   /api/runs/:id/abort
POST   /api/runs/:id/gate/:nodeId/approve
POST   /api/runs/:id/gate/:nodeId/reject

WebSocket /ws/runs/:id  — 实时执行状态
```

### 6.4 Phase 1 Local Daemon 设计

```
daemon/
├── cmd/daemon/main.go           # 入口
├── internal/
│   ├── config/config.go         # 配置加载
│   ├── daemon/daemon.go         # Daemon 主循环
│   ├── sync/websocket.go        # 云端 WebSocket 客户端
│   ├── executor/
│   │   ├── state_machine.go     # 状态机（从 TypeScript 移植）
│   │   ├── constraint.go        # 约束检查器
│   │   ├── context.go           # 上下文解析器
│   │   ├── prompt.go            # 提示组装器
│   │   └── logger.go            # JSONL 日志
│   └── adapter/
│       ├── adapter.go           # 统一接口
│       └── claude/
│           └── claude.go        # Claude Code CLI 适配器
└── go.mod
```

### 6.5 Phase 1 页面结构

```
/app
├── (auth)/
│   ├── login/page.tsx
│   └── register/page.tsx
├── projects/
│   ├── page.tsx                 # 项目列表
│   └── new/page.tsx             # 创建项目
├── projects/[projectId]/
│   ├── layout.tsx               # 项目布局（侧边栏 + 内容）
│   ├── page.tsx                 # 项目概览
│   ├── agents/
│   │   ├── page.tsx             # Agent 列表
│   │   └── [agentId]/page.tsx   # Agent 详情
│   ├── harnesses/
│   │   ├── page.tsx             # Harness 列表
│   │   ├── new/page.tsx         # 创建 harness
│   │   └── [harnessId]/
│   │       ├── page.tsx         # Harness 编辑器（ReactFlow canvas）
│   │       └── runs/page.tsx    # Harness 的运行记录
│   └── runs/
│       ├── page.tsx             # 所有运行记录
│       └── [runId]/
│           ├── page.tsx         # 运行详情（DAG 执行状态 + 输出）
│           └── compare/page.tsx # Run 对比（Phase 4）
└── settings/
    └── page.tsx                 # 用户设置
```

---

## 7. 设计系统

保留现有 Omni Fabric 的设计语言（OKLCH、玻璃态、紧凑间距），适配 Web 端：

- 色彩体系不变（OKLCH 灰阶 + 语义色）
- 玻璃态层级不变（subtle/glass/strong/card）
- 排版层级不变
- 组件规范不变（按钮、Badge、卡片等）
- 动画和过渡不变

主要变化：
- 移除 Tauri 特有的布局约束（固定窗口尺寸）
- 适配响应式布局（最小宽度 1280px）
- 保持现有的设计文档（DESIGN.md）作为参考

---

## 8. 技术决策记录

### 8.1 为什么选 Go 而不是 Node.js

- 与 Multica 保持一致的技术选择，降低社区认知成本
- Go 的并发模型（goroutine）天然适合 agent 执行的并行调度
- 单二进制部署，用户安装 daemon 更简单
- 性能更好，daemon 作为常驻进程需要低内存占用

### 8.2 为什么保留 DAG 而不是转向 Issue 驱动

- DAG 编排是 Omni Fabric 的核心差异化，Multica 没有
- DAG 天然支持质量反馈循环（约束检查、重试路由、互审）
- Issue 驱动更适合松耦合的任务分配，DAG 更适合紧耦合的工作流
- 未来可以通过"从 Issue 自动生成 DAG"来桥接两种模型

### 8.3 为什么 Cloud + Local Daemon

- Agent CLI 必须运行在用户本地（需要访问本地代码库、git、终端）
- 云端提供协作、存储、实时状态同步
- 与 Multica 相同的架构模式，用户理解成本低
- Daemon 可以独立运行，断网时也能执行

### 8.4 为什么全新实现而不是迁移

- 现有 Tauri + TypeScript 代码库的技术栈与目标差异太大
- 后端从 TypeScript 迁移到 Go 几乎是重写
- 前端从 Vite + React Router 迁移到 Next.js App Router 也是重大变化
- 全新实现可以避免迁移过程中的兼容性负担
- 现有代码库的设计（状态机、约束检查、上下文继承）作为参考，逻辑移植而非代码迁移
