## Why

Neko Suite 已具备 Story、Content、Media Provider、Sketch、Canvas、Cut、Audio 与 Quality 等影视创作积木，但当前用户入口按中间转换阶段过度拆分，Storyboard/Image/Video 缺少统一语义，质量检查也仍以裸 `mediaPath` 和生成媒体为中心，无法形成可证明的“素材 → 生成 → 质检 → 后期 → 质检 → 成品”闭环。现在需要在继续增加更多 Skill 和命令前收敛用户意图、领域契约与质量 Gate，避免 Skill prompt、运行时 tool schema、功能包能力和 `.nk*` 项目真值进一步漂移。

## What Changes

- 建立面向用户意图的创作 Skill 分类：`storyboard`、`image`、`video`、`media-production`、`video-editing` 与 `media-quality-review`；普通 Skill 继续通过 `$skill` 或 Agent 自主激活，不新增同名 Slash command。
- 将 `comic-to-storyboard` 的漫画 OCR、panel 顺序和跨格映射规则收敛为 `storyboard/from-comic` profile，并为 prompt、text、script、document、image-sequence 与 existing-storyboard 定义统一来源 profile 和 canonical Storyboard 输出。
- 将通用图片生成、编辑、inpaint、outpaint、upscale、colorize、style transfer、composite 与 split 统一到 `image` Skill 语义；具体执行仍由 Media、Sketch、Canvas 或 Engine owning capability 负责。
- 将单 clip 文生视频、图生视频、首尾帧生成、reference/video-to-video、转换与 timeline 准备统一到 `video` Skill；Provider 不支持的 operation 必须返回可诊断的 unavailable/degraded 结果。
- 将现有 `media-to-video` 和多个阶段型 Skill 收敛为 `media-production` 编排；Storyboard builder、AnimationPlan builder、Cut payload builder、generated-shot assembly 与 export package builder 降为内部 workflow stage、artifact builder 或 owning package capability。
- 建立 API-first、local-first 的 `QualityTarget`、`QualityEvidence`、`QualityGateResult` 和 evaluator/validator port，支持 `ResourceRef`、项目 revision、timeline range、预期创作意图和交付 lineage；外部感知模型只能替换 perception evaluator，不能替代结构、codec、响度、项目引用和导出完整性检查。
- 为 image、video clip、audio、storyboard、cross-shot consistency、timeline/final cut、`.nk*` project artifact 与 exported deliverable 定义质量 profile；领域 Skill 只承担 operation-local contract validation，综合创作审查和 release verdict 由 `media-quality-review` 编排。
- 要求 `.nks/.nkv/.nkp/.nkm/.nka` 的 schema、引用、graph/timeline 和 export readiness 验证由 owning package 提供；中央 Quality 层不得自行复制各格式解析和业务真值。
- 建立创作中、Export 前和 Export 后三层质量 Gate，并使质量证据绑定被审查的 project/asset revision；后续编辑必须使过期证据失效。
- **BREAKING**：停止将旧阶段型 builtin Skill 和普通 Skill `command` 字段作为 canonical 用户入口；预发布迁移完成后旧名称必须 fail-visible 或通过有期限、可观测的迁移别名进入新 canonical Skill，不能继续双轨成功。
- **BREAKING**：Quality runtime 的 canonical 输入从裸 `mediaPath` 迁移到 `QualityTarget.resourceRef`；仅迁移/拒绝测试可覆盖旧输入，默认执行路径不得静默回退。

## Capabilities

### New Capabilities
- `creative-media-skill-taxonomy`: 定义用户级创作 Skill、内部 profile/stage、capability catalog 和命令边界的 canonical 分类。
- `storyboard-source-normalization`: 定义 prompt、text、script、document、comic、image-sequence 和 existing storyboard 到统一 Storyboard contract 的行为。
- `image-video-creation-operations`: 定义统一 Image/Video 用户语义、Provider capability negotiation 与 owning package 执行边界。
- `media-production-orchestration`: 定义 Storyboard 到生成媒体、Cut/Audio 后期、Export 的可恢复编排、stage artifact 和 headless authoring handoff。
- `media-quality-targets-and-profiles`: 定义跨素材 QualityTarget、质量 profile、结构/技术/感知/策略评估和外部 evaluator adapter 边界。
- `project-deliverable-quality-gates`: 定义 `.nk*` owning validator、revision-bound evidence、Export 前 preflight 与 Export 后 deliverable verification。

### Modified Capabilities
- `quality-validation-release-loop`: 将现有代码变更质量门禁补充为创作媒体变更所需的真实 Agent evaluation、项目质量 Gate 和路径级验证要求。
- `generated-asset-lifecycle`: 生成素材的质量证据、修复尝试和 promoted asset 必须绑定稳定 ResourceRef 与 revision/lineage，不能绑定 cache path 或临时 render URI。

## Impact

- 主要影响 `packages/neko-skills` 的 builtin Skill 目录、Skill metadata、防工具协议回流测试和质量运行时契约。
- 影响 `packages/neko-agent` 的媒体 capability catalog、Provider 支持声明、Skill 路由/evaluation fixture 与 Quality adapter composition，但不允许 Skill 直接依赖具体 AgentSession 实现。
- 影响 `neko-story`、`neko-content`、`neko-sketch`、`neko-canvas`、`neko-cut`、`neko-audio`、`neko-puppet`、`neko-model` 的 owning capability/API；功能包之间不得直接交叉 import。
- 可能新增或扩展 `@neko/shared` 中的 ResourceRef、Storyboard、QualityTarget、QualityEvidence、project revision 与 diagnostic contract；Engine/Proto 只在 codec probe、媒体分析或现有 TS 契约不足时扩展。
- 影响旧 Skill 名称、旧 `command` 元数据、Quality 工具输入、测试 fixture 和 Agent evaluation scenario；项目文件格式默认不做无关升级，若确需持久化 QC evidence，应优先使用 sidecar/index 或明确版本化字段。
- 非目标：在本次变更中实现所有第三方图像/视频模型、把外部感知服务设为强依赖、在中央 Quality 包复制 `.nk*` codec、重写 Cut/Canvas/Sketch 编辑器，或为了远程多租户引入服务治理层。
- 成功标准：用户可从 prompt/text/script/document/comic/image 进入统一 Storyboard/Production 路径；生成结果和项目 revision 可经过局部、pre-export、post-export Gate；最终报告能证明使用了 canonical Skill、owning authoring API、稳定资源引用和当前 revision，旧阶段型路径不能默认返回成功。
