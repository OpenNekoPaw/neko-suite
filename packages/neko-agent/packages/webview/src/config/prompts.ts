/**
 * Prompt Preset Configuration
 *
 * Re-exports types from shared package and provides utility functions.
 * Builtin prompts are loaded from platform via ConfigManager.
 */

import type { PromptPresetConfig, PromptPresetType, PromptSource } from '@neko/shared';

// Re-export types from shared package
export type { PromptPresetConfig, PromptPresetType, PromptSource };

/**
 * Get prompt type display name
 */
export function getPromptTypeName(type: PromptPresetType): string {
  const typeNames: Record<PromptPresetType, string> = {
    chat: 'Chat',
    coder: 'Coding',
    screenwriter: 'Screenwriting',
    storyboard: 'Storyboard',
    image: 'Image',
    video: 'Video',
    audio: 'Audio',
    plan: 'Plan',
    custom: 'Custom',
  };
  return typeNames[type] || type;
}

/**
 * Get prompt type icon
 */
export function getPromptTypeIcon(type: PromptPresetType): string {
  const icons: Record<PromptPresetType, string> = {
    chat: '💬',
    coder: '👨‍💻',
    screenwriter: '📝',
    storyboard: '🎬',
    image: '🎨',
    video: '🎥',
    audio: '🎵',
    plan: '📋',
    custom: '🔧',
  };
  return icons[type] || '🔧';
}

/**
 * Get prompt source display name
 */
export function getPromptSourceName(source: PromptSource | undefined): string {
  switch (source) {
    case 'builtin':
      return 'Built-in';
    case 'personal':
      return 'User';
    case 'project':
      return 'Workspace';
    default:
      return 'Unknown';
  }
}

/**
 * Determine prompt source from its properties
 */
export function getPromptSource(prompt: PromptPresetConfig): PromptSource {
  if (prompt.source) {
    return prompt.source;
  }
  // Fallback based on builtin flag
  return prompt.builtin ? 'builtin' : 'personal';
}
