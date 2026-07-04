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
  AgentArtifactFacetsContribution,
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
  CanvasPlaybackReorderUnitsRequest,
  ReferenceDescriptor,
  StoryboardMediaRef,
  CanvasMarkdownCapabilityId,
  CanvasMarkdownCapabilityInput,
  CanvasMarkdownCapabilityResult,
  CanvasMarkdownCapabilityTarget,
  CanvasMarkdownResourceRef,
  AgentCapabilityInvocationInput,
  AgentCapabilityInvocationResult,
  AgentCapabilityLifecycleDescriptor,
  Skill,
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

function readOptionalCanvasNodeType(
  value: unknown,
  label = 'node type',
): CanvasNodeType | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (isCanvasNodeType(value)) {
    return value;
  }
  throw new Error(`Unsupported Canvas ${label} "${String(value)}"`);
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

function readPlaybackReorderApprovalContext(
  value: unknown,
): CanvasPlaybackReorderUnitsRequest['approvalContext'] {
  if (
    value === 'explicit-user-instruction' ||
    value === 'agent-confirmed' ||
    value === 'agent-inferred'
  ) {
    return value;
  }
  return 'agent-inferred';
}

function buildCanvasMarkdownCapabilityInput(
  capabilityId: CanvasMarkdownCapabilityId,
  args: Record<string, unknown>,
): CanvasMarkdownCapabilityInput {
  if (capabilityId === 'canvas.attachResource') {
    return {
      capabilityId,
      target: (isRecord(args.target) ? args.target : {}) as CanvasMarkdownCapabilityTarget,
      resource: (isRecord(args.resource) ? args.resource : {}) as CanvasMarkdownResourceRef,
      ...(typeof args.role === 'string' ? { role: args.role } : {}),
      ...(isRecord(args.provenance) ? { provenance: args.provenance } : {}),
    };
  }

  return {
    capabilityId,
    markdown: typeof args.markdown === 'string' ? args.markdown : '',
    ...(typeof args.title === 'string' ? { title: args.title } : {}),
    ...(typeof args.sourceFormat === 'string' ? { sourceFormat: args.sourceFormat } : {}),
    ...(Array.isArray(args.resources) ? { resources: args.resources } : {}),
    ...(isRecord(args.target) ? { target: args.target } : {}),
    ...(isRecord(args.provenance) ? { provenance: args.provenance } : {}),
    ...(typeof args.intentHint === 'string' ? { intentHint: args.intentHint } : {}),
    ...(typeof args.profileHint === 'string' ? { profileHint: args.profileHint } : {}),
    ...(typeof args.tableTitle === 'string' ? { tableTitle: args.tableTitle } : {}),
    ...(typeof args.mode === 'string' ? { mode: args.mode } : {}),
    ...(isRecord(args.approval) ? { approval: args.approval } : {}),
  } as CanvasMarkdownCapabilityInput;
}

function createMarkdownCapabilityTool(
  api: NekoCanvasAPI,
  definition: CanvasMarkdownToolDefinition,
): Tool {
  return {
    name: definition.name,
    description: definition.description,
    category: 'project',
    isReadOnly: definition.isReadOnly,
    isConcurrencySafe: definition.isReadOnly,
    requiresConfirmation: definition.requiresConfirmation,
    safetyKind: definition.requiresConfirmation ? 'confirmation-gated' : 'read-only-query',
    parameters: {
      type: 'object',
      properties:
        definition.capabilityId === 'canvas.attachResource'
          ? {
              target: {
                type: 'object',
                description: 'Canvas target for the resource attachment.',
              },
              resource: {
                type: 'object',
                description: 'Stable ResourceRef or DocumentArchiveResourceRef wrapper.',
              },
              role: { type: 'string', description: 'Optional resource role.' },
              provenance: { type: 'object', description: 'Optional Agent provenance.' },
            }
          : {
              markdown: {
                type: 'string',
                description: 'Original Markdown content. Do not pass rendered HTML.',
              },
              title: { type: 'string', description: 'Optional title.' },
              sourceFormat: {
                type: 'string',
                enum: ['markdown', 'markdown-table', 'gfm-table', 'resource-reference-markdown'],
                description: 'Optional source format hint.',
              },
              resources: {
                type: 'array',
                items: { type: 'object' },
                description: 'Stable resource refs keyed by Markdown tokens.',
              },
              target: { type: 'object', description: 'Optional Canvas insertion target.' },
              provenance: { type: 'object', description: 'Optional Agent provenance.' },
              intentHint: {
                type: 'string',
                enum: ['auto', 'note', 'table', 'creative-table'],
                description:
                  'Optional advisory ingest intent. Canvas remains the parsing authority.',
              },
              profileHint: { type: 'string', description: 'Optional Canvas-owned profile hint.' },
              tableTitle: { type: 'string', description: 'Optional table title.' },
              mode: {
                type: 'string',
                enum: ['review-first', 'create-nodes'],
                description: 'Optional storyboard creation mode.',
              },
              approval: {
                type: 'object',
                description: 'Required approval context for production apply mutations.',
              },
            },
      required: definition.capabilityId === 'canvas.attachResource' ? ['target', 'resource'] : [],
    } satisfies ToolParameters,
    async execute(args) {
      try {
        const input = buildCanvasMarkdownCapabilityInput(definition.capabilityId, args);
        const data = await api.markdown.invoke(input);
        const lifecycle = toCanvasMarkdownLifecycleResult(definition, input, data);
        return { success: lifecycle.status !== 'blocked', data: lifecycle };
      } catch (err) {
        return {
          success: false,
          error: `Failed to invoke Canvas Markdown capability: ${String(err)}`,
        };
      }
    },
  };
}

function createCanvasMarkdownLifecycleInvocationInput(
  definition: CanvasMarkdownToolDefinition,
  input: CanvasMarkdownCapabilityInput,
): AgentCapabilityInvocationInput {
  return {
    capabilityId: definition.capabilityId,
    phase: definition.phase,
    payload: input,
    ...(input.capabilityId === 'canvas.attachResource'
      ? { target: projectCanvasMarkdownLifecycleTarget(input.target) }
      : input.target
        ? { target: projectCanvasMarkdownLifecycleTarget(input.target) }
        : {}),
    ...('provenance' in input && input.provenance
      ? {
          provenance: {
            source: input.provenance.source,
            conversationId: input.provenance.conversationId,
            messageId: input.provenance.messageId,
            toolCallId: input.provenance.toolCallId,
            label: input.provenance.label,
          },
        }
      : {}),
  };
}

function toCanvasMarkdownLifecycleResult(
  definition: CanvasMarkdownToolDefinition,
  input: CanvasMarkdownCapabilityInput,
  result: CanvasMarkdownCapabilityResult,
): AgentCapabilityInvocationResult {
  const lifecycleInput = createCanvasMarkdownLifecycleInvocationInput(definition, input);
  return {
    capabilityId: definition.capabilityId,
    phase: lifecycleInput.phase,
    status: toLifecycleStatus(definition.phase, result.status),
    diagnostics: result.diagnostics.map((diagnostic) => ({
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message,
      ...(diagnostic.fieldKey ? { fieldKey: diagnostic.fieldKey } : {}),
      ...(diagnostic.token ? { token: diagnostic.token } : {}),
      ...(diagnostic.line !== undefined ? { line: diagnostic.line } : {}),
      ...(diagnostic.column !== undefined ? { column: diagnostic.column } : {}),
    })),
    ...(result.draftNodeId
      ? {
          reviewArtifact: {
            kind: 'node',
            id: result.draftNodeId,
            packageId: 'neko-canvas',
            artifactKind: 'canvas.table',
            profile: readCanvasMarkdownProfileFromResult(result) ?? 'storyboard',
          },
        }
      : {}),
    ...(result.nodeIds?.length
      ? {
          changedRefs: result.nodeIds.map((nodeId) => ({
            kind: 'node' as const,
            id: nodeId,
            packageId: 'neko-canvas',
          })),
        }
      : {}),
    ...(result.actions?.length
      ? {
          actions: result.actions.map((action) => {
            const capabilityId = action.capabilityId ?? definition.capabilityId;
            const actionDefinition = findCanvasMarkdownToolDefinition(capabilityId);
            return {
              actionId: action.actionId,
              ...(action.label ? { label: action.label } : {}),
              capabilityId,
              phase: actionDefinition?.phase ?? definition.phase,
              requiresApproval:
                actionDefinition?.requiresConfirmation ??
                capabilityId !== 'canvas.validateMarkdownStoryboard',
              ...(result.draftNodeId
                ? {
                    sourceRef: {
                      kind: 'node' as const,
                      id: result.draftNodeId,
                      packageId: 'neko-canvas',
                    },
                  }
                : {}),
              ...(lifecycleInput.target ? { target: lifecycleInput.target } : {}),
              payload: input,
            };
          }),
        }
      : {}),
    data: result,
  };
}

function readCanvasMarkdownProfileFromResult(
  result: CanvasMarkdownCapabilityResult,
): string | undefined {
  if (result.profileId) return result.profileId;
  return result.preview?.table?.profileId ?? result.preview?.profileId;
}

function findCanvasMarkdownToolDefinition(
  capabilityId: CanvasMarkdownCapabilityId,
): CanvasMarkdownToolDefinition | undefined {
  return CANVAS_MARKDOWN_TOOL_DEFINITIONS.find(
    (definition) => definition.capabilityId === capabilityId,
  );
}

function toLifecycleStatus(
  phase: AgentCapabilityLifecycleDescriptor['phases'][number],
  status: CanvasMarkdownCapabilityResult['status'],
): AgentCapabilityInvocationResult['status'] {
  if (status === 'blocked') return 'blocked';
  if (status === 'needs-review') return 'needs-review';
  if (phase === 'validate') return 'validated';
  if (phase === 'apply') return 'applied';
  if (phase === 'execute') return 'executed';
  if (phase === 'describe') return 'described';
  return status === 'created' || status === 'changed' ? 'needs-review' : 'validated';
}

function projectCanvasMarkdownLifecycleTarget(
  target: CanvasMarkdownCapabilityTarget,
): AgentCapabilityInvocationInput['target'] {
  return {
    packageId: 'neko-canvas',
    ...(target.canvasId ? { canvasId: target.canvasId } : {}),
    ...(target.nodeId ? { nodeId: target.nodeId } : {}),
    ...(target.containerId ? { containerId: target.containerId } : {}),
    ...(target.slotId ? { slotId: target.slotId } : {}),
    ...(target.fieldPath ? { fieldPath: target.fieldPath } : {}),
    ...(target.insertionPoint ? { insertionPoint: target.insertionPoint } : {}),
  };
}

function collectShotKeyframeReferenceDescriptors(
  nodeId: string,
  data: Record<string, unknown>,
): readonly ReferenceDescriptor[] {
  const mediaRefs = [
    ...readStoryboardMediaRefs(data['generatedMediaRefs']),
    ...readStoryboardMediaRefs(
      data['shotImagePrepPlan'] && isRecord(data['shotImagePrepPlan'])
        ? data['shotImagePrepPlan']['outputMediaRefs']
        : undefined,
    ),
  ];
  return mediaRefs.map((ref, index): ReferenceDescriptor => ({
    schemaVersion: 1,
    kind: 'reference-descriptor',
    referenceId: `${nodeId}:keyframeRefs:${index}:${ref.refId}`,
    sourceKind: 'canvas-node',
    sourceId: nodeId,
    referenceKind: ref.locator.type === 'asset' ? 'generated-asset' : 'custom',
    role: ref.role === 'generated' || ref.role === 'derived' ? 'keyframe' : 'reference',
    modality: ref.mimeType?.startsWith('video/') ? 'video' : 'image',
    payload: storyboardMediaRefPayloadForReference(ref),
    metadata: {
      storyboardRefId: ref.refId,
      ...(ref.label ? { label: ref.label } : {}),
      ...(ref.mimeType ? { mimeType: ref.mimeType } : {}),
    },
  }));
}

function readStoryboardMediaRefs(value: unknown): readonly StoryboardMediaRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): readonly StoryboardMediaRef[] =>
    isStoryboardMediaRef(item) ? [item] : [],
  );
}

function readShotPreparedKeyframeRef(
  data: Record<string, unknown>,
): StoryboardMediaRef | undefined {
  const refs = [
    ...readStoryboardMediaRefs(data['generatedMediaRefs']),
    ...readStoryboardMediaRefs(
      data['shotImagePrepPlan'] && isRecord(data['shotImagePrepPlan'])
        ? data['shotImagePrepPlan']['outputMediaRefs']
        : undefined,
    ),
  ];
  return refs.find(
    (ref) =>
      ref.role === 'derived' ||
      ref.role === 'generated' ||
      ref.role === 'thumbnail' ||
      ref.role === 'reference',
  );
}

function isStoryboardMediaRef(value: unknown): value is StoryboardMediaRef {
  if (!isRecord(value) || typeof value['refId'] !== 'string' || !isRecord(value['locator'])) {
    return false;
  }
  const locatorType = value['locator']['type'];
  return (
    locatorType === 'tool-result' ||
    locatorType === 'asset' ||
    locatorType === 'workspace-path' ||
    locatorType === 'canvas-node' ||
    locatorType === 'story-source'
  );
}

function storyboardMediaRefPayloadForReference(
  ref: StoryboardMediaRef,
): ReferenceDescriptor['payload'] {
  switch (ref.locator.type) {
    case 'asset':
      return {
        type: 'generated-asset',
        assetId: ref.locator.assetId,
        ...(ref.locator.assetVersion ? { variantId: ref.locator.assetVersion } : {}),
      };
    case 'canvas-node':
      return {
        type: 'canvas-node',
        nodeId: ref.locator.canvasNodeId,
        ...(ref.locator.outputId ? { slotId: ref.locator.outputId } : {}),
      };
    case 'workspace-path':
      return {
        type: 'path',
        path: ref.locator.path,
        pathKind: storyboardPathKindForReference(ref.locator.path),
      };
    case 'story-source':
      return {
        type: 'custom',
        data: {
          locatorType: 'story-source',
          storyId: ref.locator.storyId,
          ...(ref.locator.sceneId ? { sceneId: ref.locator.sceneId } : {}),
          ...(ref.locator.frameIndex !== undefined ? { frameIndex: ref.locator.frameIndex } : {}),
        },
      };
    case 'tool-result':
      return {
        type: 'custom',
        data: {
          locatorType: 'tool-result',
          toolCallId: ref.locator.toolCallId,
          assetIndex: ref.locator.assetIndex,
          ...(ref.locator.taskId ? { taskId: ref.locator.taskId } : {}),
        },
      };
  }
}

function storyboardPathKindForReference(
  path: string,
): 'workspace-relative' | 'variable' | 'transitional' {
  if (path.startsWith('${')) return 'variable';
  if (/^(?:\.{0,2}\/)?[^/]/.test(path)) return 'workspace-relative';
  return 'transitional';
}

function readShotGeneratedImageFallback(data: Record<string, unknown>): string | undefined {
  const generatedAsset = isRecord(data['generatedAsset']) ? data['generatedAsset'] : undefined;
  return (
    (typeof generatedAsset?.['path'] === 'string' ? generatedAsset['path'] : undefined) ??
    (typeof data['generatedImage'] === 'string' ? data['generatedImage'] : undefined)
  );
}

interface CanvasMarkdownToolDefinition {
  readonly name: string;
  readonly capabilityId: CanvasMarkdownCapabilityId;
  readonly displayName: string;
  readonly description: string;
  readonly phase: AgentCapabilityLifecycleDescriptor['phases'][number];
  readonly requiresConfirmation: boolean;
  readonly isReadOnly?: boolean;
}

type CanvasToolName = (typeof TOOL_NAMES_CANVAS)[keyof typeof TOOL_NAMES_CANVAS];
type CanvasToolLocalization = NonNullable<Tool['localization']>[string];
type CanvasToolTraits = NonNullable<Tool['traits']>;

const CANVAS_MARKDOWN_TOOL_DEFINITIONS: readonly CanvasMarkdownToolDefinition[] = [
  {
    name: TOOL_NAMES_CANVAS.CANVAS_INGEST_MARKDOWN,
    capabilityId: 'canvas.ingestMarkdown',
    displayName: 'Ingest Markdown to Canvas',
    phase: 'review',
    description:
      'Ingest Markdown into Canvas as a note, generic table, or creative table. Canvas owns parsing, profile resolution, resource binding, diagnostics, and follow-up actions.',
    requiresConfirmation: true,
  },
  {
    name: TOOL_NAMES_CANVAS.CANVAS_CREATE_MARKDOWN_NOTE,
    capabilityId: 'canvas.createMarkdownNote',
    displayName: 'Create Markdown Note',
    phase: 'review',
    description:
      'Create a Canvas Markdown note from reviewed Markdown. Canvas validates target and resources before mutating state.',
    requiresConfirmation: true,
  },
  {
    name: TOOL_NAMES_CANVAS.CANVAS_CREATE_TABLE_FROM_MARKDOWN,
    capabilityId: 'canvas.createTableFromMarkdown',
    displayName: 'Create Markdown Table',
    phase: 'review',
    description:
      'Create a Canvas table/draft node from a Markdown or GFM table. Canvas owns parsing and diagnostics.',
    requiresConfirmation: true,
  },
  {
    name: TOOL_NAMES_CANVAS.CANVAS_CREATE_STORYBOARD_DRAFT_FROM_MARKDOWN,
    capabilityId: 'canvas.createStoryboardDraftFromMarkdown',
    displayName: 'Create Storyboard Review Table',
    phase: 'review',
    description:
      'Create a review-first Canvas storyboard draft from Markdown. Does not create production storyboard nodes by default.',
    requiresConfirmation: true,
  },
  {
    name: TOOL_NAMES_CANVAS.CANVAS_CREATE_STORYBOARD_FROM_MARKDOWN,
    capabilityId: 'canvas.createStoryboardFromMarkdown',
    displayName: 'Create Storyboard Nodes',
    phase: 'apply',
    description:
      'Create production Canvas storyboard nodes from validated Markdown after explicit confirmation.',
    requiresConfirmation: true,
  },
  {
    name: TOOL_NAMES_CANVAS.CANVAS_ATTACH_RESOURCE,
    capabilityId: 'canvas.attachResource',
    displayName: 'Attach Canvas Resource',
    phase: 'apply',
    description:
      'Attach a stable ResourceRef or DocumentArchiveResourceRef to an existing Canvas target.',
    requiresConfirmation: true,
  },
  {
    name: TOOL_NAMES_CANVAS.CANVAS_VALIDATE_MARKDOWN_STORYBOARD,
    capabilityId: 'canvas.validateMarkdownStoryboard',
    displayName: 'Validate Markdown Storyboard',
    phase: 'validate',
    description:
      'Validate a Markdown storyboard draft and return diagnostics without mutating Canvas state.',
    requiresConfirmation: false,
    isReadOnly: true,
  },
] as const;

function createCanvasMarkdownLifecycleDescriptor(
  definition: CanvasMarkdownToolDefinition,
): AgentCapabilityLifecycleDescriptor {
  return {
    capabilityId: definition.capabilityId,
    providerId: 'neko-canvas',
    displayName: definition.displayName,
    description: definition.description,
    phases:
      definition.capabilityId === 'canvas.createStoryboardFromMarkdown'
        ? ['validate', 'review', 'apply']
        : definition.capabilityId === 'canvas.validateMarkdownStoryboard'
          ? ['validate']
          : [definition.phase],
    inputSchema: { id: 'canvas.markdown.input', version: 1 },
    resultSchema: { id: 'agent.capability.lifecycle.result', version: 1 },
    accepts:
      definition.capabilityId === 'canvas.attachResource'
        ? ['ResourceRef', 'DocumentArchiveResourceRef']
        : ['Markdown', 'GfmTable'],
    produces:
      definition.capabilityId === 'canvas.validateMarkdownStoryboard'
        ? ['CanvasMarkdownCapabilityDiagnostics']
        : ['canvas-node-ref'],
    risk: definition.isReadOnly ? 'low' : 'medium',
    requiresApproval: definition.requiresConfirmation,
    safetyKind: definition.requiresConfirmation ? 'confirmation-gated' : 'read-only-query',
    targetRequirements: definition.requiresConfirmation
      ? { allowedFallbacks: ['viewport-insertion', 'explicit-user-input'] }
      : undefined,
  };
}

const CANVAS_MARKDOWN_LIFECYCLE_DESCRIPTORS: readonly AgentCapabilityLifecycleDescriptor[] =
  CANVAS_MARKDOWN_TOOL_DEFINITIONS.map(createCanvasMarkdownLifecycleDescriptor);

const CANVAS_READ_ONLY_TOOL_NAMES: ReadonlySet<CanvasToolName> = new Set([
  TOOL_NAMES_CANVAS.CANVAS_GET_PLAYBACK_PLAN,
  TOOL_NAMES_CANVAS.CANVAS_GET_PLAYBACK_ROUTES,
  TOOL_NAMES_CANVAS.CANVAS_REVEAL_PLAYBACK_WORKSPACE,
  TOOL_NAMES_CANVAS.CANVAS_VALIDATE_MARKDOWN_STORYBOARD,
  TOOL_NAMES_CANVAS.CANVAS_LIST_NODES,
  TOOL_NAMES_CANVAS.CANVAS_GET_NODE,
  TOOL_NAMES_CANVAS.CANVAS_EXTRACT_STRUCTURED_CONTENT,
  TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
  TOOL_NAMES_CANVAS.CANVAS_NARRATIVE_TRAVERSE,
  TOOL_NAMES_CANVAS.CANVAS_GET_STORYBOARD_EXECUTION_SUMMARY,
]);

const CANVAS_NETWORK_GENERATION_TOOL_NAMES: ReadonlySet<CanvasToolName> = new Set([
  TOOL_NAMES_CANVAS.CANVAS_GENERATE_IMAGE,
  TOOL_NAMES_CANVAS.CANVAS_GENERATE_BATCH,
  TOOL_NAMES_CANVAS.CANVAS_APPLY_STYLE_TRANSFER,
]);

const CANVAS_TOOL_ZH_LOCALIZATIONS = {
  [TOOL_NAMES_CANVAS.CREATE_CANVAS]: {
    description: '创建新的画布。',
    parameters: {
      name: '画布名称。',
      width: '画布宽度，单位像素。',
      height: '画布高度，单位像素。',
      backgroundColor: '背景颜色，使用十六进制颜色值。',
    },
  },
  [TOOL_NAMES_CANVAS.ADD_CANVAS_SHAPE]: {
    description: '向画布添加一个基础形状。',
    parameters: {
      canvasId: 'Canvas ID。',
      type: '形状类型。',
      x: 'X 坐标。',
      y: 'Y 坐标。',
      width: '宽度。',
      height: '高度。',
      fill: '填充颜色。',
      stroke: '描边颜色。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_GET_PLAYBACK_PLAN]: {
    description:
      '读取当前 CanvasPlaybackPlan 投影；仅展示画布顺序，不持久化路由顺序、播放头或播放状态。',
    parameters: {
      sourceCanvasUri: '可选 Canvas 文档 URI；省略时使用当前活动 Canvas。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_GET_PLAYBACK_ROUTES]: {
    description: '读取由 CanvasPlaybackPlan 派生的有效播放路由候选；不创建 Agent 自有时间线。',
    parameters: {
      sourceCanvasUri: '可选 Canvas 文档 URI；省略时使用当前活动 Canvas。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_REVEAL_PLAYBACK_WORKSPACE]: {
    description:
      '打开同一 Webview 内的 Canvas PlaybackWorkspace，用于路由播放；Canvas 负责播放 UI 和播放头。',
    parameters: {
      sourceCanvasUri: '可选 Canvas 文档 URI。',
      routeId: '可选播放路由 ID，用于聚焦。',
      unitId: '可选播放单元 ID，用于跳转。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_CREATE_CUT_DRAFT_FROM_ROUTE]: {
    description:
      '将 Canvas 播放路由投影为 CanvasCutDraftPayload，并可在确认后发送到 Cut。',
    parameters: {
      sourceCanvasUri: '可选 Canvas 文档 URI。',
      routeId: '要投影的播放路由 ID。',
      projectName: '可选目标 Cut 项目名称。',
      sendToCut: '为 true 时，在确认后把创建的草稿发送到当前 Cut 时间线。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_REORDER_PLAYBACK_UNITS]: {
    description:
      '通过 Canvas 图命令重排播放单元，并重新投影 CanvasPlaybackPlan；Agent 推断的重排需要确认。',
    parameters: {
      sourceCanvasUri: '可选 Canvas 文档 URI。',
      routeId: '要重排的播放路由 ID。',
      orderedUnitIds: '所选路由的完整播放单元 ID 顺序。',
      approvalContext: '审批上下文；agent-inferred 仍需要确认。',
      instructionText: '同一轮用户给出的具体重排指令。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_INGEST_MARKDOWN]: {
    description: '将 Markdown 内容作为可审阅草稿导入 Canvas。',
    parameters: {
      markdown: '原始 Markdown 内容；不要传入渲染后的 HTML。',
      title: '可选标题。',
      sourceFormat: '来源格式提示。',
      resources: 'Markdown 中引用的稳定资源列表。',
      target: '可选 Canvas 插入目标。',
      provenance: '可选 Agent 来源信息。',
      intentHint: '可选内容意图提示。',
      profileHint: '可选 Canvas profile 提示。',
      tableTitle: '可选表格标题。',
      mode: '可选分镜创建模式。',
      approval: '生产级 apply 变更所需的审批上下文。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_CREATE_MARKDOWN_NOTE]: {
    description: '从已审阅 Markdown 创建 Canvas Markdown Note；Canvas 会在变更前校验目标和资源。',
    parameters: {
      markdown: '原始 Markdown 内容；不要传入渲染后的 HTML。',
      title: '可选标题。',
      sourceFormat: '来源格式提示。',
      resources: 'Markdown 中引用的稳定资源列表。',
      target: '可选 Canvas 插入目标。',
      provenance: '可选 Agent 来源信息。',
      intentHint: '可选内容意图提示。',
      profileHint: '可选 Canvas profile 提示。',
      tableTitle: '可选表格标题。',
      mode: '可选分镜创建模式。',
      approval: '生产级 apply 变更所需的审批上下文。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_CREATE_TABLE_FROM_MARKDOWN]: {
    description: '从 Markdown 或 GFM 表格创建 Canvas 表格/草稿节点；Canvas 负责解析和诊断。',
    parameters: {
      markdown: '原始 Markdown 内容；不要传入渲染后的 HTML。',
      title: '可选标题。',
      sourceFormat: '来源格式提示。',
      resources: 'Markdown 中引用的稳定资源列表。',
      target: '可选 Canvas 插入目标。',
      provenance: '可选 Agent 来源信息。',
      intentHint: '可选内容意图提示。',
      profileHint: '可选 Canvas profile 提示。',
      tableTitle: '可选表格标题。',
      mode: '可选分镜创建模式。',
      approval: '生产级 apply 变更所需的审批上下文。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_CREATE_STORYBOARD_DRAFT_FROM_MARKDOWN]: {
    description: '从 Markdown 创建 review-first Canvas 分镜草稿，默认不创建生产分镜节点。',
    parameters: {
      markdown: '原始 Markdown 分镜内容。',
      title: '可选标题。',
      sourceFormat: '来源格式提示。',
      resources: 'Markdown 中引用的稳定资源列表。',
      target: '可选 Canvas 插入目标。',
      provenance: '可选 Agent 来源信息。',
      intentHint: '可选内容意图提示。',
      profileHint: '可选 Canvas profile 提示。',
      tableTitle: '可选表格标题。',
      mode: '可选分镜创建模式。',
      approval: '生产级 apply 变更所需的审批上下文。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_CREATE_STORYBOARD_FROM_MARKDOWN]: {
    description: '在显式确认后，从已校验 Markdown 创建生产 Canvas 分镜节点。',
    parameters: {
      markdown: '原始 Markdown 分镜内容。',
      title: '可选标题。',
      sourceFormat: '来源格式提示。',
      resources: 'Markdown 中引用的稳定资源列表。',
      target: '可选 Canvas 插入目标。',
      provenance: '可选 Agent 来源信息。',
      intentHint: '可选内容意图提示。',
      profileHint: '可选 Canvas profile 提示。',
      tableTitle: '可选表格标题。',
      mode: '可选分镜创建模式。',
      approval: '生产级 apply 变更所需的审批上下文。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_ATTACH_RESOURCE]: {
    description: '把稳定 ResourceRef 或 DocumentArchiveResourceRef 绑定到已有 Canvas 目标。',
    parameters: {
      target: '资源绑定的 Canvas 目标。',
      resource: '稳定 ResourceRef 或 DocumentArchiveResourceRef 包装对象。',
      role: '可选资源角色。',
      provenance: '可选 Agent 来源信息。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_VALIDATE_MARKDOWN_STORYBOARD]: {
    description: '只读校验 Markdown 分镜内容是否可被 Canvas 接收。',
    parameters: {
      markdown: '要校验的 Markdown 分镜内容。',
      title: '可选标题。',
      sourceFormat: '来源格式提示。',
      resources: 'Markdown 中引用的稳定资源列表。',
      target: '可选 Canvas 插入目标。',
      provenance: '可选 Agent 来源信息。',
      intentHint: '内容意图提示。',
      profileHint: 'Canvas profile 提示。',
      tableTitle: '可选表格标题。',
      mode: '可选分镜创建模式。',
      approval: '生产级 apply 变更所需的审批上下文。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_LIST_NODES]: {
    description: '列出当前画布上的节点，可按类型过滤。',
    parameters: {
      type: '可选节点类型过滤条件。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_GET_NODE]: {
    description: '按节点 ID 读取单个 Canvas 节点的完整信息。',
    parameters: {
      nodeId: 'Canvas 节点 ID。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_UPDATE_NODE]: {
    description:
      '更新 Canvas 节点的数据字段。生成图片前先把提示词/参数写回节点，保证会话压缩后仍可恢复。',
    parameters: {
      nodeId: 'Canvas 节点 ID。',
      data: '要合并到 node.data 的部分字段。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_CREATE_NODE]: {
    description: '在当前画布创建一个新节点，并返回新节点 ID。',
    parameters: {
      type: '节点类型。',
      preset: '可选的 Canvas 预设；优先使用可组合预设以获得稳定渲染和预览 metadata。',
      x: '画布 X 坐标。',
      y: '画布 Y 坐标。',
      data: '节点初始数据。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_DERIVE_NODE]: {
    description: '基于已有节点和注册预设派生后继节点，并创建普通 Canvas 连接。',
    parameters: {
      sourceNodeId: '来源 Canvas 节点 ID。',
      targetPreset: '可选目标预设。',
      targetType: '未提供目标预设时使用的目标节点类型。',
      data: '覆盖默认值的可选数据。',
      connect: '是否连接来源和派生节点，默认 true。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_CREATE_COMPOSITE]: {
    description: '按容器策略一次性创建容器和子节点，并执行共享自动布局。',
    parameters: {
      containerPreset: '注册的容器预设。',
      x: '容器 X 坐标。',
      y: '容器 Y 坐标。',
      data: '容器默认数据或覆盖值。',
      children: '子节点规格列表。',
      autoLayout: '是否在容器内自动排列子节点，默认 true。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_UPDATE_BLOCK]: {
    description: '通过 block 绑定或 node.data JSON Pointer 路径更新可组合 Canvas block。',
    parameters: {
      nodeId: 'Canvas 节点 ID。',
      blockId: '带绑定的可组合 block ID。',
      path: 'node.data 内的 JSON Pointer 路径，例如 /content。',
      value: '新值；对象应传入 JSON 文本。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_EXTRACT_STRUCTURED_CONTENT]: {
    description:
      '从 Canvas 节点提取 JSON、Markdown 或 prompt 文本，保留层级边界并忽略运行时预览状态。',
    parameters: {
      nodeIds: '可选显式节点 ID；省略时使用选择或全部节点。',
      format: '提取格式。',
      includeChildren: '是否递归包含容器子节点。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT]: {
    description:
      '读取紧凑的当前 Canvas 上下文，包括选区、子系统摘要、插入点、视口、焦点容器和可编辑字段。',
    parameters: {
      includeSelection: '是否包含选中节点 ID 和紧凑摘要。',
      includeFocusedContainer: '是否包含焦点容器摘要和子节点约束。',
      includeNodeDetails: '是否包含更丰富的节点摘要；大型媒体数据仍会省略。',
      includeSubsystemMetadata:
        '是否包含 narrative、behavior、entity、memory 子系统的有界 metadata 摘要。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_NARRATIVE_TRAVERSE]: {
    description:
      '遍历混合 Canvas 中的 narrative flow 节点；不会遍历 storyboard、behavior、entity 或 memory 节点。',
    parameters: {
      startNodeId: '可选 narrative 起始节点 ID。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_APPLY_AGENT_CONTENT]: {
    description:
      '把 Agent 生成的文本、优化提示词或结构化内容应用到 Canvas 节点、容器、字段路径或视口插入点。',
    parameters: {
      kind: '要应用的内容类型。',
      text: 'kind=text 时的文本内容。',
      prompt: 'kind=prompt 时的提示词内容。',
      contentJson: 'kind=structured 时的 JSON 字符串。',
      title: '可选内容标题。',
      format: '内容格式提示。',
      nodeId: '显式 Canvas 节点目标。',
      containerId: '显式 Canvas 容器目标。',
      slotId: '显式 Canvas 槽位目标。',
      fieldPath: 'node.data 内的 JSON Pointer 路径，例如 /generationPrompt。',
      mode: '变更模式；replace/apply 需要显式目标数据。',
      x: '画布插入 X 坐标。',
      y: '画布插入 Y 坐标。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_GET_STORYBOARD_EXECUTION_SUMMARY]: {
    description:
      '读取 Story/Agent 工作流可用的只读场景/镜头执行摘要，包含稳定场景 ID、镜头数、生成状态和时间线导入 metadata。',
    parameters: {
      sourceScriptUri: '可选源剧本 URI，用于关联导入的 Story 场景。',
      sceneId: '可选 Story 场景 ID。',
      sceneNodeId: '可选 Canvas SceneGroup 节点 ID。',
      canvasFileUri: '可选 Canvas 文件 URI，用于跟踪绑定。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_GENERATE_IMAGE]: {
    description:
      '触发 ShotNode 或 Gallery 子媒体节点的图片生成。调用前先用 canvas_update_node 写入提示词/参数。',
    parameters: {
      nodeId: 'ShotNode 或 GalleryNode ID。',
      childNodeId: 'GalleryNode 的子媒体节点 ID。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_GENERATE_BATCH]: {
    description: '批量触发多个镜头节点的图片生成，适合一次生成一个场景内所有镜头。',
    parameters: {
      nodeIds: '要生成图片的 ShotNode ID 列表。',
    },
  },
  [TOOL_NAMES_CANVAS.SET_PROJECT_GENERATION_CONFIG]: {
    description:
      '保存项目级生成参数和模型配置；它们会作为节点默认值。批量生成前应先调用，避免上下文压缩后丢失参数。',
    parameters: {
      imageRatio: '图片画幅比例。',
      imageResolution: '图片分辨率。',
      videoRatio: '视频画幅比例。',
      videoResolution: '视频分辨率。',
      videoDuration: '视频时长，单位秒。',
      videoFps: '视频帧率。',
      imageModel: '图片生成模型 ID。',
      videoModel: '视频生成模型 ID。',
      audioModel: '音频生成模型 ID。',
    },
  },
  [TOOL_NAMES_CANVAS.EXPORT_STORYBOARD]: {
    description: '将分镜导出为 ZIP 图片包，或导入到 neko-cut 时间线。',
    parameters: {
      format: '导出格式：zip 或 neko-cut。',
      projectName: '用于文件名和 manifest 的项目名称。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_APPLY_STYLE_TRANSFER]: {
    description: '使用 GalleryNode 作为风格参考，对目标 ShotNode 应用风格迁移并触发批量图片生成。',
    parameters: {
      targetNodeIds: '要应用风格迁移的 ShotNode 列表。',
      referenceNodeId: '作为 IP-Adapter 风格参考的 GalleryNode ID。',
    },
  },
  [TOOL_NAMES_CANVAS.IMPORT_SCRIPT_TO_CANVAS]: {
    description: '把 Fountain 剧本导入当前 Canvas，生成分镜骨架或语义分镜计划。',
    parameters: {
      path: 'Fountain 剧本文件的绝对路径。',
      mode: '导入模式：mechanical 为启发式骨架，semantic 使用 ScenePlan/ShotPlan。',
      startX: '第一个 SceneGroupNode 的画布 X 坐标。',
      startY: '第一个 SceneGroupNode 的画布 Y 坐标。',
      scenesLimit: '最多导入的场景数量。',
      scenePlans: 'semantic 模式下可选的 ScenePlan/ShotPlan 数组。',
    },
  },
  [TOOL_NAMES_CANVAS.CANVAS_GENERATE_VIDEO_WITH_KEYFRAMES]: {
    description: '使用首帧和尾帧图片作为关键帧，为 ShotNode 生成视频片段。',
    parameters: {
      nodeId: '保存生成视频的目标 ShotNode ID。',
      firstFrameNodeId: '提供首帧图片的 ShotNode ID。',
      lastFrameNodeId: '提供尾帧图片的 ShotNode ID。',
      duration: '视频时长，单位秒。',
      aspectRatio: '画幅比例，例如 16:9 或 9:16。',
    },
  },
} satisfies Readonly<Record<CanvasToolName, CanvasToolLocalization>>;

function withCanvasToolMetadata<T extends Tool>(tool: T): T {
  const localization = CANVAS_TOOL_ZH_LOCALIZATIONS[tool.name as CanvasToolName];
  if (!localization) {
    throw new Error(`Missing zh localization for Canvas tool "${tool.name}".`);
  }
  return {
    ...tool,
    localization: {
      ...tool.localization,
      zh: localization,
    },
    traits: tool.traits ?? readCanvasToolTraits(tool.name as CanvasToolName),
  };
}

function readCanvasToolTraits(toolName: CanvasToolName): CanvasToolTraits {
  if (toolName === TOOL_NAMES_CANVAS.CANVAS_GENERATE_VIDEO_WITH_KEYFRAMES) {
    return { cost: 'expensive', reversible: false, locality: 'network', impactLevel: 'high' };
  }
  if (CANVAS_NETWORK_GENERATION_TOOL_NAMES.has(toolName)) {
    return { cost: 'moderate', reversible: false, locality: 'network', impactLevel: 'high' };
  }
  if (CANVAS_READ_ONLY_TOOL_NAMES.has(toolName)) {
    return { cost: 'free', reversible: true, locality: 'local', impactLevel: 'none' };
  }
  return { cost: 'free', reversible: true, locality: 'local', impactLevel: 'low' };
}

const CANVAS_MARKDOWN_STORYBOARD_SKILL: Skill = {
  name: 'canvas-markdown-storyboard',
  description:
    'Prepare reviewed Markdown storyboard or table content for Canvas ingestion. Use after the Agent has inspected the source material and decided Canvas should create or validate storyboard nodes.',
  content: [
    '# Canvas Markdown Storyboard',
    '',
    'Use this skill only after you have understood the user request and inspected required source material.',
    '',
    '## Canvas Lifecycle',
    '- Use canvas.validateMarkdownStoryboard to validate Markdown storyboard content without mutating Canvas.',
    '- Use canvas.createStoryboardDraftFromMarkdown when the user needs a draft Canvas representation for review.',
    '- Use canvas.createStoryboardFromMarkdown only after review/approval for Canvas mutation.',
    '- Use canvas.attachResource when reviewed rows need explicit resource refs bound to Canvas targets.',
    '',
    'Do not invent fixed storyboard table headers in the Agent runtime. Preserve user/source language and field names in Markdown, and let Canvas profile validation decide whether a field is supported.',
  ].join('\n'),
  allowedTools: [
    'canvas.validateMarkdownStoryboard',
    'canvas.createStoryboardDraftFromMarkdown',
    'canvas.createStoryboardFromMarkdown',
    'canvas.attachResource',
  ],
  source: 'builtin',
  enabled: true,
  icon: 'canvas',
  mediaWorkflow: {
    referencedCapabilities: [
      'canvas.validateMarkdownStoryboard',
      'canvas.createStoryboardDraftFromMarkdown',
      'canvas.createStoryboardFromMarkdown',
      'canvas.attachResource',
    ],
    validationRequirements: ['CanvasMarkdownCapabilityInput'],
    tags: ['canvas', 'markdown', 'storyboard'],
  },
};

class NekoCanvasCapabilityProviderImpl implements AgentCapabilityProvider {
  readonly id = 'neko-canvas';
  readonly version = '1.0.0';

  constructor(private readonly _api: NekoCanvasAPI) {}

  getSkills(): Skill[] {
    return [CANVAS_MARKDOWN_STORYBOARD_SKILL];
  }

  getArtifactFacets(_context: AgentCapabilityContext): AgentArtifactFacetsContribution {
    return {
      renderers: [
        {
          id: 'renderer:neko-canvas:generic-artifact-preview',
          accepts: ['CompositeArtifact', 'GenericTable', 'StoryboardTable'],
          profiles: ['comic-shot-asset-prep', 'comic-to-animation-plan', 'manga-to-video'],
          lazy: true,
        },
      ],
      projectors: [
        {
          id: 'projector:canvas-playback-route-card',
          accepts: ['CanvasPlaybackPlan'],
          produces: ['CompositeArtifact'],
          profiles: ['canvas-playback-route'],
          lazy: true,
        },
      ],
      capabilities: [
        {
          capabilityId: 'canvas.getPlaybackPlan',
          packageId: 'neko-canvas',
          accepts: ['CanvasDocumentRef'],
          produces: ['CanvasPlaybackPlan'],
          actions: ['canvas.getPlaybackPlan', 'canvas.getPlaybackRoutes'],
          risk: 'low',
          requiresApproval: false,
        },
        {
          capabilityId: 'canvas.revealPlaybackWorkspace',
          packageId: 'neko-canvas',
          accepts: ['CanvasPlaybackPlan', 'CanvasPlaybackRoute'],
          actions: ['canvas.revealPlaybackWorkspace'],
          risk: 'low',
          requiresApproval: false,
        },
        {
          capabilityId: 'canvas.createCutDraftFromRoute',
          packageId: 'neko-canvas',
          accepts: ['CanvasPlaybackRoute'],
          produces: ['CanvasCutDraftPayload'],
          actions: ['canvas.createCutDraftFromRoute'],
          risk: 'medium',
          requiresApproval: true,
        },
        {
          capabilityId: 'canvas.reorderPlaybackUnits',
          packageId: 'neko-canvas',
          accepts: ['CanvasPlaybackRoute'],
          produces: ['CanvasPlaybackPlan'],
          actions: ['canvas.reorderPlaybackUnits'],
          risk: 'medium',
          requiresApproval: true,
        },
        {
          capabilityId: 'canvas.ingestMarkdown',
          packageId: 'neko-canvas',
          accepts: ['Markdown', 'GfmTable'],
          produces: ['canvas-node-ref'],
          actions: ['canvas.ingestMarkdown'],
          risk: 'medium',
          requiresApproval: true,
        },
        {
          capabilityId: 'canvas.createMarkdownNote',
          packageId: 'neko-canvas',
          accepts: ['Markdown'],
          produces: ['canvas-node-ref'],
          actions: ['canvas.createMarkdownNote'],
          risk: 'medium',
          requiresApproval: true,
        },
        {
          capabilityId: 'canvas.createTableFromMarkdown',
          packageId: 'neko-canvas',
          accepts: ['MarkdownTable', 'GfmTable'],
          produces: ['canvas-node-ref'],
          actions: ['canvas.createTableFromMarkdown'],
          risk: 'medium',
          requiresApproval: true,
        },
        {
          capabilityId: 'canvas.createStoryboardDraftFromMarkdown',
          packageId: 'neko-canvas',
          accepts: ['MarkdownStoryboardDraft', 'GfmTable'],
          produces: ['canvas-node-ref'],
          actions: ['canvas.createStoryboardDraftFromMarkdown'],
          risk: 'medium',
          requiresApproval: true,
        },
        {
          capabilityId: 'canvas.createStoryboardFromMarkdown',
          packageId: 'neko-canvas',
          accepts: ['MarkdownStoryboardDraft'],
          produces: ['canvas-node-ref'],
          actions: ['canvas.createStoryboardFromMarkdown'],
          risk: 'medium',
          requiresApproval: true,
        },
        {
          capabilityId: 'canvas.attachResource',
          packageId: 'neko-canvas',
          accepts: ['ResourceRef', 'DocumentArchiveResourceRef'],
          produces: ['canvas-node-ref'],
          actions: ['canvas.attachResource'],
          risk: 'medium',
          requiresApproval: true,
        },
        {
          capabilityId: 'canvas.validateMarkdownStoryboard',
          packageId: 'neko-canvas',
          accepts: ['MarkdownStoryboardDraft', 'GfmTable'],
          produces: ['CanvasMarkdownCapabilityDiagnostics'],
          actions: ['canvas.validateMarkdownStoryboard'],
          risk: 'low',
          requiresApproval: false,
        },
      ],
      lifecycleCapabilities: CANVAS_MARKDOWN_LIFECYCLE_DESCRIPTORS,
    };
  }

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
      ...CANVAS_MARKDOWN_TOOL_DEFINITIONS.map((definition) =>
        createMarkdownCapabilityTool(api, definition),
      ),
      // -----------------------------------------------------------------------
      // Canvas playback route tools
      // -----------------------------------------------------------------------
      {
        name: TOOL_NAMES_CANVAS.CANVAS_GET_PLAYBACK_PLAN,
        description:
          'Read the active CanvasPlaybackPlan projection. This displays Canvas order only; Agent must not persist route order, playhead, or media playback state.',
        category: 'project',
        isReadOnly: true,
        isConcurrencySafe: true,
        safetyKind: 'read-only-query',
        parameters: {
          type: 'object',
          properties: {
            sourceCanvasUri: {
              type: 'string',
              description: 'Optional Canvas document URI. Omit for the active Canvas.',
            },
          },
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const data = await api.playback.getPlan(readOptionalString(args.sourceCanvasUri));
            return { success: true, data };
          } catch (err) {
            return { success: false, error: `Failed to get Canvas playback plan: ${String(err)}` };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_GET_PLAYBACK_ROUTES,
        description:
          'Read effective Canvas playback route candidates derived from CanvasPlaybackPlan. Does not create an Agent-owned timeline.',
        category: 'project',
        isReadOnly: true,
        isConcurrencySafe: true,
        safetyKind: 'read-only-query',
        parameters: {
          type: 'object',
          properties: {
            sourceCanvasUri: {
              type: 'string',
              description: 'Optional Canvas document URI. Omit for the active Canvas.',
            },
          },
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const data = await api.playback.getRoutes(readOptionalString(args.sourceCanvasUri));
            return { success: true, data };
          } catch (err) {
            return {
              success: false,
              error: `Failed to get Canvas playback routes: ${String(err)}`,
            };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_REVEAL_PLAYBACK_WORKSPACE,
        description:
          'Reveal the same-Webview Canvas PlaybackWorkspace for route playback. Agent dispatches; Canvas owns playback UI and playhead.',
        category: 'project',
        isReadOnly: true,
        safetyKind: 'read-only-query',
        parameters: {
          type: 'object',
          properties: {
            sourceCanvasUri: { type: 'string', description: 'Optional Canvas document URI.' },
            routeId: { type: 'string', description: 'Optional playback route id to focus.' },
            unitId: { type: 'string', description: 'Optional playback unit id to jump to.' },
          },
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const data = await api.playback.revealWorkspace({
              sourceCanvasUri: readOptionalString(args.sourceCanvasUri),
              routeId: readOptionalString(args.routeId),
              unitId: readOptionalString(args.unitId),
            });
            return { success: data, data: { revealed: data } };
          } catch (err) {
            return {
              success: false,
              error: `Failed to reveal Canvas playback workspace: ${String(err)}`,
            };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_CREATE_CUT_DRAFT_FROM_ROUTE,
        description:
          'Project a Canvas playback route to a CanvasCutDraftPayload and optionally hand it to Cut. Requires confirmation before creating/updating Cut state.',
        category: 'project',
        requiresConfirmation: true,
        safetyKind: 'confirmation-gated',
        targetRequirements: {
          required: ['routeId'],
          allowedFallbacks: ['selection', 'explicit-user-input'],
          confirmationModes: ['create-cut-draft', 'send-to-cut'],
        },
        queryBeforeMutate: {
          preferredQueryTools: [
            TOOL_NAMES_CANVAS.CANVAS_GET_PLAYBACK_PLAN,
            TOOL_NAMES_CANVAS.CANVAS_GET_PLAYBACK_ROUTES,
          ],
          reason:
            'Show route title, unit count, diagnostics, target project, and import risk before creating a Cut draft.',
        },
        parameters: {
          type: 'object',
          properties: {
            sourceCanvasUri: { type: 'string', description: 'Optional Canvas document URI.' },
            routeId: { type: 'string', description: 'Playback route id to project.' },
            projectName: { type: 'string', description: 'Optional target Cut project name.' },
            sendToCut: {
              type: 'boolean',
              description:
                'When true, dispatch the created draft to the active Cut timeline after confirmation.',
            },
          },
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const draft = await api.playback.createCutDraftFromRoute({
              sourceCanvasUri: readOptionalString(args.sourceCanvasUri),
              routeId: readOptionalString(args.routeId),
              projectName: readOptionalString(args.projectName),
            });
            let cutImportResult: unknown;
            if (args.sendToCut === true) {
              cutImportResult = await vscode.commands.executeCommand(
                'neko.cut.importCanvasDraft',
                draft,
              );
            }
            return {
              success: true,
              data: {
                draft,
                sentToCut: args.sendToCut === true,
                ...(args.sendToCut === true ? { cutImportResult } : {}),
              },
            };
          } catch (err) {
            return { success: false, error: `Failed to create Canvas Cut draft: ${String(err)}` };
          }
        },
      },
      {
        name: TOOL_NAMES_CANVAS.CANVAS_REORDER_PLAYBACK_UNITS,
        description:
          'Reorder Canvas playback units by writing through Canvas graph commands and then reprojecting CanvasPlaybackPlan. Agent-inferred reorder requires confirmation.',
        category: 'project',
        requiresConfirmation: true,
        safetyKind: 'confirmation-gated',
        targetRequirements: {
          required: ['routeId', 'orderedUnitIds'],
          allowedFallbacks: ['explicit-user-input'],
          confirmationModes: ['agent-inferred'],
        },
        queryBeforeMutate: {
          preferredQueryTools: [
            TOOL_NAMES_CANVAS.CANVAS_GET_PLAYBACK_PLAN,
            TOOL_NAMES_CANVAS.CANVAS_GET_PLAYBACK_ROUTES,
          ],
          reason:
            'Resolve the exact route and full ordered unit set before mutating Canvas graph order.',
        },
        parameters: {
          type: 'object',
          properties: {
            sourceCanvasUri: { type: 'string', description: 'Optional Canvas document URI.' },
            routeId: { type: 'string', description: 'Playback route id to reorder.' },
            orderedUnitIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Full ordered playback unit id list for the selected route.',
            },
            approvalContext: {
              type: 'string',
              enum: ['explicit-user-instruction', 'agent-confirmed', 'agent-inferred'],
              description:
                'explicit-user-instruction may auto-approve same-turn specific user reorder; agent-inferred remains confirmation-gated.',
            },
            instructionText: {
              type: 'string',
              description: 'Specific same-turn user reorder instruction, if present.',
            },
          },
          required: ['orderedUnitIds'],
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const approvalContext = readPlaybackReorderApprovalContext(args.approvalContext);
            if (approvalContext === 'agent-inferred') {
              return {
                success: false,
                error: 'Agent-inferred Canvas playback reorder requires confirmation.',
              };
            }
            const data = await api.playback.reorderUnits({
              sourceCanvasUri: readOptionalString(args.sourceCanvasUri),
              routeId: readOptionalString(args.routeId),
              orderedUnitIds: readStringArray(args.orderedUnitIds),
              approvalContext,
              instructionText: readOptionalString(args.instructionText),
            });
            return { success: true, data };
          } catch (err) {
            return {
              success: false,
              error: `Failed to reorder Canvas playback units: ${String(err)}`,
            };
          }
        },
      },
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
                'Optional registered Canvas preset. Prefer composable presets for block rendering and preview metadata.',
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
              ? (context as { connections: CanvasConnection[] }).connections
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
          'Trigger image generation for a ShotNode or a specific gallery child media node. ' +
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
            videoFps: { type: 'number', enum: [24, 30], description: 'Video frame rate' },
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
                imageFile: readShotGeneratedImageFallback(d) ? imageFile : undefined,
              };
            });

            if (format === 'neko-cut') {
              const shotDataById = new Map<string, Record<string, unknown>>(
                allShots.map((node) => [node.id, node.data as Record<string, unknown>]),
              );
              const timelineShots = manifestShots.map((s) => {
                const data = shotDataById.get(s.id);
                const referenceDescriptors: readonly ReferenceDescriptor[] = data
                  ? collectShotKeyframeReferenceDescriptors(s.id, data)
                  : [];
                return {
                  id: s.id,
                  shotNumber: s.shotNumber,
                  duration: s.duration,
                  ...(data
                    ? {
                        preparedKeyframeRef: readShotPreparedKeyframeRef(data),
                        imageDataUrl: readShotGeneratedImageFallback(data),
                      }
                    : {}),
                  ...(referenceDescriptors.length > 0 ? { referenceDescriptors } : {}),
                  dialogue: s.dialogue,
                  voiceOver: s.voiceOver,
                  soundCue: s.soundCue,
                  label: `#${String(s.shotNumber).padStart(3, '0')} ${s.shotScale ?? ''}`.trim(),
                };
              });

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
    const localizedTools = tools.map((tool) => withCanvasToolMetadata(tool));

    // -----------------------------------------------------------------------
    // Keyframe Video Generation (requires mediaService)
    // -----------------------------------------------------------------------
    if (mediaService) {
      localizedTools.push(
        withCanvasToolMetadata(createVideoKeyframeTool(api, mediaService, logger)),
      );
    }

    return localizedTools;
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

        const firstNodeData = firstNode.data as Record<string, unknown>;
        const lastNodeData = lastNode.data as Record<string, unknown>;
        const firstFrameRefs = collectShotKeyframeReferenceDescriptors(
          firstFrameNodeId,
          firstNodeData,
        );
        const lastFrameRefs = collectShotKeyframeReferenceDescriptors(
          lastFrameNodeId,
          lastNodeData,
        );
        const firstFrameData = readShotGeneratedImageFallback(firstNodeData);
        const lastFrameData = readShotGeneratedImageFallback(lastNodeData);

        if (!firstFrameData && firstFrameRefs.length === 0) {
          return {
            success: false,
            error: `First frame node "${firstFrameNodeId}" has no generated image or prepared keyframe reference. Run canvas_generate_image first.`,
          };
        }

        // Build prompt from target node's visual description
        const visualDesc = (targetNode.data as Record<string, unknown>)['visualDescription'] as
          string | undefined;
        const shotNumber = (targetNode.data as Record<string, unknown>)['shotNumber'] as
          number | undefined;
        const prompt = visualDesc?.trim() || `Shot ${shotNumber ?? ''} video clip`;
        const lineage = extractCanvasNodeGenerationLineage(targetNode);
        const metadata: Record<string, unknown> = {
          sourceNodeId: lineage?.sourceNodeId ?? nodeId,
        };
        if (lastFrameData) {
          metadata['lastFrameUrl'] = lastFrameData;
        }
        const referenceDescriptors = [...firstFrameRefs, ...lastFrameRefs];
        if (referenceDescriptors.length > 0) {
          metadata['referenceDescriptors'] = referenceDescriptors;
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
            ...(firstFrameData ? { referenceImageUrl: firstFrameData } : {}),
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
