/**
 * AI Generate Skill - Builtin skill for AI media generation
 *
 * Provides image, video, audio, and music generation capabilities.
 * Intended for explicit AI media generation requests.
 */

import type { Skill, SkillToolDefinition } from '@neko/shared';
import { TOOL_NAMES_MEDIA, TOOL_NAMES_TRANSCRIBE, TOOL_NAMES_SYSTEM } from '@neko/shared';

/**
 * Tool definitions for AI generation
 */
export const aiGenerateToolDefinitions: SkillToolDefinition[] = [
  {
    name: TOOL_NAMES_MEDIA.GENERATE_IMAGE,
    description: 'Generate an image using AI. Prefer prompt or taskRef/planRef markdown.',
    parameters: {
      prompt: {
        type: 'string',
        required: false,
        description: 'Natural language generation prompt; default user-facing input',
      },
      negativePrompt: {
        type: 'string',
        required: false,
        description: 'Optional negative prompt describing what to avoid.',
      },
      taskRef: {
        type: 'string',
        required: false,
        description: 'Optional task markdown URI/path used as the generation intent source.',
      },
      planRef: {
        type: 'string',
        required: false,
        description: 'Optional plan markdown URI/path used as the generation intent source.',
      },
      providerAdaptationMode: {
        type: 'string',
        enum: ['auto', 'agentic', 'native'],
        required: false,
        description:
          'Provider expression adaptation mode. Use native to bypass provider expression guidance and pass the prompt through.',
      },
      providerId: {
        type: 'string',
        required: false,
        description: 'Optional explicit provider id. Usually omit and let ProviderRouter choose.',
      },
      modelId: {
        type: 'string',
        required: false,
        description: 'Optional explicit model id. Usually omit and let media routing choose.',
      },
      size: {
        type: 'string',
        enum: ['256x256', '512x512', '1024x1024', '1792x1024', '1024x1792'],
        default: '1024x1024',
        description: 'Image dimensions',
      },
      quality: {
        type: 'string',
        enum: ['standard', 'hd'],
        default: 'standard',
        description: 'Image quality',
      },
      style: {
        type: 'string',
        enum: ['natural', 'vivid'],
        default: 'vivid',
        description: 'Image style',
      },
      referenceImageUri: {
        type: 'string',
        required: false,
        description: 'Optional host-resolved reference image URI/path.',
      },
      maskUri: {
        type: 'string',
        required: false,
        description: 'Optional host-resolved inpaint mask URI/path.',
      },
      controlImageUri: {
        type: 'string',
        required: false,
        description: 'Optional host-resolved ControlNet image URI/path.',
      },
      editInstruction: {
        type: 'string',
        required: false,
        description: 'Optional natural language edit instruction for edit-capable image providers.',
      },
      n: {
        type: 'number',
        min: 1,
        max: 4,
        default: 1,
        description: 'Number of images to generate',
      },
    },
  },
  {
    name: TOOL_NAMES_MEDIA.TRANSFORM_IMAGE,
    description:
      'Transform an existing image using source-bound AI editing. Requires editInstruction or prompt plus a host-resolved sourceImageUri/referenceImageUri/referenceImageBase64.',
    parameters: {
      prompt: {
        type: 'string',
        required: false,
        description:
          'Optional transform prompt; editInstruction is preferred for source-bound edits.',
      },
      editInstruction: {
        type: 'string',
        required: false,
        description: 'Natural language edit instruction for the source image.',
      },
      sourceImageUri: {
        type: 'string',
        required: false,
        description: 'Host-resolved source image URI/path.',
      },
      referenceImageUri: {
        type: 'string',
        required: false,
        description: 'Host-resolved reference image URI/path.',
      },
      maskUri: {
        type: 'string',
        required: false,
        description: 'Optional host-resolved inpaint mask URI/path.',
      },
      targetAspectRatio: {
        type: 'string',
        required: false,
        description: 'Optional target aspect ratio such as 16:9 or 9:16.',
      },
      targetStyle: {
        type: 'string',
        required: false,
        description: 'Optional target style for style normalization.',
      },
      providerId: {
        type: 'string',
        required: false,
        description: 'Optional explicit provider id. Usually omit and let ProviderRouter choose.',
      },
      modelId: {
        type: 'string',
        required: false,
        description: 'Optional explicit model id. Usually omit and let media routing choose.',
      },
    },
  },
  {
    name: TOOL_NAMES_MEDIA.GENERATE_VIDEO,
    description: 'Generate a video using AI. Prefer prompt or taskRef/planRef markdown.',
    parameters: {
      prompt: {
        type: 'string',
        required: false,
        description: 'Natural language generation prompt; default user-facing input',
      },
      taskRef: {
        type: 'string',
        required: false,
        description: 'Optional task markdown URI/path used as the generation intent source.',
      },
      planRef: {
        type: 'string',
        required: false,
        description: 'Optional plan markdown URI/path used as the generation intent source.',
      },
      providerAdaptationMode: {
        type: 'string',
        enum: ['auto', 'agentic', 'native'],
        required: false,
        description:
          'Provider expression adaptation mode. Use native to bypass provider expression guidance and pass the prompt through.',
      },
      providerId: {
        type: 'string',
        required: false,
        description: 'Optional explicit provider id. Usually omit and let ProviderRouter choose.',
      },
      modelId: {
        type: 'string',
        required: false,
        description: 'Optional explicit model id. Usually omit and let media routing choose.',
      },
      duration: {
        type: 'number',
        min: 1,
        max: 30,
        default: 4,
        description: 'Video duration in seconds',
      },
      resolution: {
        type: 'string',
        enum: ['480p', '720p', '1080p'],
        default: '720p',
        description: 'Video resolution',
      },
      fps: { type: 'number', enum: [24, 30, 60], default: 24, description: 'Frames per second' },
    },
  },
  {
    name: 'GenerateTTS',
    description: 'Generate speech audio from text using text-to-speech AI',
    parameters: {
      text: { type: 'string', required: true, description: 'Text to convert to speech' },
      voice: { type: 'string', description: 'Voice ID or name to use' },
      language: { type: 'string', description: 'Language code (e.g., en, zh, ja)' },
      speed: {
        type: 'number',
        min: 0.5,
        max: 2,
        default: 1,
        description: 'Speech speed multiplier',
      },
    },
  },
  {
    name: 'GenerateMusic',
    description: 'Generate background music from a text prompt using AI',
    parameters: {
      prompt: {
        type: 'string',
        required: true,
        description: 'Description of the music to generate',
      },
      duration: {
        type: 'number',
        min: 5,
        max: 300,
        default: 30,
        description: 'Music duration in seconds',
      },
      genre: { type: 'string', description: 'Music genre (e.g., corporate, ambient, electronic)' },
      mood: { type: 'string', description: 'Music mood (e.g., upbeat, calm, dramatic)' },
    },
  },
  {
    name: 'GenerateCharacter',
    description: 'Generate a character image with optional reference for consistency',
    parameters: {
      prompt: {
        type: 'string',
        required: true,
        description: 'Description of the character to generate',
      },
      referenceImageUrl: {
        type: 'string',
        description: 'URL of reference image for character consistency',
      },
      style: { type: 'string', description: 'Art style (e.g., realistic, anime, cartoon, 3d)' },
      pose: { type: 'string', description: 'Character pose (e.g., standing, sitting, action)' },
      expression: { type: 'string', description: 'Facial expression (e.g., happy, sad, neutral)' },
    },
  },
  {
    name: 'TransferStyle',
    description: 'Apply artistic style transfer to an image',
    parameters: {
      sourceImageUrl: {
        type: 'string',
        required: true,
        description: 'URL of the source image to style',
      },
      stylePrompt: {
        type: 'string',
        required: true,
        description: 'Description of the style to apply',
      },
      styleStrength: {
        type: 'number',
        min: 0,
        max: 1,
        default: 0.7,
        description: 'Strength of style application',
      },
    },
  },
  {
    name: 'EnhanceVideo',
    description: 'Enhance video quality with upscaling, denoising, and stabilization',
    parameters: {
      videoUrl: { type: 'string', required: true, description: 'URL of the video to enhance' },
      targetResolution: {
        type: 'string',
        enum: ['720p', '1080p', '4k'],
        description: 'Target resolution for upscaling',
      },
      denoise: { type: 'boolean', default: true, description: 'Apply noise reduction' },
      stabilize: { type: 'boolean', default: false, description: 'Apply video stabilization' },
      interpolateFps: {
        type: 'number',
        enum: [30, 60, 120],
        description: 'Interpolate to target frame rate',
      },
    },
  },
  {
    name: 'OptimizeAudio',
    description: 'Optimize audio quality with denoising, normalization, and voice enhancement',
    parameters: {
      audioUrl: { type: 'string', required: true, description: 'URL of the audio to optimize' },
      denoise: { type: 'boolean', default: true, description: 'Apply noise reduction' },
      normalize: { type: 'boolean', default: true, description: 'Normalize audio levels' },
      enhanceVoice: { type: 'boolean', default: false, description: 'Enhance voice clarity' },
      removeBackground: {
        type: 'boolean',
        default: false,
        description: 'Remove background noise/music',
      },
    },
  },
  {
    name: 'TranscribeAudio',
    description:
      'Transcribe audio/video to text with timestamps using Whisper. Returns segments with start/end times for subtitle or caption authoring.',
    parameters: {
      audioSource: {
        type: 'string',
        required: true,
        description: 'Absolute path to the audio or video file',
      },
      model: {
        type: 'string',
        default: 'whisper-base',
        description: 'Whisper model name registered in the engine',
      },
    },
  },
];

/**
 * AI Generate skill content
 */
const aiGenerateContent = `# AI Media Generation

You help users turn creative intent into AI media generation requests through the runtime media generation capabilities.

## Core Principles

1. **Act on explicit generation intent** - Generate or plan generation when the user asks for image, video, voice, music, enhancement, transcription, or style transfer output.
2. **Keep output grounded** - Never invent generated URLs, asset ids, or completion state. Start media generation by submitting the appropriate runtime media capability, then report success only from confirmed runtime capability results; before success is confirmed, describe only planned, submitted, pending, blocked, or failed state.
3. **Use sensible defaults** - Do not ask for clarification unless missing information would materially change the creative result, budget, safety, or target format.
4. **Preserve prompt language** - Keep the user-facing creative wording in the user's current language unless the user asks for another language or a provider capability explicitly requires it.

## Capability Intent Reference

| Request type | Generation intent |
|--------------|-------------------|
| Draw or generate image | Image prompt with subject, composition, style, lighting, and reference constraints |
| Generate video | Scene-level video prompt with subject, action beats, camera movement, duration, audio/dialogue, and constraints |
| Voiceover or speech | Spoken text, speaker traits, emotion, language, pacing, and delivery notes |
| Background music | Mood, genre, instrumentation, tempo, duration, and placement intent |
| Character consistency | Character appearance, reference role, pose/action, style, and consistency constraints |
| Transcription | Source media, timestamp expectation, language, and formatting goal |
| Style transfer | Source media role, target style, preservation constraints, and acceptable changes |
| Video enhancement | Source media, desired quality improvement, preservation constraints, and delivery goal |
| Audio cleanup | Source media, noise/loudness issue, preservation constraints, and delivery goal |

## Decision Flow

~~~
User request -> Identify media intent -> Build generation intent -> Use runtime capability -> Report capability result
~~~

## Runtime Parameters

Concrete operation names, parameter names, provider defaults, task polling, and returned asset schemas belong to runtime capability descriptions and runtime schemas. This skill owns creative intent shaping only.

Use natural-language prompt content as the default creative intent. When a reviewed Plan/Task/Markdown document exists, treat it as a structured intent anchor if the runtime capability supports document-backed generation.

## Image Generation Tips

### Prompt Structure
[Subject] + [Style] + [Details] + [Atmosphere] + [Technical]

### Size Selection
- Social media cover: 1792x1024 (16:9)
- Square avatar: 1024x1024 (1:1)
- Phone wallpaper: 1024x1792 (9:16)

### Style Keywords
- Art styles: oil painting, watercolor, digital art, anime style, pixel art
- Lighting: golden hour, soft lighting, dramatic lighting, neon lights
- Technical: 4k, highly detailed, sharp focus, bokeh

## Video Generation Tips

### Include Camera Direction
- \`static shot\` - Fixed camera
- \`slow pan\` - Slow horizontal move
- \`zoom in/out\` - Push/pull
- \`tracking shot\` - Following subject

### Duration Guidelines
- Logo animation: 2-4s
- Product showcase: 5-8s
- Background loop: 8-15s

## Audio Generation Tips

### Voice Direction
- Neutral and professional for narration or tutorials
- Warm and friendly for stories or dialogue
- Deep and authoritative for documentary narration
- Young and energetic for short social media reads

### Music Genre & Mood
- Corporate: upbeat, inspiring
- Ambient: calm, peaceful
- Cinematic: dramatic, epic
- Lofi: calm, relaxing
`;

/**
 * AI Generate skill - Generate images, videos, audio, and music using AI
 *
 * Intended for explicit AI media generation requests.
 */
export const aiGenerateSkill: Skill = {
  name: 'ai-generate',
  description:
    'AI media generation capabilities including image, video, audio, and music generation. Use after the Agent has confirmed the user intends to create or transform media such as images, videos, speech, music, voiceover, or dubbing.',
  content: aiGenerateContent,
  allowedTools: [
    TOOL_NAMES_MEDIA.GENERATE_IMAGE,
    TOOL_NAMES_MEDIA.TRANSFORM_IMAGE,
    TOOL_NAMES_MEDIA.GENERATE_VIDEO,
    TOOL_NAMES_MEDIA.GENERATE_TTS,
    TOOL_NAMES_MEDIA.GENERATE_MUSIC,
    TOOL_NAMES_TRANSCRIBE.TRANSCRIBE_AUDIO,
    TOOL_NAMES_SYSTEM.READ,
    TOOL_NAMES_SYSTEM.READ_DOCUMENT,
    TOOL_NAMES_SYSTEM.LIST_DIRECTORY,
    // TODO(P1): implement when tools are available:
    // GenerateCharacter, TransferStyle, EnhanceVideo, OptimizeAudio
  ],
  icon: '🎨',
  source: 'builtin',
  enabled: true,
  domain: 'media',
  mediaWorkflow: {
    useCases: [
      'Generate images, videos, voiceover, sound effects, or music from explicit creative prompts',
      'Transform reference images or produce media assets for a creative project',
      'Create media assets when the user explicitly requests generation, TTS, dubbing, BGM, or AI drawing',
    ],
    nonGoals: [
      'Analyze or summarize existing media without generating or transforming assets',
      'Create structured storyboard, animation plan, Cut payload, or export package artifacts',
    ],
    acceptedModalities: ['text', 'image', 'audio'],
    inputArtifacts: ['prompt', 'reference-image', 'script-text'],
    producedArtifacts: ['generated-media-ref'],
    tags: ['generation', 'image', 'video', 'audio', 'music', 'tts'],
    operations: [
      'generate-image',
      'transform-image',
      'generate-video',
      'generate-tts',
      'generate-music',
    ],
    optionalTools: [TOOL_NAMES_MEDIA.TRANSFORM_IMAGE, TOOL_NAMES_TRANSCRIBE.TRANSCRIBE_AUDIO],
    costLevel: 'medium',
    riskLevel: 'medium',
  },
};
