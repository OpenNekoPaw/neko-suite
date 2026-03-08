/**
 * MessageList - 消息列表组件
 * P2: 使用虚拟滚动优化长对话性能
 * Optimized: Message grouping for consecutive same-role messages
 * Enhanced: Flattened content blocks for chronological rendering
 */

import { useRef, useEffect, useCallback, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Message, ContentBlock } from '@/components/types';
import { MessageItem } from '@/components/ChatView/MessageItem';
import { ContentBlockItem } from '@/components/ChatView/ContentBlockItem';
import { BackgroundTask } from '@/components/TaskListView';

interface MessageListProps {
  messages: Message[];
  isThinking: boolean;
  streamingMessageId: string | null;
  backgroundTasks?: BackgroundTask[];
}

// Estimated heights for different message types
const ESTIMATED_MESSAGE_HEIGHT = 80;
const ESTIMATED_CONTENT_BLOCK_HEIGHT = 60;
const THINKING_INDICATOR_HEIGHT = 50;

/**
 * Flattened item type for rendering
 * - 'message': User message or assistant message without contentBlocks
 * - 'content_block': Individual content block from assistant message
 * - 'thinking_indicator': Thinking indicator when agent is processing
 */
type FlattenedItem =
  | { type: 'message'; message: Message; isGrouped: boolean }
  | { type: 'content_block'; messageId: string; block: ContentBlock; isFirst: boolean; isLast: boolean; isStreaming: boolean }
  | { type: 'thinking_indicator' };

/**
 * Flatten messages for chronological rendering
 * Assistant messages with contentBlocks are expanded into individual items
 */
function flattenMessages(messages: Message[], showThinkingIndicator: boolean): FlattenedItem[] {
  const items: FlattenedItem[] = [];
  let prevRole: string | null = null;
  let prevTimestamp = 0;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg) continue;

    // Check if should group with previous
    const timeDiff = msg.timestamp - prevTimestamp;
    const isGrouped = prevRole === msg.role && timeDiff < 2 * 60 * 1000;

    // For assistant messages with contentBlocks, flatten them
    if (msg.role === 'assistant' && msg.contentBlocks && msg.contentBlocks.length > 0) {
      msg.contentBlocks.forEach((block, blockIndex) => {
        items.push({
          type: 'content_block',
          messageId: msg.id,
          block,
          isFirst: blockIndex === 0,
          isLast: blockIndex === msg.contentBlocks!.length - 1,
          isStreaming: msg.isStreaming ?? false,
        });
      });
    } else {
      // User messages or assistant messages without contentBlocks
      items.push({
        type: 'message',
        message: msg,
        isGrouped,
      });
    }

    prevRole = msg.role;
    prevTimestamp = msg.timestamp;
  }

  // Add thinking indicator at the end if needed
  if (showThinkingIndicator) {
    items.push({ type: 'thinking_indicator' });
  }

  return items;
}

export function MessageList({
  messages,
  isThinking,
  streamingMessageId,
  backgroundTasks,
}: MessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const prevItemCountRef = useRef(0);

  // Include thinking indicator as a virtual item when needed
  const showThinkingIndicator = isThinking && !streamingMessageId;

  // Flatten messages for chronological rendering
  const flattenedItems = useMemo(
    () => flattenMessages(messages, showThinkingIndicator),
    [messages, showThinkingIndicator]
  );

  const itemCount = flattenedItems.length;

  const virtualizer = useVirtualizer({
    count: itemCount,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback((index: number) => {
      const item = flattenedItems[index];
      if (!item) return ESTIMATED_MESSAGE_HEIGHT;

      if (item.type === 'thinking_indicator') {
        return THINKING_INDICATOR_HEIGHT;
      }

      if (item.type === 'content_block') {
        // Estimate based on block type
        const block = item.block;
        if (block.type === 'thinking') return 80;
        if (block.type === 'tool_call') return 100;
        if (block.type === 'code_diff') return 200;
        if (block.type === 'plan') return 150;
        // Text block
        const contentLines = Math.ceil((block.content?.length || 0) / 60);
        return Math.max(ESTIMATED_CONTENT_BLOCK_HEIGHT, contentLines * 20 + 40);
      }

      // Message item
      const message = item.message;
      const contentLines = Math.ceil((message.content?.length || 0) / 60);
      const attachmentHeight = (message.attachments?.length || 0) * 100;
      const toolCallHeight = (message.toolCalls?.length || 0) * 60;
      const thinkingHeight = message.thinking ? 100 : 0;

      return Math.max(
        ESTIMATED_MESSAGE_HEIGHT,
        contentLines * 20 + attachmentHeight + toolCallHeight + thinkingHeight + 40
      );
    }, [flattenedItems]),
    overscan: 5,
  });

  // Auto-scroll to bottom when new items arrive or streaming
  useEffect(() => {
    const itemCountChanged = itemCount !== prevItemCountRef.current;
    prevItemCountRef.current = itemCount;

    // Scroll to bottom on new item or when thinking starts
    if (itemCountChanged || isThinking) {
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(itemCount - 1, { align: 'end', behavior: 'smooth' });
      });
    }
  }, [itemCount, isThinking, virtualizer]);

  // Also scroll when streaming content updates
  useEffect(() => {
    if (streamingMessageId) {
      // Find the last item belonging to the streaming message
      const streamingIndex = flattenedItems.findLastIndex(item =>
        (item.type === 'message' && item.message.id === streamingMessageId) ||
        (item.type === 'content_block' && item.messageId === streamingMessageId)
      );
      if (streamingIndex !== -1) {
        virtualizer.scrollToIndex(streamingIndex, { align: 'end', behavior: 'smooth' });
      }
    }
  }, [streamingMessageId, flattenedItems, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className="flex-1 overflow-y-auto pl-3 pr-1 scrollbar-auto-hide"
      style={{ contain: 'strict' }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualItem) => {
          const item = flattenedItems[virtualItem.index];
          if (!item) return null;

          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <div className="py-0.5">
                {item.type === 'thinking_indicator' ? (
                  <ThinkingIndicator />
                ) : item.type === 'content_block' ? (
                  <ContentBlockItem
                    block={item.block}
                    isFirst={item.isFirst}
                    isLast={item.isLast}
                    isStreaming={item.isStreaming}
                  />
                ) : (
                  <MessageItem
                    message={item.message}
                    backgroundTasks={backgroundTasks}
                    isGrouped={item.isGrouped}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Thinking indicator component (matches new message layout)
function ThinkingIndicator() {
  return (
    <div className="py-0.5">
      <div className="flex gap-2.5 px-3 py-1.5">
        {/* Avatar */}
        <div className="flex-shrink-0 w-7 pt-0.5">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[var(--vscode-charts-purple)] to-[var(--vscode-charts-blue)] flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
            </svg>
          </div>
        </div>
        {/* Content */}
        <div className="flex-1 min-w-0 max-w-[85%]">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[11px] font-medium text-[var(--vscode-textLink-foreground)]">
              Assistant
            </span>
          </div>
          {/* Bubble with dots */}
          <div className="inline-block px-3 py-2 rounded-2xl rounded-tl-sm bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)]">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-[var(--vscode-descriptionForeground)] rounded-full animate-bounce [animation-delay:-0.32s]" />
              <span className="w-1.5 h-1.5 bg-[var(--vscode-descriptionForeground)] rounded-full animate-bounce [animation-delay:-0.16s]" />
              <span className="w-1.5 h-1.5 bg-[var(--vscode-descriptionForeground)] rounded-full animate-bounce" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
