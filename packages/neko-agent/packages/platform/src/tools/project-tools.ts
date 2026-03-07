/**
 * Project Tools - Timeline and media operation tools
 */

import type { Tool, ToolCategory, ToolResult } from '../types/tool';
import { BuiltinTool } from '@neko/shared';

/**
 * Project context interface for tools
 */
export interface ProjectContext {
  getTimelineInfo(): Promise<TimelineInfo>;
  getTracks(): Promise<TrackInfo[]>;
  getElements(trackId?: string): Promise<ElementInfo[]>;
  addElement(trackId: string, element: ElementInput): Promise<string>;
  updateElement(elementId: string, updates: Partial<ElementInput>): Promise<void>;
  deleteElement(elementId: string): Promise<void>;
  getMediaInfo(mediaId: string): Promise<MediaInfo>;
}

export interface TimelineInfo {
  duration: number;
  fps: number;
  width: number;
  height: number;
  trackCount: number;
}

export interface TrackInfo {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'subtitle';
  index: number;
  locked: boolean;
  visible: boolean;
}

export interface ElementInfo {
  id: string;
  trackId: string;
  type: 'video' | 'audio' | 'image' | 'text' | 'subtitle';
  startTime: number;
  endTime: number;
  duration: number;
  mediaId?: string;
  properties: Record<string, unknown>;
}

export interface ElementInput {
  type: 'video' | 'audio' | 'image' | 'text' | 'subtitle';
  startTime: number;
  duration: number;
  mediaId?: string;
  properties?: Record<string, unknown>;
}

export interface MediaInfo {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'image';
  path: string;
  duration?: number;
  width?: number;
  height?: number;
}

/**
 * Get timeline info tool
 */
export class GetTimelineInfoTool extends BuiltinTool {
  readonly name = 'GetTimelineInfo';
  readonly description = 'Get current timeline information including duration, fps, resolution, and track count';
  readonly category: ToolCategory = 'timeline';
  readonly parameters = {
    type: 'object',
    properties: {},
    required: [],
  };

  private context: ProjectContext;

  constructor(context: ProjectContext) {
    super();
    this.context = context;
  }

  async execute(): Promise<ToolResult> {
    try {
      const info = await this.context.getTimelineInfo();
      return this.success(info);
    } catch (error) {
      return this.error(error instanceof Error ? error.message : 'Failed to get timeline info');
    }
  }
}

/**
 * Get tracks tool
 */
export class GetTracksTool extends BuiltinTool {
  readonly name = 'GetTracks';
  readonly description = 'Get all tracks in the timeline';
  readonly category: ToolCategory = 'timeline';
  readonly parameters = {
    type: 'object',
    properties: {},
    required: [],
  };

  private context: ProjectContext;

  constructor(context: ProjectContext) {
    super();
    this.context = context;
  }

  async execute(): Promise<ToolResult> {
    try {
      const tracks = await this.context.getTracks();
      return this.success(tracks);
    } catch (error) {
      return this.error(error instanceof Error ? error.message : 'Failed to get tracks');
    }
  }
}

/**
 * Get elements tool
 */
export class GetElementsTool extends BuiltinTool {
  readonly name = 'GetElements';
  readonly description = 'Get elements in the timeline, optionally filtered by track';
  readonly category: ToolCategory = 'timeline';
  readonly parameters = {
    type: 'object',
    properties: {
      trackId: {
        type: 'string',
        description: 'Optional track ID to filter elements',
      },
    },
    required: [],
  };

  private context: ProjectContext;

  constructor(context: ProjectContext) {
    super();
    this.context = context;
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const trackId = args.trackId as string | undefined;
      const elements = await this.context.getElements(trackId);
      return this.success(elements);
    } catch (error) {
      return this.error(error instanceof Error ? error.message : 'Failed to get elements');
    }
  }
}

/**
 * Add element to timeline tool
 */
export class AddElementTool extends BuiltinTool {
  readonly name = 'AddElement';
  readonly description = 'Add a new element (video, audio, image, text) to a track';
  readonly category: ToolCategory = 'timeline';
  readonly requiresConfirmation = true;
  readonly parameters = {
    type: 'object',
    properties: {
      trackId: {
        type: 'string',
        description: 'Track ID to add element to',
      },
      type: {
        type: 'string',
        enum: ['video', 'audio', 'image', 'text', 'subtitle'],
        description: 'Element type',
      },
      startTime: {
        type: 'number',
        description: 'Start time in seconds',
      },
      duration: {
        type: 'number',
        description: 'Duration in seconds',
      },
      mediaId: {
        type: 'string',
        description: 'Media asset ID (for video, audio, image)',
      },
      properties: {
        type: 'object',
        description: 'Additional properties (e.g., text content, styling)',
      },
    },
    required: ['trackId', 'type', 'startTime', 'duration'],
  };

  private context: ProjectContext;

  constructor(context: ProjectContext) {
    super();
    this.context = context;
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(validation.error!);
    }

    try {
      const trackId = args.trackId as string;
      const element: ElementInput = {
        type: args.type as ElementInput['type'],
        startTime: args.startTime as number,
        duration: args.duration as number,
        mediaId: args.mediaId as string | undefined,
        properties: args.properties as Record<string, unknown> | undefined,
      };

      const elementId = await this.context.addElement(trackId, element);
      return this.success({ elementId, message: 'Element added successfully' });
    } catch (error) {
      return this.error(error instanceof Error ? error.message : 'Failed to add element');
    }
  }
}

/**
 * Update element tool
 */
export class UpdateElementTool extends BuiltinTool {
  readonly name = 'UpdateElement';
  readonly description = 'Update an existing element in the timeline';
  readonly category: ToolCategory = 'timeline';
  readonly requiresConfirmation = true;
  readonly parameters = {
    type: 'object',
    properties: {
      elementId: {
        type: 'string',
        description: 'Element ID to update',
      },
      startTime: {
        type: 'number',
        description: 'New start time in seconds',
      },
      duration: {
        type: 'number',
        description: 'New duration in seconds',
      },
      properties: {
        type: 'object',
        description: 'Properties to update',
      },
    },
    required: ['elementId'],
  };

  private context: ProjectContext;

  constructor(context: ProjectContext) {
    super();
    this.context = context;
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(validation.error!);
    }

    try {
      const elementId = args.elementId as string;
      const updates: Partial<ElementInput> = {};

      if (args.startTime !== undefined) updates.startTime = args.startTime as number;
      if (args.duration !== undefined) updates.duration = args.duration as number;
      if (args.properties !== undefined) updates.properties = args.properties as Record<string, unknown>;

      await this.context.updateElement(elementId, updates);
      return this.success({ message: 'Element updated successfully' });
    } catch (error) {
      return this.error(error instanceof Error ? error.message : 'Failed to update element');
    }
  }
}

/**
 * Delete element tool
 */
export class DeleteElementTool extends BuiltinTool {
  readonly name = 'DeleteElement';
  readonly description = 'Delete an element from the timeline';
  readonly category: ToolCategory = 'timeline';
  readonly requiresConfirmation = true;
  readonly parameters = {
    type: 'object',
    properties: {
      elementId: {
        type: 'string',
        description: 'Element ID to delete',
      },
    },
    required: ['elementId'],
  };

  private context: ProjectContext;

  constructor(context: ProjectContext) {
    super();
    this.context = context;
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(validation.error!);
    }

    try {
      const elementId = args.elementId as string;
      await this.context.deleteElement(elementId);
      return this.success({ message: 'Element deleted successfully' });
    } catch (error) {
      return this.error(error instanceof Error ? error.message : 'Failed to delete element');
    }
  }
}

/**
 * Get media info tool
 */
export class GetMediaInfoTool extends BuiltinTool {
  readonly name = 'GetMediaInfo';
  readonly description = 'Get information about a media asset';
  readonly category: ToolCategory = 'media';
  readonly parameters = {
    type: 'object',
    properties: {
      mediaId: {
        type: 'string',
        description: 'Media asset ID',
      },
    },
    required: ['mediaId'],
  };

  private context: ProjectContext;

  constructor(context: ProjectContext) {
    super();
    this.context = context;
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(validation.error!);
    }

    try {
      const mediaId = args.mediaId as string;
      const info = await this.context.getMediaInfo(mediaId);
      return this.success(info);
    } catch (error) {
      return this.error(error instanceof Error ? error.message : 'Failed to get media info');
    }
  }
}

// ── BatchOp types ──────────────────────────────────────────────────────────

type BatchOp =
  | { type: 'AddElement'; trackId: string; elementType: string; startTime: number; duration: number; src?: string; properties?: Record<string, unknown> }
  | { type: 'UpdateElement'; id: string; updates: Record<string, unknown> }
  | { type: 'DeleteElement'; id: string }
  | { type: 'TrimElement'; id: string; trimStart?: number; trimEnd?: number }
  | { type: 'SetAudioProperties'; id: string; volume?: number; muted?: boolean }
  | { type: 'SetColorCorrection'; id: string; brightness?: number; contrast?: number; saturation?: number };

interface BatchOpResult {
  index: number;
  type: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

interface BatchResult {
  succeeded: number;
  failed: number;
  results: BatchOpResult[];
}

/**
 * Execute multiple timeline operations in one call (best-effort: collect errors, continue)
 */
export class BatchTimelineOpsTool extends BuiltinTool {
  readonly name = 'BatchTimelineOps';
  readonly description =
    'Execute multiple timeline operations in one call. Best-effort: failed ops are reported but do not block subsequent ops.';
  readonly category: ToolCategory = 'timeline';
  readonly requiresConfirmation = true;
  readonly parameters = {
    type: 'object',
    properties: {
      operations: {
        type: 'array',
        description: 'Array of timeline operations to execute in order',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['AddElement', 'UpdateElement', 'DeleteElement', 'TrimElement', 'SetAudioProperties', 'SetColorCorrection'],
              description: 'Operation type',
            },
            trackId: { type: 'string', description: 'Track ID (AddElement)' },
            elementType: { type: 'string', description: 'Element type: video|audio|image|text (AddElement)' },
            startTime: { type: 'number', description: 'Start time in seconds (AddElement)' },
            duration: { type: 'number', description: 'Duration in seconds (AddElement)' },
            src: { type: 'string', description: 'Source file path (AddElement)' },
            id: { type: 'string', description: 'Element ID (UpdateElement/DeleteElement/Trim/etc.)' },
            updates: { type: 'object', description: 'Properties to update (UpdateElement)' },
            trimStart: { type: 'number', description: 'New trim start offset in seconds' },
            trimEnd: { type: 'number', description: 'New trim end offset in seconds' },
            volume: { type: 'number', description: 'Volume 0-1 (SetAudioProperties)' },
            muted: { type: 'boolean', description: 'Muted flag (SetAudioProperties)' },
            brightness: { type: 'number' },
            contrast: { type: 'number' },
            saturation: { type: 'number' },
          },
          required: ['type'],
        },
      },
    },
    required: ['operations'],
  };

  private context: ProjectContext;

  constructor(context: ProjectContext) {
    super();
    this.context = context;
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    if (!Array.isArray(args['operations'])) {
      return this.error('operations must be an array of BatchOp objects');
    }

    const ops = args['operations'] as BatchOp[];
    const results: BatchOpResult[] = [];

    for (let i = 0; i < ops.length; i++) {
      const op = ops[i] as BatchOp;
      try {
        const data = await this._executeOp(op);
        results.push({ index: i, type: op.type, success: true, data });
      } catch (err) {
        results.push({
          index: i,
          type: op.type,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const succeeded = results.filter(r => r.success).length;
    const failed = results.length - succeeded;

    const batchResult: BatchResult = { succeeded, failed, results };
    return this.success(batchResult);
  }

  private async _executeOp(op: BatchOp): Promise<unknown> {
    switch (op.type) {
      case 'AddElement': {
        const properties: Record<string, unknown> = op.src
          ? { src: op.src, ...op.properties }
          : { ...op.properties };
        const elementId = await this.context.addElement(op.trackId, {
          type: op.elementType as ElementInput['type'],
          startTime: op.startTime,
          duration: op.duration,
          properties,
        });
        return { elementId };
      }
      case 'UpdateElement':
        await this.context.updateElement(op.id, op.updates as Partial<ElementInput>);
        return undefined;
      case 'DeleteElement':
        await this.context.deleteElement(op.id);
        return undefined;
      case 'TrimElement':
        await this.context.updateElement(op.id, {
          ...(op.trimStart !== undefined && { trimStart: op.trimStart }),
          ...(op.trimEnd !== undefined && { trimEnd: op.trimEnd }),
        } as Partial<ElementInput>);
        return undefined;
      case 'SetAudioProperties':
        await this.context.updateElement(op.id, {
          ...(op.volume !== undefined && { volume: op.volume }),
          ...(op.muted !== undefined && { muted: op.muted }),
        } as Partial<ElementInput>);
        return undefined;
      case 'SetColorCorrection':
        await this.context.updateElement(op.id, {
          ...(op.brightness !== undefined && { brightness: op.brightness }),
          ...(op.contrast !== undefined && { contrast: op.contrast }),
          ...(op.saturation !== undefined && { saturation: op.saturation }),
        } as Partial<ElementInput>);
        return undefined;
      default: {
        const exhaustiveCheck: never = op;
        throw new Error(`Unknown operation type: ${(exhaustiveCheck as BatchOp).type}`);
      }
    }
  }
}

/**
 * Register all project tools with a tool registry
 */
export function registerProjectTools(
  registry: { register(tool: Tool): void },
  context: ProjectContext
): void {
  registry.register(new GetTimelineInfoTool(context));
  registry.register(new GetTracksTool(context));
  registry.register(new GetElementsTool(context));
  registry.register(new AddElementTool(context));
  registry.register(new UpdateElementTool(context));
  registry.register(new DeleteElementTool(context));
  registry.register(new GetMediaInfoTool(context));
  registry.register(new BatchTimelineOpsTool(context));
}

// Alias for backwards compatibility
export const registerBuiltinTools = registerProjectTools;
