import type { CompositeBlockData, ContentBlock, ToolCall } from './message';
import type { AgentWorkItem, TaskWorkItem } from './work-item';

export const AGENT_TURN_TIMELINE_SCHEMA_VERSION = 2 as const;

export const AGENT_TURN_TIMELINE_ITEM_KINDS = [
  'assistant_text',
  'thinking',
  'tool_call',
  'task',
  'media',
  'composite',
  'error',
] as const;

export type AgentTurnTimelineItemKind = (typeof AGENT_TURN_TIMELINE_ITEM_KINDS)[number];

export const AGENT_TURN_TIMELINE_ITEM_STATUSES = [
  'streaming',
  'pending',
  'succeeded',
  'failed',
  'complete',
] as const;

export type AgentTurnTimelineItemStatus = (typeof AGENT_TURN_TIMELINE_ITEM_STATUSES)[number];

export const AGENT_TURN_TIMELINE_PARENT_ANCHORS = ['none', 'item', 'tool_call', 'turn'] as const;

export type AgentTurnTimelineParentAnchorKind = (typeof AGENT_TURN_TIMELINE_PARENT_ANCHORS)[number];

export type AgentTurnTimelineParentAnchor =
  | {
      readonly parentAnchor?: 'none';
      readonly parentItemId?: undefined;
      readonly parentToolCallId?: undefined;
    }
  | {
      readonly parentAnchor: 'item';
      readonly parentItemId: string;
      readonly parentToolCallId?: string;
    }
  | {
      readonly parentAnchor: 'tool_call';
      readonly parentToolCallId: string;
      readonly parentItemId?: string;
    }
  | {
      readonly parentAnchor: 'turn';
      readonly parentItemId?: undefined;
      readonly parentToolCallId?: undefined;
    };

export interface AgentTurnTimelineConnectionIdentity {
  readonly connectionEpoch: string;
  readonly conversationId: string;
  readonly turnId: string;
  readonly messageId: string;
}

export interface AgentTurnTimelineItemCore {
  readonly conversationId: string;
  readonly turnId: string;
  readonly messageId: string;
  readonly itemId: string;
  readonly sequence: number;
  readonly itemRevision: number;
  readonly status: AgentTurnTimelineItemStatus;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface AgentTurnTimelineAssistantTextPayload {
  readonly content: string;
  readonly format?: 'markdown' | 'plain';
  readonly sourceBlockId?: string;
  readonly sourceGeneration: number;
}

export interface AgentTurnTimelineThinkingPayload {
  readonly content: string;
  readonly sourceBlockId?: string;
  readonly sourceGeneration: number;
}

export interface AgentTurnTimelineToolCallPayload {
  readonly toolCall: ToolCall;
  readonly displayName?: string;
}

export interface AgentTurnTimelineTaskPayload {
  readonly workItem: AgentWorkItem;
}

export interface AgentTurnTimelineMediaPayload {
  readonly workItem: TaskWorkItem;
}

export interface AgentTurnTimelineCompositePayload {
  readonly composite: CompositeBlockData;
  readonly sourceBlockId?: string;
  readonly rawText?: string;
}

export interface AgentTurnTimelineErrorPayload {
  readonly message: string;
  readonly code?: string;
  readonly details?: Record<string, unknown>;
}

export type AgentTurnTimelineItemBase<
  Kind extends AgentTurnTimelineItemKind,
  Payload,
> = AgentTurnTimelineItemCore &
  AgentTurnTimelineParentAnchor & {
    readonly kind: Kind;
    readonly payload: Payload;
  };

export type AgentTurnTimelineAssistantTextItem = AgentTurnTimelineItemBase<
  'assistant_text',
  AgentTurnTimelineAssistantTextPayload
>;
export type AgentTurnTimelineThinkingItem = AgentTurnTimelineItemBase<
  'thinking',
  AgentTurnTimelineThinkingPayload
>;
export type AgentTurnTimelineToolCallItem = AgentTurnTimelineItemBase<
  'tool_call',
  AgentTurnTimelineToolCallPayload
>;
export type AgentTurnTimelineTaskItem = AgentTurnTimelineItemBase<
  'task',
  AgentTurnTimelineTaskPayload
>;
export type AgentTurnTimelineMediaItem = AgentTurnTimelineItemBase<
  'media',
  AgentTurnTimelineMediaPayload
>;
export type AgentTurnTimelineCompositeItem = AgentTurnTimelineItemBase<
  'composite',
  AgentTurnTimelineCompositePayload
>;
export type AgentTurnTimelineErrorItem = AgentTurnTimelineItemBase<
  'error',
  AgentTurnTimelineErrorPayload
>;

export type AgentTurnTimelineTextItem =
  AgentTurnTimelineAssistantTextItem | AgentTurnTimelineThinkingItem;
export type AgentTurnTimelineStructuralItem = Exclude<
  AgentTurnTimelineItem,
  AgentTurnTimelineTextItem
>;
export type AgentTurnTimelineItem =
  | AgentTurnTimelineAssistantTextItem
  | AgentTurnTimelineThinkingItem
  | AgentTurnTimelineToolCallItem
  | AgentTurnTimelineTaskItem
  | AgentTurnTimelineMediaItem
  | AgentTurnTimelineCompositeItem
  | AgentTurnTimelineErrorItem;

export interface AgentTurnTimelineAppendOperation {
  readonly operation: 'append';
  /** Text payload content is the delta only, never accumulated source. */
  readonly item: AgentTurnTimelineTextItem;
}

export interface AgentTurnTimelineReplaceOperation {
  readonly operation: 'replace';
  /** Text payload content is the complete replacement source. */
  readonly item: AgentTurnTimelineTextItem;
}

export interface AgentTurnTimelineSnapshotOperation {
  readonly operation: 'snapshot';
  /** Item payload is the authoritative current value. */
  readonly item: AgentTurnTimelineItem;
}

export interface AgentTurnTimelineUpsertOperation {
  readonly operation: 'upsert';
  readonly item: AgentTurnTimelineStructuralItem;
}

export interface AgentTurnTimelineCompleteOperation {
  readonly operation: 'complete';
  readonly itemId: string;
  readonly itemRevision: number;
  readonly kind: AgentTurnTimelineTextItem['kind'];
  readonly sourceGeneration: number;
  readonly status: 'complete' | 'failed';
  readonly updatedAt: number;
}

export type AgentTurnTimelineOperation =
  | AgentTurnTimelineAppendOperation
  | AgentTurnTimelineReplaceOperation
  | AgentTurnTimelineSnapshotOperation
  | AgentTurnTimelineUpsertOperation
  | AgentTurnTimelineCompleteOperation;

export type AgentTurnTimelineCompletionStatus = 'completed' | 'cancelled' | 'failed';

export interface AgentTurnTimelineCompletion {
  readonly status: AgentTurnTimelineCompletionStatus;
  readonly completedAt: number;
  readonly finalContentBlocks?: readonly ContentBlock[];
}

export interface AgentTurnTimelineBatch extends AgentTurnTimelineConnectionIdentity {
  readonly type: 'agentTurnTimeline';
  readonly schemaVersion: typeof AGENT_TURN_TIMELINE_SCHEMA_VERSION;
  readonly batchKind: 'delta' | 'snapshot';
  readonly deliveryRevision: number;
  readonly operations: readonly AgentTurnTimelineOperation[];
  readonly completion?: AgentTurnTimelineCompletion;
}

export type AgentTurnTimelineMessage = AgentTurnTimelineBatch;

export interface AgentTurnTimelineSnapshotRequest extends AgentTurnTimelineConnectionIdentity {
  readonly type: 'requestAgentTurnTimelineSnapshot';
  readonly schemaVersion: typeof AGENT_TURN_TIMELINE_SCHEMA_VERSION;
  readonly reason: 'webview-initialization' | 'revision-gap';
  readonly lastAppliedDeliveryRevision?: number;
}

export type AgentTurnTimelineDiagnosticCode =
  | 'invalid-message'
  | 'unsupported-schema-version'
  | 'missing-identity'
  | 'identity-mismatch'
  | 'invalid-delivery-revision'
  | 'duplicate-delivery-revision'
  | 'stale-delivery-revision'
  | 'delivery-revision-gap'
  | 'invalid-item-revision'
  | 'duplicate-item-revision'
  | 'stale-item-revision'
  | 'item-revision-gap'
  | 'invalid-operation'
  | 'invalid-operation-kind'
  | 'invalid-source-generation'
  | 'invalid-item'
  | 'invalid-parent-anchor'
  | 'duplicate-item-id'
  | 'completed-item-mutation'
  | 'completed-turn-mutation'
  | 'invalid-completion'
  | 'turn-snapshot-unavailable';

export interface AgentTurnTimelineDiagnostic extends Partial<AgentTurnTimelineConnectionIdentity> {
  readonly type: 'agentTurnTimelineDiagnostic';
  readonly schemaVersion: typeof AGENT_TURN_TIMELINE_SCHEMA_VERSION;
  readonly code: AgentTurnTimelineDiagnosticCode;
  readonly message: string;
  readonly deliveryRevision?: number;
  readonly itemId?: string;
  readonly itemRevision?: number;
  readonly expectedRevision?: number;
}

export type AgentTurnTimelineValidationDiagnosticCode = AgentTurnTimelineDiagnosticCode;
export type AgentTurnTimelineValidationDiagnostic = Omit<
  AgentTurnTimelineDiagnostic,
  'type' | 'schemaVersion'
>;

export interface AgentTurnTimelineItemValidationState {
  readonly kind: AgentTurnTimelineItemKind;
  readonly itemRevision: number;
  readonly sourceGeneration?: number;
  readonly completed: boolean;
}

export interface AgentTurnTimelineValidationState extends AgentTurnTimelineConnectionIdentity {
  readonly deliveryRevision: number;
  readonly completed: boolean;
  readonly items: ReadonlyMap<string, AgentTurnTimelineItemValidationState>;
}

export interface AgentTurnTimelineValidationResult {
  readonly ok: boolean;
  readonly diagnostics: readonly AgentTurnTimelineValidationDiagnostic[];
  readonly nextState?: AgentTurnTimelineValidationState;
}

export function validateAgentTurnTimelineMessage(
  raw: unknown,
  previousState?: AgentTurnTimelineValidationState,
): AgentTurnTimelineValidationResult {
  const diagnostics: AgentTurnTimelineValidationDiagnostic[] = [];
  if (!isRecord(raw) || raw.type !== 'agentTurnTimeline') {
    return failure('invalid-message', 'Timeline batch must use type agentTurnTimeline.');
  }
  if (raw.schemaVersion !== AGENT_TURN_TIMELINE_SCHEMA_VERSION) {
    return failure('unsupported-schema-version', 'Timeline batch must use schemaVersion 2.');
  }

  const identity = readConnectionIdentity(raw, diagnostics);
  const deliveryRevision = readPositiveInteger(raw.deliveryRevision);
  if (deliveryRevision === null) {
    diagnostics.push({
      code: 'invalid-delivery-revision',
      message: 'deliveryRevision must be a positive integer.',
    });
  }
  if (raw.batchKind !== 'delta' && raw.batchKind !== 'snapshot') {
    diagnostics.push({ code: 'invalid-message', message: 'batchKind must be delta or snapshot.' });
  }
  if (!Array.isArray(raw.operations)) {
    diagnostics.push({ code: 'invalid-message', message: 'operations must be an array.' });
  }
  if (diagnostics.length > 0 || !identity || deliveryRevision === null) {
    return { ok: false, diagnostics };
  }

  if (previousState && !sameIdentity(identity, previousState)) {
    diagnostics.push({
      code: 'identity-mismatch',
      message: 'Timeline batch identity does not match the active validation state.',
      deliveryRevision,
    });
  }

  const isSnapshot = raw.batchKind === 'snapshot';
  if (previousState && !isSnapshot) {
    const expectedRevision = previousState.deliveryRevision + 1;
    if (deliveryRevision === previousState.deliveryRevision) {
      diagnostics.push({
        code: 'duplicate-delivery-revision',
        message: 'Timeline delivery revision was already applied.',
        deliveryRevision,
        expectedRevision,
      });
    } else if (deliveryRevision < previousState.deliveryRevision) {
      diagnostics.push({
        code: 'stale-delivery-revision',
        message: 'Timeline delivery revision is stale.',
        deliveryRevision,
        expectedRevision,
      });
    } else if (deliveryRevision > expectedRevision) {
      diagnostics.push({
        code: 'delivery-revision-gap',
        message: 'Timeline delivery revision has a gap and requires a snapshot.',
        deliveryRevision,
        expectedRevision,
      });
    }
  }
  if (previousState?.completed && !isSnapshot) {
    diagnostics.push({
      code: 'completed-turn-mutation',
      message: 'Completed turns reject later delta batches.',
      deliveryRevision,
    });
  }

  const items = new Map<string, AgentTurnTimelineItemValidationState>(
    isSnapshot ? [] : previousState?.items,
  );
  const touchedInSnapshot = new Set<string>();
  for (const operation of raw.operations as unknown[]) {
    validateOperation(operation, {
      identity,
      batchKind: raw.batchKind,
      deliveryRevision,
      items,
      touchedInSnapshot,
      diagnostics,
      enforceLifecycle: previousState !== undefined,
    });
  }

  const completion = validateCompletion(raw.completion, diagnostics, deliveryRevision);
  if (previousState?.completed && completion) {
    diagnostics.push({
      code: 'invalid-completion',
      message: 'Turn completion cannot be applied more than once.',
      deliveryRevision,
    });
  }

  if (diagnostics.length > 0) return { ok: false, diagnostics };
  return {
    ok: true,
    diagnostics: [],
    nextState: {
      ...identity,
      deliveryRevision,
      completed: completion !== null || (isSnapshot && previousState?.completed === true),
      items,
    },
  };
}

export function assertValidAgentTurnTimelineMessage(
  message: AgentTurnTimelineMessage,
  previousState?: AgentTurnTimelineValidationState,
): asserts message is AgentTurnTimelineMessage {
  const result = validateAgentTurnTimelineMessage(message, previousState);
  if (!result.ok) {
    throw new Error(
      `Invalid Agent turn timeline message: ${result.diagnostics
        .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
        .join('; ')}`,
    );
  }
}

export function validateAgentTurnTimelineSnapshotRequest(
  raw: unknown,
): AgentTurnTimelineValidationResult {
  if (!isRecord(raw) || raw.type !== 'requestAgentTurnTimelineSnapshot') {
    return failure('invalid-message', 'Timeline snapshot request has an invalid type.');
  }
  if (raw.schemaVersion !== AGENT_TURN_TIMELINE_SCHEMA_VERSION) {
    return failure(
      'unsupported-schema-version',
      'Timeline snapshot request must use schemaVersion 2.',
    );
  }
  const diagnostics: AgentTurnTimelineValidationDiagnostic[] = [];
  readConnectionIdentity(raw, diagnostics);
  if (raw.reason !== 'webview-initialization' && raw.reason !== 'revision-gap') {
    diagnostics.push({ code: 'invalid-message', message: 'Snapshot request reason is invalid.' });
  }
  if (
    raw.lastAppliedDeliveryRevision !== undefined &&
    readNonNegativeInteger(raw.lastAppliedDeliveryRevision) === null
  ) {
    diagnostics.push({
      code: 'invalid-delivery-revision',
      message: 'lastAppliedDeliveryRevision must be a non-negative integer.',
    });
  }
  return { ok: diagnostics.length === 0, diagnostics };
}

interface ValidateOperationContext {
  readonly identity: AgentTurnTimelineConnectionIdentity;
  readonly batchKind: unknown;
  readonly deliveryRevision: number;
  readonly items: Map<string, AgentTurnTimelineItemValidationState>;
  readonly touchedInSnapshot: Set<string>;
  readonly diagnostics: AgentTurnTimelineValidationDiagnostic[];
  readonly enforceLifecycle: boolean;
}

function validateOperation(raw: unknown, context: ValidateOperationContext): void {
  if (!isRecord(raw) || typeof raw.operation !== 'string') {
    context.diagnostics.push({
      code: 'invalid-operation',
      message: 'Timeline operation must be an object with an operation discriminator.',
      deliveryRevision: context.deliveryRevision,
    });
    return;
  }

  if (context.batchKind === 'snapshot' && raw.operation !== 'snapshot') {
    context.diagnostics.push({
      code: 'invalid-operation',
      message: 'Snapshot batches may contain only snapshot operations.',
      deliveryRevision: context.deliveryRevision,
    });
  }
  if (context.batchKind === 'delta' && raw.operation === 'snapshot') {
    context.diagnostics.push({
      code: 'invalid-operation',
      message: 'Delta batches must not contain snapshot operations.',
      deliveryRevision: context.deliveryRevision,
    });
  }

  switch (raw.operation) {
    case 'append':
    case 'replace':
    case 'snapshot':
    case 'upsert':
      validateItemOperation(raw.operation, raw.item, context);
      return;
    case 'complete':
      validateCompleteOperation(raw, context);
      return;
    default:
      context.diagnostics.push({
        code: 'invalid-operation',
        message: `Unknown Timeline operation: ${raw.operation}.`,
        deliveryRevision: context.deliveryRevision,
      });
  }
}

function validateItemOperation(
  operation: 'append' | 'replace' | 'snapshot' | 'upsert',
  rawItem: unknown,
  context: ValidateOperationContext,
): void {
  const item = validateTimelineItem(rawItem, context.identity, context.diagnostics);
  if (!item) return;
  const textItem = item.kind === 'assistant_text' || item.kind === 'thinking';
  if ((operation === 'append' || operation === 'replace') && !textItem) {
    context.diagnostics.push({
      code: 'invalid-operation-kind',
      message: `${operation} is valid only for assistant_text or thinking items.`,
      itemId: item.itemId,
      itemRevision: item.itemRevision,
    });
  }
  if (operation === 'upsert' && textItem) {
    context.diagnostics.push({
      code: 'invalid-operation-kind',
      message: 'Text items require append, replace, snapshot, or complete operations.',
      itemId: item.itemId,
      itemRevision: item.itemRevision,
    });
  }

  const previous = context.items.get(item.itemId);
  if (operation === 'snapshot') {
    if (context.touchedInSnapshot.has(item.itemId)) {
      context.diagnostics.push({
        code: 'duplicate-item-id',
        message: 'Snapshot batches may contain each item exactly once.',
        itemId: item.itemId,
        itemRevision: item.itemRevision,
      });
    }
    context.touchedInSnapshot.add(item.itemId);
  } else if (context.enforceLifecycle || previous) {
    validateItemRevision(previous, item, context.diagnostics);
  }
  if (context.enforceLifecycle && previous?.completed && operation !== 'snapshot') {
    context.diagnostics.push({
      code: 'completed-item-mutation',
      message: 'Completed Timeline items reject later mutations.',
      itemId: item.itemId,
      itemRevision: item.itemRevision,
    });
  }
  if (previous && previous.kind !== item.kind) {
    context.diagnostics.push({
      code: 'duplicate-item-id',
      message: 'Timeline item id cannot change kind across revisions.',
      itemId: item.itemId,
      itemRevision: item.itemRevision,
    });
  }

  if (textItem) {
    const sourceGeneration = item.sourceGeneration ?? 0;
    const previousGeneration = previous?.sourceGeneration;
    if (
      (context.enforceLifecycle || previousGeneration !== undefined) &&
      operation === 'append' &&
      sourceGeneration !== (previousGeneration ?? 1)
    ) {
      context.diagnostics.push({
        code: 'invalid-source-generation',
        message: 'Append must stay in the current source generation.',
        itemId: item.itemId,
        itemRevision: item.itemRevision,
      });
    }
    if (
      (context.enforceLifecycle || previousGeneration !== undefined) &&
      operation === 'replace' &&
      sourceGeneration !== (previousGeneration === undefined ? 1 : previousGeneration + 1)
    ) {
      context.diagnostics.push({
        code: 'invalid-source-generation',
        message: 'Replace must advance sourceGeneration exactly once.',
        itemId: item.itemId,
        itemRevision: item.itemRevision,
      });
    }
  }

  context.items.set(item.itemId, {
    kind: item.kind,
    itemRevision: item.itemRevision,
    ...(textItem && item.sourceGeneration !== undefined
      ? { sourceGeneration: item.sourceGeneration }
      : {}),
    completed: textItem && (item.status === 'complete' || item.status === 'failed'),
  });
}

function validateCompleteOperation(
  raw: Record<string, unknown>,
  context: ValidateOperationContext,
): void {
  const itemId = readNonEmptyString(raw.itemId);
  const itemRevision = readPositiveInteger(raw.itemRevision);
  const sourceGeneration = readPositiveInteger(raw.sourceGeneration);
  const kind = raw.kind;
  if (
    !itemId ||
    itemRevision === null ||
    sourceGeneration === null ||
    (kind !== 'assistant_text' && kind !== 'thinking') ||
    (raw.status !== 'complete' && raw.status !== 'failed') ||
    !isNonNegativeFiniteNumber(raw.updatedAt)
  ) {
    context.diagnostics.push({
      code: 'invalid-operation',
      message: 'Complete operation fields are invalid.',
      ...(itemId ? { itemId } : {}),
      ...(itemRevision !== null ? { itemRevision } : {}),
    });
    return;
  }
  const previous = context.items.get(itemId);
  if (!previous) {
    if (context.enforceLifecycle) {
      context.diagnostics.push({
        code: 'invalid-operation',
        message: 'Complete requires an existing text item.',
        itemId,
        itemRevision,
      });
    }
    return;
  }
  validateItemRevision(previous, { itemId, itemRevision }, context.diagnostics);
  if (previous.completed) {
    context.diagnostics.push({
      code: 'completed-item-mutation',
      message: 'Timeline item is already complete.',
      itemId,
      itemRevision,
    });
  }
  if (previous.kind !== kind || previous.sourceGeneration !== sourceGeneration) {
    context.diagnostics.push({
      code: 'identity-mismatch',
      message: 'Complete operation does not match item kind/source generation.',
      itemId,
      itemRevision,
    });
  }
  context.items.set(itemId, {
    ...previous,
    itemRevision,
    completed: true,
  });
}

function validateItemRevision(
  previous: AgentTurnTimelineItemValidationState | undefined,
  item: { readonly itemId: string; readonly itemRevision: number },
  diagnostics: AgentTurnTimelineValidationDiagnostic[],
): void {
  const expectedRevision = (previous?.itemRevision ?? 0) + 1;
  if (item.itemRevision === previous?.itemRevision) {
    diagnostics.push({
      code: 'duplicate-item-revision',
      message: 'Timeline item revision was already applied.',
      itemId: item.itemId,
      itemRevision: item.itemRevision,
      expectedRevision,
    });
  } else if (previous && item.itemRevision < previous.itemRevision) {
    diagnostics.push({
      code: 'stale-item-revision',
      message: 'Timeline item revision is stale.',
      itemId: item.itemId,
      itemRevision: item.itemRevision,
      expectedRevision,
    });
  } else if (item.itemRevision !== expectedRevision) {
    diagnostics.push({
      code: 'item-revision-gap',
      message: 'Timeline item revision has a gap.',
      itemId: item.itemId,
      itemRevision: item.itemRevision,
      expectedRevision,
    });
  }
}

interface ValidatedTimelineItem {
  readonly itemId: string;
  readonly itemRevision: number;
  readonly kind: AgentTurnTimelineItemKind;
  readonly status: AgentTurnTimelineItemStatus;
  readonly sourceGeneration?: number;
}

function validateTimelineItem(
  raw: unknown,
  identity: AgentTurnTimelineConnectionIdentity,
  diagnostics: AgentTurnTimelineValidationDiagnostic[],
): ValidatedTimelineItem | null {
  if (!isRecord(raw)) {
    diagnostics.push({ code: 'invalid-item', message: 'Timeline item must be an object.' });
    return null;
  }
  const itemId = readNonEmptyString(raw.itemId);
  const kind = isTimelineItemKind(raw.kind) ? raw.kind : null;
  const sequence = readNonNegativeInteger(raw.sequence);
  const itemRevision = readPositiveInteger(raw.itemRevision);
  const status = isTimelineItemStatus(raw.status) ? raw.status : null;
  if (
    !itemId ||
    !kind ||
    sequence === null ||
    itemRevision === null ||
    !status ||
    !isNonNegativeFiniteNumber(raw.createdAt) ||
    !isNonNegativeFiniteNumber(raw.updatedAt) ||
    !isRecord(raw.payload)
  ) {
    diagnostics.push({
      code: 'invalid-item',
      message: 'Timeline item core or payload is invalid.',
      ...(itemId ? { itemId } : {}),
      ...(itemRevision !== null ? { itemRevision } : {}),
    });
    return null;
  }
  if (
    raw.conversationId !== identity.conversationId ||
    raw.turnId !== identity.turnId ||
    raw.messageId !== identity.messageId
  ) {
    diagnostics.push({
      code: 'identity-mismatch',
      message: 'Timeline item identity must match its batch.',
      itemId,
      itemRevision,
    });
  }
  validateParentAnchor(raw, kind, diagnostics, itemId, itemRevision);
  validatePayload(raw.payload, kind, diagnostics, itemId, itemRevision);
  const sourceGeneration =
    kind === 'assistant_text' || kind === 'thinking'
      ? (readPositiveInteger(raw.payload.sourceGeneration) ?? undefined)
      : undefined;
  return {
    itemId,
    itemRevision,
    kind,
    status,
    ...(sourceGeneration !== undefined ? { sourceGeneration } : {}),
  };
}

function validateParentAnchor(
  raw: Record<string, unknown>,
  kind: AgentTurnTimelineItemKind,
  diagnostics: AgentTurnTimelineValidationDiagnostic[],
  itemId: string,
  itemRevision: number,
): void {
  const parentAnchor = raw.parentAnchor ?? 'none';
  const parentItemId = readNonEmptyString(raw.parentItemId);
  const parentToolCallId = readNonEmptyString(raw.parentToolCallId);
  const invalid =
    !AGENT_TURN_TIMELINE_PARENT_ANCHORS.includes(
      parentAnchor as AgentTurnTimelineParentAnchorKind,
    ) ||
    (parentAnchor === 'none' && (parentItemId || parentToolCallId)) ||
    (parentAnchor === 'item' && !parentItemId) ||
    (parentAnchor === 'tool_call' && !parentToolCallId) ||
    (parentAnchor === 'turn' && (parentItemId || parentToolCallId)) ||
    ((kind === 'task' || kind === 'media') &&
      parentAnchor !== 'item' &&
      parentAnchor !== 'tool_call' &&
      parentAnchor !== 'turn');
  if (invalid) {
    diagnostics.push({
      code: 'invalid-parent-anchor',
      message: 'Timeline item parent anchor is invalid for this item.',
      itemId,
      itemRevision,
    });
  }
}

function validatePayload(
  payload: Record<string, unknown>,
  kind: AgentTurnTimelineItemKind,
  diagnostics: AgentTurnTimelineValidationDiagnostic[],
  itemId: string,
  itemRevision: number,
): void {
  let valid = true;
  switch (kind) {
    case 'assistant_text':
    case 'thinking':
      valid =
        typeof payload.content === 'string' &&
        readPositiveInteger(payload.sourceGeneration) !== null &&
        (kind !== 'assistant_text' ||
          payload.format === undefined ||
          payload.format === 'markdown' ||
          payload.format === 'plain');
      break;
    case 'tool_call':
      valid =
        isRecord(payload.toolCall) &&
        Boolean(readNonEmptyString(payload.toolCall.id)) &&
        Boolean(readNonEmptyString(payload.toolCall.name)) &&
        isRecord(payload.toolCall.arguments);
      break;
    case 'task':
    case 'media':
      valid = isRecord(payload.workItem) && Boolean(readNonEmptyString(payload.workItem.id));
      break;
    case 'composite':
      valid = isRecord(payload.composite);
      break;
    case 'error':
      valid = Boolean(readNonEmptyString(payload.message));
      break;
  }
  if (!valid) {
    diagnostics.push({
      code: 'invalid-item',
      message: `Timeline ${kind} payload is invalid.`,
      itemId,
      itemRevision,
    });
  }
}

function validateCompletion(
  raw: unknown,
  diagnostics: AgentTurnTimelineValidationDiagnostic[],
  deliveryRevision: number,
): { readonly valid: true } | null {
  if (raw === undefined) return null;
  if (
    !isRecord(raw) ||
    (raw.status !== 'completed' && raw.status !== 'cancelled' && raw.status !== 'failed') ||
    !isNonNegativeFiniteNumber(raw.completedAt) ||
    (raw.finalContentBlocks !== undefined && !Array.isArray(raw.finalContentBlocks))
  ) {
    diagnostics.push({
      code: 'invalid-completion',
      message: 'Timeline turn completion is invalid.',
      deliveryRevision,
    });
    return null;
  }
  return { valid: true };
}

function readConnectionIdentity(
  raw: Record<string, unknown>,
  diagnostics: AgentTurnTimelineValidationDiagnostic[],
): AgentTurnTimelineConnectionIdentity | null {
  const connectionEpoch = readNonEmptyString(raw.connectionEpoch);
  const conversationId = readNonEmptyString(raw.conversationId);
  const turnId = readNonEmptyString(raw.turnId);
  const messageId = readNonEmptyString(raw.messageId);
  if (!connectionEpoch || !conversationId || !turnId || !messageId) {
    diagnostics.push({
      code: 'missing-identity',
      message: 'Timeline identity requires connectionEpoch, conversationId, turnId, and messageId.',
    });
    return null;
  }
  return { connectionEpoch, conversationId, turnId, messageId };
}

function sameIdentity(
  left: AgentTurnTimelineConnectionIdentity,
  right: AgentTurnTimelineConnectionIdentity,
): boolean {
  return (
    left.connectionEpoch === right.connectionEpoch &&
    left.conversationId === right.conversationId &&
    left.turnId === right.turnId &&
    left.messageId === right.messageId
  );
}

function failure(
  code: AgentTurnTimelineValidationDiagnosticCode,
  message: string,
): AgentTurnTimelineValidationResult {
  return { ok: false, diagnostics: [{ code, message }] };
}

function isTimelineItemKind(value: unknown): value is AgentTurnTimelineItemKind {
  return (
    typeof value === 'string' &&
    AGENT_TURN_TIMELINE_ITEM_KINDS.includes(value as AgentTurnTimelineItemKind)
  );
}

function isTimelineItemStatus(value: unknown): value is AgentTurnTimelineItemStatus {
  return (
    typeof value === 'string' &&
    AGENT_TURN_TIMELINE_ITEM_STATUSES.includes(value as AgentTurnTimelineItemStatus)
  );
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readPositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function readNonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
