/**
 * InputArea Types and Constants
 */

// Re-export MessageAttachment from shared and alias as AttachedFile for backward compatibility
import type { MessageAttachment, AttachmentType } from '@neko/shared';
export type { MessageAttachment, AttachmentType } from '@neko/shared';

/**
 * @deprecated Use MessageAttachment instead
 */
export type AttachedFile = MessageAttachment;

// Command source type
export type CommandSource = 'builtin' | 'skill';

// Slash command definition
export interface SlashCommand {
  id: string;
  name: string;
  descriptionKey: string; // i18n key or direct description for skills
  icon: string;
  /** Command source: builtin or skill */
  source?: CommandSource;
  /** Skill ID if source is 'skill' */
  skillId?: string;
}

// Predefined slash commands - descriptions use i18n keys
// Aligned with Claude Code CLI built-in commands
export const SLASH_COMMANDS: SlashCommand[] = [
  // Core commands
  {
    id: 'clear',
    name: '/clear',
    descriptionKey: 'chat.commands.clear',
    icon: '🗑️',
    source: 'builtin',
  },
  {
    id: 'exit',
    name: '/exit',
    descriptionKey: 'chat.commands.exit',
    icon: '🚪',
    source: 'builtin',
  },
  {
    id: 'help',
    name: '/help',
    descriptionKey: 'chat.commands.help',
    icon: '❓',
    source: 'builtin',
  },
  // Session management
  { id: 'new', name: '/new', descriptionKey: 'chat.commands.new', icon: '✨', source: 'builtin' },
  {
    id: 'resume',
    name: '/resume',
    descriptionKey: 'chat.commands.resume',
    icon: '▶️',
    source: 'builtin',
  },
  // Context and cost
  {
    id: 'compact',
    name: '/compact',
    descriptionKey: 'chat.commands.compact',
    icon: '📦',
    source: 'builtin',
  },
  // Configuration
  {
    id: 'status',
    name: '/status',
    descriptionKey: 'chat.commands.status',
    icon: '📊',
    source: 'builtin',
  },
  {
    id: 'init',
    name: '/init',
    descriptionKey: 'chat.commands.init',
    icon: '🚀',
    source: 'builtin',
  },
  {
    id: 'model',
    name: '/model',
    descriptionKey: 'chat.commands.model',
    icon: '🤖',
    source: 'builtin',
  },
  {
    id: 'permissions',
    name: '/permissions',
    descriptionKey: 'chat.commands.permissions',
    icon: '🔐',
    source: 'builtin',
  },
  {
    id: 'settings',
    name: '/settings',
    descriptionKey: 'chat.commands.settings',
    icon: '⚙️',
    source: 'builtin',
  },
  // Memory and tasks
  {
    id: 'todos',
    name: '/todos',
    descriptionKey: 'chat.commands.todos',
    icon: '✅',
    source: 'builtin',
  },
  {
    id: 'tasks',
    name: '/tasks',
    descriptionKey: 'chat.commands.tasks',
    icon: '📋',
    source: 'builtin',
  },
  // Mode and planning
  {
    id: 'plan',
    name: '/plan',
    descriptionKey: 'chat.commands.plan',
    icon: '📐',
    source: 'builtin',
  },
  // Tools integration
  { id: 'mcp', name: '/mcp', descriptionKey: 'chat.commands.mcp', icon: '🔌', source: 'builtin' },
];

/**
 * Skill summary for UI display (from @neko/platform)
 * Duplicated here to avoid direct dependency on platform package
 */
export interface SkillSummary {
  id: string;
  name: string;
  description: string;
  icon?: string;
  slashCommand?: string;
  tags: string[];
  source: 'builtin' | 'user' | 'project' | 'community';
  enabled: boolean;
}

/**
 * Convert skill summary to slash command
 */
export function skillToSlashCommand(skill: SkillSummary): SlashCommand | null {
  if (!skill.slashCommand || !skill.enabled) {
    return null;
  }
  return {
    id: skill.slashCommand,
    name: `/${skill.slashCommand}`,
    descriptionKey: skill.description, // Direct description, not i18n key
    icon: skill.icon || '🔧',
    source: 'skill',
    skillId: skill.id,
  };
}

/**
 * Get all available commands (builtin + skills)
 */
export function getAllCommands(skills: SkillSummary[] = []): SlashCommand[] {
  const skillCommands = skills
    .map(skillToSlashCommand)
    .filter((cmd): cmd is SlashCommand => cmd !== null);

  return [...SLASH_COMMANDS, ...skillCommands];
}

// Project file for @ reference
export interface ProjectFile {
  path: string;
  name: string;
  type: 'file' | 'folder';
  icon?: string;
}

// File type icons
export const FILE_TYPE_ICONS: Record<AttachmentType, string> = {
  file: '📄',
  image: '🖼️',
  video: '🎥',
  audio: '🎵',
};

// Get file type from MIME type
export function getFileTypeFromMime(mimeType: string): AttachmentType {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file';
}

// Format file size
export function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
