/**
 * AI Generate Skill - Builtin skill for AI media generation
 *
 * Provides image, video, audio, and music generation capabilities.
 * Triggered when user mentions: generate image, create video, TTS, background music, etc.
 */

import type { Skill, SkillToolDefinition } from '@neko/shared';
import { TOOL_NAMES_MEDIA, TOOL_NAMES_TRANSCRIBE, TOOL_NAMES_SYSTEM } from '@neko/shared';

/**
 * Tool definitions for AI generation
 */
export const aiGenerateToolDefinitions: SkillToolDefinition[] = [
  {
    name: 'GenerateImage',
    description: 'Generate an image using AI. Prefer prompt or taskRef/planRef markdown.',
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
    name: 'GenerateVideo',
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
      'Transcribe audio/video to text with timestamps using Whisper. Returns segments with start/end times. ' +
      'Use results with AddTimelineElement(type:"subtitle") to add subtitles.',
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

You now have access to AI-powered media generation tools.

## Core Principles

1. **Generate immediately** - Use default parameters and call the tool right away
2. **Use tool calls** - Never embed URLs directly in response
3. **Don't ask for clarification** - Generate with sensible defaults unless user explicitly states they want to discuss details first

## Quick Reference

| Request Type | Tool | Key Params |
|--------------|------|------------|
| Draw/Generate image | \`generate_image\` | prompt or taskRef, size, style |
| Generate video | \`generate_video\` | prompt or taskRef, duration, resolution |
| Voiceover/TTS | \`generate_tts\` | text, voice, language |
| Background music | \`generate_music\` | prompt, duration, genre |
| Character consistency | \`generate_character\` | prompt, referenceImageUrl |
| Transcribe audio/video | \`transcribe_audio\` | audioSource, model |
| Style transfer | \`transfer_style\` | sourceImageUrl, stylePrompt |
| Video upscale/enhance | \`enhance_video\` | videoUrl, targetResolution |
| Audio cleanup | \`optimize_audio\` | audioUrl, denoise |

## Decision Flow

~~~
User Request → Identify Type → Select Tool → Confirm Params → Generate
~~~

## Default Parameters

| Tool | Defaults |
|------|----------|
| generate_image | size: 1024x1024, style: vivid, n: 1 |
| generate_video | duration: 4s, resolution: 720p, fps: 24 |
| generate_tts | speed: 1.0 |
| generate_music | duration: 30s |


## Generation Intent Sources

Use natural-language \`prompt\` as the default input. When a Plan/Task markdown document exists, pass \`taskRef\` or \`planRef\` so the runtime can use that markdown as the structured intent anchor. structured intent is derived from markdown or prompt metadata.

Default strategy:
- prompt only → native provider prompt
- taskRef / planRef → extract generation intent from markdown while preserving the document as the structured anchor
- providerAdaptationMode: auto/agentic → rely on AGENT provider expression context when available
- providerAdaptationMode: native → bypass provider expression guidance and pass the prompt through

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

### TTS Voice Options
- \`alloy\` - Neutral, professional (narration, tutorials)
- \`echo\` - Warm, friendly (stories, dialogue)
- \`onyx\` - Deep, authoritative (documentaries)
- \`nova\` - Young, energetic (social media)

### Music Genre & Mood
- Corporate: upbeat, inspiring
- Ambient: calm, peaceful
- Cinematic: dramatic, epic
- Lofi: calm, relaxing
`;

/**
 * AI Generate skill - Generate images, videos, audio, and music using AI
 *
 * Triggered when user mentions: generate image, create video, TTS, background music, AI drawing
 */
export const aiGenerateSkill: Skill = {
  name: 'ai-generate',
  description:
    'AI media generation capabilities including image, video, audio, and music generation. Use when user mentions: generate image, create video, text-to-speech, TTS, background music, BGM, AI drawing, create picture, make video, voiceover, dubbing.',
  content: aiGenerateContent,
  allowedTools: [
    TOOL_NAMES_MEDIA.GENERATE_IMAGE,
    TOOL_NAMES_MEDIA.GENERATE_VIDEO,
    TOOL_NAMES_MEDIA.GENERATE_TTS,
    TOOL_NAMES_MEDIA.GENERATE_MUSIC,
    TOOL_NAMES_TRANSCRIBE.TRANSCRIBE_AUDIO,
    TOOL_NAMES_SYSTEM.READ,
    TOOL_NAMES_SYSTEM.LIST_DIRECTORY,
    // TODO(P1): implement when tools are available:
    // GenerateCharacter, TransferStyle, EnhanceVideo, OptimizeAudio
  ],
  toolDefinitions: aiGenerateToolDefinitions,
  icon: '🎨',
  source: 'builtin',
  enabled: true,
};
