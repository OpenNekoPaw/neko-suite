/**
 * Extension Tools - Tools for interacting with other Neko extensions
 *
 * Provides tool definitions for NekoCut and NekoCanvas integration.
 * Uses VSCode Extension API for inter-extension communication.
 */

import * as vscode from 'vscode';
import type {
  NekoCutAPI,
  NekoCanvasAPI,
} from '@neko/shared';
import { EngineClient } from '@neko/neko-client';
import type { EffectPresetInfo, ShaderParamDef } from '@neko/neko-client';
import { getLogger } from '../base';

const logger = getLogger('ExtensionTools');

/**
 * Tool definition interface
 */
export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

// =============================================================================
// NekoCut Tools
// =============================================================================

/**
 * Create tools for NekoCut integration
 * Returns empty array if NekoCut is not installed
 */
export function createNekoCutTools(): Tool[] {
  const nekocutExt = vscode.extensions.getExtension<NekoCutAPI>('neko.nekocut');

  if (!nekocutExt) {
    logger.info('NekoCut extension not found, skipping NekoCut tools');
    return [];
  }

  const getAPI = async (): Promise<NekoCutAPI> => {
    if (nekocutExt.isActive) {
      return nekocutExt.exports;
    }
    return nekocutExt.activate();
  };

  return [
    {
      name: 'GetTimelineInfo',
      description: 'Get information about the current video timeline',
      parameters: {},
      execute: async () => {
        const api = await getAPI();
        return api.timeline.getInfo();
      },
    },
    {
      name: 'ListTimelineElements',
      description: 'List all elements in the current timeline',
      parameters: {},
      execute: async () => {
        const api = await getAPI();
        return api.timeline.listElements();
      },
    },
    {
      name: 'AddTimelineElement',
      description: 'Add a new element to the timeline',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['video', 'audio', 'image', 'text', 'shape'],
            description: 'Type of element to add',
          },
          trackId: {
            type: 'string',
            description: 'ID of the track to add the element to',
          },
          startTime: {
            type: 'number',
            description: 'Start time in seconds',
          },
          duration: {
            type: 'number',
            description: 'Duration in seconds',
          },
          source: {
            type: 'string',
            description: 'Source file path (for video/audio/image)',
          },
        },
        required: ['type', 'trackId', 'startTime', 'duration'],
      },
      execute: async (args) => {
        const api = await getAPI();
        return api.timeline.addElement({
          type: args.type as 'video' | 'audio' | 'image' | 'text' | 'shape',
          trackId: args.trackId as string,
          startTime: args.startTime as number,
          duration: args.duration as number,
          source: args.source as string | undefined,
        });
      },
    },
    {
      name: 'UpdateTimelineElement',
      description: 'Update an existing timeline element',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'ID of the element to update',
          },
          updates: {
            type: 'object',
            description: 'Properties to update',
          },
        },
        required: ['id', 'updates'],
      },
      execute: async (args) => {
        const api = await getAPI();
        await api.timeline.updateElement(
          args.id as string,
          args.updates as Record<string, unknown>
        );
        return { success: true };
      },
    },
    {
      name: 'DeleteTimelineElement',
      description: 'Delete an element from the timeline',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'ID of the element to delete',
          },
        },
        required: ['id'],
      },
      execute: async (args) => {
        const api = await getAPI();
        await api.timeline.deleteElement(args.id as string);
        return { success: true };
      },
    },
  ];
}

// =============================================================================
// NekoCanvas Tools
// =============================================================================

/**
 * Create tools for NekoCanvas integration
 * Returns empty array if NekoCanvas is not installed
 */
export function createNekoCanvasTools(): Tool[] {
  const nekocanvasExt = vscode.extensions.getExtension<NekoCanvasAPI>('neko.nekocanvas');

  if (!nekocanvasExt) {
    logger.info('NekoCanvas extension not found, skipping NekoCanvas tools');
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
        return api.asset.list({
          type: args.type as 'video' | 'audio' | 'image' | 'text' | 'other' | undefined,
          search: args.search as string | undefined,
        });
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
        return api.canvas.create({
          name: args.name as string,
          width: args.width as number,
          height: args.height as number,
          backgroundColor: args.backgroundColor as string | undefined,
        });
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
        return api.canvas.addShape(canvasId as string, {
          type: shape.type as 'rectangle' | 'ellipse' | 'polygon' | 'path' | 'text',
          x: shape.x as number,
          y: shape.y as number,
          width: shape.width as number | undefined,
          height: shape.height as number | undefined,
          fill: shape.fill as string | undefined,
          stroke: shape.stroke as string | undefined,
        });
      },
    },
  ];
}

// =============================================================================
// Neko Engine Effects Tools
// =============================================================================

const ENGINE_EXTENSION_ID = 'neko.neko-engine';

/**
 * Lazy-initialized EngineClient singleton for effects tools
 */
let cachedEngineClient: EngineClient | null = null;

async function getEngineClient(): Promise<EngineClient> {
  if (cachedEngineClient) {
    return cachedEngineClient;
  }

  const ext = vscode.extensions.getExtension(ENGINE_EXTENSION_ID);
  if (!ext) {
    throw new Error(`Extension ${ENGINE_EXTENSION_ID} not installed`);
  }

  if (!ext.isActive) {
    await ext.activate();
  }

  const result = await vscode.commands.executeCommand<{ port: number } | null>(
    'neko.engine.ensureFrameServer'
  );
  if (!result) {
    throw new Error('Failed to start neko-engine Frame Server');
  }

  cachedEngineClient = new EngineClient(result.port);
  return cachedEngineClient;
}

/**
 * Create tools for GPU shader/effects integration
 * Allows AI to list, register, and apply visual effects via neko-engine
 */
export function createNekoEngineEffectsTools(): Tool[] {
  return [
    {
      name: 'ListVideoEffects',
      description:
        'List all available GPU video effects/shaders. Returns preset IDs, descriptions, and tunable parameters.',
      parameters: {},
      execute: async (): Promise<EffectPresetInfo[]> => {
        const client = await getEngineClient();
        return client.listEffects();
      },
    },
    {
      name: 'GetVideoEffectInfo',
      description:
        'Get detailed info about a specific GPU video effect, including its tunable parameters with min/max/default values.',
      parameters: {
        type: 'object',
        properties: {
          shaderId: {
            type: 'string',
            description:
              'ID of the shader/effect preset (e.g. "gaussian_blur", "noise", "pixelate")',
          },
        },
        required: ['shaderId'],
      },
      execute: async (args): Promise<EffectPresetInfo> => {
        const client = await getEngineClient();
        return client.getEffectInfo(args.shaderId as string);
      },
    },
    {
      name: 'RegisterCustomShader',
      description:
        'Register a custom WGSL compute shader with the GPU engine. The shader will be available as a video effect. ' +
        'The WGSL code must define an @compute @workgroup_size(16,16) entry point named "main". ' +
        'Standard uniforms (width, height, time) and input/output textures are auto-injected.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description:
              'Unique ID for this shader (e.g. "my_custom_blur")',
          },
          code: {
            type: 'string',
            description: 'WGSL compute shader source code',
          },
          params: {
            type: 'array',
            description: 'Optional tunable parameter definitions',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                default: { type: 'number' },
                min: { type: 'number' },
                max: { type: 'number' },
              },
              required: ['name', 'default', 'min', 'max'],
            },
          },
        },
        required: ['id', 'code'],
      },
      execute: async (args): Promise<{ success: true; shaderId: string }> => {
        const client = await getEngineClient();
        await client.registerShader(
          args.id as string,
          args.code as string,
          args.params as ShaderParamDef[] | undefined
        );
        return { success: true, shaderId: args.id as string };
      },
    },
  ];
}
