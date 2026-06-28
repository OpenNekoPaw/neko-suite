import type {
  AgentTurnTimelineItem,
  AgentTurnTimelineMessage,
  AgentTurnTimelineValidationDiagnostic,
  AgentWorkItem,
  ContentBlock,
  Message,
  ToolCall,
} from '@neko-agent/types';
import { extractCompositeContentBlocks, validateAgentTurnTimelineMessage } from '@neko-agent/types';

export interface ActiveTurnTimelineState {
  readonly conversationId: string;
  readonly turnId: string;
  readonly messageId: string;
  readonly items: readonly AgentTurnTimelineItem[];
  readonly completed: boolean;
  readonly finalContentBlocks?: readonly ContentBlock[];
}

export interface ActiveTurnTimelineApplyInput {
  readonly state?: ActiveTurnTimelineState | null;
  readonly message: AgentTurnTimelineMessage;
}

export interface ActiveTurnTimelineApplyResult {
  readonly state: ActiveTurnTimelineState | null;
  readonly diagnostics: readonly AgentTurnTimelineValidationDiagnostic[];
}

export interface ActiveTurnTimelineProjection {
  readonly message: Message | null;
  readonly workItemIds: readonly string[];
}

export function applyAgentTurnTimelineMessage(
  input: ActiveTurnTimelineApplyInput,
): ActiveTurnTimelineApplyResult {
  const currentState = isSameActiveTurnTimeline(input.state ?? null, input.message)
    ? (input.state ?? null)
    : null;
  const diagnostics = [...validateAgentTurnTimelineMessage(input.message).diagnostics];
  diagnostics.push(...validateTimelineStateTransition(currentState, input.message.events));
  if (diagnostics.length > 0) {
    return {
      state: input.state ?? null,
      diagnostics,
    };
  }

  const nextItems = mergeTimelineItems(currentState?.items ?? [], input.message.events);
  const completed =
    currentState?.completed === true ||
    (input.message.finalContentBlocks !== undefined && input.message.finalContentBlocks.length > 0);
  return {
    diagnostics: [],
    state: {
      conversationId: input.message.conversationId,
      turnId: input.message.turnId,
      messageId: input.message.messageId,
      items: nextItems,
      completed,
      ...(input.message.finalContentBlocks !== undefined
        ? { finalContentBlocks: input.message.finalContentBlocks }
        : currentState?.finalContentBlocks !== undefined
          ? { finalContentBlocks: currentState.finalContentBlocks }
          : {}),
    },
  };
}

export function completeActiveTurnTimeline(
  state: ActiveTurnTimelineState | null | undefined,
  input: { readonly finalContentBlocks?: readonly ContentBlock[] } = {},
): ActiveTurnTimelineState | null {
  if (!state) {
    return null;
  }
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
  if (!state) {
    return { message: null, workItemIds: [] };
  }

  const contentBlocks = projectTimelineItemsToContentBlocks(state.items);
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
  if (!state) {
    return [];
  }
  return state.items.flatMap((item) =>
    item.kind === 'task' || item.kind === 'media' ? [item.payload.workItem] : [],
  );
}

export function projectMessagesWithActiveTurnTimeline(
  messages: readonly Message[],
  state: ActiveTurnTimelineState | null | undefined,
): Message[] {
  const projection = projectActiveTurnTimelineToMessage(state);
  const projectedMessage = projection.message;
  if (!projectedMessage) {
    return [...messages];
  }

  const targetIndex = messages.findIndex((message) => message.id === projectedMessage.id);
  if (targetIndex === -1) {
    return [...messages, projectedMessage];
  }

  return messages.map((message, index) =>
    index === targetIndex ? mergeTimelineProjectionIntoMessage(message, projectedMessage) : message,
  );
}

function mergeTimelineItems(
  currentItems: readonly AgentTurnTimelineItem[],
  events: readonly AgentTurnTimelineItem[],
): AgentTurnTimelineItem[] {
  const byItemId = new Map(currentItems.map((item) => [item.itemId, item]));
  for (const event of events) {
    byItemId.set(event.itemId, mergeTimelineItem(byItemId.get(event.itemId), event));
  }
  return Array.from(byItemId.values()).sort((a, b) => a.sequence - b.sequence);
}

function isSameActiveTurnTimeline(
  state: ActiveTurnTimelineState | null,
  message: AgentTurnTimelineMessage,
): boolean {
  return Boolean(
    state &&
    state.conversationId === message.conversationId &&
    state.turnId === message.turnId &&
    state.messageId === message.messageId,
  );
}

function validateTimelineStateTransition(
  state: ActiveTurnTimelineState | null,
  events: readonly AgentTurnTimelineItem[],
): AgentTurnTimelineValidationDiagnostic[] {
  if (!state) {
    return validateTimelineParentAnchors(events);
  }

  const diagnostics: AgentTurnTimelineValidationDiagnostic[] = [];
  const currentByItemId = new Map(state.items.map((item) => [item.itemId, item]));
  for (const event of events) {
    const current = currentByItemId.get(event.itemId);
    if (current && current.kind !== event.kind) {
      diagnostics.push({
        code: 'duplicate-item-id',
        message: 'Timeline item id was reused for a different active timeline item kind.',
        itemId: event.itemId,
        sequence: event.sequence,
      });
    }
    currentByItemId.set(event.itemId, event);
  }

  diagnostics.push(...validateTimelineParentAnchors(Array.from(currentByItemId.values())));
  return diagnostics;
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
        sequence: item.sequence,
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
        sequence: item.sequence,
      });
    }
  }

  return diagnostics;
}

function mergeTimelineItem(
  current: AgentTurnTimelineItem | undefined,
  event: AgentTurnTimelineItem,
): AgentTurnTimelineItem {
  if (!current) {
    return event;
  }
  if (current.kind !== event.kind) {
    return event;
  }

  const base = {
    sequence: current.sequence,
    createdAt: Math.min(current.createdAt, event.createdAt),
    updatedAt: Math.max(current.updatedAt, event.updatedAt),
  };

  switch (event.kind) {
    case 'assistant_text': {
      if (current.kind !== 'assistant_text') return event;
      const currentContent = current.payload.content;
      const nextContent = event.payload.content;
      return {
        ...event,
        ...base,
        payload: {
          ...current.payload,
          ...event.payload,
          content: nextContent.startsWith(currentContent)
            ? nextContent
            : `${currentContent}${nextContent}`,
        },
      };
    }
    case 'thinking': {
      if (current.kind !== 'thinking') return event;
      const currentContent = current.payload.content;
      const nextContent = event.payload.content;
      return {
        ...event,
        ...base,
        payload: {
          ...current.payload,
          ...event.payload,
          content: nextContent.startsWith(currentContent)
            ? nextContent
            : `${currentContent}${nextContent}`,
        },
      };
    }
    case 'tool_call':
    case 'task':
    case 'media':
    case 'composite':
    case 'error':
      return {
        ...event,
        ...base,
      };
  }
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
            content: `Error: ${item.payload.message}`,
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
  if (item.status === 'streaming') {
    return [
      {
        id: item.itemId,
        type: 'text',
        timestamp: item.createdAt,
        content: item.payload.content,
        isStreaming: true,
      },
    ];
  }

  const extracted = extractCompositeContentBlocks(item.payload.content);
  const blocks: ContentBlock[] = [];
  if (extracted.text.length > 0) {
    blocks.push({
      id: item.itemId,
      type: 'text',
      timestamp: item.createdAt,
      content: extracted.text,
      isStreaming: false,
    });
  }
  blocks.push(
    ...extracted.composites.map((composite, index) => ({
      id: `${item.itemId}-composite-${index + 1}`,
      type: 'composite' as const,
      timestamp: item.createdAt,
      composite,
    })),
  );

  if (blocks.length > 0) {
    return blocks;
  }

  return [
    {
      id: item.itemId,
      type: 'text',
      timestamp: item.createdAt,
      content: '',
      isStreaming: false,
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
