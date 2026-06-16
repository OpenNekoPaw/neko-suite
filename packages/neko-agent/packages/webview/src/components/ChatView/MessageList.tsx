/**
 * MessageList - 消息列表组件
 * P2: 使用虚拟滚动优化长对话性能
 * Optimized: Message grouping for consecutive same-role messages
 * Enhanced: Flattened content blocks for chronological rendering
 */

import { useRef, useEffect, useCallback, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Message } from '@neko-agent/types';
import { MessageItem } from '@/components/ChatView/MessageItem';
import { ContentBlockItem } from '@/components/ChatView/ContentBlockItem';
import { ProcessRecordsGroup } from '@/components/ChatView/ProcessRecordsGroup';
import { MessageAvatar } from '@/components/ChatView/MessageAvatar';
import {
  DEFAULT_MESSAGE_IDENTITIES,
  type MessageIdentityMap,
} from '@/components/ChatView/message-identity';
import { useMessageActions } from '@/components/ChatView/MessageActionsContext';
import {
  estimateMessageListItemHeight,
  projectMessageList,
} from '@/presenters/message-list-presenter';

interface MessageListProps {
  messages: Message[];
  isThinking: boolean;
  streamingMessageId: string | null;
  activeConversationId: string | null;
  identities?: MessageIdentityMap;
}

export function MessageList({
  messages,
  isThinking,
  streamingMessageId,
  activeConversationId,
  identities = DEFAULT_MESSAGE_IDENTITIES,
}: MessageListProps) {
  const { pluginsAvailable } = useMessageActions();
  const parentRef = useRef<HTMLDivElement>(null);
  const prevItemCountRef = useRef(0);
  const autoScrollRafRef = useRef<number | null>(null);
  const autoScrollWindowRef = useRef<Window | null>(null);

  const projection = useMemo(
    () =>
      projectMessageList({ messages, isThinking, streamingMessageId, plugins: pluginsAvailable }),
    [messages, isThinking, streamingMessageId, pluginsAvailable],
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

  const cancelScheduledAutoScroll = useCallback(() => {
    const scrollWindow = autoScrollWindowRef.current ?? getElementWindow(parentRef.current);
    if (autoScrollRafRef.current !== null && scrollWindow) {
      scrollWindow.cancelAnimationFrame(autoScrollRafRef.current);
    }
    autoScrollRafRef.current = null;
    autoScrollWindowRef.current = null;
  }, []);

  const scheduleScrollToOffset = useCallback(
    (offset: number, behavior: ScrollBehavior = 'smooth') => {
      const scrollElement = parentRef.current;
      const scrollWindow = getElementWindow(scrollElement);
      if (!scrollElement || !scrollWindow) return;

      cancelScheduledAutoScroll();
      autoScrollWindowRef.current = scrollWindow;
      autoScrollRafRef.current = scrollWindow.requestAnimationFrame(() => {
        autoScrollRafRef.current = null;
        autoScrollWindowRef.current = null;
        if (!isScrollableElementConnected(scrollElement)) return;
        scrollElement.scrollTo({ top: Math.max(0, offset), behavior });
      });
    },
    [cancelScheduledAutoScroll],
  );

  useEffect(() => cancelScheduledAutoScroll, [cancelScheduledAutoScroll]);

  // Auto-scroll to bottom when new items arrive or streaming
  useEffect(() => {
    const itemCountChanged = itemCount !== prevItemCountRef.current;
    prevItemCountRef.current = itemCount;

    // Scroll to bottom on new item or when thinking starts
    if (itemCountChanged || isThinking) {
      scheduleScrollToOffset(virtualizer.getTotalSize());
    }
  }, [itemCount, isThinking, scheduleScrollToOffset, virtualizer]);

  // Also scroll when streaming content updates
  useEffect(() => {
    if (streamingMessageId) {
      if (projection.streamingItemIndex !== -1) {
        const offsetInfo = virtualizer.getOffsetForIndex(projection.streamingItemIndex, 'end');
        if (offsetInfo) {
          scheduleScrollToOffset(offsetInfo[0]);
        }
      }
    }
  }, [streamingMessageId, projection.streamingItemIndex, scheduleScrollToOffset, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className="agent-message-list flex-1 overflow-y-auto scrollbar-auto-hide"
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
              <div className="agent-message-list-item py-0.5">
                {item.kind === 'thinking_indicator' ? (
                  <ThinkingIndicator identity={identities.assistant} />
                ) : item.kind === 'content_block' ? (
                  <ContentBlockItem
                    projection={item.projection}
                    isFirst={item.isFirst}
                    isLast={item.isLast}
                    isStreaming={item.isStreaming}
                    conversationId={activeConversationId}
                    workItemIds={item.workItemIds}
                    siblingBlocks={item.siblingBlocks}
                    assistantIdentity={identities.assistant}
                  />
                ) : item.kind === 'process_group' ? (
                  <ProcessRecordsGroup
                    processGroup={item.processGroup}
                    isStreaming={item.isStreaming}
                    conversationId={activeConversationId}
                    workItemIds={item.workItemIds}
                    siblingBlocks={item.siblingBlocks}
                    assistantIdentity={identities.assistant}
                  />
                ) : (
                  <MessageItem
                    message={item.message}
                    isGrouped={item.isGrouped}
                    conversationId={activeConversationId}
                    identities={identities}
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

function getElementWindow(element: HTMLElement | null): Window | null {
  return element?.ownerDocument.defaultView ?? null;
}

function isScrollableElementConnected(element: HTMLElement): boolean {
  return Boolean(element.isConnected && element.ownerDocument.defaultView);
}

// Thinking indicator component (matches new message layout)
function ThinkingIndicator({ identity }: { identity: MessageIdentityMap['assistant'] }) {
  return (
    <div className="py-0.5">
      <div className="flex gap-2.5 px-3 py-1.5">
        {/* Avatar */}
        <div className="flex-shrink-0 w-7 pt-0.5">
          <MessageAvatar
            role="assistant"
            label={identity.avatarLabel}
            imageUri={identity.avatarUri}
            size="md"
            title={identity.title}
          />
        </div>
        {/* Content */}
        <div className="flex-1 min-w-0 max-w-[85%]">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[11px] font-medium text-[var(--vscode-textLink-foreground)]">
              {identity.displayName}
            </span>
          </div>
          {/* Bubble with dots */}
          <div className="agent-bubble agent-bubble-assistant inline-block rounded-2xl rounded-tl-md px-3 py-2">
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
