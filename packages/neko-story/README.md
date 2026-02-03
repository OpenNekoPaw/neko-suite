# Neko Story

> 文学入口：利用 VS Code 原生编辑器，实现「文驱动制片」

## Context Summary

- **项目**：Neko Suite - VS Code 全能内容创作工作站
- **角色**：剧本编辑器，LSP 语言服务支持
- **规范**：[README.md](../../README.md)

---

## 概述

**Neko Story** 是 Neko Suite 的文学创作入口，利用 VS Code 原生编辑器的强大能力，为剧本创作提供语法高亮、智能补全、实时预览等功能。通过「文驱动制片」的理念，让创作者专注于故事本身。

---

## 核心功能

| 功能 | 说明 |
|------|------|
| **语法高亮** | 剧本专用语法着色 |
| **智能补全** | 角色、场景、动作自动补全 |
| **实时预览** | 剧本预览面板 |
| **时间线转换** | 一键转换为时间线项目 |
| **分镜生成** | AI 辅助生成分镜脚本 |

---

## 文件格式

| 扩展名 | 说明 |
|--------|------|
| `.nks` | Neko Story 剧本文件 |
| `.story` | 通用剧本文件 |

---

## 剧本语法示例

```nekostory
# 场景一：咖啡馆

[内景 - 日]

**角色A** 走进咖啡馆，环顾四周。

角色A：（自言自语）今天人真少啊。

> 镜头：特写角色A的表情

**角色B** 从角落站起来，挥手示意。

角色B：这边！

---

# 场景二：街道

[外景 - 夜]

两人并肩走在街道上。
```

---

## 命令

| 命令 | 说明 |
|------|------|
| `Neko Story: Preview Story` | 预览剧本 |
| `Neko Story: Convert to Timeline` | 转换为时间线 |
| `Neko Story: Generate Storyboard` | 生成分镜脚本 |

---

## 工作流

```
编写剧本 (.nks)
    │
    ├─→ 预览剧本 (Preview)
    │
    ├─→ AI 解析 (neko-agent)
    │       │
    │       └─→ 生成 Neko-Script 指令
    │
    └─→ 转换为时间线 (neko-cut)
            │
            └─→ 自动摆放素材
```

---

## 依赖关系

```
neko-story (独立)
    └── @neko/shared (类型)
```

---

## 技术栈

- **语言服务**：LSP (Language Server Protocol)
- **语法定义**：TextMate Grammar
- **类型**：@neko/shared

---

## License

MIT
