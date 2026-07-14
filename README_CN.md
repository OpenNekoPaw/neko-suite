# Neko Suite

> AIGC 内容创作 IDE + 创作 Agent + 互动媒体引擎，集成在 VS Code 内。

[English](./README.md) | [猫娘版](./README_NYA.md)

[![Status](https://img.shields.io/badge/Status-Alpha-orange)]()
[![License](https://img.shields.io/badge/License-AGPL--3.0--or--later-blue)]()
[![VS Code](https://img.shields.io/badge/VS%20Code-1.128+-blue)]()

Neko Suite 是一个面向 AI 原生创作工作流的 monorepo。它把剧本规划、分镜画布、视频时间线、媒体预览、3D 创作、2D 绘画、2D 骨骼动画、音频工作站、素材管理、市场安装、项目搜索和实时互动整合到一组 VS Code 扩展中。

本仓库采用契约优先架构：

- Webview 只负责 UI 与交互。
- Extension Host 负责 VS Code API、工作区集成、激活和跨扩展编排。
- Rust 引擎负责重计算、媒体权威、GPU 渲染、二进制文件访问和实时运行时。
- Protobuf、`@neko/shared`、`@neko/neko-client` 保持跨层契约显式。
- ADR 只记录稳定决策和边界；实现日志、过时代码样例和阶段记录不再作为架构事实来源。

## 产品结构

| 层级       | 职责                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------- |
| 创作 IDE   | Story、Canvas、Cut、Preview、Model、Sketch、Puppet、Audio、Assets、Market、Dashboard、Search |
| 创作 Agent | 意图理解、Skill 激活、能力发现、规划、工具执行、富媒体投递、感知、记忆                       |
| 互动引擎   | Rust sidecar 驱动的 scene、puppet、media、audio、device、ML、preview 和未来 stage runtime    |

## 客户端产物目标

Neko Suite 当前按三个客户端产物分工，而不是让每个客户端承载完整同构体验：

| 产物 | Canonical root | 核心目标 |
| --- | --- | --- |
| Neko Home | `apps/neko-home` | 类 Codex 的多 Agent 会话与 AIGC 创作任务、产物和专业工具交接管理 |
| Neko TUI | `apps/neko-tui` | Agent runtime、模型质量、消融、回归和结构化 Evaluation 证据 |
| Neko for VSCode | `apps/neko-vscode` | 插件化创作、编辑、预览与编排；领域 Extension 仍由各功能包拥有 |

旧 Desktop 编辑器壳已退出当前产品结构；未来 Studio 必须通过新的 OpenSpec 重新设计。

详细职责边界见 [客户端产物目标与职责边界](./docs/architecture/client-targets.md)。

## Workspace 包

| 分组             | 包                                                                    |
| ---------------- | --------------------------------------------------------------------- |
| 核心契约         | `neko-types`, `neko-proto`, `neko-client`, `neko-auth`, `neko-ui`     |
| 引擎             | `neko-engine`                                                         |
| Agent 与项目接地 | `neko-agent`, `neko-dashboard`, `neko-entity`, `neko-search`          |
| 创作界面         | `neko-story`, `neko-canvas`, `neko-cut`, `neko-preview`, `neko-tools` |
| 资产与分发       | `neko-assets`, `neko-market`                                          |
| 互动创作         | `neko-model`, `neko-sketch`, `neko-puppet`, `neko-audio`, `neko-live` |

## 当前重点

当前重点是跨包产品化和主链路稳定，而不是继续堆叠孤立原型：

1. 统一项目图谱：资产、实体、生成媒体、搜索、Dashboard、Agent 记忆收敛到同一语义层。
2. 统一 Agent 能力模型：所有创作包通过稳定契约暴露能力。
3. 统一 engine-first 媒体与预览权威路径。
4. 统一 Webview UI 基础层，同时保留各包领域逻辑所有权。
5. 端到端 smoke：从剧本意图到生成素材、时间线装配、预览、导出和审阅。

## 快速开始

安装依赖：

`pnpm install`

构建：

`pnpm build`

测试：

`pnpm test`

仓库检查：

`pnpm check`

Rust 引擎相关：

`cd packages/neko-engine && cargo test --workspace`

## 仓库结构

| 路径                                     | 作用                           |
| ---------------------------------------- | ------------------------------ |
| `apps/`                                  | 当前产品构建、测试、打包与发布根 |
| `packages/`                              | Workspace 包和 VS Code 扩展    |
| `openspec/`                              | 活跃和归档的 OpenSpec change   |
| `docs/`                                  | 架构、领域、调研和状态文档入口 |
| `quality/`                               | 供脚本和 CI 消费的质量门禁输入 |
| `README.md` / `README_CN.md`             | 项目入口                       |
| `ARCHITECTURE.md` / `ARCHITECTURE_CN.md` | 当前架构总览                   |
| `TODO.md` / `TODO_CN.md`                 | 活跃任务队列                   |
| `ROADMAP.md` / `ROADMAP_CN.md`           | 方向性产品路线                 |
| `AGENTS.md` / `CONTRIBUTING_CN.md`       | 仓库工作规则与贡献指南         |

## 文档

| 想了解                       | 入口                                                                 |
| ---------------------------- | -------------------------------------------------------------------- |
| 项目定位、产品结构、快速开始 | [README_CN.md](./README_CN.md)                                       |
| 当前系统架构总览             | [ARCHITECTURE_CN.md](./ARCHITECTURE_CN.md)                           |
| 全量文档导航和写入规则       | [docs/README.md](./docs/README.md)                                   |
| 系统级架构、ADR、跨领域约束  | [docs/architecture/README.md](./docs/architecture/README.md)         |
| 面向创作目标的领域文档       | [docs/domains/README.md](./docs/domains/README.md)                   |
| 调研、竞品和技术分析         | [docs/research/README.md](./docs/research/README.md)                 |
| Gap、迁移、健康度和审计快照  | [docs/status/README.md](./docs/status/README.md)                     |
| 活跃任务队列                 | [TODO_CN.md](./TODO_CN.md)                                           |
| 活跃设计和实现变更           | [openspec/](./openspec/)                                             |
| 方向性产品路线               | [ROADMAP_CN.md](./ROADMAP_CN.md)                                     |
| 质量门禁机器输入             | [quality/README.md](./quality/README.md)                             |
| 仓库工作规则与贡献指南       | [AGENTS.md](./AGENTS.md), [CONTRIBUTING_CN.md](./CONTRIBUTING_CN.md) |

文档写入遵循单一职责：稳定系统约束进入 `docs/architecture/`，创作领域能力进入 `docs/domains/<domain>/`，调研分析进入 `docs/research/`，带日期的状态快照进入 `docs/status/`，开发中的变更进入 `openspec/changes/`，当前排队事项进入 `TODO_CN.md`。

## 贡献

提交改动前请守住架构边界：

1. Webview、Extension Host、Rust 引擎、共享契约保持分层。
2. 跨包改动从契约和小接口开始。
3. 新状态机、公共契约和失败路径需要聚焦验证。
4. 文档只描述当前决策和不变量，不保留过时代码样例或完成日志。

## License

GNU Affero General Public License v3.0 or later。详见 [LICENSE](./LICENSE)。

- [Trademark Policy](./TRADEMARK.md)
