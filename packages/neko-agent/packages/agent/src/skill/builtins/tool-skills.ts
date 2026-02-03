/**
 * Builtin ToolGroups - Define tool groups for dynamic injection
 *
 * ToolGroups control which tools are visible to LLM based on user intent.
 * This reduces token consumption and improves tool selection accuracy.
 *
 * Categories:
 * - Default Active (3): Always available, ~12 tools
 * - On-Demand (11): Activated by keyword matching
 */

import type { ToolGroup, IToolGroupRegistry } from '@neko/shared';

// Legacy type alias
type ToolSkill = ToolGroup;

// =============================================================================
// Default Active ToolSkills (always available)
// =============================================================================

/**
 * Core system tools - read-only operations
 */
export const coreSystemToolSkill: ToolSkill = {
  name: 'core-system',
  description: 'Core system tools for file reading, directory browsing, and searching',
  tools: [
    'Read',
    'ListDirectory',
    'Glob',
    'Grep',
    'WebSearch',
  ],
  triggerKeywords: [], // Always active
  defaultActive: true,
  priority: 100,
  source: 'builtin',
  enabled: true,
  icon: '📁',
};

/**
 * Plan mode tools
 */
export const planModeToolSkill: ToolSkill = {
  name: 'plan-mode',
  description: 'Plan mode tools for entering and exiting planning phase',
  tools: ['EnterPlanMode', 'ExitPlanMode'],
  triggerKeywords: [], // Always active
  defaultActive: true,
  priority: 100,
  source: 'builtin',
  enabled: true,
  icon: '📋',
};

/**
 * Timeline query tools - read-only timeline operations
 */
export const timelineQueryToolSkill: ToolSkill = {
  name: 'timeline-query',
  description: 'Timeline query tools for viewing timeline info, elements, effects, and transitions',
  tools: [
    'GetTimelineInfo',
    'GetElementInfo',
    'ListElements',
    'ListEffects',
    'ListTransitions',
  ],
  triggerKeywords: [], // Always active for video editing context
  defaultActive: true,
  priority: 90,
  source: 'builtin',
  enabled: true,
  icon: '🎬',
};

// =============================================================================
// On-Demand ToolSkills (activated by keywords)
// =============================================================================

/**
 * File editing tools
 */
export const fileEditingToolSkill: ToolSkill = {
  name: 'file-editing',
  description: 'File editing tools for writing, editing, creating, and deleting files',
  tools: ['Write', 'Edit', 'CreateDirectory', 'DeleteFile'],
  triggerKeywords: [
    '修改', '编辑', '创建', '删除', '写入', '保存', '新建',
    'modify', 'edit', 'create', 'delete', 'write', 'save', 'new file',
  ],
  defaultActive: false,
  priority: 90,
  source: 'builtin',
  enabled: true,
  icon: '✏️',
};

/**
 * Git operations tools
 */
export const gitOperationsToolSkill: ToolSkill = {
  name: 'git-operations',
  description: 'Git version control tools for status, diff, and log',
  tools: ['GitStatus', 'GitDiff', 'GitLog'],
  triggerKeywords: [
    'git', '提交', '版本', '差异', '日志', '变更', '代码',
    'commit', 'diff', 'log', 'status', 'changes', 'version',
  ],
  defaultActive: false,
  priority: 80,
  source: 'builtin',
  enabled: true,
  icon: '📦',
};

/**
 * Shell execution tools
 */
export const shellExecutionToolSkill: ToolSkill = {
  name: 'shell-execution',
  description: 'Shell command execution tool',
  tools: ['Bash'],
  triggerKeywords: [
    '运行', '执行', '命令', 'shell', '终端', 'npm', 'yarn', 'pnpm', 'node',
    'run', 'execute', 'command', 'terminal', 'build', 'install',
  ],
  defaultActive: false,
  priority: 70,
  source: 'builtin',
  enabled: true,
  icon: '💻',
};

/**
 * Element editing tools
 */
export const elementEditingToolSkill: ToolSkill = {
  name: 'element-editing',
  description: 'Timeline element editing tools for adding, updating, deleting, trimming, and splitting',
  tools: [
    'AddElement',
    'UpdateElement',
    'DeleteElement',
    'TrimElement',
    'SplitElement',
  ],
  triggerKeywords: [
    '添加', '修改', '删除', '裁剪', '分割', '剪辑', '元素', '视频', '音频', '图片',
    'add', 'update', 'delete', 'trim', 'split', 'clip', 'element', 'video', 'audio', 'image',
  ],
  defaultActive: false,
  priority: 80,
  dependencies: ['timeline-query'],
  source: 'builtin',
  enabled: true,
  icon: '🎞️',
};

/**
 * Effects and transitions tools
 */
export const effectsTransitionsToolSkill: ToolSkill = {
  name: 'effects-transitions',
  description: 'Visual effects and transition tools',
  tools: [
    'AddEffect',
    'UpdateEffect',
    'RemoveEffect',
    'SetTransition',
    'RemoveTransition',
  ],
  triggerKeywords: [
    '效果', '特效', '转场', '过渡', '滤镜', '模糊', '淡入', '淡出',
    'effect', 'transition', 'filter', 'fade', 'blur', 'dissolve',
  ],
  defaultActive: false,
  priority: 70,
  dependencies: ['timeline-query'],
  source: 'builtin',
  enabled: true,
  icon: '✨',
};

/**
 * Animation and keyframe tools
 */
export const animationKeyframesToolSkill: ToolSkill = {
  name: 'animation-keyframes',
  description: 'Animation and keyframe tools for creating motion effects',
  tools: [
    'GetKeyframes',
    'AddKeyframe',
    'UpdateKeyframe',
    'RemoveKeyframe',
  ],
  triggerKeywords: [
    '动画', '关键帧', '动效', '缓动', '运动',
    'animation', 'keyframe', 'animate', 'easing', 'motion',
  ],
  defaultActive: false,
  priority: 60,
  dependencies: ['timeline-query'],
  source: 'builtin',
  enabled: true,
  icon: '🎭',
};

/**
 * Color grading tools
 */
export const colorGradingToolSkill: ToolSkill = {
  name: 'color-grading-tools',
  description: 'Color correction and grading tools',
  tools: ['SetColorCorrection', 'ResetColorCorrection'],
  triggerKeywords: [
    '调色', '色彩', '亮度', '对比度', '饱和度', '色温', '曝光',
    'color', 'brightness', 'contrast', 'saturation', 'temperature', 'exposure', 'grade',
  ],
  defaultActive: false,
  priority: 60,
  dependencies: ['timeline-query'],
  source: 'builtin',
  enabled: true,
  icon: '🎨',
};

/**
 * Audio editing tools
 */
export const audioEditingToolSkill: ToolSkill = {
  name: 'audio-editing',
  description: 'Audio editing tools for volume, properties, and speed',
  tools: [
    'SetAudioProperties',
    'AddAudioKeyframe',
    'SetPlaybackSpeed',
    'SeparateAudio',
  ],
  triggerKeywords: [
    '音频', '音量', '声音', '速度', '分离', '音轨', '淡入', '淡出',
    'audio', 'volume', 'sound', 'speed', 'separate', 'track', 'fade',
  ],
  defaultActive: false,
  priority: 60,
  dependencies: ['timeline-query'],
  source: 'builtin',
  enabled: true,
  icon: '🔊',
};

/**
 * Track management tools
 */
export const trackManagementToolSkill: ToolSkill = {
  name: 'track-management',
  description: 'Track management tools for adding, deleting, and organizing tracks',
  tools: [
    'AddTrack',
    'DeleteTrack',
    'ReorderTracks',
    'SetTrackProperties',
  ],
  triggerKeywords: [
    '轨道', '图层', '添加轨道', '删除轨道', '排序',
    'track', 'layer', 'add track', 'delete track', 'reorder',
  ],
  defaultActive: false,
  priority: 50,
  dependencies: ['timeline-query'],
  source: 'builtin',
  enabled: true,
  icon: '📊',
};

/**
 * Shape and mask tools
 */
export const shapeMaskToolSkill: ToolSkill = {
  name: 'shape-mask',
  description: 'Shape and mask tools for creating and editing shapes and masks',
  tools: [
    'AddShape',
    'UpdateShape',
    'AddMask',
    'UpdateMask',
    'RemoveMask',
  ],
  triggerKeywords: [
    '形状', '遮罩', '蒙版', '矩形', '圆形', '多边形',
    'shape', 'mask', 'rectangle', 'circle', 'polygon', 'ellipse',
  ],
  defaultActive: false,
  priority: 50,
  dependencies: ['timeline-query'],
  source: 'builtin',
  enabled: true,
  icon: '🔷',
};

/**
 * Export and render tools
 */
export const exportRenderToolSkill: ToolSkill = {
  name: 'export-render',
  description: 'Export and render tools for video output and preview',
  tools: [
    'ExportVideo',
    'GetExportProgress',
    'RenderFrame',
    'RenderClip',
    'GetThumbnail',
  ],
  triggerKeywords: [
    // 中文 - 导出相关（核心词）
    '导出', '渲染', '输出', '缩略图', '预览',
    // 中文 - 导出动作
    '生成视频', '保存视频', '输出视频', '导出为', '转换', '编码',
    '导出mp4', '导出视频', '视频导出', '输出mp4',
    // 中文 - 完成/最终视频
    '完成视频', '最终视频', '成品', '完成项目', '导出项目',
    '生成最终', '输出成品', '完成编辑', '结束编辑',
    // 中文 - 格式相关
    '转mp4', '转webm', '转码', '压缩视频',
    // 英文 - export related (core)
    'export', 'render', 'output', 'thumbnail', 'preview',
    // 英文 - export actions
    'generate video', 'save video', 'encode', 'convert',
    'export mp4', 'export video', 'video export', 'output mp4',
    // 英文 - final/finish
    'final video', 'finish video', 'finalize', 'complete video',
    'finish editing', 'done editing', 'export project',
    // 英文 - format related
    'mp4', 'webm', 'to mp4', 'to webm', 'transcode', 'compress video',
  ],
  defaultActive: false,
  priority: 70, // Raised from 40 to 70 for better matching
  source: 'builtin',
  enabled: true,
  icon: '📤',
};

/**
 * AI generation tools
 */
export const aiGenerationToolSkill: ToolSkill = {
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
  triggerKeywords: [
    '生成', '创建', 'AI', '图片', '视频', '音乐', '语音', '配音',
    'generate', 'create', 'ai', 'image', 'video', 'music', 'voice', 'tts',
  ],
  defaultActive: false,
  priority: 70,
  source: 'builtin',
  enabled: true,
  icon: '🤖',
};

// =============================================================================
// Exports
// =============================================================================

/**
 * All builtin ToolGroups
 */
export const builtinToolGroups: ToolGroup[] = [
  // Default active
  coreSystemToolSkill,
  planModeToolSkill,
  timelineQueryToolSkill,
  // On-demand
  fileEditingToolSkill,
  gitOperationsToolSkill,
  shellExecutionToolSkill,
  elementEditingToolSkill,
  effectsTransitionsToolSkill,
  animationKeyframesToolSkill,
  colorGradingToolSkill,
  audioEditingToolSkill,
  trackManagementToolSkill,
  shapeMaskToolSkill,
  exportRenderToolSkill,
  aiGenerationToolSkill,
];

/**
 * @deprecated Use builtinToolGroups instead
 */
export const builtinToolSkills = builtinToolGroups;

/**
 * Register all builtin ToolGroups to a registry
 */
export function registerBuiltinToolGroups(
  registry: IToolGroupRegistry
): void {
  for (const group of builtinToolGroups) {
    registry.register(group);
  }
}

/**
 * @deprecated Use registerBuiltinToolGroups instead
 */
export function registerBuiltinToolSkills(
  registry: IToolGroupRegistry
): void {
  registerBuiltinToolGroups(registry);
}
