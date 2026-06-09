/**
 * Builtin Skills - Creative Media Domain
 *
 * Skills with a `command` field are also registered as slash commands.
 */

import type { Skill, ISkillRegistry } from '@neko/shared';
import { TOOL_NAMES_TIMELINE, TOOL_NAMES_MEDIA, TOOL_NAMES_SYSTEM } from '@neko/shared';
import { aiGenerateSkill, aiGenerateToolDefinitions } from './ai-generate';
import { comicToStoryboardSkill, getComicToStoryboardSkill } from './comic-to-storyboard';
import {
  animationPlanToCutSkill,
  comicToAnimationSkill,
  exportVideoPackageSkill,
  getAnimationPlanToCutSkill,
  getComicToAnimationSkill,
  getExportVideoPackageSkill,
  getGeneratedShotAssemblySkill,
  getImageToShotSkill,
  getMediaToVideoSkill,
  getStoryboardToAnimationPlanSkill,
  generatedShotAssemblySkill,
  imageToShotSkill,
  mediaToVideoSkill,
  storyboardToAnimationPlanSkill,
} from './media-to-video';
import { scriptGenerationSkill } from './script-generation';
import { qualityAssessmentSkill } from './quality-assessment';
import { creationPersonaSkill } from './creation-persona';
import { executionPersonaSkill } from './execution-persona';
import { iterationPersonaSkill } from './iteration-persona';
import type { BuiltinSkillOptions } from './builtin-skill-content';

// Re-export ai-generate for external use
export { aiGenerateSkill, aiGenerateToolDefinitions };

// Re-export new skills
export { comicToStoryboardSkill, getComicToStoryboardSkill } from './comic-to-storyboard';
export {
  animationPlanToCutSkill,
  comicToAnimationSkill,
  exportVideoPackageSkill,
  getAnimationPlanToCutSkill,
  getComicToAnimationSkill,
  getExportVideoPackageSkill,
  getGeneratedShotAssemblySkill,
  getImageToShotSkill,
  getMediaToVideoSkill,
  getMediaWorkflowBuiltinSkills,
  getStoryboardToAnimationPlanSkill,
  generatedShotAssemblySkill,
  imageToShotSkill,
  mediaToVideoSkill,
  storyboardToAnimationPlanSkill,
} from './media-to-video';
export {
  normalizeBuiltinSkillLocale,
  selectBuiltinSkillContent,
  type BuiltinSkillLocale,
  type BuiltinSkillOptions,
  type LocalizedBuiltinSkillContent,
} from './builtin-skill-content';
export { scriptGenerationSkill } from './script-generation';
export { qualityAssessmentSkill } from './quality-assessment';

// IDC stage persona skills (docs/architecture/agent-unified-workflow.md §4)
export { creationPersonaSkill } from './creation-persona';
export { executionPersonaSkill } from './execution-persona';
export { iterationPersonaSkill } from './iteration-persona';

// Re-export ToolGroups
export { builtinToolGroups, registerBuiltinToolGroups } from './tool-skills';

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
    TOOL_NAMES_TIMELINE.GET_TIMELINE_INFO,
    TOOL_NAMES_TIMELINE.GET_ELEMENT_INFO,
    TOOL_NAMES_TIMELINE.LIST_TIMELINE_ELEMENTS,
    TOOL_NAMES_TIMELINE.LIST_EFFECTS,
    TOOL_NAMES_TIMELINE.LIST_TRANSITIONS,
    // Element editing
    TOOL_NAMES_TIMELINE.ADD_TIMELINE_ELEMENT,
    TOOL_NAMES_TIMELINE.UPDATE_TIMELINE_ELEMENT,
    TOOL_NAMES_TIMELINE.DELETE_TIMELINE_ELEMENT,
    TOOL_NAMES_TIMELINE.TRIM_ELEMENT,
    TOOL_NAMES_TIMELINE.SPLIT_ELEMENT,
    TOOL_NAMES_TIMELINE.ADD_EFFECT,
    TOOL_NAMES_TIMELINE.UPDATE_EFFECT,
    TOOL_NAMES_TIMELINE.REMOVE_EFFECT,
    TOOL_NAMES_TIMELINE.SET_TRANSITION,
    TOOL_NAMES_TIMELINE.REMOVE_TRANSITION,
    TOOL_NAMES_TIMELINE.ADD_TRACK,
    TOOL_NAMES_TIMELINE.DELETE_TRACK,
    TOOL_NAMES_TIMELINE.REORDER_TRACKS,
    TOOL_NAMES_TIMELINE.SET_TRACK_PROPERTIES,
    TOOL_NAMES_TIMELINE.SET_PLAYBACK_SPEED,
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
    TOOL_NAMES_TIMELINE.GET_TIMELINE_INFO,
    TOOL_NAMES_TIMELINE.GET_ELEMENT_INFO,
    TOOL_NAMES_TIMELINE.LIST_TIMELINE_ELEMENTS,
    TOOL_NAMES_TIMELINE.UPDATE_TIMELINE_ELEMENT,
    TOOL_NAMES_TIMELINE.SET_COLOR_CORRECTION,
    TOOL_NAMES_TIMELINE.RESET_COLOR_CORRECTION,
    TOOL_NAMES_TIMELINE.ADD_EFFECT,
    TOOL_NAMES_TIMELINE.UPDATE_EFFECT,
    TOOL_NAMES_TIMELINE.REMOVE_EFFECT,
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
    TOOL_NAMES_TIMELINE.GET_TIMELINE_INFO,
    TOOL_NAMES_TIMELINE.GET_ELEMENT_INFO,
    TOOL_NAMES_TIMELINE.LIST_TIMELINE_ELEMENTS,
    // Element operations for audio clips
    TOOL_NAMES_TIMELINE.ADD_TIMELINE_ELEMENT,
    TOOL_NAMES_TIMELINE.UPDATE_TIMELINE_ELEMENT,
    TOOL_NAMES_TIMELINE.DELETE_TIMELINE_ELEMENT,
    TOOL_NAMES_TIMELINE.SET_AUDIO_PROPERTIES,
    TOOL_NAMES_TIMELINE.ADD_AUDIO_KEYFRAME,
    TOOL_NAMES_TIMELINE.SET_PLAYBACK_SPEED,
    TOOL_NAMES_TIMELINE.SEPARATE_AUDIO,
    TOOL_NAMES_TIMELINE.TRIM_ELEMENT,
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
    TOOL_NAMES_TIMELINE.GET_TIMELINE_INFO,
    TOOL_NAMES_TIMELINE.GET_ELEMENT_INFO,
    TOOL_NAMES_TIMELINE.LIST_TIMELINE_ELEMENTS,
    // Element operations for subtitle clips
    TOOL_NAMES_TIMELINE.ADD_TIMELINE_ELEMENT,
    TOOL_NAMES_TIMELINE.UPDATE_TIMELINE_ELEMENT,
    TOOL_NAMES_TIMELINE.DELETE_TIMELINE_ELEMENT,
    // File operations for SRT/VTT
    TOOL_NAMES_SYSTEM.READ,
    TOOL_NAMES_SYSTEM.READ_DOCUMENT,
    TOOL_NAMES_SYSTEM.WRITE,
    TOOL_NAMES_SYSTEM.LIST_DIRECTORY,
    TOOL_NAMES_SYSTEM.GLOB,
    TOOL_NAMES_TIMELINE.TRIM_ELEMENT,
  ],
  icon: '📝',
  source: 'builtin',
  enabled: true,
};

/**
 * Script to Timeline Assistant - Convert Fountain scripts to neko-cut projects
 *
 * Triggered when user mentions: convert script, fountain to timeline, screenplay to project
 *
 * Leverages neko-story's TimelineConverter format:
 *   Track 0 (text):     one TextElement per scene heading
 *   Track 1 (subtitle): one SubtitleElement per dialogue line
 */
export const scriptToTimelineSkill: Skill = {
  name: 'script-to-timeline',
  description:
    'Script to timeline conversion assistant. Use when user mentions: convert script to timeline, fountain to video project, screenplay to neko-cut, script to editing project, import fountain.',
  content: `# Script to Timeline Converter

You help users convert Fountain format screenplays into neko-cut timeline projects.

## Quick Method

Run the built-in VSCode command on an active .fountain file:
\`\`\`
neko.story.toTimeline
\`\`\`
This opens a QuickPick preview and SaveDialog for the active .fountain file.

## Manual Method

If the user wants programmatic or customized conversion, read the .fountain file and create a .neko project JSON following the format below.

### Fountain Format Reference

Fountain is a plain-text screenplay format:
- **Scene Heading**: Lines starting with INT. / EXT. / INT./EXT.
- **Character**: All-caps line before dialogue
- **Dialogue**: Lines after a character cue
- **Action**: Regular paragraphs
- **Parenthetical**: Lines in (parentheses) between character and dialogue
- **Transition**: Lines ending with TO: or starting with >

### ProjectData JSON Format

\`\`\`json
{
  "version": "2.0",
  "name": "Project Name",
  "resolution": { "width": 1920, "height": 1080 },
  "fps": 24,
  "tracks": [
    {
      "id": "<unique-id>", "name": "Scenes", "type": "text",
      "elements": [{
        "id": "<id>", "type": "text", "name": "Scene 1",
        "content": "INT. OFFICE - DAY",
        "startTime": 0, "duration": 5.0,
        "fontSize": 36, "color": "#ffffff",
        "backgroundColor": "rgba(0,0,0,0.5)", "textAlign": "center"
      }]
    },
    {
      "id": "<unique-id>", "name": "Dialogue", "type": "subtitle",
      "elements": [{
        "id": "<id>", "type": "subtitle", "name": "Dialogue 1",
        "text": "Hello, world!",
        "startTime": 0, "duration": 1.5,
        "fontSize": 48, "color": "#ffffff"
      }]
    }
  ]
}
\`\`\`

### Duration Estimation

| Element | Duration |
|---------|----------|
| Dialogue line | 1.5 seconds |
| Action paragraph | 2.0 seconds |
| Minimum scene | 3.0 seconds |
`,
  allowedTools: [
    TOOL_NAMES_SYSTEM.READ,
    TOOL_NAMES_SYSTEM.READ_DOCUMENT,
    TOOL_NAMES_SYSTEM.WRITE,
    TOOL_NAMES_SYSTEM.LIST_DIRECTORY,
    TOOL_NAMES_SYSTEM.GLOB,
    TOOL_NAMES_TIMELINE.GET_TIMELINE_INFO,
    TOOL_NAMES_TIMELINE.LIST_TIMELINE_ELEMENTS,
  ],
  icon: '📜',
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

// Note: storyboardToTimelineSkill / pipelineRetrySkill /
// pipelineDiagnosticsSkill were removed together with the workflow/
// orchestration layer. Script-to-video flows are expressed by the Agent
// directly composing GenerateImage / GenerateVideo / AddTimelineElement
// from prompt-chain Skill guidance — no separate pipeline DSL.

/**
 * Scene-to-Music Skill
 *
 * Analyzes timeline content and generates matching background music.
 * Triggered by: 配乐, background music, auto score, 自动配乐, 场景配乐, add music to timeline
 */
export const sceneToMusicSkill: Skill = {
  name: 'scene-to-music',
  description:
    'Analyze timeline scenes and generate matching background music with GenerateMusic, then insert it as an audio track. ' +
    'Use when user mentions: 配乐, background music, auto score, 自动配乐, 场景配乐, add music, music for scene.',
  content: `# Scene-to-Music Assistant

Analyze the timeline and generate background music that matches the scene content and mood.

## Workflow

### Step 1: Analyze the timeline
Call GetTimelineInfo to get the total duration and timeline structure.
Call ListTimelineElements to understand what's in the scene (video clips, subtitles, effects).
From the elements, infer:
- Overall mood (action, peaceful, dramatic, uplifting, mysterious, etc.)
- Genre hint (if any visual style clues are present)
- Duration to match

### Step 2: Build a music prompt
Compose a concise prompt that describes the desired music based on scene analysis.
Examples:
- "Cinematic orchestral score, uplifting and adventurous, building tension"
- "Ambient electronic background, calm and focused, minimal percussion"
- "Upbeat acoustic guitar, warm and cheerful, light rhythm"

If the user provided explicit preferences (genre, mood, style), prioritize those.

### Step 3: Generate the music
Call GenerateMusic with:
- prompt: the composed prompt
- duration: total timeline duration in seconds (capped at 300)
- genre and mood if clearly inferable

GenerateMusic is asynchronous and returns a taskId. Poll task_output until status is 'complete'.
On completion, task_output returns { url: string } in the result field.

### Step 4: Insert the music track
First check if a music/audio track exists. If not, call AddTrack with type 'audio'.
Then call AddTimelineElement with:
- type: 'audio'
- source: the URL returned by task_output
- trackId: the music track id
- startTime: 0
- duration: match the generated clip duration (or timeline duration)

### Step 5: Confirm
Report to the user what music was generated (prompt used, duration) and where it was placed.

## Notes
- Always match music duration to timeline length unless user specifies otherwise
- If timeline has no elements yet, ask the user to describe the scene mood instead of reading an empty timeline
- If generation fails, report the error and suggest the user check their music provider configuration
`,
  allowedTools: [
    TOOL_NAMES_TIMELINE.GET_TIMELINE_INFO,
    TOOL_NAMES_TIMELINE.LIST_TIMELINE_ELEMENTS,
    TOOL_NAMES_MEDIA.GENERATE_MUSIC,
    TOOL_NAMES_TIMELINE.ADD_TIMELINE_ELEMENT,
    TOOL_NAMES_TIMELINE.ADD_TRACK,
  ],
  icon: '🎵',
  source: 'builtin',
  enabled: true,
  command: 'scene-to-music',
  argumentHint: '[mood or style hint]',
  supportsArguments: true,
};

// Note: pipelineDiagnosticsSkill removed — pipeline introspection used to
// rely on GetPipelineReport / ListPipelineReports. Post-workflow/ deletion,
// the Agent diagnoses failures directly from tool-call error messages in
// its own conversation history.

/**
 * All builtin skills (semantic discovery)
 *
 * Creative media skills only. System operation skills (file-operations, git, shell)
 * have been removed as they are too generic.
 */
export const builtinSkills: Skill[] = [
  // IDC stage personas (Specify / Implement / Iteration)
  creationPersonaSkill,
  executionPersonaSkill,
  iterationPersonaSkill,
  // AI Generation
  aiGenerateSkill,
  sceneToMusicSkill,
  // Video Editing
  videoEditingSkill,
  colorGradingSkill,
  audioMixingSkill,
  subtitleSkill,
  // Script Creation
  scriptGenerationSkill,
  scriptToTimelineSkill,
  // Multi-modal adaptation
  mediaToVideoSkill,
  comicToAnimationSkill,
  comicToStoryboardSkill,
  imageToShotSkill,
  storyboardToAnimationPlanSkill,
  animationPlanToCutSkill,
  generatedShotAssemblySkill,
  exportVideoPackageSkill,
  // Quality Assessment
  qualityAssessmentSkill,
];

export function getBuiltinSkills(options: BuiltinSkillOptions = {}): Skill[] {
  return [
    // IDC stage personas (Specify / Implement / Iteration)
    creationPersonaSkill,
    executionPersonaSkill,
    iterationPersonaSkill,
    // AI Generation
    aiGenerateSkill,
    sceneToMusicSkill,
    // Video Editing
    videoEditingSkill,
    colorGradingSkill,
    audioMixingSkill,
    subtitleSkill,
    // Script Creation
    scriptGenerationSkill,
    scriptToTimelineSkill,
    // Multi-modal adaptation
    getMediaToVideoSkill(options.locale),
    getComicToAnimationSkill(options.locale),
    getComicToStoryboardSkill(options.locale),
    getImageToShotSkill(options.locale),
    getStoryboardToAnimationPlanSkill(options.locale),
    getAnimationPlanToCutSkill(options.locale),
    getGeneratedShotAssemblySkill(options.locale),
    getExportVideoPackageSkill(options.locale),
    // Quality Assessment
    qualityAssessmentSkill,
  ];
}

/**
 * Register all builtin skills to a registry
 */
export function registerBuiltins(
  registry: ISkillRegistry,
  options: BuiltinSkillOptions = {},
): void {
  for (const skill of getBuiltinSkills(options)) {
    registry.registerSkill(skill);
  }
}
