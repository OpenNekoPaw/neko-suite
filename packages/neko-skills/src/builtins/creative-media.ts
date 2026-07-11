import type { Skill } from '@neko/shared';
import {
  IMAGE_OPERATION_IDS,
  STORYBOARD_SOURCE_PROFILE_IDS,
  TOOL_NAMES_CANVAS,
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
  { id: 'media-production/from-comic', ownerSkill: 'media-production', kind: 'source' },
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

Comic interpretation is specialized: OCR, panel segmentation, reading order, speech-bubble association, and cross-panel continuity apply only to the comic profile. Existing-storyboard refinement always creates a new revision when intent or ordering changes.
`;

const storyboardZhCnContent = `# 分镜

把提示词、文本、剧本、文档、漫画、有序图片序列或已有分镜修订版归一化为同一种 canonical Storyboard。

## 方法

1. 识别来源 profile，并按该 profile 保留来源顺序、场景边界、对白上下文和视觉证据。
2. 产出稳定的场景/镜头身份、视觉意图、叙事上下文、镜头与时长指导、来源追踪和修订身份。
3. 来源与参考媒体只使用稳定资源引用；cache path、render URI、provider task handle 和 session handle 都不是分镜真值。
4. 投影前验证 canonical Storyboard；无效或不支持的来源必须返回明确诊断，不能编造表格。
5. Canvas 只是审阅投影，Cut 只是单向 authoring handoff，二者都不能成为第二份可写分镜真值。

漫画解释是专用 profile：OCR、面板切分、阅读顺序、气泡关联和跨格连续性不得默认套用于普通文本或剧本。已有分镜一旦改变意图或顺序，必须创建新修订版。
`;

const imageContent = `# Image

Plan or perform one capability-neutral image operation: generation, editing, inpainting, outpainting, upscaling, colorization, style transfer, compositing, splitting, background removal or replacement, or shot-reference preparation.

## Method

1. Select the canonical operation from user intent; do not infer provider support from a free-form prompt field.
2. Preserve stable input references, masks, composition intent, style constraints, requested dimensions, and output count.
3. Negotiate adapter support, required inputs, model/provider requirements, and limits before execution.
4. If support is degraded or unavailable, report the declared diagnostic and smallest recoverable alternative.
5. Validate output existence, readability, media type, and requested basic dimensions locally. Do not claim aesthetic, character-consistency, or policy approval without QualityEvidence.

Selection-, layer-, paint-, and project-format mutations remain owned by the relevant image authoring capability; this Skill expresses creative operation intent without importing package internals.
`;

const imageZhCnContent = `# 图片

规划或执行一种 capability-neutral 图片操作：生成、编辑、局部重绘、扩图、超分、上色、风格转换、融合、切分、背景移除/替换或镜头参考准备。

## 方法

1. 从用户意图选择 canonical operation，不能因为 provider 有自由文本 prompt 就推断其支持某项操作。
2. 保留稳定输入引用、mask、构图意图、风格约束、目标尺寸和输出数量。
3. 执行前协商 adapter 支持等级、必需输入、模型/provider 要求和限制。
4. 能力降级或不可用时，返回声明过的诊断和最小可恢复替代方案。
5. 本地只验证产物存在、可读、媒体类型和基础尺寸；没有 QualityEvidence 时不得宣称审美、角色一致性或策略验收通过。

选区、图层、绘画和项目格式变更仍由对应图片 authoring capability 负责；本 Skill 只表达创作操作意图，不导入子包内部实现。
`;

const videoContent = `# Video

Create or transform a single video clip from a prompt, image, keyframes, or reference video. Supported intents include generation, transformation, restyling, extension, enhancement, trimming, retiming, and preparation for timeline authoring.

## Method

1. Separate single-clip creation or transformation from timeline-wide editing, which belongs to video-editing and Cut authoring.
2. Preserve stable source, start-frame, and end-frame references together with motion, camera, duration, audio, and style intent.
3. Negotiate explicit adapter support and limits before execution. End-frame conditioning, restyling, enhancement, or extension must never be assumed.
4. Return visible degraded or unsupported diagnostics when the requested semantics cannot be honored.
5. Validate the returned clip structurally and technically at operation scope. Broader visual consistency and final-cut approval require media-quality-review evidence.
`;

const videoZhCnContent = `# 视频

从提示词、图片、关键帧或参考视频创建或转换单个视频片段，覆盖生成、转换、风格化、延长、增强、裁剪、变速和时间线准备。

## 方法

1. 区分单片段生成/转换与时间线级编辑；后者属于 video-editing 和 Cut authoring。
2. 保留稳定的来源、首帧、尾帧引用，以及动作、运镜、时长、音频和风格意图。
3. 执行前显式协商 adapter 支持和限制，不能默认 provider 支持尾帧约束、风格转换、增强或延长。
4. 无法满足请求语义时返回明确的 degraded 或 unsupported 诊断。
5. operation 范围内只做结构和技术验证；更广泛的视觉一致性与成片审批需要 media-quality-review 证据。
`;

const mediaProductionContent = `# Media Production

Coordinate a recoverable source-to-deliverable workflow without implementing package-owned mutations inside the Skill.

## Stages

Source normalization → Storyboard validation → shot generation plan → image/video/audio generation → asset quality Gate → project authoring → pre-export Gate → export → deliverable verification.

Each stage records typed artifact references, revision identity, status, diagnostics, provenance, and approvals. Resume from completed durable artifacts rather than replaying UI messages. A failed Gate blocks the next destructive or delivery stage by default. Repairs target the owning capability, create a new asset or project revision, invalidate stale evidence, and rerun the affected Gates.

Use specialized source profiles such as comic interpretation inside this workflow; do not expose normalization, animation planning, Cut payload construction, shot assembly, or export packaging as peer Skills.
`;

const mediaProductionZhCnContent = `# 媒体制作

编排可恢复的“来源到交付物”流程，但不在 Skill 内实现各子包拥有的 mutation。

## 阶段

来源归一化 → Storyboard 验证 → 镜头生成计划 → 图片/视频/音频生成 → 素材质量 Gate → 项目 authoring → 导出前 Gate → 导出 → 交付物验证。

每个阶段记录 typed artifact ref、修订身份、状态、诊断、provenance 和审批；恢复时从已完成的 durable artifact 继续，不能重放 UI message 猜状态。Gate 失败默认阻断后续破坏性或交付阶段。修复交给 owning capability，创建新的素材或项目修订版，使旧证据失效并重跑相关 Gate。

漫画解释等专用能力以 source profile 进入流程；来源归一化、动画规划、Cut payload 构建、镜头装配和导出打包不再作为同级 Skill 暴露。
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
  allowedTools: [
    TOOL_NAMES_SYSTEM.READ,
    TOOL_NAMES_SYSTEM.READ_DOCUMENT,
    TOOL_NAMES_SYSTEM.READ_IMAGE,
    TOOL_NAMES_MEDIA.GENERATE_IMAGE,
    TOOL_NAMES_MEDIA.GENERATE_VIDEO,
    TOOL_NAMES_MEDIA.GENERATE_TTS,
    TOOL_NAMES_MEDIA.GENERATE_MUSIC,
    TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
    TOOL_NAMES_TIMELINE.GET_TIMELINE_INFO,
    TOOL_NAMES_QUALITY.QUALITY_CHECK,
  ],
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
    artifactProfiles: ['media-production/from-comic'],
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
    TOOL_NAMES_QUALITY.QUALITY_REPAIR_CHECK,
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
