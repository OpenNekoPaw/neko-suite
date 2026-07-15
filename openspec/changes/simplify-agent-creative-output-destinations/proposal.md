## Why

当前 Agent 创作结果的落点同时依赖多 Board 索引、会话绑定、scope 匹配、运行时候选 Group 和显式 Asset 提升，导致一个本地工作区的默认创作路径需要多层特化运行时才能成立。现在应把默认路径收敛为“工作区持久生成结果 + 唯一 Workspace Board 投影”，同时保留 Canvas 多文档和 Cut 多项目能力，并禁止 Agent 猜测具体项目目标。

## What Changes

- **BREAKING**：未显式指定 Canvas 时，Agent 创作结果只投影到工作区固定的 `neko/boards/workspace.nkc`；删除会话到 Board 绑定、Board 目录语义匹配、自动选择兼容 Board 和自动创建任意命名 Board 的成功路径。
- 保留任意数量普通 `.nkc` 文档；用户或调用方可显式指定其他 Canvas，但它们不参与 Agent 默认目标解析，也不形成新的 Board profile 或文件格式。
- 将 `workspace.nkc` 内的普通空间 Group/区域作为 Inbox、项目、参考和归档组织方式；默认投影只向 Inbox 追加或幂等更新自己的节点，不覆盖用户编辑、移动节点或重排其他区域。
- **BREAKING**：新产生且需要向创作者展示的生成结果由生成结果 owner 持久化到 `neko/generated/<kind>/`，并建立稳定 generated-output identity；provider scratch、失败中间物和重复重试结果仍留在运行时/cache，不得进入工作区输出目录。
- **BREAKING**：移除“未提升候选只能存在于 Canvas runtime Group”的强制路径。Canvas 可通过稳定 generated-output identity 持久化普通 `.nkc` 节点；AssetLibrary 提升继续是显式的素材库整理动作，而不是 Board 可恢复展示的前置条件。
- 用 Canvas owning package 内的轻量 Workspace Board projector 消费既有 typed task/result completion，调用 `CanvasProjectAuthoringService` 完成幂等投影；不在 Agent core 增加 Canvas、路径、Board、delivery 或创作审批语义。
- `.nkv` 继续支持多个独立 Cut 项目。所有 Cut mutation 必须携带显式 `.nkv` document identity，或携带显式“创建新项目”意图和目标；普通生成完成、当前活动编辑器、最近文件和文件名相似度均不得隐式选择时间线。
- Agent、TUI 和 Webview 复用相同的 generated-output、Canvas authoring 和 Cut authoring 契约。Webview 只展示和交互，不拥有工作区 IO、默认投影或项目目标选择。
- 审批继续使用 Agent 原生 Tool approval 和 owning capability policy；本变更不引入创作专用审批、Delivery Runtime、Workflow 或跨领域项目管理器。
- 更新架构 ADR、Canvas/Cut 文档与相关 OpenSpec，使唯一 canonical path 取代当前多 Board 自动路由和 runtime-only Board 候选路径。

## Capabilities

### New Capabilities

- `canvas-workspace-inbox-projection`: 定义 creator-visible typed output 向唯一 Workspace Board Inbox 的持久、幂等、可恢复投影，以及用户布局保护和跨宿主行为。
- `cut-project-authoring-targeting`: 定义 Cut 多 `.nkv` 项目的显式目标、新建意图、异步目标冻结和禁止隐式活动文件 fallback 的 authoring 契约。

### Modified Capabilities

- `agent-board-canvas-routing`: 将多 Board 索引、会话绑定和 scope 解析改为工作区唯一默认 Board，加显式其他 Canvas 目标。
- `agent-board-canvas-delivery`: 将 Agent 特化 delivery 改为 Canvas-owned、typed-result 驱动的 Workspace Board 幂等投影。
- `canvas-generated-draft-groups`: 移除 runtime-only 候选 Group、Save to Assets 前置和 promotion-orchestrated Board apply 要求，由新的 Workspace Inbox 投影契约取代。
- `generated-asset-lifecycle`: 将新生成的 creator-visible output 持久化到 `neko/generated/<kind>/`，同时保持其与 AssetLibrary 实体的身份分离。

## Impact

- `packages/neko-agent/packages/extension`：移除 Board coordinator/work runtime、conversation binding 和 delivery classifier 中的 Canvas 目标/内容策略；只保留通用 task/result 事件与宿主组合。
- `packages/neko-canvas/packages/extension`：简化 `NekoCanvasAPI.boards`，新增或收敛 Workspace Board projector，删除 Board index/scope resolver 和 runtime generated-draft projection 的 canonical 成功路径。
- `packages/neko-canvas/packages/webview`：删除 runtime-only generated Group 作为默认路径，使用普通持久节点展示 Inbox；现有 Canvas 编辑和显式多文档能力保留。
- `packages/neko-agent/packages/platform`、`packages/neko-types` 与生成 provider adapter：调整 generated-output 持久化、稳定引用、幂等和清理契约；Agent-facing payload 仍不暴露宿主绝对路径。
- `packages/neko-cut/packages/extension` 与公共 Extension API：统一显式 `.nkv` target/create contract，并让命令、Agent、Canvas handoff 和 TUI 调用遵循同一路径。
- 项目数据：既有 `.nkc`、`.nkv`、AssetLibrary 内容和 `neko/generated/` 文件不得删除。已有多 Board 文档继续作为普通 Canvas 打开；旧 conversation binding/index 状态停止参与新请求并可直接清理。现有 runtime-only 候选在可解析时提供一次显式保留/导入路径，不能静默宣称已迁移。
- 不涉及 Rust Engine、Protobuf、远程服务或新的文件格式版本；如果现有 `.nkc` schema 已能表达稳定 generated-output 引用和普通 Group，则不新增 schema 字段。
