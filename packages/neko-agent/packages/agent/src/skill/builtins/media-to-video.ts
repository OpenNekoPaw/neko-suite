import type { Skill } from '@neko/shared';
import {
  TOOL_NAMES_CANVAS,
  TOOL_NAMES_MEDIA,
  TOOL_NAMES_SYSTEM,
  TOOL_NAMES_TIMELINE,
} from '@neko/shared';

const structuredArtifactRules = `## Structured Artifact Rules

- Markdown is presentation only. For storyboard, animation, Canvas, Cut, generated media, or execution summaries, emit validated structured payloads.
- Use actual tool-result or generated-asset references for media. Do not invent ids.
- Do not embed base64, blob URLs, localhost URLs, or absolute local cache paths.
- Ask for approval before bulk generation, colorization, destructive timeline replacement, or long export unless the user explicitly requested automatic execution and policy allows it.
`;

export const mediaToVideoSkill: Skill = {
  name: 'media-to-video',
  description:
    'Coordinate media-to-video work by choosing focused media skills, reading source evidence, producing structured artifacts, and handing off to generation, Canvas, Cut, or export when appropriate.',
  content: `# Media to Video Coordinator

You coordinate media-to-video work through focused skills and existing tools. You are not a fixed pipeline. Choose the smallest relevant sub-skill, load it only when needed, and keep the user-facing result grounded in tool evidence.

## Workflow Guidance

1. Inspect the user's input and determine the source modality: comic/document/image sequence/storyboard/animation plan/generated media.
2. Use GetContext to inspect available related skills. Activate a focused skill when its detailed guidance is needed.
3. For comic EPUB/PDF/CBZ/CBR pages, prefer comic-to-storyboard first.
4. For still images or image sequences, prefer image-to-shot.
5. For an existing StoryboardTableV1, prefer storyboard-to-animation-plan before generation or Cut.
6. For an existing animation plan and a Cut target, prefer animation-plan-to-cut.
7. For already generated shots, prefer generated-shot-assembly and export-video-package as needed.
8. Stop after planning when generation providers, target plugins, approvals, or safe media refs are unavailable.

${structuredArtifactRules}

## Related Skill Selection

- comic-to-storyboard: comic page reading, panel/OCR evidence, StoryboardTableV1 output.
- image-to-shot: still image references to shot/storyboard plans.
- storyboard-to-animation-plan: storyboard rows to motion/camera/generation plans.
- animation-plan-to-cut: animation plans to Cut timeline payloads.
- generated-shot-assembly: generated media refs to assembly summaries.
- export-video-package: export-oriented packaging and delivery.

## Tool Use

Use ReadDocument, ReadImage, or ReadDocumentImage for evidence. Use generation tools only after approval. Use Canvas/Cut tools only after the structured payload validates and the target capability exists.
`,
  allowedTools: [
    TOOL_NAMES_SYSTEM.READ,
    TOOL_NAMES_SYSTEM.READ_DOCUMENT,
    TOOL_NAMES_SYSTEM.READ_IMAGE,
    TOOL_NAMES_SYSTEM.READ_DOCUMENT_IMAGE,
    TOOL_NAMES_SYSTEM.LIST_DIRECTORY,
    TOOL_NAMES_SYSTEM.GLOB,
    TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
    TOOL_NAMES_CANVAS.CANVAS_CREATE_COMPOSITE,
    TOOL_NAMES_CANVAS.CANVAS_APPLY_AGENT_CONTENT,
    TOOL_NAMES_TIMELINE.GET_TIMELINE_INFO,
    TOOL_NAMES_TIMELINE.LIST_TIMELINE_ELEMENTS,
    TOOL_NAMES_TIMELINE.ADD_TRACK,
    TOOL_NAMES_TIMELINE.ADD_TIMELINE_ELEMENT,
    TOOL_NAMES_TIMELINE.UPDATE_TIMELINE_ELEMENT,
    TOOL_NAMES_TIMELINE.SET_TRANSITION,
    TOOL_NAMES_MEDIA.GENERATE_IMAGE,
    TOOL_NAMES_MEDIA.GENERATE_VIDEO,
    TOOL_NAMES_MEDIA.GENERATE_TTS,
    TOOL_NAMES_MEDIA.GENERATE_MUSIC,
  ],
  icon: '🎞️',
  source: 'builtin',
  enabled: true,
  version: '1.0.0',
  domain: 'media',
  referencedSkills: [
    { id: 'comic-to-storyboard', relationship: 'delegator' },
    { id: 'image-to-shot', relationship: 'delegator' },
    { id: 'storyboard-to-animation-plan', relationship: 'delegator' },
    { id: 'animation-plan-to-cut', relationship: 'delegator' },
    { id: 'generated-shot-assembly', relationship: 'delegator' },
    { id: 'export-video-package', relationship: 'delegator' },
  ],
  mediaWorkflow: {
    acceptedModalities: ['comic', 'document', 'image', 'image-sequence', 'storyboard'],
    inputArtifacts: ['storyboard-table', 'animation-plan', 'generated-media-ref'],
    producedArtifacts: [
      'storyboard-table',
      'animation-plan',
      'cut-storyboard-payload',
      'generated-media-ref',
      'workflow-execution-summary',
    ],
    tags: ['media-to-video', 'orchestration', 'storyboard', 'animation'],
    costLevel: 'medium',
    riskLevel: 'medium',
    validationRequirements: ['StoryboardTableV1'],
  },
};

export const imageToShotSkill: Skill = {
  name: 'image-to-shot',
  description:
    'Turn still images or image sequences into structured shot plans and storyboard rows with safe source media references.',
  content: `# Image to Shot

Convert one or more still images into video-ready shot planning artifacts. Inspect the images with ReadImage, describe visible evidence, and emit structured storyboard or animation-plan payloads.

${structuredArtifactRules}

## Guidance

- Keep original images in sourceMediaRefs using actual tool-result locators.
- Use imageStrategy "use-as-reference" unless the user asks to reuse, transform, or generate.
- Do not claim generated images or videos exist until a generation tool returns them.
- If multiple images are supplied, preserve their order unless the user asks for reordering.
`,
  allowedTools: [
    TOOL_NAMES_SYSTEM.READ,
    TOOL_NAMES_SYSTEM.READ_IMAGE,
    TOOL_NAMES_SYSTEM.LIST_DIRECTORY,
    TOOL_NAMES_SYSTEM.GLOB,
    TOOL_NAMES_MEDIA.GENERATE_IMAGE,
    TOOL_NAMES_MEDIA.GENERATE_VIDEO,
  ],
  icon: '🖼️',
  source: 'builtin',
  enabled: true,
  version: '1.0.0',
  domain: 'media',
  referencedSkills: [
    { id: 'media-to-video', relationship: 'collaborator' },
    { id: 'storyboard-to-animation-plan', relationship: 'delegator' },
  ],
  mediaWorkflow: {
    acceptedModalities: ['image', 'image-sequence'],
    producedArtifacts: ['storyboard-table', 'animation-plan'],
    tags: ['image', 'shot', 'reference'],
    costLevel: 'medium',
    riskLevel: 'medium',
    validationRequirements: ['StoryboardTableV1'],
  },
};

export const storyboardToAnimationPlanSkill: Skill = {
  name: 'storyboard-to-animation-plan',
  description:
    'Convert StoryboardTableV1 rows into animation shot plans with motion, camera, generation, and continuity guidance.',
  content: `# Storyboard to Animation Plan

Transform a validated StoryboardTableV1 into an animation plan. Preserve scene and shot ids, source media refs, durations, dialogue, sound cues, and continuity notes.

${structuredArtifactRules}

## Guidance

- Do not regenerate or rewrite the storyboard unless validation fails.
- Add motionPrompt, cameraPrompt, generationPrompt, requiresGeneration, and approval notes per shot.
- Mark source shots that need colorization, upscale, inpaint, or image-to-video as planned transformations only until tools run.
`,
  allowedTools: [
    TOOL_NAMES_SYSTEM.READ,
    TOOL_NAMES_SYSTEM.READ_DOCUMENT,
    TOOL_NAMES_MEDIA.GENERATE_IMAGE,
    TOOL_NAMES_MEDIA.GENERATE_VIDEO,
  ],
  icon: '🎬',
  source: 'builtin',
  enabled: true,
  version: '1.0.0',
  domain: 'media',
  referencedSkills: [
    { id: 'media-to-video', relationship: 'collaborator' },
    { id: 'animation-plan-to-cut', relationship: 'delegator' },
  ],
  mediaWorkflow: {
    acceptedModalities: ['storyboard'],
    inputArtifacts: ['storyboard-table'],
    producedArtifacts: ['animation-plan'],
    tags: ['storyboard', 'animation-plan', 'motion'],
    costLevel: 'medium',
    riskLevel: 'medium',
    validationRequirements: ['StoryboardTableV1'],
  },
};

export const animationPlanToCutSkill: Skill = {
  name: 'animation-plan-to-cut',
  description:
    'Project a validated animation plan or storyboard into Cut-ready timeline payloads without owning generation.',
  content: `# Animation Plan to Cut

Convert animation plans into Cut-ready timeline payloads. Query timeline context first, preserve shot order, and avoid destructive replacement unless approved.

${structuredArtifactRules}

## Guidance

- Use existing generated media refs when available.
- If media is missing, produce a Cut payload draft and mark missing assets clearly.
- Ask before replacing an existing timeline or adding many elements.
`,
  allowedTools: [
    TOOL_NAMES_SYSTEM.READ,
    TOOL_NAMES_TIMELINE.GET_TIMELINE_INFO,
    TOOL_NAMES_TIMELINE.LIST_TIMELINE_ELEMENTS,
    TOOL_NAMES_TIMELINE.ADD_TRACK,
    TOOL_NAMES_TIMELINE.ADD_TIMELINE_ELEMENT,
    TOOL_NAMES_TIMELINE.UPDATE_TIMELINE_ELEMENT,
    TOOL_NAMES_TIMELINE.SET_TRANSITION,
  ],
  icon: '✂️',
  source: 'builtin',
  enabled: true,
  version: '1.0.0',
  domain: 'media',
  referencedSkills: [{ id: 'media-to-video', relationship: 'collaborator' }],
  mediaWorkflow: {
    acceptedModalities: ['storyboard'],
    inputArtifacts: ['animation-plan', 'storyboard-table'],
    producedArtifacts: ['cut-storyboard-payload'],
    tags: ['cut', 'timeline', 'assembly'],
    costLevel: 'low',
    riskLevel: 'medium',
  },
};

export const generatedShotAssemblySkill: Skill = {
  name: 'generated-shot-assembly',
  description:
    'Assemble generated image, video, audio, and subtitle refs into a coherent media-to-video execution summary.',
  content: `# Generated Shot Assembly

Gather generated media refs, validate provenance, and summarize what can be assembled. Use timeline or Canvas tools only when the target is available and the user wants delivery.

${structuredArtifactRules}
`,
  allowedTools: [
    TOOL_NAMES_SYSTEM.READ,
    TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
    TOOL_NAMES_CANVAS.CANVAS_APPLY_AGENT_CONTENT,
    TOOL_NAMES_TIMELINE.GET_TIMELINE_INFO,
    TOOL_NAMES_TIMELINE.ADD_TIMELINE_ELEMENT,
  ],
  icon: '🧩',
  source: 'builtin',
  enabled: true,
  version: '1.0.0',
  domain: 'media',
  referencedSkills: [
    { id: 'media-to-video', relationship: 'collaborator' },
    { id: 'export-video-package', relationship: 'delegator' },
  ],
  mediaWorkflow: {
    acceptedModalities: ['mixed', 'video', 'audio'],
    inputArtifacts: ['generated-media-ref', 'animation-plan'],
    producedArtifacts: ['workflow-execution-summary'],
    tags: ['assembly', 'generated-media'],
    costLevel: 'low',
    riskLevel: 'medium',
  },
};

export const exportVideoPackageSkill: Skill = {
  name: 'export-video-package',
  description:
    'Prepare final media-to-video artifacts for export, delivery, or packaging with validation diagnostics.',
  content: `# Export Video Package

Prepare export-oriented summaries and target handoff instructions. Confirm target duration, aspect ratio, media availability, and user approval before long-running export.

${structuredArtifactRules}

## Guidance

- Do not claim an export exists until an export tool returns a completed result.
- If no export tool is available, return a workflow-execution-summary with remaining manual steps.
`,
  allowedTools: [
    TOOL_NAMES_SYSTEM.READ,
    TOOL_NAMES_TIMELINE.GET_TIMELINE_INFO,
    TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
  ],
  icon: '📦',
  source: 'builtin',
  enabled: true,
  version: '1.0.0',
  domain: 'media',
  referencedSkills: [{ id: 'media-to-video', relationship: 'collaborator' }],
  mediaWorkflow: {
    acceptedModalities: ['video', 'mixed'],
    inputArtifacts: ['cut-storyboard-payload', 'workflow-execution-summary'],
    producedArtifacts: ['workflow-execution-summary'],
    tags: ['export', 'package'],
    costLevel: 'medium',
    riskLevel: 'medium',
  },
};
