# Neko Story

> 文学入口：利用 VSCode 原生编辑器实现「文驱动制片」

## Context Summary

- 项目：Neko Suite - VSCode 创意工作套件
- 架构：Extension Host (LSP) + Parser 子包 + Webview (预览 UI) 双进程
- 规范：[CLAUDE.md](../../CLAUDE.md)

## Quick Reference

- **职责**：剧本语法高亮、智能补全、实时预览、一键转换为 neko-cut 时间线
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
        └── 命令
              ├── Preview Story   → 开启 Webview 预览面板
              ├── Convert to Timeline → 生成 .jvi 项目文件 → neko-cut
              └── Generate Storyboard → 调用 neko-agent AI 生成分镜
```

### 包结构

```
packages/
├── types/      # @neko-story/types  剧本 AST 类型定义
├── parser/     # @neko-story/parser 剧本解析器（支持 .nks / .fountain）
├── extension/  # VSCode 扩展：语言服务、命令、Webview 触发
└── webview/    # React 预览 UI
```

## Deep Dive

### 工作流

```
编写剧本 (.nks / .fountain)
  │
  ├── 实时预览（Webview 预览面板）
  ├── AI 解析（neko-agent）→ 生成 Neko-Script
  └── 转换为时间线（neko-cut）→ 自动摆放素材
```

### 剧本语法示例

```
# 场景一：咖啡馆

[内景 - 日]

**角色A** 走进咖啡馆。

角色A：今天人真少啊。

> 镜头：特写
```
