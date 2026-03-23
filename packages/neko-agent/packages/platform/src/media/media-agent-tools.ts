/**
 * Media Agent Tools - Tool executors for AI media generation in agent mode
 *
 * Bridges the ai-generate skill's tool definitions to the MediaGenerationService.
 * Each tool returns { backgroundMode: true, taskId } so AgentStreamProcessor
 * can subscribe to progress and notify the webview.
 */

import { createTool } from '@neko/shared';
import type { IToolRegistry } from '@neko/shared';
import type { MediaGenerationService } from './media-generation-service';

/**
 * Register media generation tools into the tool registry.
 * Tool names must match ai-generate skill's allowedTools exactly.
 */
export function registerMediaAgentTools(
  toolRegistry: IToolRegistry,
  media: MediaGenerationService,
): void {
  // GenerateImage
  toolRegistry.register(
    createTool({
      name: 'GenerateImage',
      description:
        'Submit an async image generation task. This tool only SUBMITS the task and returns immediately with a taskId — the image is NOT ready yet. Always tell the user the task has been submitted and is being processed in the background; do NOT say the image is ready or finished.',
      category: 'generation',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Text description of the image to generate',
          },
          size: {
            type: 'string',
            enum: ['256x256', '512x512', '1024x1024', '1792x1024', '1024x1792'],
            description: 'Image dimensions (default: 1024x1024)',
          },
          quality: {
            type: 'string',
            enum: ['standard', 'hd'],
            description: 'Image quality (default: standard)',
          },
          style: {
            type: 'string',
            enum: ['natural', 'vivid'],
            description: 'Image style (default: vivid)',
          },
          n: {
            type: 'number',
            description: 'Number of images to generate (1-4, default: 1)',
          },
        },
        required: ['prompt'],
      },
      execute: async (args) => {
        const prompt = args.prompt as string;
        const sizeStr = (args.size as string | undefined) ?? '1024x1024';
        const [w, h] = sizeStr.split('x').map(Number);

        try {
          const task = await media.generateImage({
            prompt,
            width: w,
            height: h,
            quality: args.quality as 'standard' | 'hd' | undefined,
            style: args.style as string | undefined,
            count: args.n as number | undefined,
          });
          return {
            success: true,
            data: {
              backgroundMode: true,
              taskId: task.id,
              type: 'image',
              status: 'queued',
              message: `Image generation task submitted and processing in background. Task ID: ${task.id}. The image is NOT ready yet — do not tell the user it is finished.`,
              routedTo: { provider: task.providerId },
            },
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Image generation failed',
          };
        }
      },
    }),
  );

  // GenerateVideo
  toolRegistry.register(
    createTool({
      name: 'GenerateVideo',
      description:
        'Submit an async video generation task. This tool only SUBMITS the task and returns immediately with a taskId — the video is NOT ready yet. Always tell the user the task has been submitted and is being processed in the background; do NOT say the video is ready or finished.',
      category: 'generation',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Text description of the video to generate',
          },
          duration: {
            type: 'number',
            description: 'Video duration in seconds (1-30, default: 4)',
          },
          resolution: {
            type: 'string',
            enum: ['480p', '720p', '1080p'],
            description: 'Video resolution (default: 720p)',
          },
          fps: {
            type: 'number',
            enum: [24, 30, 60],
            description: 'Frames per second (default: 24)',
          },
        },
        required: ['prompt'],
      },
      execute: async (args) => {
        const prompt = args.prompt as string;

        try {
          const task = await media.generateVideo({
            prompt,
            duration: args.duration as number | undefined,
            resolution: args.resolution as string | undefined,
            fps: args.fps as number | undefined,
          });
          return {
            success: true,
            data: {
              backgroundMode: true,
              taskId: task.id,
              type: 'video',
              status: 'queued',
              message: `Video generation task submitted and processing in background. Task ID: ${task.id}. The video is NOT ready yet — do not tell the user it is finished.`,
              routedTo: { provider: task.providerId },
            },
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Video generation failed',
          };
        }
      },
    }),
  );

  // GenerateMusic
  toolRegistry.register(
    createTool({
      name: 'GenerateMusic',
      description:
        'Submit an async music generation task. This tool only SUBMITS the task and returns immediately with a taskId — the music is NOT ready yet. Always tell the user the task has been submitted and is being processed in the background; do NOT say the music is ready or finished.',
      category: 'generation',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Description of the music to generate',
          },
          duration: {
            type: 'number',
            description: 'Music duration in seconds (5-300, default: 30)',
          },
          genre: {
            type: 'string',
            description: 'Music genre (e.g., corporate, ambient, electronic)',
          },
          mood: {
            type: 'string',
            description: 'Music mood (e.g., upbeat, calm, dramatic)',
          },
        },
        required: ['prompt'],
      },
      execute: async (args) => {
        const prompt = args.prompt as string;
        const moodStr = args.mood ? ` (mood: ${args.mood})` : '';
        const genreStr = args.genre ? ` (genre: ${args.genre})` : '';

        try {
          const task = await media.generateAudio({
            prompt: `${prompt}${genreStr}${moodStr}`,
            duration: args.duration as number | undefined,
            isMusic: true,
            genre: args.genre as string | undefined,
          });
          return {
            success: true,
            data: {
              backgroundMode: true,
              taskId: task.id,
              type: 'audio',
              status: 'queued',
              message: `Music generation task submitted and processing in background. Task ID: ${task.id}. The music is NOT ready yet — do not tell the user it is finished.`,
              routedTo: { provider: task.providerId },
            },
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Music generation failed',
          };
        }
      },
    }),
  );

  // GenerateTTS
  toolRegistry.register(
    createTool({
      name: 'GenerateTTS',
      description:
        'Submit an async text-to-speech task. This tool only SUBMITS the task and returns immediately with a taskId — the audio is NOT ready yet. Always tell the user the task has been submitted and is being processed in the background; do NOT say the audio is ready or finished.',
      category: 'generation',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'Text to convert to speech',
          },
          voice: {
            type: 'string',
            description: 'Voice ID or name (e.g., alloy, echo, onyx, nova)',
          },
          language: {
            type: 'string',
            description: 'Language code (e.g., en, zh, ja)',
          },
          speed: {
            type: 'number',
            description: 'Speech speed multiplier (0.5-2, default: 1)',
          },
        },
        required: ['text'],
      },
      execute: async (args) => {
        const text = args.text as string;

        try {
          const task = await media.generateAudio({
            prompt: text,
            isMusic: false,
            metadata: {
              voice: args.voice,
              language: args.language,
              speed: args.speed,
            },
          });
          return {
            success: true,
            data: {
              backgroundMode: true,
              taskId: task.id,
              type: 'audio',
              status: 'queued',
              message: `TTS task submitted and processing in background. Task ID: ${task.id}. The audio is NOT ready yet — do not tell the user it is finished.`,
              routedTo: { provider: task.providerId },
            },
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'TTS generation failed',
          };
        }
      },
    }),
  );
}
