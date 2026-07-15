## Context

Neko Suite 当前存在三条相互叠加的创作结果路径：Agent Extension 先按自然语言/任务内容分类，再通过 conversation binding、Board index 和 scope resolver 选择 `neko/boards/*.nkc`；Canvas 对未提升生成结果建立不写入 `.nkc` 的 runtime Group；用户 Save to Assets 后再由 promotion orchestrator 写回普通 Canvas 节点。与此同时，Cut 已有 headless `CutProjectAuthoringService`，但共享 target contract 仍允许 `active`，部分旧 timeline API 仍把“当前时间线”当作隐式 mutation owner。

这些机制分别解决过目标歧义、临时文件和 UI 生命周期问题，但组合后让本地单工作区承担了类似多项目调度系统的复杂度，也让 TUI、Extension 和 Webview 很难共享同一条事实路径。本变更以现有 Agent 极简化 ADR、`CanvasProjectAuthoringService`、`CutProjectAuthoringService`、generated-output index、`ResourceRef` 和普通 `.nkc` 节点为基础，收敛目标和持久化语义。

约束：

- Agent core 只能拥有通用 session/turn、Skill、Tool、Task、Approval 和结果观察，不能认识 Canvas、Board、`.nkc`、`.nkv` 或 generated 目录。
- Extension Host 或 host-neutral domain service 拥有工作区 IO；Webview 不能写项目文件或选择持久目标。
- `.nkc` 继续是空间事实来源，generated-output owner 继续是生成文件/lineage 来源，`.nkv` 继续是 Cut 时间线事实来源，AssetLibrary 继续是用户整理后的素材库事实来源。
- 既有有价值的 `.nkc`、`.nkv`、`neko/generated/` 和 AssetLibrary 数据不能因预发布收敛被删除。
- 新 canonical path 必须 fail-visible，不能在失败后回退 active/recent Canvas、active Cut、旧 runtime Group 或 conversation binding。

## Goals / Non-Goals

**Goals:**

- 让未指定 Canvas 的 creator-visible typed output 确定地进入 `neko/boards/workspace.nkc`。
- 让可见生成结果先成为 `neko/generated/<kind>/` 下可恢复的工作区输出，再投影到普通 Canvas 节点。
- 保留普通 Canvas 多文档，同时删除 Agent 默认路径中的 Board 多实例路由。
- 保留 Cut 多 `.nkv` 项目，同时要求每次 durable mutation 显式携带 file target 或 create-new target。
- 让 VSCode、TUI 和无 Webview 场景复用相同的 generated-output 与 headless authoring contract。
- 删除旧成功路径并以路径级测试证明它们未参与。

**Non-Goals:**

- 限制用户只能创建一个 `.nkc` 或一个 `.nkv`。
- 将 `.nkc` 与 `.nkv` 合并，或让 Board 成为时间线事实来源。
- 自动把所有生成结果加入 AssetLibrary，或让 generated-output id 冒充 AssetEntity id。
- 新增创作 Workflow、Delivery Runtime、全局项目管理器、跨领域事务协调器或创作专用审批状态机。
- 从目录树重建节点位置、Group、连线和注释；这些空间事实只能来自 `.nkc`。
- 改造 Rust Engine、Protobuf、Canvas 渲染器或 Cut timeline schema。

## Decisions

### 1. Creator-visible generated output is durable workspace output

生成 owner 继续区分四种状态：provider scratch、creator-visible generated output、promoted Asset 和 derivative。只有通过 provider 校验并被 task result 声明为 creator-visible 的输出，才通过现有 generated-output owner 原子写入：

```text
neko/generated/
  image/
  audio/
  video/
  storyboard/
  file/
```

写入成功后，owner 在现有 generated-output index 中记录稳定 id、revision/digest、media kind、MIME、task/run lineage 和 Host-local source location。Agent、Tool result 和 Webview projection只得到稳定 `ResourceRef`/generated-output identity，不得到绝对路径。文件名是 owner 管理的实现细节，不作为跨层 identity；同一 completion/replay 使用稳定 output id 幂等返回已有记录，不覆盖另一 revision。

`neko/generated/` 是用户工作区中的生成收件区，不是 AssetLibrary。文件不会因 session 结束、cache 清理或 Board 关闭被自动回收；删除必须经过明确的 generated-output/文件删除动作和引用检查。Save/Add to Assets 仍是显式整理动作，返回独立 AssetEntity identity，不是 Board 显示的前置条件。

Alternative considered: 保留 cache + runtime pin，等用户 Save to Assets 后才持久化。拒绝，因为 Board 重开、TUI 和跨 session 恢复继续依赖 runtime 生命周期，并强迫每次可观察创作都先经过素材库语义。

Alternative considered: generation completion 自动创建 AssetEntity。拒绝，因为它会把所有迭代候选塞入用户整理的素材库，并继续混淆 generated-output 与 AssetLibrary ownership。

### 2. One canonical default Board, ordinary explicit Canvas documents

每个 Agent workspace identity 只派生一个默认 URI：`neko/boards/workspace.nkc`。未指定 Canvas 的投影只使用该 URI；文件不存在时由 `CanvasProjectAuthoringService` 幂等创建，文件存在但 schema/version 非法时直接诊断，不能覆盖或另建随机 Board。

调用方显式提供 `.nkc` document URI 时，可以投影到该普通 Canvas。显式目标必须来自用户请求、调用命令参数或发起 Canvas 文档的稳定 invocation context；不能来自 active/recent editor、conversation history、目录扫描、文件名相似度或模型判断。

`workspace.nkc` 不引入 Board profile。Inbox 是一个由 Canvas projector 维护稳定 provenance 的普通 Group/空间区域；项目、参考、归档等其他 Group 仍由普通 Canvas 操作创建。用户可把节点复制或移动到其他区域/Canvas，本变更不自动迁移内容。

Alternative considered: 保留多个 Board 并简化 resolver 权重。拒绝，因为 index、binding、scope 冲突和异步冻结仍然存在，且当前产品没有同时自动管理多个 Board 的必要路径。

Alternative considered: 彻底禁止多个 `.nkc`。拒绝，因为多 Canvas 是正常文档能力，与 Agent 默认目标不是同一问题。

### 3. Canvas owns projection; Agent host only forwards declared typed results

新增 Canvas-owned `WorkspaceBoardProjector`，由 host-neutral Canvas authoring core、注入的 workspace/file adapter 和 `CanvasProjectAuthoringService` 组成。它接受 Canvas-owned discriminated projection request，至少包含：

- workspace identity；
- optional explicit Canvas document URI；
- stable output/artifact identity and revision；
- declared projection kind（generated media 或 creator-useful durable artifact）；
- stable `ResourceRef`/document ref、display metadata 和 provenance；
- task/run identity，仅用于幂等和诊断。

Agent task/result contract 不新增 Board 字段。生成/Artifact owner 在 typed result 中声明稳定结果类型；VSCode 或 TUI host adapter 只把这些已声明结果映射为 Canvas projection request，不读取自然语言、不判断创作意图、不选择多个 Board。Canvas projector 再校验是否支持该 projection kind。

该组件是领域 projector，不是 Delivery Runtime：它没有工作队列、会话绑定、语义路由、审批状态、计划解释或跨领域生命周期。同步或异步 completion 都调用同一幂等入口。Canvas capability 不可用或写入失败时，原 generated output 保持成功和可恢复，但 Board projection 返回独立、可见的失败诊断；调用方不能把它表述为已加入 Board。

默认 Board 写入是生成 Tool 已声明的工作区副作用，走现有通用 Tool policy/approval。显式专业 Canvas mutation 按现有 owning policy 决定是否需要额外确认；不存在 Canvas 专用 ApprovalEngine。

Alternative considered: 只在 System Prompt/Skill 要求模型再调用 Canvas Tool。拒绝，因为提示词不能保证保存、幂等、重放和失败诊断。

Alternative considered: 让每个生成 Tool 直接依赖 Canvas。拒绝，因为这会反转领域依赖，并让 image/audio/video owner 各自复制 Canvas 行为。

### 4. Persist ordinary Inbox nodes and preserve user spatial edits

每个 projectable output 在 Inbox 中对应一个普通持久节点，节点 provenance 使用 stable output/artifact identity。多候选结果可以创建一个普通 Group 和多个普通 child nodes；它们不依赖 runtime-only Group id。

首次投影选择 Inbox 内的确定性空闲位置。重放或 metadata/status 更新按 provenance 找到已有节点，并遵循以下规则：

- 不重复创建相同 output revision 的节点；
- 不覆盖用户编辑的标题、说明或批注；
- 不修改用户移动后的坐标、尺寸、Group membership 或连线；
- 新 output revision 默认创建可区分的新候选，除非 owning contract 明确声明可安全更新同一节点；
- Board revision/写入冲突返回 diagnostic，不能转投其他 Canvas。

`.nkc` 继续拥有空间布局，generated-output index 只拥有输出 identity/path/lineage。目录或 index 可以帮助重新解析媒体，但不能重建丢失的 Canvas 布局。

Alternative considered: Board 每次打开都从 `neko/generated/` 全量重建。拒绝，因为它会丢失布局、关系和用户编辑，并把目录顺序误当成空间事实。

### 5. Cut authoring requires an explicit instance target

Cut 的 durable authoring API 继续复用 `NekoProjectAuthoringTarget`，但 Cut canonical operations只接受：

- `{ kind: 'file', documentUri }`：修改现有 `.nkv`；
- `{ kind: 'new', documentUri, ... }`：按显式 create intent 新建 `.nkv`。

`kind: 'active'`、缺失 kind/URI、最近文件、目录唯一文件和名称相似度都不能成为 durable Cut authoring target。来自某个 Cut editor 的交互操作可以使用该 editor instance 已绑定的 document URI；一旦跨到 Tool、Agent、Canvas handoff、TUI 或异步 Task，adapter 必须把这个 URI 显式写入 request，并冻结 document identity。基于旧读取或异步结果的 mutation 还要携带 owner-specific revision/digest，并由 Cut 在写入前校验。

普通 media generation completion只产生 generated output 和默认 Board 投影，不会创建或更新 `.nkv`。只有显式“加入此时间线”或“创建新剪辑项目”动作才调用 Cut authoring，并继续经过通用 Tool approval/owning policy。

Alternative considered: 工作区只允许一个 `.nkv`。拒绝，因为主片、预告、竖屏版和语言版本是独立时间线与导出单元。

Alternative considered: 复用 active Cut 方便操作。拒绝，因为异步完成期间焦点可能改变，且 TUI 没有等价 active editor。

### 6. Host composition remains instance-scoped

VSCode Extension Host 从 Agent terminal task/result event 调用公开 Canvas projector API；TUI 使用 Canvas 提供的 host-neutral authoring composition和 Node workspace adapter。Webview 只接收保存后的 `.nkc` reload/operation notification，并通过普通节点 renderer 展示结果。

所有 projector 与 authoring operation 都携带 workspace/document identity。多 root workspace 必须使用 Agent session 或 invocation 已绑定的 workspace root；缺失或歧义时返回 `workspace-required`，不得采用当前活动 root。每个 host instance 独立拥有 projector、generated-output index 和 file adapter，不通过全局 active state 切换。

### 7. Five-layer architecture analysis

**Responsibility:** generated-output owner 管文件、digest、lineage 和 retention；Canvas projector 管默认 Canvas URI、Inbox provenance、空间写入和诊断；Cut authoring 管 `.nkv` mutation；Agent core 只管通用执行；Host adapter只做 typed contract 映射和生命周期组合。

**Dependency:** Agent core 不依赖 Canvas/Cut。跨扩展调用只使用 `@neko/shared`/公共 Extension API；Canvas/Cut Extension 可以依赖 host-neutral authoring core，Webview 不进入 IO 链路，Rust Engine 不参与项目目标解析。

**Interface:** 优先收敛现有 generated-output、`ResourceRef`、Canvas delivery DTO 和 `NekoProjectAuthoringTarget`，删除错误字段/分支，而不是并行增加 v2 facade。只有 Canvas projection 所需且现有 DTO 无法表达的 discriminant 才更新共享契约。

**Extension:** 新媒体类型复用 generated-output kind 和 Canvas projection descriptor；新的专业项目格式复用显式 project target 原则，不需要修改 Agent core。多 Canvas/多 Cut 仍由普通显式文档 identity 扩展。

**Testing:** producer/consumer contract tests覆盖 shared DTO；generated owner 测原子持久化和 replay；Canvas 测默认/显式目标、Inbox 幂等、用户布局保护和冲突；Cut 测 file/new target 与 active fallback 拒绝；VSCode/TUI 集成测试证明相同路径；Agent evaluation 和真实 Extension Development Host 场景覆盖最终可观察结果。

### 8. Fail-visible and proportionality rules

以下状态必须直接失败并产生可操作 diagnostic：workspace 缺失/歧义、`workspace.nkc` schema/version 非法、unsupported projection kind、generated output identity/revision 无法解析、Canvas revision conflict、`.nkv` target 缺失/非 file-new、目标后缀错误、异步 target revision stale、authoring capability 未注册。

不新增 feature flag、fallback resolver、后台 daemon、事务服务或自动重试队列。唯一新增稳定职责是 Canvas Workspace Board projector；它替代至少四个现有多 Board/runtime projection组件，净复杂度下降。

## Risks / Trade-offs

- [Risk] `neko/generated/` 会随迭代增长。→ 文件属于用户可见工作区输出，先提供明确删除/整理入口和引用诊断；不通过隐式 GC 换取空间。
- [Risk] generated file 已保存但 Board 写入失败。→ 两个 owner 不伪装成单事务；生成结果保持可恢复，projection 单独失败并支持同一 request id 幂等重试。
- [Risk] 普通持久节点增加 `.nkc` 体积。→ `.nkc` 只保存引用和展示/空间元数据，不内嵌二进制或 runtime URI。
- [Risk] 用户希望不同会话自动进入不同 Board。→ 使用同一 Workspace Board 内的普通 Group/Frame，或由用户显式指定其他 `.nkc`；不恢复会话绑定。
- [Risk] 移除 runtime Group 会改变未保存提示和 promotion UI。→ generated output 自创建起即持久，UI 状态改为 generated/AssetLibrary identity，而不是“即将被 cache 回收”；Save to Assets 仍可作为整理动作。
- [Risk] 旧 public Extension API 调用 `active` Cut target。→ 预发布阶段直接更新仓库内生产者并 poison 旧成功路径；外部/未知调用收到 `missing-authoring-target` 或 `invalid-authoring-target`，不保留兼容 fallback。
- [Risk] TUI 未装配 Canvas authoring 时无法立即看到 Board。→ 生成本身成功且文件可恢复，TUI 明确报告 projection capability unavailable；内置发行配置必须装配同一 host-neutral projector 并由集成测试覆盖。

## Migration Plan

1. 更新 shared contract/spec/ADR，并在测试中 poison conversation binding、Board index/scope resolver、runtime-only draft apply 和 Cut `active` durable target；旧路径不得再为新请求返回成功。
2. 将 creator-visible generated output 的 canonical materialization 切换到 `neko/generated/<kind>/`，验证原子写入、index、ResourceRef、reload 和 replay；provider scratch 保持 cache-owned。
3. 实现 Canvas Workspace Board projector 和普通 Inbox 节点 authoring，接入 VSCode/TUI host composition；先验证新路径命中，再删除旧 Agent Board work runtime、coordinator、classifier 分支、Canvas Board index/resolver 和 generated draft promotion-orchestrated apply。
4. 收敛 Cut authoring target validation，迁移 commands、Agent capability、Canvas handoff、TUI 和 package API 调用方；删除 `active` durable mutation 成功路径。
5. 清理旧 conversation binding/Memento key 和无生产引用的 runtime projection状态。既有 `.nkc`/`.nkv` 不改写；既有 `neko/generated/` 原地保留并可由 generated owner 建立/修复 index。可解析的旧 generated-output 可通过显式 retain/project 动作进入 Inbox；不可解析项显示 diagnostic。
6. 更新 Canvas/Cut README、领域架构和相关 ADR，运行完整验证并记录无法迁移的 runtime-only session 状态。

Rollback 不恢复旧自动路由。若新 projector 必须暂时停用，停止注册该 projector并保留已写入的 generated files、普通 `.nkc` 节点和 `.nkv` 数据；这些文件仍可由普通编辑器打开。修复后以相同 provenance id 重试，不做反向数据迁移或双写。

## Open Questions

- 无阻塞设计问题。实现前的契约审计只需确认现有普通 Media/Document node 与 `ResourceRef` 能完整表达 generated-output；若不能，应在本 change 内最小扩展现有 Canvas source contract，而不是引入专用 GeneratedInboxNode。
