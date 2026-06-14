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
    'Coordinate media-to-video work by choosing focused media skills, reading source evidence, producing structured artifacts, and handing off to generation, Canvas, Cut, or export when appropriate.',
  content: mediaToVideoContent,
  allowedTools: [
    TOOL_NAMES_SYSTEM.READ,
    TOOL_NAMES_SYSTEM.READ_DOCUMENT,
    TOOL_NAMES_SYSTEM.READ_IMAGE,
    TOOL_NAMES_SYSTEM.READ_DOCUMENT_IMAGE,
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
    acceptedModalities: ['comic', 'document', 'image', 'image-sequence', 'storyboard'],
    inputArtifacts: [
      'CompositeArtifact',
      'GenericTable',
      'StoryboardTable',
      'storyboard-plan-overlay',
      'generated-media-ref',
    ],
    producedArtifacts: [
      'CompositeArtifact',
      'GenericTable',
      'StoryboardTable',
      'EntityMemoryContribution',
      'storyboard-plan-overlay',
      'cut-storyboard-payload',
      'generated-media-ref',
      'workflow-execution-summary',
    ],
    artifactProfiles: ['comic-shot-asset-prep', 'comic-to-animation-plan'],
    referencedCapabilities: ['canvas.importStoryboard', 'cut.importStoryboard'],
    suggestedProjectors: [
      'projector:comic-shot-plan-to-storyboard',
      'projector:storyboard-to-canvas',
      'projector:storyboard-to-cut',
    ],
    tags: ['media-to-video', 'orchestration', 'storyboard', 'animation'],
    costLevel: 'medium',
    riskLevel: 'medium',
    validationRequirements: ['CompositeArtifact', 'GenericTable', 'StoryboardTable'],
  },
};

export const comicToAnimationSkill: Skill = {
  name: 'comic-to-animation',
  description:
    'Focused comic-to-animation entry point that coordinates validated comic storyboards, shot image prep, image/video generation approvals, Canvas review, Cut assembly, and export handoff without owning a hardcoded route.',
  content: comicToAnimationContent,
  allowedTools: [
    TOOL_NAMES_SYSTEM.READ,
    TOOL_NAMES_SYSTEM.READ_DOCUMENT,
    TOOL_NAMES_SYSTEM.READ_IMAGE,
    TOOL_NAMES_SYSTEM.READ_DOCUMENT_IMAGE,
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
    acceptedModalities: ['comic', 'document', 'image-sequence', 'storyboard'],
    inputArtifacts: [
      'CompositeArtifact',
      'GenericTable',
      'StoryboardTable',
      'comic-shot-asset-prep',
      'storyboard-plan-overlay',
      'generated-media-ref',
    ],
    producedArtifacts: [
      'CompositeArtifact',
      'GenericTable',
      'StoryboardTable',
      'EntityMemoryContribution',
      'comic-shot-asset-prep',
      'storyboard-plan-overlay',
      'cut-storyboard-payload',
      'generated-media-ref',
      'workflow-execution-summary',
    ],
    artifactProfiles: ['comic-shot-asset-prep', 'comic-to-animation-plan'],
    referencedCapabilities: [
      'comic-image-prep-pipeline',
      'canvas.importStoryboard',
      'cut.importStoryboard',
    ],
    suggestedProjectors: [
      'projector:comic-shot-plan-to-storyboard',
      'projector:storyboard-to-canvas',
      'projector:storyboard-to-cut',
    ],
    tags: ['comic-to-animation', 'comic', 'storyboard', 'animation', 'media-to-video'],
    costLevel: 'high',
    riskLevel: 'medium',
    validationRequirements: [
      'CompositeArtifact',
      'GenericTable',
      'StoryboardTable',
      'ShotImagePrepPlan',
    ],
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
    acceptedModalities: ['image', 'image-sequence'],
    producedArtifacts: [
      'CompositeArtifact',
      'GenericTable',
      'StoryboardTable',
      'storyboard-plan-overlay',
    ],
    artifactProfiles: ['comic-shot-asset-prep', 'comic-to-animation-plan'],
    tags: ['image', 'shot', 'reference'],
    costLevel: 'medium',
    riskLevel: 'medium',
    validationRequirements: ['CompositeArtifact', 'GenericTable', 'StoryboardTable'],
  },
};

export const storyboardToAnimationPlanSkill: Skill = {
  name: 'storyboard-to-animation-plan',
  description:
    'Convert CompositeArtifact storyboard domain blocks into storyboard plan overlays with motion, camera, generation, and continuity guidance.',
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
    acceptedModalities: ['storyboard'],
    inputArtifacts: ['CompositeArtifact', 'StoryboardTable'],
    producedArtifacts: ['storyboard-plan-overlay'],
    tags: ['storyboard', 'storyboard-plan-overlay', 'motion'],
    costLevel: 'medium',
    riskLevel: 'medium',
    validationRequirements: ['CompositeArtifact', 'StoryboardTable'],
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
    acceptedModalities: ['storyboard'],
    inputArtifacts: ['storyboard-plan-overlay', 'StoryboardTable'],
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
    acceptedModalities: ['mixed', 'video', 'audio'],
    inputArtifacts: ['generated-media-ref', 'storyboard-plan-overlay'],
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
    acceptedModalities: ['video', 'mixed'],
    inputArtifacts: ['cut-storyboard-payload', 'workflow-execution-summary'],
    producedArtifacts: ['workflow-execution-summary'],
    tags: ['export', 'package'],
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
