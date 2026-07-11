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
- 下一步继续任务 7.2：由 `neko-cut` owning package 提供 `.nkv` ProjectQuality facade；中央 Quality 只消费 facade 证据。
