/**
 * Builtin Skills - Creative Media Domain
 *
 * Ordinary builtin Skills are activated explicitly through $skill or Agent activation.
 */

import type { Skill } from '@neko/shared';
import { TOOL_NAMES_TIMELINE, TOOL_NAMES_MEDIA, TOOL_NAMES_SYSTEM } from '@neko/shared';
import { getScriptGenerationSkill, scriptGenerationSkill } from './script-generation';
import {
  getCanonicalCreativeMediaSkills,
  imageSkill,
  mediaProductionSkill,
  mediaQualityReviewSkill,
  storyboardSkill,
  videoSkill,
} from './creative-media';
import { creationPersonaSkill, getCreationPersonaSkill } from './creation-persona';
import { executionPersonaSkill, getExecutionPersonaSkill } from './execution-persona';
import { getIterationPersonaSkill, iterationPersonaSkill } from './iteration-persona';
import { getSkillCreatorSkill, skillCreatorSkill } from './skill-creator';
import type { BuiltinSkillOptions, LocalizedBuiltinSkillContent } from './builtin-skill-content';
import { localizeBuiltinSkill } from './builtin-skill-content';
import { localizeBuiltinSkillCatalogText } from './builtin-skill-locales';

export {
  normalizeBuiltinSkillLocale,
  selectBuiltinSkillContent,
  type BuiltinSkillLocale,
} from './builtin-skill-content';
export type { BuiltinSkillOptions, LocalizedBuiltinSkillContent };
export { getScriptGenerationSkill, scriptGenerationSkill } from './script-generation';
export {
  CREATIVE_MEDIA_PROFILES,
  CREATIVE_MEDIA_WORKFLOW_STAGES,
  getCanonicalCreativeMediaSkills,
  imageSkill,
  mediaProductionSkill,
  mediaQualityReviewSkill,
  storyboardSkill,
  videoSkill,
  type CreativeMediaProfileDescriptor,
  type CreativeMediaWorkflowStageDescriptor,
} from './creative-media';

// Creation stage persona skills (docs/architecture/agent-unified-workflow.md §4)
export { creationPersonaSkill, getCreationPersonaSkill } from './creation-persona';
export { executionPersonaSkill, getExecutionPersonaSkill } from './execution-persona';
export { getIterationPersonaSkill, iterationPersonaSkill } from './iteration-persona';
export { getSkillCreatorSkill, skillCreatorSkill } from './skill-creator';

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

## Boundary

Plan edits in timeline terms and delegate durable project mutation, revision creation, validation, and persistence to the owning Cut capability. Do not duplicate package-specific command sequences, payload schemas, or project internals in this Skill.

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
4. **Revision safety** - Treat accepted edits as a new project revision and recheck affected quality evidence

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
    referencedCapabilities: ['cut.timeline-authoring'],
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
 * Produces a reviewable conversion plan and delegates durable writes to the
 * owning story/cut authoring capability.
 */
export const scriptToTimelineSkill: Skill = {
  name: 'script-to-timeline',
  description:
    'Script to timeline conversion assistant. Use after the Agent has confirmed the user intends to convert a Fountain script or screenplay into a timeline/video project.',
  content: `# Script to Timeline Converter

You help users convert Fountain format screenplays into neko-cut timeline projects.

## Conversion Semantics

Use the owning story/cut authoring capability for durable conversion and project writes. Do not depend on an active editor, hidden Webview, or interactive UI flow as the source of truth.

### Fountain Format Reference

Fountain is a plain-text screenplay format:
- **Scene Heading**: Lines starting with INT. / EXT. / INT./EXT.
- **Character**: All-caps line before dialogue
- **Dialogue**: Lines after a character cue
- **Action**: Regular paragraphs
- **Parenthetical**: Lines in (parentheses) between character and dialogue
- **Transition**: Lines ending with TO: or starting with >

### Timeline Mapping

- Scene headings become scene markers or title/text rows.
- Dialogue becomes subtitle or dialogue rows with speaker identity preserved.
- Action paragraphs become timing and visual-intent notes.
- Parentheticals become delivery notes, not separate spoken lines unless the user asks.
- Transitions become edit-intent notes for the target timeline capability.

### Duration Estimation

| Element | Duration |
|---------|----------|
| Dialogue line | 1.5 seconds |
| Action paragraph | 2.0 seconds |
| Minimum scene | 3.0 seconds |

## Handoff Rules

- Return a reviewable conversion summary when no durable target capability is available.
- Do not output project-internal JSON unless a local capability explicitly requests that payload shape.
- Do not claim timeline creation succeeded until the story/cut authoring capability reports success.
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
// directly composing runtime generation and timeline authoring capabilities
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
    'Analyze timeline scenes and plan matching background music, then hand off to music generation and timeline authoring capabilities when available. ' +
    'Use after the Agent has confirmed the user intends to score a scene, add background music, or generate music for a timeline.',
  content: `# Scene-to-Music Assistant

Analyze the timeline and generate background music that matches the scene content and mood.

## Workflow

### Step 1: Analyze the scene
Use available timeline or scene context to infer:
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

### Step 3: Plan generation and placement
Use the runtime music generation capability only after the user intent and duration are clear. Use the runtime timeline authoring capability for durable placement when a target timeline exists.

The handoff should preserve:
- Music prompt
- Target duration
- Mood or genre hints
- Placement intent, such as background bed, transition sting, or scene score
- Any approval or diagnostic state

### Step 4: Confirm
Report what was planned, generated, or placed based on capability results. Do not claim a generated track or timeline placement exists until the relevant capability reports success.

## Notes
- Always match music duration to timeline length unless user specifies otherwise
- If timeline has no elements yet, ask the user to describe the scene mood instead of reading an empty timeline
- If generation fails, report the capability diagnostic and suggest the smallest recoverable next step
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

const localizedSceneToMusicContent: LocalizedBuiltinSkillContent = {
  default: sceneToMusicSkill.content,
  localized: {
    'zh-cn': `# 场景配乐助手

分析时间线，并生成与场景内容和情绪匹配的背景音乐。

## Workflow

### Step 1: Analyze the scene
使用可用的 timeline 或 scene context 推断：
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

### Step 3: Plan generation and placement
只有在用户意图和时长明确后，才使用运行时音乐生成 capability。存在目标时间线时，使用运行时时间线 authoring capability 做持久放置。

交接内容应保留：
- 音乐提示词
- 目标时长
- 情绪或 genre hints
- 放置意图，例如 background bed、transition sting 或 scene score
- 审批或 diagnostic 状态

### Step 4: Confirm
根据 capability 结果报告规划、生成或放置了什么。相关 capability 返回成功前，不要声称已生成音轨或已放入时间线。

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

## 边界

使用时间线语义规划剪辑，并把持久项目修改、修订创建、验证和保存交给 owning Cut capability。不要在本 Skill 中复制子包专属命令序列、payload schema 或项目内部结构。

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
4. **修订安全** - 已接受的剪辑应形成新项目修订，并重新检查受影响的质量证据

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

## 转换语义

持久转换和项目写入必须交给 owning story/cut authoring capability。不要依赖活动编辑器、隐藏 Webview 或 interactive UI flow 作为事实来源。

### Fountain Format Reference

Fountain 是纯文本剧本格式：
- **Scene Heading**: 以 INT. / EXT. / INT./EXT. 开头的行
- **Character**: 对白前的全大写角色行
- **Dialogue**: 角色提示后的台词行
- **Action**: 普通动作段落
- **Parenthetical**: 角色和对白之间的（括号）行
- **Transition**: 以 TO: 结尾或以 > 开头的行

### Timeline Mapping

- Scene heading 转为 scene marker 或标题/text row。
- Dialogue 转为 subtitle 或 dialogue row，并保留 speaker identity。
- Action 段落转为 timing 和 visual-intent notes。
- Parenthetical 转为表演提示；除非用户要求，不作为单独台词。
- Transition 转为目标 timeline capability 可使用的 edit-intent notes。

### Duration Estimation

| Element | Duration |
|---------|----------|
| Dialogue line | 1.5 seconds |
| Action paragraph | 2.0 seconds |
| Minimum scene | 3.0 seconds |

## 交接规则

- 没有持久目标 capability 时，返回可审阅的转换总结。
- 除非本地 capability 明确要求该 payload shape，不要输出项目内部 JSON。
- story/cut authoring capability 返回成功前，不要声称时间线已创建。
`,
  },
};

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

// Note: pipelineDiagnosticsSkill removed — pipeline introspection used to
// rely on GetPipelineReport / ListPipelineReports. Post-workflow/ deletion,
// the Agent diagnoses failures directly from tool-call error messages in
// its own conversation history.

/**
 * All builtin skills (semantic discovery)
 *
 * System guidance and creative media skills. Generic system operation skills
 * (file-operations, git, shell) remain excluded because they are host capabilities,
 * not reusable domain guidance.
 */
export const builtinSkills: Skill[] = [
  creationPersonaSkill,
  executionPersonaSkill,
  iterationPersonaSkill,
  skillCreatorSkill,
  storyboardSkill,
  imageSkill,
  videoSkill,
  mediaProductionSkill,
  mediaQualityReviewSkill,
  sceneToMusicSkill,
  videoEditingSkill,
  colorGradingSkill,
  audioMixingSkill,
  subtitleSkill,
  scriptGenerationSkill,
  scriptToTimelineSkill,
];

export function getBuiltinSkills(options: BuiltinSkillOptions = {}): Skill[] {
  const skills = [
    getCreationPersonaSkill(options.locale),
    getExecutionPersonaSkill(options.locale),
    getIterationPersonaSkill(options.locale),
    getSkillCreatorSkill(options.locale),
    ...getCanonicalCreativeMediaSkills(options.locale),
    getSceneToMusicSkill(options.locale),
    getVideoEditingSkill(options.locale),
    getColorGradingSkill(options.locale),
    getAudioMixingSkill(options.locale),
    getSubtitleSkill(options.locale),
    getScriptGenerationSkill(options.locale),
    getScriptToTimelineSkill(options.locale),
  ];
  return skills.map((skill) => localizeBuiltinSkillCatalogText(skill, options.locale));
}
