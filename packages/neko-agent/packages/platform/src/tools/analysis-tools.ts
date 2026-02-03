/**
 * AI Analysis Tools - Image and Video understanding
 */

import type { Tool, ToolCategory, ToolResult } from '../types/tool';
import { BuiltinTool } from '@uniedit/shared';

/**
 * Vision LLM service interface for analysis tools
 */
export interface VisionAnalysisService {
  analyzeImage(imageId: string, options?: ImageAnalysisOptions): Promise<AnalysisResult>;
  analyzeVideo?(videoId: string, options?: VideoAnalysisOptions): Promise<VideoAnalysisResult>;
  extractText?(imageId: string, language?: string): Promise<TextExtractionResult>;
}

export interface ImageAnalysisOptions {
  analysisType?: 'description' | 'objects' | 'text' | 'faces' | 'colors' | 'composition';
  prompt?: string;
}

export interface VideoAnalysisOptions {
  analysisType?: 'description' | 'scene-detection' | 'action' | 'summary';
  sampleInterval?: number;
  maxFrames?: number;
}

export interface AnalysisResult {
  description: string;
  confidence?: number;
  details?: Record<string, unknown>;
}

export interface VideoAnalysisResult extends AnalysisResult {
  scenes?: Array<{
    startTime: number;
    endTime: number;
    description: string;
  }>;
  summary?: string;
}

export interface TextExtractionResult {
  text: string;
  blocks?: Array<{
    text: string;
    confidence: number;
    boundingBox?: { x: number; y: number; width: number; height: number };
  }>;
}

/**
 * Analyze Image Tool [P0]
 */
export class AnalyzeImageTool extends BuiltinTool {
  readonly name = 'AnalyzeImage';
  readonly description = 'Analyze an image using AI vision to understand its content';
  readonly category: ToolCategory = 'analysis';
  readonly requiresConfirmation = false;
  readonly parameters = {
    type: 'object',
    properties: {
      imageId: {
        type: 'string',
        description: 'ID of the image to analyze',
      },
      analysisType: {
        type: 'string',
        enum: ['description', 'objects', 'text', 'faces', 'colors', 'composition'],
        description: 'Type of analysis to perform (default: description)',
      },
      prompt: {
        type: 'string',
        description: 'Custom prompt for the analysis',
      },
    },
    required: ['imageId'],
  };

  constructor(private visionService: VisionAnalysisService) {
    super();
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(validation.error!);
    }

    try {
      const result = await this.visionService.analyzeImage(args.imageId as string, {
        analysisType: args.analysisType as ImageAnalysisOptions['analysisType'],
        prompt: args.prompt as string | undefined,
      });

      return this.success({
        description: result.description,
        confidence: result.confidence,
        details: result.details,
      });
    } catch (error) {
      return this.error(error instanceof Error ? error.message : 'Failed to analyze image');
    }
  }
}

/**
 * Extract Image Text Tool (OCR) [P1]
 */
export class ExtractImageTextTool extends BuiltinTool {
  readonly name = 'ExtractImageText';
  readonly description = 'Extract text from an image using OCR';
  readonly category: ToolCategory = 'analysis';
  readonly requiresConfirmation = false;
  readonly parameters = {
    type: 'object',
    properties: {
      imageId: {
        type: 'string',
        description: 'ID of the image to extract text from',
      },
      language: {
        type: 'string',
        description: 'Expected language code (e.g., en, zh, ja)',
      },
    },
    required: ['imageId'],
  };

  constructor(private visionService: VisionAnalysisService) {
    super();
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(validation.error!);
    }

    if (!this.visionService.extractText) {
      return this.error('Text extraction (OCR) is not configured');
    }

    try {
      const result = await this.visionService.extractText(
        args.imageId as string,
        args.language as string | undefined
      );

      return this.success({
        text: result.text,
        blocks: result.blocks,
      });
    } catch (error) {
      return this.error(error instanceof Error ? error.message : 'Failed to extract text');
    }
  }
}

/**
 * Analyze Video Tool [P1]
 */
export class AnalyzeVideoTool extends BuiltinTool {
  readonly name = 'AnalyzeVideo';
  readonly description = 'Analyze video content using AI vision for scene detection and understanding';
  readonly category: ToolCategory = 'analysis';
  readonly requiresConfirmation = false;
  readonly parameters = {
    type: 'object',
    properties: {
      videoId: {
        type: 'string',
        description: 'ID of the video to analyze',
      },
      analysisType: {
        type: 'string',
        enum: ['description', 'scene-detection', 'action', 'summary'],
        description: 'Type of analysis to perform (default: description)',
      },
      sampleInterval: {
        type: 'number',
        description: 'Interval in seconds between sampled frames (default: 1)',
        minimum: 0.1,
        maximum: 10,
      },
    },
    required: ['videoId'],
  };

  constructor(private visionService: VisionAnalysisService) {
    super();
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(validation.error!);
    }

    if (!this.visionService.analyzeVideo) {
      return this.error('Video analysis is not configured');
    }

    try {
      const result = await this.visionService.analyzeVideo(args.videoId as string, {
        analysisType: args.analysisType as VideoAnalysisOptions['analysisType'],
        sampleInterval: args.sampleInterval as number | undefined,
      });

      return this.success({
        description: result.description,
        scenes: result.scenes,
        summary: result.summary,
      });
    } catch (error) {
      return this.error(error instanceof Error ? error.message : 'Failed to analyze video');
    }
  }
}

/**
 * Extract Video Summary Tool [P1]
 */
export class ExtractVideoSummaryTool extends BuiltinTool {
  readonly name = 'ExtractVideoSummary';
  readonly description = 'Generate a text summary of video content';
  readonly category: ToolCategory = 'analysis';
  readonly requiresConfirmation = false;
  readonly parameters = {
    type: 'object',
    properties: {
      videoId: {
        type: 'string',
        description: 'ID of the video to summarize',
      },
      maxLength: {
        type: 'number',
        description: 'Maximum length of the summary in characters (default: 500)',
        minimum: 100,
        maximum: 2000,
      },
    },
    required: ['videoId'],
  };

  constructor(private visionService: VisionAnalysisService) {
    super();
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(validation.error!);
    }

    if (!this.visionService.analyzeVideo) {
      return this.error('Video analysis is not configured');
    }

    try {
      const result = await this.visionService.analyzeVideo(args.videoId as string, {
        analysisType: 'summary',
        maxFrames: 20,
      });

      let summary = result.summary || result.description;
      const maxLength = (args.maxLength as number) || 500;
      if (summary.length > maxLength) {
        summary = summary.substring(0, maxLength - 3) + '...';
      }

      return this.success({
        summary,
        scenes: result.scenes,
      });
    } catch (error) {
      return this.error(error instanceof Error ? error.message : 'Failed to extract video summary');
    }
  }
}

/**
 * Register all analysis tools with a tool registry
 */
export function registerAnalysisTools(
  registry: { register(tool: Tool): void },
  visionService: VisionAnalysisService
): void {
  registry.register(new AnalyzeImageTool(visionService));
  registry.register(new ExtractImageTextTool(visionService));
  registry.register(new AnalyzeVideoTool(visionService));
  registry.register(new ExtractVideoSummaryTool(visionService));
}
