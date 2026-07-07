import type { Skill } from '@neko/shared';
import {
  TOOL_NAMES_CANVAS,
  TOOL_NAMES_MEDIA,
  TOOL_NAMES_SYSTEM,
  TOOL_NAMES_TIMELINE,
} from '@neko/shared';
import { localizeBuiltinSkill } from './builtin-skill-content';
import animationPlanToCutContent from './markdown/animation-plan-to-cut.md?raw';
import animationPlanToCutZhCnContent from './markdown/animation-plan-to-cut.zh-cn.md?raw';
import exportVideoPackageContent from './markdown/export-video-package.md?raw';
import exportVideoPackageZhCnContent from './markdown/export-video-package.zh-cn.md?raw';
import generatedShotAssemblyContent from './markdown/generated-shot-assembly.md?raw';
import generatedShotAssemblyZhCnContent from './markdown/generated-shot-assembly.zh-cn.md?raw';
import imageToShotContent from './markdown/image-to-shot.md?raw';
import imageToShotZhCnContent from './markdown/image-to-shot.zh-cn.md?raw';
import comicToAnimationContent from './markdown/comic-to-animation.md?raw';
import comicToAnimationZhCnContent from './markdown/comic-to-animation.zh-cn.md?raw';
import mediaToVideoContent from './markdown/media-to-video.md?raw';
import mediaToVideoZhCnContent from './markdown/media-to-video.zh-cn.md?raw';
import storyboardToAnimationPlanContent from './markdown/storyboard-to-animation-plan.md?raw';
import storyboardToAnimationPlanZhCnContent from './markdown/storyboard-to-animation-plan.zh-cn.md?raw';

const localizedMediaToVideoContent = {
  default: mediaToVideoContent,
  localized: { 'zh-cn': mediaToVideoZhCnContent },
};

const localizedImageToShotContent = {
  default: imageToShotContent,
  localized: { 'zh-cn': imageToShotZhCnContent },
};

const localizedComicToAnimationContent = {
  default: comicToAnimationContent,
  localized: { 'zh-cn': comicToAnimationZhCnContent },
};

const localizedStoryboardToAnimationPlanContent = {
  default: storyboardToAnimationPlanContent,
  localized: { 'zh-cn': storyboardToAnimationPlanZhCnContent },
};

const localizedAnimationPlanToCutContent = {
  default: animationPlanToCutContent,
  localized: { 'zh-cn': animationPlanToCutZhCnContent },
};

const localizedGeneratedShotAssemblyContent = {
  default: generatedShotAssemblyContent,
  localized: { 'zh-cn': generatedShotAssemblyZhCnContent },
};

const localizedExportVideoPackageContent = {
  default: exportVideoPackageContent,
  localized: { 'zh-cn': exportVideoPackageZhCnContent },
};

export const mediaToVideoSkill: Skill = {
  name: 'media-to-video',
  description:
    'Coordinate explicit media-to-video production by choosing focused media skills, producing reviewable creative tables/plans, and handing off to generation, Canvas, Cut, or export through lifecycle capabilities when appropriate; not for content-only document or comic analysis.',
  content: mediaToVideoContent,
  allowedTools: [
    TOOL_NAMES_SYSTEM.READ,
    TOOL_NAMES_SYSTEM.READ_DOCUMENT,
    TOOL_NAMES_SYSTEM.READ_IMAGE,
    TOOL_NAMES_SYSTEM.QUERY_SEMANTIC_COVERAGE,
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
    { id: 'comic-to-animation', relationship: 'delegator' },
    { id: 'image-to-shot', relationship: 'delegator' },
    { id: 'storyboard-to-animation-plan', relationship: 'delegator' },
    { id: 'animation-plan-to-cut', relationship: 'delegator' },
    { id: 'generated-shot-assembly', relationship: 'delegator' },
    { id: 'export-video-package', relationship: 'delegator' },
  ],
  mediaWorkflow: {
    useCases: [
      'Coordinate explicit media-to-video production across storyboard, generation, Canvas, Cut, and export steps',
      'Choose focused media Skills for comic, storyboard, image, animation plan, generated media, or package handoff',
      'Plan a production artifact path when the user asks to create a video or animation from media inputs',
    ],
    nonGoals: [
      'Analyze, summarize, OCR, describe, or read source media without creating production artifacts',
      'Answer general questions that do not require media generation, Canvas, Cut, or export handoff',
    ],
    acceptedModalities: ['comic', 'document', 'image', 'image-sequence', 'storyboard'],
    inputArtifacts: ['CreativeTable', 'GenericTable', 'AnimationPlan', 'generated-media-ref'],
    producedArtifacts: [
      'CreativeTable',
      'GenericTable',
      'EntityMemoryContribution',
      'AnimationPlan',
      'cut-storyboard-payload',
      'generated-media-ref',
      'workflow-execution-summary',
    ],
    artifactProfiles: ['storyboard', 'comic-shot-asset-prep'],
    referencedCapabilities: ['canvas.authoring'],
    tags: ['media-to-video', 'orchestration', 'storyboard', 'animation'],
    operations: ['coordinate-media-production', 'select-focused-skill', 'plan-handoff'],
    costLevel: 'medium',
    riskLevel: 'medium',
    validationRequirements: ['CreativeTable', 'AnimationPlan'],
  },
};

export const comicToAnimationSkill: Skill = {
  name: 'comic-to-animation',
  description:
    'Focused comic-to-animation production entry point for comic/storyboard-to-animation or video requests. Coordinates validated comic storyboards, shot image prep, image/video generation approvals, Canvas review, Cut assembly, and export handoff; not for content-only EPUB/comic analysis.',
  content: comicToAnimationContent,
  allowedTools: [
    TOOL_NAMES_SYSTEM.READ,
    TOOL_NAMES_SYSTEM.READ_DOCUMENT,
    TOOL_NAMES_SYSTEM.READ_IMAGE,
    TOOL_NAMES_SYSTEM.QUERY_SEMANTIC_COVERAGE,
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
    TOOL_NAMES_MEDIA.TRANSFORM_IMAGE,
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
    { id: 'media-to-video', relationship: 'collaborator' },
    { id: 'comic-to-storyboard', relationship: 'delegator' },
    { id: 'storyboard-to-animation-plan', relationship: 'delegator' },
    { id: 'animation-plan-to-cut', relationship: 'delegator' },
    { id: 'generated-shot-assembly', relationship: 'delegator' },
    { id: 'export-video-package', relationship: 'delegator' },
  ],
  mediaWorkflow: {
    useCases: [
      'Create an animation or video plan from comic, manga, storyboard, or image sequence input',
      'Generate shot image prep, animation plan, and media generation guidance for comic adaptation',
      'Coordinate Canvas review, Cut assembly, and export handoff for comic-to-animation production',
    ],
    nonGoals: [
      'Analyze, summarize, OCR, describe, or read comic pages without creating animation artifacts',
      'Only create a storyboard table without image prep, generation planning, or animation handoff',
    ],
    acceptedModalities: ['comic', 'document', 'image-sequence', 'storyboard'],
    inputArtifacts: [
      'CreativeTable',
      'GenericTable',
      'comic-shot-asset-prep',
      'AnimationPlan',
      'generated-media-ref',
    ],
    producedArtifacts: [
      'CreativeTable',
      'GenericTable',
      'EntityMemoryContribution',
      'comic-shot-asset-prep',
      'AnimationPlan',
      'cut-storyboard-payload',
      'generated-media-ref',
      'workflow-execution-summary',
    ],
    artifactProfiles: ['storyboard', 'comic-shot-asset-prep'],
    referencedCapabilities: ['comic-image-prep-pipeline', 'canvas.authoring'],
    tags: ['comic-to-animation', 'comic', 'storyboard', 'animation', 'media-to-video'],
    operations: [
      'create-animation-plan',
      'prepare-shot-images',
      'generate-media-plan',
      'coordinate-animation-handoff',
    ],
    costLevel: 'high',
    riskLevel: 'medium',
    validationRequirements: ['CreativeTable', 'AnimationPlan', 'ShotImagePrepPlan'],
  },
};

export const imageToShotSkill: Skill = {
  name: 'image-to-shot',
  description:
    'Turn still images or image sequences into structured shot plans and storyboard rows with safe source media references.',
  content: imageToShotContent,
  allowedTools: [
    TOOL_NAMES_SYSTEM.READ,
    TOOL_NAMES_SYSTEM.READ_IMAGE,
    TOOL_NAMES_SYSTEM.QUERY_SEMANTIC_COVERAGE,
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
    useCases: [
      'Turn still images or image sequences into storyboard rows and shot plans',
      'Create safe source media references for image-based shot planning',
    ],
    nonGoals: [
      'Perform content-only image description without creating shot or storyboard artifacts',
      'Assemble an entire Cut timeline or final export package',
    ],
    acceptedModalities: ['image', 'image-sequence'],
    inputArtifacts: ['image', 'image-sequence'],
    producedArtifacts: ['CreativeTable', 'GenericTable', 'AnimationPlan'],
    artifactProfiles: ['storyboard'],
    tags: ['image', 'shot', 'reference'],
    operations: ['image-to-shot', 'create-shot-plan', 'reference-image-breakdown'],
    costLevel: 'medium',
    riskLevel: 'medium',
    validationRequirements: ['CreativeTable', 'AnimationPlan'],
  },
};

export const storyboardToAnimationPlanSkill: Skill = {
  name: 'storyboard-to-animation-plan',
  description:
    'Convert existing storyboard creative tables, Canvas storyboard review nodes, or shot plans into animation plan overlays with motion, camera, generation, and continuity guidance when the user asks for animation/video planning.',
  content: storyboardToAnimationPlanContent,
  allowedTools: [
    TOOL_NAMES_SYSTEM.READ,
    TOOL_NAMES_SYSTEM.READ_DOCUMENT,
    TOOL_NAMES_SYSTEM.QUERY_SEMANTIC_COVERAGE,
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
    useCases: [
      'Convert an existing storyboard creative table into an animation plan overlay',
      'Add motion, camera, continuity, and generation guidance to storyboard shots',
    ],
    nonGoals: [
      'Read or summarize a storyboard without producing animation planning artifacts',
      'Generate final media or assemble a Cut timeline directly',
    ],
    acceptedModalities: ['storyboard'],
    inputArtifacts: ['CreativeTable', 'CanvasStoryboardReviewNode'],
    producedArtifacts: ['AnimationPlan'],
    tags: ['storyboard', 'storyboard-plan-overlay', 'motion'],
    operations: ['storyboard-to-animation-plan', 'add-motion-guidance', 'plan-generation'],
    costLevel: 'medium',
    riskLevel: 'medium',
    validationRequirements: ['CreativeTable', 'AnimationPlan'],
  },
};

export const animationPlanToCutSkill: Skill = {
  name: 'animation-plan-to-cut',
  description:
    'Project a validated storyboard plan overlay or storyboard into Cut-ready timeline payloads without owning generation.',
  content: animationPlanToCutContent,
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
    useCases: [
      'Project a validated storyboard or animation plan overlay into a Cut-ready timeline payload',
      'Prepare tracks, timing, transitions, and timeline placement from storyboard planning artifacts',
    ],
    nonGoals: [
      'Generate image or video media',
      'Analyze storyboards without preparing a Cut handoff payload',
    ],
    acceptedModalities: ['storyboard'],
    inputArtifacts: ['AnimationPlan', 'CreativeTable'],
    producedArtifacts: ['cut-storyboard-payload'],
    tags: ['cut', 'timeline', 'assembly'],
    operations: ['animation-plan-to-cut', 'prepare-cut-payload', 'timeline-assembly'],
    costLevel: 'low',
    riskLevel: 'medium',
  },
};

export const generatedShotAssemblySkill: Skill = {
  name: 'generated-shot-assembly',
  description:
    'Assemble generated image, video, audio, and subtitle refs into a coherent media-to-video execution summary.',
  content: generatedShotAssemblyContent,
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
    useCases: [
      'Assemble generated media references into a coherent execution summary',
      'Apply generated image, video, audio, and subtitle refs to Canvas or timeline review surfaces',
    ],
    nonGoals: ['Generate new media from scratch', 'Export or package final video deliverables'],
    acceptedModalities: ['mixed', 'video', 'audio'],
    inputArtifacts: ['generated-media-ref', 'storyboard-plan-overlay'],
    producedArtifacts: ['workflow-execution-summary'],
    tags: ['assembly', 'generated-media'],
    operations: ['assemble-generated-shots', 'apply-generated-media', 'summarize-execution'],
    costLevel: 'low',
    riskLevel: 'medium',
  },
};

export const exportVideoPackageSkill: Skill = {
  name: 'export-video-package',
  description:
    'Prepare final media-to-video artifacts for export, delivery, or packaging with validation diagnostics.',
  content: exportVideoPackageContent,
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
    useCases: [
      'Prepare validated media-to-video artifacts for export, delivery, or packaging',
      'Review final timeline, Canvas, and execution summaries before delivery handoff',
    ],
    nonGoals: [
      'Generate new media or rewrite storyboard plans',
      'Analyze source documents without export or package preparation',
    ],
    acceptedModalities: ['video', 'mixed'],
    inputArtifacts: ['cut-storyboard-payload', 'workflow-execution-summary'],
    producedArtifacts: ['workflow-execution-summary'],
    tags: ['export', 'package'],
    operations: ['export-package', 'prepare-delivery', 'validate-final-artifacts'],
    costLevel: 'medium',
    riskLevel: 'medium',
  },
};

export function getMediaToVideoSkill(locale?: string): Skill {
  return localizeBuiltinSkill(mediaToVideoSkill, localizedMediaToVideoContent, locale);
}

export function getComicToAnimationSkill(locale?: string): Skill {
  return localizeBuiltinSkill(comicToAnimationSkill, localizedComicToAnimationContent, locale);
}

export function getImageToShotSkill(locale?: string): Skill {
  return localizeBuiltinSkill(imageToShotSkill, localizedImageToShotContent, locale);
}

export function getStoryboardToAnimationPlanSkill(locale?: string): Skill {
  return localizeBuiltinSkill(
    storyboardToAnimationPlanSkill,
    localizedStoryboardToAnimationPlanContent,
    locale,
  );
}

export function getAnimationPlanToCutSkill(locale?: string): Skill {
  return localizeBuiltinSkill(animationPlanToCutSkill, localizedAnimationPlanToCutContent, locale);
}

export function getGeneratedShotAssemblySkill(locale?: string): Skill {
  return localizeBuiltinSkill(
    generatedShotAssemblySkill,
    localizedGeneratedShotAssemblyContent,
    locale,
  );
}

export function getExportVideoPackageSkill(locale?: string): Skill {
  return localizeBuiltinSkill(exportVideoPackageSkill, localizedExportVideoPackageContent, locale);
}

export function getMediaWorkflowBuiltinSkills(locale?: string): Skill[] {
  return [
    getMediaToVideoSkill(locale),
    getComicToAnimationSkill(locale),
    getImageToShotSkill(locale),
    getStoryboardToAnimationPlanSkill(locale),
    getAnimationPlanToCutSkill(locale),
    getGeneratedShotAssemblySkill(locale),
    getExportVideoPackageSkill(locale),
  ];
}
