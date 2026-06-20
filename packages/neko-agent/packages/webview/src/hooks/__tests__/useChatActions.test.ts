import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { useChatActions } from '../useChatActions';

const vscodeMocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  invokeSlashCommand: vi.fn(),
  cancelMessage: vi.fn(),
}));

vi.mock('@/messages', () => ({
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
    const onUserMessageSent = vi.fn();

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
        onUserMessageSent,
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
    expect(onUserMessageSent).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      message: expect.objectContaining({
        role: 'user',
        content: '/not-a-builtin hello',
      }),
    });
  });

  it('does not send the stale active conversation while a foreground conversation is pending', () => {
    const setMessages = vi.fn();
    const setIsThinking = vi.fn();
    const setStreamingMessageId = vi.fn();
    const onUserMessageSent = vi.fn();

    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>('role-session-1');
      return useChatActions({
        inputValue: '你好',
        isThinking: false,
        selectedModel: 'model-a',
        activeConversationId: 'role-session-1',
        activeConversationIdRef,
        isConversationSwitching: true,
        streamingMessageIdRef: { current: null },
        messages: [],
        setMessages,
        setIsThinking,
        setStreamingMessageId,
        setActiveTab: vi.fn(),
        clearInput: vi.fn(),
        setAttachedFiles: vi.fn(),
        onUserMessageSent,
      });
    });

    act(() => {
      result.current.handleSend();
    });

    expect(vscodeMocks.sendMessage).not.toHaveBeenCalled();
    expect(setMessages).not.toHaveBeenCalled();
    expect(setIsThinking).not.toHaveBeenCalled();
    expect(setStreamingMessageId).not.toHaveBeenCalled();
    expect(onUserMessageSent).not.toHaveBeenCalled();
  });

  it('requests a conversation instead of dropping a send when no conversation is active', () => {
    const setMessages = vi.fn();
    const setIsThinking = vi.fn();
    const setStreamingMessageId = vi.fn();
    const ensureConversationForSend = vi.fn();

    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>(null);
      return useChatActions({
        inputValue: '从这里开始一个默认 Agent 对话',
        isThinking: false,
        selectedModel: 'model-a',
        activeConversationId: null,
        activeConversationIdRef,
        streamingMessageIdRef: { current: null },
        messages: [],
        setMessages,
        setIsThinking,
        setStreamingMessageId,
        setActiveTab: vi.fn(),
        clearInput: vi.fn(),
        setAttachedFiles: vi.fn(),
        ensureConversationForSend,
      });
    });

    act(() => {
      result.current.handleSend();
    });

    expect(ensureConversationForSend).toHaveBeenCalledWith({
      messageText: '从这里开始一个默认 Agent 对话',
      displayMessageText: '从这里开始一个默认 Agent 对话',
    });
    expect(vscodeMocks.sendMessage).not.toHaveBeenCalled();
    expect(setMessages).not.toHaveBeenCalled();
    expect(setIsThinking).not.toHaveBeenCalled();
    expect(setStreamingMessageId).not.toHaveBeenCalled();
  });

  it('requests a conversation for externally triggered sends when no conversation is active', () => {
    const ensureConversationForSend = vi.fn();

    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>(null);
      return useChatActions({
        inputValue: '',
        isThinking: false,
        selectedModel: 'model-a',
        activeConversationId: null,
        activeConversationIdRef,
        streamingMessageIdRef: { current: null },
        messages: [],
        setMessages: vi.fn(),
        setIsThinking: vi.fn(),
        setStreamingMessageId: vi.fn(),
        setActiveTab: vi.fn(),
        clearInput: vi.fn(),
        setAttachedFiles: vi.fn(),
        ensureConversationForSend,
      });
    });

    act(() => {
      result.current.triggerSend('Use this selected clip');
    });

    expect(ensureConversationForSend).toHaveBeenCalledWith({
      messageText: 'Use this selected clip',
      displayMessageText: 'Use this selected clip',
    });
    expect(vscodeMocks.sendMessage).not.toHaveBeenCalled();
  });

  it('sends builtin slash-looking text as role session content during character role sessions', () => {
    const setMessages = vi.fn();
    const setIsThinking = vi.fn();
    const setStreamingMessageId = vi.fn();

    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>('role-session-1');
      return useChatActions({
        inputValue: '/as @小明 --consult hello',
        isThinking: false,
        isCharacterRoleSession: true,
        selectedModel: 'model-a',
        activeConversationId: 'role-session-1',
        activeConversationIdRef,
        streamingMessageIdRef: { current: null },
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
        conversationId: 'role-session-1',
        message: '/as @小明 --consult hello',
        sessionMode: 'agent',
      }),
    );
    expect(setMessages).toHaveBeenCalledTimes(1);
    expect(setIsThinking).toHaveBeenCalledWith(true);
    expect(setStreamingMessageId).toHaveBeenCalledWith(null);
  });

  it('does not attach hidden mode context when sending a normal message', () => {
    const setMessages = vi.fn();
    const setIsThinking = vi.fn();
    const setStreamingMessageId = vi.fn();

    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>('conv-embody');
      return useChatActions({
        inputValue: '我现在应该知道天台的秘密吗？',
        isThinking: false,
        selectedModel: 'model-a',
        activeConversationId: 'conv-embody',
        activeConversationIdRef,
        streamingMessageIdRef: { current: null },
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

    expect(vscodeMocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-embody',
        message: '我现在应该知道天台的秘密吗？',
      }),
    );
    expect(vscodeMocks.sendMessage.mock.calls[0]?.[0]).not.toHaveProperty('contextPayloads');
  });

  it('keeps selected file references as local attachment previews while sending @path text', () => {
    const setMessages = vi.fn();
    const setIsThinking = vi.fn();
    const setStreamingMessageId = vi.fn();
    const setSelectedFileReferences = vi.fn();

    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>('conv-files');
      return useChatActions({
        inputValue: '',
        isThinking: false,
        selectedModel: 'model-a',
        activeConversationId: 'conv-files',
        activeConversationIdRef,
        streamingMessageIdRef: { current: null },
        messages: [],
        setMessages,
        setIsThinking,
        setStreamingMessageId,
        setActiveTab: vi.fn(),
        clearInput: vi.fn(),
        setAttachedFiles: vi.fn(),
        setSelectedFileReferences,
      });
    });

    act(() => {
      result.current.handleSend({
        messageText: '参考 @"assets/ref file.zip"',
        displayMessageText: '参考',
        fileReferences: [
          {
            id: 'file-ref:assets/ref file.zip',
            label: 'ref file.zip',
            path: 'assets/ref file.zip',
          },
        ],
      });
    });

    expect(setMessages).toHaveBeenCalledWith(expect.any(Function));
    const updater = setMessages.mock.calls[0]?.[0] as (messages: unknown[]) => unknown[];
    expect(updater([])).toEqual([
      expect.objectContaining({
        role: 'user',
        content: '参考',
        attachments: [
          expect.objectContaining({
            id: 'file-ref:assets/ref file.zip',
            name: 'ref file.zip',
            path: 'assets/ref file.zip',
            type: 'file',
          }),
        ],
      }),
    ]);
    expect(vscodeMocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-files',
        message: '参考 @"assets/ref file.zip"',
        attachments: [
          expect.objectContaining({
            id: 'file-ref:assets/ref file.zip',
            name: 'ref file.zip',
            path: 'assets/ref file.zip',
            type: 'file',
          }),
        ],
      }),
    );
    expect(setSelectedFileReferences).toHaveBeenCalledWith([]);
  });

  it('sends selected media file references as attachments for extension preprocessing', () => {
    const setMessages = vi.fn();
    const setIsThinking = vi.fn();
    const setStreamingMessageId = vi.fn();

    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>('conv-media');
      return useChatActions({
        inputValue: '',
        isThinking: false,
        selectedModel: 'model-a',
        activeConversationId: 'conv-media',
        activeConversationIdRef,
        streamingMessageIdRef: { current: null },
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
      result.current.handleSend({
        messageText: '参考 @assets/1.png @cases/1080P.mp4',
        displayMessageText: '参考',
        fileReferences: [
          {
            id: 'file-ref:assets/1.png',
            label: '1.png',
            path: 'assets/1.png',
            mediaType: 'image',
          },
          {
            id: 'file-ref:cases/1080P.mp4',
            label: '1080P.mp4',
            path: 'cases/1080P.mp4',
            mediaType: 'video',
          },
        ],
      });
    });

    expect(vscodeMocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-media',
        message: '参考 @assets/1.png @cases/1080P.mp4',
        attachments: [
          expect.objectContaining({
            id: 'file-ref:assets/1.png',
            name: '1.png',
            path: 'assets/1.png',
            type: 'image',
          }),
          expect.objectContaining({
            id: 'file-ref:cases/1080P.mp4',
            name: '1080P.mp4',
            path: 'cases/1080P.mp4',
            type: 'video',
          }),
        ],
      }),
    );
  });

  it('infers selected file reference attachment types from paths', () => {
    const setMessages = vi.fn();
    const setIsThinking = vi.fn();
    const setStreamingMessageId = vi.fn();

    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>('conv-video');
      return useChatActions({
        inputValue: '',
        isThinking: false,
        selectedModel: 'model-a',
        activeConversationId: 'conv-video',
        activeConversationIdRef,
        streamingMessageIdRef: { current: null },
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
      result.current.handleSend({
        messageText: '参考 @cases/1080P.mp4',
        displayMessageText: '参考',
        fileReferences: [
          {
            id: 'file-ref:cases/1080P.mp4',
            label: '1080P.mp4',
            path: 'cases/1080P.mp4',
          },
        ],
      });
    });

    const updater = setMessages.mock.calls[0]?.[0] as (messages: unknown[]) => unknown[];
    expect(updater([])).toEqual([
      expect.objectContaining({
        attachments: [
          expect.objectContaining({
            name: '1080P.mp4',
            path: 'cases/1080P.mp4',
            type: 'video',
          }),
        ],
      }),
    ]);
  });

  it('notifies user message sent for externally triggered sends', () => {
    const setMessages = vi.fn();
    const setIsThinking = vi.fn();
    const setStreamingMessageId = vi.fn();
    const setActiveTab = vi.fn();
    const onUserMessageSent = vi.fn();

    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>('conv-trigger');
      return useChatActions({
        inputValue: '',
        isThinking: false,
        selectedModel: 'model-a',
        activeConversationId: 'conv-trigger',
        activeConversationIdRef,
        streamingMessageIdRef: { current: null },
        messages: [],
        setMessages,
        setIsThinking,
        setStreamingMessageId,
        setActiveTab,
        clearInput: vi.fn(),
        setAttachedFiles: vi.fn(),
        onUserMessageSent,
      });
    });

    act(() => {
      result.current.triggerSend('Use this selected clip');
    });

    expect(onUserMessageSent).toHaveBeenCalledWith({
      conversationId: 'conv-trigger',
      message: expect.objectContaining({
        role: 'user',
        content: 'Use this selected clip',
      }),
    });
    expect(setActiveTab).toHaveBeenCalledWith('chat');
    expect(vscodeMocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-trigger',
        message: 'Use this selected clip',
      }),
    );
  });
});
