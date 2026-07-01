import type { CompositeBlockData, ContentBlock, ToolCall } from './message';
import type { AgentWorkItem, TaskWorkItem } from './work-item';

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

export interface AgentTurnTimelineItemCore {
  readonly conversationId: string;
  readonly turnId: string;
  readonly messageId: string;
  readonly itemId: string;
  readonly sequence: number;
  readonly status: AgentTurnTimelineItemStatus;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface AgentTurnTimelineAssistantTextPayload {
  readonly content: string;
  readonly format?: 'markdown' | 'plain';
  readonly sourceBlockId?: string;
  readonly replaceContent?: boolean;
}

export interface AgentTurnTimelineThinkingPayload {
  readonly content: string;
  readonly sourceBlockId?: string;
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

export type AgentTurnTimelineItem =
  | AgentTurnTimelineAssistantTextItem
  | AgentTurnTimelineThinkingItem
  | AgentTurnTimelineToolCallItem
  | AgentTurnTimelineTaskItem
  | AgentTurnTimelineMediaItem
  | AgentTurnTimelineCompositeItem
  | AgentTurnTimelineErrorItem;

export interface AgentTurnTimelineMessage {
  readonly type: 'agentTurnTimeline';
  readonly conversationId: string;
  readonly turnId: string;
  readonly messageId: string;
  readonly events: readonly AgentTurnTimelineItem[];
  readonly finalContentBlocks?: readonly ContentBlock[];
}

export type AgentTurnTimelineValidationDiagnosticCode =
  | 'invalid-message'
  | 'missing-conversation-id'
  | 'missing-turn-id'
  | 'missing-message-id'
  | 'missing-events'
  | 'missing-item-id'
  | 'missing-sequence'
  | 'invalid-sequence'
  | 'non-monotonic-sequence'
  | 'mismatched-envelope'
  | 'invalid-kind'
  | 'invalid-status'
  | 'invalid-timestamp'
  | 'invalid-payload'
  | 'duplicate-item-id'
  | 'missing-parent-anchor'
  | 'invalid-parent-anchor';

export interface AgentTurnTimelineValidationDiagnostic {
  readonly code: AgentTurnTimelineValidationDiagnosticCode;
  readonly message: string;
  readonly itemId?: string;
  readonly sequence?: number;
}

export interface AgentTurnTimelineValidationResult {
  readonly ok: boolean;
  readonly diagnostics: readonly AgentTurnTimelineValidationDiagnostic[];
}

interface TimelineItemIdentity {
  readonly conversationId: string;
  readonly turnId: string;
  readonly messageId: string;
  readonly kind: AgentTurnTimelineItemKind;
}

export function validateAgentTurnTimelineMessage(raw: unknown): AgentTurnTimelineValidationResult {
  const diagnostics: AgentTurnTimelineValidationDiagnostic[] = [];
  if (!isRecord(raw) || raw.type !== 'agentTurnTimeline') {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'invalid-message',
          message: 'Agent turn timeline message must use type agentTurnTimeline.',
        },
      ],
    };
  }

  const conversationId = readNonEmptyString(raw.conversationId);
  const turnId = readNonEmptyString(raw.turnId);
  const messageId = readNonEmptyString(raw.messageId);
  if (!conversationId) {
    diagnostics.push({
      code: 'missing-conversation-id',
      message: 'Timeline message is missing conversationId.',
    });
  }
  if (!turnId) {
    diagnostics.push({ code: 'missing-turn-id', message: 'Timeline message is missing turnId.' });
  }
  if (!messageId) {
    diagnostics.push({
      code: 'missing-message-id',
      message: 'Timeline message is missing messageId.',
    });
  }
  if (!Array.isArray(raw.events)) {
    diagnostics.push({
      code: 'missing-events',
      message: 'Timeline message must include an events array.',
    });
    return { ok: diagnostics.length === 0, diagnostics };
  }

  const seenItems = new Map<string, TimelineItemIdentity>();
  let lastSequence = -1;
  for (const event of raw.events) {
    const sequence = validateTimelineItem(
      event,
      { conversationId, turnId, messageId },
      seenItems,
      diagnostics,
    );
    if (sequence === null) continue;
    if (sequence <= lastSequence) {
      diagnostics.push({
        code: 'non-monotonic-sequence',
        message: 'Timeline event sequence must increase within a message batch.',
        sequence,
      });
    }
    lastSequence = sequence;
  }

  return { ok: diagnostics.length === 0, diagnostics };
}

export function assertValidAgentTurnTimelineMessage(
  message: AgentTurnTimelineMessage,
): asserts message is AgentTurnTimelineMessage {
  const result = validateAgentTurnTimelineMessage(message);
  if (!result.ok) {
    const summary = result.diagnostics
      .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
      .join('; ');
    throw new Error(`Invalid Agent turn timeline message: ${summary}`);
  }
}

function validateTimelineItem(
  raw: unknown,
  envelope: {
    readonly conversationId: string | null;
    readonly turnId: string | null;
    readonly messageId: string | null;
  },
  seenItems: Map<string, TimelineItemIdentity>,
  diagnostics: AgentTurnTimelineValidationDiagnostic[],
): number | null {
  if (!isRecord(raw)) {
    diagnostics.push({
      code: 'invalid-message',
      message: 'Timeline event must be an object.',
    });
    return null;
  }

  const conversationId = readNonEmptyString(raw.conversationId);
  const turnId = readNonEmptyString(raw.turnId);
  const messageId = readNonEmptyString(raw.messageId);
  const itemId = readNonEmptyString(raw.itemId);
  const kind = isTimelineItemKind(raw.kind) ? raw.kind : null;
  const status = isTimelineItemStatus(raw.status) ? raw.status : null;
  const sequence = readSequence(raw.sequence);

  if (!conversationId) {
    diagnostics.push({
      code: 'missing-conversation-id',
      message: 'Timeline event is missing conversationId.',
      itemId: itemId ?? undefined,
    });
  }
  if (!turnId) {
    diagnostics.push({
      code: 'missing-turn-id',
      message: 'Timeline event is missing turnId.',
      itemId: itemId ?? undefined,
    });
  }
  if (!messageId) {
    diagnostics.push({
      code: 'missing-message-id',
      message: 'Timeline event is missing messageId.',
      itemId: itemId ?? undefined,
    });
  }
  if (!itemId) {
    diagnostics.push({
      code: 'missing-item-id',
      message: 'Timeline event is missing itemId.',
      sequence: sequence ?? undefined,
    });
  }
  if (sequence === null) {
    diagnostics.push({
      code: raw.sequence === undefined ? 'missing-sequence' : 'invalid-sequence',
      message: 'Timeline event sequence must be a non-negative integer.',
      itemId: itemId ?? undefined,
    });
  }
  if (!kind) {
    diagnostics.push({
      code: 'invalid-kind',
      message: 'Timeline event kind is not supported.',
      itemId: itemId ?? undefined,
      sequence: sequence ?? undefined,
    });
  }
  if (!status) {
    diagnostics.push({
      code: 'invalid-status',
      message: 'Timeline event status is not supported.',
      itemId: itemId ?? undefined,
      sequence: sequence ?? undefined,
    });
  }
  validateEnvelopeMatch(raw, envelope, diagnostics, itemId ?? undefined, sequence ?? undefined);
  validateTimestamps(raw, diagnostics, itemId ?? undefined, sequence ?? undefined);

  if (itemId && kind) {
    const identity = { conversationId, turnId, messageId, kind };
    const existing = seenItems.get(itemId);
    if (existing && !isSameTimelineIdentity(existing, identity)) {
      diagnostics.push({
        code: 'duplicate-item-id',
        message: 'Timeline item id was reused for a different timeline item.',
        itemId,
        sequence: sequence ?? undefined,
      });
    } else if (!existing && conversationId && turnId && messageId) {
      seenItems.set(itemId, { conversationId, turnId, messageId, kind });
    }
  }

  if (kind) {
    validateParentAnchor(raw, kind, diagnostics, itemId ?? undefined, sequence ?? undefined);
    validatePayload(raw.payload, kind, diagnostics, itemId ?? undefined, sequence ?? undefined);
  }

  return sequence;
}

function validateEnvelopeMatch(
  raw: Record<string, unknown>,
  envelope: {
    readonly conversationId: string | null;
    readonly turnId: string | null;
    readonly messageId: string | null;
  },
  diagnostics: AgentTurnTimelineValidationDiagnostic[],
  itemId?: string,
  sequence?: number,
): void {
  if (
    envelope.conversationId &&
    readNonEmptyString(raw.conversationId) &&
    raw.conversationId !== envelope.conversationId
  ) {
    diagnostics.push({
      code: 'mismatched-envelope',
      message: 'Timeline event conversationId must match its message envelope.',
      itemId,
      sequence,
    });
  }
  if (envelope.turnId && readNonEmptyString(raw.turnId) && raw.turnId !== envelope.turnId) {
    diagnostics.push({
      code: 'mismatched-envelope',
      message: 'Timeline event turnId must match its message envelope.',
      itemId,
      sequence,
    });
  }
  if (
    envelope.messageId &&
    readNonEmptyString(raw.messageId) &&
    raw.messageId !== envelope.messageId
  ) {
    diagnostics.push({
      code: 'mismatched-envelope',
      message: 'Timeline event messageId must match its message envelope.',
      itemId,
      sequence,
    });
  }
}

function validateTimestamps(
  raw: Record<string, unknown>,
  diagnostics: AgentTurnTimelineValidationDiagnostic[],
  itemId?: string,
  sequence?: number,
): void {
  const createdAt = raw.createdAt;
  const updatedAt = raw.updatedAt;
  if (!isNonNegativeFiniteNumber(createdAt) || !isNonNegativeFiniteNumber(updatedAt)) {
    diagnostics.push({
      code: 'invalid-timestamp',
      message: 'Timeline event timestamps must be non-negative finite numbers.',
      itemId,
      sequence,
    });
    return;
  }
  if (updatedAt < createdAt) {
    diagnostics.push({
      code: 'invalid-timestamp',
      message: 'Timeline event updatedAt cannot be earlier than createdAt.',
      itemId,
      sequence,
    });
  }
}

function validateParentAnchor(
  raw: Record<string, unknown>,
  kind: AgentTurnTimelineItemKind,
  diagnostics: AgentTurnTimelineValidationDiagnostic[],
  itemId?: string,
  sequence?: number,
): void {
  const parentAnchor = raw.parentAnchor;
  const parentItemId = readNonEmptyString(raw.parentItemId);
  const parentToolCallId = readNonEmptyString(raw.parentToolCallId);

  if (
    parentAnchor !== undefined &&
    !AGENT_TURN_TIMELINE_PARENT_ANCHORS.includes(parentAnchor as AgentTurnTimelineParentAnchorKind)
  ) {
    diagnostics.push({
      code: 'invalid-parent-anchor',
      message: 'Timeline parent anchor kind is not supported.',
      itemId,
      sequence,
    });
    return;
  }

  if (parentAnchor === 'item' && !parentItemId) {
    diagnostics.push({
      code: 'missing-parent-anchor',
      message: 'Timeline item parent anchor requires parentItemId.',
      itemId,
      sequence,
    });
  }
  if (parentAnchor === 'tool_call' && !parentToolCallId) {
    diagnostics.push({
      code: 'missing-parent-anchor',
      message: 'Timeline tool parent anchor requires parentToolCallId.',
      itemId,
      sequence,
    });
  }
  if (parentAnchor === 'turn' && (parentItemId || parentToolCallId)) {
    diagnostics.push({
      code: 'invalid-parent-anchor',
      message: 'Turn-level parentless timeline items must not carry parent ids.',
      itemId,
      sequence,
    });
  }
  if ((kind === 'task' || kind === 'media') && !parentItemId && !parentToolCallId) {
    if (parentAnchor !== 'turn') {
      diagnostics.push({
        code: 'missing-parent-anchor',
        message: 'Task and media timeline items require a parent anchor or explicit turn scope.',
        itemId,
        sequence,
      });
    }
  }
}

function validatePayload(
  payload: unknown,
  kind: AgentTurnTimelineItemKind,
  diagnostics: AgentTurnTimelineValidationDiagnostic[],
  itemId?: string,
  sequence?: number,
): void {
  if (!isRecord(payload)) {
    diagnostics.push({
      code: 'invalid-payload',
      message: 'Timeline event payload must be an object.',
      itemId,
      sequence,
    });
    return;
  }

  switch (kind) {
    case 'assistant_text':
    case 'thinking':
      if (typeof payload.content !== 'string') {
        diagnostics.push({
          code: 'invalid-payload',
          message: 'Text timeline payload requires string content.',
          itemId,
          sequence,
        });
      }
      return;
    case 'tool_call':
      validateToolPayload(payload, diagnostics, itemId, sequence);
      return;
    case 'task':
    case 'media':
      if (!isRecord(payload.workItem) || !readNonEmptyString(payload.workItem.id)) {
        diagnostics.push({
          code: 'invalid-payload',
          message: 'Task and media timeline payloads require a workItem with id.',
          itemId,
          sequence,
        });
      }
      return;
    case 'composite':
      if (!isRecord(payload.composite)) {
        diagnostics.push({
          code: 'invalid-payload',
          message: 'Composite timeline payload requires composite data.',
          itemId,
          sequence,
        });
      }
      return;
    case 'error':
      if (!readNonEmptyString(payload.message)) {
        diagnostics.push({
          code: 'invalid-payload',
          message: 'Error timeline payload requires a message.',
          itemId,
          sequence,
        });
      }
      return;
  }
}

function validateToolPayload(
  payload: Record<string, unknown>,
  diagnostics: AgentTurnTimelineValidationDiagnostic[],
  itemId?: string,
  sequence?: number,
): void {
  const toolCall = payload.toolCall;
  if (!isRecord(toolCall)) {
    diagnostics.push({
      code: 'invalid-payload',
      message: 'Tool timeline payload requires toolCall.',
      itemId,
      sequence,
    });
    return;
  }
  if (!readNonEmptyString(toolCall.id) || !readNonEmptyString(toolCall.name)) {
    diagnostics.push({
      code: 'invalid-payload',
      message: 'Tool timeline payload requires toolCall id and name.',
      itemId,
      sequence,
    });
  }
  if (!isRecord(toolCall.arguments)) {
    diagnostics.push({
      code: 'invalid-payload',
      message: 'Tool timeline payload requires toolCall arguments.',
      itemId,
      sequence,
    });
  }
}

function isSameTimelineIdentity(
  a: TimelineItemIdentity,
  b: {
    readonly conversationId: string | null;
    readonly turnId: string | null;
    readonly messageId: string | null;
    readonly kind: AgentTurnTimelineItemKind;
  },
): boolean {
  return (
    a.conversationId === b.conversationId &&
    a.turnId === b.turnId &&
    a.messageId === b.messageId &&
    a.kind === b.kind
  );
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

function readSequence(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
