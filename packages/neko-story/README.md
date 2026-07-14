# Neko Story

> 文学入口：利用 VSCode 原生编辑器实现「文驱动制片」

## Context Summary

- 项目：Neko Suite - VSCode 创意工作套件
- 架构：Extension Host (LSP) + Parser 子包 + Webview (预览 UI) 双进程

## Quick Reference

- **职责**：剧本语法高亮、智能补全、实时预览、一键转换为 neko-cut 时间线、向 Agent 提供剧本/场景上下文
- **入口**：`packages/extension/src/extension.ts`
- **支持格式**：`.story`（Neko Story）、`.fountain`（Fountain 标准）；`.nks` 归 Sketch/Image 领域
- **子包**：`extension/`、`parser/`（`@neko-story/parser`）、`types/`、`webview/`
- **依赖**：`@neko-story/types`、`@neko-story/parser`、`@neko/shared`

## Architecture

```
VSCode 原生编辑器（.story / .fountain 文件）
  │
  ├── TextMate Grammar     → 语法高亮
  ├── LSP / Language Server → 智能补全（角色/场景/动作）
  └── Extension Host
        ├── @neko-story/parser → 剧本解析 → AST
        ├── scriptIndexBuilder → 稳定 sceneId + 场景元数据
        ├── storyScenePlanner → ScenePlan / ShotPlan 确定性规划
        ├── StorySceneStateStore → 场景工作流状态 + workspaceState 持久化
        └── 命令
              ├── Preview Story          → 开启 Webview 剧本预览面板
              ├── Convert to Timeline    → 生成 .nkv 项目文件 → neko-cut
              ├── Send to Agent          → 发送选区/剧本上下文给 Agent
              └── Start Video Creation   → 由 Agent 自主预处理，再进入视频创作流程
```

### 包结构

```
packages/
├── types/      # @neko-story/types  剧本 AST 类型定义
├── parser/     # @neko-story/parser 剧本解析器（支持 .story / .fountain）
├── extension/  # VSCode 扩展：语言服务、命令、规划器、状态管理、Webview 触发
│     ├── services/scriptIndexBuilder.ts    # 稳定 sceneId + 场景元数据构建
│     ├── services/storyScenePlanner.ts     # ScenePlan / ShotPlan 确定性规划
│     └── services/storySceneStateStore.ts  # 场景工作流状态 + workspaceState 持久化
└── webview/    # React 剧本预览 UI
```

## Deep Dive

### 工作流

```
编写剧本 (.story / .fountain)
  │
  ├── 实时预览（Webview 剧本预览面板）
  ├── Agent 预处理（基于剧本文本、场景索引和角色索引自主判断分析步骤）
  ├── Canvas 产物管理（Agent 生成并经用户接受的分镜/画面节点归 Canvas）
  └── 转换为时间线（neko-cut）→ 自动摆放素材
```

### Agent 与 Canvas 边界

Story 只拥有剧本文本、AST、场景索引和角色引用，不再提供分镜表预览或分镜产物管理页面。Agent 根据剧本内容和用户目标自主判断预处理步骤，生成候选分镜、素材需求、诊断或视频创作计划。用户接受后的分镜板、ShotNode、候选图、生成状态和版本归 `neko-canvas` 管理。

### Fountain 语法示例

```fountain
INT. COFFEE SHOP - DAY

ALICE
Hello there.

BOB
How are you?
```

### 指令与资产引用（Directives & Asset References）

通过 Fountain 标准的 Notes 语法 `[[KEY: value]]` 支持结构化指令。标准 Fountain 渲染器将 `[[...]]` 视为不可见注释，完全兼容。

```fountain
内景 咖啡厅 - 夜
[[MOOD: tense]]
[[SHOT: close-up]]
[[STYLE: noir]]
[[PROMPT: 赛博朋克咖啡厅，霓虹灯光，雨夜]]
[[DURATION: 30s]]

小美
（低声地）
你到底想怎样？

[[IMAGE: diagram.png]]
[[SFX: thunder]]
```

**指令分类**：

| 类别 | 键 | 说明 |
|------|-----|------|
| 资产 | `IMAGE`, `VIDEO`, `AUDIO`, `ASSET` | 素材嵌入，转换为时间线 MediaElement |
| 元数据 | `MOOD`, `MUSIC`, `VFX`, `SFX`, `DURATION` | 场景氛围/音效/时长（`DURATION` 覆盖启发式估算） |
| 镜头 | `SHOT`, `ANGLE`, `MOVEMENT` | 分镜参数，映射到 `StoryShotPlan` schema |
| AI | `PROMPT`, `STYLE`, `REF` | AI 生图提示/风格/参考图 |

**编辑支持**：输入 `[[` 自动弹出指令键补全，选择后弹出值建议。TextMate 语法高亮区分指令键（关键字色）和值（字符串色）。

**数据流**：指令由 parser 解析为 `Directive` AST 节点 → scriptIndexBuilder 收集到 `SceneEntry.directives` → storyScenePlanner 转换为类型化 `StoryShotPlan` 字段 → storyboardPlanner 传入 canvas `ShotNode.data` → canvas-generation-runtime 用于 AI 生图 prompt。

**SHOT 值映射**（`ShotScale` 类型）：

| 指令值 | ShotScale | 说明 |
|--------|-----------|------|
| `wide` / `establishing` / `long` | `LS` | 远景 |
| `medium` / `mid` / `two-shot` | `MS` | 中景 |
| `close-up` / `closeup` / `close` | `CU` | 特写 |
| `extreme-close-up` / `ecu` / `insert` | `ECU` | 大特写 |
| `over-the-shoulder` / `OTS` | `OTS` | 过肩 |
| `POV` | `POV` | 主观 |
| `aerial` | `LS` | 航拍 |
