import type { AgentQueuedMessageItem, Message } from '@neko-agent/types';

const OPTIMISTIC_QUEUED_MESSAGE_ID_PREFIX = 'optimistic:';

export interface QueuedMessageReleaseInput {
  messages: readonly Message[];
  previousQueuedMessageCount: number;
  nextQueuedMessageCount: number;
}

export interface ReleasedQueuedMessageProjectionInput {
  messages: readonly Message[];
  item: AgentQueuedMessageItem;
}

export function projectQueuedMessagesForPendingCount(input: QueuedMessageReleaseInput): Message[] {
  const releaseCount = Math.max(0, input.previousQueuedMessageCount - input.nextQueuedMessageCount);

  if (releaseCount === 0) {
    return [...input.messages];
  }

  const releasedMessages: Message[] = [];
  const remainingMessages: Message[] = [];
  let remainingReleaseCount = releaseCount;

  for (const message of input.messages) {
    if (remainingReleaseCount > 0 && isQueuedUserMessage(message)) {
      const releasedMessage: Message = { ...message };
      delete releasedMessage.isQueued;
      releasedMessages.push(releasedMessage);
      remainingReleaseCount -= 1;
      continue;
    }

    remainingMessages.push(message);
  }

  return [...remainingMessages, ...releasedMessages];
}

export function projectQueuedMessagesCleared(messages: readonly Message[]): Message[] {
  return messages.filter((message) => !isQueuedUserMessage(message));
}

export function projectReleasedQueuedMessageIntoTranscript(
  input: ReleasedQueuedMessageProjectionInput,
): Message[] {
  const releasedMessageId = buildReleasedQueuedMessageId(input.item.id);
  const withoutPendingItems = projectQueuedMessagesCleared(input.messages);
  if (
    withoutPendingItems.some(
      (message) =>
        message.id === releasedMessageId ||
        (message.role === 'user' &&
          message.content === input.item.content &&
          message.timestamp === input.item.createdAt),
    )
  ) {
    return withoutPendingItems;
  }

  return [
    ...withoutPendingItems,
    {
      id: releasedMessageId,
      role: 'user',
      content: input.item.content,
      timestamp: input.item.createdAt,
    },
  ];
}

export function hasQueuedUserMessages(messages: readonly Message[]): boolean {
  return messages.some(isQueuedUserMessage);
}

export function projectOptimisticQueuedMessageItem(input: {
  readonly conversationId: string;
  readonly message: Message;
}): AgentQueuedMessageItem | null {
  if (!isQueuedUserMessage(input.message)) {
    return null;
  }
  return {
    id: `${OPTIMISTIC_QUEUED_MESSAGE_ID_PREFIX}${input.message.id}`,
    conversationId: input.conversationId,
    content: input.message.content,
    createdAt: input.message.timestamp,
    source: 'composer',
  };
}

export function isOptimisticQueuedMessageItem(item: Pick<AgentQueuedMessageItem, 'id'>): boolean {
  return item.id.startsWith(OPTIMISTIC_QUEUED_MESSAGE_ID_PREFIX);
}

function isQueuedUserMessage(message: Message): boolean {
  return message.role === 'user' && message.isQueued === true;
}

function buildReleasedQueuedMessageId(queueItemId: string): string {
  return `released:${queueItemId}`;
}
