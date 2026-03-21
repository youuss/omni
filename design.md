# Omni 设计体系

## 1. 调色板

全部使用 **OKLCH 色彩空间**。核心灰阶为纯无彩色（chroma = 0），语义色保留 chroma。

### 1.1 灰阶

| 角色 | 变量 | OKLCH | 近似 HEX | 用途 |
|------|------|-------|----------|------|
| 背景 | `--background` | `oklch(0.98 0 0)` | #FAFAFA | body 基底色 |
| 前景 | `--foreground` | `oklch(0.18 0 0)` | #1A1A1A | 正文、标题 |
| 主色 | `--primary` | `oklch(0.22 0 0)` | #141414 | 按钮、active 状态 |
| 次要 | `--secondary` | `oklch(0.96 0 0)` | #F2F2F2 | Badge、次要背景 |
| 静音 | `--muted` | `oklch(0.955 0 0)` | #F0F0F0 | Tab 底色 |
| 静音前景 | `--muted-foreground` | `oklch(0.5 0 0)` | #737373 | 辅助文字（需确保 4.5:1 对比度） |
| 边框 | `--border` | `oklch(0.86 0 0 / 0.6)` | 半透明浅灰 | 分隔线、卡片边框 |
| 输入 | `--input` | `oklch(0.93 0 0)` | #E8E8E8 | 输入框背景 |

### 1.2 语义色

| 角色 | 变量 | OKLCH | 用途 |
|------|------|-------|------|
| 危险 | `--destructive` | `oklch(0.577 0.245 27.325)` | 删除、错误 |
| 成功 | `--success` | `oklch(0.65 0.18 150)` | 完成、通过 |
| 警告 | `--warning` | `oklch(0.78 0.14 85)` | 提示、检查中 |

### 1.3 透明度规范

所有面板、卡片使用 **白色 + 透明度** 叠加于 body 渐变背景之上：

| 层级 | 透明度 | 用途 |
|------|--------|------|
| 浅层 | `oklch(1 0 0 / 0.4)` | 次要面板 |
| 中层 | `oklch(1 0 0 / 0.55)` | 默认玻璃、卡片 |
| 强层 | `oklch(1 0 0 / 0.72)` | 导航、抽屉 |
| 弹层 | `oklch(1 0 0 / 0.80)` ~ `0.88` | Dialog、Popover |

边框统一使用低透明度：`/0.3` ~ `/0.6`，避免硬线条。

### 1.4 状态指示色

Pipeline 运行状态动态点：

| 阶段 | 圆点样式 | 动画 |
|------|----------|------|
| planning | `bg-blue-400` | `animate-pulse` + `shadow-[0_0_6px_rgba(96,165,250,0.5)]` |
| implementing | `bg-indigo-400` | `animate-pulse` + 发光 shadow |
| verifying | `bg-amber-400` | `animate-pulse` + 发光 shadow |
| done | `bg-emerald-500` | 静态 + `shadow-[0_0_6px_rgba(16,185,129,0.5)]` |
| idle | `bg-muted-foreground` | 无 |

> **UX 规则**：`animate-pulse` 仅用于"运行中"状态指示器，不得用于装饰性元素。

---

## 2. 排版

### 2.1 字体栈

| 用途 | 字体栈 | 备选升级方案 |
|------|--------|-------------|
| Sans（UI） | `'DejaVu Sans', 'Inter', -apple-system, ...` | **Space Grotesk + DM Sans**（技术感更强） |
| Mono（代码/终端） | `'DejaVu Sans Mono', 'SF Mono', 'Fira Code', ...` | **JetBrains Mono**（更适合开发者工具） |

> 推荐参考字体配对：
> - **"Developer Mono"**：`JetBrains Mono`（代码） + `IBM Plex Sans`（UI）
> - **"Tech Startup"**：`Space Grotesk`（标题） + `DM Sans`（正文）

### 2.2 字号层级

| 层级 | Tailwind | 像素 | 权重 | 用途 |
|------|----------|------|------|------|
| H1 页面标题 | `text-2xl` | 24px | `font-bold tracking-tight` | 独立页面标题 |
| H2 区域标题 | `text-lg` | 18px | `font-semibold` | 卡片大标题 |
| H3 组件标题 | `text-base` | 16px | `font-medium` | Dialog 标题 |
| 正文 | `text-sm` | 14px | `font-normal` | 段落、列表 |
| 按钮/导航 | `text-xs` | 12px | `font-medium` | 按钮文字、导航项 |
| 辅助 | `text-[11px]` | 11px | — | 面包屑、描述 |
| 标签 | `text-[10px]` | 10px | `uppercase tracking-widest` | 区域标签头 |
| 微标签 | `text-[9px]` | 9px | — | 面板内 Badge |

**body 基准**：`text-[13px] leading-relaxed antialiased`

### 2.3 区域标签统一格式

```
text-[10px] uppercase tracking-widest text-muted-foreground/70
```

> **UX 规则**：长文本使用 `truncate` 或 `line-clamp-*` 防止布局溢出。

---

## 3. 玻璃态（Glassmorphism）

核心视觉语言，四个层级：

| Class | 白色透明度 | 模糊 | 饱和度 | 用途 |
|-------|-----------|------|--------|------|
| `.glass-subtle` | 0.40 | 14px | 1.3 | 次要面板（变更列表区） |
| `.glass` | 0.55 | 20px | 1.4 | 顶部栏、右侧图标栏 |
| `.glass-strong` | 0.72 | 28px | 1.5 | 左侧导航、右侧抽屉 |
| `.glass-card` | 0.55 | 20px | 1.3 | 内容卡片（带 border + hover） |

### 3.1 glass-card hover

```css
.glass-card:hover {
  background: oklch(1 0 0 / 0.65);
  border-color: oklch(0.55 0 0 / 0.25);
  box-shadow: 0 4px 24px -4px oklch(0.22 0 0 / 0.06),
              0 1px 3px oklch(0 0 0 / 0.04);
}
```

### 3.2 body 背景

两层 radial-gradient 椭圆叠加在纯色上，营造微妙的光影：

```css
body {
  background:
    radial-gradient(ellipse 80% 60% at 10% 20%, oklch(0.94 0 0 / 0.3), transparent),
    radial-gradient(ellipse 60% 50% at 85% 80%, oklch(0.92 0 0 / 0.2), transparent),
    oklch(0.98 0 0);
}
```

> **对比度规则**：所有玻璃面板上的文字必须通过 WCAG AA 标准（4.5:1 对比度）。`text-muted-foreground`（oklch 0.5）在 `glass-subtle`（白色 40% 透明度）上的实际对比度需验证。

---

## 4. 圆角体系

基础变量 `--radius: 0.75rem` (12px)，派生：

| Token | 计算值 | 用途 |
|-------|--------|------|
| `--radius-sm` | 6.6px | 按钮 xs/sm |
| `--radius-md` | 9px | 小按钮内部 |
| `--radius-lg` | 12px | 默认按钮 |
| `--radius-xl` | 16.2px | — |
| `--radius-2xl` | 21px | — |

实际用法：

| 元素 | Class | 效果 |
|------|-------|------|
| 按钮默认 | `rounded-xl` | 12px |
| 卡片 / Dialog / 面板 | `rounded-2xl` | 16px |
| Badge | `rounded-4xl` | 全圆 |
| 小按钮 / 内部元素 | `rounded-lg` / `rounded-md` | 8px / 6px |
| 步骤条圆点 | `rounded-full` | 圆形 |

---

## 5. 阴影体系

使用 OKLCH 颜色的复合 box-shadow，避免纯黑色阴影：

| 用途 | 阴影值 |
|------|--------|
| 按钮默认 | `0 1px 3px oklch(0.35 0.02 230/0.2), inset 0 1px 0 oklch(1 0 0/0.1)` |
| 按钮 hover | `0 2px 8px oklch(0.35 0.02 230/0.25), inset 0 1px 0 oklch(1 0 0/0.1)` |
| 步骤 active | `0 2px 12px oklch(0.35 0.02 230/0.3)` + `ring-[3px] ring-primary/15` |
| Dialog | `0 24px 80px -12px oklch(0 0 0/0.15), 0 8px 24px -8px oklch(0 0 0/0.08)` |
| 导航 active | `0 1px 3px oklch(0 0 0/0.04)` |
| glass-card hover | `0 4px 24px -4px oklch(0.22 0 0/0.06), 0 1px 3px oklch(0 0 0/0.04)` |
| 状态点发光 | `0 0 6px oklch(...)` |

---

## 6. 布局结构

### 6.1 全局布局（Layout.tsx）

```
┌────────┬───────────────────────────────────────┐
│ 图标   │ 顶部栏（仅非工作区页面显示, h-11）      │
│ 导航   │──────────────────────────────────────  │
│ w-[52px]│                                       │
│ glass- │ 主内容区 <Outlet />                     │
│ strong │                                        │
│        │──────────────────────────────────────  │
│        │ 底部状态栏 (h-7)                        │
└────────┴───────────────────────────────────────┘
```

- 左侧导航从 180px 文字导航精简为 52px 图标导航
- 工作区内隐藏顶部面包屑栏（由 WorkspaceHeader 接管）

### 6.2 工作区布局（Workspace）

```
┌───────────────────────────────────────┬──────┬──────────┐
│ WorkspaceHeader (h-12)                │ 右   │ 右侧抽屉 │
│ [项目名 / 变更下拉 / 状态 / 操作按钮]  │ 图标 │ w-[380px]│
│───────────────────────────────────────│ 栏   │ glass-   │
│ PipelineBoard (紧凑内联进度条)          │ w-11 │ strong   │
│───────────────────────────────────────│ glass│          │
│ ContentTabs                           │      │ 变更列表 │
│ [需求][规划][验证]                     │      │ Agents   │
│                                       │      │ Skills   │
│ 内容主区域（全高度 flex 自适应）         │      │ 设置     │
│                                       │      │ 代码     │
│───────────────────────────────────────│      │ 规格     │
│ Output Toggle Bar (h-8)               │      │ 归档     │
│ Claude 输出面板（底部可展开，可调高度）   │      │          │
└───────────────────────────────────────┴──────┴──────────┘
```

**关键改动**：
- 移除了 200px 左侧 ChangeList 面板，变更列表通过 Header 下拉 + Drawer "变更"面板访问
- PipelineBoard 从独立卡片改为紧凑内联进度条
- OutputStream 从 Tab 改为底部可展开面板，运行时自动展开
- ContentTabs 移除固定 max-h，改用 flex 全高度自适应

### 6.3 固定高度

| 区域 | 高度 | 像素 |
|------|------|------|
| 工作区顶部栏 | `h-12` | 48px |
| 底部状态栏 | `h-7` | 28px |
| Drawer 标题栏 | `h-11` | 44px |
| Output Toggle Bar | `h-8` | 32px |
| Output 面板 | 可调 | 120-500px |

---

## 7. 组件样式规范

### 7.1 按钮

**Variants**（6 种）：`default` / `outline` / `secondary` / `ghost` / `destructive` / `link`

**Sizes**（7 种）：

| Size | 高度 | 用途 |
|------|------|------|
| `default` | h-8 (32px) | 标准按钮 |
| `xs` | h-6 (24px) | 操作栏、行内 |
| `sm` | h-7 (28px) | 工具栏 |
| `lg` | h-9 (36px) | 大操作 |
| `icon` | 32x32 | 标准图标按钮 |
| `icon-xs` | 24x24 | 紧凑图标按钮 |
| `icon-sm` | 28x28 | 中等图标按钮 |

**约定**：
- 操作栏按钮统一：`size="xs" className="gap-1 h-7 text-[11px]"`
- 面板工具栏：`variant="ghost" size="icon-xs"`
- 所有可点击元素**必须有 `cursor-pointer`**

### 7.2 Badge

**Variants**：`default` / `secondary` / `destructive` / `outline` / `ghost`

| 场景 | 样式 |
|------|------|
| 面板内微 Badge | `text-[9px] h-3.5 px-1` |
| 工具栏 Badge | `text-[10px] h-5 px-2` |
| 状态 Badge | `text-[10px] h-5 px-2 backdrop-blur-sm` + 动态圆点 |

### 7.3 卡片

- 优先使用 `.glass-card` class 而非 `<Card>` 组件
- 卡片：`glass-card rounded-2xl p-4 transition-all duration-300`
- 列表项卡片：`glass-card rounded-xl p-3 transition-all duration-200`

### 7.4 图标容器

```
flex h-7 w-7 items-center justify-center rounded-lg bg-primary/8 text-primary
```

图标尺寸：容器内 `w-3.5 h-3.5`

### 7.5 开关（Switch）

原生实现，不依赖 base-ui：

| 场景 | 轨道 | 圆点 | 偏移 |
|------|------|------|------|
| 面板内 | `h-4 w-7` | `h-3 w-3` | `translate-x-3` |
| 页面 | `h-5 w-9` | `h-4 w-4` | `translate-x-4` |

开启 `bg-primary`，关闭 `bg-input`。

### 7.6 Dialog / AlertDialog

- 圆角：`rounded-2xl`
- 背景：`bg-white/80 backdrop-blur-2xl`
- Footer：`border-t border-border/20 bg-white/40 backdrop-blur-sm`
- Overlay：`bg-black/20 backdrop-blur-sm`
- 进入动画：`fade-in-0 zoom-in-95`
- 退出动画：`fade-out-0 zoom-out-95`

### 7.7 输出日志面板

OutputStream 使用 `.glass-subtle` 风格，与全局玻璃态保持一致：

- 背景：`glass-subtle`（oklch(0.995 0 0 / 0.4) + blur 14px）
- 标题栏：`text-[10px] uppercase tracking-widest text-muted-foreground/60`
- 文字色：`text-foreground/80`（正文）、`text-muted-foreground`（系统）、`text-destructive`（错误）、`text-indigo-600`（工具调用）
- 字体：`font-mono text-[11px] leading-[18px]`
- 时间戳：`text-[9px] text-muted-foreground/40 tabular-nums`

### 7.8 Markdown 代码块

代码块使用暗色主题：`bg-[#1e1e2e]`（Catppuccin Mocha 风格）

---

## 8. 动画与过渡

### 8.1 过渡时长

| 场景 | 时长 | 缓动 |
|------|------|------|
| 按钮/Badge/hover | `duration-200` | 默认 ease |
| 步骤条状态变化 | `duration-300` | 默认 ease |
| 抽屉展开/收起 | `duration-250` | `ease-in-out` |
| 按钮点击反馈 | — | `active:scale-[0.97]` |

### 8.2 进入/退出动画

| 元素 | 进入 | 退出 |
|------|------|------|
| Dialog | `fade-in-0 zoom-in-95` | `fade-out-0 zoom-out-95` |
| Dropdown | `slide-in-from-top-2 fade-in-0 zoom-in-95` | `fade-out-0 zoom-out-95` |
| Tab 切换 | `fade-in-0 slide-in-from-bottom-1 duration-200` | — |
| 状态运行中 | `animate-pulse` | — |

> **UX 规则**：必须尊重 `prefers-reduced-motion`。用户设置减少动画时，所有 `animate-*` 和 `transition` 应被禁用或简化。

---

## 9. 交互模式与 UX 规则

### 9.1 hover 操作显示

列表项操作按钮默认隐藏，hover 时淡入：

```
opacity-0 group-hover:opacity-100 transition-opacity
```

> **注意**：此模式对键盘用户不可见。需确保操作也可通过 `focus-within` 或右键菜单触达。

### 9.2 滚动条

极简样式：`5px` 宽，`oklch(0.7 0 0 / 0.4)`，hover 加深为 `oklch(0.55 0 0 / 0.5)`，透明轨道。

### 9.3 Tooltip

- 统一使用 `<Tooltip>` + `<TooltipTrigger>` + `<TooltipContent>`
- 侧边栏图标：`side="left"`
- Pipeline 步骤：`side="bottom"`
- 延迟：`delay={0}`（即时显示）

### 9.4 确认操作

破坏性操作（删除/归档）统一使用 `AlertDialog`：
- 包含标题 + 描述 + 双按钮 Footer
- 取消按钮用 `variant="outline"`
- 确认删除用 `className="bg-destructive hover:bg-destructive/90"`

### 9.5 Toast

- 位置：`top-right`
- 启用 `richColors`
- 成功：`toast.success()`，错误：`toast.error()`，警告：`toast.warning()`
- 操作反馈需在 300ms 内响应，超出需显示 loading

### 9.6 空状态

- 必须提供有意义的空状态提示（图标 + 文字 + 引导操作）
- 禁止出现空白页面
- 使用 `<Empty>` 组件或等效 pattern

### 9.7 Loading 状态

- 异步操作 > 300ms 需显示 loading 指示器
- 按钮异步操作时必须 `disabled={loading}` + 显示 spinner，防止重复点击
- 长列表考虑 skeleton 占位

### 9.8 Focus 状态

- 所有交互元素必须有可见的 focus 指示器
- 使用 `focus-visible:ring-3 focus-visible:ring-ring/30` 或等效
- 禁止 `outline-none` 不提供替代方案

---

## 10. 间距规范

| 区域 | 内边距 |
|------|--------|
| 页面级内容 | `p-8` |
| 工作区主区域 | `p-5` |
| 面板内列表 | `p-3` |
| 卡片默认 | `p-4` ~ `p-6` |
| 面板工具栏 | `px-4 py-2.5` |
| Dialog 内容 | `p-5`，Footer `p-4` |
| 列表项间距 | `space-y-1` ~ `space-y-2` |
| 区域间距 | `space-y-4` |

### 图标与文字间距

| 场景 | Gap |
|------|-----|
| 按钮 | `gap-1` ~ `gap-1.5` |
| 列表项图标 | `gap-2.5` |
| 面包屑分隔符 | `gap-1`，`/` 用 `mx-0.5` |
| Grid 布局 | 使用 `gap-*` 而非单个元素 `mb-*` |

---

## 11. Z-Index 层级

定义明确的 z-index 层级系统，避免任意大数值：

| 层级 | 值 | 用途 |
|------|------|------|
| 基础内容 | `z-0` | 正常文档流 |
| 浮动元素 | `z-10` | 粘性头部、浮动按钮 |
| 下拉菜单 | `z-20` | Dropdown、Popover |
| 抽屉 | `z-30` | 右侧 Drawer |
| 对话框 | `z-50` | Dialog、AlertDialog、Toast |

> 禁止使用 `z-[9999]` 等任意值。

---

## 12. 可访问性清单

| 项目 | 要求 | 当前状态 |
|------|------|---------|
| 文字对比度 | 最低 4.5:1（WCAG AA） | 玻璃面板上的 muted-foreground 需验证 |
| Focus 指示器 | 所有交互元素可见 focus ring | 按钮和输入框已有，自定义按钮需检查 |
| 键盘可达 | 所有功能可通过键盘操作 | hover 显示的操作按钮对键盘不可见 |
| 动画偏好 | 尊重 `prefers-reduced-motion` | 待添加全局 media query |
| 空状态 | 提供引导而非空白 | 已使用 `<Empty>` 组件 |
| 按钮 loading | 禁用 + spinner 防双击 | 大部分已实现 |
| 图标 | 使用 SVG（Lucide），不使用 emoji | 已遵守 |
