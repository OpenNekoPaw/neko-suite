/**
 * Extension Tools - Tools for interacting with other Neko extensions
 *
 * Provides tool definitions for NekoCut and NekoCanvas integration.
 * Uses VSCode Extension API for inter-extension communication.
 */

import * as vscode from 'vscode';
import * as fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import * as path from 'node:path';
import AdmZip from 'adm-zip';
import type {
  NekoCutAPI,
  NekoCanvasAPI,
  NekoStoryAPI,
  NekoSketchAPI,
  ToolParameters,
  StoryScenePlan,
} from '@neko/shared';
import {
  applyCanvasTimelineSyncToCanvas,
  applyStoryboardPayloadToCanvas,
  buildStoryboardImportTimelineSyncPayload,
  createStoryboardPayload,
  extractCanvasNodeGenerationLineage,
  resolveCharacterBindingsForNames,
} from '@neko/shared';
import { ScriptEmbeddingIndex, type EmbedFn } from '../services/ScriptEmbeddingIndex';
import { setActiveGenerationConfig } from '../services/canvasAmbientContext';
import type { MediaGenerationService, ConfigManager } from '@neko/platform';
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
export function createNekoCanvasTools(
  media?: MediaGenerationService,
  config?: ConfigManager,
): Tool[] {
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

  // Auto-resolve model from ConfigManager when workspace config has no model set.
  // Writes to workspace config so neko-canvas can read it on next generation.
  async function ensureProjectModel(type: 'image' | 'video' | 'audio'): Promise<void> {
    if (!config) return;
    const key = `neko.project.models.${type}`;
    const wsConfig = vscode.workspace.getConfiguration();
    const current = wsConfig.get<string>(key, '');
    if (current) return;
    const model = config.getEnabledModels().find((m) => m.type === type);
    if (model?.name) {
      await wsConfig.update(key, model.name, vscode.ConfigurationTarget.Workspace);
      logger.info(`Auto-resolved ${type} model from ConfigManager: ${model.name}`);
    }
  }

  const tools: Tool[] = [
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

    // -------------------------------------------------------------------------
    // Storyboard / Node tools (Phase 2)
    // -------------------------------------------------------------------------
    {
      name: 'canvas_list_nodes',
      description:
        'List all nodes on the active canvas. Optionally filter by type (shot, scene, gallery, media, annotation, etc.).',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: 'Optional node type filter',
          },
        },
      },
      execute: async (args) => {
        const api = await getAPI();
        return api.nodes.list(args.type as import('@neko/shared').CanvasNodeType | undefined);
      },
    },
    {
      name: 'canvas_get_node',
      description: 'Get full details of a single canvas node by its ID.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'Canvas node ID' },
        },
        required: ['nodeId'],
      },
      execute: async (args) => {
        const api = await getAPI();
        return api.nodes.get(args.nodeId as string);
      },
    },
    {
      name: 'canvas_update_node',
      description:
        "Update a canvas node's data fields. Use this to set shot descriptions, characters, " +
        'camera settings, or generation parameters. Always write generation params to the node ' +
        'before calling canvas_generate_image so they persist across sessions.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'Canvas node ID' },
          data: {
            type: 'object',
            description:
              'Partial node data to merge. For ShotNode: visualDescription, shotScale, ' +
              'cameraMovement, characters[], emotion[], dialogue. ' +
              'For SceneGroupNode: sceneTitle, location, timeOfDay.',
          },
        },
        required: ['nodeId', 'data'],
      },
      execute: async (args) => {
        const api = await getAPI();
        return api.nodes.update(args.nodeId as string, args.data as Record<string, unknown>);
      },
    },
    {
      name: 'canvas_create_node',
      description: "Create a new node on the active canvas. Returns the new node's ID.",
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: [
              'shot',
              'scene',
              'gallery',
              'annotation',
              'media',
              'storyboard',
              'text',
              'artboard',
              'script',
              'document',
              'model',
            ],
            description: 'Node type',
          },
          x: { type: 'number', description: 'Canvas X position' },
          y: { type: 'number', description: 'Canvas Y position' },
          data: {
            type: 'object',
            description:
              'Initial node data. For shot: { shotNumber, duration, visualDescription, shotScale }. ' +
              'For scene: { sceneTitle, sceneNumber }. For gallery: { preset, rows, cols, cells }.',
          },
        },
        required: ['type', 'x', 'y', 'data'],
      },
      execute: async (args) => {
        const api = await getAPI();
        return api.nodes.create(
          args.type as import('@neko/shared').CanvasNodeType,
          { x: args.x as number, y: args.y as number },
          args.data as object,
        );
      },
    },
    {
      name: 'canvas_generate_image',
      description:
        'Trigger image generation for a ShotNode or a specific GalleryCell. ' +
        'Call canvas_update_node first to write the prompt/params to the node ' +
        'so they are persisted. Generation runs asynchronously in the background.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'ShotNode or GalleryNode ID' },
          cellId: {
            type: 'string',
            description: 'GalleryCell ID (required when nodeId is a GalleryNode)',
          },
        },
        required: ['nodeId'],
      },
      execute: async (args) => {
        await ensureProjectModel('image');
        const api = await getAPI();
        return api.nodes.generateImage(args.nodeId as string, args.cellId as string | undefined);
      },
    },
    {
      name: 'canvas_generate_batch',
      description:
        'Trigger image generation for multiple nodes at once. ' +
        'Useful for generating all shots in a scene in one command. ' +
        'Runs up to 2 generations concurrently via the scheduler.',
      parameters: {
        type: 'object',
        properties: {
          nodeIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of ShotNode IDs to generate images for',
          },
        },
        required: ['nodeIds'],
      },
      execute: async (args) => {
        await ensureProjectModel('image');
        const api = await getAPI();
        return api.nodes.generateBatch(args.nodeIds as string[]);
      },
    },
    {
      name: 'set_project_generation_config',
      description:
        'Persist project-level generation parameters and model configuration. ' +
        'These become the default for all nodes unless overridden per-node. ' +
        'Always call this before batch generation to ensure params survive context compression.',
      parameters: {
        type: 'object',
        properties: {
          imageRatio: {
            type: 'string',
            enum: ['16:9', '9:16', '1:1', '4:3', '2.39:1'],
            description: 'Image aspect ratio',
          },
          imageResolution: {
            type: 'string',
            enum: ['512', '720p', '1080p', '2K'],
            description: 'Image resolution',
          },
          videoRatio: {
            type: 'string',
            enum: ['16:9', '9:16', '1:1'],
            description: 'Video aspect ratio',
          },
          videoResolution: {
            type: 'string',
            enum: ['480p', '720p', '1080p'],
            description: 'Video resolution',
          },
          videoDuration: { type: 'number', description: 'Video duration in seconds' },
          videoFps: { type: 'number', enum: ['24', '30'], description: 'Video frame rate' },
          imageModel: { type: 'string', description: 'Image generation model id' },
          videoModel: { type: 'string', description: 'Video generation model id' },
          audioModel: { type: 'string', description: 'Audio generation model id' },
        },
      },
      execute: async (args) => {
        const config: Record<string, unknown> = {};
        if (args.imageRatio !== undefined)
          config['neko.project.generation.image.ratio'] = args.imageRatio;
        if (args.imageResolution !== undefined)
          config['neko.project.generation.image.resolution'] = args.imageResolution;
        if (args.videoRatio !== undefined)
          config['neko.project.generation.video.ratio'] = args.videoRatio;
        if (args.videoResolution !== undefined)
          config['neko.project.generation.video.resolution'] = args.videoResolution;
        if (args.videoDuration !== undefined)
          config['neko.project.generation.video.duration'] = args.videoDuration;
        if (args.videoFps !== undefined)
          config['neko.project.generation.video.fps'] = args.videoFps;
        if (args.imageModel !== undefined) config['neko.project.models.image'] = args.imageModel;
        if (args.videoModel !== undefined) config['neko.project.models.video'] = args.videoModel;
        if (args.audioModel !== undefined) config['neko.project.models.audio'] = args.audioModel;

        const wsConfig = vscode.workspace.getConfiguration();
        await Promise.all(
          Object.entries(config).map(([key, value]) =>
            wsConfig.update(key, value, vscode.ConfigurationTarget.Workspace),
          ),
        );

        // Update status bar with new generation model display
        const imageModel = args.imageModel as string | undefined;
        const videoModel = args.videoModel as string | undefined;
        const audioModel = args.audioModel as string | undefined;
        if (imageModel !== undefined || videoModel !== undefined || audioModel !== undefined) {
          setActiveGenerationConfig({
            llm: wsConfig.get<string>('neko.project.models.llm', ''),
            image: imageModel,
            video: videoModel,
            audio: audioModel,
          });
        }

        return { ok: true, updated: Object.keys(config) };
      },
    },

    // -------------------------------------------------------------------------
    // Storyboard Export
    // -------------------------------------------------------------------------
    {
      name: 'export_storyboard',
      description:
        'Export the storyboard as a ZIP image pack or import it into the neko-cut timeline. ' +
        'ZIP format: creates a .zip file with shot images + manifest.json at a user-chosen path. ' +
        'neko-cut format: sends all shots to the active neko-cut timeline as MediaElement clips. ' +
        'Returns the saved file path (ZIP) or a confirmation (neko-cut).',
      parameters: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            enum: ['zip', 'neko-cut'],
            description:
              '"zip" to save image pack + manifest.json, "neko-cut" to import into timeline',
          },
          projectName: {
            type: 'string',
            description: 'Project name used for file naming and manifest (default: "storyboard")',
          },
        },
        required: ['format'],
      } satisfies ToolParameters,
      execute: async (args) => {
        const api = await getAPI();
        const format = args.format as 'zip' | 'neko-cut';
        const projectName = (args.projectName as string | undefined) ?? 'storyboard';

        // Fetch all shot and scene nodes
        const [allShots, allScenes] = await Promise.all([
          api.nodes.list('shot' as import('@neko/shared').CanvasNodeType),
          api.nodes.list('scene' as import('@neko/shared').CanvasNodeType),
        ]);

        if (allShots.length === 0) {
          return { error: 'No shot nodes found on the canvas. Create ShotNodes first.' };
        }

        // Build scene title lookup
        const sceneTitleMap = new Map<string, string>();
        for (const scene of allScenes) {
          const d = scene.data as Record<string, unknown>;
          sceneTitleMap.set(scene.id, (d['sceneTitle'] as string | undefined) ?? '');
        }

        // Build manifest shots
        interface ManifestShot {
          id: string;
          shotNumber: number;
          sceneId?: string;
          sceneTitle?: string;
          shotScale?: string;
          cameraMovement?: string;
          duration: number;
          visualDescription: string;
          characters: string[];
          emotion: string[];
          dialogue?: string;
          voiceOver?: string;
          soundCue?: string;
          imageFile?: string;
        }

        const manifestShots: ManifestShot[] = allShots.map((node) => {
          const d = node.data as Record<string, unknown>;
          const shotNumber = (d['shotNumber'] as number | undefined) ?? 0;
          const sceneId = d['sceneGroupId'] as string | undefined;
          const chars = (d['characters'] as Array<{ characterName?: string }> | undefined) ?? [];
          const pad = String(shotNumber).padStart(3, '0');
          const scale = (d['shotScale'] as string | undefined) ?? '';
          const firstChar =
            typeof chars[0]?.characterName === 'string' ? chars[0].characterName : '';
          const imageFile = `shots/${pad}_${scale}${firstChar ? `_${firstChar}` : ''}.png`;
          return {
            id: node.id,
            shotNumber,
            sceneId,
            sceneTitle: sceneId ? sceneTitleMap.get(sceneId) : undefined,
            shotScale: scale || undefined,
            cameraMovement: d['cameraMovement'] as string | undefined,
            duration: (d['duration'] as number | undefined) ?? 3,
            visualDescription: (d['visualDescription'] as string | undefined) ?? '',
            characters: chars.map((c) => c.characterName ?? '').filter(Boolean),
            emotion: (d['emotion'] as string[] | undefined) ?? [],
            dialogue: d['dialogue'] as string | undefined,
            voiceOver: d['voiceOver'] as string | undefined,
            soundCue: d['soundCue'] as string | undefined,
            imageFile: (d['generatedImage'] as string | undefined) ? imageFile : undefined,
          };
        });

        if (format === 'neko-cut') {
          // Import into neko-cut timeline
          const timelineShots = manifestShots.map((s) => ({
            id: s.id,
            shotNumber: s.shotNumber,
            duration: s.duration,
            imageDataUrl: allShots.find((n) => n.id === s.id)
              ? ((allShots.find((n) => n.id === s.id)!.data as Record<string, unknown>)[
                  'generatedImage'
                ] as string | undefined)
              : undefined,
            dialogue: s.dialogue,
            voiceOver: s.voiceOver,
            soundCue: s.soundCue,
            label: `#${String(s.shotNumber).padStart(3, '0')} ${s.shotScale ?? ''}`.trim(),
          }));

          await vscode.commands.executeCommand('neko.cut.importStoryboard', {
            projectName,
            shots: timelineShots,
          });
          const importedAt = Date.now();
          await applyCanvasTimelineSyncToCanvas(
            api,
            buildStoryboardImportTimelineSyncPayload(
              timelineShots.map((shot) => shot.id),
              projectName,
              importedAt,
            ),
          );

          return {
            success: true,
            format: 'neko-cut',
            shotsImported: timelineShots.length,
            message: `${timelineShots.length} shots imported into neko-cut timeline`,
          };
        }

        // ZIP format
        const defaultName = `${projectName.replace(/[^a-z0-9-_]/gi, '_')}_storyboard.zip`;
        const saveUri = await vscode.window.showSaveDialog({
          defaultUri: vscode.workspace.workspaceFolders?.[0]
            ? vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, defaultName)
            : undefined,
          filters: { 'ZIP Archive': ['zip'] },
          saveLabel: 'Export Storyboard ZIP',
        });

        if (!saveUri) {
          return { error: 'Export cancelled by user.' };
        }

        const zip = new AdmZip();

        // Add manifest.json
        const manifest = {
          projectName,
          exportedAt: new Date().toISOString(),
          totalShots: manifestShots.length,
          shots: manifestShots,
        };
        zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));

        // Add images
        let imagesAdded = 0;
        for (const node of allShots) {
          const d = node.data as Record<string, unknown>;
          const generatedImage = d['generatedImage'] as string | undefined;
          if (!generatedImage) continue;

          const shot = manifestShots.find((s) => s.id === node.id);
          if (!shot?.imageFile) continue;

          // Strip data URL prefix if present
          const base64Match = generatedImage.match(/^data:[^;]+;base64,(.+)$/);
          const base64 = base64Match ? base64Match[1] : generatedImage;

          try {
            const imgBuffer = Buffer.from(base64, 'base64');
            zip.addFile(shot.imageFile, imgBuffer);
            imagesAdded++;
          } catch {
            // Skip malformed images
          }
        }

        const zipBuffer = zip.toBuffer();
        await fsp.writeFile(saveUri.fsPath, zipBuffer);

        logger.info(
          `export_storyboard: wrote ZIP to ${saveUri.fsPath} (${manifestShots.length} shots, ${imagesAdded} images)`,
        );

        return {
          success: true,
          format: 'zip',
          savedTo: saveUri.fsPath,
          totalShots: manifestShots.length,
          imagesIncluded: imagesAdded,
          message: `Storyboard exported to ${path.basename(saveUri.fsPath)}`,
        };
      },
    },

    // -------------------------------------------------------------------------
    // Ph6.2 — Style Transfer (IP-Adapter reference via GalleryNode)
    // -------------------------------------------------------------------------
    {
      name: 'canvas_apply_style_transfer',
      description:
        'Apply style transfer to target ShotNodes using a GalleryNode as IP-Adapter reference. ' +
        'Sets referenceNodeId on each target shot to the given GalleryNode, then triggers batch ' +
        'image generation so each shot is re-generated with the style reference applied. ' +
        'Use canvas_list_nodes to find GalleryNode IDs before calling this.',
      parameters: {
        type: 'object',
        properties: {
          targetNodeIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of ShotNode IDs to apply style transfer to',
          },
          referenceNodeId: {
            type: 'string',
            description: 'GalleryNode ID to use as IP-Adapter style reference',
          },
        },
        required: ['targetNodeIds', 'referenceNodeId'],
      } satisfies ToolParameters,
      execute: async (args) => {
        const api = await getAPI();
        const targetNodeIds = args.targetNodeIds as string[];
        const refNodeId = args.referenceNodeId as string;

        // Verify the reference node is a gallery node
        const refNode = await api.nodes.get(refNodeId);
        if (!refNode) {
          return { error: `Reference node "${refNodeId}" not found` };
        }
        if (refNode.type !== 'gallery') {
          return { error: `Reference node must be a GalleryNode (got type: "${refNode.type}")` };
        }

        // Set referenceNodeId on each target shot
        const updateErrors: string[] = [];
        for (const nodeId of targetNodeIds) {
          try {
            await api.nodes.update(nodeId, { referenceNodeId: refNodeId });
          } catch (err) {
            updateErrors.push(`${nodeId}: ${String(err)}`);
          }
        }

        if (updateErrors.length > 0) {
          return { error: `Failed to update reference on some nodes: ${updateErrors.join(', ')}` };
        }

        // Trigger batch generation with the style reference set
        await api.nodes.generateBatch(targetNodeIds);

        logger.info(
          `canvas_apply_style_transfer: ref="${refNodeId}" targets=${targetNodeIds.length}`,
        );
        return {
          success: true,
          message: `Style transfer queued for ${targetNodeIds.length} shot(s) using GalleryNode "${refNodeId}"`,
          targetNodeIds,
          referenceNodeId: refNodeId,
        };
      },
    },
  ];

  // -------------------------------------------------------------------------
  // Ph6.1 — Keyframe Video Generation (requires MediaGenerationService)
  // -------------------------------------------------------------------------
  if (media) {
    tools.push({
      name: 'canvas_generate_video_with_keyframes',
      description:
        'Generate a video clip for a ShotNode using first-frame and last-frame images as keyframes. ' +
        'The first frame node and last frame node must already have generated images. ' +
        'Calls the configured video model with the keyframe references and stores the result ' +
        "in the target node's generatedVideo field. Returns error if media service is unavailable.",
      parameters: {
        type: 'object',
        properties: {
          nodeId: {
            type: 'string',
            description: 'Target ShotNode ID where the generated video will be stored',
          },
          firstFrameNodeId: {
            type: 'string',
            description: 'ShotNode ID whose generatedImage is used as the first (start) frame',
          },
          lastFrameNodeId: {
            type: 'string',
            description: 'ShotNode ID whose generatedImage is used as the last (end) frame',
          },
          duration: {
            type: 'number',
            description: 'Video duration in seconds (default: 3)',
          },
          aspectRatio: {
            type: 'string',
            description: 'Aspect ratio e.g. "16:9" or "9:16" (default: "16:9")',
          },
        },
        required: ['nodeId', 'firstFrameNodeId', 'lastFrameNodeId'],
      } satisfies ToolParameters,
      execute: async (args) => {
        const api = await getAPI();
        const nodeId = args.nodeId as string;
        const firstFrameNodeId = args.firstFrameNodeId as string;
        const lastFrameNodeId = args.lastFrameNodeId as string;
        const duration = (args.duration as number | undefined) ?? 3;
        const aspectRatio = (args.aspectRatio as string | undefined) ?? '16:9';

        // Fetch all three nodes in parallel
        const [targetNode, firstNode, lastNode] = await Promise.all([
          api.nodes.get(nodeId),
          api.nodes.get(firstFrameNodeId),
          api.nodes.get(lastFrameNodeId),
        ]);

        if (!targetNode) return { error: `Target node "${nodeId}" not found` };
        if (!firstNode) return { error: `First frame node "${firstFrameNodeId}" not found` };
        if (!lastNode) return { error: `Last frame node "${lastFrameNodeId}" not found` };

        const firstFrameData = (firstNode.data as Record<string, unknown>)['generatedImage'] as
          | string
          | undefined;
        const lastFrameData = (lastNode.data as Record<string, unknown>)['generatedImage'] as
          | string
          | undefined;

        if (!firstFrameData) {
          return {
            error: `First frame node "${firstFrameNodeId}" has no generated image. Run canvas_generate_image first.`,
          };
        }

        // Build prompt from target node's visual description
        const visualDesc = (targetNode.data as Record<string, unknown>)['visualDescription'] as
          | string
          | undefined;
        const shotNumber = (targetNode.data as Record<string, unknown>)['shotNumber'] as
          | number
          | undefined;
        const prompt = visualDesc?.trim() || `Shot ${shotNumber ?? ''} video clip`;
        const lineage = extractCanvasNodeGenerationLineage(targetNode);
        const metadata: Record<string, unknown> = {
          sourceNodeId: lineage?.sourceNodeId ?? nodeId,
        };
        if (lastFrameData) {
          metadata['lastFrameUrl'] = lastFrameData;
        }
        if (lineage?.characterIds && lineage.characterIds.length > 0) {
          metadata['characterIds'] = [...lineage.characterIds];
        }

        // Mark node as generating
        await api.nodes.update(nodeId, { generationStatus: 'generating' });

        let task;
        try {
          task = await media.generateVideo({
            prompt,
            aspectRatio,
            duration,
            referenceImageUrl: firstFrameData,
            metadata,
          });
        } catch (err) {
          await api.nodes.update(nodeId, { generationStatus: 'error' });
          return { error: `Video generation failed to start: ${String(err)}` };
        }

        // Wait for completion (up to 5 minutes)
        let completed;
        try {
          completed = await media.waitForTask(task.id, 5 * 60 * 1000);
        } catch (err) {
          await api.nodes.update(nodeId, { generationStatus: 'error' });
          return { error: `Video generation timed out: ${String(err)}` };
        }

        if (completed.status !== 'completed' || !completed.outputs?.length) {
          await api.nodes.update(nodeId, { generationStatus: 'error' });
          return {
            error: `Video generation ${completed.status}${completed.error ? `: ${completed.error.message}` : ''}`,
          };
        }

        const output = completed.outputs[0]!;
        await api.nodes.update(nodeId, {
          generatedVideo: output.url,
          generationStatus: 'done',
        });

        logger.info(`canvas_generate_video_with_keyframes: nodeId=${nodeId} taskId=${task.id}`);
        return {
          success: true,
          message: `Video generated for shot "${nodeId}"`,
          videoUrl: output.url,
          taskId: task.id,
          duration,
          aspectRatio,
        };
      },
    });
  }

  return tools;
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
 * - GetScriptIndex    — structural index (scenes + characters with line numbers)
 * - SearchScriptIndex — semantic similarity search using text embeddings when
 *                       embedFn is provided; falls back to TF-IDF keyword search
 *                       so the tool is always available regardless of provider config.
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

  // SearchScriptIndex — always registered; uses vector embeddings when embedFn is
  // configured, or falls back to TF-IDF keyword scoring so the tool works even
  // without an embedding provider.
  tools.push({
    name: 'SearchScriptIndex',
    description:
      'Search scenes in a Fountain screenplay by meaning or keywords. ' +
      (embedFn
        ? 'Uses semantic vector search for rich queries like "tense confrontation" or "scenes about loss". '
        : 'Uses keyword scoring (no embedding provider configured). ') +
      'Returns the top matching scenes with scene IDs, scores, and line numbers. ' +
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

      // 2. Read file content to extract scene body text for richer matching
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

      // 4a. Vector path — requires embedFn (preferred)
      if (embedFn) {
        // Ensure embeddings are cached (re-embeds if total_lines changed)
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

        let queryVec: number[];
        try {
          const result = await embedFn([query]);
          queryVec = result[0] ?? [];
        } catch (err) {
          return { error: `Failed to embed query: ${String(err)}` };
        }

        const results = scriptEmbeddingIndex.search(queryVec, cachedEmbeddings, topK);
        logger.info(
          `SearchScriptIndex: query="${query}" topK=${topK} scenes=${index.scenes.length} results=${results.length} mode=vector`,
        );
        return { results, mode: 'vector' };
      }

      // 4b. TF-IDF keyword fallback — no embedding provider required.
      // Score each scene by how many query tokens appear in its text (case-insensitive).
      const queryTokens = query
        .toLowerCase()
        .split(/\W+/)
        .filter((t) => t.length > 1);

      if (queryTokens.length === 0) {
        return { results: [], message: 'Query produced no searchable tokens.' };
      }

      const scored = sceneTexts.map((scene) => {
        const haystack = `${scene.heading} ${scene.text}`.toLowerCase();
        // Term-frequency: count each token hit, weighted by heading match
        let score = 0;
        for (const token of queryTokens) {
          const headingHit = scene.heading.toLowerCase().includes(token);
          const bodyCount = (haystack.match(new RegExp(token, 'g')) ?? []).length;
          score += headingHit ? bodyCount + 2 : bodyCount; // heading bonus
        }
        return {
          scene_id: scene.id,
          score: parseFloat((score / queryTokens.length).toFixed(3)),
          line_start: scene.line_start,
          line_end: scene.line_end,
          heading: scene.heading,
        };
      });

      const results = scored
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

      logger.info(
        `SearchScriptIndex: query="${query}" topK=${topK} scenes=${index.scenes.length} results=${results.length} mode=tfidf`,
      );
      return {
        results,
        mode: 'tfidf',
        note: 'Configure an embedding provider for semantic search.',
      };
    },
  });

  // story_apply_suggestion — present an AI edit suggestion inline and let user accept/reject
  tools.push({
    name: 'story_apply_suggestion',
    description:
      'Propose a text edit to a specific range of a Fountain screenplay and let the user ' +
      'accept or reject it interactively. Opens the file, highlights the range, shows a modal ' +
      'with the suggested new text, and applies the edit only if the user accepts. ' +
      'Use this after analysing script content via GetScriptIndex and reading the relevant lines. ' +
      'Line numbers are 0-based, matching GetScriptIndex output.',
    parameters: {
      type: 'object',
      properties: {
        script_path: {
          type: 'string',
          description: 'Absolute path to the .fountain screenplay file',
        },
        start_line: {
          type: 'number',
          description: '0-based start line of the range to replace',
        },
        end_line: {
          type: 'number',
          description: '0-based end line (inclusive) of the range to replace',
        },
        new_text: {
          type: 'string',
          description: 'The replacement text (will replace the entire highlighted range)',
        },
      },
      required: ['script_path', 'start_line', 'end_line', 'new_text'],
    } satisfies ToolParameters,
    execute: async (args) => {
      const scriptPath = args.script_path as string;
      const startLine = args.start_line as number;
      const endLine = args.end_line as number;
      const newText = args.new_text as string;

      await vscode.commands.executeCommand('neko.story.applyInlineDiff', {
        scriptPath,
        range: {
          start: { line: startLine, character: 0 },
          end: { line: endLine, character: Number.MAX_SAFE_INTEGER },
        },
        newText,
      });

      logger.info(
        `story_apply_suggestion: presented diff for ${scriptPath} lines ${startLine}–${endLine}`,
      );
      return { presented: true, scriptPath, startLine, endLine };
    },
  });

  // import_script_to_canvas — convert screenplay scenes to SceneGroupNode + ShotNode chain
  // Requires both NekoStory (script index) and NekoCanvas (node creation)
  const canvasExt = vscode.extensions.getExtension<NekoCanvasAPI>('neko.nekocanvas');
  if (canvasExt) {
    const getCanvasAPI = async (): Promise<NekoCanvasAPI> => {
      if (canvasExt.isActive) return canvasExt.exports;
      return canvasExt.activate() as Promise<NekoCanvasAPI>;
    };

    tools.push({
      name: 'import_script_to_canvas',
      description:
        'Import a Fountain screenplay into the active canvas as a storyboard skeleton. ' +
        'Supports two code paths: mechanical skeleton import, or semantic import when ScenePlan/ShotPlan data is provided.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute path to the .fountain screenplay file',
          },
          mode: {
            type: 'string',
            enum: ['mechanical', 'semantic'],
            description:
              'Storyboard import mode. mechanical = line-heuristic skeleton, semantic = use ScenePlan/ShotPlan input when provided.',
          },
          startX: {
            type: 'number',
            description: 'Canvas X position of the first SceneGroupNode (default: 100)',
          },
          startY: {
            type: 'number',
            description: 'Canvas Y position of the first SceneGroupNode (default: 100)',
          },
          scenesLimit: {
            type: 'number',
            description: 'Maximum number of scenes to import (default: all, max: 50)',
          },
          scenePlans: {
            type: 'array',
            description:
              'Optional semantic ScenePlan/ShotPlan array. Used when mode=semantic; falls back to mechanical planning when omitted.',
          },
        },
        required: ['path'],
      } satisfies ToolParameters,
      execute: async (args) => {
        const storyApi = await getAPI();
        const canvasApi = await getCanvasAPI();

        const index = storyApi.getScriptIndex(args.path as string);
        if (!index) {
          return {
            error: 'Script not indexed. Open the .fountain file in VSCode first, then retry.',
          };
        }
        if (index.scenes.length === 0) {
          return { error: 'No scenes found in this screenplay.' };
        }

        const startX = (args.startX as number | undefined) ?? 100;
        const startY = (args.startY as number | undefined) ?? 100;
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const characterBindings = await resolveCharacterBindingsForNames(
          index.characters.map((character) => character.name),
          {
            workspaceRoot,
            uriOrPath: args.path as string,
            characterResolver: storyApi,
          },
        );
        const payload = createStoryboardPayload(index, {
          mode: (args.mode as 'mechanical' | 'semantic' | undefined) ?? 'mechanical',
          scenesLimit: Math.min(
            (args.scenesLimit as number | undefined) ?? index.scenes.length,
            50,
          ),
          scenePlans: (args.scenePlans as StoryScenePlan[] | undefined) ?? [],
          characterBindings,
        });
        const created = await applyStoryboardPayloadToCanvas(canvasApi, payload, {
          startX,
          startY,
        });

        logger.info(
          `import_script_to_canvas: mode=${created.mode} scenes=${created.scenesCreated} shots=${created.totalShots}`,
        );
        return {
          success: true,
          mode: created.mode,
          scenesCreated: created.scenesCreated,
          totalShots: created.totalShots,
          scenes: created.scenes,
        };
      },
    });
  }

  return tools;
}

// =============================================================================
// NekoSketch Tools
// =============================================================================

/**
 * Create tools for NekoSketch AI integration.
 * Returns empty array if NekoSketch is not installed or media service is unavailable.
 *
 * Tools:
 * - SketchGenerate — Text-to-Image → import as new canvas layer
 * - SketchInpaint — Inpaint selected region using mask + AI
 * - SketchStyleTransfer — Apply artistic style to layer/canvas
 * - SketchAutoLayer — Decompose image into line art / color / shadow / highlight layers
 */
export function createNekoSketchTools(media: MediaGenerationService | undefined): Tool[] {
  const ext = vscode.extensions.getExtension<NekoSketchAPI>('neko.neko-sketch');

  if (!ext) {
    logger.info('NekoSketch extension not found, skipping NekoSketch tools');
    return [];
  }

  if (!media) {
    logger.info('MediaGenerationService unavailable, skipping NekoSketch tools');
    return [];
  }

  const getAPI = async (): Promise<NekoSketchAPI> => {
    if (ext.isActive) {
      return ext.exports;
    }
    return ext.activate() as Promise<NekoSketchAPI>;
  };

  return [
    {
      name: 'SketchGenerate',
      description:
        'Generate a 2D image from a text prompt using AI and import it as a new layer in ' +
        'the active neko-sketch canvas. Waits for generation to complete before importing. ' +
        'Returns an error if no sketch editor is currently open.',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Text description of the image to generate',
          },
          size: {
            type: 'string',
            enum: ['512x512', '1024x1024', '1792x1024', '1024x1792'],
            description: 'Image dimensions (default: 1024x1024)',
          },
          layerName: {
            type: 'string',
            description: 'Name for the new layer (default: derived from prompt)',
          },
        },
        required: ['prompt'],
      } satisfies ToolParameters,
      execute: async (args) => {
        const prompt = args.prompt as string;
        const sizeStr = (args.size as string | undefined) ?? '1024x1024';
        const layerName =
          (args.layerName as string | undefined) ??
          `AI-${prompt.slice(0, 20).replace(/\s+/g, '-')}`;

        // Submit generation task
        const [w, h] = sizeStr.split('x').map(Number);
        let task;
        try {
          task = await media.generateImage({ prompt, width: w, height: h });
        } catch (err) {
          return { error: `Image generation failed: ${String(err)}` };
        }

        // Wait for completion (up to 3 minutes)
        let completed;
        try {
          completed = await media.waitForTask(task.id, 3 * 60 * 1000);
        } catch (err) {
          return { error: `Waiting for image timed out or failed: ${String(err)}` };
        }

        if (completed.status !== 'completed' || !completed.outputs?.length) {
          return {
            error: `Generation ${completed.status}${completed.error ? `: ${completed.error.message}` : ''}`,
          };
        }

        const output = completed.outputs[0]!;
        const imageUrl = output.url;

        // Download image and convert to base64
        let base64: string;
        try {
          const response = await fetch(imageUrl);
          if (!response.ok) {
            return { error: `Failed to download generated image: HTTP ${response.status}` };
          }
          const arrayBuffer = await response.arrayBuffer();
          base64 = Buffer.from(arrayBuffer).toString('base64');
        } catch (err) {
          return { error: `Failed to fetch generated image: ${String(err)}` };
        }

        // Import into the active sketch canvas
        const api = await getAPI();
        api.importImageData(base64, `${layerName}.png`);

        logger.info(`SketchGenerate: imported layer "${layerName}" (${sizeStr})`);
        return {
          success: true,
          message: `图像已生成并导入画布，图层名称：${layerName}`,
          size: sizeStr,
          taskId: task.id,
        };
      },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // SketchInpaint — Repaint a selected region using AI
    // ─────────────────────────────────────────────────────────────────────────
    {
      name: 'SketchInpaint',
      description:
        'Inpaint (locally redraw) the rectangular selection in the active neko-sketch canvas. ' +
        'Requires an active rectangular selection. The selected region is regenerated with ' +
        'AI-generated content and added as a new layer above the current one.',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'What to draw in the selected area',
          },
          strength: {
            type: 'number',
            description:
              'Inpaint strength 0.0–1.0 (default: 0.8). Higher = more creative, lower = closer to original.',
          },
          layerName: {
            type: 'string',
            description: 'Name for the result layer (default: "Inpaint")',
          },
        },
        required: ['prompt'],
      } satisfies ToolParameters,
      execute: async (args) => {
        const api = await getAPI();

        const selection = await api.getSelectionMask();
        if (!selection) {
          return {
            error:
              'No active selection in sketch editor. Use a selection tool first (rect/lasso/wand).',
          };
        }

        const prompt = args.prompt as string;
        const strength = (args.strength as number | undefined) ?? 0.8;
        const layerName = (args.layerName as string | undefined) ?? 'Inpaint';

        let task;
        try {
          task = await media.generateImage({
            prompt,
            referenceImageBase64: selection.layerImageData,
            maskBase64: selection.mask,
            inpaintStrength: strength,
            width: selection.width,
            height: selection.height,
          });
        } catch (err) {
          return { error: `Inpaint generation failed: ${String(err)}` };
        }

        let completed;
        try {
          completed = await media.waitForTask(task.id, 3 * 60 * 1000);
        } catch (err) {
          return { error: `Waiting for inpaint timed out: ${String(err)}` };
        }

        if (completed.status !== 'completed' || !completed.outputs?.length) {
          return {
            error: `Inpaint ${completed.status}${completed.error ? `: ${completed.error.message}` : ''}`,
          };
        }

        const output = completed.outputs[0]!;
        let base64: string;
        try {
          const response = await fetch(output.url);
          if (!response.ok) {
            return { error: `Failed to download inpainted image: HTTP ${response.status}` };
          }
          base64 = Buffer.from(await response.arrayBuffer()).toString('base64');
        } catch (err) {
          return { error: `Failed to fetch inpainted image: ${String(err)}` };
        }

        api.importImageData(base64, `${layerName}.png`);
        logger.info(`SketchInpaint: imported inpainted layer "${layerName}"`);
        return {
          success: true,
          message: `局部重绘完成，图层名称：${layerName}`,
          taskId: task.id,
        };
      },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // SketchStyleTransfer — Apply an artistic style to the active layer/canvas
    // ─────────────────────────────────────────────────────────────────────────
    {
      name: 'SketchStyleTransfer',
      description:
        'Apply an artistic style transformation to the active layer or full canvas composite. ' +
        'The result is added as a new layer. Use for converting sketches to anime, painting, etc.',
      parameters: {
        type: 'object',
        properties: {
          style: {
            type: 'string',
            enum: ['anime', 'oil-painting', 'watercolor', 'pixel-art', 'sketch', 'comic', 'ghibli'],
            description: 'Target artistic style',
          },
          prompt: {
            type: 'string',
            description: 'Additional style guidance (optional)',
          },
          strength: {
            type: 'number',
            description: 'Style strength 0.0–1.0 (default: 0.7)',
          },
          scope: {
            type: 'string',
            enum: ['layer', 'canvas'],
            description: 'Apply to active layer or full canvas composite (default: canvas)',
          },
          layerName: {
            type: 'string',
            description: 'Name for the result layer (default: derived from style)',
          },
        },
        required: ['style'],
      } satisfies ToolParameters,
      execute: async (args) => {
        const api = await getAPI();

        const style = args.style as string;
        const strength = (args.strength as number | undefined) ?? 0.7;
        const scope = (args.scope as string | undefined) ?? 'canvas';
        const extraPrompt = (args.prompt as string | undefined) ?? '';
        const layerName = (args.layerName as string | undefined) ?? `${style}-style`;

        const imageData =
          scope === 'layer' ? await api.getLayerImageData() : await api.getCanvasImageData();

        if (!imageData) {
          return { error: 'No image data available from sketch editor' };
        }

        const stylePromptMap: Record<string, string> = {
          anime: 'anime style illustration, cel shading, vibrant colors',
          'oil-painting': 'oil painting, thick brushstrokes, textured canvas, artistic',
          watercolor: 'watercolor painting, soft washes, transparent layers',
          'pixel-art': 'pixel art, 8-bit retro style, pixelated',
          sketch: 'pencil sketch, line art, black and white',
          comic: 'comic book style, bold outlines, halftone shading',
          ghibli: 'Studio Ghibli animation style, soft colors, hand-drawn',
        };
        const stylePrompt = stylePromptMap[style] ?? style;
        const fullPrompt = extraPrompt ? `${stylePrompt}, ${extraPrompt}` : stylePrompt;

        let task;
        try {
          task = await media.generateImage({
            prompt: fullPrompt,
            referenceImageBase64: imageData,
            inpaintStrength: strength,
            style,
          });
        } catch (err) {
          return { error: `Style transfer failed: ${String(err)}` };
        }

        let completed;
        try {
          completed = await media.waitForTask(task.id, 3 * 60 * 1000);
        } catch (err) {
          return { error: `Style transfer timed out: ${String(err)}` };
        }

        if (completed.status !== 'completed' || !completed.outputs?.length) {
          return {
            error: `Style transfer ${completed.status}${completed.error ? `: ${completed.error.message}` : ''}`,
          };
        }

        const output = completed.outputs[0]!;
        let base64: string;
        try {
          const response = await fetch(output.url);
          if (!response.ok) {
            return { error: `Failed to download styled image: HTTP ${response.status}` };
          }
          base64 = Buffer.from(await response.arrayBuffer()).toString('base64');
        } catch (err) {
          return { error: `Failed to fetch styled image: ${String(err)}` };
        }

        api.importImageData(base64, `${layerName}.png`);
        logger.info(`SketchStyleTransfer: imported "${layerName}" (style=${style})`);
        return {
          success: true,
          message: `风格迁移完成，图层名称：${layerName}`,
          style,
          taskId: task.id,
        };
      },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // SketchAutoLayer — Decompose image into separate artistic layers via AI
    // ─────────────────────────────────────────────────────────────────────────
    {
      name: 'SketchAutoLayer',
      description:
        'Automatically decompose the active layer or canvas into separate layers: ' +
        'line art, flat color, shadow, and highlight. Each decomposed component is imported ' +
        'as an individual layer. Note: requires AI provider support for image decomposition.',
      parameters: {
        type: 'object',
        properties: {
          layers: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['lineart', 'flatcolor', 'shadow', 'highlight'],
            },
            description: 'Which layers to extract (default: all four)',
          },
        },
      } satisfies ToolParameters,
      execute: async (args) => {
        const api = await getAPI();
        const requestedLayers = (args.layers as string[] | undefined) ?? [
          'lineart',
          'flatcolor',
          'shadow',
          'highlight',
        ];

        const imageData = await api.getCanvasImageData();
        if (!imageData) {
          return { error: 'No canvas image data available' };
        }

        // Generate each layer component via style-transfer approach
        const layerStyleMap: Record<string, string> = {
          lineart: 'line art extraction, black outlines on white background, no fill',
          flatcolor: 'flat color extraction, solid colors, no shading or outlines',
          shadow: 'shadow layer extraction, dark values only, multiply blend mode',
          highlight: 'highlight layer extraction, bright values only, screen blend mode',
        };

        const results: string[] = [];
        for (const layerType of requestedLayers) {
          const stylePrompt = layerStyleMap[layerType];
          if (!stylePrompt) continue;

          try {
            const task = await media.generateImage({
              prompt: stylePrompt,
              referenceImageBase64: imageData,
              inpaintStrength: 1.0,
            });
            const completed = await media.waitForTask(task.id, 3 * 60 * 1000);

            if (completed.status === 'completed' && completed.outputs?.length) {
              const output = completed.outputs[0]!;
              const response = await fetch(output.url);
              if (response.ok) {
                const base64 = Buffer.from(await response.arrayBuffer()).toString('base64');
                api.importImageData(base64, `${layerType}.png`);
                results.push(layerType);
              }
            }
          } catch (err) {
            logger.warn(`SketchAutoLayer: failed to extract "${layerType}": ${String(err)}`);
          }
        }

        if (results.length === 0) {
          return { error: 'Failed to extract any layers. Check AI provider configuration.' };
        }

        logger.info(`SketchAutoLayer: imported layers: ${results.join(', ')}`);
        return {
          success: true,
          message: `已提取 ${results.length} 个图层：${results.join(', ')}`,
          layersCreated: results,
        };
      },
    },
  ];
}

// =============================================================================
// P2: NekoCut AI Video Generation Tool
// =============================================================================

/**
 * Create the AI video generation tool for NekoCut.
 * Requires both neko-cut (timeline) and a MediaGenerationService (video provider).
 * Returns empty array if either is unavailable.
 */
export function createNekoCutVideoGenerationTools(media?: MediaGenerationService): Tool[] {
  const nekocutExt = vscode.extensions.getExtension<NekoCutAPI>('neko.nekocut');
  if (!nekocutExt) return [];
  if (!media) {
    logger.info('MediaGenerationService unavailable, skipping NekoCut video generation tool');
    return [];
  }

  const getAPI = async (): Promise<NekoCutAPI> => {
    if (nekocutExt.isActive) return nekocutExt.exports;
    return nekocutExt.activate() as Promise<NekoCutAPI>;
  };

  return [
    {
      name: 'GenerateVideoForClip',
      description:
        'Generate an AI video clip from a text prompt and automatically add it to the NekoCut ' +
        'timeline. Optionally accepts a reference image (base64 PNG/JPEG) for image-to-video ' +
        'generation. The clip is placed at the end of the first video track unless trackId and ' +
        'startTime are specified. Returns the new timeline element ID.',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Text description of the video to generate',
          },
          trackId: {
            type: 'string',
            description: 'Timeline track ID to insert into (default: first video track)',
          },
          startTime: {
            type: 'number',
            description: 'Start time in seconds (default: end of selected track)',
          },
          referenceImageBase64: {
            type: 'string',
            description: 'Base64-encoded PNG/JPEG for image-to-video generation (optional)',
          },
          durationHint: {
            type: 'number',
            description:
              'Requested duration in seconds — actual length depends on provider (default: 5)',
          },
        },
        required: ['prompt'],
      } satisfies ToolParameters,
      execute: async (args) => {
        const api = await getAPI();
        const prompt = args.prompt as string;
        const durationHint = (args.durationHint as number | undefined) ?? 5;
        const referenceImageBase64 = args.referenceImageBase64 as string | undefined;

        logger.info(
          `GenerateVideoForClip: prompt="${prompt.slice(0, 80)}" duration=${durationHint}s`,
        );

        // Submit generation task
        let task;
        try {
          task = await media.generateVideo({
            prompt,
            referenceImageBase64,
            durationSeconds: durationHint,
          });
        } catch (err) {
          return { error: `Video generation failed to start: ${String(err)}` };
        }

        // Wait for completion (up to 10 minutes for longer clips)
        let completed;
        try {
          completed = await media.waitForTask(task.id, 10 * 60 * 1000);
        } catch (err) {
          return { error: `Video generation timed out: ${String(err)}` };
        }

        if (completed.status !== 'completed' || !completed.outputs?.length) {
          return {
            error: `Video generation ${completed.status}${completed.error ? `: ${completed.error.message}` : ''}`,
          };
        }

        const output = completed.outputs[0]!;
        const videoUrl = output.url;

        // Determine target track and start time from timeline info
        const timelineInfo = await api.timeline.getInfo().catch(() => null);
        const resolvedTrackId = (args.trackId as string | undefined) ?? 'track-0';
        const resolvedStartTime =
          (args.startTime as number | undefined) ?? timelineInfo?.duration ?? 0;

        // Add generated video clip to the timeline
        const elementId = await api.timeline.addElement({
          type: 'video',
          trackId: resolvedTrackId,
          startTime: resolvedStartTime,
          duration: durationHint,
          source: videoUrl,
          generatedBy: 'ai',
          prompt,
          taskId: task.id,
        });

        logger.info(
          `GenerateVideoForClip: element ${elementId} added at t=${resolvedStartTime}s track=${resolvedTrackId}`,
        );

        return {
          success: true,
          elementId,
          trackId: resolvedTrackId,
          startTime: resolvedStartTime,
          videoUrl,
          taskId: task.id,
        };
      },
    },
  ];
}

// =============================================================================
// P3: Skill Provider Discovery Tool
// =============================================================================

/**
 * Create the ListPluginSkills tool which enumerates all SkillDef entries
 * advertised by installed Neko extensions that implement ISkillProvider.
 *
 * This gives the agent (and the user via the skill browser) a live, up-to-date
 * catalogue of what each plugin can do, without hard-coding capabilities.
 */
export function createSkillProviderTools(): Tool[] {
  const SKILL_EXTENSION_IDS = [
    'neko.nekocut',
    'neko.nekocanvas',
    'neko.neko-story',
    'neko.neko-sketch',
    'neko.neko-auth',
  ] as const;

  return [
    {
      name: 'ListPluginSkills',
      description:
        'List all AI capabilities (skills) advertised by installed Neko suite plugins. ' +
        'Returns a catalogue of skills grouped by extension, each with an id, name, description, ' +
        'tags, and the VSCode command to invoke it. Use this to discover what plugins can do ' +
        'before recommending or invoking a workflow.',
      parameters: {
        type: 'object',
        properties: {
          tag: {
            type: 'string',
            description: 'Optional tag filter (e.g. "generation", "image", "timeline")',
          },
        },
      } satisfies ToolParameters,
      execute: async (args) => {
        const tagFilter = args.tag as string | undefined;

        const catalogue: Array<{
          extensionId: string;
          skills: import('@neko/shared').SkillDef[];
        }> = [];

        for (const extId of SKILL_EXTENSION_IDS) {
          const ext = vscode.extensions.getExtension<{
            getSkills?: () => import('@neko/shared').SkillDef[];
          }>(extId);
          if (!ext) continue;

          let exports: { getSkills?: () => import('@neko/shared').SkillDef[] };
          try {
            exports = ext.isActive ? ext.exports : await ext.activate();
          } catch {
            continue;
          }

          if (typeof exports?.getSkills !== 'function') continue;

          let skills: import('@neko/shared').SkillDef[];
          try {
            skills = exports.getSkills();
          } catch {
            continue;
          }

          if (tagFilter) {
            skills = skills.filter((s) => s.tags?.includes(tagFilter));
          }

          if (skills.length > 0) {
            catalogue.push({ extensionId: extId, skills });
          }
        }

        const totalSkills = catalogue.reduce((n, e) => n + e.skills.length, 0);
        logger.info(
          `ListPluginSkills: found ${totalSkills} skills across ${catalogue.length} extensions`,
        );
        return { catalogue, totalSkills };
      },
    },
  ];
}
