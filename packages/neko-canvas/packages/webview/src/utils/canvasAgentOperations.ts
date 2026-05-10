import type {
  CanvasBlock,
  CanvasConnection,
  CanvasCreateCompositeRequest,
  CanvasCreateCompositeResult,
  CanvasDeriveNodeRequest,
  CanvasDeriveNodeResult,
  CanvasExtractStructuredContentRequest,
  CanvasExtractStructuredContentResult,
  CanvasNode,
  CanvasStructuredNodeSummary,
  CanvasUpdateBlockRequest,
  CanvasUpdateBlockResult,
  FieldBinding,
  JsonPointerPath,
} from '@neko/shared';
import {
  getBuiltInCanvasNodePresetMetadata,
  getContainerChildIds,
  getDefaultCanvasNodePresetName,
  getNodeParentId,
  isJsonPointerPath,
  readFieldBinding,
  readJsonPointer,
  writeFieldBinding,
} from '@neko/shared';
import { createContainerComposite } from './containerActions';
import { autoArrangeContainer, findFreePosition } from './containerLayout';
import { hydrateCanvasNodePreview, refreshCanvasNodePreview } from './canvasPresetRegistry';
import { buildCanvasNode } from './nodeFactory';

export interface CanvasAgentOperationContext {
  nodes: CanvasNode[];
  connections: CanvasConnection[];
  generateId: () => string;
}

export interface CanvasAgentMutationResult<T> {
  result: T;
  nodes: CanvasNode[];
  connections: CanvasConnection[];
}

const DERIVE_GAP = 60;

export function deriveCanvasNode(
  context: CanvasAgentOperationContext,
  request: CanvasDeriveNodeRequest,
): CanvasAgentMutationResult<CanvasDeriveNodeResult> {
  const sourceNode = context.nodes.find((node) => node.id === request.sourceNodeId);
  if (!sourceNode) {
    throw new Error(`Source node "${request.sourceNodeId}" not found`);
  }

  const sourcePresetName = sourceNode.preset ?? getDefaultCanvasNodePresetName(sourceNode.type);
  const sourcePreset = getBuiltInCanvasNodePresetMetadata(sourcePresetName);
  const targetPresetName =
    request.targetPreset ??
    (request.targetType ? getDefaultCanvasNodePresetName(request.targetType) : sourcePresetName);
  const targetPreset = getBuiltInCanvasNodePresetMetadata(targetPresetName);
  if (!targetPreset || !targetPresetName) {
    throw new Error(`Unsupported target preset "${targetPresetName ?? 'unknown'}"`);
  }
  if (sourcePreset && !sourcePreset.deriveTargets.includes(targetPresetName)) {
    throw new Error(`Preset "${sourcePreset.name}" cannot derive "${targetPresetName}"`);
  }

  const nodeSpec = createNodeSpec({
    type: targetPreset.nodeType,
    preset: targetPresetName,
    position: findFreePosition({
      preferred: {
        x: sourceNode.position.x + sourceNode.size.width + DERIVE_GAP,
        y: sourceNode.position.y,
      },
      size: sourceNode.size,
      nodes: context.nodes,
    }),
    data: {
      ...createDeriveData(sourceNode, targetPreset.nodeType, context.nodes),
      ...(request.data ?? {}),
    },
  });
  const nodeId = context.generateId();
  const nextNode = hydrateCanvasNodePreview({
    ...nodeSpec,
    id: nodeId,
    zIndex: (context.nodes.length + 1) * 10,
  } as CanvasNode);
  const nextNodes = [...context.nodes, nextNode];

  let nextConnections = context.connections;
  let connectionId: string | undefined;
  if (request.connect !== false) {
    connectionId = context.generateId();
    nextConnections = [
      ...context.connections,
      {
        id: connectionId,
        sourceId: sourceNode.id,
        targetId: nodeId,
        sourceAnchor: 'right',
        targetAnchor: 'left',
        type: 'default',
        sourceEndpoint: { nodeId: sourceNode.id, scope: 'node' },
        targetEndpoint: { nodeId, scope: 'node' },
      },
    ];
  }

  return {
    result: { nodeId, connectionId, node: nextNode },
    nodes: nextNodes,
    connections: nextConnections,
  };
}

export function createCanvasComposite(
  context: CanvasAgentOperationContext,
  request: CanvasCreateCompositeRequest,
): CanvasAgentMutationResult<CanvasCreateCompositeResult> {
  const containerPresetName =
    request.containerPreset ??
    (request.containerType
      ? getDefaultCanvasNodePresetName(request.containerType)
      : 'group.container');
  const containerPreset = getBuiltInCanvasNodePresetMetadata(containerPresetName);
  if (!containerPreset || !containerPreset.containerPolicy) {
    throw new Error(`Unsupported container preset "${containerPresetName ?? 'unknown'}"`);
  }

  const containerId = context.generateId();
  const containerNode = hydrateCanvasNodePreview({
    ...createNodeSpec({
      type: containerPreset.nodeType,
      preset: containerPresetName,
      position:
        request.position ??
        findFreePosition({
          preferred: { x: 0, y: 0 },
          size: { width: 320, height: 240 },
          nodes: context.nodes,
        }),
      data: request.data,
    }),
    id: containerId,
    zIndex: (context.nodes.length + 1) * 10,
  } as CanvasNode);

  const children = request.children.map((child, index) => {
    const childPresetName =
      child.preset ?? (child.type ? getDefaultCanvasNodePresetName(child.type) : undefined);
    const childPreset = getBuiltInCanvasNodePresetMetadata(childPresetName);
    if (!childPreset || !childPresetName) {
      throw new Error(`Unsupported child preset "${childPresetName ?? 'unknown'}"`);
    }

    const childId = child.id ?? context.generateId();
    const childPosition =
      child.position ?? defaultChildPosition(containerNode, index, childPreset.nodeType);
    return hydrateCanvasNodePreview({
      ...createNodeSpec({
        ...child,
        type: childPreset.nodeType,
        preset: childPresetName,
        position: childPosition,
      }),
      id: childId,
      zIndex: (context.nodes.length + index + 2) * 10,
    } as CanvasNode);
  });

  const composite = createContainerComposite(context.nodes, {
    container: containerNode,
    children,
  });
  if (!composite.changed) {
    throw new Error(composite.error ?? 'Composite creation failed');
  }

  const layoutMode = containerPreset.containerPolicy === 'scene' ? 'sequence' : 'grid';
  const nextNodes =
    request.autoLayout === false
      ? composite.nodes
      : autoArrangeContainer(composite.nodes, { containerId, mode: layoutMode });

  return {
    result: {
      containerId,
      childIds: children.map((child) => child.id),
      nodes: nextNodes.filter(
        (node) => node.id === containerId || children.some((child) => child.id === node.id),
      ),
    },
    nodes: nextNodes,
    connections: context.connections,
  };
}

export function updateCanvasBlock(
  node: CanvasNode,
  request: CanvasUpdateBlockRequest,
): CanvasUpdateBlockResult & { node: CanvasNode } {
  const binding = resolveUpdateBinding(node, request);
  const written = writeFieldBinding(node.data, binding, request.value);
  const nextNode = written.changed
    ? refreshCanvasNodePreview({
        ...node,
        data: written.data as Record<string, unknown>,
      } as CanvasNode)
    : node;

  return {
    nodeId: node.id,
    changed: written.changed,
    data: nextNode.data as Record<string, unknown>,
    node: nextNode,
  };
}

export function extractStructuredCanvasContent(
  nodes: CanvasNode[],
  request: CanvasExtractStructuredContentRequest,
): CanvasExtractStructuredContentResult {
  const selectedIds = request.nodeIds?.length
    ? Array.from(new Set(request.nodeIds))
    : nodes.map((node) => node.id);
  const expandedIds = request.includeChildren
    ? includeDescendantIds(nodes, selectedIds)
    : selectedIds;
  const summaries = expandedIds
    .map((nodeId) => nodes.find((node) => node.id === nodeId))
    .filter((node): node is CanvasNode => Boolean(node))
    .map(summarizeNode);

  return {
    format: request.format,
    nodeIds: summaries.map((summary) => summary.id),
    nodes: summaries,
    content:
      request.format === 'json'
        ? summaries
        : request.format === 'markdown'
          ? renderMarkdown(summaries)
          : renderPrompt(summaries),
  };
}

function createNodeSpec(spec: {
  type: CanvasNode['type'];
  preset?: string;
  position?: { x: number; y: number };
  data?: Record<string, unknown>;
}): Omit<CanvasNode, 'id'> {
  const preset = spec.preset;
  if (preset && !getBuiltInCanvasNodePresetMetadata(preset)) {
    throw new Error(`Unsupported preset "${preset}"`);
  }
  const position = spec.position ?? { x: 0, y: 0 };
  return buildCanvasNode({
    type: spec.type,
    position,
    data: spec.data ?? {},
    zIndex: 1,
    preset,
  });
}

function createDeriveData(
  sourceNode: CanvasNode,
  targetType: CanvasNode['type'],
  nodes: CanvasNode[],
): Record<string, unknown> {
  const sourceData = sourceNode.data as Record<string, unknown>;
  if (targetType === 'shot') {
    const shotNumbers = nodes
      .filter((node) => node.type === 'shot')
      .map((node) => (node.data as Record<string, unknown>)['shotNumber'])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    return {
      shotNumber: shotNumbers.length > 0 ? Math.max(...shotNumbers) + 1 : 1,
      shotScale: typeof sourceData['shotScale'] === 'string' ? sourceData['shotScale'] : 'MS',
      cameraMovement: sourceData['cameraMovement'],
      cameraAngle: sourceData['cameraAngle'],
      duration: typeof sourceData['duration'] === 'number' ? sourceData['duration'] : 3,
      characters: [],
      emotion: [],
      generationStatus: 'idle',
      generationHistory: [],
    };
  }

  if (targetType === 'scene') {
    return { sceneTitle: '' };
  }

  if (targetType === 'annotation') {
    return { content: '' };
  }

  if (targetType === 'text') {
    return { content: '', format: 'plain' };
  }

  if (targetType === 'media') {
    return { assetPath: '', mediaType: 'image' };
  }

  return {};
}

function defaultChildPosition(
  containerNode: CanvasNode,
  index: number,
  childType: CanvasNode['type'],
): { x: number; y: number } {
  const width = childType === 'shot' ? 220 : 180;
  return {
    x: containerNode.position.x + 24 + index * (width + 24),
    y: containerNode.position.y + 64,
  };
}

function resolveUpdateBinding(node: CanvasNode, request: CanvasUpdateBlockRequest): FieldBinding {
  if (request.binding) {
    return request.binding;
  }

  if (request.path) {
    if (!isJsonPointerPath(request.path)) {
      throw new Error(`Invalid JSON Pointer path "${request.path}"`);
    }
    return { path: request.path, mode: 'readwrite' };
  }

  const block = findBlockBinding(node, request.blockId);
  if (!block) {
    throw new Error(`Block "${request.blockId ?? 'unknown'}" has no writable binding`);
  }

  return block;
}

function findBlockBinding(node: CanvasNode, blockId: string | undefined): FieldBinding | undefined {
  if (!blockId || !node.content) {
    return undefined;
  }

  const sections = [node.content];
  while (sections.length > 0) {
    const section = sections.shift();
    if (!section) continue;
    for (const block of section.blocks ?? []) {
      if (block.id === blockId && block.binding) {
        return block.binding;
      }
      const nested = findBindingInBlocks(block.children ?? [], blockId);
      if (nested) {
        return nested;
      }
    }
    sections.push(...(section.sections ?? []));
  }

  return undefined;
}

function findBindingInBlocks(
  blocks: readonly CanvasBlock[] | undefined,
  blockId: string,
): FieldBinding | undefined {
  for (const block of blocks ?? []) {
    if (block.id === blockId && block.binding) {
      return block.binding;
    }
    const nested = findBindingInBlocks(block.children ?? [], blockId);
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

function includeDescendantIds(nodes: CanvasNode[], selectedIds: readonly string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  function add(nodeId: string): void {
    if (seen.has(nodeId)) return;
    seen.add(nodeId);
    result.push(nodeId);
    const node = nodes.find((candidate) => candidate.id === nodeId);
    for (const childId of node ? getContainerChildIds(node) : []) {
      add(childId);
    }
  }

  for (const nodeId of selectedIds) {
    add(nodeId);
  }

  return result;
}

function summarizeNode(node: CanvasNode): CanvasStructuredNodeSummary {
  const childIds = getContainerChildIds(node);
  const bindings = collectBindings(node);
  return {
    id: node.id,
    type: node.type,
    preset: node.preset,
    title: getNodeTitle(node),
    summary: getNodeSummary(node),
    parentId: getNodeParentId(node),
    childIds: childIds.length > 0 ? childIds : undefined,
    data: sanitizeData(node.data as Record<string, unknown>),
    bindings,
    preview: node.preview
      ? {
          title: node.preview.title,
          subtitle: node.preview.subtitle,
          role: node.preview.role,
          thumbnailVariantId: node.preview.thumbnailVariantId,
        }
      : undefined,
  };
}

function collectBindings(node: CanvasNode): CanvasStructuredNodeSummary['bindings'] {
  if (!node.content) {
    return undefined;
  }

  const bindings: NonNullable<CanvasStructuredNodeSummary['bindings']> = [];
  const sections = [node.content];
  while (sections.length > 0) {
    const section = sections.shift();
    if (!section) continue;
    for (const block of section.blocks ?? []) {
      collectBlockBinding(node, block, bindings);
    }
    sections.push(...(section.sections ?? []));
  }
  return bindings.length > 0 ? bindings : undefined;
}

function collectBlockBinding(
  node: CanvasNode,
  block: CanvasBlock,
  bindings: NonNullable<CanvasStructuredNodeSummary['bindings']>,
): void {
  if (block.binding) {
    bindings.push({
      blockId: block.id,
      label: block.label,
      path: block.binding.path,
      value: sanitizeRuntimeValue(readFieldBinding(node.data, block.binding).value),
    });
  }
  if (block.collection) {
    bindings.push({
      blockId: block.id,
      label: block.label,
      path: block.collection.source.path,
      value: sanitizeRuntimeValue(readFieldBinding(node.data, block.collection.source).value),
    });
  }
  if (block.projection?.sourceBinding) {
    bindings.push({
      blockId: block.id,
      label: block.label,
      path: block.projection.sourceBinding.path,
      value: sanitizeRuntimeValue(
        readFieldBinding(node.data, block.projection.sourceBinding).value,
      ),
    });
  }
  for (const child of block.children ?? []) {
    collectBlockBinding(node, child, bindings);
  }
}

function getNodeTitle(node: CanvasNode): string | undefined {
  const data = node.data as Record<string, unknown>;
  const candidates = [
    data['sceneTitle'],
    data['title'],
    data['content'],
    data['label'],
    data['scriptTitle'],
    data['modelName'],
    data['canvasTitle'],
  ];
  const value = candidates.find(
    (candidate): candidate is string =>
      typeof candidate === 'string' && candidate.trim().length > 0,
  );
  return value ?? `${node.type}:${node.id}`;
}

function getNodeSummary(node: CanvasNode): string | undefined {
  const data = node.data as Record<string, unknown>;
  if (node.type === 'shot') {
    return joinDefined([
      readString(data, 'visualDescription'),
      readString(data, 'characterAction'),
      readString(data, 'dialogue'),
    ]);
  }
  if (node.type === 'scene') {
    return joinDefined([readString(data, 'location'), readString(data, 'timeOfDay')]);
  }
  return readString(data, 'description') ?? readString(data, 'content');
}

function renderMarkdown(summaries: CanvasStructuredNodeSummary[]): string {
  return summaries
    .map((summary) => {
      const lines = [`## ${summary.title ?? summary.id}`, `- Type: ${summary.type}`];
      if (summary.preset) lines.push(`- Preset: ${summary.preset}`);
      if (summary.parentId) lines.push(`- Parent: ${summary.parentId}`);
      if (summary.childIds?.length) lines.push(`- Children: ${summary.childIds.join(', ')}`);
      if (summary.summary) lines.push('', summary.summary);
      return lines.join('\n');
    })
    .join('\n\n');
}

function renderPrompt(summaries: CanvasStructuredNodeSummary[]): string {
  return summaries
    .map((summary) => {
      const parts = [`${summary.type} ${summary.title ?? summary.id}`];
      if (summary.summary) parts.push(summary.summary);
      const generationFields = pickPromptFields(summary.data);
      if (generationFields.length > 0) {
        parts.push(generationFields.join('; '));
      }
      return parts.join('\n');
    })
    .join('\n\n');
}

function pickPromptFields(data: Record<string, unknown>): string[] {
  const keys = [
    'visualDescription',
    'shotScale',
    'cameraMovement',
    'cameraAngle',
    'characterAction',
    'dialogue',
    'voiceOver',
    'soundCue',
    'generatedImage',
  ];
  return keys.flatMap((key) => {
    const result = readJsonPointer(data, `/${key}` as JsonPointerPath);
    return result.found && result.value !== undefined && result.value !== ''
      ? [`${key}: ${formatValue(result.value)}`]
      : [];
  });
}

function sanitizeData(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized = sanitizeRuntimeValue(data);
  return isRecord(sanitized) ? sanitized : {};
}

function sanitizeRuntimeValue(value: unknown): unknown {
  if (isRuntimeUrl(value)) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeRuntimeValue);
  }

  if (!isRecord(value)) {
    return value;
  }

  const runtimeKeys = new Set([
    'blobUrl',
    'blobURL',
    'objectUrl',
    'objectURL',
    'engineToken',
    'currentTime',
    'hoverTime',
    'activePlayback',
  ]);

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entryValue]) => {
      if (runtimeKeys.has(key)) {
        return [];
      }

      if (isRuntimeUrl(entryValue)) {
        return [];
      }

      const sanitizedValue = sanitizeRuntimeValue(entryValue);
      return [[key, sanitizedValue]];
    }),
  );
}

function isRuntimeUrl(value: unknown): value is string {
  return (
    typeof value === 'string' && (value.startsWith('blob:') || value.startsWith('mediastream:'))
  );
}

function readString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function joinDefined(values: Array<string | undefined>): string | undefined {
  const joined = values.filter((value): value is string => Boolean(value)).join('. ');
  return joined || undefined;
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(formatValue).join(', ');
  }
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }
  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
