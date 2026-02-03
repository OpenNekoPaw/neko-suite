/**
 * NekoCanvas Tools - Tools for interacting with NekoCanvas extension
 */
import * as vscode from 'vscode';
import type { Tool } from '../api';

// Import NekoCanvas API type (will be available if NekoCanvas is installed)
interface NekoCanvasAPI {
  asset: {
    import(path: string): Promise<unknown>;
    list(filter?: unknown): Promise<unknown[]>;
    getById(id: string): Promise<unknown>;
  };
  canvas: {
    create(config: unknown): Promise<string>;
    addShape(canvasId: string, shape: unknown): Promise<string>;
  };
}

/**
 * Create tools for NekoCanvas integration
 * Returns empty array if NekoCanvas is not installed
 */
export function createNekoCanvasTools(): Tool[] {
  const nekocanvasExt = vscode.extensions.getExtension<NekoCanvasAPI>('neko.nekocanvas');

  if (!nekocanvasExt) {
    console.log('[NekoAgent] NekoCanvas extension not found, skipping NekoCanvas tools');
    return [];
  }

  const getAPI = async (): Promise<NekoCanvasAPI> => {
    if (nekocanvasExt.isActive) {
      return nekocanvasExt.exports;
    }
    return nekocanvasExt.activate();
  };

  return [
    {
      name: 'ImportAsset',
      description: 'Import an asset file into the asset library',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the asset file',
          },
        },
        required: ['path'],
      },
      execute: async (args) => {
        const api = await getAPI();
        return api.asset.import(args.path as string);
      },
    },
    {
      name: 'ListAssets',
      description: 'List assets in the asset library',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['video', 'audio', 'image', 'text', 'other'],
            description: 'Filter by asset type',
          },
          search: {
            type: 'string',
            description: 'Search query',
          },
        },
      },
      execute: async (args) => {
        const api = await getAPI();
        return api.asset.list(args);
      },
    },
    {
      name: 'GetAsset',
      description: 'Get an asset by ID',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Asset ID',
          },
        },
        required: ['id'],
      },
      execute: async (args) => {
        const api = await getAPI();
        return api.asset.getById(args.id as string);
      },
    },
    {
      name: 'CreateCanvas',
      description: 'Create a new canvas',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Canvas name',
          },
          width: {
            type: 'number',
            description: 'Canvas width in pixels',
          },
          height: {
            type: 'number',
            description: 'Canvas height in pixels',
          },
          backgroundColor: {
            type: 'string',
            description: 'Background color (hex)',
          },
        },
        required: ['name', 'width', 'height'],
      },
      execute: async (args) => {
        const api = await getAPI();
        return api.canvas.create(args);
      },
    },
    {
      name: 'AddCanvasShape',
      description: 'Add a shape to a canvas',
      parameters: {
        type: 'object',
        properties: {
          canvasId: {
            type: 'string',
            description: 'Canvas ID',
          },
          type: {
            type: 'string',
            enum: ['rectangle', 'ellipse', 'polygon', 'path', 'text'],
            description: 'Shape type',
          },
          x: {
            type: 'number',
            description: 'X position',
          },
          y: {
            type: 'number',
            description: 'Y position',
          },
          width: {
            type: 'number',
            description: 'Width',
          },
          height: {
            type: 'number',
            description: 'Height',
          },
          fill: {
            type: 'string',
            description: 'Fill color',
          },
          stroke: {
            type: 'string',
            description: 'Stroke color',
          },
        },
        required: ['canvasId', 'type', 'x', 'y'],
      },
      execute: async (args) => {
        const api = await getAPI();
        const { canvasId, ...shape } = args;
        return api.canvas.addShape(canvasId as string, shape);
      },
    },
  ];
}
