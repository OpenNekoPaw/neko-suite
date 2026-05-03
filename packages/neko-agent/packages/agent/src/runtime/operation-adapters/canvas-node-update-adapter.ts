import type {
  CanvasData,
  CanvasNode,
  EditOperation,
  IOperationToolAdapter,
  OperationToolAdapterContext,
  OperationToolIntent,
  OperationToolPlan,
} from '@neko/shared';

export interface CanvasNodeUpdateAdapterOptions {
  readonly now?: () => number;
  readonly idPrefix?: string;
}

export function createCanvasNodeUpdateAdapter(
  options: CanvasNodeUpdateAdapterOptions = {},
): IOperationToolAdapter {
  const now = options.now ?? Date.now;
  const idPrefix = options.idPrefix ?? 'canvas-node-update';

  return {
    domain: 'canvas',
    canPlan: (intent, context) => createCanvasNodePlan(intent, context, now, idPrefix) !== null,
    plan: async (intent, context) => {
      const plan = createCanvasNodePlan(intent, context, now, idPrefix);
      if (!plan) {
        throw new Error('Cannot plan canvas node operation for the provided intent');
      }
      return plan;
    },
  };
}

function createCanvasNodePlan(
  intent: OperationToolIntent,
  context: OperationToolAdapterContext,
  now: () => number,
  idPrefix: string,
): OperationToolPlan | null {
  if (intent.domain !== 'canvas' || intent.targetIds.length === 0) {
    return null;
  }

  const canvas = readCanvasData(context.metadata);
  const nodeId = intent.targetIds[0];
  if (!canvas || !nodeId) {
    return null;
  }

  const node = canvas.nodes.find((item) => item.id === nodeId);
  if (!node) {
    return null;
  }

  const newZIndex = readNumber(intent.parameters, 'newZIndex');
  if (newZIndex !== undefined && newZIndex !== node.zIndex) {
    return createSingleOperationPlan(
      intent,
      createReorderOperation(intent, node, newZIndex, now(), idPrefix),
    );
  }

  const updates = readSupportedNodeUpdates(intent.parameters);
  if (Object.keys(updates).length === 0) {
    return null;
  }

  return createSingleOperationPlan(
    intent,
    createUpdateOperation(intent, node, updates, now(), idPrefix),
  );
}

function createUpdateOperation(
  intent: OperationToolIntent,
  node: CanvasNode,
  updates: Partial<Omit<CanvasNode, 'id' | 'type'>>,
  timestamp: number,
  idPrefix: string,
): EditOperation {
  return {
    type: 'canvas.node.update',
    meta: { id: `${idPrefix}:${intent.id}`, timestamp, source: 'ai', description: intent.summary },
    payload: { nodeId: node.id, updates },
    before: { updates: pickBeforeUpdates(node, Object.keys(updates)) },
  };
}

function createReorderOperation(
  intent: OperationToolIntent,
  node: CanvasNode,
  newZIndex: number,
  timestamp: number,
  idPrefix: string,
): EditOperation {
  return {
    type: 'canvas.node.reorder',
    meta: { id: `${idPrefix}:${intent.id}`, timestamp, source: 'ai', description: intent.summary },
    payload: { nodeId: node.id, newZIndex },
    before: { oldZIndex: node.zIndex },
  };
}

function createSingleOperationPlan(
  intent: OperationToolIntent,
  operation: EditOperation,
): OperationToolPlan {
  return {
    id: `plan:${intent.id}`,
    intentId: intent.id,
    rationaleId: intent.rationaleId,
    operations: [operation],
    requiresUserApproval: intent.requiresUserApproval ?? intent.risk === 'high',
    reversible: true,
    createdAt: operation.meta.timestamp,
  };
}

function readCanvasData(metadata: OperationToolAdapterContext['metadata']): CanvasData | null {
  const canvasData = metadata?.['canvasData'];
  if (typeof canvasData !== 'object' || canvasData === null || Array.isArray(canvasData)) {
    return null;
  }

  const candidate = canvasData as { readonly nodes?: unknown; readonly connections?: unknown };
  return Array.isArray(candidate.nodes) && Array.isArray(candidate.connections)
    ? (canvasData as CanvasData)
    : null;
}

function readSupportedNodeUpdates(
  parameters: OperationToolIntent['parameters'],
): Partial<Omit<CanvasNode, 'id' | 'type'>> {
  const updates = readRecord(parameters, 'updates');
  const next: Partial<Omit<CanvasNode, 'id' | 'type'>> = {};
  const position = updates
    ? readPosition(updates, 'position')
    : readPosition(parameters, 'position');
  const size = updates ? readSize(updates, 'size') : readSize(parameters, 'size');
  const zIndex = updates ? readNumber(updates, 'zIndex') : readNumber(parameters, 'zIndex');
  const rotation = updates ? readNumber(updates, 'rotation') : readNumber(parameters, 'rotation');
  const locked = updates ? readBoolean(updates, 'locked') : readBoolean(parameters, 'locked');
  const data = updates ? readRecord(updates, 'data') : readRecord(parameters, 'data');

  if (position) next.position = position;
  if (size) next.size = size;
  if (zIndex !== undefined) next.zIndex = zIndex;
  if (rotation !== undefined) next.rotation = rotation;
  if (locked !== undefined) next.locked = locked;
  if (data) next.data = data as CanvasNode['data'];
  return next;
}

function pickBeforeUpdates(
  node: CanvasNode,
  keys: readonly string[],
): Partial<Omit<CanvasNode, 'id' | 'type'>> {
  const before: Partial<Omit<CanvasNode, 'id' | 'type'>> = {};
  for (const key of keys) {
    if (key === 'position') before.position = node.position;
    if (key === 'size') before.size = node.size;
    if (key === 'zIndex') before.zIndex = node.zIndex;
    if (key === 'rotation') before.rotation = node.rotation;
    if (key === 'locked') before.locked = node.locked;
    if (key === 'data') before.data = node.data;
  }
  return before;
}

function readRecord(
  value: Readonly<Record<string, unknown>> | undefined,
  key: string,
): Readonly<Record<string, unknown>> | undefined {
  const nested = value?.[key];
  if (typeof nested !== 'object' || nested === null || Array.isArray(nested)) {
    return undefined;
  }
  return nested as Readonly<Record<string, unknown>>;
}

function readNumber(
  value: Readonly<Record<string, unknown>> | undefined,
  key: string,
): number | undefined {
  const candidate = value?.[key];
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : undefined;
}

function readBoolean(
  value: Readonly<Record<string, unknown>> | undefined,
  key: string,
): boolean | undefined {
  const candidate = value?.[key];
  return typeof candidate === 'boolean' ? candidate : undefined;
}

function readPosition(
  value: Readonly<Record<string, unknown>> | undefined,
  key: string,
): CanvasNode['position'] | undefined {
  const record = readRecord(value, key);
  const x = readNumber(record, 'x');
  const y = readNumber(record, 'y');
  return x !== undefined && y !== undefined ? { x, y } : undefined;
}

function readSize(
  value: Readonly<Record<string, unknown>> | undefined,
  key: string,
): CanvasNode['size'] | undefined {
  const record = readRecord(value, key);
  const width = readNumber(record, 'width');
  const height = readNumber(record, 'height');
  return width !== undefined && height !== undefined ? { width, height } : undefined;
}
