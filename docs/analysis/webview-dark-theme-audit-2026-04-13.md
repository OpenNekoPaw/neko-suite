# Webview 暗色主题对比度审计与修复记录

> Date: 2026-04-13
> Status: In Progress
> Scope: `neko-agent`、`neko-cut`、`neko-tools`、`neko-model`、`neko-canvas`
> Related Commits:
> - `bbd9071c` `fix: unify dark theme contrast across webviews`
> - `d67bdd93` `fix: improve dark theme contrast in agent and diff views`

## 1. 背景

本轮问题集中在各 Webview 子包的暗色主题表现不一致：

- 字体颜色和背景层级对比不足，暗色主题下文本发灰、发暗或直接看不清。
- 组件直接混用 `--vscode-*` 原始变量，导致同一界面内按钮、输入框、下拉、卡片、徽标的对比关系不一致。
- 不同子包各自定义了一套局部样式，缺少“包级语义层”，修一个组件后容易在别处复发。

本次治理目标不是单点改色，而是把高频界面收口到每个子包自己的语义主题层，降低后续维护成本。

---

## 2. 根因分析

### 2.1 直接消费 VSCode 原始颜色变量

大量组件直接写：

- `bg-[var(--vscode-input-background)]`
- `text-[var(--vscode-descriptionForeground)]`
- `bg-[var(--vscode-editorWarning-foreground)] text-black`
- `bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]`

这类写法的问题不是“变量本身不能用”，而是组件层直接拼接原始 token 后：

- 无法表达语义角色，如“次级文字”“危险态卡片”“高亮态按钮”“悬浮层背景”。
- 不同状态切换时，背景和文字经常只替换了一半。
- 同一个 token 在菜单、卡片、输入框、徽标、媒体覆盖层里的可读性需求不同，直接复用会造成冲突。

### 2.2 缺少包级语义层

各子包已有不同成熟度的主题基础：

- `neko-cut` 已有较完整的 `--nk-*` 体系。
- `neko-model` 已基本收口到 `--model-*` 体系。
- `neko-agent`、`neko-tools` 之前更多依赖组件内直接拼 `--vscode-*`。

因此真正的治理重点不是继续批量替换颜色值，而是先建立：

- `neko-agent`: `--agent-*`
- `neko-tools`: `--tools-*`
- `neko-cut`: 持续复用既有 `--nk-*`

---

## 3. 本轮已完成修复

### 3.1 `neko-agent`

新增并强化了 `packages/neko-agent/packages/webview/src/index.css` 中的语义层：

- `--agent-bg`
- `--agent-elevated`
- `--agent-surface`
- `--agent-border`
- `--agent-divider`
- `--agent-fg`
- `--agent-fg-secondary`
- `--agent-accent`
- `--agent-danger`
- `--agent-success`
- `--agent-info`

同时补充了一批可复用的 UI 辅助类：

- `.agent-header`
- `.agent-header-action`
- `.agent-tab`
- `.agent-tab-active`
- `.agent-card`
- `.agent-inline-card`
- `.agent-inline-header`
- `.agent-code-block`
- `.agent-badge`
- `.agent-search-shell`
- `.agent-search-input`
- `.agent-warning-chip`
- `.agent-danger-link`

本轮重点修复的高频区域：

- Header / Tab / HistoryMenu
- AccountBar
- OnboardingFlow
- ErrorBoundary
- ToolCallDisplay
- TaskCard
- PlanReview
- DiffBlock

修复策略：

- 将卡片、任务、计划、diff、确认框统一收口到 `--agent-*` 语义层。
- 将按钮、输入框、列表项等基础交互统一到 `vscode-button` / `vscode-input` / `vscode-list-item` 的增强版样式。
- 将错误、警告、成功、处理中等状态统一映射到语义色，而不是在组件里临时拼颜色。

### 3.2 `neko-cut`

本轮不新建主题体系，而是继续复用既有 `--nk-*` 设计系统，重点处理“高复用输入层”：

- `PropertyPanel/inputs/NumberInput.tsx`
- `PropertyPanel/inputs/SelectInput.tsx`
- `PropertyPanel/inputs/ColorInput.tsx`
- `PropertyPanel/inputs/CheckboxInput.tsx`
- `PropertyPanel/inputs/CollapsibleSection.tsx`

同时修了两个高频面板：

- `ColorCorrection/LUTPanel.tsx`
- `PropertyPanel/ShapePanel.tsx`

修复策略：

- 停止继续在属性面板里裸写 `--vscode-*`。
- 统一回退到 `nk-btn-*`、`nk-select`、`nk-prop-input`、`nk-prop-group`、`nk-prop-slider` 等既有语义类。
- 先修“共享输入层”，因为这是后续多个面板重复出现暗色主题问题的根因。

### 3.3 `neko-tools`

新增 `packages/neko-tools/packages/webview/src/styles/index.css` 的包级语义层：

- `--tools-bg`
- `--tools-elevated`
- `--tools-panel`
- `--tools-border`
- `--tools-divider`
- `--tools-fg`
- `--tools-fg-secondary`
- `--tools-accent`
- `--tools-success`
- `--tools-warning`
- `--tools-danger`

同时新增一批复用类：

- `.tools-card`
- `.tools-card-header`
- `.tools-button`
- `.tools-button-secondary`
- `.tools-input`
- `.tools-select`
- `.tools-range`
- `.tools-divider-v`
- `.tools-overlay-chip`
- `.tools-pill`
- `.tools-tab`
- `.tools-spinner`

本轮重点修复的主链路：

- `AssetDiff/AssetDiffApp.tsx`
- `MediaDiff/DiffControls.tsx`
- `MediaDiff/ImageDiffViewer.tsx`
- `MediaDiff/MediaDiffViewer.tsx`
- `MediaDiff/VideoDiffViewer.tsx`

修复策略：

- 先处理图片、视频对比主视图，因为它们最容易出现“亮背景 + 黑字”或“暗背景 + 次级字过淡”的问题。
- 给覆盖层标签、滑块手柄、对比按钮、状态徽标统一加语义色。
- 把 `AssetDiff` 和 `MediaDiff` 的头部、面板、控件样式先拉齐。

### 3.4 `neko-model`

本轮未做额外代码改动，但复查结果显示组件层已基本收口到 `--model-*` 语义层，当前未发现直接使用 `--vscode-*` 的组件文件。

### 3.5 `neko-canvas`

本轮未继续处理。当前仅剩少量非核心残留，且不再是这次暗色主题冲突的主战场。

---

## 4. 当前收敛情况

### 4.1 统计口径

以下数字按“仍在 `tsx/ts` 组件文件中直接使用 `var(--vscode-*)` 的文件数”统计，命令口径为：

```bash
rg -l --glob '*.tsx' --glob '*.ts' 'var\(--vscode-[^)]+\)' <package-webview-src>
```

### 4.2 当前结果

| 包 | 当前残留文件数 | 说明 |
|---|---:|---|
| `neko-agent` | 37 | 仍是剩余风险最高的包，但已从 47 收缩到 37 |
| `neko-cut` | 23 | 已从 41 收缩到 23，下降明显 |
| `neko-tools` | 7 | 已从 12 收缩到 7，主链路基本收口 |
| `neko-model` | 0 | 基本完成 |
| `neko-canvas` | 1 | 非核心残留 |

### 4.3 分包结论

#### `neko-agent`

仍有问题，但风险范围已经收缩到几个明确区域：

- `InputArea` 链路最多
- `MediaPreview`
- `MessageContent`
- `MessageItem` / `MessageList`

这说明主导航、主卡片、主确认流已经基本稳定，但聊天输入和内容展示链路还没有完全收口。

#### `neko-cut`

主要残留集中在：

- `PropertyPanel`
- `ColorCorrection`
- `Subtitles`
- `Mask`
- `Timeline`

这说明属性编辑和时间线周边仍是主题复发高发区，但共享输入层已经开始兜底。

#### `neko-tools`

主图片 / 视频对比链路已经收住，剩余风险集中在：

- `MediaDiff/audio/*`
- `MediaDiff/TimelineDiffViewer.tsx`
- `MediaDiff/VideoFrameRenderer.tsx`

也就是说，这个包现在已经从“整体不统一”收缩成“少数专用 viewer 没完成迁移”。

---

## 5. 剩余问题优先级

建议继续按以下顺序处理：

### P0

1. `neko-agent` `InputArea`
2. `neko-agent` `MediaPreview`
3. `neko-agent` `MessageItem` / `MessageList` / `MessageContent`

原因：

- 用户停留时间最长
- 交互最密集
- 最容易出现“占位文字、按钮、下拉、状态文字”对比不足

### P1

1. `neko-tools` `MediaDiff/audio/*`
2. `neko-tools` `TimelineDiffViewer.tsx`
3. `neko-tools` `VideoFrameRenderer.tsx`

原因：

- 当前主链路已修，这几处属于收尾型工作
- 做完后 `neko-tools` 基本可视为完成

### P1

1. `neko-cut` `ColorCorrection/*`
2. `neko-cut` `Subtitles/*`
3. `neko-cut` `Mask/*`
4. `neko-cut` `Timeline/*`
5. `neko-cut` `PreviewControls.tsx`

原因：

- 已经有 `nk-*` 体系，可以继续按既有设计系统推进
- 收益高，但不如 `neko-agent` 聊天主链路紧急

---

## 6. 验证结果

本轮涉及的 Webview 构建验证已通过：

```bash
pnpm --filter ./packages/neko-agent/packages/webview build
pnpm --filter ./packages/neko-cut/packages/webview build
pnpm --filter ./packages/neko-tools/packages/webview build
```

验证结论：

- `neko-agent` 通过
- `neko-cut` 通过
- `neko-tools` 通过

说明这两次主题修复至少已经在类型检查、样式构建和产物生成层面稳定。

---

## 7. 结论

当前不能说“主题色问题已经完全解决”，但可以明确说：

- 主要冲突已经从“多包普遍散落”收缩为“少数链路残留”。
- `neko-model` 基本完成。
- `neko-tools` 已接近完成。
- `neko-cut` 已完成第一轮高复用输入层治理。
- `neko-agent` 仍是后续重点，但主头部、主卡片、任务卡、计划审批和 diff 卡片已经明显改善。

下一轮工作应继续沿“包级语义层 + 高频组件优先 + 共享输入先行”的策略推进，而不是回到组件内零散替换颜色值的方式。
