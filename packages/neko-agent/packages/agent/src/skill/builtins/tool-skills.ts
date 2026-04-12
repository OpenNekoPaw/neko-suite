/**
 * Builtin ToolSets - Semantic tool groupings with tiered loading
 *
 * Each ToolSet has a loadingTier controlling when its tool schemas are
 * injected into LLM context. Metadata (name/description/tools[]) is always
 * resident in registries for AI discovery via GetContext.
 *
 * - resident: Schema always in LLM context (core system, file editing, shell)
 * - eager:    Schema injected on first ToolSet use (timeline, git, pipeline)
 * - lazy:     Schema injected only on explicit activation (effects, audio, AI gen)
 */

import type { ToolGroup, IToolGroupRegistry } from '@neko/shared';
import { TOOL_NAMES_MEDIA, TOOL_NAMES_TIMELINE } from '@neko/shared';

// =============================================================================
// Resident ToolSets — schema always in LLM context
// =============================================================================

/**
 * Core system tools - read-only operations
 */
export const coreSystemToolSet: ToolGroup = {
  name: 'core-system',
  description: 'Core system tools for file reading, directory browsing, and searching',
  tools: ['Read', 'ListDirectory', 'Glob', 'Grep', 'WebSearch'],
  alwaysActive: true,
  priority: 100,
  loadingTier: 'resident',
  source: 'builtin',
  enabled: true,
  icon: '📁',
};

/**
 * Plan mode tools
 */
export const planModeToolSet: ToolGroup = {
  name: 'plan-mode',
  description: 'Plan mode tools for entering and exiting planning phase',
  tools: ['EnterPlanMode', 'ExitPlanMode'],
  alwaysActive: true,
  priority: 100,
  loadingTier: 'resident',
  source: 'builtin',
  enabled: true,
  icon: '📋',
};

/**
 * File editing tools
 */
export const fileEditingToolSet: ToolGroup = {
  name: 'file-editing',
  description: 'File editing tools for writing, editing, creating, and deleting files',
  tools: ['Write', 'Edit', 'CreateDirectory', 'DeleteFile'],
  alwaysActive: true,
  priority: 90,
  loadingTier: 'resident',
  source: 'builtin',
  enabled: true,
  icon: '✏️',
};

/**
 * Shell execution tools
 */
export const shellExecutionToolSet: ToolGroup = {
  name: 'shell-execution',
  description: 'Shell command execution tool for running terminal commands',
  tools: ['Bash'],
  alwaysActive: false,
  priority: 70,
  loadingTier: 'eager',
  source: 'builtin',
  enabled: true,
  icon: '💻',
};

// =============================================================================
// Eager ToolSets — schema injected on first ToolSet use in session
// =============================================================================

/**
 * Timeline query tools - read-only timeline operations
 */
export const timelineQueryToolSet: ToolGroup = {
  name: 'timeline-query',
  description: 'Timeline query tools for viewing timeline info, elements, effects, and transitions',
  tools: [
    TOOL_NAMES_TIMELINE.GET_TIMELINE_INFO,
    TOOL_NAMES_TIMELINE.GET_ELEMENT_INFO,
    TOOL_NAMES_TIMELINE.LIST_TIMELINE_ELEMENTS,
    TOOL_NAMES_TIMELINE.LIST_EFFECTS,
    TOOL_NAMES_TIMELINE.LIST_TRANSITIONS,
  ],
  alwaysActive: true,
  priority: 90,
  loadingTier: 'eager',
  source: 'builtin',
  enabled: true,
  icon: '🎬',
};

/**
 * Git operations tools
 */
export const gitOperationsToolSet: ToolGroup = {
  name: 'git-operations',
  description: 'Git version control tools for status, diff, and log',
  tools: ['GitStatus', 'GitDiff', 'GitLog'],
  alwaysActive: true,
  priority: 80,
  loadingTier: 'eager',
  source: 'builtin',
  enabled: true,
  icon: '📦',
};

/**
 * Element editing tools
 */
export const elementEditingToolSet: ToolGroup = {
  name: 'element-editing',
  description:
    'Timeline element editing tools for adding, updating, deleting, trimming, and splitting',
  tools: [
    TOOL_NAMES_TIMELINE.ADD_TIMELINE_ELEMENT,
    TOOL_NAMES_TIMELINE.UPDATE_TIMELINE_ELEMENT,
    TOOL_NAMES_TIMELINE.DELETE_TIMELINE_ELEMENT,
    TOOL_NAMES_TIMELINE.TRIM_ELEMENT,
    TOOL_NAMES_TIMELINE.SPLIT_ELEMENT,
  ],
  alwaysActive: true,
  priority: 80,
  loadingTier: 'eager',
  dependencies: ['timeline-query'],
  source: 'builtin',
  enabled: true,
  icon: '🎞️',
};

// =============================================================================
// Lazy ToolSets — schema injected only on explicit activation
// =============================================================================

/**
 * Effects and transitions tools
 */
export const effectsTransitionsToolSet: ToolGroup = {
  name: 'effects-transitions',
  description: 'Visual effects and transition tools',
  tools: [
    TOOL_NAMES_TIMELINE.ADD_EFFECT,
    TOOL_NAMES_TIMELINE.UPDATE_EFFECT,
    TOOL_NAMES_TIMELINE.REMOVE_EFFECT,
    TOOL_NAMES_TIMELINE.SET_TRANSITION,
    TOOL_NAMES_TIMELINE.REMOVE_TRANSITION,
  ],
  alwaysActive: true,
  priority: 70,
  loadingTier: 'lazy',
  dependencies: ['timeline-query'],
  source: 'builtin',
  enabled: true,
  icon: '✨',
};

/**
 * Animation and keyframe tools
 */
export const animationKeyframesToolSet: ToolGroup = {
  name: 'animation-keyframes',
  description: 'Animation and keyframe tools for creating motion effects',
  tools: ['GetKeyframes', 'AddKeyframe', 'UpdateKeyframe', 'RemoveKeyframe'],
  alwaysActive: true,
  priority: 60,
  loadingTier: 'lazy',
  dependencies: ['timeline-query'],
  source: 'builtin',
  enabled: true,
  icon: '🎭',
};

/**
 * Color grading tools
 */
export const colorGradingToolSet: ToolGroup = {
  name: 'color-grading-tools',
  description: 'Color correction and grading tools',
  tools: [TOOL_NAMES_TIMELINE.SET_COLOR_CORRECTION, TOOL_NAMES_TIMELINE.RESET_COLOR_CORRECTION],
  alwaysActive: true,
  priority: 60,
  loadingTier: 'lazy',
  dependencies: ['timeline-query'],
  source: 'builtin',
  enabled: true,
  icon: '🎨',
};

/**
 * Audio editing tools
 */
export const audioEditingToolSet: ToolGroup = {
  name: 'audio-editing',
  description: 'Audio editing tools for volume, properties, and speed',
  tools: [
    TOOL_NAMES_TIMELINE.SET_AUDIO_PROPERTIES,
    TOOL_NAMES_TIMELINE.ADD_AUDIO_KEYFRAME,
    TOOL_NAMES_TIMELINE.SET_PLAYBACK_SPEED,
    TOOL_NAMES_TIMELINE.SEPARATE_AUDIO,
  ],
  alwaysActive: true,
  priority: 60,
  loadingTier: 'lazy',
  dependencies: ['timeline-query'],
  source: 'builtin',
  enabled: true,
  icon: '🔊',
};

/**
 * Track management tools
 */
export const trackManagementToolSet: ToolGroup = {
  name: 'track-management',
  description: 'Track management tools for adding, deleting, and organizing tracks',
  tools: [
    TOOL_NAMES_TIMELINE.ADD_TRACK,
    TOOL_NAMES_TIMELINE.DELETE_TRACK,
    TOOL_NAMES_TIMELINE.REORDER_TRACKS,
    TOOL_NAMES_TIMELINE.SET_TRACK_PROPERTIES,
  ],
  alwaysActive: true,
  priority: 50,
  loadingTier: 'lazy',
  dependencies: ['timeline-query'],
  source: 'builtin',
  enabled: true,
  icon: '📊',
};

/**
 * Shape and mask tools
 */
export const shapeMaskToolSet: ToolGroup = {
  name: 'shape-mask',
  description: 'Shape and mask tools for creating and editing shapes and masks',
  tools: ['AddShape', 'UpdateShape', 'AddMask', 'UpdateMask', 'RemoveMask'],
  alwaysActive: true,
  priority: 50,
  loadingTier: 'lazy',
  dependencies: ['timeline-query'],
  source: 'builtin',
  enabled: true,
  icon: '🔷',
};

/**
 * Export and render tools
 */
export const exportRenderToolSet: ToolGroup = {
  name: 'export-render',
  description: 'Export and render tools for video output and preview',
  tools: ['ExportVideo', 'GetExportProgress', 'RenderFrame', 'RenderClip', 'GetThumbnail'],
  alwaysActive: true,
  priority: 70,
  loadingTier: 'eager',
  source: 'builtin',
  enabled: true,
  icon: '📤',
};

/**
 * AI generation tools
 */
export const aiGenerationToolSet: ToolGroup = {
  name: 'ai-generation',
  description: 'AI generation tools for creating images, videos, audio, and music',
  tools: [
    TOOL_NAMES_MEDIA.GENERATE_IMAGE,
    TOOL_NAMES_MEDIA.GENERATE_VIDEO,
    TOOL_NAMES_MEDIA.GENERATE_TTS,
    TOOL_NAMES_MEDIA.GENERATE_MUSIC,
    'GenerateCharacter',
    'TransferStyle',
    'EnhanceVideo',
    'OptimizeAudio',
  ],
  alwaysActive: true,
  priority: 70,
  loadingTier: 'lazy',
  source: 'builtin',
  enabled: true,
  icon: '🤖',
};

/**
 * Pipeline control tools
 */
export const pipelineControlToolSet: ToolGroup = {
  name: 'pipeline-control',
  description: 'Pipeline orchestration tools for starting and controlling creative workflows',
  tools: ['StartPipeline', 'ConfirmPipelineGate', 'RetryPipelineScenes'],
  alwaysActive: true,
  priority: 80,
  loadingTier: 'eager',
  source: 'builtin',
  enabled: true,
  icon: '🔄',
};

/**
 * Media quality assessment tools
 */
export const mediaQAToolSet: ToolGroup = {
  name: 'media-qa',
  description:
    'Quality evaluation tools for AI-generated media. ' +
    'Image evaluation uses multimodal LLM vision analysis. ' +
    'Audio evaluation uses Engine technical metrics (LUFS, true peak, silence) — zero LLM cost. ' +
    'Activate when user explicitly requests quality checking of generated media.',
  tools: ['QualityCheck', 'QualityCheckConsistency'],
  alwaysActive: false,
  priority: 70,
  loadingTier: 'lazy',
  dependencies: ['ai-generation'],
  source: 'builtin',
  enabled: true,
  icon: '📊',
};

// =============================================================================
// Exports
// =============================================================================

/**
 * All builtin ToolSets — ordered by loading tier
 */
export const builtinToolGroups: ToolGroup[] = [
  // Resident
  coreSystemToolSet,
  planModeToolSet,
  fileEditingToolSet,
  shellExecutionToolSet,
  // Eager
  timelineQueryToolSet,
  gitOperationsToolSet,
  elementEditingToolSet,
  exportRenderToolSet,
  pipelineControlToolSet,
  // Lazy
  effectsTransitionsToolSet,
  animationKeyframesToolSet,
  colorGradingToolSet,
  audioEditingToolSet,
  trackManagementToolSet,
  shapeMaskToolSet,
  aiGenerationToolSet,
  mediaQAToolSet,
];

/**
 * Register all builtin ToolSets to a registry
 */
export function registerBuiltinToolGroups(registry: IToolGroupRegistry): void {
  for (const group of builtinToolGroups) {
    registry.register(group);
  }
}
