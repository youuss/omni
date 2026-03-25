# Harness Engineering Pivot — Design Spec

> Omni Fabric 从 spec-driven 开发工具转型为 harness engineering 工具。Harness 成为日常项目开发迭代的核心，支持灵活的 agent 编排、约束验证、条件分支和失败路由。

---

## 1. 核心理念

- **Harness 是主角**：不再围绕 requirements.md 构建流程，harness 本身就是可复用、可配置的开发蓝图
- **各司其职**：每个 agent 有明确职责，约束失败不回喂原 agent，而是路由到专门的诊断/修复流程
- **输入自由**：harness 的输入由用户定义（可以是 task description、bug report、code diff，任何东西）
- **全程可观测**：每一步执行（agent 调用、约束检查、条件评估）都有 JSONL 日志记录

---

## 2. 节点类型系统

### 2.1 Agent 节点

两种来源：内置预设和自定义。

**内置预设**（提供默认 slots 和 prompt，可覆盖）：

| Preset | 默认行为 | 典型用途 |
|--------|----------|----------|
| `planner` | 读取输入，产出计划文档 | 需求分析、方案设计 |
| `coder` | 读取计划/上下文，执行代码修改 | 功能开发、重构 |
| `verifier` | 读取代码变更，运行验证，输出报告 | 测试、质量检查 |
| `reviewer` | 读取上下文，输出 review 意见 | 代码审查 |

**自定义 agent**：无预设 slots/prompt，完全由用户定义。用户在 `.claude/agents/{Name}.md` 写 prompt，在节点上配置 slots 和 constraints。

**Agent 节点属性**：

```typescript
interface AgentNodeConfig {
  agentId?: string            // 引用 .claude/agents/{Name}.md
  agentPreset?: string        // 内置类型: planner/coder/verifier/reviewer
  inputSlots?: SlotDef[]
  outputSlots?: SlotDef[]
  constraints?: NodeConstraint[]
  contextFilter?: string[]    // 只继承指定上游节点的 context
  overrides?: {
    model?: string
    maxTurns?: number
    maxBudgetUsd?: number
    allowedTools?: string[]
    promptExtra?: string
    permissionMode?: PermissionMode
  }
  // 动态路由（层级模式）：agent 输出决定激活哪些下游节点
  routing?: {
    outputKey: string              // agent 输出中包含路由决策的 slot 名
    branches: Record<string, string>  // 决策值 → nodeId
    defaultBranch?: string         // 无匹配时的默认 nodeId
  }
}

interface SlotDef {
  name: string
  description?: string
  filePattern?: string        // 如 "*.md", "src/**/*.ts"
}
```

### 2.1.1 编排模式

四种通过 agent/condition/gate 节点组合实现的编排模式：

| 模式 | 画布形态 | 实现方式 |
|------|----------|----------|
| **接力模式** | A → B → C | 线性 agent 链，上下文自动传递 |
| **路由模式** | A → Condition → B / C | Condition 节点按静态表达式分支 |
| **层级模式** | Orchestrator → X / Y / Z | Agent 节点带 `routing` 配置，运行时动态决定激活哪些下游 |
| **自由网络模式** | 任意拓扑 | 任意 DAG，无依赖的节点并行执行 |

**层级模式执行流程**：Orchestrator agent 执行 → 引擎读取 `outputs[routing.outputKey]` → 匹配 `routing.branches` → 激活对应下游节点，其余 skip。

### 2.2 Condition 节点

基于上游 context 做路径分支，不调用 SDK。

```typescript
interface ConditionNodeConfig {
  expression: string                    // 如 "nodes.coder.exitCode === 0"
  branches: Record<string, string>      // { "true": nodeId, "false": nodeId }
}
```

### 2.3 Gate 节点

暂停执行，等待用户确认后继续。

```typescript
interface GateNodeConfig {
  gateMessage?: string    // 提示用户看什么再确认
}
```

### 2.4 完整节点定义

```typescript
interface HarnessNode {
  id: string
  type: "agent" | "condition" | "gate"
  position: { x: number; y: number }

  // 按 type 分别使用以下配置
  agent?: AgentNodeConfig
  condition?: ConditionNodeConfig
  gate?: GateNodeConfig
}
```

---

## 3. 数据流与上下文模型

### 3.1 Context 对象

每个节点执行完毕后产出：

```typescript
interface NodeContext {
  nodeId: string
  outputs: Record<string, string>      // slotName → 文件路径或内容
  exitCode: number | null
  metadata: Record<string, unknown>    // 自定义数据（test count, lint errors 等）
}
```

### 3.2 上下文传递规则

1. **自动继承**：下游节点默认能访问所有上游节点的 context（按拓扑序累积）
2. **Slot 绑定**（可选）：连线上可声明 `{ from: "planner.plan", to: "coder.input" }`，此时该 input slot 只接收绑定的数据
3. **上下文过滤**（可选）：节点声明 `contextFilter: ["nodeA", "nodeB"]`，只继承指定上游

### 3.3 Prompt 注入顺序

执行时 agent prompt 按以下顺序拼接：

1. Agent 自身的 prompt template（`.claude/agents/{Name}.md`）
2. 启用的 extensions
3. 上游 context 中与 input slots 匹配的内容（作为 `<context>` 块注入）
4. 节点级 `promptExtra`

---

## 4. 约束系统

### 4.1 约束定义

约束是节点的属性，不是独立节点。

```typescript
interface NodeConstraint {
  name: string
  check: ConstraintCheck
  onFail: OnFailAction
  maxRetries?: number              // 默认 3
}

type ConstraintCheck =
  | { type: "shell"; command: string }
  | { type: "file_contains"; path: string; pattern: string }
  | { type: "expression"; expr: string }

type OnFailAction =
  | { type: "retry" }                          // 重试自己（简单场景）
  | { type: "route"; targetNodeId: string }    // 路由到诊断/修复节点
  | { type: "abort" }                          // 终止 harness
```

### 4.2 约束执行流程

```
节点执行完毕
  → 逐一检查 constraints
    → 全部通过 → completed，context 传递给下游
    → 失败 + retry → 重新执行同一节点（注入失败信息）
    → 失败 + route → 目标节点置为 ready，注入 ConstraintFailure context
    → 达到 maxRetries → abort
```

### 4.3 约束失败上下文

路由到诊断节点时自动注入：

```typescript
interface ConstraintFailure {
  constraintName: string
  checkType: string
  command?: string
  exitCode?: number
  stdout?: string
  stderr?: string
  attempt: number
  sourceNodeId: string
  sourceNodeContext: NodeContext
}
```

### 4.4 画布上的失败路由

约束失败路由在画布上用虚线/红线显示，与正常连线视觉区分。定义在 harness 级别：

```typescript
interface FailureRoute {
  fromNodeId: string
  constraintName: string
  toNodeId: string
}
```

---

## 5. 日志系统

### 5.1 设计原则

**所有执行行为都记录**：agent 调用、约束检查（含 shell 命令 stdout/stderr）、条件评估、gate 等待。

### 5.2 文件结构

```
.harness/runs/{runId}/
  run.json                         # harnessId, inputs, timestamps
  state.json                       # 执行状态机快照（支持中断恢复）
  execution.jsonl                  # harness 级执行流日志
  logs/
    {nodeId}.{attempt}.jsonl       # 每个节点每次执行的详细日志
  outputs/
    {nodeId}/                      # 每个节点的产出文件
```

### 5.3 节点日志事件类型

每个 `{nodeId}.{attempt}.jsonl` 中的事件：

| type | 来源 | 说明 |
|------|------|------|
| `node_start` | 执行引擎 | 节点开始，记录 attempt 序号 |
| `node_end` | 执行引擎 | 节点结束，exitCode + durationMs |
| `sdk_message` | Agent 节点 | Claude SDK 原始 SDKMessage |
| `context_inject` | 执行引擎 | 注入了哪些上游 context/slots |
| `context_output` | 执行引擎 | 节点产出了哪些 outputs |
| `constraint_check` | 约束系统 | 约束名、命令、exitCode、stdout/stderr |
| `constraint_retry` | 约束系统 | 重试 attempt、失败原因、注入的上下文 |
| `constraint_route` | 约束系统 | 路由目标、失败信息 |
| `condition_eval` | Condition 节点 | 表达式 + 结果 + 选择的分支 |
| `gate_wait` | Gate 节点 | 暂停等待用户确认 |
| `gate_resume` | Gate 节点 | 用户确认继续 |
| `error` | 任意 | 执行异常 |

### 5.4 Harness 级日志

`execution.jsonl` 记录整体执行流程：

```jsonl
{"ts":"...","type":"harness_start","harnessId":"...","nodes":["planner","coder","verifier"]}
{"ts":"...","type":"node_dispatch","nodeId":"planner","attempt":0}
{"ts":"...","type":"node_complete","nodeId":"planner","exitCode":0,"logFile":"logs/planner.0.jsonl"}
{"ts":"...","type":"constraint_route","fromNode":"coder","constraint":"build-pass","toNode":"diagnostor"}
{"ts":"...","type":"condition_branch","nodeId":"check","branch":"success"}
{"ts":"...","type":"harness_end","success":true,"durationMs":120000}
```

---

## 6. 执行引擎

### 6.1 状态机

从线性 topoSort + for 循环改为事件驱动状态机。

**节点状态**：

```typescript
type NodeState =
  | "pending"      // 等待上游完成
  | "ready"        // 上游已完成，等待调度
  | "running"      // 执行中
  | "checking"     // 约束检查中
  | "completed"    // 全部约束通过
  | "failed"       // 达到 maxRetries 或 abort
  | "skipped"      // 条件分支未选中
```

### 6.2 调度逻辑

```
1. 初始化：所有入口节点（无上游依赖）→ ready
2. 循环：
   a. 取所有 ready 节点 → 并行执行
   b. 节点执行完 → checking
   c. 逐一跑 constraints：
      - 全部通过 → completed → 下游依赖已满足的节点 → ready
      - 失败 + retry → 回到 running
      - 失败 + route → 目标节点 → ready（注入 ConstraintFailure）
      - 达到 maxRetries → failed
   d. condition 节点：评估 → 选中分支下游 → ready，其余 → skipped
   e. gate 节点：→ waiting → 用户确认后下游 → ready
3. 终止：没有 ready / running / checking 节点
```

### 6.3 并行执行

无依赖关系的节点同时执行。下游节点在**所有上游依赖都 completed** 后才变 ready。

### 6.4 状态持久化

`state.json` 保存当前状态机快照，支持：
- Gate 暂停后恢复
- 意外关闭后重启继续
- 执行历史回看

---

## 7. Harness 定义结构

### 7.1 完整定义

```typescript
interface HarnessDefinition {
  id: string
  name: string
  description?: string

  nodes: HarnessNode[]
  connections: HarnessConnection[]      // 正常流
  failureRoutes: FailureRoute[]         // 约束失败路由

  inputs?: HarnessInput[]               // harness 级输入声明
  defaults?: {
    model?: string
    maxBudgetUsd?: number
    permissionMode?: PermissionMode
  }
}

interface HarnessConnection {
  id: string
  sourceNodeId: string
  targetNodeId: string
  slotBinding?: {                       // 可选显式绑定
    fromSlot: string
    toSlot: string
  }
}

interface HarnessInput {
  name: string                          // 如 "task", "bugReport", "codeContext"
  description?: string
  required?: boolean
  default?: string
}
```

### 7.2 模板

模板 = harness 定义本身（不含 run 数据）。

**内置模板**：

| 模板 | 节点组成 | 适合场景 |
|------|----------|----------|
| `develop` | planner → coder (constraints: build) → reviewer | 日常功能开发 |
| `fix` | diagnostor → fixer (constraints: build+test) | Bug 修复 |
| `review` | analyzer → reviewer → gate | 代码审查 |

用户可将调好的 harness 保存为自定义模板。

---

## 8. UI 变化

### 8.1 画布（核心交互区）

- 画布从辅助变为主角
- 节点显示：当前状态、约束列表、retry 次数
- 约束失败路由用虚线/红线显示
- Condition 节点显示分支标签
- Gate 节点有"暂停"视觉状态和确认按钮
- 执行时活跃路径高亮，skipped 路径变灰

### 8.2 节点详情面板（右侧）

| Tab | 内容 |
|-----|------|
| **Config** | agent 选择、model、maxTurns、budget、permissionMode |
| **Slots** | input/output slot 编辑，slot 绑定预览 |
| **Constraints** | 约束列表增删改，check + onFail 配置 |
| **Prompt** | prompt template 预览 + promptExtra 编辑 |
| **Logs** | 节点 JSONL 日志浏览（按 attempt 切换） |

### 8.3 输入面板（取代 ContentTabs）

- 执行前：根据 `harness.inputs` 动态生成输入表单/编辑器
- 执行中：实时流式输出（当前活跃节点）
- 执行后：按节点浏览输出和日志

### 8.4 顶部栏

- Harness 名称 + 描述
- 模板选择 / 保存为模板
- Inputs 快捷入口
- Run 按钮 + 执行模式选择

### 8.5 执行模式

| 模式 | 行为 |
|------|------|
| **Run All** | 正常执行整个 harness |
| **Run From Node** | 从指定节点开始，复用之前的 context |
| **Step** | 每个节点执行完暂停，手动确认下一步 |

---

## 9. 需要移除/重构的现有代码

### 移除

| 文件/模块 | 原因 |
|-----------|------|
| `CATEGORY_FILES` (harness-service.ts) | 硬编码的 category → 文件映射，被 slots 取代 |
| `deriveFileTabs()` (harness-service.ts) | 按 category 自动生成 tab，被动态输入面板取代 |
| `ContentTabs.tsx` | requirements.md 为核心的文件 tab UI，被输入面板 + 节点日志浏览取代 |
| `useRunFiles.ts` | 基于 category 加载文件，被 per-node output 浏览取代 |

### 重构

| 文件/模块 | 变化 |
|-----------|------|
| `harness-executor.ts` | 从 topoSort + for 循环改为事件驱动状态机 |
| `HarnessNode` 类型 (harness.ts) | 增加 type, slots, constraints, contextFilter |
| `HarnessDefinition` 类型 (harness.ts) | 增加 failureRoutes, inputs, defaults |
| `AgentNode.tsx` | 显示更多信息（状态、约束、retry），支持新节点类型渲染 |
| `NodeDetailPanel.tsx` | 增加 Slots、Constraints、Logs tab |
| `WorkspaceHeader.tsx` | 增加执行模式选择、inputs 入口 |
| `harnessStore.ts` | 增加 failureRoutes 管理、节点状态机 |
| `outputStore.ts` | 适配 per-node JSONL 日志 |
| `claude-runner.ts` | 支持约束检查的 shell 命令执行 |
| `sdk-runner.mjs` | 适配新的 RunRequest 结构 |

### 保留

| 文件/模块 | 原因 |
|-----------|------|
| `HarnessCanvas.tsx` | ReactFlow 画布，增强但不重写 |
| `stream-parser.ts` | JSONL 解析逻辑复用 |
| `session-store.ts` | Session resume 机制保留 |
| Agent prompt 文件约定 (`.claude/agents/`) | 保留，slots 是补充不是替代 |
| Extension 系统 | 保留，仍然注入到 prompt |
| Domain 系统 | 保留，作为上下文来源 |
| Tauri 后端命令 | 增强但不重写 |

---

## 10. 迁移策略

内置模板 `develop` / `fix` / `review` 应覆盖当前 spec-driven 流程的常见用法，使现有用户能平滑过渡。旧的 `CATEGORY_FILES` 约定不做向后兼容 — 直接替换。
