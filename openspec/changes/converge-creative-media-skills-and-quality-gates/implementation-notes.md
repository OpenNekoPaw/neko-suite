# 创作媒体 Skill 与质量门禁实施记录

> 日期：2026-07-11
>
> OpenSpec change：`converge-creative-media-skills-and-quality-gates`
>
> Schema：`spec-driven`
>
> 当前进度：53/87（完成 1.1–6.11；7.x–10.x 尚未完成）

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
