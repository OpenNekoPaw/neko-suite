/**
 * Builtin Skills - Creative Media Domain
 *
 * Skills with a `command` field are also registered as slash commands.
 */

import type { Skill } from '@neko/shared';
import { TOOL_NAMES_TIMELINE, TOOL_NAMES_MEDIA, TOOL_NAMES_SYSTEM } from '@neko/shared';
import { aiGenerateSkill, aiGenerateToolDefinitions } from './ai-generate';
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
import { comicToStoryboardSkill, getComicToStoryboardSkill } from './comic-to-storyboard';
import { getScriptGenerationSkill, scriptGenerationSkill } from './script-generation';
import { qualityAssessmentSkill } from './quality-assessment';
import { creationPersonaSkill, getCreationPersonaSkill } from './creation-persona';
import { executionPersonaSkill, getExecutionPersonaSkill } from './execution-persona';
import { getIterationPersonaSkill, iterationPersonaSkill } from './iteration-persona';
import type {
  BuiltinSkillLocale,
  BuiltinSkillOptions,
  LocalizedBuiltinSkillContent,
} from './builtin-skill-content';
import {
  localizeBuiltinSkill,
  normalizeBuiltinSkillLocale,
  selectBuiltinSkillContent,
} from './builtin-skill-content';
import { localizeBuiltinSkillCatalogText } from './builtin-skill-locales';

// Re-export ai-generate for external use
export { aiGenerateSkill, aiGenerateToolDefinitions };

// Re-export package-owned creative workflow skills
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
export { comicToStoryboardSkill, getComicToStoryboardSkill } from './comic-to-storyboard';
export {
  normalizeBuiltinSkillLocale,
  selectBuiltinSkillContent,
  type BuiltinSkillLocale,
  type BuiltinSkillOptions,
  type LocalizedBuiltinSkillContent,
} from './builtin-skill-content';
export { getScriptGenerationSkill, scriptGenerationSkill } from './script-generation';
export { qualityAssessmentSkill } from './quality-assessment';

// Creation stage persona skills (docs/architecture/agent-unified-workflow.md §4)
export { creationPersonaSkill, getCreationPersonaSkill } from './creation-persona';
export { executionPersonaSkill, getExecutionPersonaSkill } from './execution-persona';
export { getIterationPersonaSkill, iterationPersonaSkill } from './iteration-persona';

// =============================================================================
// Creative Skills (Semantic Discovery)
// =============================================================================

/**
 * Video Editing Assistant - Help with timeline operations
 *
 * Intended for explicit timeline editing requests.
 */
export const videoEditingSkill: Skill = {
  name: 'video-editing',
  description:
    'Video editing assistant for timeline operations. Use after the Agent has confirmed the user intends to edit a timeline, trim or split clips, merge clips, add transitions, or adjust timing.',
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
  domain: 'cut',
  mediaWorkflow: {
    useCases: [
      'Edit video timeline clips with cuts, trims, transitions, timing, and track operations',
      'Adjust an existing Cut timeline or video edit after the user requests timeline changes',
    ],
    nonGoals: [
      'Analyze video content without modifying or planning timeline edits',
      'Generate new media assets or storyboard artifacts',
    ],
    acceptedModalities: ['video', 'timeline'],
    inputArtifacts: ['timeline', 'video-clip'],
    producedArtifacts: ['timeline-edit-plan'],
    tags: ['video-editing', 'timeline', 'cut', 'transition'],
    operations: ['trim-video', 'split-clip', 'add-transition', 'edit-timeline'],
    costLevel: 'low',
    riskLevel: 'medium',
  },
};

/**
 * Color Grading Assistant - Help with color correction and grading
 *
 * Intended for explicit color correction or grading requests.
 */
export const colorGradingSkill: Skill = {
  name: 'color-grading',
  description:
    'Color grading and correction assistant. Use after the Agent has confirmed the user intends to adjust color, exposure, contrast, white balance, LUTs, saturation, or a cinematic/film look.',
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
  domain: 'cut',
  mediaWorkflow: {
    useCases: [
      'Color correct or grade timeline clips, shots, or video scenes',
      'Apply LUT, exposure, contrast, white balance, saturation, or cinematic look adjustments',
    ],
    nonGoals: [
      'Describe visual style without applying or planning color adjustments',
      'Generate replacement media assets',
    ],
    acceptedModalities: ['video', 'image', 'timeline'],
    inputArtifacts: ['timeline', 'video-clip', 'image'],
    producedArtifacts: ['color-correction-plan'],
    tags: ['color', 'grading', 'correction', 'lut'],
    operations: ['color-grade', 'color-correct', 'apply-lut', 'adjust-exposure'],
    costLevel: 'low',
    riskLevel: 'medium',
  },
};

/**
 * Audio Mixing Assistant - Help with audio levels and effects
 *
 * Intended for explicit audio mixing and sound design requests.
 */
export const audioMixingSkill: Skill = {
  name: 'audio-mixing',
  description:
    'Audio mixing and sound design assistant. Use after the Agent has confirmed the user intends to mix audio, adjust levels, add or balance music, normalize sound, fade audio, or apply ducking.',
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
  domain: 'audio',
  mediaWorkflow: {
    useCases: [
      'Mix audio levels, music beds, dialogue, voiceover, or sound effects on a timeline',
      'Normalize, duck, fade, separate, or adjust audio clips for a video project',
    ],
    nonGoals: [
      'Generate new music or voice audio without timeline mixing',
      'Transcribe or summarize audio content only',
    ],
    acceptedModalities: ['audio', 'timeline', 'video'],
    inputArtifacts: ['audio-clip', 'timeline', 'voiceover'],
    producedArtifacts: ['audio-mix-plan'],
    tags: ['audio', 'mixing', 'sound-design', 'timeline'],
    operations: ['mix-audio', 'normalize-audio', 'duck-music', 'fade-audio'],
    costLevel: 'low',
    riskLevel: 'medium',
  },
};

/**
 * Subtitle Assistant - Help with captioning and subtitles
 *
 * Intended for explicit subtitle, caption, transcription, or translation requests.
 */
export const subtitleSkill: Skill = {
  name: 'subtitle-assistant',
  description:
    'Subtitle and captioning assistant. Use after the Agent has confirmed the user intends to create, edit, time, translate, import, or export subtitles/captions such as SRT or VTT.',
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
  domain: 'media',
  mediaWorkflow: {
    useCases: [
      'Create, edit, translate, or time subtitles and captions for video',
      'Import, export, or repair SRT/VTT subtitle timing and text',
    ],
    nonGoals: [
      'Summarize a transcript without creating subtitle artifacts',
      'Generate new video or audio media',
    ],
    acceptedModalities: ['video', 'audio', 'text', 'timeline'],
    inputArtifacts: ['transcript', 'timeline', 'video-clip', 'srt', 'vtt'],
    producedArtifacts: ['subtitle-track', 'srt', 'vtt'],
    tags: ['subtitle', 'caption', 'transcription', 'accessibility'],
    operations: ['create-subtitles', 'time-captions', 'translate-subtitles', 'edit-srt'],
    costLevel: 'low',
    riskLevel: 'low',
  },
};

/**
 * Script to Timeline Assistant - Convert Fountain scripts to neko-cut projects
 *
 * Intended for explicit script-to-timeline conversion requests.
 *
 * Leverages neko-story's TimelineConverter format:
 *   Track 0 (text):     one TextElement per scene heading
 *   Track 1 (subtitle): one SubtitleElement per dialogue line
 */
export const scriptToTimelineSkill: Skill = {
  name: 'script-to-timeline',
  description:
    'Script to timeline conversion assistant. Use after the Agent has confirmed the user intends to convert a Fountain script or screenplay into a timeline/video project.',
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
  domain: 'story',
  mediaWorkflow: {
    useCases: [
      'Convert Fountain scripts or screenplays into Cut timeline project structure',
      'Import screenplay scenes and dialogue as timeline text and subtitle tracks',
    ],
    nonGoals: ['Write or rewrite the screenplay itself', 'Generate media assets from script text'],
    acceptedModalities: ['text', 'script', 'fountain'],
    inputArtifacts: ['FountainScript', 'screenplay'],
    producedArtifacts: ['CutTimelinePayload', 'neko-project'],
    tags: ['script', 'fountain', 'timeline', 'neko-cut'],
    operations: ['script-to-timeline', 'import-fountain', 'create-timeline-project'],
    costLevel: 'low',
    riskLevel: 'medium',
  },
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
 * Intended for explicit scene scoring or background music requests.
 */
export const sceneToMusicSkill: Skill = {
  name: 'scene-to-music',
  description:
    'Analyze timeline scenes and generate matching background music with GenerateMusic, then insert it as an audio track. ' +
    'Use after the Agent has confirmed the user intends to score a scene, add background music, or generate music for a timeline.',
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
  domain: 'audio',
  mediaWorkflow: {
    useCases: [
      'Analyze timeline scenes and generate matching background music',
      'Create and insert a music track that matches a scene mood, duration, or style hint',
    ],
    nonGoals: [
      'Mix existing audio without generating music',
      'Describe scene mood without creating or inserting a music asset',
    ],
    acceptedModalities: ['timeline', 'video', 'text'],
    inputArtifacts: ['timeline', 'scene-description'],
    producedArtifacts: ['generated-media-ref', 'audio-track'],
    tags: ['music', 'score', 'background-music', 'timeline'],
    operations: ['scene-to-music', 'generate-music', 'insert-audio-track'],
    costLevel: 'medium',
    riskLevel: 'medium',
  },
};

const localizedAiGenerateContent: LocalizedBuiltinSkillContent = {
  default: aiGenerateSkill.content,
  localized: {
    'zh-cn': `# AI 媒体生成

你现在可以使用 AI 媒体生成工具。

## 核心原则

1. **立即生成** - 使用默认参数并直接调用工具
2. **使用工具调用** - 不要在回复中直接嵌入 URL
3. **不要先追问** - 除非用户明确说想先讨论细节，否则用合理默认值生成

## 快速参考

| 请求类型 | 工具 | 关键参数 |
|----------|------|----------|
| 绘制/生成图片 | \`generate_image\` | prompt 或 taskRef、size、style |
| 生成视频 | \`generate_video\` | prompt 或 taskRef、duration、resolution |
| 旁白/TTS | \`generate_tts\` | text、voice、language |
| 背景音乐 | \`generate_music\` | prompt、duration、genre |
| 角色一致性 | \`generate_character\` | prompt、referenceImageUrl |
| 音频/视频转写 | \`transcribe_audio\` | audioSource、model |
| 风格迁移 | \`transfer_style\` | sourceImageUrl、stylePrompt |
| 视频超分/增强 | \`enhance_video\` | videoUrl、targetResolution |
| 音频清理 | \`optimize_audio\` | audioUrl、denoise |

## 决策流程

~~~
User Request → Identify Type → Select Tool → Confirm Params → Generate
~~~

## 默认参数

| 工具 | 默认值 |
|------|--------|
| generate_image | size: 1024x1024, style: vivid, n: 1 |
| generate_video | duration: 4s, resolution: 720p, fps: 24 |
| generate_tts | speed: 1.0 |
| generate_music | duration: 30s |


## 生成意图来源

默认使用自然语言 \`prompt\` 作为输入。当已有 Plan/Task markdown 文档时，传入
\`taskRef\` 或 \`planRef\`，让运行时把该 markdown 作为结构化意图锚点。
structured intent 来自 markdown 或 prompt metadata。

默认策略：
- prompt only → native provider prompt
- taskRef / planRef → 从 markdown 提取 generation intent，同时保留文档作为 structured anchor
- providerAdaptationMode: auto/agentic → 可用时依赖 AGENT provider expression context
- providerAdaptationMode: native → 绕过 provider expression guidance，直接传递 prompt

## 图像生成技巧

### 提示词结构
[Subject] + [Style] + [Details] + [Atmosphere] + [Technical]

### 尺寸选择
- Social media cover: 1792x1024 (16:9)
- Square avatar: 1024x1024 (1:1)
- Phone wallpaper: 1024x1792 (9:16)

### 风格关键词
- Art styles: oil painting, watercolor, digital art, anime style, pixel art
- Lighting: golden hour, soft lighting, dramatic lighting, neon lights
- Technical: 4k, highly detailed, sharp focus, bokeh

## 视频生成技巧

### 包含镜头指令
- \`static shot\` - 固定机位
- \`slow pan\` - 缓慢横移
- \`zoom in/out\` - 推近/拉远
- \`tracking shot\` - 跟随主体

### 时长建议
- Logo animation: 2-4s
- Product showcase: 5-8s
- Background loop: 8-15s

## 音频生成技巧

### TTS 声音选项
- \`alloy\` - 中性、专业（旁白、教程）
- \`echo\` - 温暖、友好（故事、对白）
- \`onyx\` - 深沉、权威（纪录片）
- \`nova\` - 年轻、有活力（社交媒体）

### 音乐类型与情绪
- Corporate: upbeat, inspiring
- Ambient: calm, peaceful
- Cinematic: dramatic, epic
- Lofi: calm, relaxing
`,
  },
};

const localizedSceneToMusicContent: LocalizedBuiltinSkillContent = {
  default: sceneToMusicSkill.content,
  localized: {
    'zh-cn': `# 场景配乐助手

分析时间线，并生成与场景内容和情绪匹配的背景音乐。

## Workflow

### Step 1: Analyze the timeline
调用 GetTimelineInfo 获取总时长和时间线结构。
调用 ListTimelineElements 理解场景中有哪些元素（视频片段、字幕、效果）。
根据元素推断：
- 整体情绪（action、peaceful、dramatic、uplifting、mysterious 等）
- 类型提示（如果画面风格中有明确线索）
- 需要匹配的时长

### Step 2: Build a music prompt
根据场景分析组合一个简洁的音乐提示词。
示例：
- "Cinematic orchestral score, uplifting and adventurous, building tension"
- "Ambient electronic background, calm and focused, minimal percussion"
- "Upbeat acoustic guitar, warm and cheerful, light rhythm"

如果用户给了明确偏好（genre、mood、style），优先遵循。

### Step 3: Generate the music
调用 GenerateMusic：
- prompt: 组合出的提示词
- duration: 时间线总时长（秒，最多 300）
- genre 和 mood 如果能明确推断则填写

GenerateMusic 是异步工具，会返回 taskId。轮询 task_output，直到 status 为 'complete'。
完成后，task_output 在 result 字段中返回 { url: string }。

### Step 4: Insert the music track
先检查是否已有 music/audio track。没有则调用 AddTrack，type 为 'audio'。
然后调用 AddTimelineElement：
- type: 'audio'
- source: task_output 返回的 URL
- trackId: 音乐轨道 id
- startTime: 0
- duration: 匹配生成片段时长（或时间线时长）

### Step 5: Confirm
向用户报告生成了什么音乐（使用的 prompt、时长）以及放置位置。

## Notes
- 除非用户另有说明，总是让音乐时长匹配时间线长度
- 如果时间线还没有元素，请让用户描述场景情绪，而不是读取空时间线
- 如果生成失败，报告错误并建议用户检查音乐 provider 配置
`,
  },
};

const localizedVideoEditingContent: LocalizedBuiltinSkillContent = {
  default: videoEditingSkill.content,
  localized: {
    'zh-cn': `# 视频剪辑助手

你是专业视频剪辑师。帮助用户完成基于时间线的剪辑任务。

## Core Operations

| Task | Description |
|------|-------------|
| Cut/Split | 在指定位置切开片段 |
| Trim | 移除开头/结尾部分 |
| Transition | 在片段之间添加效果 |
| Reorder | 在时间线上移动片段 |
| Speed | 调整播放速度 |

## Best Practices

1. **保留质量** - 尽可能使用原始分辨率
2. **平滑转场** - 大多数转场使用 0.5-1s
3. **音频同步** - 每次剪切后检查音频对齐
4. **经常保存** - 建议设置自动保存间隔

## Common Workflows

### Basic Cut Editing
1. 导入媒体到时间线
2. 设置入点/出点
3. 在播放头位置应用切分
4. 移除不需要的段落
5. 需要时添加转场

### J-Cut / L-Cut
- J-Cut: 音频先于视频开始
- L-Cut: 视频切走后音频继续
- 用于平滑对白场景

### Montage
- 快速切换（每段 0.5-2s）
- 匹配动作或音乐节拍
- 建立能量和节奏
`,
  },
};

const localizedColorGradingContent: LocalizedBuiltinSkillContent = {
  default: colorGradingSkill.content,
  localized: {
    'zh-cn': `# 调色助手

你是专业调色师。帮助用户实现目标视觉风格。

## Color Correction vs Grading

| Correction | Grading |
|------------|---------|
| 修正曝光 | 创造情绪 |
| 平衡白点 | 应用风格 |
| 匹配镜头 | 电影感外观 |

## Key Parameters

### Primary Correction
- **Exposure**: 整体亮度（-3 到 +3 stops）
- **Contrast**: 明暗范围（压平或增强）
- **Temperature**: 暖（orange）↔ 冷（blue）
- **Tint**: Green ↔ Magenta

### Secondary Adjustments
- **Highlights/Shadows**: 选择性亮度
- **Saturation/Vibrance**: 色彩强度
- **HSL**: 定向调整特定颜色

## Popular Looks

### Cinematic Teal & Orange
- 阴影推向 teal
- 肤色推向 orange
- 轻微抬黑
- 细微暗角

### Film Emulation
- 抬黑（crushed shadows）
- 降低高光 rolloff
- 细微颗粒
- 降低饱和度

### High Key / Low Key
- High key: 明亮、阴影少
- Low key: 暗、戏剧化阴影
`,
  },
};

const localizedAudioMixingContent: LocalizedBuiltinSkillContent = {
  default: audioMixingSkill.content,
  localized: {
    'zh-cn': `# 音频混音助手

你是专业混音师。帮助用户获得平衡、清晰的音频。

## Level Guidelines

| Element | Target Level |
|---------|--------------|
| Dialogue | -12 到 -6 dB |
| Music (background) | -18 到 -24 dB |
| Music (featured) | -12 到 -6 dB |
| SFX | 根据上下文变化 |

## Common Techniques

### Ducking
对白出现时自动压低音乐：
- Threshold: -20 dB
- Reduction: -8 到 -12 dB
- Attack: Fast (10-50ms)
- Release: Medium (100-300ms)

### Dialogue Clarity
1. 80-100 Hz 高通滤波
2. 轻压缩（2:1，-10dB threshold）
3. 需要时 de-ess（4-8 kHz）
4. 在 2-4 kHz 细微 EQ 提升

### Music Bed
1. 选择互补的 genre/mood
2. 初始音量设为 -18 dB
3. 为对白应用 ducking
4. 场景变化处淡入/淡出

## Mastering Tips

- 流媒体目标 -14 LUFS
- 保留 -1 dB headroom
- 在多个扬声器上检查
- 与 reference tracks 做 A/B 对比
`,
  },
};

const localizedSubtitleContent: LocalizedBuiltinSkillContent = {
  default: subtitleSkill.content,
  localized: {
    'zh-cn': `# 字幕助手

你是专业字幕师。帮助用户创建可访问、时序准确的字幕。

## Subtitle Standards

| Platform | Max Length | Duration |
|----------|------------|----------|
| YouTube | 42 chars/line | 1-7 sec |
| Netflix | 42 chars/line | 1-6 sec |
| Broadcast | 37 chars/line | 1-6 sec |

## Best Practices

### Timing
- 最短时长：1 秒
- 最长时长：7 秒
- 阅读速度：20-25 chars/sec
- 与自然停顿同步

### Line Breaking
- 在自然停顿处断行
- 保持短语完整
- 每条字幕最多 2 行
- 平衡行长

### Styling
- 白色文字、黑色描边
- Sans-serif font（Arial、Helvetica）
- Size: 屏幕高度的 5-7%
- Position: 底部居中（safe area）

## Translation Tips

1. **上下文重要** - 先理解场景
2. **文化适配** - 本地化 idioms
3. **长度限制** - 可能需要压缩
4. **阅读时间** - 考虑目标语言
`,
  },
};

const localizedScriptToTimelineContent: LocalizedBuiltinSkillContent = {
  default: scriptToTimelineSkill.content,
  localized: {
    'zh-cn': `# 剧本转时间线转换器

你帮助用户把 Fountain format screenplays 转换为 neko-cut timeline projects。

## Quick Method

在当前激活的 .fountain 文件上运行内置 VSCode 命令：
\`\`\`
neko.story.toTimeline
\`\`\`
它会针对当前 .fountain 文件打开 QuickPick preview 和 SaveDialog。

## Manual Method

如果用户需要程序化或定制转换，读取 .fountain 文件，并按下面格式创建 .neko project JSON。

### Fountain Format Reference

Fountain 是纯文本剧本格式：
- **Scene Heading**: 以 INT. / EXT. / INT./EXT. 开头的行
- **Character**: 对白前的全大写角色行
- **Dialogue**: 角色提示后的台词行
- **Action**: 普通动作段落
- **Parenthetical**: 角色和对白之间的（括号）行
- **Transition**: 以 TO: 结尾或以 > 开头的行

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
  },
};

const localizedQualityAssessmentContent: LocalizedBuiltinSkillContent = {
  default: qualityAssessmentSkill.content,
  localized: {
    'zh-cn': `# 媒体质量检查助手

你帮助用户评估 AI 生成媒体的质量，并在获得批准后修复检测到的问题。

## Workflow

### Step 1: Evaluate Media
调用 **QualityCheck** 检查要评估的 scenes。

Parameters:
- \`scenes\`: Array of \`{ index, mediaPath, prompt, description? }\`
- \`minScore\`: 最低通过分数（默认 60，范围 0-100）
- \`maxRetries\`: read-only QualityCheck 会忽略。重试/再生成使用 QualityRepairCheck。
- \`style\`: 全局风格上下文（例如 "anime"、"cinematic"）
- \`sceneDialogue\`: 用于剧本一致性检查的对白行

Example:
\`\`\`json
{
  "scenes": [
    { "index": 0, "mediaPath": "generated-assets/scene-0.png", "prompt": "A sunset over mountains" }
  ],
  "minScore": 70,
  "style": "cinematic"
}
\`\`\`

### Step 2: Interpret Results
工具返回结构化评估结果：

- **overallScore** (0-100): 综合质量分
- **dimensions**: 各维度拆解
  - \`technicalQuality\`: 清晰度、锐度、伪影
  - \`promptAdherence\`: 与提示词匹配程度
  - \`aesthetics\`: 视觉观感、构图
  - \`audioQuality\`: 仅音频 — loudness、clipping、noise
- **issues[]**: 检测出的结构化问题
  - 每项包含 \`category\`、\`severity\` (critical/major/minor/info)、\`description\`
- **remediations[]**: 带工具名和参数的修复建议

### Step 3: Apply Fixes
QualityCheck 是只读证据。根据 remediations，在修改媒体或时间线状态前请求批准，
或使用已批准的 repair path：

| Remediation Type | Tool | Example |
|------------------|------|---------|
| \`apply-effect\` | **AddEffect** | Denoise filter: \`{ effectType: "denoise", strength: 0.7 }\` |
| \`color-correct\` | **SetColorCorrection** | Auto correct: \`{ autoCorrect: true }\` |
| \`adjust-audio\` | **SetAudioProperties** | Normalize: \`{ normalize: true, targetLufs: -14 }\` |
| \`regenerate\` | **GenerateImage** / **GenerateVideo** | 用改进提示词重新生成 |
| \`regenerate-ref\` | **GenerateImage** | 带 IP-Adapter reference 重新生成 |
| \`manual-review\` | — | 标记为用户复核，不自动修复 |

再生成修复尝试只能在明确批准或 policy opt-in 后使用 **QualityRepairCheck**。
它可能重新生成失败的 image/video scenes，并把这些输出报告为 repair attempts。

### Step 4: Report
用清晰表格总结结果：
- 总 scenes 数、通过/失败数量
- 每个 scene 的分数、主要问题和已应用修复
- 总体建议（approve / fix specific scenes / regenerate all）

## Issue Categories

**Technical**（确定性检测）：
- \`artifact\`: 视觉噪声、模糊、扭曲、畸形
- \`resolution\`: 细节或锐度不足
- \`color-distortion\`: 颜色不自然、白平衡问题
- \`audio-noise\`: 音频背景噪声
- \`audio-clipping\`: 音频峰值超过安全范围
- \`loudness-off\`: 响度超出播出范围（-16 到 -12 LUFS）

**Semantic**（LLM 判断）：
- \`prompt-mismatch\`: 生成内容不匹配提示词
- \`script-mismatch\`: 不匹配场景描述或对白
- \`style-drift\`: 与指定全局风格不一致
- \`character-inconsistency\`: 角色外观与参考不一致
- \`composition-poor\`: 构图、平衡或视觉流动差
- \`motion-unnatural\`: 视频运动不自然

## Important
- 只在用户明确请求时评估 — 每次 **image** 评估都会消耗一次 vision LLM call
- **Audio evaluation is free** — 使用 Engine 技术指标（LUFS、true peak、silence），不调用 LLM
- QualityCheck 永不重新生成媒体；失败 scenes 仍作为 Agent rationale 的证据
- 音频 scenes 永不 retry — 批准后通过 ToolSet tools 确定性修复
- 不要把 .neko/.cache、Webview URI、blob URL 或 scratch paths 作为媒体身份；使用 stable generated asset refs、source refs 或 host-resolved media refs。
- 展示具体 scores、issue categories 和具体 remediation steps — 不要含糊
`,
  },
};

export function getAiGenerateSkill(locale?: string): Skill {
  return localizeBuiltinSkill(aiGenerateSkill, localizedAiGenerateContent, locale);
}

export function getSceneToMusicSkill(locale?: string): Skill {
  return localizeBuiltinSkill(sceneToMusicSkill, localizedSceneToMusicContent, locale);
}

export function getVideoEditingSkill(locale?: string): Skill {
  return localizeBuiltinSkill(videoEditingSkill, localizedVideoEditingContent, locale);
}

export function getColorGradingSkill(locale?: string): Skill {
  return localizeBuiltinSkill(colorGradingSkill, localizedColorGradingContent, locale);
}

export function getAudioMixingSkill(locale?: string): Skill {
  return localizeBuiltinSkill(audioMixingSkill, localizedAudioMixingContent, locale);
}

export function getSubtitleSkill(locale?: string): Skill {
  return localizeBuiltinSkill(subtitleSkill, localizedSubtitleContent, locale);
}

export function getScriptToTimelineSkill(locale?: string): Skill {
  return localizeBuiltinSkill(scriptToTimelineSkill, localizedScriptToTimelineContent, locale);
}

export function getQualityAssessmentSkill(locale?: string): Skill {
  return localizeBuiltinSkill(
    qualityAssessmentSkill,
    localizedQualityAssessmentContent,
    locale,
  );
}

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
  // Creation stage personas (Specify / Implement / Iteration)
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
  const skills = [
    // Creation stage personas (Specify / Implement / Iteration)
    getCreationPersonaSkill(options.locale),
    getExecutionPersonaSkill(options.locale),
    getIterationPersonaSkill(options.locale),
    // AI Generation
    getAiGenerateSkill(options.locale),
    getSceneToMusicSkill(options.locale),
    // Video Editing
    getVideoEditingSkill(options.locale),
    getColorGradingSkill(options.locale),
    getAudioMixingSkill(options.locale),
    getSubtitleSkill(options.locale),
    // Script Creation
    getScriptGenerationSkill(options.locale),
    getScriptToTimelineSkill(options.locale),
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
    getQualityAssessmentSkill(options.locale),
  ];
  return skills.map((skill) => localizeBuiltinSkillCatalogText(skill, options.locale));
}
