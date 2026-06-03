import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '@/components/types';
import { MessageActionsProvider } from '@/components/ChatView/MessageActionsContext';
import { MessageList } from './MessageList';

const scrollToMock = vi.fn();
const requestAnimationFrameMock = vi.fn<(callback: FrameRequestCallback) => number>();
const cancelAnimationFrameMock = vi.fn<(handle: number) => void>();

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: () => ({
    getVirtualItems: () => [],
    getTotalSize: () => 120,
    getOffsetForIndex: () => [120, 'end'] as const,
    measureElement: vi.fn(),
  }),
}));

describe('MessageList auto-scroll lifecycle', () => {
  beforeEach(() => {
    scrollToMock.mockClear();
    requestAnimationFrameMock.mockClear();
    cancelAnimationFrameMock.mockClear();

    requestAnimationFrameMock.mockReturnValue(1);
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: requestAnimationFrameMock,
    });
    Object.defineProperty(window, 'cancelAnimationFrame', {
      configurable: true,
      value: cancelAnimationFrameMock,
    });
    Object.defineProperty(HTMLDivElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollToMock,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('cancels pending auto-scroll frames when the list unmounts', () => {
    const { unmount } = render(
      <MessageActionsProvider>
        <MessageList
          messages={[createMessage('message-1')]}
          isThinking={false}
          streamingMessageId={null}
          activeConversationId="conv-1"
        />
      </MessageActionsProvider>,
    );

    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1);

    unmount();

    expect(cancelAnimationFrameMock).toHaveBeenCalledWith(1);
    expect(scrollToMock).not.toHaveBeenCalled();
  });
});

function createMessage(id: string): Message {
  return {
    id,
    role: 'assistant',
    content: 'Hello',
    timestamp: 1_717_200_000_000,
  };
}
