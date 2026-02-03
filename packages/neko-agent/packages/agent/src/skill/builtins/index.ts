/**
 * Builtin Skills and Slash Commands - Creative Media Domain
 *
 * Neko Suite focuses on creative content creation, so builtin skills are
 * limited to media generation, video editing, and content creation tasks.
 *
 * Key distinction:
 * - Skill: Semantic discovery, no slash command, no argument support
 * - SlashCommand: Explicit /command trigger, supports $ARGUMENTS and $1, $2, etc.
 */

import type { Skill, SlashCommand, ISkillRegistry } from '@neko/shared';
import { aiGenerateSkill, aiGenerateToolDefinitions } from './ai-generate';

// Re-export ai-generate for external use
export { aiGenerateSkill, aiGenerateToolDefinitions };

// Re-export ToolGroups (renamed from ToolSkills)
export {
  builtinToolGroups,
  registerBuiltinToolGroups,
  // Legacy exports
  builtinToolSkills,
  registerBuiltinToolSkills,
} from './tool-skills';

// =============================================================================
// Creative Skills (Semantic Discovery)
// =============================================================================

/**
 * Video Editing Assistant - Help with timeline operations
 *
 * Triggered when user mentions: edit video, cut clip, trim, transition, timeline
 */
export const videoEditingSkill: Skill = {
  name: 'video-editing',
  description:
    'Video editing assistant for timeline operations. Use when user mentions: edit video, cut clip, trim video, add transition, timeline editing, split clip, merge clips, adjust timing.',
  content: `# Video Editing Assistant

You are an expert video editor. Help users with timeline-based editing tasks.

## Core Operations

| Task | Description |
|------|-------------|
| Cut/Split | Divide clip at specific point |
| Trim | Remove start/end portions |
| Transition | Add effects between clips |
| Reorder | Move clips on timeline |
| Speed | Adjust playback speed |

## Best Practices

1. **Preserve quality** - Work with original resolution when possible
2. **Smooth transitions** - 0.5-1s duration for most transitions
3. **Audio sync** - Always check audio alignment after cuts
4. **Save often** - Recommend auto-save intervals

## Common Workflows

### Basic Cut Editing
1. Import media to timeline
2. Set in/out points
3. Apply cut at playhead
4. Remove unwanted sections
5. Add transitions if needed

### J-Cut / L-Cut
- J-Cut: Audio starts before video
- L-Cut: Audio continues after video cuts
- Smooth dialogue scenes

### Montage
- Quick cuts (0.5-2s each)
- Match action or music beats
- Build energy and pace
`,
  allowedTools: [
    // Timeline query (read-only)
    'GetTimelineInfo',
    'GetElementInfo',
    'ListElements',
    'ListEffects',
    'ListTransitions',
    // Element editing
    'AddElement',
    'UpdateElement',
    'DeleteElement',
    'TrimElement',
    'SplitElement',
    // Effects and transitions
    'AddEffect',
    'UpdateEffect',
    'RemoveEffect',
    'SetTransition',
    'RemoveTransition',
    // Track management
    'AddTrack',
    'DeleteTrack',
    'ReorderTracks',
    'SetTrackProperties',
    // Playback
    'SetPlaybackSpeed',
  ],
  icon: '🎬',
  source: 'builtin',
  enabled: true,
};

/**
 * Color Grading Assistant - Help with color correction and grading
 *
 * Triggered when user mentions: color grade, color correct, LUT, white balance
 */
export const colorGradingSkill: Skill = {
  name: 'color-grading',
  description:
    'Color grading and correction assistant. Use when user mentions: color grade, color correct, apply LUT, white balance, exposure, contrast, saturation, cinematic look, film look.',
  content: `# Color Grading Assistant

You are a professional colorist. Help users achieve their desired visual style.

## Color Correction vs Grading

| Correction | Grading |
|------------|---------|
| Fix exposure | Create mood |
| Balance white | Apply style |
| Match shots | Cinematic look |

## Key Parameters

### Primary Correction
- **Exposure**: Overall brightness (-3 to +3 stops)
- **Contrast**: Tonal range (flatten or punch)
- **Temperature**: Warm (orange) ↔ Cool (blue)
- **Tint**: Green ↔ Magenta

### Secondary Adjustments
- **Highlights/Shadows**: Selective brightness
- **Saturation/Vibrance**: Color intensity
- **HSL**: Target specific colors

## Popular Looks

### Cinematic Teal & Orange
- Push shadows toward teal
- Push skin tones toward orange
- Lift blacks slightly
- Subtle vignette

### Film Emulation
- Lifted blacks (crushed shadows)
- Reduced highlight rolloff
- Subtle grain
- Muted saturation

### High Key / Low Key
- High key: Bright, minimal shadows
- Low key: Dark, dramatic shadows
`,
  allowedTools: [
    // Timeline query (read-only)
    'GetTimelineInfo',
    'GetElementInfo',
    'ListElements',
    // Color grading
    'SetColorCorrection',
    'ResetColorCorrection',
    // Effects for color
    'AddEffect',
    'UpdateEffect',
    'RemoveEffect',
  ],
  icon: '🎨',
  source: 'builtin',
  enabled: true,
};

/**
 * Audio Mixing Assistant - Help with audio levels and effects
 *
 * Triggered when user mentions: audio mix, volume, music, voiceover, sound
 */
export const audioMixingSkill: Skill = {
  name: 'audio-mixing',
  description:
    'Audio mixing and sound design assistant. Use when user mentions: audio mix, adjust volume, add music, voiceover levels, sound effects, normalize audio, fade in/out, ducking.',
  content: `# Audio Mixing Assistant

You are a professional audio mixer. Help users achieve balanced, clear audio.

## Level Guidelines

| Element | Target Level |
|---------|--------------|
| Dialogue | -12 to -6 dB |
| Music (background) | -18 to -24 dB |
| Music (featured) | -12 to -6 dB |
| SFX | Varies by context |

## Common Techniques

### Ducking
Automatically lower music when dialogue plays:
- Threshold: -20 dB
- Reduction: -8 to -12 dB
- Attack: Fast (10-50ms)
- Release: Medium (100-300ms)

### Dialogue Clarity
1. High-pass filter at 80-100 Hz
2. Light compression (2:1, -10dB threshold)
3. De-ess if needed (4-8 kHz)
4. Subtle EQ boost at 2-4 kHz

### Music Bed
1. Choose complementary genre/mood
2. Set initial level -18 dB
3. Apply ducking for dialogue
4. Fade in/out at scene changes

## Mastering Tips

- Target -14 LUFS for streaming
- Leave -1 dB headroom
- Check on multiple speakers
- A/B with reference tracks
`,
  allowedTools: [
    // Timeline query (read-only)
    'GetTimelineInfo',
    'GetElementInfo',
    'ListElements',
    // Audio editing
    'SetAudioProperties',
    'AddAudioKeyframe',
    'SetPlaybackSpeed',
    'SeparateAudio',
    // Element operations for audio clips
    'AddElement',
    'UpdateElement',
    'DeleteElement',
    'TrimElement',
  ],
  icon: '🎵',
  source: 'builtin',
  enabled: true,
};

/**
 * Subtitle Assistant - Help with captioning and subtitles
 *
 * Triggered when user mentions: subtitle, caption, transcribe, translate text
 */
export const subtitleSkill: Skill = {
  name: 'subtitle-assistant',
  description:
    'Subtitle and captioning assistant. Use when user mentions: add subtitles, create captions, transcribe video, translate subtitles, subtitle timing, SRT, VTT.',
  content: `# Subtitle Assistant

You are a professional subtitler. Help users create accessible, well-timed captions.

## Subtitle Standards

| Platform | Max Length | Duration |
|----------|------------|----------|
| YouTube | 42 chars/line | 1-7 sec |
| Netflix | 42 chars/line | 1-6 sec |
| Broadcast | 37 chars/line | 1-6 sec |

## Best Practices

### Timing
- Min duration: 1 second
- Max duration: 7 seconds
- Reading speed: 20-25 chars/sec
- Sync with natural pauses

### Line Breaking
- Break at natural pauses
- Keep phrases together
- Max 2 lines per subtitle
- Balance line lengths

### Styling
- White text, black outline
- Sans-serif font (Arial, Helvetica)
- Size: 5-7% of screen height
- Position: Bottom center (safe area)

## Translation Tips

1. **Context matters** - Understand the scene
2. **Cultural adaptation** - Localize idioms
3. **Length constraint** - May need to condense
4. **Reading time** - Account for target language
`,
  allowedTools: [
    // Timeline query (read-only)
    'GetTimelineInfo',
    'GetElementInfo',
    'ListElements',
    // Element operations for subtitle clips
    'AddElement',
    'UpdateElement',
    'DeleteElement',
    'TrimElement',
    // File operations for SRT/VTT
    'Read',
    'Write',
    'ListDirectory',
    'Glob',
  ],
  icon: '📝',
  source: 'builtin',
  enabled: true,
};

// =============================================================================
// Slash Commands - REMOVED
// =============================================================================
// Slash commands have been removed from builtin skills.
// Users can create custom slash commands in .neko/commands/ directory.

// =============================================================================
// Additional Skills - REMOVED (System Operations)
// =============================================================================
// System operation skills (file-operations, git, shell) have been removed
// as they are too generic and not specific to video editing.
// Users can create custom skills for these operations if needed.

// =============================================================================
// Exports
// =============================================================================

/**
 * All builtin skills (semantic discovery)
 *
 * Core video editing skills only. System operation skills (file-operations, git, shell)
 * have been removed as they are too generic.
 */
export const builtinSkills: Skill[] = [
  // AI Generation
  aiGenerateSkill,
  // Video Editing
  videoEditingSkill,
  colorGradingSkill,
  audioMixingSkill,
  subtitleSkill,
];

/**
 * All builtin slash commands (explicit /command trigger)
 *
 * Slash commands have been removed from builtin skills.
 * Users can create custom slash commands in .neko/commands/ directory.
 */
export const builtinCommands: SlashCommand[] = [];

/**
 * Register all builtin skills and commands to a registry
 */
export function registerBuiltins(registry: ISkillRegistry): void {
  for (const skill of builtinSkills) {
    registry.registerSkill(skill);
  }
  for (const command of builtinCommands) {
    registry.registerCommand(command);
  }
}

/**
 * @deprecated Use registerBuiltins() instead
 */
export function registerBuiltinSkills(registry: ISkillRegistry): void {
  registerBuiltins(registry);
}
