import type {
  CanvasBlock,
  CanvasAgentActiveContextRequest,
  CanvasAgentActiveContextResult,
  CanvasAgentApplyContentResult,
  CanvasAgentContentPayload,
  CanvasAgentContainerSummary,
  CanvasAgentMutationMode,
  CanvasAgentNodeSummary,
  CanvasAgentTargetRef,
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
  getContainerPolicyName,
  getDefaultCanvasNodePresetName,
  getNodeParentId,
  isJsonPointerPath,
  type CanvasNodeType,
  readFieldBinding,
  readJsonPointer,
  writeJsonPointer,
  writeFieldBinding,
} from '@neko/shared';
import { addContainerChild, createContainerComposite } from './containerActions';
import { autoArrangeContainer, findFreePosition } from './containerLayout';
import { hydrateCanvasNodePreview, refreshCanvasNodePreview } from './canvasPresetRegistry';
import { buildCanvasNode } from './nodeFactory';
import {
  canContainerAcceptChild,
  createBuiltInContainerPolicyRegistry,
  getContainerPolicy,
} from './containerPolicies';

export interface CanvasAgentOperationContext {
  nodes: CanvasNode[];
  connections: CanvasConnection[];
  generateId: () => string;
}

export interface CanvasAgentActiveContextInput {
  nodes: CanvasNode[];
  selectedNodeIds: readonly string[];
  viewport?: CanvasAgentActiveContextResult['viewport'];
  insertionPoint?: CanvasAgentActiveContextResult['insertionPoint'];
  documentUri?: string;
  canvasId?: string;
  request?: CanvasAgentActiveContextRequest;
}

export interface CanvasAgentMutationResult<T> {
  result: T;
  nodes: CanvasNode[];
  connections: CanvasConnection[];
}

const DERIVE_GAP = 60;
const CONTAINER_POLICIES = createBuiltInContainerPolicyRegistry();
const DEFAULT_AGENT_INSERT_POSITION = { x: 0, y: 0 };
const TARGETABLE_FIELD_PATHS_BY_TYPE: Partial<Record<CanvasNodeType, readonly JsonPointerPath[]>> =
  {
    annotation: ['/content'],
    text: ['/content'],
    shot: [
      '/generationPrompt',
      '/visualDescription',
      '/characterAction',
      '/dialogue',
      '/voiceOver',
      '/soundCue',
      '/visualStyle',
    ],
    scene: ['/sceneTitle', '/location', '/timeOfDay'],
    storyboard: ['/title', '/description'],
    artboard: ['/name', '/description'],
    table: ['/label'],
    script: ['/title'],
    document: ['/title'],
    model: ['/modelName'],
    'canvas-embed': ['/canvasTitle'],
    project: ['/title'],
  };

export function createCanvasAgentActiveContext(
  input: CanvasAgentActiveContextInput,
): CanvasAgentActiveContextResult {
  const includeSelection = input.request?.includeSelection !== false;
  const selectedNodeIds = includeSelection
    ? input.selectedNodeIds.filter((nodeId) => input.nodes.some((node) => node.id === nodeId))
    : [];
  const selectedNodes = selectedNodeIds
    .map((nodeId) => input.nodes.find((node) => node.id === nodeId))
    .filter((node): node is CanvasNode => Boolean(node))
    .map((node) => summarizeCanvasAgentNode(node, input.request?.includeNodeDetails === true));

  const result: CanvasAgentActiveContextResult = {
    selectedNodeIds,
    selectedNodes,
    ...(input.documentUri ? { documentUri: input.documentUri } : {}),
    ...(input.canvasId ? { canvasId: input.canvasId } : {}),
    ...(input.insertionPoint ? { insertionPoint: input.insertionPoint } : {}),
    ...(input.viewport ? { viewport: input.viewport } : {}),
  };

  if (input.request?.includeFocusedContainer !== false) {
    const focusedContainer = findFocusedContainer(input.nodes, selectedNodeIds);
    if (focusedContainer) {
      result.focusedContainer = summarizeCanvasAgentContainer(focusedContainer);
    }
  }

  return result;
}

export function applyCanvasAgentContent(
  context: CanvasAgentOperationContext,
  payload: CanvasAgentContentPayload,
): CanvasAgentMutationResult<CanvasAgentApplyContentResult> {
  validatePayloadContent(payload);
  const target = normalizeCanvasAgentTarget(payload.target);
  const mode = resolveMutationMode(target);

  if (mode === 'replace' || mode === 'apply' || (mode === 'append' && target?.nodeId)) {
    return applyContentToNodeTarget(context, payload, target, mode);
  }

  if (target?.slotId) {
    throw new Error(`Unsupported Canvas slot target "${target.slotId}"`);
  }

  return insertContentNode(context, payload, target, mode);
}

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

export function summarizeCanvasAgentNode(
  node: CanvasNode,
  includeDetails = false,
): CanvasAgentNodeSummary {
  const childIds = getContainerChildIds(node);
  const summary: CanvasAgentNodeSummary = {
    id: node.id,
    type: node.type,
    preset: node.preset,
    title: getNodeTitle(node),
    summary: getNodeSummary(node),
    parentId: getNodeParentId(node),
    childIds: childIds.length > 0 ? childIds : undefined,
    targetableFields: getTargetableFields(node),
  };

  if (!includeDetails) {
    return summary;
  }

  return {
    ...summary,
    summary: summary.summary ?? renderNodeDataSummary(node),
  };
}

export function summarizeCanvasAgentContainer(node: CanvasNode): CanvasAgentContainerSummary {
  const policyName = getContainerPolicyName(node);
  const policy = getContainerPolicy(CONTAINER_POLICIES, policyName);
  const childIds = getContainerChildIds(node);
  return {
    id: node.id,
    type: node.type,
    preset: node.preset,
    policy: policyName,
    childIds,
    ...(policy?.acceptedNodeTypes ? { acceptedChildTypes: policy.acceptedNodeTypes } : {}),
    slots: [
      {
        id: 'children',
        label: 'Children',
        childIds,
      },
    ],
  };
}

function applyContentToNodeTarget(
  context: CanvasAgentOperationContext,
  payload: CanvasAgentContentPayload,
  target: CanvasAgentTargetRef | undefined,
  mode: CanvasAgentMutationMode,
): CanvasAgentMutationResult<CanvasAgentApplyContentResult> {
  if (!target?.nodeId) {
    throw new Error(`${mode} mode requires an explicit Canvas node target`);
  }
  if (target.slotId) {
    throw new Error(`Unsupported Canvas slot target "${target.slotId}"`);
  }

  const node = context.nodes.find((candidate) => candidate.id === target.nodeId);
  if (!node) {
    throw new Error(`Target node "${target.nodeId}" not found`);
  }

  const fieldPath = target.fieldPath ?? defaultFieldPathForPayload(node, payload);
  if (!fieldPath) {
    throw new Error(`No writable field available for ${payload.kind} content on ${node.type}`);
  }
  assertTargetableField(node, fieldPath);

  const nextValue =
    mode === 'append'
      ? appendCanvasAgentContentValue(node, fieldPath, payload)
      : coerceCanvasAgentContentValue(payload, fieldPath);
  const written = writeJsonPointer(node.data, fieldPath, nextValue);
  const nextNode = refreshCanvasNodePreview({
    ...node,
    data: written.data as Record<string, unknown>,
  } as CanvasNode);

  return {
    result: {
      changed: written.changed,
      mode,
      nodeId: node.id,
      target: { ...target, fieldPath },
    },
    nodes: context.nodes.map((candidate) => (candidate.id === node.id ? nextNode : candidate)),
    connections: context.connections,
  };
}

function insertContentNode(
  context: CanvasAgentOperationContext,
  payload: CanvasAgentContentPayload,
  target: CanvasAgentTargetRef | undefined,
  mode: CanvasAgentMutationMode,
): CanvasAgentMutationResult<CanvasAgentApplyContentResult> {
  const position = target?.insertionPoint ?? DEFAULT_AGENT_INSERT_POSITION;
  const nodeId = context.generateId();
  const node = hydrateCanvasNodePreview({
    ...createNodeSpec({
      type: 'text',
      position,
      data: {
        content: renderCanvasAgentContent(payload),
        format: payload.format === 'markdown' ? 'markdown' : 'plain',
      },
    }),
    id: nodeId,
    zIndex: (context.nodes.length + 1) * 10,
  } as CanvasNode);

  let nextNodes = [...context.nodes, node];
  if (target?.containerId) {
    const container = context.nodes.find((candidate) => candidate.id === target.containerId);
    if (!container) {
      throw new Error(`Target container "${target.containerId}" not found`);
    }
    const policy = getContainerPolicy(CONTAINER_POLICIES, getContainerPolicyName(container));
    if (!canContainerAcceptChild(policy, node)) {
      throw new Error(`Target container "${target.containerId}" does not accept text nodes`);
    }
    const added = addContainerChild(nextNodes, target.containerId, nodeId);
    if (!added.changed) {
      throw new Error(added.error ?? 'Failed to add content node to container');
    }
    nextNodes = added.nodes;
  }

  return {
    result: {
      changed: true,
      mode,
      nodeId,
      containerId: target?.containerId,
      createdNodeIds: [nodeId],
      target,
    },
    nodes: nextNodes,
    connections: context.connections,
  };
}

function validatePayloadContent(payload: CanvasAgentContentPayload): void {
  if (payload.kind === 'text' && typeof payload.text !== 'string') {
    throw new Error('Canvas Agent text payload requires text');
  }
  if (payload.kind === 'prompt' && typeof payload.prompt !== 'string') {
    throw new Error('Canvas Agent prompt payload requires prompt');
  }
  if (payload.kind === 'structured' && !Object.prototype.hasOwnProperty.call(payload, 'content')) {
    throw new Error('Canvas Agent structured payload requires content');
  }
}

function normalizeCanvasAgentTarget(
  target: CanvasAgentTargetRef | undefined,
): CanvasAgentTargetRef | undefined {
  if (!target) return undefined;
  if (target.fieldPath && !isJsonPointerPath(target.fieldPath)) {
    throw new Error(`Invalid JSON Pointer field path "${target.fieldPath}"`);
  }
  if (target.fieldPath && !target.nodeId) {
    throw new Error('Canvas fieldPath targets require nodeId');
  }
  if (
    target.insertionPoint &&
    (!Number.isFinite(target.insertionPoint.x) || !Number.isFinite(target.insertionPoint.y))
  ) {
    throw new Error('Canvas insertionPoint must contain finite coordinates');
  }
  if (target.mode === 'replace' && !target.nodeId && !target.slotId && !target.fieldPath) {
    throw new Error('replace mode requires an explicit target');
  }
  return {
    ...target,
    ...(target.fieldPath ? { fieldPath: target.fieldPath } : {}),
  };
}

function resolveMutationMode(target: CanvasAgentTargetRef | undefined): CanvasAgentMutationMode {
  if (target?.mode) return target.mode;
  return target?.nodeId ? 'apply' : 'insert';
}

function defaultFieldPathForPayload(
  node: CanvasNode,
  payload: CanvasAgentContentPayload,
): JsonPointerPath | undefined {
  if (payload.kind === 'prompt' && node.type === 'shot') {
    return '/generationPrompt';
  }
  if (payload.kind === 'text' || payload.kind === 'structured') {
    if (node.type === 'text' || node.type === 'annotation') {
      return '/content';
    }
    if (node.type === 'shot') {
      return '/visualDescription';
    }
  }
  return getTargetableFields(node)[0]?.path;
}

function assertTargetableField(node: CanvasNode, fieldPath: JsonPointerPath): void {
  const paths = new Set(getTargetableFields(node).map((field) => field.path));
  if (!paths.has(fieldPath)) {
    throw new Error(`Field "${fieldPath}" is not targetable on ${node.type} node "${node.id}"`);
  }
}

function appendCanvasAgentContentValue(
  node: CanvasNode,
  fieldPath: JsonPointerPath,
  payload: CanvasAgentContentPayload,
): unknown {
  const current = readJsonPointer(node.data, fieldPath);
  const next = coerceCanvasAgentContentValue(payload, fieldPath);
  if (typeof current.value === 'string') {
    const currentText = current.value.trimEnd();
    const nextText = String(next).trimStart();
    return currentText ? `${currentText}\n${nextText}` : nextText;
  }
  if (Array.isArray(current.value)) {
    return [...current.value, next];
  }
  return next;
}

function coerceCanvasAgentContentValue(
  payload: CanvasAgentContentPayload,
  fieldPath: JsonPointerPath,
): unknown {
  if (payload.kind === 'text') {
    return payload.text ?? '';
  }
  if (payload.kind === 'prompt') {
    return payload.prompt ?? '';
  }
  if (payload.format === 'json' && !expectsStringField(fieldPath)) {
    return payload.content;
  }
  return renderCanvasAgentContent(payload);
}

function renderCanvasAgentContent(payload: CanvasAgentContentPayload): string {
  if (payload.kind === 'text') return payload.text ?? '';
  if (payload.kind === 'prompt') return payload.prompt ?? '';
  if (typeof payload.content === 'string') return payload.content;
  return JSON.stringify(payload.content ?? null, null, 2);
}

function expectsStringField(fieldPath: JsonPointerPath): boolean {
  return !fieldPath.endsWith('/characters') && !fieldPath.endsWith('/emotion');
}

function findFocusedContainer(
  nodes: readonly CanvasNode[],
  selectedNodeIds: readonly string[],
): CanvasNode | undefined {
  for (const nodeId of selectedNodeIds) {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (!node) continue;
    if (node.container) return node;
    const parentId = getNodeParentId(node);
    if (!parentId) continue;
    const parent = nodes.find((candidate) => candidate.id === parentId);
    if (parent?.container) return parent;
  }
  return nodes.find((node) => node.container);
}

function getTargetableFields(
  node: CanvasNode,
): NonNullable<CanvasAgentNodeSummary['targetableFields']> {
  const fields = new Map<
    JsonPointerPath,
    { path: JsonPointerPath; label?: string; valueType?: string }
  >();
  for (const path of TARGETABLE_FIELD_PATHS_BY_TYPE[node.type] ?? []) {
    fields.set(path, { path, label: labelFromFieldPath(path), valueType: 'string' });
  }
  for (const binding of collectBindings(node) ?? []) {
    if (!fields.has(binding.path)) {
      fields.set(binding.path, {
        path: binding.path,
        ...(binding.label ? { label: binding.label } : {}),
        valueType: inferValueType(binding.value),
      });
    }
  }
  return Array.from(fields.values());
}

function labelFromFieldPath(path: JsonPointerPath): string {
  const leaf = path.split('/').filter(Boolean).pop();
  return leaf ?? 'root';
}

function inferValueType(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'unknown';
  return typeof value;
}

function renderNodeDataSummary(node: CanvasNode): string | undefined {
  const data = sanitizeData(node.data as Record<string, unknown>);
  const serialized = JSON.stringify(data);
  return serialized.length > 500 ? `${serialized.slice(0, 500)}...` : serialized;
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

  const layoutMode =
    containerPreset.containerPolicy === 'scene'
      ? 'sequence'
      : containerPreset.containerPolicy === 'table'
        ? 'table'
        : containerPreset.containerPolicy === 'gallery'
          ? 'gallery'
          : 'grid';
  const nextNodes =
    request.autoLayout === false
      ? composite.nodes
      : autoArrangeContainer(composite.nodes, {
          containerId,
          mode: layoutMode,
          resizeChildren: layoutMode === 'gallery',
        });

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
