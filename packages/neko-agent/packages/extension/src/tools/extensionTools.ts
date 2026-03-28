/**
 * Extension Tools - Tools for interacting with other Neko extensions
 *
 * Provides tool definitions for NekoCut and NekoCanvas integration.
 * Uses VSCode Extension API for inter-extension communication.
 */

import * as vscode from 'vscode';
import type { NekoCutAPI, NekoCanvasAPI, NekoStoryAPI, ToolParameters } from '@neko/shared';
import { ScriptEmbeddingIndex, type EmbedFn } from '../services/ScriptEmbeddingIndex';
import { EngineClient } from '@neko/neko-client';
import type { EffectPresetInfo, ShaderParamDef, TranscribeResponse } from '@neko/neko-client';
import { getLogger } from '../base';

const logger = getLogger('ExtensionTools');

/**
 * Tool definition interface for extension-layer tools.
 * Uses ToolParameters from @neko/shared to enforce valid JSON Schema at compile time.
 */
export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameters;
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
      parameters: { type: 'object', properties: {} },
      execute: async () => {
        const api = await getAPI();
        return api.timeline.getInfo();
      },
    },
    {
      name: 'ListTimelineElements',
      description: 'List all elements in the current timeline',
      parameters: { type: 'object', properties: {} },
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
            enum: ['video', 'audio', 'image', 'text', 'shape', 'subtitle'],
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
          content: {
            type: 'string',
            description: 'Text content (for text/subtitle elements)',
          },
        },
        required: ['type', 'trackId', 'startTime', 'duration'],
      },
      execute: async (args) => {
        const api = await getAPI();
        return api.timeline.addElement({
          type: args.type as 'video' | 'audio' | 'image' | 'text' | 'shape' | 'subtitle',
          trackId: args.trackId as string,
          startTime: args.startTime as number,
          duration: args.duration as number,
          source: args.source as string | undefined,
          content: args.content as string | undefined,
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
          args.updates as Record<string, unknown>,
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
    'neko.engine.ensureFrameServer',
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
      parameters: { type: 'object', properties: {} },
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
            description: 'Unique ID for this shader (e.g. "my_custom_blur")',
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
          args.params as ShaderParamDef[] | undefined,
        );
        return { success: true, shaderId: args.id as string };
      },
    },
  ];
}

/**
 * Create tools for audio transcription via neko-engine Whisper ONNX.
 * Returns timestamped segments that can be added as subtitle elements.
 */
export function createTranscribeTools(): Tool[] {
  return [
    {
      name: 'TranscribeAudio',
      description:
        'Transcribe an audio or video file to text with word-level timestamps using Whisper. ' +
        'Returns an array of timestamped segments. Use the segments with AddTimelineElement(type:"subtitle") ' +
        'to add subtitles to the timeline.',
      parameters: {
        type: 'object',
        properties: {
          audioSource: {
            type: 'string',
            description: 'Absolute path to the audio or video file to transcribe',
          },
          model: {
            type: 'string',
            description: 'Whisper model name registered in the engine (default: "whisper-base")',
          },
        },
        required: ['audioSource'],
      },
      execute: async (args): Promise<TranscribeResponse> => {
        const client = await getEngineClient();
        const model = (args.model as string) || 'whisper-base';
        const audioSource = args.audioSource as string;

        logger.info(`TranscribeAudio: model=${model}, source=${audioSource}`);
        const result = await client.transcribe(model, audioSource);
        logger.info(
          `TranscribeAudio: ${result.segments.length} segments, total text length=${result.text.length}`,
        );

        return result;
      },
    },
  ];
}

// =============================================================================
// NekoStory Tools
// =============================================================================

/**
 * Module-level embedding index cache — persists for the extension's lifetime.
 * Invalidated automatically when a file's total_lines changes.
 */
const scriptEmbeddingIndex = new ScriptEmbeddingIndex();

/**
 * Create tools for NekoStory screenplay index access.
 * Returns empty array if NekoStory is not installed.
 *
 * Tools:
 * - GetScriptIndex   — structural index (scenes + characters with line numbers)
 * - SearchScriptIndex — semantic similarity search using text embeddings
 *                       (requires embedFn; omit for L1-only mode)
 */
export function createNekoStoryTools(embedFn?: EmbedFn): Tool[] {
  const ext = vscode.extensions.getExtension<NekoStoryAPI>('neko.neko-story');

  if (!ext) {
    logger.info('NekoStory extension not found, skipping NekoStory tools');
    return [];
  }

  const getAPI = async (): Promise<NekoStoryAPI> => {
    if (ext.isActive) {
      return ext.exports;
    }
    return ext.activate() as Promise<NekoStoryAPI>;
  };

  const tools: Tool[] = [
    {
      name: 'GetScriptIndex',
      description:
        'Get a structured index of a Fountain screenplay (.fountain) file. ' +
        'Returns scenes with sequential IDs (S1, S2...) and 0-based line_start/line_end so you can ' +
        'fetch exact scene content with Read(offset=line_start, limit=line_end-line_start+1). ' +
        'Also returns all characters with their first appearance line and which scenes they appear in.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute file path or URI string of the .fountain screenplay file',
          },
        },
        required: ['path'],
      } satisfies ToolParameters,
      execute: async (args) => {
        const api = await getAPI();
        const index = api.getScriptIndex(args.path as string);
        if (!index) {
          return {
            error: 'Script not indexed yet. The file may not exist or has not been opened.',
          };
        }
        return index;
      },
    },
  ];

  // SearchScriptIndex requires an embedding function — only register when available
  if (embedFn) {
    tools.push({
      name: 'SearchScriptIndex',
      description:
        'Semantically search scenes in a Fountain screenplay by meaning, not just keywords. ' +
        'Useful for queries like "all tense confrontation scenes" or "scenes about loss or grief". ' +
        'Returns the top matching scenes with scene IDs, similarity scores, and line numbers. ' +
        'Use Read(offset=line_start, limit=line_end-line_start+1) to fetch the full scene text.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute file path of the .fountain screenplay file',
          },
          query: {
            type: 'string',
            description: 'Natural language description of the scenes to find',
          },
          top_k: {
            type: 'number',
            description: 'Maximum number of results to return (default: 5, max: 20)',
          },
        },
        required: ['path', 'query'],
      } satisfies ToolParameters,
      execute: async (args) => {
        const filePath = args.path as string;
        const query = args.query as string;
        const topK = Math.min((args.top_k as number | undefined) ?? 5, 20);

        // 1. Get structural index from neko-story
        const api = await getAPI();
        const index = api.getScriptIndex(filePath);
        if (!index) {
          return {
            error: 'Script not indexed yet. Open the .fountain file in VSCode first, then retry.',
          };
        }
        if (index.scenes.length === 0) {
          return { results: [], message: 'No scenes found in this screenplay.' };
        }

        // 2. Read file content to extract scene body text for richer embeddings
        let lines: string[];
        try {
          const uri = filePath.startsWith('file://')
            ? vscode.Uri.parse(filePath)
            : vscode.Uri.file(filePath);
          const bytes = await vscode.workspace.fs.readFile(uri);
          lines = new TextDecoder('utf-8').decode(bytes).split('\n');
        } catch (err) {
          return { error: `Failed to read screenplay file: ${String(err)}` };
        }

        // 3. Build scene text inputs (heading + body lines)
        const sceneTexts = index.scenes.map((scene) => ({
          id: scene.id,
          heading: scene.heading,
          line_start: scene.line_start,
          line_end: scene.line_end,
          text: lines
            .slice(scene.line_start, scene.line_end + 1)
            .join('\n')
            .trim(),
        }));

        // 4. Ensure embeddings are cached (re-embeds if total_lines changed)
        let cachedEmbeddings: Awaited<ReturnType<ScriptEmbeddingIndex['ensureIndexed']>>;
        try {
          cachedEmbeddings = await scriptEmbeddingIndex.ensureIndexed(
            index.uri,
            index.total_lines,
            sceneTexts,
            embedFn,
          );
        } catch (err) {
          return { error: `Embedding failed: ${String(err)}` };
        }

        // 5. Embed the query and search
        let queryVec: number[];
        try {
          const result = await embedFn([query]);
          queryVec = result[0] ?? [];
        } catch (err) {
          return { error: `Failed to embed query: ${String(err)}` };
        }

        const results = scriptEmbeddingIndex.search(queryVec, cachedEmbeddings, topK);

        logger.info(
          `SearchScriptIndex: query="${query}" topK=${topK} scenes=${index.scenes.length} results=${results.length}`,
        );

        return { results };
      },
    });
  }

  return tools;
}
