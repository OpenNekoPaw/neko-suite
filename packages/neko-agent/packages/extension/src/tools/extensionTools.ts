/**
 * Extension Tools - Tools for interacting with other Neko extensions
 *
 * Provides tool definitions for NekoCut and NekoCanvas integration.
 * Uses VSCode Extension API for inter-extension communication.
 */

import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import AdmZip from 'adm-zip';
import type {
  NekoCutAPI,
  NekoCanvasAPI,
  NekoStoryAPI,
  NekoSketchAPI,
  ToolParameters,
} from '@neko/shared';
import { ScriptEmbeddingIndex, type EmbedFn } from '../services/ScriptEmbeddingIndex';
import { setActiveGenerationConfig } from '../services/canvasAmbientContext';
import type { MediaGenerationService } from '@neko/platform';
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
export function createNekoCanvasTools(media?: MediaGenerationService): Tool[] {
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
        fs.writeFileSync(saveUri.fsPath, zipBuffer);

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

        // Mark node as generating
        await api.nodes.update(nodeId, { generationStatus: 'generating' });

        let task;
        try {
          task = await media.generateVideo({
            prompt,
            aspectRatio,
            duration,
            referenceImageUrl: firstFrameData,
            // Pass last frame via metadata for adapters that support keyframe endpoints
            metadata: lastFrameData ? { lastFrameUrl: lastFrameData } : undefined,
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
        'Each scene heading becomes a SceneGroupNode; each dialogue/action block becomes a ShotNode ' +
        'inside its parent scene. Call GetScriptIndex first to verify the file is indexed.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute path to the .fountain screenplay file',
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
        const maxScenes = Math.min(
          (args.scenesLimit as number | undefined) ?? index.scenes.length,
          50,
        );

        const SCENE_WIDTH = 900;
        const SCENE_GAP = 80;
        const SHOT_WIDTH = 200;
        const SHOT_GAP = 20;

        const created: { sceneId: string; shotIds: string[] }[] = [];

        for (let si = 0; si < maxScenes; si++) {
          const scene = index.scenes[si];
          if (!scene) continue;
          const sceneX = startX + si * (SCENE_WIDTH + SCENE_GAP);

          // Create SceneGroupNode
          const sceneNodeId = await canvasApi.nodes.create(
            'scene' as import('@neko/shared').CanvasNodeType,
            { x: sceneX, y: startY },
            {
              sceneTitle: scene.heading,
              sceneNumber: si + 1,
              shotIds: [] as string[],
            },
          );

          // Create ShotNodes for each dialogue/action block in the scene
          // We estimate shots from line range: one shot per ~10 lines, min 1
          const lineSpan = scene.line_end - scene.line_start;
          const shotCount = Math.max(1, Math.min(Math.round(lineSpan / 10), 8));
          const shotIds: string[] = [];

          for (let sh = 0; sh < shotCount; sh++) {
            const shotX = sceneX + sh * (SHOT_WIDTH + SHOT_GAP);
            const shotY = startY + 240;
            const shotNodeId = await canvasApi.nodes.create(
              'shot' as import('@neko/shared').CanvasNodeType,
              { x: shotX, y: shotY },
              {
                shotNumber: si * 8 + sh + 1,
                sceneGroupId: sceneNodeId,
                duration: 3,
                visualDescription: '',
                shotScale: 'MS' as const,
                characters: [] as unknown[],
                emotion: [] as string[],
                sceneTags: [] as string[],
                generationStatus: 'idle' as const,
                generationHistory: [] as unknown[],
              },
            );
            shotIds.push(shotNodeId);
          }

          // Update SceneGroupNode with shot IDs
          await canvasApi.nodes.update(sceneNodeId, { shotIds });

          created.push({ sceneId: sceneNodeId, shotIds });
        }

        logger.info(
          `import_script_to_canvas: created ${created.length} scenes with ${created.reduce((n, s) => n + s.shotIds.length, 0)} shots`,
        );
        return {
          success: true,
          scenesCreated: created.length,
          totalShots: created.reduce((n, s) => n + s.shotIds.length, 0),
          scenes: created,
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
  ];
}
