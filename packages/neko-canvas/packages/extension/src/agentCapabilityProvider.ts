/**
 * NekoCanvas Agent Capability Provider
 *
 * Provides canvas editing, storyboard, and generation tools to neko-agent
 * via the AgentCapabilityProvider protocol.
 *
 * This replaces the `createNekoCanvasTools()` factory function that was previously
 * maintained inside neko-agent's extension code.
 */

import * as vscode from 'vscode';
import type {
  AgentCapabilityProvider,
  AgentCapabilityContext,
  Tool,
  ToolGroup,
  ToolParameters,
  PromptFragment,
  NekoCanvasAPI,
  CanvasNodeType,
  ICapabilityMediaService,
  ICapabilityConfigManager,
  NekoStoryAPI,
  StoryScenePlan,
  JsonPointerPath,
  CanvasStoryboardExecutionSummaryRequest,
  CanvasAgentContentFormat,
  CanvasAgentMutationMode,
  CanvasConnection,
} from '@neko/shared';
import {
  TOOL_NAMES_CANVAS,
  CANVAS_AGENT_CHILD_PRESETS,
  CANVAS_AGENT_CONTAINER_PRESETS,
  CANVAS_AGENT_CREATE_NODE_TYPES,
  CANVAS_AGENT_DERIVE_TARGET_PRESETS,
  CANVAS_AGENT_NODE_PRESETS,
  applyCanvasTimelineSyncToCanvas,
  applyStoryboardPayloadToCanvas,
  buildStoryboardImportTimelineSyncPayload,
  createStoryboardPayload,
  extractCanvasNodeGenerationLineage,
  getNodeParentId,
  isCanvasNodeType,
  traverseNarrativeFlow,
} from '@neko/shared';
import { resolveCharacterBindingsForNames } from '@neko/shared/vscode/extension';
import { getRootLogger } from './utils/logger';

/**
 * Create the NekoCanvas capability provider.
 *
 * @param api The NekoCanvasAPI exports from the extension activation
 */
export function createNekoCanvasCapabilityProvider(api: NekoCanvasAPI): AgentCapabilityProvider {
  return new NekoCanvasCapabilityProviderImpl(api);
}

/**
 * Auto-resolve model from ConfigManager when workspace config has no model set.
 * Writes to workspace config so neko-canvas can read it on next generation.
 */
async function ensureProjectModel(
  configManager: ICapabilityConfigManager | undefined,
  type: 'image' | 'video' | 'audio',
): Promise<void> {
  if (!configManager) return;
  const key = `neko.project.models.${type}`;
  const wsConfig = vscode.workspace.getConfiguration();
  const current = wsConfig.get<string>(key, '');
  if (current) return;
  const model = configManager.getEnabledModels().find((m) => m.type === type);
  if (model?.name) {
    await wsConfig.update(key, model.name, vscode.ConfigurationTarget.Workspace);
    getRootLogger().info(`Auto-resolved ${type} model from ConfigManager: ${model.name}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseToolValue(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }

  if (
    trimmed === 'true' ||
    trimmed === 'false' ||
    trimmed === 'null' ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('[') ||
    /^-?\d+(\.\d+)?$/.test(trimmed)
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }

  return value;
}

function normalizeJsonPointerPath(value: unknown): JsonPointerPath | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  if (value === '' || value.startsWith('/')) {
    return value as JsonPointerPath;
  }
  throw new Error(`Invalid JSON Pointer path "${value}"`);
}

function readOptionalCanvasNodeType(value: unknown, label = 'node type'): CanvasNodeType | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (isCanvasNodeType(value)) {
    return value;
  }
  throw new Error(`Unsupported Canvas ${label} "${String(value)}"`);
}

class NekoCanvasCapabilityProviderImpl implements AgentCapabilityProvider {
  readonly id = 'neko-canvas';
  readonly version = '1.0.0';

  constructor(private readonly _api: NekoCanvasAPI) {}

  getPromptFragments(_context: AgentCapabilityContext): PromptFragment[] {
    return [
      {
        id: 'neko-canvas:multi-purpose-canvas-subsystems',
        priority: 70,
        content: [
          'Neko Canvas .nkc files can mix storyboard, narrative, behavior, entity, and memory subsystems in one graph.',
          'Use canvas_get_active_context({ includeSubsystemMetadata: true }) before subsystem-aware edits; inspect activeSubsystems and subsystem metadata before choosing tools or mutations.',
          'Narrative traversal applies only to narrative nodes and choice connections. It ignores storyboard, behavior, entity, and memory nodes by design.',
          'Projected Canvas documents are adapter-backed views. Do not assume direct .nkc edits write to the source document; route source write-back through projection adapters.',
        ].join('\n'),
      },
    ];
  }

  getTools(context: AgentCapabilityContext): Tool[] {
    const api = this._api;
    const logger = getRootLogger();
    const configManager = context.configManager;
    const mediaService = context.mediaService;

    const tools: Tool[] = [
      // -----------------------------------------------------------------------
      // Canvas management tools
      // -----------------------------------------------------------------------
      {
        name: TOOL_NAMES_CANVAS.CREATE_CANVAS,
        description: 'Create a new canvas',
        category: 'project',
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
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const data = await api.canvas.create({
              name: args.name as string,
              width: args.width as number,
              height: args.height as number,
              backgroundColor: args.backgroundColor as string | undefined,
            });
            return { success: true, data };
          } catch (err) {
            return { success: false, error: `Failed to create canvas: ${String(err)}` };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.ADD_CANVAS_SHAPE,
        description: 'Add a shape to a canvas',
        category: 'project',
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
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const { canvasId, ...shape } = args;
            const data = await api.canvas.addShape(canvasId as string, {
              type: shape.type as 'rectangle' | 'ellipse' | 'polygon' | 'path' | 'text',
              x: shape.x as number,
              y: shape.y as number,
              width: shape.width as number | undefined,
              height: shape.height as number | undefined,
              fill: shape.fill as string | undefined,
              stroke: shape.stroke as string | undefined,
            });
            return { success: true, data };
          } catch (err) {
            return { success: false, error: `Failed to add shape: ${String(err)}` };
          }
        },
      },

      // -----------------------------------------------------------------------
      // Storyboard / Node tools
      // -----------------------------------------------------------------------
      {
        name: TOOL_NAMES_CANVAS.CANVAS_LIST_NODES,
        description:
          'List all nodes on the active canvas. Optionally filter by type (shot, scene, gallery, media, annotation, etc.).',
        category: 'project',
        isReadOnly: true,
        isConcurrencySafe: true,
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description: 'Optional node type filter',
            },
          },
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const data = await api.nodes.list(readOptionalCanvasNodeType(args.type));
            return { success: true, data };
          } catch (err) {
            return { success: false, error: `Failed to list nodes: ${String(err)}` };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_GET_NODE,
        description: 'Get full details of a single canvas node by its ID.',
        category: 'project',
        isReadOnly: true,
        isConcurrencySafe: true,
        parameters: {
          type: 'object',
          properties: {
            nodeId: { type: 'string', description: 'Canvas node ID' },
          },
          required: ['nodeId'],
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const data = await api.nodes.get(args.nodeId as string);
            return { success: true, data };
          } catch (err) {
            return { success: false, error: `Failed to get node: ${String(err)}` };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_UPDATE_NODE,
        description:
          "Update a canvas node's data fields. Use this to set shot descriptions, characters, " +
          'camera settings, or generation parameters. Always write generation params to the node ' +
          'before calling canvas_generate_image so they persist across sessions.',
        category: 'project',
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
        } satisfies ToolParameters,
        async execute(args) {
          try {
            await api.nodes.update(args.nodeId as string, args.data as Record<string, unknown>);
            return { success: true };
          } catch (err) {
            return { success: false, error: `Failed to update node: ${String(err)}` };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_CREATE_NODE,
        description: "Create a new node on the active canvas. Returns the new node's ID.",
        category: 'project',
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: [...CANVAS_AGENT_CREATE_NODE_TYPES],
              description: 'Node type',
            },
            preset: {
              type: 'string',
              enum: [...CANVAS_AGENT_NODE_PRESETS],
              description:
                'Optional registered Canvas preset. Legacy presets keep existing node rendering; composable presets opt into block rendering.',
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
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const nodeType = readOptionalCanvasNodeType(args.type);
            if (!nodeType) {
              throw new Error('Canvas node creation requires a node type');
            }
            const data = await api.nodes.create(
              nodeType,
              { x: args.x as number, y: args.y as number },
              args.data as object,
              args.preset as string | undefined,
            );
            return { success: true, data };
          } catch (err) {
            return { success: false, error: `Failed to create node: ${String(err)}` };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_DERIVE_NODE,
        description:
          'Derive a successor node from an existing Canvas node using registered preset rules, shared placement, and a normal Canvas connection.',
        category: 'project',
        parameters: {
          type: 'object',
          properties: {
            sourceNodeId: { type: 'string', description: 'Source Canvas node ID' },
            targetPreset: {
              type: 'string',
              enum: [...CANVAS_AGENT_DERIVE_TARGET_PRESETS],
              description:
                'Optional target preset from the registered global derive candidates. Source-specific preset rules are enforced at runtime.',
            },
            targetType: {
              type: 'string',
              enum: [...CANVAS_AGENT_CREATE_NODE_TYPES],
              description:
                'Optional registered Canvas node type. Used only when no targetPreset is provided.',
            },
            data: {
              type: 'object',
              description: 'Optional data overrides merged into the derived node defaults.',
            },
            connect: {
              type: 'boolean',
              description: 'Whether to connect source to derived node. Defaults to true.',
            },
          },
          required: ['sourceNodeId'],
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const data = await api.nodes.derive({
              sourceNodeId: args.sourceNodeId as string,
              targetPreset: args.targetPreset as string | undefined,
              targetType: readOptionalCanvasNodeType(args.targetType, 'derive target type'),
              data: args.data as Record<string, unknown> | undefined,
              connect: args.connect as boolean | undefined,
            });
            return { success: true, data };
          } catch (err) {
            return { success: false, error: `Failed to derive node: ${String(err)}` };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_CREATE_COMPOSITE,
        description:
          'Create a container and child nodes as one atomic Canvas mutation using container policy validation and shared auto-layout.',
        category: 'project',
        parameters: {
          type: 'object',
          properties: {
            containerPreset: {
              type: 'string',
              enum: [...CANVAS_AGENT_CONTAINER_PRESETS],
              description: 'Registered container preset, such as scene.basic or group.container.',
            },
            x: { type: 'number', description: 'Container X position' },
            y: { type: 'number', description: 'Container Y position' },
            data: {
              type: 'object',
              description: 'Container data defaults or overrides.',
            },
            children: {
              type: 'array',
              description: 'Child node specs. Each child may include preset, type, data, x, and y.',
              items: {
                type: 'object',
                properties: {
                  preset: {
                    type: 'string',
                    enum: [...CANVAS_AGENT_CHILD_PRESETS],
                  },
                  type: {
                    type: 'string',
                    enum: [...CANVAS_AGENT_CREATE_NODE_TYPES],
                  },
                  x: { type: 'number' },
                  y: { type: 'number' },
                  data: { type: 'object' },
                },
              },
            },
            autoLayout: {
              type: 'boolean',
              description:
                'Whether to auto-arrange children inside the container. Defaults to true.',
            },
          },
          required: ['containerPreset', 'children'],
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const children = Array.isArray(args.children)
              ? args.children.map((child) => {
                  const value = isRecord(child) ? child : {};
                  return {
                    preset: value.preset as string | undefined,
                    type: readOptionalCanvasNodeType(value.type, 'child node type'),
                    position:
                      typeof value.x === 'number' && typeof value.y === 'number'
                        ? { x: value.x, y: value.y }
                        : undefined,
                    data: isRecord(value.data) ? value.data : undefined,
                  };
                })
              : [];
            const data = await api.nodes.createComposite({
              containerPreset: args.containerPreset as string,
              position:
                typeof args.x === 'number' && typeof args.y === 'number'
                  ? { x: args.x, y: args.y }
                  : undefined,
              data: args.data as Record<string, unknown> | undefined,
              children,
              autoLayout: args.autoLayout as boolean | undefined,
            });
            return { success: true, data };
          } catch (err) {
            return { success: false, error: `Failed to create composite: ${String(err)}` };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_UPDATE_BLOCK,
        description:
          'Update a composable Canvas block through its binding or an explicit JSON Pointer path into node.data.',
        category: 'project',
        safetyKind: 'confirmation-gated',
        targetRequirements: {
          required: ['nodeId'],
          confirmationModes: ['replace', 'apply'],
        },
        queryBeforeMutate: {
          preferredQueryTools: [
            TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
            TOOL_NAMES_CANVAS.CANVAS_GET_NODE,
          ],
          reason: 'Resolve a stable Canvas node id and writable field path before updating data.',
        },
        parameters: {
          type: 'object',
          properties: {
            nodeId: { type: 'string', description: 'Canvas node ID' },
            blockId: { type: 'string', description: 'Composable block ID with a binding' },
            path: {
              type: 'string',
              description:
                'JSON Pointer path into node.data, for example /content or /cells/0/prompt.',
            },
            value: {
              type: 'string',
              description: 'New value. Objects should be passed as JSON text.',
            },
          },
          required: ['nodeId', 'value'],
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const data = await api.nodes.updateBlock({
              nodeId: args.nodeId as string,
              blockId: args.blockId as string | undefined,
              path: normalizeJsonPointerPath(args.path),
              value: parseToolValue(args.value),
            });
            return { success: true, data };
          } catch (err) {
            return { success: false, error: `Failed to update block: ${String(err)}` };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_EXTRACT_STRUCTURED_CONTENT,
        description:
          'Extract Canvas node content as JSON, markdown, or prompt-oriented text while preserving layer boundaries and omitting preview runtime state.',
        category: 'project',
        isReadOnly: true,
        isConcurrencySafe: true,
        parameters: {
          type: 'object',
          properties: {
            nodeIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional explicit node IDs. Omit to use selection or all nodes.',
            },
            format: {
              type: 'string',
              enum: ['json', 'markdown', 'prompt'],
              description: 'Extraction format.',
            },
            includeChildren: {
              type: 'boolean',
              description: 'Include recursive organization children for selected containers.',
            },
          },
          required: ['format'],
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const data = await api.nodes.extractStructuredContent({
              nodeIds: Array.isArray(args.nodeIds)
                ? args.nodeIds.filter((nodeId): nodeId is string => typeof nodeId === 'string')
                : undefined,
              format: args.format === 'markdown' || args.format === 'prompt' ? args.format : 'json',
              includeChildren: args.includeChildren as boolean | undefined,
            });
            return { success: true, data };
          } catch (err) {
            return {
              success: false,
              error: `Failed to extract structured content: ${String(err)}`,
            };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
        description:
          'Read compact active Canvas context: selected nodes, subsystem summaries, insertion point, viewport, focused container, and targetable fields for follow-up mutations.',
        category: 'project',
        isReadOnly: true,
        isConcurrencySafe: true,
        safetyKind: 'read-only-query',
        parameters: {
          type: 'object',
          properties: {
            includeSelection: {
              type: 'boolean',
              description: 'Include selected node ids and compact selected node summaries.',
            },
            includeFocusedContainer: {
              type: 'boolean',
              description:
                'Include focused container summary and child constraints when available.',
            },
            includeNodeDetails: {
              type: 'boolean',
              description:
                'Include slightly richer node summaries; large media data remains omitted.',
            },
            includeSubsystemMetadata: {
              type: 'boolean',
              description:
                'Include bounded subsystem metadata summaries for narrative, behavior, entity, and memory graphs.',
            },
          },
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const data = await api.nodes.getActiveContext({
              includeSelection: args.includeSelection as boolean | undefined,
              includeFocusedContainer: args.includeFocusedContainer as boolean | undefined,
              includeNodeDetails: args.includeNodeDetails as boolean | undefined,
              includeSubsystemMetadata: args.includeSubsystemMetadata as boolean | undefined,
            });
            return { success: true, data };
          } catch (err) {
            return {
              success: false,
              error: `Failed to get active Canvas context: ${String(err)}`,
            };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_NARRATIVE_TRAVERSE,
        description:
          'Traverse narrative flow nodes in a mixed Canvas. Ignores storyboard, behavior, entity, and memory nodes.',
        category: 'project',
        isReadOnly: true,
        isConcurrencySafe: true,
        safetyKind: 'read-only-query',
        parameters: {
          type: 'object',
          properties: {
            startNodeId: {
              type: 'string',
              description: 'Optional narrative node id used as traversal start.',
            },
          },
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const nodes = await api.nodes.list();
            const context = await api.nodes.getActiveContext({ includeNodeDetails: false });
            const connections = Array.isArray((context as { connections?: unknown }).connections)
              ? ((context as { connections: CanvasConnection[] }).connections)
              : [];
            const data = traverseNarrativeFlow(
              nodes,
              connections,
              typeof args.startNodeId === 'string' ? args.startNodeId : undefined,
            );
            return { success: true, data };
          } catch (err) {
            return {
              success: false,
              error: `Failed to traverse narrative flow: ${String(err)}`,
            };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_APPLY_AGENT_CONTENT,
        description:
          'Apply Agent-generated text, optimized prompts, or structured content to an explicit Canvas node, container, field path, or viewport insertion point.',
        category: 'project',
        requiresConfirmation: true,
        safetyKind: 'confirmation-gated',
        targetRequirements: {
          required: ['target'],
          allowedFallbacks: ['selection', 'viewport-insertion', 'explicit-user-input'],
          confirmationModes: ['replace', 'apply'],
        },
        queryBeforeMutate: {
          preferredQueryTools: [
            TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
            TOOL_NAMES_CANVAS.CANVAS_GET_NODE,
          ],
          reason:
            'Use structured Canvas context to resolve nodeId, containerId, fieldPath, and insertionPoint before mutating.',
        },
        parameters: {
          type: 'object',
          properties: {
            kind: {
              type: 'string',
              enum: ['text', 'prompt', 'structured'],
              description: 'Content kind to apply.',
            },
            text: { type: 'string', description: 'Text content when kind=text.' },
            prompt: { type: 'string', description: 'Prompt content when kind=prompt.' },
            contentJson: {
              type: 'string',
              description: 'JSON string for structured content when kind=structured.',
            },
            title: { type: 'string', description: 'Optional content title.' },
            format: {
              type: 'string',
              enum: ['plain', 'markdown', 'json', 'prompt'],
              description: 'Content format hint.',
            },
            nodeId: { type: 'string', description: 'Explicit Canvas node target.' },
            containerId: { type: 'string', description: 'Explicit Canvas container target.' },
            slotId: { type: 'string', description: 'Explicit Canvas slot target.' },
            fieldPath: {
              type: 'string',
              description: 'JSON Pointer path into node.data, such as /generationPrompt.',
            },
            mode: {
              type: 'string',
              enum: ['insert', 'append', 'replace', 'apply', 'create-child'],
              description: 'Mutation mode. replace/apply require explicit target data.',
            },
            x: { type: 'number', description: 'Canvas insertion X coordinate.' },
            y: { type: 'number', description: 'Canvas insertion Y coordinate.' },
          },
          required: ['kind'],
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const data = await api.nodes.applyAgentContent({
              kind: args.kind === 'prompt' || args.kind === 'structured' ? args.kind : 'text',
              text: args.text as string | undefined,
              prompt: args.prompt as string | undefined,
              content: args.kind === 'structured' ? parseToolValue(args.contentJson) : undefined,
              title: args.title as string | undefined,
              format: args.format as CanvasAgentContentFormat | undefined,
              target: {
                nodeId: args.nodeId as string | undefined,
                containerId: args.containerId as string | undefined,
                slotId: args.slotId as string | undefined,
                fieldPath: normalizeJsonPointerPath(args.fieldPath),
                mode: args.mode as CanvasAgentMutationMode | undefined,
                insertionPoint:
                  typeof args.x === 'number' && typeof args.y === 'number'
                    ? { x: args.x, y: args.y }
                    : undefined,
              },
              provenance: { source: 'tool', label: TOOL_NAMES_CANVAS.CANVAS_APPLY_AGENT_CONTENT },
            });
            return { success: true, data };
          } catch (err) {
            return {
              success: false,
              error: `Failed to apply Agent content to Canvas: ${String(err)}`,
            };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_GET_STORYBOARD_EXECUTION_SUMMARY,
        description:
          'Get a read-only scene/shot storyboard execution summary for Story or Agent workflows. ' +
          'Returns stable scene IDs, shot counts, generation status, selected asset references, and timeline import metadata without runtime preview URLs.',
        category: 'project',
        isReadOnly: true,
        isConcurrencySafe: true,
        parameters: {
          type: 'object',
          properties: {
            sourceScriptUri: {
              type: 'string',
              description: 'Optional source script URI used to correlate imported Story scenes.',
            },
            sceneId: {
              type: 'string',
              description: 'Optional Story scene ID.',
            },
            sceneNodeId: {
              type: 'string',
              description: 'Optional Canvas SceneGroup node ID.',
            },
            canvasFileUri: {
              type: 'string',
              description: 'Optional canvas file URI for consumers tracking bindings.',
            },
          },
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const request: CanvasStoryboardExecutionSummaryRequest = {
              sourceScriptUri:
                typeof args.sourceScriptUri === 'string' ? args.sourceScriptUri : undefined,
              sceneId: typeof args.sceneId === 'string' ? args.sceneId : undefined,
              sceneNodeId: typeof args.sceneNodeId === 'string' ? args.sceneNodeId : undefined,
              canvasFileUri:
                typeof args.canvasFileUri === 'string' ? args.canvasFileUri : undefined,
            };
            const data = await api.storyboard.getExecutionSummary(request);
            return { success: true, data };
          } catch (err) {
            return {
              success: false,
              error: `Failed to get storyboard execution summary: ${String(err)}`,
            };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_GENERATE_IMAGE,
        description:
          'Trigger image generation for a ShotNode or a specific GalleryCell. ' +
          'Call canvas_update_node first to write the prompt/params to the node ' +
          'so they are persisted. Generation runs asynchronously in the background.',
        category: 'generation',
        isConcurrencySafe: true,
        parameters: {
          type: 'object',
          properties: {
            nodeId: { type: 'string', description: 'ShotNode or GalleryNode ID' },
            childNodeId: {
              type: 'string',
              description: 'Gallery child media node ID (required when nodeId is a GalleryNode)',
            },
          },
          required: ['nodeId'],
        } satisfies ToolParameters,
        async execute(args) {
          try {
            await ensureProjectModel(configManager, 'image');
            await api.nodes.generateImage(
              args.nodeId as string,
              args.childNodeId as string | undefined,
            );
            return { success: true };
          } catch (err) {
            return { success: false, error: `Failed to generate image: ${String(err)}` };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_GENERATE_BATCH,
        description:
          'Trigger image generation for multiple nodes at once. ' +
          'Useful for generating all shots in a scene in one command. ' +
          'Runs up to 2 generations concurrently via the scheduler.',
        category: 'generation',
        isConcurrencySafe: true,
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
        } satisfies ToolParameters,
        async execute(args) {
          try {
            await ensureProjectModel(configManager, 'image');
            await api.nodes.generateBatch(args.nodeIds as string[]);
            return { success: true };
          } catch (err) {
            return { success: false, error: `Failed to generate batch: ${String(err)}` };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.SET_PROJECT_GENERATION_CONFIG,
        description:
          'Persist project-level generation parameters and model configuration. ' +
          'These become the default for all nodes unless overridden per-node. ' +
          'Always call this before batch generation to ensure params survive context compression.',
        category: 'project',
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
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const configEntries: Record<string, unknown> = {};
            if (args.imageRatio !== undefined)
              configEntries['neko.project.generation.image.ratio'] = args.imageRatio;
            if (args.imageResolution !== undefined)
              configEntries['neko.project.generation.image.resolution'] = args.imageResolution;
            if (args.videoRatio !== undefined)
              configEntries['neko.project.generation.video.ratio'] = args.videoRatio;
            if (args.videoResolution !== undefined)
              configEntries['neko.project.generation.video.resolution'] = args.videoResolution;
            if (args.videoDuration !== undefined)
              configEntries['neko.project.generation.video.duration'] = args.videoDuration;
            if (args.videoFps !== undefined)
              configEntries['neko.project.generation.video.fps'] = args.videoFps;
            if (args.imageModel !== undefined)
              configEntries['neko.project.models.image'] = args.imageModel;
            if (args.videoModel !== undefined)
              configEntries['neko.project.models.video'] = args.videoModel;
            if (args.audioModel !== undefined)
              configEntries['neko.project.models.audio'] = args.audioModel;

            const wsConfig = vscode.workspace.getConfiguration();
            await Promise.all(
              Object.entries(configEntries).map(([key, value]) =>
                wsConfig.update(key, value, vscode.ConfigurationTarget.Workspace),
              ),
            );

            return { success: true, data: { updated: Object.keys(configEntries) } };
          } catch (err) {
            return { success: false, error: `Failed to set generation config: ${String(err)}` };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.EXPORT_STORYBOARD,
        description:
          'Export the storyboard as a ZIP image pack or import it into the neko-cut timeline. ' +
          'ZIP format: creates a .zip file with shot images + manifest.json at a user-chosen path. ' +
          'neko-cut format: sends all shots to the active neko-cut timeline as MediaElement clips. ' +
          'Returns the saved file path (ZIP) or a confirmation (neko-cut).',
        category: 'project',
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
        async execute(args) {
          try {
            const format = args.format as 'zip' | 'neko-cut';
            const projectName = (args.projectName as string | undefined) ?? 'storyboard';

            // Fetch all shot and scene nodes
            const [allShots, allScenes] = await Promise.all([
              api.nodes.list('shot' as CanvasNodeType),
              api.nodes.list('scene' as CanvasNodeType),
            ]);

            if (allShots.length === 0) {
              return {
                success: false,
                error: 'No shot nodes found on the canvas. Create ShotNodes first.',
              };
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
              const sceneId = getNodeParentId(node);
              const chars =
                (d['characters'] as Array<{ characterName?: string }> | undefined) ?? [];
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
                data: {
                  format: 'neko-cut',
                  shotsImported: timelineShots.length,
                  message: `${timelineShots.length} shots imported into neko-cut timeline`,
                },
              };
            }

            // ZIP format — delegate to a command since ZIP requires AdmZip
            // which should not be a dependency of neko-canvas
            await vscode.commands.executeCommand('neko.canvas.exportStoryboard', 'zip');

            return {
              success: true,
              data: {
                format: 'zip',
                totalShots: manifestShots.length,
                message: 'Storyboard ZIP export initiated',
              },
            };
          } catch (err) {
            return { success: false, error: `Failed to export storyboard: ${String(err)}` };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_APPLY_STYLE_TRANSFER,
        description:
          'Apply style transfer to target ShotNodes using a GalleryNode as IP-Adapter reference. ' +
          'Sets referenceNodeId on each target shot to the given GalleryNode, then triggers batch ' +
          'image generation so each shot is re-generated with the style reference applied. ' +
          'Use canvas_list_nodes to find GalleryNode IDs before calling this.',
        category: 'generation',
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
        async execute(args) {
          try {
            const targetNodeIds = args.targetNodeIds as string[];
            const refNodeId = args.referenceNodeId as string;

            // Verify the reference node is a gallery node
            const refNode = await api.nodes.get(refNodeId);
            if (!refNode) {
              return { success: false, error: `Reference node "${refNodeId}" not found` };
            }
            if (refNode.type !== 'gallery') {
              return {
                success: false,
                error: `Reference node must be a GalleryNode (got type: "${refNode.type}")`,
              };
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
              return {
                success: false,
                error: `Failed to update reference on some nodes: ${updateErrors.join(', ')}`,
              };
            }

            // Trigger batch generation with the style reference set
            await api.nodes.generateBatch(targetNodeIds);

            logger.info(
              `canvas_apply_style_transfer: ref="${refNodeId}" targets=${targetNodeIds.length}`,
            );
            return {
              success: true,
              data: {
                message: `Style transfer queued for ${targetNodeIds.length} shot(s) using GalleryNode "${refNodeId}"`,
                targetNodeIds,
                referenceNodeId: refNodeId,
              },
            };
          } catch (err) {
            return { success: false, error: `Failed to apply style transfer: ${String(err)}` };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.IMPORT_SCRIPT_TO_CANVAS,
        description:
          'Import a Fountain screenplay into the active canvas as a storyboard skeleton. ' +
          'Supports two code paths: mechanical skeleton import, or semantic import when ScenePlan/ShotPlan data is provided.',
        category: 'project',
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
                'Import mode. mechanical = heuristic storyboard skeleton, semantic = consume ScenePlan/ShotPlan input when provided.',
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
        async execute(args) {
          try {
            const storyExt = vscode.extensions.getExtension<NekoStoryAPI>('neko.neko-story');
            if (!storyExt) {
              return { success: false, error: 'neko-story is not available.' };
            }
            const storyApi = storyExt.isActive
              ? storyExt.exports
              : ((await storyExt.activate()) as NekoStoryAPI);
            const scriptIndex = storyApi.getScriptIndex(args.path as string);

            if (!scriptIndex) {
              return {
                success: false,
                error: 'Script not indexed. Open the .fountain file in VSCode first, then retry.',
              };
            }
            if (scriptIndex.scenes.length === 0) {
              return { success: false, error: 'No scenes found in this screenplay.' };
            }

            const startX = (args.startX as number | undefined) ?? 100;
            const startY = (args.startY as number | undefined) ?? 100;
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            const characterBindings = await resolveCharacterBindingsForNames(
              scriptIndex.characters.map((character) => character.name),
              {
                workspaceRoot,
                uriOrPath: args.path as string,
                characterResolver: storyApi,
              },
            );
            const payload = createStoryboardPayload(scriptIndex, {
              mode: (args.mode as 'mechanical' | 'semantic' | undefined) ?? 'mechanical',
              scenesLimit: Math.min(
                (args.scenesLimit as number | undefined) ?? scriptIndex.scenes.length,
                50,
              ),
              scenePlans: (args.scenePlans as StoryScenePlan[] | undefined) ?? [],
              characterBindings,
            });
            const created = await api.storyboard.import(payload, { startX, startY });

            logger.info(
              `import_script_to_canvas: mode=${created.mode} scenes=${created.scenesCreated} shots=${created.totalShots}`,
            );
            return {
              success: true,
              data: {
                mode: created.mode,
                scenesCreated: created.scenesCreated,
                totalShots: created.totalShots,
                scenes: created.scenes,
              },
            };
          } catch (err) {
            return { success: false, error: `Failed to import script to canvas: ${String(err)}` };
          }
        },
      },
    ];

    // -----------------------------------------------------------------------
    // Keyframe Video Generation (requires mediaService)
    // -----------------------------------------------------------------------
    if (mediaService) {
      tools.push(createVideoKeyframeTool(api, mediaService, logger));
    }

    return tools;
  }

  getToolGroups(): ToolGroup[] {
    return [
      {
        name: 'canvas-editing',
        description:
          'Canvas editing and storyboard tools for NekoCanvas — canvas, node, shot, scene, storyboard, generation',
        tools: Object.values(TOOL_NAMES_CANVAS),
        alwaysActive: false,
        source: 'builtin',
        enabled: true,
        loadingTier: 'eager',
      },
    ];
  }
}

/**
 * Create the keyframe video generation tool (requires mediaService).
 */
function createVideoKeyframeTool(
  api: NekoCanvasAPI,
  media: ICapabilityMediaService,
  logger: ReturnType<typeof getRootLogger>,
): Tool {
  return {
    name: TOOL_NAMES_CANVAS.CANVAS_GENERATE_VIDEO_WITH_KEYFRAMES,
    description:
      'Generate a video clip for a ShotNode using first-frame and last-frame images as keyframes. ' +
      'The first frame node and last frame node must already have generated images. ' +
      'Calls the configured video model with the keyframe references and stores the result ' +
      "in the target node's generatedVideo field. Returns error if media service is unavailable.",
    category: 'generation',
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
    async execute(args) {
      try {
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

        if (!targetNode) return { success: false, error: `Target node "${nodeId}" not found` };
        if (!firstNode)
          return { success: false, error: `First frame node "${firstFrameNodeId}" not found` };
        if (!lastNode)
          return { success: false, error: `Last frame node "${lastFrameNodeId}" not found` };

        const firstFrameData = (firstNode.data as Record<string, unknown>)['generatedImage'] as
          | string
          | undefined;
        const lastFrameData = (lastNode.data as Record<string, unknown>)['generatedImage'] as
          | string
          | undefined;

        if (!firstFrameData) {
          return {
            success: false,
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
          return { success: false, error: `Video generation failed to start: ${String(err)}` };
        }

        // Wait for completion (up to 5 minutes)
        let completed;
        try {
          completed = await media.waitForTask(task.id, 5 * 60 * 1000);
        } catch (err) {
          await api.nodes.update(nodeId, { generationStatus: 'error' });
          return { success: false, error: `Video generation timed out: ${String(err)}` };
        }

        if (completed.status !== 'completed' || !completed.outputs?.length) {
          await api.nodes.update(nodeId, { generationStatus: 'error' });
          return { success: false, error: `Video generation ${completed.status}` };
        }

        const output = completed.outputs[0]!;
        await api.nodes.update(nodeId, {
          generatedVideo: output.url,
          generationStatus: 'done',
        });

        logger.info(`canvas_generate_video_with_keyframes: nodeId=${nodeId} taskId=${task.id}`);
        return {
          success: true,
          data: {
            message: `Video generated for shot "${nodeId}"`,
            videoUrl: output.url,
            taskId: task.id,
            duration,
            aspectRatio,
          },
        };
      } catch (err) {
        return {
          success: false,
          error: `Failed to generate video with keyframes: ${String(err)}`,
        };
      }
    },
  };
}
