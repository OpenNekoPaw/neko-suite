/**
 * Document Tools - Script, Storyboard, Subtitle generation
 */

import type { Tool, ToolCategory, ToolResult } from '../types/tool';
import { BuiltinTool } from '@neko/shared';

/**
 * Document generation service interface
 */
export interface DocumentGenerationService {
  generateScript(options: ScriptGenerationOptions): Promise<ScriptResult>;
  optimizeScript(scriptText: string, optimizationType?: string): Promise<ScriptResult>;
  generateStoryboard(options: StoryboardOptions): Promise<StoryboardResult>;
  generateSubtitles?(mediaId: string, options?: SubtitleOptions): Promise<SubtitleResult>;
}

export interface ScriptGenerationOptions {
  topic: string;
  style?: 'professional' | 'casual' | 'educational' | 'promotional';
  length?: string;
  language?: string;
}

export interface ScriptResult {
  script: string;
  scenes?: Array<{
    id: string;
    description: string;
    dialogue?: string;
    duration?: number;
  }>;
  estimatedDuration?: number;
}

export interface StoryboardOptions {
  scriptText: string;
  numScenes?: number;
  style?: 'realistic' | 'cartoon' | 'sketch' | 'minimal';
}

export interface StoryboardResult {
  frames: Array<{
    id: string;
    sceneNumber: number;
    description: string;
    visualPrompt: string;
    dialogue?: string;
    duration?: number;
    cameraAngle?: string;
  }>;
}

export interface SubtitleOptions {
  language?: string;
  maxCharsPerLine?: number;
  maxLinesPerSubtitle?: number;
}

export interface SubtitleResult {
  subtitles: Array<{
    id: string;
    startTime: number;
    endTime: number;
    text: string;
  }>;
  language: string;
}

/**
 * Generate Script Tool [P0]
 */
export class GenerateScriptTool extends BuiltinTool {
  readonly name = 'GenerateScript';
  readonly description = 'Generate a video script from a topic description using AI';
  readonly category: ToolCategory = 'document';
  readonly requiresConfirmation = true;
  readonly parameters = {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        description: 'Topic or description for the video script',
      },
      style: {
        type: 'string',
        enum: ['professional', 'casual', 'educational', 'promotional'],
        description: 'Script style (default: professional)',
      },
      length: {
        type: 'string',
        description: 'Approximate video length (e.g., "1min", "5min", "10min")',
      },
      language: {
        type: 'string',
        description: 'Script language (e.g., "en", "zh")',
      },
    },
    required: ['topic'],
  };

  constructor(private documentService: DocumentGenerationService) {
    super();
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(validation.error!);
    }

    try {
      const result = await this.documentService.generateScript({
        topic: args.topic as string,
        style: args.style as ScriptGenerationOptions['style'],
        length: args.length as string | undefined,
        language: args.language as string | undefined,
      });

      return this.success({
        script: result.script,
        scenes: result.scenes,
        estimatedDuration: result.estimatedDuration,
        message: 'Script generated successfully',
      });
    } catch (error) {
      return this.error(error instanceof Error ? error.message : 'Failed to generate script');
    }
  }
}

/**
 * Optimize Script Tool [P0]
 */
export class OptimizeScriptTool extends BuiltinTool {
  readonly name = 'OptimizeScript';
  readonly description = 'Optimize an existing video script for better engagement or clarity';
  readonly category: ToolCategory = 'document';
  readonly requiresConfirmation = true;
  readonly parameters = {
    type: 'object',
    properties: {
      scriptText: {
        type: 'string',
        description: 'The script text to optimize',
      },
      optimizationType: {
        type: 'string',
        enum: ['engagement', 'clarity', 'brevity', 'seo', 'accessibility'],
        description: 'Type of optimization to apply (default: engagement)',
      },
    },
    required: ['scriptText'],
  };

  constructor(private documentService: DocumentGenerationService) {
    super();
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(validation.error!);
    }

    try {
      const result = await this.documentService.optimizeScript(
        args.scriptText as string,
        args.optimizationType as string | undefined
      );

      return this.success({
        script: result.script,
        scenes: result.scenes,
        message: 'Script optimized successfully',
      });
    } catch (error) {
      return this.error(error instanceof Error ? error.message : 'Failed to optimize script');
    }
  }
}

/**
 * Generate Storyboard Tool [P0]
 */
export class GenerateStoryboardTool extends BuiltinTool {
  readonly name = 'GenerateStoryboard';
  readonly description = 'Generate a visual storyboard from a script using AI';
  readonly category: ToolCategory = 'document';
  readonly requiresConfirmation = true;
  readonly parameters = {
    type: 'object',
    properties: {
      scriptText: {
        type: 'string',
        description: 'The script text to create storyboard from',
      },
      numScenes: {
        type: 'number',
        description: 'Number of storyboard frames to generate (default: auto)',
        minimum: 1,
        maximum: 50,
      },
      style: {
        type: 'string',
        enum: ['realistic', 'cartoon', 'sketch', 'minimal'],
        description: 'Visual style for storyboard frames (default: realistic)',
      },
    },
    required: ['scriptText'],
  };

  constructor(private documentService: DocumentGenerationService) {
    super();
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(validation.error!);
    }

    try {
      const result = await this.documentService.generateStoryboard({
        scriptText: args.scriptText as string,
        numScenes: args.numScenes as number | undefined,
        style: args.style as StoryboardOptions['style'],
      });

      return this.success({
        frames: result.frames,
        frameCount: result.frames.length,
        message: 'Storyboard generated successfully',
      });
    } catch (error) {
      return this.error(error instanceof Error ? error.message : 'Failed to generate storyboard');
    }
  }
}

/**
 * Generate Subtitles Tool [P1]
 */
export class GenerateSubtitlesTool extends BuiltinTool {
  readonly name = 'GenerateSubtitles';
  readonly description = 'Generate subtitles from audio/video content using speech recognition';
  readonly category: ToolCategory = 'document';
  readonly requiresConfirmation = true;
  readonly parameters = {
    type: 'object',
    properties: {
      mediaId: {
        type: 'string',
        description: 'ID of the audio or video to transcribe',
      },
      language: {
        type: 'string',
        description: 'Expected language code (e.g., en, zh, ja)',
      },
      maxCharsPerLine: {
        type: 'number',
        description: 'Maximum characters per subtitle line (default: 42)',
        minimum: 20,
        maximum: 80,
      },
    },
    required: ['mediaId'],
  };

  constructor(private documentService: DocumentGenerationService) {
    super();
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(validation.error!);
    }

    if (!this.documentService.generateSubtitles) {
      return this.error('Subtitle generation is not configured');
    }

    try {
      const result = await this.documentService.generateSubtitles(args.mediaId as string, {
        language: args.language as string | undefined,
        maxCharsPerLine: args.maxCharsPerLine as number | undefined,
      });

      return this.success({
        subtitles: result.subtitles,
        subtitleCount: result.subtitles.length,
        language: result.language,
        message: 'Subtitles generated successfully',
      });
    } catch (error) {
      return this.error(error instanceof Error ? error.message : 'Failed to generate subtitles');
    }
  }
}

/**
 * Register all document tools with a tool registry
 */
export function registerDocumentTools(
  registry: { register(tool: Tool): void },
  documentService: DocumentGenerationService
): void {
  registry.register(new GenerateScriptTool(documentService));
  registry.register(new OptimizeScriptTool(documentService));
  registry.register(new GenerateStoryboardTool(documentService));
  registry.register(new GenerateSubtitlesTool(documentService));
}
