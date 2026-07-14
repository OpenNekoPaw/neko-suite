import type { Skill } from '@neko/shared';
import {
  IMAGE_OPERATION_IDS,
  MEDIA_PRODUCTION_FROM_COMIC_PROFILE_ID,
  STORYBOARD_SOURCE_PROFILE_IDS,
  TOOL_NAMES_MEDIA,
  TOOL_NAMES_PERCEPTION,
  TOOL_NAMES_QUALITY,
  TOOL_NAMES_SYSTEM,
  TOOL_NAMES_TIMELINE,
  VIDEO_OPERATION_IDS,
} from '@neko/shared';
import { localizeBuiltinSkill } from './builtin-skill-content';

export interface CreativeMediaProfileDescriptor {
  readonly id: string;
  readonly ownerSkill:
    'storyboard' | 'image' | 'video' | 'media-production' | 'media-quality-review';
  readonly kind: 'source' | 'operation';
}

export interface CreativeMediaWorkflowStageDescriptor {
  readonly id: string;
  readonly ownerSkill: 'media-production' | 'video-editing' | 'media-quality-review';
  readonly artifactKind: string;
}

export const CREATIVE_MEDIA_PROFILES: readonly CreativeMediaProfileDescriptor[] = [
  ...STORYBOARD_SOURCE_PROFILE_IDS.map((profile) => ({
    id: `storyboard/${profile}`,
    ownerSkill: 'storyboard' as const,
    kind: 'source' as const,
  })),
  {
    id: MEDIA_PRODUCTION_FROM_COMIC_PROFILE_ID,
    ownerSkill: 'media-production',
    kind: 'source',
  },
  ...IMAGE_OPERATION_IDS.map((operation) => ({
    id: `image/${operation}`,
    ownerSkill: 'image' as const,
    kind: 'operation' as const,
  })),
  ...VIDEO_OPERATION_IDS.map((operation) => ({
    id: `video/${operation}`,
    ownerSkill: 'video' as const,
    kind: 'operation' as const,
  })),
];

export const CREATIVE_MEDIA_WORKFLOW_STAGES: readonly CreativeMediaWorkflowStageDescriptor[] = [
  {
    id: 'storyboard-normalization',
    ownerSkill: 'media-production',
    artifactKind: 'storyboard-table',
  },
  { id: 'animation-planning', ownerSkill: 'media-production', artifactKind: 'animation-plan' },
  { id: 'cut-authoring', ownerSkill: 'video-editing', artifactKind: 'cut-project-revision' },
  {
    id: 'generated-shot-assembly',
    ownerSkill: 'video-editing',
    artifactKind: 'cut-project-revision',
  },
  {
    id: 'preflight-export',
    ownerSkill: 'media-quality-review',
    artifactKind: 'quality-gate-result',
  },
  {
    id: 'deliverable-verification',
    ownerSkill: 'media-quality-review',
    artifactKind: 'quality-gate-result',
  },
];

const storyboardContent = `# Storyboard

Turn a prompt, prose, script, document, comic, ordered image sequence, or existing storyboard revision into one canonical Storyboard.

## Method

1. Identify the source profile and preserve source order, scene boundaries, dialogue context, and visual evidence appropriate to that profile.
2. Produce stable scene and shot identities, visual intent, narrative context, camera and duration guidance, source trace, and a revision identity.
3. Use stable resource references for source and reference media. Cache paths, render URIs, provider task handles, and session handles are never Storyboard truth.
4. Validate the canonical Storyboard before projecting it. Invalid or unsupported sources must return visible diagnostics rather than an invented table.
5. Treat Canvas as a review projection and Cut as a one-way authoring handoff. Neither becomes a second writable Storyboard truth.

## Review table and prompt invariants

- The canonical artifact is nested \`scenes[] -> shots[]\`: a scene owns its ordered shots, and a scene cell in a review table never replaces the scene record. Shot media references remain shot facts.
- A reviewable Storyboard keeps distinct \`scene\`, \`shot\`, \`source\`, \`imagePrompt\`, \`videoPrompt\`, \`duration\`, and \`dialogue\` semantics. Never collapse image and video intent into one generic generation-prompt column.
- \`imagePrompt\` is shot-level and only describes an executable image generation or edit task. Include subject/appearance, scene, composition, style/light, reference role, preserved details, ordered edit steps when applicable, and constraints.
- \`videoPrompt\` is scene-level. Write at most one per scene, normally on its first shot, and aggregate the ordered shot beats, subject motion, camera transitions, environmental change, dialogue/audio or silence, total duration, reference roles, and constraints.
- Visual description, camera notes, action summaries, review states, and diagnostics do not substitute for either prompt. Leave a prompt empty when no generation/edit operation is intended; do not fill it with status codes or analysis fragments.
- Resource aliases must resolve unambiguously inside their declared scope. If a token matches multiple resources, emit a visible binding diagnostic and do not select or invent a source.

## Comic source profile

- Require actual pixel-level visual evidence, OCR, or panel boundaries before claiming panel count, dialogue, action, or camera. Metadata, thumbnails, filenames, dimensions, and page labels alone are not visual evidence. When evidence is unavailable, return plain diagnostics and do not invent or output a Storyboard table.
- Determine orientation and reading order before mapping panels. Classify dialogue, narration/caption, visible SFX, signs/background text, and unknown text separately; only spoken dialogue belongs in \`dialogue\`.
- Decide keep, skip, merge, split, or transition-only use before creating shots. A page may produce multiple shots, and covers, copyright/contents pages, blanks, ads, duplicates, or pure metadata do not become story shots by default.
- Build source trace from stable scoped resource identities. Attachment order and guessed filenames are not identity; a full-page source may be referenced by a stable page-plus-panel locator without pretending that a separate panel asset exists.

## Generation-effective prompt checks

- A non-empty prompt must be executable rather than a fragment, review label, or visual-analysis note. State reference purpose and check ambiguous references, conflicting instructions, overloaded content, unassigned resources, and duration mismatch.
- Image generation prompts cover appearance, environment, composition/camera, style/color/light, reference consistency, and constraints. Image edits additionally state what to preserve and the ordered crop/split/rotate/colorize/redraw/remove-text/inpaint/outpaint/upscale/style-normalization operations.
- Scene video prompts cover source/reference roles, characters and emotion, ordered or time-coded action beats, camera transitions, environmental change/effects, dialogue/narration/SFX or silence, pacing, total duration, and constraints. Long scenes should use explicit beat or time segments instead of an overloaded paragraph.
- When a reference image is directly usable and no image operation is intended, leave \`imagePrompt\` empty instead of inventing edit work.

Finish the single reviewable Storyboard projection before any requested Canvas handoff. The visible review projection is not a substitute for durable Canvas authoring, and Canvas authoring cannot replace the initial Storyboard review. A Canvas projection keeps each scene as a container and each shot as its owned child while preserving revision, prompt intent, and stable image/media references; never flatten a canonical Storyboard into a gallery or asset list. Existing-storyboard refinement always creates a new revision when intent or ordering changes.
`;

const storyboardZhCnContent = `# 分镜

把提示词、文本、剧本、文档、漫画、有序图片序列或已有分镜修订版归一化为同一种 canonical Storyboard。

## 方法

1. 识别来源 profile，并按该 profile 保留来源顺序、场景边界、对白上下文和视觉证据。
2. 产出稳定的场景/镜头身份、视觉意图、叙事上下文、镜头与时长指导、来源追踪和修订身份。
3. 来源与参考媒体只使用稳定资源引用；cache path、render URI、provider task handle 和 session handle 都不是分镜真值。
4. 投影前验证 canonical Storyboard；无效或不支持的来源必须返回明确诊断，不能编造表格。
5. Canvas 只是审阅投影，Cut 只是单向 authoring handoff，二者都不能成为第二份可写分镜真值。

## 审阅表与提示词不变量

- canonical 产物必须保持 \`scenes[] -> shots[]\` 嵌套：scene 拥有按顺序排列的 shots，审阅表中的 scene 单元格不能替代 scene 记录；shot 的媒体引用始终属于该 shot。
- 可审阅分镜必须保持 \`scene\`、\`shot\`、\`source\`、\`imagePrompt\`、\`videoPrompt\`、\`duration\`、\`dialogue\` 的独立语义；禁止把图片与视频意图合并成一个笼统的“生成提示词”列。
- \`imagePrompt\` 是 shot 级字段，只描述可执行的图片生成或编辑任务；应包含主体/人物外观、场景、构图、风格与光影、参考素材用途、必须保留的细节、必要时按顺序排列的编辑步骤，以及约束。
- \`videoPrompt\` 是 scene 级字段；每个 scene 最多一个，通常写在第一条 shot，并汇总按镜号排列的动作节拍、主体运动、运镜连接、环境变化、对白/音频或无声、总时长、参考素材用途和约束。
- 画面描述、景别/运镜备注、动作摘要、审阅状态和诊断都不能替代提示词。没有生成/编辑意图时允许留空，不得用状态码、分析碎片或“待优化”占位。
- 资源 alias 必须在声明的 scope 内唯一解析；同一 token 匹配多个资源时必须输出明确的绑定诊断，不得选择候选项或编造来源。

## 漫画来源 profile

- 只有获得实际像素级视觉证据、OCR 或分格边界后，才能判断分格数、对白、动作或镜头；metadata、缩略图、文件名、尺寸和页码本身不是视觉证据。证据不可用时只返回明确诊断，不得编造或输出分镜表。
- 映射分格前先判断方向和阅读顺序。对白、旁白/字幕框、可见音效字、标牌/环境文字和未知文字必须分别分类；只有明确说出的内容进入 \`dialogue\`。
- 创建镜头前先决定 keep、skip、merge、split 或仅作为转场证据。一页可以产生多个镜头；封面、版权/目录页、空白、广告、重复页和纯 metadata 默认不进入正文镜头。
- 来源追踪只使用稳定且有 scope 的资源身份；附件顺序和猜测文件名不是身份。整页来源可以用稳定的“页+分格”定位引用，但不得假装独立分格素材已经存在。

## 生成有效提示词检查

- 非空提示词必须可执行，不能只是碎片、审阅标签或视觉分析笔记。必须说明参考用途，并检查引用模糊、指令冲突、内容过载、素材无归属和时长不匹配。
- 图片生成提示词覆盖人物/主体外观、环境、构图/镜头、风格/色彩/光影、参考一致性和约束；图片编辑还要说明保留内容，以及按顺序执行的裁切/切分/旋转/上色/重绘/去文字/局部重绘/扩图/放大/风格统一操作。
- scene 视频提示词覆盖来源/参考用途、人物与情绪、按镜号或时间段排列的动作节拍、运镜连接、环境变化/特效、对白/旁白/音效或无声、节奏、总时长和约束；长 scene 应使用明确节拍或时间段，不能堆成过载段落。
- 参考图可直接使用且没有图片处理意图时，\`imagePrompt\` 应留空，不得为了填表编造编辑任务。

用户要求 Canvas 交付时，也必须先完成唯一的可审阅 Storyboard 投影。可见审阅投影不能冒充持久 Canvas authoring，Canvas authoring 也不能替代首次分镜审阅。Canvas 投影必须把 scene 保持为容器、shot 保持为其子节点，并保留 revision、提示词意图和稳定图片/媒体引用；禁止把 canonical Storyboard 压平成图库或素材列表。已有分镜一旦改变意图或顺序，必须创建新修订版。
`;

const imageContent = `# Image

Plan or perform one capability-neutral image operation: generation, editing, inpainting, outpainting, upscaling, colorization, style transfer, compositing, splitting, background removal or replacement, or shot-reference preparation.

## Method

1. Select the canonical operation from user intent; do not infer provider support from a free-form prompt field.
2. Preserve stable input references, masks, composition intent, style constraints, requested dimensions, and output count.
3. Negotiate adapter support, required inputs, model/provider requirements, and limits before execution.
4. If support is degraded or unavailable, report the declared diagnostic and smallest recoverable alternative.
5. Submit execution through the negotiated runtime capability and claim a produced asset only from a confirmed runtime capability result. Before confirmation, report only planned, submitted, pending, blocked, or failed state.
6. Validate output existence, readability, media type, and requested basic dimensions locally. Do not claim aesthetic, character-consistency, or policy approval without QualityEvidence.

Selection-, layer-, paint-, and project-format mutations remain owned by the relevant image authoring capability; this Skill expresses creative operation intent without importing package internals.
`;

const imageZhCnContent = `# 图片

规划或执行一种 capability-neutral 图片操作：生成、编辑、局部重绘、扩图、超分、上色、风格转换、融合、切分、背景移除/替换或镜头参考准备。

## 方法

1. 从用户意图选择 canonical operation，不能因为 provider 有自由文本 prompt 就推断其支持某项操作。
2. 保留稳定输入引用、mask、构图意图、风格约束、目标尺寸和输出数量。
3. 执行前协商 adapter 支持等级、必需输入、模型/provider 要求和限制。
4. 能力降级或不可用时，返回声明过的诊断和最小可恢复替代方案。
5. 通过已协商的运行时 capability 提交执行，只有收到确认结果后才能声称素材已生成；确认前只能报告 planned、submitted、pending、blocked 或 failed。
6. 本地只验证产物存在、可读、媒体类型和基础尺寸；没有 QualityEvidence 时不得宣称审美、角色一致性或策略验收通过。

选区、图层、绘画和项目格式变更仍由对应图片 authoring capability 负责；本 Skill 只表达创作操作意图，不导入子包内部实现。
`;

const videoContent = `# Video

Create or transform a single video clip from a prompt, image, keyframes, or reference video. Supported intents include generation, transformation, restyling, extension, enhancement, trimming, retiming, and preparation for timeline authoring.

## Method

1. Separate single-clip creation or transformation from timeline-wide editing, which belongs to video-editing and Cut authoring.
2. Preserve stable source, start-frame, and end-frame references together with motion, camera, duration, audio, and style intent.
3. Negotiate explicit adapter support and limits before execution. End-frame conditioning, restyling, enhancement, or extension must never be assumed.
4. Return visible degraded or unsupported diagnostics when the requested semantics cannot be honored.
5. Claim a generated or transformed clip only from a confirmed runtime capability result. Before confirmation, report only planned, submitted, pending, blocked, or failed state.
6. Validate the returned clip structurally and technically at operation scope. Broader visual consistency and final-cut approval require media-quality-review evidence.
`;

const videoZhCnContent = `# 视频

从提示词、图片、关键帧或参考视频创建或转换单个视频片段，覆盖生成、转换、风格化、延长、增强、裁剪、变速和时间线准备。

## 方法

1. 区分单片段生成/转换与时间线级编辑；后者属于 video-editing 和 Cut authoring。
2. 保留稳定的来源、首帧、尾帧引用，以及动作、运镜、时长、音频和风格意图。
3. 执行前显式协商 adapter 支持和限制，不能默认 provider 支持尾帧约束、风格转换、增强或延长。
4. 无法满足请求语义时返回明确的 degraded 或 unsupported 诊断。
5. 只有运行时 capability 返回确认结果后才能声称片段已生成或转换；确认前只能报告 planned、submitted、pending、blocked 或 failed。
6. operation 范围内只做结构和技术验证；更广泛的视觉一致性与成片审批需要 media-quality-review 证据。
`;

const mediaProductionContent = `# Media Production

Coordinate an Agent-directed, recoverable source-to-deliverable production. Select and reorder work from current evidence and available capabilities; do not force every request through one fixed pipeline.

## Evidence and creator review

1. Read the actual source and existing project state before planning. Separate observed facts, Agent interpretation, creator decisions, and proposed actions. Never treat a filename, prompt, thumbnail, or old plan as content evidence.
2. Reuse current Storyboards, character references, generated assets, project revisions, Quality evidence, and approved documents when they remain valid. Skip satisfied work instead of recreating documents or assets.
3. Ask the creator to approve only material choices: adaptation target and omissions, story or character changes, core visual style, primary image/video/audio technique, cost or risk ceiling, mutation scope, and delivery boundary. Record alternatives, uncertainty, and unresolved questions.
4. A simple low-risk operation may proceed without creating planning files. For complex work, an optional \`brief.md\` may capture source evidence, interpretation, alternatives, creator decisions, and approval scope; it remains ordinary reviewable Markdown, not runtime state.

Ground each source in its own evidence: comics use actual page, panel, reading-order, dialogue, and character appearance evidence; screenplays use scene headings, action, dialogue, location, and timing intent; novels use chapter or scene boundaries, point of view, narration, dialogue, and adaptation omissions; illustrations use visible composition, subjects, layers when available, palette, and spatial relationships. Existing Storyboards and projects use their current revision, owned shots or timeline state, referenced assets, and validation evidence. When those existing facts already satisfy a work unit, mark it skipped or reused rather than rebuilding it.

## Actionable plan

Use an optional living \`plan.md\` only when it improves review or coordination. For every applicable work unit state: the object to change or create; trigger and skip conditions; stable inputs; capability intent; creative and technical constraints; expected output kind; acceptance evidence; failure or degraded branch; dependencies; and approval requirement. Broad phase lists are not execution-ready.

Keep near-term progress bounded with \`pending\`, \`in_progress\`, \`completed\`, or \`blocked\`, with at most one current unit per executing Agent task. Large shot, asset, and project graphs stay in their owning Storyboard, project revision, generated output, Quality result, or asynchronous task result. Progress text never proves completion.

Do not persist selected executors, provider handles, operation schemas, polling state, or workflow nodes in Markdown. Editing Markdown does not execute it. On continuation, reread the current documents and files, discover current capabilities again, and execute through their normal authorization and result lifecycle.

## Capability-aware execution and recovery

Choose milestones only when applicable: source interpretation; creator review; Storyboard or shot planning; character/reference preparation; image, video, or audio production; animatic or project authoring; Quality review; export; deliverable verification. Missing panel/OCR, character/reference, Storyboard, animatic/project, audio, Quality, export, or delivery capability must yield a visible \`blocked\`, \`degraded\`, or \`partial\` outcome with the smallest useful next decision.

Bounded reorder, batch split, equivalent capability selection, and local repair may remain inside approved scope. Story, character, core style or sound, primary technique, cost/risk, mutation, or delivery changes require renewed creator approval. Repairs target the owning capability, create a new asset or project revision, invalidate stale evidence, and rerun only affected acceptance or Quality checks.

Execution continues until requested deliverables are backed by actual current results. Report planned, submitted, or blocked state when results are absent; never present an intended asset, edit, export, or delivery as completed.
`;

const mediaProductionZhCnContent = `# 媒体制作

编排由 Agent 驱动、可恢复的“来源到交付物”制作。根据当前证据和可用能力选择、跳过或重排工作，不强迫所有请求经过同一条固定流水线。

## 证据与创作者审阅

1. 规划前读取实际来源和已有项目状态，把观察事实、Agent 解释、创作者决定和拟执行动作分开；文件名、提示词、缩略图和旧计划都不能冒充内容证据。
2. 现有 Storyboard、角色参考、生成资产、项目 revision、Quality 证据和已批准文档仍然有效时直接复用；满足条件的工作应跳过，不能重复创建文档或资产。
3. 只让创作者批准实质选择：改编目标与删减、故事或角色变化、核心视觉风格、主要图片/视频/音频技术、成本或风险上限、mutation 范围和交付边界；同时记录备选项、不确定性和未决问题。
4. 简单低风险操作无需创建规划文件。复杂任务可选用 \`brief.md\` 记录来源证据、解释、备选、创作者决定和审批范围；它只是普通、可审阅的 Markdown，不是运行时状态。

不同来源必须使用各自的真实证据：漫画使用实际页、分格、阅读顺序、对白和角色外观证据；剧本使用场景标题、动作、对白、地点和时长意图；小说使用章节/场景边界、视角、叙述、对白和改编删减；插画使用可见构图、主体、可用时的图层、色彩和空间关系。已有 Storyboard 和项目使用当前 revision、所属镜头或时间线状态、引用资产及验证证据。已有事实满足工作单元时，应标记为跳过或复用，不能重新构建。

## 可操作计划

仅在有助于审阅或协作时使用可选、持续更新的 \`plan.md\`。每个适用工作单元必须写明：要创建或修改的对象；触发与跳过条件；稳定输入；能力意图；创意与技术约束；预期输出类型；验收证据；失败或降级分支；依赖；是否需要批准。只有宽泛阶段列表不属于可执行计划。

近期进度只保留有限的 \`pending\`、\`in_progress\`、\`completed\` 或 \`blocked\` 项；每个正在执行的 Agent task 最多一个当前项。大规模镜头、资产和项目图仍由所属 Storyboard、项目 revision、生成结果、Quality 结果或异步 task result 管理；进度文字不能证明完成。

Markdown 不保存已选 executor、provider handle、operation schema、轮询状态或 workflow node。编辑 Markdown 不会触发执行。继续执行时重新读取当前文档和文件，重新发现当前能力，并通过正常授权和结果生命周期执行。

## 能力感知执行与恢复

只在适用时选择里程碑：来源解释、创作者审阅、Storyboard/镜头规划、角色/参考准备、图片/视频/音频制作、animatic/项目 authoring、Quality 审阅、导出、交付物验证。缺少分格/OCR、角色/参考、Storyboard、animatic/项目、音频、Quality、导出或交付能力时，必须返回明确的 \`blocked\`、\`degraded\` 或 \`partial\` 结果，以及最小的下一项决策。

有限重排、批次拆分、等价能力选择和局部修复可以保留在已批准范围内；故事、角色、核心画面或声音风格、主要技术、成本/风险、mutation 或交付范围改变时必须重新取得创作者批准。修复交给 owning capability，创建新的素材或项目 revision，使旧证据失效，并只重跑受影响的验收或 Quality 检查。

执行应持续到实际当前结果能够证明用户要求的交付物。没有结果时只能报告 planned、submitted 或 blocked，禁止把预期资产、编辑、导出或交付描述成已完成。
`;

const qualityContent = `# Media Quality Review

Review images, video clips, audio, Storyboards, cross-shot consistency, final cuts, project artifacts, or exported deliverables through structured QualityTarget, QualityEvidence, policy, and Gate results.

## Method

1. Bind every review to a stable resource or project reference and exact revision or content digest. Reject bare paths outside an explicit migration boundary.
2. Compose structural, technical, perception, and policy evaluators. Success in one class never hides missing or failed required evidence from another.
3. Record evaluator identity/version, metrics, issues, locations, coverage or sampling, confidence, source evidence, and creation time.
4. Apply the Gate policy to current evidence. Stale evidence cannot produce a pass; unavailable required perception becomes fail or manual review according to policy.
5. Produce a separate repair plan naming the owning area. Do not mutate assets or projects as part of evidence collection.

External perception adapters are replaceable ports. They receive only explicitly authorized, minimally materialized target content and references—not arbitrary local paths, project archives, or cache roots.
`;

const qualityZhCnContent = `# 媒体质量审查

通过结构化 QualityTarget、QualityEvidence、策略和 Gate 结果审查图片、视频片段、音频、Storyboard、跨镜头一致性、final cut、项目产物或导出交付物。

## 方法

1. 每次审查都绑定稳定资源或项目引用，以及精确修订版或内容摘要；显式迁移边界之外拒绝裸路径。
2. 组合 structural、technical、perception 和 policy evaluator；某一类成功不能掩盖另一必需类别的缺失或失败。
3. 记录 evaluator 身份/版本、指标、问题、位置、覆盖/采样、置信度、来源证据和创建时间。
4. 只对当前证据应用 Gate policy；stale evidence 不能通过，必需感知能力不可用时按策略 fail 或 manual review。
5. 单独产出指向 owning area 的修复计划；证据采集本身不修改素材或项目。

外部感知模型是可替换 adapter，只能接收经过明确授权、最小化物化的目标内容和参考，不能获得任意本地路径、项目归档或 cache root。
`;

export const storyboardSkill: Skill = {
  name: 'storyboard',
  description:
    'Create or refine the canonical Storyboard from prompts, text, scripts, documents, comics, image sequences, or an existing Storyboard revision.',
  content: storyboardContent,
  allowedTools: [
    TOOL_NAMES_SYSTEM.READ,
    TOOL_NAMES_SYSTEM.READ_DOCUMENT,
    TOOL_NAMES_SYSTEM.READ_IMAGE,
    TOOL_NAMES_SYSTEM.QUERY_SEMANTIC_COVERAGE,
  ],
  icon: '🎬',
  source: 'builtin',
  enabled: true,
  version: '1.0.0',
  domain: 'media',
  mediaWorkflow: {
    acceptedModalities: [
      'prompt',
      'text',
      'script',
      'document',
      'comic',
      'image-sequence',
      'storyboard',
    ],
    producedArtifacts: ['storyboard-table'],
    artifactProfiles: STORYBOARD_SOURCE_PROFILE_IDS.map((profile) => `storyboard/${profile}`),
    referencedCapabilities: [
      'story.planning',
      'content.extraction',
      'canvas.storyboard-projection',
      'cut.storyboard-handoff',
    ],
    validationRequirements: ['canonical-storyboard'],
    operations: ['create-storyboard', 'refine-storyboard'],
    tags: ['storyboard', 'shots', 'source-normalization'],
    riskLevel: 'low',
    costLevel: 'medium',
  },
};

export const imageSkill: Skill = {
  name: 'image',
  description:
    'Generate, edit, extend, enhance, colorize, compose, split, or prepare images through capability-neutral operations.',
  content: imageContent,
  allowedTools: [
    TOOL_NAMES_MEDIA.GENERATE_IMAGE,
    TOOL_NAMES_MEDIA.TRANSFORM_IMAGE,
    TOOL_NAMES_SYSTEM.READ_IMAGE,
  ],
  icon: '🖼️',
  source: 'builtin',
  enabled: true,
  version: '1.0.0',
  domain: 'media',
  mediaWorkflow: {
    acceptedModalities: ['prompt', 'image', 'mask'],
    producedArtifacts: ['generated-image-ref'],
    artifactProfiles: IMAGE_OPERATION_IDS.map((operation) => `image/${operation}`),
    referencedCapabilities: ['media.image-operations'],
    validationRequirements: ['operation-local-image-validation'],
    operations: [...IMAGE_OPERATION_IDS],
    tags: ['image', 'generation', 'editing'],
    riskLevel: 'medium',
    costLevel: 'medium',
  },
};

export const videoSkill: Skill = {
  name: 'video',
  description:
    'Generate or transform a single video clip from prompts, images, keyframes, or reference video, separate from timeline editing.',
  content: videoContent,
  allowedTools: [TOOL_NAMES_MEDIA.GENERATE_VIDEO, TOOL_NAMES_SYSTEM.READ_IMAGE],
  icon: '🎞️',
  source: 'builtin',
  enabled: true,
  version: '1.0.0',
  domain: 'media',
  referencedSkills: [{ id: 'video-editing', relationship: 'collaborator' }],
  mediaWorkflow: {
    acceptedModalities: ['prompt', 'image', 'video', 'keyframes'],
    producedArtifacts: ['generated-video-ref'],
    artifactProfiles: VIDEO_OPERATION_IDS.map((operation) => `video/${operation}`),
    referencedCapabilities: ['media.video-operations'],
    validationRequirements: ['operation-local-video-validation'],
    operations: [...VIDEO_OPERATION_IDS],
    tags: ['video', 'clip', 'generation', 'transformation'],
    riskLevel: 'medium',
    costLevel: 'high',
  },
};

export const mediaProductionSkill: Skill = {
  name: 'media-production',
  description:
    'Coordinate the complete recoverable workflow from source normalization and Storyboard through generation, quality Gates, project authoring, export, and deliverable verification.',
  content: mediaProductionContent,
  icon: '🎥',
  source: 'builtin',
  enabled: true,
  version: '1.0.0',
  domain: 'media',
  referencedSkills: [
    { id: 'storyboard', relationship: 'collaborator' },
    { id: 'image', relationship: 'collaborator' },
    { id: 'video', relationship: 'collaborator' },
    { id: 'media-quality-review', relationship: 'collaborator' },
    { id: 'video-editing', relationship: 'collaborator' },
  ],
  mediaWorkflow: {
    acceptedModalities: ['prompt', 'text', 'script', 'document', 'comic', 'image', 'video'],
    producedArtifacts: [
      'storyboard-table',
      'generated-media-ref',
      'project-revision',
      'exported-deliverable',
    ],
    artifactProfiles: [MEDIA_PRODUCTION_FROM_COMIC_PROFILE_ID],
    referencedCapabilities: ['media.production-orchestration'],
    validationRequirements: ['asset-quality-gate', 'pre-export-gate', 'post-export-gate'],
    operations: CREATIVE_MEDIA_WORKFLOW_STAGES.map((stage) => stage.id),
    tags: ['production', 'orchestration', 'export'],
    riskLevel: 'high',
    costLevel: 'high',
  },
};

export const mediaQualityReviewSkill: Skill = {
  name: 'media-quality-review',
  description:
    'Review creative assets, Storyboards, projects, final cuts, and exported deliverables with revision-bound evidence and policy-driven Gates.',
  content: qualityContent,
  allowedTools: [
    TOOL_NAMES_PERCEPTION.PERCEIVE,
    TOOL_NAMES_QUALITY.QUALITY_CHECK,
    TOOL_NAMES_TIMELINE.GET_TIMELINE_INFO,
    TOOL_NAMES_TIMELINE.GET_ELEMENT_INFO,
    TOOL_NAMES_TIMELINE.LIST_TIMELINE_ELEMENTS,
  ],
  icon: '🔎',
  source: 'builtin',
  enabled: true,
  version: '1.0.0',
  domain: 'media',
  mediaWorkflow: {
    acceptedModalities: [
      'image',
      'video',
      'audio',
      'storyboard',
      'timeline',
      'project',
      'deliverable',
    ],
    inputArtifacts: ['resource-ref', 'project-revision', 'quality-evidence'],
    producedArtifacts: ['quality-evidence', 'quality-gate-result', 'repair-plan'],
    referencedCapabilities: [
      'quality.structural',
      'quality.technical',
      'quality.perception',
      'quality.policy',
    ],
    validationRequirements: ['revision-current', 'required-evaluator-coverage'],
    operations: ['review-media', 'review-project', 'preflight', 'verify-deliverable'],
    tags: ['quality', 'evidence', 'gate'],
    riskLevel: 'medium',
    costLevel: 'medium',
  },
};

export function getCanonicalCreativeMediaSkills(locale?: string): Skill[] {
  return [
    localizeBuiltinSkill(
      storyboardSkill,
      { default: storyboardContent, localized: { 'zh-cn': storyboardZhCnContent } },
      locale,
    ),
    localizeBuiltinSkill(
      imageSkill,
      { default: imageContent, localized: { 'zh-cn': imageZhCnContent } },
      locale,
    ),
    localizeBuiltinSkill(
      videoSkill,
      { default: videoContent, localized: { 'zh-cn': videoZhCnContent } },
      locale,
    ),
    localizeBuiltinSkill(
      mediaProductionSkill,
      { default: mediaProductionContent, localized: { 'zh-cn': mediaProductionZhCnContent } },
      locale,
    ),
    localizeBuiltinSkill(
      mediaQualityReviewSkill,
      { default: qualityContent, localized: { 'zh-cn': qualityZhCnContent } },
      locale,
    ),
  ];
}
