import type {
  AgentTurnTimelineItem,
  AgentWorkItem,
  ContentBlock,
  Message,
} from '@neko-agent/types';
import {
  projectTimelineItemsToWorkItems,
  projectTimelineTurnToMessage,
} from './timeline-projection-presenter';

/**
 * Compatibility state for the pre-projection conversation cache.
 * Authoritative rendering is owned by each Tab projection replica.
 */
export interface ActiveTurnTimelineState {
  readonly conversationId: string;
  readonly turnId: string;
  readonly messageId: string;
  readonly items: readonly AgentTurnTimelineItem[];
  readonly completed: boolean;
  readonly finalContentBlocks?: readonly ContentBlock[];
}

export function completeActiveTurnTimeline(
  state: ActiveTurnTimelineState,
  input: { readonly finalContentBlocks?: readonly ContentBlock[] } = {},
): ActiveTurnTimelineState {
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

export function projectActiveTurnTimelineWorkItems(
  state: ActiveTurnTimelineState | null | undefined,
): AgentWorkItem[] {
  return state ? projectTimelineItemsToWorkItems(state.items) : [];
}

export function projectMessagesWithActiveTurnTimeline(
  messages: readonly Message[],
  state: ActiveTurnTimelineState | null | undefined,
): Message[] {
  if (!state) return [...messages];
  const projectedMessage = projectTimelineTurnToMessage(state);
  const targetIndex = messages.findIndex((message) => message.id === projectedMessage.id);
  if (targetIndex === -1) return [...messages, projectedMessage];
  return messages.map((message, index) =>
    index === targetIndex ? mergeTimelineProjectionIntoMessage(message, projectedMessage) : message,
  );
}

function completeOpenTimelineItems(
  items: readonly AgentTurnTimelineItem[],
): AgentTurnTimelineItem[] {
  return items.map((item) =>
    item.status === 'streaming' ? { ...item, status: 'complete', updatedAt: Date.now() } : item,
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
  const ids = Array.from(new Set([...(current ?? []), ...(next ?? [])]));
  return ids.length > 0 ? ids : undefined;
}
