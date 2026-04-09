# Neko Story

> 文学入口：利用 VSCode 原生编辑器实现「文驱动制片」

## Context Summary

- 项目：Neko Suite - VSCode 创意工作套件
- 架构：Extension Host (LSP) + Parser 子包 + Webview (预览 UI) 双进程
- 规范：[CLAUDE.md](../../CLAUDE.md)

## Quick Reference

- **职责**：剧本语法高亮、智能补全、实时预览、一键转换为 neko-cut 时间线、**分镜系统**（轻量分镜表 + ScenePlan/ShotPlan 规划器 + story→agent→canvas 语义流水线）
- **入口**：`packages/extension/src/extension.ts`
- **支持格式**：`.nks`（Neko Story）、`.story`（通用）、`.fountain`（Fountain 标准）
- **子包**：`extension/`、`parser/`（`@neko-story/parser`）、`types/`、`webview/`
- **依赖**：`@neko-story/types`、`@neko-story/parser`、`@neko/shared`

## Architecture

```
VSCode 原生编辑器（.nks / .fountain 文件）
  │
  ├── TextMate Grammar     → 语法高亮
  ├── LSP / Language Server → 智能补全（角色/场景/动作）
  └── Extension Host
        ├── @neko-story/parser → 剧本解析 → AST
        ├── scriptIndexBuilder → 稳定 sceneId + 场景元数据
        ├── storyScenePlanner → ScenePlan / ShotPlan 确定性规划
        ├── StorySceneStateStore → 场景工作流状态 + workspaceState 持久化
        └── 命令
              ├── Preview Story          → 开启 Webview 预览面板（含轻量分镜表）
              ├── Convert to Timeline    → 生成 .nkv 项目文件 → neko-cut
              ├── Generate Storyboard    → 启动 Agent pipeline（规划 + canvas 导入）
              ├── Start Video Creation   → flowF 标准视频主流程（规划 → 生成 → 时间线）
              └── Send to Canvas         → 场景级 storyboard payload 导入 canvas
```

### 包结构

```
packages/
├── types/      # @neko-story/types  剧本 AST 类型定义
├── parser/     # @neko-story/parser 剧本解析器（支持 .nks / .fountain）
├── extension/  # VSCode 扩展：语言服务、命令、规划器、状态管理、Webview 触发
│     ├── services/scriptIndexBuilder.ts    # 稳定 sceneId + 场景元数据构建
│     ├── services/storyScenePlanner.ts     # ScenePlan / ShotPlan 确定性规划
│     └── services/storySceneStateStore.ts  # 场景工作流状态 + workspaceState 持久化
└── webview/    # React 预览 UI（含轻量分镜表 ScriptTableView）
```

## Deep Dive

### 工作流

```
编写剧本 (.nks / .fountain)
  │
  ├── 实时预览（Webview 预览面板 + 轻量分镜表）
  ├── ScenePlan / ShotPlan（确定性规划器 → 语义分镜数据）
  ├── Agent 流水线（story → agent → canvas 语义导入 + 批量视频生成）
  ├── Send to Canvas（场景级 storyboard payload → neko-canvas 节点）
  └── 转换为时间线（neko-cut）→ 自动摆放素材
```

### Fountain 语法示例

```fountain
INT. COFFEE SHOP - DAY

ALICE
Hello there.

BOB
How are you?
```

### 资产引用（Asset References）

通过 Fountain 标准的 Notes 语法 `[[...]]` 引用图片、视频、音频素材：

```fountain
INT. LAB - NIGHT

[[IMAGE: diagram.png]]
[[VIDEO: establishing-shot.mp4]]
[[AUDIO: background-music.wav]]
[[ASSET: image://path/to/file.png]]

The scientist points at the screen.
```

**支持的格式**：
- `[[IMAGE: path]]` - 图片素材
- `[[VIDEO: path]]` - 视频素材
- `[[AUDIO: path]]` - 音频素材
- `[[ASSET: type://path]]` - 统一协议格式

**转换行为**：
- 转换为 neko-cut 时间线时，资产引用自动生成 MediaElement
- 创建独立的 Assets 轨道（Track 0）
- 图片默认静音，视频保留音频
- 时长根据场景自动估算
