/**
 * Skill Configuration
 *
 * Provides builtin skills for the AI assistant.
 * Skills are loaded from Platform via ConfigManager, but these serve as defaults.
 *
 * Note: Slash commands have been removed from builtin configuration.
 * Users can create custom slash commands in .neko/commands/ directory.
 */

import type { ConfiguredSkill, ConfiguredSlashCommand } from '@neko/shared';

/**
 * Built-in Skills (Semantic Discovery)
 *
 * Core video editing skills only. These skills use i18n keys for name and description
 * to support internationalization.
 */
export const BUILTIN_SKILLS: ConfiguredSkill[] = [
  {
    name: 'video-editing-helper',
    description: 'Help with video editing tasks: cutting, trimming, adding transitions, effects, and subtitles. Use when the user asks about editing operations on the timeline.',
    content: `# Video Editing Helper

You are a video editing assistant. Help users with:
- Cutting and trimming clips
- Adding transitions between clips
- Applying effects and filters
- Managing subtitles and text overlays
- Working with the timeline

Always explain the steps clearly and suggest best practices for professional results.`,
    source: 'builtin',
    enabled: true,
    resources: {
      allowedTools: ['Read', 'Write', 'Bash(ffmpeg:*)'],
    },
  },
  {
    name: 'export-assistant',
    description: 'Help with video export settings: resolution, format, codec, quality. Use when the user asks about exporting or rendering videos.',
    content: `# Export Assistant

You are an export settings specialist. Help users with:
- Choosing the right format (MP4, WebM, MOV, etc.)
- Selecting appropriate resolution and quality
- Understanding codec options (H.264, H.265, VP9)
- Optimizing for different platforms (YouTube, Instagram, etc.)

Provide clear recommendations based on the user's target platform and quality requirements.`,
    source: 'builtin',
    enabled: true,
  },
  {
    name: 'subtitle-generator',
    description: 'Generate and edit subtitles for videos. Use when the user wants to add captions, translate subtitles, or style text overlays.',
    content: `# Subtitle Generator

You are a subtitle specialist. Help users with:
- Generating subtitles from video content
- Translating subtitles to different languages
- Styling subtitle appearance (font, color, position)
- Timing and synchronization

Use clear, concise language for subtitles and follow accessibility guidelines.`,
    source: 'builtin',
    enabled: true,
  },
];

/**
 * Built-in Slash Commands
 *
 * Slash commands have been removed from builtin configuration.
 * Users can create custom slash commands in .neko/commands/ directory.
 */
export const BUILTIN_COMMANDS: ConfiguredSlashCommand[] = [];

/**
 * Get all builtin skills
 */
export function getBuiltinSkills(): ConfiguredSkill[] {
  return BUILTIN_SKILLS;
}

/**
 * Get all builtin commands
 */
export function getBuiltinCommands(): ConfiguredSlashCommand[] {
  return BUILTIN_COMMANDS;
}
