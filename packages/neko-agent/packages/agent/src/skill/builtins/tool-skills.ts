/**
 * Builtin ToolSets - Define tool sets for dynamic injection
 *
 * ToolSets control which tools are visible to LLM based on user intent.
 * This reduces token consumption and improves tool selection accuracy.
 *
 * LLM discovers and activates tool sets via SearchToolSets / ActivateToolSet.
 * Keyword matching was removed — LLM semantic understanding replaces it.
 *
 * Categories:
 * - Always Active (3): Loaded in the always layer, ~12 tools
 * - On-Demand (11): Activated by LLM via ActivateToolSet
 */

import type { ToolGroup, IToolGroupRegistry } from '@neko/shared';

// =============================================================================
// Always-Active ToolSets
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
  source: 'builtin',
  enabled: true,
  icon: '📋',
};

/**
 * Timeline query tools - read-only timeline operations
 */
export const timelineQueryToolSet: ToolGroup = {
  name: 'timeline-query',
  description: 'Timeline query tools for viewing timeline info, elements, effects, and transitions',
  tools: ['GetTimelineInfo', 'GetElementInfo', 'ListElements', 'ListEffects', 'ListTransitions'],
  alwaysActive: true,
  priority: 90,
  source: 'builtin',
  enabled: true,
  icon: '🎬',
};

// =============================================================================
// On-Demand ToolSets (activated by LLM via ActivateToolSet)
// =============================================================================

/**
 * File editing tools
 */
export const fileEditingToolSet: ToolGroup = {
  name: 'file-editing',
  description: 'File editing tools for writing, editing, creating, and deleting files',
  tools: ['Write', 'Edit', 'CreateDirectory', 'DeleteFile'],
  priority: 90,
  source: 'builtin',
  enabled: true,
  icon: '✏️',
};

/**
 * Git operations tools
 */
export const gitOperationsToolSet: ToolGroup = {
  name: 'git-operations',
  description: 'Git version control tools for status, diff, and log',
  tools: ['GitStatus', 'GitDiff', 'GitLog'],
  priority: 80,
  source: 'builtin',
  enabled: true,
  icon: '📦',
};

/**
 * Shell execution tools
 */
export const shellExecutionToolSet: ToolGroup = {
  name: 'shell-execution',
  description: 'Shell command execution tool for running terminal commands',
  tools: ['Bash'],
  priority: 70,
  source: 'builtin',
  enabled: true,
  icon: '💻',
};

/**
 * Element editing tools
 */
export const elementEditingToolSet: ToolGroup = {
  name: 'element-editing',
  description:
    'Timeline element editing tools for adding, updating, deleting, trimming, and splitting',
  tools: [
    'AddElement',
    'UpdateElement',
    'DeleteElement',
    'TrimElement',
    'SplitElement',
    'BatchTimelineOps',
  ],
  priority: 80,
  dependencies: ['timeline-query'],
  source: 'builtin',
  enabled: true,
  icon: '🎞️',
};

/**
 * Effects and transitions tools
 */
export const effectsTransitionsToolSet: ToolGroup = {
  name: 'effects-transitions',
  description: 'Visual effects and transition tools',
  tools: ['AddEffect', 'UpdateEffect', 'RemoveEffect', 'SetTransition', 'RemoveTransition'],
  priority: 70,
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
  priority: 60,
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
  tools: ['SetColorCorrection', 'ResetColorCorrection'],
  priority: 60,
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
  tools: ['SetAudioProperties', 'AddAudioKeyframe', 'SetPlaybackSpeed', 'SeparateAudio'],
  priority: 60,
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
  tools: ['AddTrack', 'DeleteTrack', 'ReorderTracks', 'SetTrackProperties'],
  priority: 50,
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
  priority: 50,
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
  priority: 70,
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
    'GenerateImage',
    'GenerateVideo',
    'GenerateTTS',
    'GenerateMusic',
    'GenerateCharacter',
    'TransferStyle',
    'EnhanceVideo',
    'OptimizeAudio',
  ],
  priority: 70,
  source: 'builtin',
  enabled: true,
  icon: '🤖',
};

// =============================================================================
// Exports
// =============================================================================

/**
 * All builtin ToolSets
 */
export const builtinToolGroups: ToolGroup[] = [
  // Always active
  coreSystemToolSet,
  planModeToolSet,
  timelineQueryToolSet,
  // On-demand
  fileEditingToolSet,
  gitOperationsToolSet,
  shellExecutionToolSet,
  elementEditingToolSet,
  effectsTransitionsToolSet,
  animationKeyframesToolSet,
  colorGradingToolSet,
  audioEditingToolSet,
  trackManagementToolSet,
  shapeMaskToolSet,
  exportRenderToolSet,
  aiGenerationToolSet,
];

/**
 * Register all builtin ToolSets to a registry
 */
export function registerBuiltinToolGroups(registry: IToolGroupRegistry): void {
  for (const group of builtinToolGroups) {
    registry.register(group);
  }
}
