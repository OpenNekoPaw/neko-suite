/**
 * Media Tool - Wraps MediaManager as platform tools
 */

import type { Tool, ToolResult, ToolCategory } from '../types/tool';
import type { MediaManager } from './media-manager';
import type { MediaDownloadOptions, ThumbnailOptions } from '../types/media';

/**
 * Tool definition for LLM
 */
interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Import media tool
 */
export class ImportMediaTool implements Tool {
  readonly name = 'ImportMedia';
  readonly description = 'Import media from URL or local path';
  readonly category: ToolCategory = 'media';
  readonly parameters = {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        description: 'URL or local file path to import',
      },
      timeout: {
        type: 'number',
        description: 'Download timeout in milliseconds (optional)',
      },
    },
    required: ['source'],
  };

  constructor(private mediaManager: MediaManager) {}

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const source = args.source as string;
    const options: MediaDownloadOptions = {};

    if (args.timeout) {
      options.timeout = args.timeout as number;
    }

    try {
      const item = await this.mediaManager.import(source, options);
      return {
        success: true,
        data: {
          id: item.id,
          name: item.name,
          type: item.type,
          status: item.status,
          cachedPath: item.cachedPath,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  toDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    };
  }
}

/**
 * Get media tool
 */
export class GetMediaTool implements Tool {
  readonly name = 'GetMedia';
  readonly description = 'Get media item by ID';
  readonly category: ToolCategory = 'media';
  readonly parameters = {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'Media item ID',
      },
    },
    required: ['id'],
  };

  constructor(private mediaManager: MediaManager) {}

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const id = args.id as string;

    try {
      const item = await this.mediaManager.get(id);
      if (!item) {
        return {
          success: false,
          error: `Media not found: ${id}`,
        };
      }
      return {
        success: true,
        data: item,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  toDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    };
  }
}

/**
 * List media tool
 */
export class ListMediaTool implements Tool {
  readonly name = 'ListMedia';
  readonly description = 'List all media items with optional filter';
  readonly category: ToolCategory = 'media';
  readonly parameters = {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['video', 'audio', 'image', 'subtitle'],
        description: 'Filter by media type (optional)',
      },
      status: {
        type: 'string',
        enum: ['pending', 'downloading', 'cached', 'failed'],
        description: 'Filter by status (optional)',
      },
    },
  };

  constructor(private mediaManager: MediaManager) {}

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const filter: { type?: string; status?: string } = {};
      if (args.type) filter.type = args.type as string;
      if (args.status) filter.status = args.status as string;

      const items = await this.mediaManager.list(filter as Parameters<typeof this.mediaManager.list>[0]);
      return {
        success: true,
        data: {
          count: items.length,
          items: items.map((item) => ({
            id: item.id,
            name: item.name,
            type: item.type,
            status: item.status,
          })),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  toDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    };
  }
}

/**
 * Delete media tool
 */
export class DeleteMediaTool implements Tool {
  readonly name = 'DeleteMedia';
  readonly description = 'Delete a media item';
  readonly category: ToolCategory = 'media';
  readonly parameters = {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'Media item ID to delete',
      },
    },
    required: ['id'],
  };

  constructor(private mediaManager: MediaManager) {}

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const id = args.id as string;

    try {
      const deleted = await this.mediaManager.delete(id);
      return {
        success: true,
        data: { deleted },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  toDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    };
  }
}

/**
 * Get thumbnail tool
 */
export class GetThumbnailTool implements Tool {
  readonly name = 'GetMediaThumbnail';
  readonly description = 'Get or generate thumbnail for media';
  readonly category: ToolCategory = 'media';
  readonly parameters = {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'Media item ID',
      },
      width: {
        type: 'number',
        description: 'Thumbnail width (optional, default 320)',
      },
      height: {
        type: 'number',
        description: 'Thumbnail height (optional, default 180)',
      },
      timestamp: {
        type: 'number',
        description: 'Timestamp in seconds for video (optional, default 0)',
      },
      format: {
        type: 'string',
        enum: ['jpeg', 'png', 'webp'],
        description: 'Output format (optional, default jpeg)',
      },
    },
    required: ['id'],
  };

  constructor(private mediaManager: MediaManager) {}

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const id = args.id as string;
    const options: ThumbnailOptions = {};

    if (args.width) options.width = args.width as number;
    if (args.height) options.height = args.height as number;
    if (args.timestamp) options.timestamp = args.timestamp as number;
    if (args.format) options.format = args.format as 'jpeg' | 'png' | 'webp';

    try {
      const thumbnailPath = await this.mediaManager.getThumbnail(id, options);
      if (!thumbnailPath) {
        return {
          success: false,
          error: 'Failed to generate thumbnail',
        };
      }
      return {
        success: true,
        data: { thumbnailPath },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  toDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    };
  }
}

/**
 * Get metadata tool
 */
export class GetMetadataTool implements Tool {
  readonly name = 'GetMediaMetadata';
  readonly description = 'Get metadata for media item';
  readonly category: ToolCategory = 'media';
  readonly parameters = {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'Media item ID',
      },
    },
    required: ['id'],
  };

  constructor(private mediaManager: MediaManager) {}

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const id = args.id as string;

    try {
      const metadata = await this.mediaManager.getMetadata(id);
      if (!metadata) {
        return {
          success: false,
          error: 'Metadata not available',
        };
      }
      return {
        success: true,
        data: metadata,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  toDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    };
  }
}

/**
 * Create all media tools
 */
export function createMediaTools(mediaManager: MediaManager): Tool[] {
  return [
    new ImportMediaTool(mediaManager),
    new GetMediaTool(mediaManager),
    new ListMediaTool(mediaManager),
    new DeleteMediaTool(mediaManager),
    new GetThumbnailTool(mediaManager),
    new GetMetadataTool(mediaManager),
  ];
}
