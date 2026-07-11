# 创作媒体 Skill 与质量门禁实施记录

> 日期：2026-07-11
>
> OpenSpec change：`converge-creative-media-skills-and-quality-gates`
>
> Schema：`spec-driven`
>
> 当前进度：54/87（完成 1.1–6.11、9.4；其余 7.x–10.x 尚未完成）

## 1. 当前结论

本轮已完成创作媒体能力收敛所需的共享契约、Provider 能力协商、Canvas/Cut 边界适配和 API-first Quality Core。系统已经具备构建“素材 → 生成 → 质检 → 后期 → 质检 → 成品”闭环的核心契约与局部执行能力，但尚未达到完整端到端成品流程可验收状态。

尚缺的关键环节包括：各 `.nk*` owning package 的 ProjectQuality facade、中央质量编排与项目证据接入、可恢复 media-production 工作流、Export 前门禁、Export 后成品验证、修复重导出闭环，以及真实 Agent/provider 路径验收。因此当前状态应描述为“底层契约和质量内核已建立，完整制作流水线仍在实施中”，不能描述为 release-ready。

## 2. 架构决策

### 2.1 Skill 与能力边界

- 用户级创作意图收敛为 `storyboard`、`image`、`video`、`media-production`、`video-editing` 和 `media-quality-review`。
- `comic-to-storyboard` 不再作为独立顶层能力扩张，而是 `storyboard/from-comic` 来源 profile；Storyboard 同时面向 prompt、text、script、document、comic、image-sequence 和 existing-storyboard。
- 图片扩展、编辑、融合、上色、切分等属于统一 `image` operation 语义；具体执行由 Agent Media、Sketch、Canvas、Engine 或 Provider adapter 按能力协商承担。
- 单 clip 视频生成、图生视频、首尾帧、reference/video-to-video 和转换属于统一 `video` operation 语义；timeline 范围编辑和最终剪辑仍归 `video-editing`/Cut。
- `media-production` 负责跨领域编排，不直接拥有 Canvas、Cut、Audio 或 `.nk*` 的领域真值。

### 2.2 子包依赖

创作流程不应硬依赖某个 UI 子包：

- `neko-agent`：负责任务编排、Provider negotiation、生成任务和能力目录。
- `neko-canvas`：只负责画布资源投影和 Canvas owning authoring 能力，不作为稳定媒体身份来源。
- `neko-cut`：负责 timeline/final-cut authoring；当前 adapter 只处理生成单 clip 的插入准备，不接管全时间线编辑。
- `@neko/shared`：承载中立的 operation、capability、ResourceRef 和 Quality 契约，避免功能包相互导入内部实现。
- `.nk*` owning package：负责自身 schema、引用、graph/timeline、runtime adapter 和 export readiness 的权威校验。

因此 Canvas、Agent、Cut 是完整流程中的可组合 owning capability，不是 Skill prompt 的硬编码依赖，也不应通过 Skill 正文泄漏工具协议。

### 2.3 Quality 职责

- operation-local 输入/输出契约校验留在 `image`、`video`、`audio` 等 owning skill/capability。
- 综合素材审查、跨镜一致性、项目 preflight、release verdict 和证据聚合由 `media-quality-review`/Quality Core 编排。
- `.nks/.nkv/.nka/.nkp/.nkm` 的内部结构验证必须由 owning package facade 提供；中央 Quality 不复制格式 parser 或业务规则。
- Export 前验证当前项目 revision 和导出准备度；Export 后验证实际 deliverable 的 container/codec/duration/tracks/截断/黑帧/冻结帧/响度等。两者不能互相替代。
- 所有质量证据必须绑定稳定 `ResourceRef`、revision/content digest、coverage 和 lineage；编辑产生新 revision 后旧证据必须失效。

### 2.4 API-first 与外部感知模型

Quality Core 采用 API-first、local-first 的 evaluator port：

- `structural`：schema、引用、图/时间线、项目完整性。
- `technical`：probe/decode、codec、尺寸、时长、音轨、响度等确定性检查。
- `perception`：多模态模型或可选本地模型对构图、视觉缺陷、语义一致性等进行感知评估。
- `policy`：根据 evidence coverage、严重度、缺失 evaluator、人工复核规则生成 Gate verdict。

外部感知模型可以替换 perception evaluator，但不能替代 structural、technical 或 owning project validator。CLIP 只作为可选感知筛查，不作为完整质量结论。多模态 evaluator 必须记录 provider、model、version 和 coverage；项目级感知必须消费 owning package 生成的 preview `ResourceRef`，不得把项目归档、项目路径或任意本地绝对路径直接交给外部模型。

## 3. 本轮已完成实现

### 3.1 共享创作媒体契约

- 扩展 canonical Image/Video operation ids、control ids、request/result、support level、requirements、limits 和 diagnostics。
- 增加 capability registry，支持 adapter 注册、协商、显式 degraded/unsupported、扩展字段白名单和 dispatch 结果校验。
- Provider 不支持的控制项在任务提交前 fail-visible；不得根据自由文本 prompt 猜测 Provider 支持。
- 生成素材以稳定 `ResourceRef` 为 canonical identity；URL、base64 和 path 只用于执行时 materialization。

### 3.2 Agent/Provider negotiation

- Agent Media 根据 canonical operation 与显式 control 协商 Provider adapter。
- Runway 对不支持的 canonical keyframe control 显式拒绝，不再静默丢弃 end frame。
- DashScope 保留 start/end frame 的稳定资源引用。
- Provider registry 暴露 operation capability，生成服务在 dispatch 前验证 capability 和请求契约。

### 3.3 Canvas/Cut adapter

- Canvas adapter 将稳定媒体资源投影到 Canvas runtime；Canvas node id 不作为 durable media identity。
- Cut adapter 将生成的单 clip 转为 timeline 插入/准备结果；全局 timeline 编辑仍由 Cut/`video-editing` 负责。
- adapter 边界通过聚焦测试验证，不建立 Canvas 与 Cut 的直接包依赖。

### 3.4 Quality Core

新增 canonical 流程：

```text
QualityTarget -> QualityEvidence[] -> deterministic aggregation -> QualityGateResult
```

已实现：

- structural、technical、perception、policy evaluator 分类。
- revision/content digest 新鲜度校验和稳定资源绑定。
- 技术失败覆盖高感知评分。
- evaluator 缺失按 policy 进入 manual review 或 fail，不静默通过。
- perception coverage 不完整时不能产生无条件 pass。
- 多模态感知 provenance 与 sampling/coverage 记录。
- 视频 probe + sampled frame decode 证据。
- 音频 loudness/peak/silence 证据。
- 外部 perception 对 project archive、project ref/path 和任意绝对本地路径 fail-visible。
- read-only review 与显式批准 repair 分离。
- repair 重试限制为 1–3 次，且必须产生带 lineage 的新 revision。
- canonical 工具入口 poison `mediaPath`；旧 path runtime 仅通过显式 `Legacy*` 导出保留作迁移用途。

## 4. 验证证据

已通过：

- `pnpm --filter @neko/shared test -- --run src/types/__tests__/creative-media-contracts.test.ts`
  - 156 files，1428 tests passed。
- `pnpm --dir packages/neko-skills exec vitest run`
  - 33 files，313 tests passed。
- `pnpm --dir packages/neko-skills exec vitest run src/quality/__tests__/quality-gate-runtime.test.ts`
  - 1 file，12 tests passed。
- `pnpm --dir packages/neko-agent exec vitest run packages/extension/src/tools/__tests__/qualityCheckTools.test.ts`
  - 1 file，29 tests passed。
- `pnpm exec tsc --noEmit -p packages/neko-skills/tsconfig.json`
- `pnpm test:agent:eval`
  - 2 files，31 tests passed；该结果仅证明 evaluation harness 自测，不等同于真实 Agent/provider 行为验收。
- 聚焦 Prettier、ESLint 与 `git diff --check`。

本轮没有 Rust/Engine 改动，因此无需 `cargo test`；没有 Webview UI 改动，因此无需 Extension Development Host 视觉烟测。

## 5. Legacy 与迁移状态

当前仍保留以下显式迁移 API：

- `LegacyMediaQualityRuntime`
- `createLegacyMediaQualityRuntime`
- `createLegacyQualityCheckTools`
- `createLegacyConsistencyCheckTools`

这些 API 不是 canonical 成功路径。默认入口拒绝裸 `mediaPath`，后续任务 9.6/9.7 负责移除到期 legacy 导出、dual-read/dual-write、旧 fixture 与 fallback，并以 poison/legacy-debt 测试证明旧路径不能继续返回成功。

## 6. 剩余风险与后续阶段

1. Canonical Quality runtime 尚未接入最终 Agent capability/tool catalog；由 8.x/9.x 完成。
2. `.nks/.nkv/.nka/.nkp/.nkm` 尚未提供统一 ProjectQuality facade；下一阶段从任务 7.1–7.8 开始。
3. 项目级 perception 尚依赖 owning package preview facade，当前禁止直接上传项目路径作为替代。
4. 尚未完成 media-production 可恢复编排、preflight/export/post-export/repair 闭环。
5. 尚未运行真实 Agent/provider 质量评估；`pnpm test:agent:eval` 只是 key-free harness 自测。
6. 全仓 `pnpm check`、`pnpm test`、legacy debt、unused 检查和最终文档同步仍属于 10.x release-readiness 工作。

下一实施批次应优先完成任务 7.1–7.8：由各 owning package 暴露 headless、revision-bound ProjectQuality evidence，再由中央 Quality orchestration 消费 facade 输出，而不是复制 `.nk*` parser。

## 8. 真实 Agent 媒体质检故障与恢复（2026-07-11）

### 8.1 生产路径证据

用户请求“生成猫猫玩耍的图片，并分析图片质量”时，异步生成和自动续跑链路实际正常：

- conversation：`izbh0142-01KX7YY74ACRJQXA5Q192654T2`
- generation task：`task_1783752506832_8`
- generated asset：`59dbc482-b779-4352-9dcd-049f9d67a96b`
- stable ResourceRef：`res_3z6xxu`
- output：1024×1024 PNG，1,347,289 bytes
- Journal 中 task observation、evidence、follow-up request 和自动 continuation 均已出现；续跑后 `ReadImage` 成功返回结构化 `PerceptionCard`。

失败发生在下一次 provider message projection。当前 chat model 为 `deepseek-chat/deepseek-v4-flash`，只声明文本 chat capability；`ReadImage` 卡片包含 Layer 0 结构信息和 provider-loadable image ref，但 Layer 1 semantic evidence 为 skipped。旧投影层把工具卡片等同于用户直接提交的原生图片 packet，抛出非重试错误：

```text
CHAT_MODEL_NATIVE_MULTIMODAL_UNSUPPORTED
The selected chat model does not support native image input.
```

这证明故障不在图片生成、后台任务或 auto-resume，而在“工具媒体证据 → text-only chat model”的恢复边界。

### 8.2 修复后的 canonical 路径

本轮将输入分成两个不同信任/恢复边界：

1. 用户或 host packet 中的原生 image/video 输入，在所选模型不支持对应 modality 时继续 fail-visible，避免伪装成已读取媒体。
2. 工具返回的 `PerceptionCard` 在 text-only 模型下不再终止 turn：投影层保留 structural/semantic 文本摘要，不物化 native image，并附加 runtime perception 恢复诊断。
3. 若卡片已有 Layer 1 semantic evidence，文本模型可直接消费该证据；若只有结构信息，诊断明确要求通过独立 perception pipeline 获取视觉证据后再判断画质，不允许根据 prompt、路径或缩略图标签臆测。
4. `media-quality-review.allowedTools` 增加机器可读 `perception.perceive` 权限。Skill 正文仍不承载工具教程或运行时 schema，符合 Prompt/Capability/Skill 注入边界。

独立感知路径继续采用 API-first purpose routing：chat model 与 image/audio/video understanding model 可以不同。外部感知模型只替换 perception evaluator；格式、尺寸、codec、decode、响度、项目引用和 export 完整性仍由本地/owning evaluator 负责。

### 8.3 Legacy Skill 身份迁移

- canonical builtin registry 只保留 `media-quality-review`。
- 删除未注册但仍被导出、国际化和 Extension catalog 引用的 stale `quality-assessment` builtin 定义。
- 运行时仅保留一个显式 alias：`quality-assessment -> media-quality-review`。
- alias 激活结果、生命周期 record 和工具成功消息均返回 canonical 名称；同时返回 `legacy-skill-alias` diagnostic，包含 requested/canonical 名称。
- alias 的移除条件：Agent prompts、eval manifests、用户可见 catalog、文档和保存的调用入口均不再产生旧名称，并且迁移 telemetry/diagnostic 在一个发布验证窗口内无命中。预发布阶段不保留第二条 builtin 成功路径。

### 8.4 验证证据

已通过：

```bash
pnpm --dir packages/neko-agent exec vitest --run \
  packages/platform/src/service/__tests__/shared-service-adapter.test.ts
# 21/21

pnpm --filter @neko/skills exec vitest --run \
  src/builtins/builtin-skills.test.ts
# 16/16

pnpm --dir packages/neko-agent exec vitest --run \
  packages/agent/src/skill/__tests__/conversation-skill-runtime.test.ts \
  packages/agent/src/tools/core/__tests__/meta-tools.test.ts \
  packages/extension/src/services/__tests__/skillCatalogProvider.test.ts
# 43/43
```

`cat-play-image-analysis` evaluation case 已增加 canonical path 断言：`media-quality-review` 必须 active，且 `perception.perceive` 必须成功；仅依赖最终回答文本不再足以证明图片质检路径。

包级 `@neko/agent` 全量 `tsc --noEmit` 当前被仓库既有测试类型债务阻断，首批错误位于 `execution-runtime-summary-trace.test.ts`、`standalone.test.ts`、多个 command/session 测试等，与本批次文件无直接关系。该结果不能作为本变更通过证据，也不应通过 fallback 掩盖；后续 10.1 仍需在工作区基线收敛后重跑。

### 8.5 尚未完成

- 尚未执行更新后源码构建的真实 provider-backed `cat-play-image-analysis` case；旧的预编译 `packages/neko-agent/neko` 不能证明本轮源码修复已生效。
- `.nk*` owning validator、pre-export Gate、post-export deliverable verification、repair/re-export loop 和端到端 production workflow 仍属于 7.x–10.x 后续任务。

## 9. Canonical QualityCheck 生产 capability 接线（2026-07-11）

提交 `a57f5a6ab` 将已存在的 Quality contract/runtime 接入 VSCode Extension 的 production capability discovery，不再依赖未注册的 legacy `qualityCheckTools` factory。

### 9.1 API-first 工具与身份边界

- `@neko/skills` 新增 canonical `QualityCheck` tool adapter，输入只接受 `QualityTarget`、可选 profile 和 policy。
- `QualityTarget` 必须带稳定 `ResourceRef` 或 owning-project reference，并满足 revision/content digest 契约；未知 contract version、target kind、profile、policy 字段均 fail-visible。后续修复提交 `dadae7eff` 进一步保证 malformed `resourceRef`、`projectRef`、lineage、media range 和 expected intent 不会被静默丢弃。
- 顶层 `mediaPath`、旧 `scenes[].mediaPath` 和缺少 durable revision/digest 的 target 在进入 review handler 前被 poison；不会从裸路径推导 durable identity，也不会触发内容访问。
- Tool schema 和参数解析保留在 capability/tool contract 层；`media-quality-review` Skill 正文没有加入工具名教程、参数表或运行时协议。

### 9.2 Extension provider 与授权物化

- 新增 Agent-owned provider `neko-agent-media-quality`，并在 Extension activation 的 `CapabilityDiscoveryService` 注册 canonical `QualityCheck`。
- 媒体内容通过 `AgentContentAccessRuntime.loadProviderAsset` 物化，caller 为 `quality-review`；外部感知只得到目标 `ResourceRef` 对应的 bytes、MIME type 和最小 metadata，不接收 arbitrary local path、cache root 或项目 archive。
- 图片感知按 purpose `image.understand` 解析独立 provider/model，再适配到 `PerceptionEvaluator` port；chat model 与 image understanding model 不要求相同。
- 没有配置图片理解模型时，不伪造感知成功，Gate 返回 `manual-review` 并报告 `missingEvaluatorClasses: ['perception']`。
- 当前 production evaluator 接线仅覆盖 image perception。默认 image policy 也是 perception-scope；其 `pass` 只表示该显式 policy 的感知证据通过，不代表结构、格式、decode 或完整交付 Gate 已通过。外部感知模型仍不能替代 technical/structural/project/export evaluator。

### 9.3 路径级验证

已通过：

```bash
pnpm --filter @neko/skills exec tsc --noEmit

pnpm exec eslint \
  packages/neko-skills/src/quality/canonical-quality-tools.ts \
  packages/neko-skills/src/quality/index.ts \
  packages/neko-skills/src/quality/__tests__/canonical-quality-tools.test.ts \
  packages/neko-agent/packages/extension/src/tools/qualityCapabilityProvider.ts \
  packages/neko-agent/packages/extension/src/tools/__tests__/qualityCapabilityProvider.test.ts \
  packages/neko-agent/packages/extension/src/tools/__tests__/capabilityProviders.test.ts \
  packages/neko-agent/packages/agent/src/runtime/capability/agent-content-access-runtime.ts \
  packages/neko-agent/packages/extension/src/index.ts

pnpm --filter @neko/skills exec vitest --run \
  src/quality/__tests__/canonical-quality-tools.test.ts \
  src/quality/__tests__/quality-gate-runtime.test.ts \
  src/builtins/builtin-skills.test.ts
# 33/33

pnpm --dir packages/neko-agent exec vitest --run \
  packages/extension/src/tools/__tests__/qualityCapabilityProvider.test.ts \
  packages/extension/src/tools/__tests__/capabilityProviders.test.ts \
  packages/agent/src/runtime/__tests__/agent-content-access-runtime.test.ts
# 11/11

pnpm test:agent:eval
# 33/33
```

路径级测试证明：

- canonical provider 经真实 `CapabilityDiscoveryService` 注册后，`ToolRegistry` 中出现 `QualityCheck`；
- image review 命中 `image.understand` purpose 和 `quality-review` content-access caller；
- provider/model identity 进入 perception evaluator；
- legacy path request 在 content materialization 前抛错；
- 缺失感知模型返回可观测 `manual-review`，而不是 fallback 或默认成功。

`pnpm --dir packages/neko-agent --filter @neko-agent/extension exec tsc --noEmit` 仍被当前工作区其他并行改动/既有类型基线阻断：`understandingModels` contract 尚未在 turn/message input 类型间同步，且 legacy consistency wrapper 仍引用已重命名导出。本批新增 Quality 文件未出现在错误列表中，因此不能宣称 Extension 全量 typecheck 通过。

### 9.4 明确未完成范围

- `QualityRepairCheck` 尚未接入 canonical production provider；不得用空壳或无 revision mutation 的成功结果代替 8.10 repair/re-preflight/re-export/re-verify 流程。
- video/audio 的 purpose-routed evaluator、image technical/structural evaluator、`.nk*` ProjectQuality facade、pre-export Gate 和 post-export deliverable verifier 尚未生产接线。
- project target 仍需要 owning package 提供 validator/evidence facade；中央 Quality 不解析 `.nk*`。
- CLI/TUI 尚未注册等价 Quality provider；本批只证明 VSCode Extension production discovery 路径。
- 尚未运行由当前源码构建并由真实 provider 支持的 `cat-play-image-analysis`；`pnpm test:agent:eval` 仅是 key-free harness 自测，不能替代真实 Agent 行为验收。

## 10. `.nks` ProjectQuality facade（2026-07-11）

### 10.1 Owning package 与依赖边界

任务 7.1 已由 `neko-sketch` owning package 完成，中央 Quality 仍不解析 `.nks`：

- `NekoSketchAPI.projectQuality` 暴露共享的 `ProjectQualityFacade` 契约；
- `.nks` 读取复用 `ProjectFileOps`，迁移复用公开子路径 `@neko/shared/nks`，资源检查复用 `nksSourcePathPolicy` 与 durable resource diagnostics；
- 未依赖 `neko-canvas`、`neko-cut` 或 `neko-agent` 内部实现，也未新建第二套项目 IO、路径解析或质量 DTO；
- preview、runtime、export readiness 通过 Sketch-owned 小接口注入。没有与目标 document/revision 绑定的 adapter 时明确返回 unavailable/not-ready，不把“任意活动编辑器”、Webview URI、cache path 或文件存在性猜测成可用证据。

### 10.2 Revision、结构与资源证据

当前 `.nks` schema 没有持久化 revision 字段，因此 facade 对迁移后的 canonical document 计算稳定内容摘要：

```text
contentDigest = hashStableValue(migrateNks(document).data)
projectRevision = nks:<contentDigest>
```

所有操作先重新读取当前文件并核对 revision/content digest；旧 request 在 preview/runtime/export adapter 运行前以 `stale-quality-evidence` 失败。snapshot 使用带 hash fingerprint 的稳定 `ResourceRef`，session render URI 仅是 display hint，不是持久证据身份。

结构验证覆盖：

- JSON root、受支持 schema version、canvas、viewport、palette、brush preset 容器；
- layer required fields、合法 layer type/blend mode、布尔状态、有限 geometry/opacity；
- 非空且唯一的 layer id、group children 约束、mask target 存在且不能自引用；
- source ref schema、相对 durable path、runtime/cache handle 拒绝、资源存在性；
- 当前 `.nks` 不持久化 Webview `frameLayers`/animation timeline。文件中出现相关未知字段时拒绝静默忽略；目标要求 frame animation 时 export readiness 必须为 false。

迁移 warning 保留在成功 envelope diagnostics 中，不再被 success helper 丢弃；加载失败也保持调用方请求的真实 operation，避免 preview/export 错误伪装为 `validate-project`。

### 10.3 路径级验证与质量自审

已运行：

```bash
pnpm --dir packages/neko-sketch exec vitest --run \
  packages/extension/src/services/SketchProjectQualityFacade.test.ts \
  packages/extension/src/services/SketchProjectAuthoringService.test.ts \
  packages/extension/src/agentCapabilityProvider.test.ts
# 3 files, 30 tests passed

pnpm --filter @neko-sketch/extension build
# esbuild succeeded

pnpm exec eslint \
  packages/neko-sketch/packages/extension/src/services/SketchProjectQualityFacade.ts \
  packages/neko-sketch/packages/extension/src/services/SketchProjectQualityFacade.test.ts \
  packages/neko-sketch/packages/extension/src/extension.ts \
  packages/neko-sketch/packages/extension/src/agentCapabilityProvider.test.ts \
  packages/neko-types/src/types/extension-api.ts
# no findings
```

额外使用 `module=esnext`、`moduleResolution=bundler` 执行 Sketch Extension typecheck。该包仍有既有 `agentCapabilityProvider`、`SketchEditorProvider`、PSD integration test 和 `SketchProjectAuthoringService` 类型基线错误；本批 `SketchProjectQualityFacade` 与 `extension-api.ts` 未出现在错误列表中，因此只记录 focused type evidence，不宣称全包 typecheck 通过。

质量自审风险级别为 L3（项目格式 + shared public Extension API）。未发现阻断项。没有 Webview UI/交互修改，无需 runtime visual smoke；没有 Agent prompt/Skill/capability routing 修改，无需新增真实 Agent evaluation。

### 10.4 剩余限制

- production API 已接入 facade，但尚无能证明 active document URI 与 requested revision 一致的 target-bound preview/runtime/export adapter。因此当前 production preview 明确 unavailable、runtime 为 unavailable、export readiness 为 false；这是 fail-closed 状态，不是完整 Sketch 导出验收。
- `.nks` 持久化 schema 尚不包含 animation/frame timeline。若未来正式支持动画，必须先扩展 schema/migration 与 owning validator，再允许 animated export readiness。
- 该阶段后续任务 7.2：由 `neko-cut` owning package 提供 `.nkv` ProjectQuality facade；中央 Quality 只消费 facade 证据。

## 11. `.nkv` ProjectQuality facade（2026-07-11）

### 11.1 Owning package、目标绑定与 revision

任务 7.2 已由 `neko-cut` owning package 完成；中央 Quality 只消费共享 `ProjectQualityFacade` 结果，不解析 `.nkv` timeline：

- `NekoCutAPI.projectQuality` 暴露 validate、snapshot、review preview、runtime probe 与 export readiness；
- live snapshot 必须由请求中的 `documentUri` 精确获取，不使用 active Webview、active editor 或 active export service 作为其他项目的 fallback；
- target-bound source 返回 `not-open` 时允许读取磁盘，从而支持关闭编辑器后的 reopen/headless validation；返回 `unavailable` 时 fail-closed，不回退旧磁盘内容伪装成功；
- 对 `loadNkv()` 得到的 canonical `ProjectData` 计算：

```text
contentDigest = hashStableValue(canonical ProjectData)
projectRevision = nkv:<contentDigest>
```

所有 review/runtime/export-readiness adapter 都在 revision/content digest 核对后才可调用；stale request 会在 adapter 前返回 `stale-quality-evidence`。snapshot 使用 hash fingerprint 的稳定 `ResourceRef`，session render URI 仍只是当前会话 display hint。

### 11.2 结构、资源、字幕与音频检查

结构与资源验证复用公开 `.nkv` codec/validator 和 `nkvSourcePathPolicy`，并由 Cut facade 补充 timeline 领域不变量：

- track id 非空且唯一，element id 在全项目非空且唯一；
- clip `startTime/duration/trimStart/trimEnd` 必须有限且合法；timeline/review range 按裁剪后的有效时长 `duration - trimStart - trimEnd` 计算；
- audio element 与 audio track、subtitle element 与 subtitle track 必须匹配，字幕文本不得为空；
- media/audio durable source 只接受 workspace-relative 或 `${VAR}` 路径，远程来源按 schema policy 处理；blob/Webview/cache/runtime handle 和缺失本地资源明确失败；
- schema/version、element-specific 字段和 audio properties 继续由 `.nkv` validator 负责，facade 不复制 codec。

当前 `.nkv` 只持久化 timeline resolution/fps。container、codec、bitrate 与 output path 属于 Cut export adapter 的运行期设置，因此 facade 明确报告 partial coverage；不会把文件可解析或 ExportService 存在误当作最终成品已经通过。

### 11.3 `.nk*` 质检与时间范围输出语义

本批固定以下边界：

1. **结构检查不导出**：直接验证当前 canonical `.nkv` snapshot、资源、轨道、clip、字幕、音频与 revision。
2. **指定范围质检使用 review render**：`QualityTarget.mediaRange` 原样传给 Cut-owned `CutProjectReviewRenderer`，生成绑定当前 project revision 的派生 preview `ResourceRef`。它是质检代理/审查渲染，不是正式视频成品。
3. **未注册 range renderer 时明确失败**：当前生产 Cut 尚无时间范围 review-render adapter，因此 `renderPreview()` 返回 unavailable diagnostic；不能退化成整段正式 export，也不能用 active timeline 截图伪装成功。
4. **正式成品另走 export Gate**：按时间范围正式导出、完整 deliverable export、pre-export policy、lineage 与 post-export probe/decode/codec/响度/黑帧等验证属于 8.x。7.2 的 readiness 只检查当前 project target 是否存在 target-bound export adapter，并且不会执行 export。

因此，`.nk*` 项目质检不要求先导出成品；需要像素、音频或时序感知证据时，优先渲染指定范围的 review artifact。只有最终交付验收才导出正式成品并执行 post-export verification。

### 11.4 路径级验证与质量自审

已运行：

```bash
pnpm exec vitest run \
  packages/neko-cut/packages/extension/src/services/CutProjectQualityFacade.test.ts \
  packages/neko-cut/packages/extension/src/agentCapabilityProvider.test.ts
# 2 files, 13 tests passed

pnpm exec eslint \
  packages/neko-cut/packages/extension/src/services/CutProjectQualityFacade.ts \
  packages/neko-cut/packages/extension/src/services/CutProjectQualityFacade.test.ts \
  packages/neko-cut/packages/extension/src/extension.ts \
  packages/neko-cut/packages/extension/src/agentCapabilityProvider.test.ts \
  packages/neko-types/src/types/extension-api.ts
# no findings

pnpm build:neko-cut
# 5 tasks successful
```

额外运行 `pnpm exec tsc --noEmit -p packages/neko-cut/packages/extension/tsconfig.json`。全包仍有 198 个既有基线错误；`CutProjectQualityFacade`、`extension.ts`、`agentCapabilityProvider.test.ts` 与 `extension-api.ts` 未出现在错误列表中，因此只记录 focused type evidence，不宣称 Cut Extension 全量 typecheck 通过。

质量自审风险级别为 L3（项目格式、Extension production wiring、shared public API）。未发现阻断项。路径级测试证明 target-bound live snapshot/review/export adapter 被命中，并证明 stale revision 时 adapter 不会执行。没有 Webview UI/交互改动，无需 VSCode runtime visual smoke；没有 prompt、Skill 或 Agent routing 改动，无需真实 Agent evaluation。

### 11.5 剩余限制

- production 已有 target-bound runtime/export-readiness probe，但当前只证明对应 document 的 ExportService 已注册；不证明输出设置完整、正式 export 成功或成品质量通过。
- production 尚未注册 `CutProjectReviewRenderer`，因此指定 `mediaRange` 的审查渲染仍 fail-visible；后续应复用 Cut/Engine 的 timeline render 能力实现，而不是在中央 Quality 新建 exporter。
- 正式时间范围导出若成为产品能力，应由 Cut export contract 明确定义 range、音画边界、字幕处理、输出设置与 lineage；不能把 review render 的临时产物直接提升为 deliverable。
- 下一步任务 7.3 由 `neko-audio` owning package 提供 `.nka` ProjectQuality facade。

## 12. Storyboard 图片/视频提示词语义回归修复（2026-07-12）

### 12.1 根因与目标边界

canonical `storyboard` 收敛时只迁移了来源归一化骨架，旧漫画分镜流程中的生产提示词不变量没有进入共享 contract：`StoryboardShotRow` 仅剩模糊的 `generationPrompt`，Story planning 的结构化图片/视频 prompt documents 在归一化时被丢弃，Canvas/Webview projection 也无法读取 canonical prompt。该回归会把图片生成与场景视频生成意图折叠为单一“生成提示词”，并允许资源 alias 冲突与分镜内容混在同一成功表格中。

本批不恢复 `comic-to-storyboard` 或新增动画规划 Skill，而是在既有六个 canonical 媒体 Skill 边界内修复一个真值：

- `imagePrompt` 是 shot-level 图片生成/编辑意图；
- `videoPrompt` 是 scene-level 视频意图，每 scene 最多一个，表格投影时位于第一条 shot；
- visual/action/camera/state/diagnostic 不替代 prompt；
- `generationPrompt` 只作为旧输入迁移来源，新的 Story normalization、Canvas projection 与 Webview review 不再写入或显示它；
- alias 多资源匹配必须 fail-visible，不得选择候选或编造来源。

### 12.2 Canonical path 与 legacy 隔离

路径级修复覆盖：

```text
Story planning prompt documents
  -> source normalization
  -> canonical StoryboardShotRow.imagePrompt/videoPrompt
  -> Canvas storyboard prompt state
  -> Webview review table
```

共享验证器新增 scene-level `videoPrompt` 不变量：重复 prompt 或非首 shot prompt 返回 `invalid-scene-video-prompt`。图片策略执行优先读取 `imagePrompt`；测试将 deprecated `generationPrompt` poison 为不同文本，证明它不能覆盖 canonical 意图。Canvas projection 将旧 `generationPrompt` 映射为 `imagePrompt` 仅限迁移输入，不再把该字段写入新投影。

### 12.3 Agent evaluation

新增 `storyboard-distinct-image-video-prompts` case，并为 runner 增加通用确定性断言 `final-answer-not-contains`。真实 case 使用显式 `$storyboard`，验证 canonical Skill activation、独立 `imagePrompt`/`videoPrompt` 表头、scene 第一行单一视频提示词，以及不存在通用“生成提示词”列。

真实运行证据：

```text
provider: nekoapi-chat
model: gpt-5.5
assertions: 5/5 passed
- runtime-errors-empty
- final-answer-non-empty
- skill-active(storyboard)
- final-answer-contains(imagePrompt, videoPrompt)
- final-answer-not-contains(generic generation-prompt columns)
```

当前 debug runner 不能在 scenario setup 中构造两个同 scope 的 Markdown/resource aliases，也没有 Storyboard source-binding diagnostic 的通用事实投影，因此 ambiguous alias 的真实 Agent negative case 尚不能确定性执行；本批以 Skill/spec fail-visible 约束和既有 Markdown resource ambiguity tests 覆盖，保留运行态 observability 风险。

### 12.4 验证结果

已运行：

```bash
pnpm --filter @neko/shared test
# 156 files, 1431 tests passed

pnpm --filter @neko/skills test
# 34 files, 320 tests passed

cd packages/neko-agent/packages/webview
pnpm exec vitest run src/components/ChatView/RichContent/renderers/CompositeRenderers.test.tsx
# 1 file, 11 tests passed

pnpm test:agent:eval
# 2 files, 34 tests passed

node scripts/agent-eval/protocol-smoke.mjs \
  --manifest scripts/agent-eval/scenarios/creative-workflows.scenarios.json \
  --case storyboard-distinct-image-video-prompts \
  --dry-run
# passed

node scripts/agent-eval/protocol-smoke.mjs \
  --manifest scripts/agent-eval/scenarios/creative-workflows.scenarios.json \
  --case storyboard-distinct-image-video-prompts
# passed, 5/5 assertions

git diff --check
# passed
```

以下全包门禁被工作区中并行的 conversation/tab-state 重构阻塞，本批文件不在错误列表的根因路径中：

```text
pnpm --filter @neko-agent/webview build
- failed: switchConversation/activateConversation、tabState revision、UseTabManagerProps 等并行改动尚未同步测试。

pnpm test -- src/components/ChatView/RichContent/renderers/CompositeRenderers.test.tsx
- package script 实际运行全部 88 个 Webview test files；失败集中于同一 conversation/tab-state 并行改动。
- 改用精确 vitest 文件命令后，本批 renderer 11/11 通过。

pnpm check:legacy-debt
- failed on repository baseline: 87 blocking occurrences across 18 migrate-now files and 5 needs-review files。
- 本批保留的 Storyboard generationPrompt 读取仅属于明确迁移边界；新 normalization/projection 不再写入该字段。
```

### 12.5 质量自审与剩余风险

风险级别为 L2（共享 Storyboard contract、Skill prompt、Canvas/Webview projection、Agent evaluation）。未发现本批阻断项。依赖方向保持 Story/shared contract 为真值，Canvas 与 Webview 仅消费 projection；未新增顶级 Skill、provider、registry 或平行 DTO。

剩余风险：

- natural-language 自动激活 `storyboard` 的一次真实 evaluation 出现非确定性缺少 activation evidence；最终提交 case 改为显式 `$storyboard`，因此证明 Skill 内容和 canonical path，但不单独证明自然语言路由稳定性；
- ambiguous alias 尚缺可由通用 debug facts 证明的真实 Agent negative case；
- deprecated `generationPrompt` 仍存在于旧 Storyboard/Canvas 迁移读取路径，需在存量 migration 完成后由 legacy-debt 任务删除；
- Webview 全包 build/test 需等待并行 conversation/tab-state 变更完成后重跑。

## 13. `.nka` ProjectQuality facade（2026-07-12）

### 13.1 职责、依赖与复用审计

任务 7.3 由 `neko-audio` owning package 实现，共享层只提供 `ProjectQualityFacade`、`QualityTarget`、`QualityProjectRef`、`ResourceRef`、稳定摘要和 project-file source policy。中央 Quality 不读取 `.nka` JSON，也不复制音频 routing、track mix、timeline 或 schema 规则。

实现复用了以下 canonical 能力：

- `.nka` 解析、版本兼容和基础 schema 验证：`loadNka()`；
- source 枚举和 runtime/cache identity 拒绝：`nkaSourcePathPolicy`、`detectRuntimeOrCacheSourceHandle()`；
- workspace-relative / `${VAR}` 解析：共享 workspace media path contract 与 VSCode project-file adapter；
- facade 形状和结果语义：共享 `ProjectQualityFacade`；
- target-bound live snapshot 模式：与 `.nkv` facade 一致，但具体 `.nka` 缓存读取仍由 `AudioProjectProvider` 所有。

没有新增 Skill、命令、中央格式 parser、平行 DTO、通用 facade framework 或音频 DSP 实现。虽然 `.nkv/.nks/.nka` facade 存在相似编排骨架，但格式 codec、结构不变量、preview adapter 和 readiness evidence 的变化方向不同；本批不为减少少量重复引入 generic base class。若后续 `.nkp/.nkm` 证明 load/revision/result envelope 完全稳定，再单独评估提取共享 helper，而不是让功能包互相导入内部实现。

### 13.2 Target-bound revision、结构与资源验证

`NekoAudioAPI.projectQuality` 现在暴露 `.nka` facade。live state 只通过请求中的 `documentUri` 调用 `getProjectDataForDocument()`；不读取 focused editor，也不隐式打开其他项目。目标未打开时读取显式磁盘 URI，snapshot source 明确报告 unavailable 时 fail-closed。

对 `loadNka()` 得到的 canonical `AudioProjectData` 计算：

```text
contentDigest = hashStableValue(canonical AudioProjectData)
projectRevision = nka:<contentDigest>
```

在 final-mix renderer 或 readiness adapter 运行前核对 revision/content digest。旧 revision 返回 `stale-quality-evidence`，adapter 不会执行。future/read-only schema 不作为可权威验证的当前项目接受；创建 project ref 时遇到 invalid/future schema 同样直接抛错。

package-owned 补充不变量包括：

- track id 非空且唯一，element id 在全项目非空且唯一；
- `.nka` track 和 element 必须使用 audio 类型；
- start/duration/trim 必须有限且合法，trim 不得吃掉整个 clip；
- `trackMix` key 必须对应真实 track；
- review range 不得超过按 `startTime + duration - trimStart - trimEnd` 计算的项目时长；
- blob、Engine/session、cache/proxy/thumbnail identity、不可解析 absolute path 和缺失 source 明确失败；
- workspace-relative 和 `${VAR}` 使用共享路径解析器，不在 facade 内另造路径系统。

### 13.3 Final-mix preview 与 loudness/peak readiness 边界

本批定义 package-owned ports：`AudioProjectFinalMixRenderer`、`AudioProjectRuntimeProbe` 和 `AudioProjectExportReadinessProbe`。它们接收已经通过结构、资源和 revision 检查的 canonical document。

- `renderPreview()` 只接受 target-bound final-mix review artifact，可携带指定 `mediaRange`；没有 renderer 时明确失败，不临时导出一个文件冒充 durable evidence。
- Extension 注册 Engine mix runtime availability probe，但 runtime 可用不等于最终响度或 true peak 合格。
- `checkExportReadiness()` 检查至少一个经 solo/mute/track gain routing 后可听的 audio element，以及非零 master volume。
- loudness 和 true peak 必须由能够 materialize 当前 final mix 的 Engine-backed readiness adapter 产生证据。当前没有安全、target-bound 的 final-mix artifact lifecycle，因此生产接线不注册 readiness adapter；结果为 `ok: true` envelope、`ready: false`，并在 readiness data 中返回明确 error diagnostic。
- 本任务不执行正式 export。正式 deliverable、export lineage 和 post-export probe/decode/loudness 验证仍属于 8.x。

因此 `.nka` 结构质检无需先导出成品；需要听感、响度或峰值证据时，应渲染绑定当前 revision 的指定范围 final-mix review artifact。不能用 active playback stream、cache 文件或单个 source 的 `analyzeLoudness()` 代替整个项目 final mix。

### 13.4 路径级测试与质量自审

已运行：

```bash
pnpm --filter neko-audio test
# 18 files, 184 tests passed

pnpm --filter neko-audio compile:extension
# esbuild passed

pnpm --dir packages/neko-audio/packages/extension exec tsc \
  -p tsconfig.quality-check.json --noEmit
# production sources passed；临时 tsconfig 排除既有测试类型基线后已删除

pnpm exec eslint \
  packages/neko-audio/packages/extension/src/services/AudioProjectQualityFacade.ts \
  packages/neko-audio/packages/extension/src/services/AudioProjectQualityFacade.test.ts \
  packages/neko-audio/packages/extension/src/providers/AudioProjectProvider.ts \
  packages/neko-audio/packages/extension/src/providers/AudioProjectProvider.headlessAuthoring.test.ts \
  packages/neko-audio/packages/extension/src/extension.ts \
  packages/neko-audio/packages/extension/src/types/api.ts
# passed

git diff --check -- packages/neko-audio \
  openspec/changes/converge-creative-media-skills-and-quality-gates
# passed
```

质量自审风险为 L3（项目格式、Extension public API、媒体 readiness boundary）。未发现阻断项。路径级测试证明：target-bound live snapshot 优先于磁盘、stale revision 会 poison renderer/readiness path、final-mix renderer 收到精确 project/revision/range、readiness probe 收到项目有效时长、future schema/runtime-cache/missing source/orphan mix/silent routing 均 fail-visible。

剩余风险：

- 当前生产环境没有 final-mix review renderer 和 loudness/true-peak readiness adapter，因此 preview/readiness 正确报告 unavailable，而不是伪装通过；
- 没有修改 Engine、Webview 或跨层 message，不需要 cargo test 或 VSCode Webview runtime smoke；
- 下一项任务 7.4 为 `neko-puppet` owning package 的 `.nkp` ProjectQuality facade。

## 14. 旧创作 Skill 运行时导出清理（2026-07-12）

### 14.1 清理顺序与 owning boundary

本批按“先切断旧成功路径，再迁移价值内容”的顺序处理，不再把“未出现在 `getBuiltinSkills()` 默认列表”视为已完成清理：

1. 从 `@neko/skills` builtin public exports 删除 `ai-generate`、`comic-to-storyboard`、`media-to-video`、`comic-to-animation`、`image-to-shot`、`storyboard-to-animation-plan`、`animation-plan-to-cut`、`generated-shot-assembly` 和 `export-video-package` 的定义/getter；
2. 删除上述旧 Skill 的实现文件、本地化 catalog metadata 和 Markdown prompt 文件；
3. 删除 `ai-generate` 复制的 `SkillToolDefinition[]`，运行时参数 schema 只由 capability/tool registry 拥有；
4. 在模块导出测试中 poison 所有旧 symbol，证明它们不能再被外部消费者重新注册为 builtin Skill；
5. 仅保留已批准、可观测且有移除条件的 migration alias。当前 `quality-assessment -> media-quality-review` alias 位于 Agent migration boundary，不恢复第二份 builtin 定义。

这次没有新增 Skill、命令、generic Skill factory 或平行 registry。canonical 用户入口仍是 `storyboard`、`image`、`video`、`media-production`、`video-editing` 和 `media-quality-review`。

### 14.2 方法论与 fixture 迁移

旧 `comic-to-storyboard` 中仍有价值、且不属于运行时工具协议的规则已压缩迁入 canonical `storyboard/from-comic` 内容及测试：

- 像素级视觉证据/OCR/分格边界不足时只返回 diagnostic，不编造分镜表；
- 阅读方向、分格 keep/skip/merge/split、OCR 文本分类和稳定 scoped resource identity；
- `imagePrompt` 与 scene-level `videoPrompt` 的生成有效约束、长场景 beat/time segmentation 和常见 prompt failure checks；
- 先完成唯一 review projection，再进行 Canvas durable authoring handoff；两者不能互相冒充。

旧 `ai-generate` 的“只有 capability 确认后才能宣称生成成功”约束迁入 canonical `image`/`video`；pending/blocked/failed 状态不会被描述为已生成。

没有把 220 行漫画专用 prompt 整体搬入 canonical Skill。运行时工具名、参数表、轮询协议、Canvas/Cut command 和 provider schema 均已丢弃，避免 Skill 再次膨胀。该批次识别出的旧 artifact/profile identity 已在后续第 15 节迁移；任务 9.5/9.6 仍不标记完成，因为 evaluation manifest、locale/docs 全量迁移、旧 Quality/path-only fixture 与其他 fallback 尚未完成。

### 14.3 验证与提交

代码提交：

```text
d5a754e4e refactor(skills): remove legacy creative skill exports
```

已运行：

```bash
pnpm --filter @neko/skills test
# 34 files, 320 tests passed

pnpm --filter @neko/skills exec tsc --noEmit -p tsconfig.json
# passed

pnpm exec eslint \
  packages/neko-skills/src/builtins/builtin-definitions.ts \
  packages/neko-skills/src/builtins/builtin-skill-locales.ts \
  packages/neko-skills/src/builtins/builtin-skills.test.ts \
  packages/neko-skills/src/builtins/creative-media.ts
# passed

git diff --check -- packages/neko-skills
# passed
```

剩余清理按以下顺序继续：

1. 完成 Agent prompts、eval manifests、locale metadata 和其余跨包文档的 canonical identity 审计；
2. 删除旧 Quality/path-only fixture、dual-read/fallback；
3. 扩展 repository legacy-debt/unused assertions，覆盖所有到期名称和默认成功路径；
4. 最后删除到期 migration alias，而不是先隐藏 catalog 后保留旧实现。

## 15. 媒体制作来源与 Artifact profile identity 收敛（2026-07-12）

### 15.1 Identity 分层与 contract 约束

本批没有创建新的 stage Skill，而是将仍可能从 artifact/capability 路径恢复旧语义的 profile identity 收敛为三层：

| 层级                | Canonical identity                                                                                               | 用途                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 用户级媒体制作来源  | `media-production/from-comic`                                                                                    | Skill metadata 和场景/evaluation taxonomy                                    |
| Storyboard 来源     | `from-comic`                                                                                                     | `StoryboardTable.sourceProfile`、Storyboard 投影和来源约束                   |
| 内部 artifact/stage | `media-production.animation-plan`、`media-production.shot-image-prep`、`media-production.shot-image-prep-review` | Agent artifact registry、GenericTable/CompositeArtifact、Canvas/Cut renderer |

共享 `ArtifactProfileDescriptor` id contract 为 `^[a-z0-9][a-z0-9._:-]{0,127}$`，不允许 `/`。因此 `media-production/from-comic` 不注册为 artifact profile；内部 stage identity 使用 `.`，并从 `@neko/shared` 的 `media-production.ts` 统一导出。

Storyboard 的 canonical 来源字段是 `sourceProfile`。`table.profile` 即使使用 `from-comic`，也不能补偿缺失的 `sourceProfile`；canonical validator 会返回 `unsupported-source-profile`。这移除了本批实现过程中短暂出现的 profile/sourceProfile 双读设计，避免形成新的 compatibility fallback。

### 15.2 运行时导出、fixture 与 capability catalog 清理

已完成：

- `COMIC_SHOT_ASSET_PREP_*`、`buildComicShotAssetPrepTable` 和对应旧 column helper 不保留导出 alias，统一为 `SHOT_IMAGE_PREP_*`、`buildShotImagePrepTable`；
- Agent builtin artifact registry 只注册 `media-production.shot-image-prep`，并用 poison assertion 证明旧 registry identity 返回 `undefined`；
- Canvas/Cut renderer catalog 只声明三个 typed internal artifact profile 与 `from-comic` Storyboard profile；Cut projector 只接受 `from-comic`；
- Canvas Webview capability identity 从漫画专用 pipeline/review 名称收敛为通用 image-prep/shot-image-prep identity；
- composite artifact fixture/test 文件改名为 `media-production-from-comic-artifact.*`，外层 animation plan、内层 shot image prep、Storyboard source profile 和 scenario metadata 分别使用所属层级的 canonical identity；
- Agent runtime、stream processor 和 Webview fixture 已更新，旧名称只允许出现在显式 negative/poison assertion 中，不再作为可成功 registry、renderer 或 fixture identity。

代码提交：

```text
ad07f9acd refactor(media): canonicalize production artifact profiles
```

### 15.3 验证结果

已通过：

```bash
pnpm --filter @neko/shared test
# 156 files, 1431 tests passed

pnpm --filter @neko/skills test
# 34 files, 320 tests passed

cd packages/neko-agent && pnpm exec vitest --run \
  packages/agent/src/runtime/__tests__/capability-runtime-registries.test.ts \
  packages/agent/src/runtime/__tests__/agent-capability-injection-runtime.test.ts
# 2 files, 23 tests passed

pnpm --filter @neko-agent/webview exec vitest --run \
  src/components/ChatView/ContentBlockItem.test.tsx
# 1 file, 10 tests passed

pnpm --filter @neko-agent/extension exec vitest --run \
  src/chat/message/__tests__/agentStreamProcessor.test.ts
# 1 file, 45 tests passed

pnpm --filter neko-canvas exec vitest --run \
  packages/extension/src/__tests__/agentCapabilityProvider.test.ts
# 1 file, 41 tests passed

pnpm --filter neko-canvas exec vitest --run \
  packages/webview/src/components/panels/PropertyPanel.test.ts \
  -t "enumerates migrated Shot bindings before legacy branches"
# 1 passed, 6 skipped

pnpm --filter neko-cut exec vitest --run \
  packages/extension/src/agentCapabilityProvider.test.ts
# 1 file, 5 tests passed

pnpm exec eslint <本批 21 个 TypeScript/TSX 文件>
# 0 errors；8 个既有 warning，均不位于本批 identity 修改行

git diff --cached --check
# passed
```

类型检查结果：

- `packages/neko-skills/tsconfig.json` 与 `packages/neko-agent/packages/webview/tsconfig.json` 通过；
- Canvas extension 仍被既有 `moduleResolution`/`@neko/shared` 解析问题和既有 implicit-any 阻塞；
- Cut extension 仍被既有 DOM/WebCodecs lib 配置问题阻塞；
- Agent/Extension 仍被并行开发中的 perception、terminal localization、runtime fixture 和旧 consistency-check import 问题阻塞；这些错误未指向本批 profile identity 文件，聚焦测试已覆盖本批执行路径。

清理门禁已执行但被仓库既有/并行债务阻塞：

```bash
pnpm check:legacy-debt
# failed: 87 blocking occurrences（migrate-now=76, needs-review=11）
# 主要来自尚未到期的 Skill migration alias、Agent/CLI 并行改动与既有 debt ledger；本批新增 profile 文件未形成新的 blocking hotspot。

pnpm check:unused
# failed: 1 unused file、5 unused dependencies、2 unlisted dependencies、25 unused exports、2 duplicate exports
# 输出未列出本批新增 canonical profile constants、builders 或 fixtures。
```

仓库残留搜索中，旧 artifact/profile identity 只存在于 `not.toContain`、`toBeUndefined`、`not.toHaveProperty` 等 negative/poison assertions；生产 catalog、registry、fixture 和 renderer 中无成功引用。

### 15.4 尚未完成

本批只完成 9.5/9.6/9.7 中的 artifact/profile fixture 与 registry 子集，因此不勾选整项任务。后续仍需：

1. 审计并迁移剩余 Agent prompt、evaluation manifest、locale metadata 和文档；
2. 删除旧 Quality/path-only fixture、dual-read/fallback 和到期 migration alias；
3. 将 removed identity poison 扩展到 repository-level legacy-debt/unused gate；
4. 完成全仓 `pnpm check`、`pnpm test`、`pnpm check:legacy-debt`、`pnpm check:unused` 与真实 Agent evaluation。

## 16. 残留 Skill 激活与 path-only Quality 工具导出清理（2026-07-12）

### 16.1 NekoCut 不再激活已删除的 `ai-generate`

审计发现 NekoCut 的两个 Extension command 仍通过 `neko.agent.invokeSkill` 固定发送 `skillName: ai-generate`。这意味着旧 builtin export 虽已删除，跨 Extension 运行时仍可能请求旧身份，形成“catalog 已清理、调用方仍激活”的污染路径。

本批将该边界收敛为显式 canonical Skill：

- 单视频片段生成发送 `video`；
- 音视频转写并加入字幕时间线发送 `subtitle`；
- `buildCutAgentSkillInvocation()` 只接受上述白名单，并对 `ai-generate` fail-visible；
- 不增加新的用户 Skill、Slash command、fallback alias 或通用 registry。

该 helper 只拥有 NekoCut 到 Agent 的跨 Extension invocation payload，未承载 Cut command schema、Provider schema 或创作方法论，因此不会扩大 Skill 内容或复制 capability contract。

### 16.2 删除旧 Quality tool schema 与 Agent wrapper

生产 capability registry 已通过 `createCanonicalQualityCheckTools()` 注册 `QualityCheck`，canonical 输入为 revision-bound `QualityTarget`，且必须提供稳定 `resourceRef` 或 owning `projectRef`。旧代码仍保留另一套可公开导出的工具工厂：

- `createLegacyQualityCheckTools()`；
- `createLegacyConsistencyCheckTools()`；
- Agent Extension 的 `qualityCheckTools.ts` / `consistencyCheckTools.ts` wrapper；
- 基于 `scenes[].mediaPath` 的 `QualityCheck`、`QualityRepairCheck`、`QualityCheckConsistency` 重复 toolDefinitions 和测试 fixture。

这些路径没有生产调用方，但仍能被外部 import 后重新注册，属于运行时成功能力残留，而不是有价值的方法论。本批已删除上述实现、public exports、Agent wrapper 和 legacy fixture；没有迁移其 path-only schema、文件读取 adapter、修复重试协议或本地化参数表。

保留的能力边界为：

- canonical `QualityCheck`：`QualityTarget.resourceRef/projectRef` + revision/digest；
- cross-shot consistency evaluator：继续作为 canonical Quality Gate profile 内部 evaluator 使用，不再以 path-only 独立工具暴露；
- perception、audio、frame evaluator ports：继续由 `quality-gate-runtime` 组合，外部感知模型仍只能替换 perception evaluator。

新增 export-surface poison assertion，证明 `@neko/skills` 不再导出两个旧工厂；既有 canonical 测试继续证明即使同时提供合法 target，额外 `mediaPath` 也会在 review handler 运行前被拒绝。

### 16.3 验证

已运行：

```bash
pnpm --filter neko-cut exec vitest --run \
  packages/extension/src/services/cutAgentSkillInvocation.test.ts
# 1 file, 4 tests passed

pnpm --filter @neko/skills test
# 33 files, 306 tests passed

pnpm --filter @neko-agent/extension exec vitest --run \
  src/tools/__tests__/capabilityProviders.test.ts \
  src/tools/__tests__/qualityCapabilityProvider.test.ts
# 2 files, 7 tests passed

pnpm exec tsc --noEmit -p packages/neko-skills/tsconfig.json
# passed

pnpm exec eslint \
  packages/neko-cut/packages/extension/src/extension.ts \
  packages/neko-cut/packages/extension/src/services/cutAgentSkillInvocation.ts \
  packages/neko-cut/packages/extension/src/services/cutAgentSkillInvocation.test.ts \
  packages/neko-skills/src/quality/index.ts \
  packages/neko-skills/src/quality/__tests__/canonical-quality-tools.test.ts
# passed

git diff --check -- <本批文件>
# passed
```

全仓门禁现状：

- `pnpm check:legacy-debt` 仍失败，但 blocking 从上一批记录的 87 降至 76（`migrate-now: 65`、`needs-review: 11`）；本批删除的旧 Quality factories/wrappers 不再出现在 production debt surface。
- `pnpm check:unused` 仍为既有基线：1 unused file、5 unused dependencies、2 unlisted dependencies、25 unused exports、2 duplicate exports；未报告本批新增 helper 或 canonical Quality exports。
- `@neko-agent/extension` 全包 typecheck 被并行工作区中的 perception/session/locale contract 修改阻塞；错误位于 `perception-pipeline.ts`、`read-image-perception-backfill.ts`、`agentMessageTurnHandler.ts` 和 `skillContextRoutes.ts`，与本批删除的无调用方 wrapper 无关。
- NekoCut Extension 全包直接 `tsc` 仍受既有 DOM lib、timeline/transition/keyframe 和 service signature 基线错误阻塞；本批通过聚焦 Vitest 与 ESLint 验证 invocation contract。

任务 9.5/9.6/9.7 暂不整体勾选：本批完成了旧激活入口、重复 Quality schema、legacy fixture 和 poison assertion 的一个独立子集；其余 evaluation/locale/docs 全量审计、到期 alias、generated asset lifecycle 及其他 fallback 仍需继续处理。

## 17. Quality SubAgent 与 ToolGroup catalog 收敛（2026-07-12）

删除 path-only Quality 工具后继续审计 prompt/capability catalog，发现 `quality-checker` SubAgent preset 和 builtin `media-qa` ToolGroup 仍允许 `QualityRepairCheck`、`QualityCheckConsistency`。这两个名称已没有生产工具注册，继续保留会诱导 Agent 调用未知工具，也会让旧 schema 从 prompt/catalog 回流。

本批调整为：

- `quality-checker.toolPolicy.tools` 仅允许 canonical `QualityCheck`；
- 英文和中文 SubAgent prompt 均说明单素材与跨镜一致性使用同一 canonical review 入口，并由目标语义选择 Quality profile；
- `media-qa` ToolGroup 仅发布 `QualityCheck`；
- 测试 poison `QualityCheckConsistency` prompt 文本，并断言两个 catalog 的工具列表不存在旧工具。

修复/重生成不是另一个 Quality 收集工具：canonical review 返回 evidence、Gate verdict 和 repair plan，实际 mutation 由 `image`、`video`、Cut/Audio/Canvas owning capability 执行，产生新 revision 后再重跑 Gate。跨镜一致性同样是 `cross-shot-consistency` profile，而不是独立 path-only tool。

验证：

```bash
pnpm --filter @neko/skills exec vitest --run \
  src/subagent/__tests__/creative-presets.test.ts \
  src/builtins/builtin-skills.test.ts
# 2 files, 27 tests passed

pnpm --filter @neko/skills test
# 33 files, 307 tests passed

pnpm exec tsc --noEmit -p packages/neko-skills/tsconfig.json
# passed

pnpm exec eslint <本批 4 个 TypeScript 文件>
# passed
```

该子集继续推进任务 9.5/9.6/9.7，但不整体勾选；active Agent tool-result validation adapter 中仍存在旧 `QualityRepairCheck` / `QualityCheckConsistency` 输出解释分支，需要与 canonical `QualityGateResult` 证据投影一起迁移，不能只删分支导致 Agent 失去质量反馈。
