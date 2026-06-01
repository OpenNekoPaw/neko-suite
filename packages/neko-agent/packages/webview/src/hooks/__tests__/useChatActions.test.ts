import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { useChatActions } from '../useChatActions';

const vscodeMocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  invokeSlashCommand: vi.fn(),
  cancelMessage: vi.fn(),
}));

vi.mock('@/components/hooks/useVSCode', () => ({
  VSCodeMessages: {
    sendMessage: vscodeMocks.sendMessage,
    invokeSlashCommand: vscodeMocks.invokeSlashCommand,
    cancelMessage: vscodeMocks.cancelMessage,
  },
}));

describe('useChatActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes direct builtin slash commands without persisting them as chat messages', () => {
    const setMessages = vi.fn();
    const setIsThinking = vi.fn();
    const setStreamingMessageId = vi.fn();
    const setActiveTab = vi.fn();
    const clearInput = vi.fn();
    const setAttachedFiles = vi.fn();

    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>('conv-1');
      const streamingMessageIdRef = useRef<string | null>(null);
      return useChatActions({
        inputValue: '/as @小明 --consult hello',
        isThinking: false,
        selectedModel: 'model-a',
        activeConversationId: 'conv-1',
        activeConversationIdRef,
        streamingMessageIdRef,
        messages: [],
        setMessages,
        setIsThinking,
        setStreamingMessageId,
        setActiveTab,
        clearInput,
        setAttachedFiles,
      });
    });

    act(() => {
      result.current.handleSend();
    });

    expect(vscodeMocks.invokeSlashCommand).toHaveBeenCalledWith(
      'as',
      '@小明 --consult hello',
      'conv-1',
    );
    expect(vscodeMocks.sendMessage).not.toHaveBeenCalled();
    expect(setMessages).not.toHaveBeenCalled();
    expect(setIsThinking).not.toHaveBeenCalled();
    expect(setStreamingMessageId).not.toHaveBeenCalled();
    expect(clearInput).toHaveBeenCalledTimes(1);
    expect(setAttachedFiles).toHaveBeenCalledWith([]);
  });

  it('sends unknown slash text as a normal chat message', () => {
    const setMessages = vi.fn();
    const setIsThinking = vi.fn();
    const setStreamingMessageId = vi.fn();
    const streamingMessageIdRef = { current: 'streaming-1' };

    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>('conv-1');
      return useChatActions({
        inputValue: '/not-a-builtin hello',
        isThinking: false,
        selectedModel: 'model-a',
        activeConversationId: 'conv-1',
        activeConversationIdRef,
        streamingMessageIdRef,
        messages: [],
        setMessages,
        setIsThinking,
        setStreamingMessageId,
        setActiveTab: vi.fn(),
        clearInput: vi.fn(),
        setAttachedFiles: vi.fn(),
      });
    });

    act(() => {
      result.current.handleSend();
    });

    expect(vscodeMocks.invokeSlashCommand).not.toHaveBeenCalled();
    expect(vscodeMocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        message: '/not-a-builtin hello',
        sessionMode: 'agent',
      }),
    );
    expect(setMessages).toHaveBeenCalledTimes(1);
    expect(setIsThinking).toHaveBeenCalledWith(true);
    expect(setStreamingMessageId).toHaveBeenCalledWith(null);
    expect(streamingMessageIdRef.current).toBeNull();
  });
});
