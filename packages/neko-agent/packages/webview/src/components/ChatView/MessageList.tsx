/**
 * MessageList - 消息列表组件
 * P2: 使用虚拟滚动优化长对话性能
 * Optimized: Message grouping for consecutive same-role messages
 * Enhanced: Flattened content blocks for chronological rendering
 */

import { useRef, useEffect, useCallback, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Message } from '@/components/types';
import { MessageItem } from '@/components/ChatView/MessageItem';
import { ContentBlockItem } from '@/components/ChatView/ContentBlockItem';
import {
  estimateMessageListItemHeight,
  projectMessageList,
} from '@/presenters/message-list-presenter';

interface MessageListProps {
  messages: Message[];
  isThinking: boolean;
  streamingMessageId: string | null;
  activeConversationId: string | null;
}

export function MessageList({
  messages,
  isThinking,
  streamingMessageId,
  activeConversationId,
}: MessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const prevItemCountRef = useRef(0);

  const projection = useMemo(
    () => projectMessageList({ messages, isThinking, streamingMessageId }),
    [messages, isThinking, streamingMessageId],
  );

  const flattenedItems = projection.items;
  const itemCount = projection.itemCount;

  const virtualizer = useVirtualizer({
    count: itemCount,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback(
      (index: number) => estimateMessageListItemHeight(flattenedItems[index]),
      [flattenedItems],
    ),
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
      if (projection.streamingItemIndex !== -1) {
        virtualizer.scrollToIndex(projection.streamingItemIndex, {
          align: 'end',
          behavior: 'smooth',
        });
      }
    }
  }, [streamingMessageId, projection.streamingItemIndex, virtualizer]);

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
                {item.kind === 'thinking_indicator' ? (
                  <ThinkingIndicator />
                ) : item.kind === 'content_block' ? (
                  <ContentBlockItem
                    block={item.block}
                    isFirst={item.isFirst}
                    isLast={item.isLast}
                    isStreaming={item.isStreaming}
                    conversationId={activeConversationId}
                    workItemIds={item.workItemIds}
                    siblingBlocks={item.siblingBlocks}
                  />
                ) : (
                  <MessageItem
                    message={item.message}
                    isGrouped={item.isGrouped}
                    conversationId={activeConversationId}
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
