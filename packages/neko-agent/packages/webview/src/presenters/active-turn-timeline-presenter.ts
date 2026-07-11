import type {
  AgentTurnTimelineDiagnostic,
  AgentTurnTimelineItem,
  AgentTurnTimelineMessage,
  AgentTurnTimelineSnapshotRequest,
  AgentTurnTimelineValidationDiagnostic,
  AgentTurnTimelineValidationState,
  AgentWorkItem,
  ContentBlock,
  Message,
  ToolCall,
} from '@neko-agent/types';
import {
  buildAgentTurnTimelineSnapshotRequest,
  validateAgentTurnTimelineMessage,
} from '@neko-agent/types';

export type ActiveTurnTimelineSynchronization = 'synchronized' | 'suspended' | 'unavailable';

export interface ActiveTurnTimelineState {
  readonly connectionEpoch: string;
  readonly conversationId: string;
  readonly turnId: string;
  readonly messageId: string;
  readonly deliveryRevision: number;
  readonly validationState: AgentTurnTimelineValidationState;
  readonly items: readonly AgentTurnTimelineItem[];
  readonly completed: boolean;
  readonly finalContentBlocks?: readonly ContentBlock[];
  readonly synchronization: ActiveTurnTimelineSynchronization;
}

export interface ActiveTurnTimelineApplyInput {
  readonly state?: ActiveTurnTimelineState | null;
  readonly message: AgentTurnTimelineMessage;
}

export interface ActiveTurnTimelineApplyResult {
  readonly state: ActiveTurnTimelineState | null;
  readonly diagnostics: readonly AgentTurnTimelineValidationDiagnostic[];
  readonly snapshotRequest?: AgentTurnTimelineSnapshotRequest;
}

export interface ActiveTurnTimelineDiagnosticApplyResult {
  readonly state: ActiveTurnTimelineState | null;
  readonly diagnostic: AgentTurnTimelineDiagnostic;
}

export interface ActiveTurnTimelineProjection {
  readonly message: Message | null;
  readonly workItemIds: readonly string[];
}

export function applyAgentTurnTimelineMessage(
  input: ActiveTurnTimelineApplyInput,
): ActiveTurnTimelineApplyResult {
  const currentState = input.state ?? null;
  const identityMatches = isSameActiveTurnTimeline(currentState, input.message);
  if (currentState && !identityMatches) {
    return {
      state: currentState,
      diagnostics: [
        {
          code: 'identity-mismatch',
          message: 'Timeline batch identity does not match the active turn.',
          deliveryRevision: input.message.deliveryRevision,
        },
      ],
    };
  }

  if (currentState?.synchronization === 'unavailable' && input.message.batchKind !== 'snapshot') {
    return {
      state: currentState,
      diagnostics: [
        {
          code: 'turn-snapshot-unavailable',
          message:
            'Timeline deltas are suspended because authoritative resynchronization is unavailable.',
          deliveryRevision: input.message.deliveryRevision,
        },
      ],
    };
  }
  if (currentState?.synchronization === 'suspended' && input.message.batchKind !== 'snapshot') {
    return {
      state: currentState,
      diagnostics: [
        {
          code: 'delivery-revision-gap',
          message: 'Timeline deltas remain suspended until an authoritative snapshot is applied.',
          deliveryRevision: input.message.deliveryRevision,
          expectedRevision: currentState.deliveryRevision + 1,
        },
      ],
    };
  }
  if (
    currentState &&
    input.message.batchKind === 'snapshot' &&
    input.message.deliveryRevision < currentState.deliveryRevision
  ) {
    return {
      state: currentState,
      diagnostics: [
        {
          code: 'stale-delivery-revision',
          message: 'Timeline snapshot is older than the last applied delivery revision.',
          deliveryRevision: input.message.deliveryRevision,
          expectedRevision: currentState.deliveryRevision,
        },
      ],
    };
  }

  const validationState =
    currentState?.validationState ?? createInitialValidationState(input.message);
  const validation = validateAgentTurnTimelineMessage(input.message, validationState);
  if (!validation.ok || !validation.nextState) {
    const requiresSnapshot = validation.diagnostics.some(
      (diagnostic) => diagnostic.code === 'delivery-revision-gap',
    );
    if (!currentState || !requiresSnapshot) {
      return { state: currentState, diagnostics: validation.diagnostics };
    }
    const alreadySuspended = currentState.synchronization === 'suspended';
    return {
      state: { ...currentState, synchronization: 'suspended' },
      diagnostics: validation.diagnostics,
      ...(!alreadySuspended
        ? {
            snapshotRequest: buildAgentTurnTimelineSnapshotRequest({
              connectionEpoch: currentState.connectionEpoch,
              conversationId: currentState.conversationId,
              turnId: currentState.turnId,
              messageId: currentState.messageId,
              reason: 'revision-gap',
              lastAppliedDeliveryRevision: currentState.deliveryRevision,
            }),
          }
        : {}),
    };
  }

  const nextItems = applyTimelineOperations(
    input.message.batchKind === 'snapshot' ? [] : (currentState?.items ?? []),
    input.message.operations,
  );
  const parentDiagnostics = validateTimelineParentAnchors(nextItems);
  if (parentDiagnostics.length > 0) {
    return { state: currentState, diagnostics: parentDiagnostics };
  }

  return {
    diagnostics: [],
    state: {
      connectionEpoch: input.message.connectionEpoch,
      conversationId: input.message.conversationId,
      turnId: input.message.turnId,
      messageId: input.message.messageId,
      deliveryRevision: input.message.deliveryRevision,
      validationState: validation.nextState,
      items: nextItems,
      completed: input.message.completion !== undefined,
      synchronization: 'synchronized',
      ...(input.message.completion?.finalContentBlocks !== undefined
        ? { finalContentBlocks: input.message.completion.finalContentBlocks }
        : currentState?.finalContentBlocks !== undefined
          ? { finalContentBlocks: currentState.finalContentBlocks }
          : {}),
    },
  };
}

export function applyAgentTurnTimelineDiagnostic(
  state: ActiveTurnTimelineState | null | undefined,
  diagnostic: AgentTurnTimelineDiagnostic,
): ActiveTurnTimelineDiagnosticApplyResult {
  const currentState = state ?? null;
  if (!currentState || !isSameActiveTurnTimeline(currentState, diagnostic)) {
    return { state: currentState, diagnostic };
  }
  if (diagnostic.code !== 'turn-snapshot-unavailable') {
    return { state: currentState, diagnostic };
  }
  return {
    state: { ...currentState, synchronization: 'unavailable' },
    diagnostic,
  };
}

export function completeActiveTurnTimeline(
  state: ActiveTurnTimelineState | null | undefined,
  input: { readonly finalContentBlocks?: readonly ContentBlock[] } = {},
): ActiveTurnTimelineState | null {
  if (!state) return null;
  return {
    ...state,
    items: completeOpenTimelineItems(state.items),
    completed: true,
    ...(input.finalContentBlocks !== undefined
      ? { finalContentBlocks: input.finalContentBlocks }
      : state.finalContentBlocks !== undefined
        ? { finalContentBlocks: state.finalContentBlocks }
        : {}),
  };
}

function projectActiveTurnTimelineToMessage(
  state: ActiveTurnTimelineState | null | undefined,
): ActiveTurnTimelineProjection {
  if (!state) return { message: null, workItemIds: [] };
  const timelineContentBlocks = projectTimelineItemsToContentBlocks(state.items);
  const contentBlocks = state.completed
    ? mergeFinalContentBlocksIntoTimelineOrder(timelineContentBlocks, state.finalContentBlocks)
    : timelineContentBlocks;
  const workItemIds = projectTimelineWorkItemIds(state.items);
  return {
    workItemIds,
    message: {
      id: state.messageId,
      role: 'assistant',
      content: contentBlocks
        .filter((block) => block.type === 'text')
        .map((block) => block.content ?? '')
        .join(''),
      timestamp: contentBlocks[0]?.timestamp ?? Date.now(),
      isStreaming: !state.completed,
      contentBlocks,
      ...(workItemIds.length > 0 ? { workItemIds: [...workItemIds] } : {}),
    },
  };
}

export function projectActiveTurnTimelineWorkItems(
  state: ActiveTurnTimelineState | null | undefined,
): AgentWorkItem[] {
  if (!state) return [];
  return state.items.flatMap((item) =>
    item.kind === 'task' || item.kind === 'media' ? [item.payload.workItem] : [],
  );
}

export function projectMessagesWithActiveTurnTimeline(
  messages: readonly Message[],
  state: ActiveTurnTimelineState | null | undefined,
): Message[] {
  const projectedMessage = projectActiveTurnTimelineToMessage(state).message;
  if (!projectedMessage) return [...messages];
  const targetIndex = messages.findIndex((message) => message.id === projectedMessage.id);
  if (targetIndex === -1) return [...messages, projectedMessage];
  return messages.map((message, index) =>
    index === targetIndex ? mergeTimelineProjectionIntoMessage(message, projectedMessage) : message,
  );
}

function createInitialValidationState(
  message: AgentTurnTimelineMessage,
): AgentTurnTimelineValidationState {
  return {
    connectionEpoch: message.connectionEpoch,
    conversationId: message.conversationId,
    turnId: message.turnId,
    messageId: message.messageId,
    deliveryRevision: message.batchKind === 'snapshot' ? message.deliveryRevision : 0,
    completed: false,
    items: new Map(),
  };
}

function applyTimelineOperations(
  currentItems: readonly AgentTurnTimelineItem[],
  operations: AgentTurnTimelineMessage['operations'],
): AgentTurnTimelineItem[] {
  const byItemId = new Map(currentItems.map((item) => [item.itemId, item]));
  for (const operation of operations) {
    switch (operation.operation) {
      case 'append': {
        const current = byItemId.get(operation.item.itemId);
        if (
          current &&
          (current.kind === 'assistant_text' || current.kind === 'thinking') &&
          current.kind === operation.item.kind
        ) {
          byItemId.set(operation.item.itemId, {
            ...operation.item,
            sequence: current.sequence,
            createdAt: current.createdAt,
            payload: {
              ...operation.item.payload,
              content: `${current.payload.content}${operation.item.payload.content}`,
            },
          });
        } else {
          byItemId.set(operation.item.itemId, operation.item);
        }
        break;
      }
      case 'replace':
      case 'snapshot':
      case 'upsert':
        byItemId.set(operation.item.itemId, operation.item);
        break;
      case 'complete': {
        const current = byItemId.get(operation.itemId);
        if (current && (current.kind === 'assistant_text' || current.kind === 'thinking')) {
          byItemId.set(operation.itemId, {
            ...current,
            itemRevision: operation.itemRevision,
            status: operation.status,
            updatedAt: operation.updatedAt,
          });
        }
        break;
      }
    }
  }
  return Array.from(byItemId.values()).sort((left, right) => left.sequence - right.sequence);
}

function isSameActiveTurnTimeline(
  state: ActiveTurnTimelineState | null,
  message: Pick<
    AgentTurnTimelineMessage | AgentTurnTimelineDiagnostic,
    'connectionEpoch' | 'conversationId' | 'turnId' | 'messageId'
  >,
): boolean {
  return Boolean(
    state &&
    state.connectionEpoch === message.connectionEpoch &&
    state.conversationId === message.conversationId &&
    state.turnId === message.turnId &&
    state.messageId === message.messageId,
  );
}

function validateTimelineParentAnchors(
  items: readonly AgentTurnTimelineItem[],
): AgentTurnTimelineValidationDiagnostic[] {
  const diagnostics: AgentTurnTimelineValidationDiagnostic[] = [];
  const itemIds = new Set(items.map((item) => item.itemId));
  const toolCallIds = new Set(
    items.flatMap((item) => (item.kind === 'tool_call' ? [item.payload.toolCall.id] : [])),
  );
  for (const item of items) {
    if (item.parentAnchor === 'item' && item.parentItemId && !itemIds.has(item.parentItemId)) {
      diagnostics.push({
        code: 'invalid-parent-anchor',
        message: 'Timeline item parent anchor references an unknown item.',
        itemId: item.itemId,
        itemRevision: item.itemRevision,
      });
    }
    if (
      item.parentAnchor === 'tool_call' &&
      item.parentToolCallId &&
      !toolCallIds.has(item.parentToolCallId)
    ) {
      diagnostics.push({
        code: 'invalid-parent-anchor',
        message: 'Timeline tool parent anchor references an unknown tool call.',
        itemId: item.itemId,
        itemRevision: item.itemRevision,
      });
    }
  }
  return diagnostics;
}

function completeOpenTimelineItems(
  items: readonly AgentTurnTimelineItem[],
): readonly AgentTurnTimelineItem[] {
  return items.map((item) =>
    (item.kind === 'assistant_text' || item.kind === 'thinking') && item.status === 'streaming'
      ? { ...item, status: 'complete' }
      : item,
  );
}

function projectTimelineItemsToContentBlocks(
  items: readonly AgentTurnTimelineItem[],
): ContentBlock[] {
  const workItemIdsByToolCallId = projectWorkItemIdsByToolCallId(items);
  return items.flatMap((item): ContentBlock[] => {
    switch (item.kind) {
      case 'assistant_text':
        return projectAssistantTextItemToContentBlocks(item);
      case 'thinking':
        return [
          {
            id: item.itemId,
            type: 'thinking',
            timestamp: item.createdAt,
            thinking: item.payload.content,
            isThinkingComplete: item.status !== 'streaming',
          },
        ];
      case 'tool_call':
        return [
          {
            id: item.itemId,
            type: 'tool_call',
            timestamp: item.createdAt,
            toolCall: mergeToolCallWithTimelineChildren(
              item.payload.toolCall,
              workItemIdsByToolCallId.get(item.payload.toolCall.id) ?? [],
            ),
          },
        ];
      case 'composite':
        return [
          {
            id: item.itemId,
            type: 'composite',
            timestamp: item.createdAt,
            composite: item.payload.composite,
          },
        ];
      case 'error':
        return [
          {
            id: item.itemId,
            type: 'text',
            timestamp: item.createdAt,
            content: item.payload.message ? `Error: ${item.payload.message}` : 'An error occurred',
            isStreaming: false,
          },
        ];
      case 'task':
      case 'media':
        return [];
    }
  });
}

function projectAssistantTextItemToContentBlocks(
  item: Extract<AgentTurnTimelineItem, { readonly kind: 'assistant_text' }>,
): ContentBlock[] {
  return [
    {
      id: item.itemId,
      type: 'text',
      timestamp: item.createdAt,
      content: item.payload.content,
      isStreaming: item.status === 'streaming',
    },
  ];
}

function mergeToolCallWithTimelineChildren(
  toolCall: ToolCall,
  workItemIds: readonly string[],
): ToolCall {
  if (workItemIds.length === 0) {
    return toolCall;
  }
  const existingResult = toolCall.result;
  const existingResultData =
    existingResult && isRecord(existingResult.data) ? existingResult.data : {};
  const nextData = {
    ...existingResultData,
    backgroundMode: true,
    taskId: readString(existingResultData.taskId) ?? workItemIds[0],
    taskIds: dedupeStrings([...readStringArray(existingResultData.taskIds), ...workItemIds]),
  };
  return {
    ...toolCall,
    ...(existingResult ? { result: { ...existingResult, data: nextData } } : {}),
  };
}

function projectWorkItemIdsByToolCallId(
  items: readonly AgentTurnTimelineItem[],
): Map<string, string[]> {
  const byTool = new Map<string, string[]>();
  for (const item of items) {
    if (item.kind !== 'task' && item.kind !== 'media') continue;
    const toolCallId = item.parentToolCallId;
    if (!toolCallId) continue;
    const workItemId = item.payload.workItem.id;
    byTool.set(toolCallId, dedupeStrings([...(byTool.get(toolCallId) ?? []), workItemId]));
  }
  return byTool;
}

function projectTimelineWorkItemIds(items: readonly AgentTurnTimelineItem[]): string[] {
  return dedupeStrings(
    items.flatMap((item) =>
      item.kind === 'task' || item.kind === 'media' ? [item.payload.workItem.id] : [],
    ),
  );
}

function mergeTimelineProjectionIntoMessage(message: Message, projection: Message): Message {
  return {
    ...message,
    content: projection.content,
    isStreaming: projection.isStreaming,
    contentBlocks: projection.contentBlocks,
    workItemIds: mergeOptionalIds(message.workItemIds, projection.workItemIds),
  };
}

function mergeFinalContentBlocksIntoTimelineOrder(
  timelineBlocks: readonly ContentBlock[],
  finalBlocks: readonly ContentBlock[] | undefined,
): ContentBlock[] {
  if (!finalBlocks || finalBlocks.length === 0) return [...timelineBlocks];

  const finalById = new Map(finalBlocks.map((block) => [block.id, block]));
  const finalByToolCallId = new Map(
    finalBlocks.flatMap((block) =>
      block.type === 'tool_call' && block.toolCall?.id ? [[block.toolCall.id, block]] : [],
    ),
  );

  return timelineBlocks.map((block) => {
    // Markdown/thinking source and identity remain owned by the Timeline session.
    if (block.type === 'text' || block.type === 'thinking') return block;
    const replacement =
      finalById.get(block.id) ??
      (block.type === 'tool_call' && block.toolCall?.id
        ? finalByToolCallId.get(block.toolCall.id)
        : undefined);
    return replacement ?? block;
  });
}

function mergeOptionalIds(
  current: readonly string[] | undefined,
  next: readonly string[] | undefined,
): string[] | undefined {
  const ids = dedupeStrings([...(current ?? []), ...(next ?? [])]);
  return ids.length > 0 ? ids : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function dedupeStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
