import type { ContentBlock, Message } from '@/components/types';
import {
  projectContentBlocksUi,
  type ContentBlockUiProjection,
} from '@/presenters/content-block-presenter';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';

export type MessageListItemKind = 'message' | 'content_block' | 'thinking_indicator';

export type MessageListProjectionItem =
  | MessageListMessageItemProjection
  | MessageListContentBlockItemProjection
  | MessageListThinkingItemProjection;

export interface MessageListMessageItemProjection {
  kind: 'message';
  message: Message;
  isGrouped: boolean;
  ownerMessageId: string;
  estimatedHeight: number;
}

export interface MessageListContentBlockItemProjection {
  kind: 'content_block';
  messageId: string;
  workItemIds?: string[];
  projection: ContentBlockUiProjection;
  siblingBlocks: ContentBlock[];
  isFirst: boolean;
  isLast: boolean;
  isStreaming: boolean;
  ownerMessageId: string;
  estimatedHeight: number;
}

export interface MessageListThinkingItemProjection {
  kind: 'thinking_indicator';
  ownerMessageId: null;
  estimatedHeight: number;
}

export interface MessageListProjectionInput {
  messages: readonly Message[];
  isThinking: boolean;
  streamingMessageId: string | null;
  plugins?: PluginsAvailable;
}

export interface MessageListProjection {
  items: MessageListProjectionItem[];
  itemCount: number;
  showThinkingIndicator: boolean;
  streamingItemIndex: number;
}

export const MESSAGE_LIST_ESTIMATED_MESSAGE_HEIGHT = 80;
export const MESSAGE_LIST_ESTIMATED_CONTENT_BLOCK_HEIGHT = 60;
export const MESSAGE_LIST_THINKING_INDICATOR_HEIGHT = 50;

export function projectMessageList(input: MessageListProjectionInput): MessageListProjection {
  const showThinkingIndicator = input.isThinking && !input.streamingMessageId;
  const items = projectMessageListItems(input.messages, showThinkingIndicator, {
    plugins: input.plugins,
  });

  return {
    items,
    itemCount: items.length,
    showThinkingIndicator,
    streamingItemIndex: findMessageListStreamingItemIndex(items, input.streamingMessageId),
  };
}

export function projectMessageListItems(
  messages: readonly Message[],
  showThinkingIndicator: boolean,
  options: Pick<MessageListProjectionInput, 'plugins'> = {},
): MessageListProjectionItem[] {
  const items: MessageListProjectionItem[] = [];
  let prevRole: Message['role'] | null = null;
  let prevTimestamp = 0;

  for (const message of messages) {
    const timeDiff = message.timestamp - prevTimestamp;
    const isGrouped = prevRole === message.role && timeDiff < 2 * 60 * 1000;

    if (message.role === 'assistant' && message.contentBlocks && message.contentBlocks.length > 0) {
      const contentBlockProjections = projectContentBlocksUi(
        message.contentBlocks,
        message.isStreaming ?? false,
        undefined,
        message.contentBlocks,
        message.toolCalls,
        options.plugins,
      );

      contentBlockProjections.forEach((projection, blockIndex) => {
        items.push({
          kind: 'content_block',
          messageId: message.id,
          workItemIds: message.workItemIds,
          projection,
          siblingBlocks: message.contentBlocks ?? [],
          isFirst: blockIndex === 0,
          isLast: blockIndex === contentBlockProjections.length - 1,
          isStreaming: message.isStreaming ?? false,
          ownerMessageId: message.id,
          estimatedHeight: estimateContentBlockProjectionHeight(projection),
        });
      });
    } else {
      items.push({
        kind: 'message',
        message,
        isGrouped,
        ownerMessageId: message.id,
        estimatedHeight: estimateMessageHeight(message),
      });
    }

    prevRole = message.role;
    prevTimestamp = message.timestamp;
  }

  if (showThinkingIndicator) {
    items.push({
      kind: 'thinking_indicator',
      ownerMessageId: null,
      estimatedHeight: MESSAGE_LIST_THINKING_INDICATOR_HEIGHT,
    });
  }

  return items;
}

export function findMessageListStreamingItemIndex(
  items: readonly MessageListProjectionItem[],
  streamingMessageId: string | null,
): number {
  if (!streamingMessageId) return -1;
  return findLastIndex(items, (item) => item.ownerMessageId === streamingMessageId);
}

export function estimateMessageListItemHeight(item: MessageListProjectionItem | undefined): number {
  return item?.estimatedHeight ?? MESSAGE_LIST_ESTIMATED_MESSAGE_HEIGHT;
}

function estimateContentBlockProjectionHeight(projection: ContentBlockUiProjection): number {
  if (projection.renderKind === 'toolGroup') {
    return 72;
  }
  return estimateContentBlockHeight(projection.block);
}

function estimateContentBlockHeight(block: ContentBlock): number {
  switch (block.type) {
    case 'thinking':
      return 80;
    case 'tool_call':
      return 100;
    case 'code_diff':
      return 200;
    case 'plan':
      return 150;
    case 'composite':
      return 220;
    case 'text': {
      const contentLines = Math.ceil((block.content?.length ?? 0) / 60);
      return Math.max(MESSAGE_LIST_ESTIMATED_CONTENT_BLOCK_HEIGHT, contentLines * 20 + 40);
    }
  }
}

function estimateMessageHeight(message: Message): number {
  const contentLines = Math.ceil((message.content?.length ?? 0) / 60);
  const attachmentHeight = (message.attachments?.length ?? 0) * 100;
  const contextRefHeight = (message.contextReferences?.length ?? 0) > 0 ? 28 : 0;
  const toolCallHeight = (message.toolCalls?.length ?? 0) * 60;
  const thinkingHeight = message.thinking ? 100 : 0;

  return Math.max(
    MESSAGE_LIST_ESTIMATED_MESSAGE_HEIGHT,
    contentLines * 20 + attachmentHeight + contextRefHeight + toolCallHeight + thinkingHeight + 40,
  );
}

function findLastIndex<T>(items: readonly T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item !== undefined && predicate(item)) return index;
  }
  return -1;
}
