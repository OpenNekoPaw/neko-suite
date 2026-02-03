/**
 * Media Service Adapter
 *
 * Bridges IMediaGenerationService to AIGenerationService interface
 * Allows generation-tools to use the new async media generation system
 */

import type { IMediaGenerationService } from '../types/interfaces';
import type { MediaTask } from '../media/types';
import type {
  AIGenerationService,
  GeneratedMedia,
  ImageGenerationOptions,
  VideoGenerationOptions,
  TTSOptions,
  MusicGenerationOptions,
  CharacterGenerationOptions,
  StyleTransferOptions,
  VideoEnhanceOptions,
  AudioOptimizeOptions,
} from './generation-tools';

/**
 * Adapter options
 */
export interface MediaServiceAdapterOptions {
  /** Timeout for waiting on async tasks (default: 10 min) */
  defaultTimeoutMs?: number;
  /** Whether to wait for task completion (default: false - async mode) */
  waitForCompletion?: boolean;
  /**
   * Async mode: return taskId immediately for frontend to track
   * This is the recommended mode for better UX
   */
  asyncMode?: boolean;
}

/**
 * Adapter that bridges IMediaGenerationService to AIGenerationService interface
 *
 * This allows the existing generation-tools (GenerateImageTool, GenerateVideoTool, etc.)
 * to use the new MediaGenerationService which supports multiple providers via adapters.
 */
export class MediaServiceAdapter implements AIGenerationService {
  private defaultTimeoutMs: number;
  private waitForCompletion: boolean;
  private asyncMode: boolean;

  constructor(
    private mediaService: IMediaGenerationService,
    options: MediaServiceAdapterOptions = {}
  ) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 10 * 60 * 1000; // 10 min
    this.waitForCompletion = options.waitForCompletion ?? false;
    // Default to async mode for better UX - return taskId immediately
    this.asyncMode = options.asyncMode ?? true;
  }

  /**
   * Generate an image from a text prompt
   * In async mode (default), returns taskId immediately for frontend tracking
   */
  async generateImage(options: ImageGenerationOptions): Promise<GeneratedMedia> {
    // Parse size to aspectRatio
    let aspectRatio: string | undefined;
    if (options.size) {
      const [width, height] = options.size.split('x').map(Number);
      if (width && height) {
        aspectRatio = `${width}:${height}`;
      }
    }

    // Submit generation task
    const task = await this.mediaService.generateImage({
      prompt: options.prompt,
      aspectRatio,
      quality: options.quality,
      style: options.style,
      count: options.n,
    });

    // Async mode: return taskId immediately for frontend to track
    if (this.asyncMode) {
      return {
        id: task.id,
        taskId: task.id,
        mimeType: 'image/png',
        status: task.status,
      };
    }

    // Sync mode: wait for completion (not recommended for UX)
    const completedTask = await this.mediaService.waitForTask(
      task.id,
      this.defaultTimeoutMs
    );

    return this.taskToGeneratedMedia(completedTask, 'image/png');
  }

  /**
   * Generate a video from a text prompt
   */
  async generateVideo(options: VideoGenerationOptions): Promise<GeneratedMedia> {
    // Parse resolution to aspectRatio
    let aspectRatio: string | undefined;
    if (options.resolution) {
      // Map common resolutions to aspect ratios
      const resolutionMap: Record<string, string> = {
        '480p': '4:3',
        '720p': '16:9',
        '1080p': '16:9',
        '4k': '16:9',
      };
      aspectRatio = resolutionMap[options.resolution];
    }

    // Submit generation task
    const task = await this.mediaService.generateVideo({
      prompt: options.prompt,
      duration: options.duration,
      aspectRatio,
      fps: options.fps,
    });

    // For video, return immediately with taskId for async tracking
    if (!this.waitForCompletion) {
      return {
        id: task.id,
        taskId: task.id,
        mimeType: 'video/mp4',
      };
    }

    // Or wait for completion
    const completedTask = await this.mediaService.waitForTask(
      task.id,
      this.defaultTimeoutMs
    );

    return this.taskToGeneratedMedia(completedTask, 'video/mp4');
  }

  /**
   * Generate text-to-speech audio
   * In async mode (default), returns taskId immediately for frontend tracking
   */
  async generateTTS(options: TTSOptions): Promise<GeneratedMedia> {
    // Build prompt with voice and language info
    let prompt = options.text;
    if (options.voice) {
      prompt = `[voice:${options.voice}] ${prompt}`;
    }
    if (options.language) {
      prompt = `[lang:${options.language}] ${prompt}`;
    }

    // Submit audio generation task
    const task = await this.mediaService.generateAudio({
      prompt,
      isMusic: false,
    });

    // Async mode: return taskId immediately
    if (this.asyncMode) {
      return {
        id: task.id,
        taskId: task.id,
        mimeType: 'audio/mpeg',
        status: task.status,
      };
    }

    // Sync mode: wait for completion
    const completedTask = await this.mediaService.waitForTask(
      task.id,
      this.defaultTimeoutMs
    );

    return this.taskToGeneratedMedia(completedTask, 'audio/mpeg');
  }

  /**
   * Generate background music
   * In async mode (default), returns taskId immediately for frontend tracking
   */
  async generateMusic(options: MusicGenerationOptions): Promise<GeneratedMedia> {
    // Build prompt with genre and mood
    let prompt = options.prompt;
    if (options.genre) {
      prompt = `${options.genre} style: ${prompt}`;
    }
    if (options.mood) {
      prompt = `${prompt}, ${options.mood} mood`;
    }

    // Submit audio generation task
    const task = await this.mediaService.generateAudio({
      prompt,
      duration: options.duration,
      isMusic: true,
      genre: options.genre,
    });

    // Async mode: return taskId immediately
    if (this.asyncMode) {
      return {
        id: task.id,
        taskId: task.id,
        mimeType: 'audio/mpeg',
        status: task.status,
      };
    }

    // Sync mode: wait for completion
    const completedTask = await this.mediaService.waitForTask(
      task.id,
      this.defaultTimeoutMs
    );

    return this.taskToGeneratedMedia(completedTask, 'audio/mpeg');
  }

  /**
   * Generate a character image with reference
   * In async mode (default), returns taskId immediately for frontend tracking
   */
  async generateCharacter(options: CharacterGenerationOptions): Promise<GeneratedMedia> {
    // Build prompt with style, pose, expression
    let prompt = options.prompt;
    if (options.style) {
      prompt = `${options.style} style: ${prompt}`;
    }
    if (options.pose) {
      prompt = `${prompt}, ${options.pose} pose`;
    }
    if (options.expression) {
      prompt = `${prompt}, ${options.expression} expression`;
    }

    // Submit generation task with reference image
    const task = await this.mediaService.generateImage({
      prompt,
      referenceImageUrl: options.referenceImageUrl,
    });

    // Async mode: return taskId immediately
    if (this.asyncMode) {
      return {
        id: task.id,
        taskId: task.id,
        mimeType: 'image/png',
        status: task.status,
      };
    }

    // Sync mode: wait for completion
    const completedTask = await this.mediaService.waitForTask(
      task.id,
      this.defaultTimeoutMs
    );

    return this.taskToGeneratedMedia(completedTask, 'image/png');
  }

  /**
   * Apply artistic style transfer
   * In async mode (default), returns taskId immediately for frontend tracking
   */
  async transferStyle(options: StyleTransferOptions): Promise<GeneratedMedia> {
    // Submit image-to-image generation
    const task = await this.mediaService.generateImage({
      prompt: options.stylePrompt,
      referenceImageUrl: options.sourceImageUrl,
      style: `strength:${options.styleStrength ?? 0.75}`,
    });

    // Async mode: return taskId immediately
    if (this.asyncMode) {
      return {
        id: task.id,
        taskId: task.id,
        mimeType: 'image/png',
        status: task.status,
      };
    }

    // Sync mode: wait for completion
    const completedTask = await this.mediaService.waitForTask(
      task.id,
      this.defaultTimeoutMs
    );

    return this.taskToGeneratedMedia(completedTask, 'image/png');
  }

  /**
   * Enhance video quality
   * Note: This requires specialized video enhancement models
   */
  async enhanceVideo(options: VideoEnhanceOptions): Promise<GeneratedMedia> {
    // Build enhancement prompt
    const enhancements: string[] = [];
    if (options.targetResolution) {
      enhancements.push(`upscale to ${options.targetResolution}`);
    }
    if (options.denoise) {
      enhancements.push('denoise');
    }
    if (options.stabilize) {
      enhancements.push('stabilize');
    }
    if (options.interpolateFps) {
      enhancements.push(`interpolate to ${options.interpolateFps}fps`);
    }

    // Submit video enhancement task
    const task = await this.mediaService.generateVideo({
      prompt: `Enhance video: ${enhancements.join(', ')}`,
      referenceImageUrl: options.videoUrl,
    });

    // Return with taskId for async tracking
    if (!this.waitForCompletion) {
      return {
        id: task.id,
        taskId: task.id,
        mimeType: 'video/mp4',
      };
    }

    const completedTask = await this.mediaService.waitForTask(
      task.id,
      this.defaultTimeoutMs
    );

    return this.taskToGeneratedMedia(completedTask, 'video/mp4');
  }

  /**
   * Optimize audio quality
   * In async mode (default), returns taskId immediately for frontend tracking
   */
  async optimizeAudio(options: AudioOptimizeOptions): Promise<GeneratedMedia> {
    // Build optimization prompt
    const optimizations: string[] = [];
    if (options.denoise) {
      optimizations.push('remove noise');
    }
    if (options.normalize) {
      optimizations.push('normalize levels');
    }
    if (options.enhanceVoice) {
      optimizations.push('enhance voice clarity');
    }
    if (options.removeBackground) {
      optimizations.push('remove background');
    }

    // Submit audio optimization task
    const task = await this.mediaService.generateAudio({
      prompt: `Optimize audio: ${optimizations.join(', ')}`,
      metadata: options.audioUrl ? { sourceAudioUrl: options.audioUrl } : undefined,
    });

    // Async mode: return taskId immediately
    if (this.asyncMode) {
      return {
        id: task.id,
        taskId: task.id,
        mimeType: 'audio/mpeg',
        status: task.status,
      };
    }

    // Sync mode: wait for completion
    const completedTask = await this.mediaService.waitForTask(
      task.id,
      this.defaultTimeoutMs
    );

    return this.taskToGeneratedMedia(completedTask, 'audio/mpeg');
  }

  /**
   * Convert MediaTask to GeneratedMedia format
   */
  private taskToGeneratedMedia(task: MediaTask, defaultMimeType: string): GeneratedMedia {
    const output = task.outputs?.[0];

    return {
      id: task.id,
      url: output?.url,
      mimeType: this.getMimeType(output?.type, defaultMimeType),
      taskId: task.id,
    };
  }

  /**
   * Get MIME type from output type
   */
  private getMimeType(outputType?: string, defaultType?: string): string {
    switch (outputType) {
      case 'image':
        return 'image/png';
      case 'video':
        return 'video/mp4';
      case 'audio':
        return 'audio/mpeg';
      default:
        return defaultType ?? 'application/octet-stream';
    }
  }
}

/**
 * Create a MediaServiceAdapter instance
 */
export function createMediaServiceAdapter(
  mediaService: IMediaGenerationService,
  options?: MediaServiceAdapterOptions
): AIGenerationService {
  return new MediaServiceAdapter(mediaService, options);
}
