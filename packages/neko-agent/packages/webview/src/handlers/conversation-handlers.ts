/**
 * Conversation Message Handlers
 *
 * Handles: conversationList, activeConversation, historyCleared, error
 */

import type { MessageHandler, HandlerRegistration } from './types';
import type { OpenTab, Message } from '@/components/types';
import type { BackgroundTask } from '@/components/TaskListView';
import {
  IMAGE_GENERATION_TOOLS,
  VIDEO_GENERATION_TOOLS,
  AUDIO_GENERATION_TOOLS,
} from '@/components/ChatView/ToolCallDisplay/tool-constants';

/**
 * Derive backgroundTaskIds for each message from its contentBlocks.
 *
 * When conversations are restored from storage, backgroundTaskIds is not
 * persisted in ConversationMessage. However, tool_call contentBlocks that
 * resulted in background tasks contain { backgroundMode: true, taskId } in
 * their result data, so we can reconstruct the linkage here.
 */
function deriveBackgroundTaskIds(messages: Message[]): Message[] {
  return messages.map((msg) => {
    if (!msg.contentBlocks || msg.contentBlocks.length === 0) return msg;

    const taskIds: string[] = [];
    for (const block of msg.contentBlocks) {
      if (block.type !== 'tool_call' || !block.toolCall?.result?.data) continue;
      const data = block.toolCall.result.data as Record<string, unknown>;
      if (data.backgroundMode !== true) continue;

      if (data.batchMode === true && Array.isArray(data.taskIds)) {
        taskIds.push(...(data.taskIds as string[]));
      } else if (typeof data.taskId === 'string') {
        taskIds.push(data.taskId);
      }
    }

    if (taskIds.length === 0) return msg;
    return { ...msg, backgroundTaskIds: taskIds };
  });
}

/**
 * Infer BackgroundTask type from tool name or stored task type string.
 */
function inferTaskType(
  toolName: string,
  data: Record<string, unknown>,
): 'image' | 'video' | 'audio' {
  if (IMAGE_GENERATION_TOOLS.includes(toolName)) return 'image';
  if (VIDEO_GENERATION_TOOLS.includes(toolName)) return 'video';
  if (AUDIO_GENERATION_TOOLS.includes(toolName)) return 'audio';
  // Fallback: check taskType stored in result data
  const taskType = data.taskType as string | undefined;
  if (taskType?.includes('video')) return 'video';
  if (taskType?.includes('audio') || taskType?.includes('music')) return 'audio';
  return 'image';
}

/**
 * Reconstruct completed background tasks from persisted contentBlocks.
 *
 * When conversations are restored from storage, the webview's `tasks` state
 * (BackgroundTask[]) is lost because it is populated only via live
 * taskCreated/taskUpdated messages. However, once a task completes,
 * `updateToolResultWithUrls` writes { status: 'completed', urls, localPaths }
 * into the contentBlocks tool result, giving us everything needed to
 * reconstruct the TaskCard display for completed tasks.
 *
 * Note: `urls` in result.data are already webview URIs at this point
 * because convertMessagesForWebview ran before this data reached the webview.
 */
function rehydrateBackgroundTasks(messages: Message[]): BackgroundTask[] {
  const tasks: BackgroundTask[] = [];

  for (const msg of messages) {
    if (!msg.contentBlocks || msg.contentBlocks.length === 0) continue;

    for (const block of msg.contentBlocks) {
      if (block.type !== 'tool_call' || !block.toolCall?.result?.data) continue;

      const data = block.toolCall.result.data as Record<string, unknown>;
      if (data.backgroundMode !== true || data.status !== 'completed') continue;

      const taskId = data.taskId;
      if (typeof taskId !== 'string') continue;

      // Collect URLs (already webview URIs from convertMessagesForWebview)
      const urls: string[] = [];
      if (Array.isArray(data.urls)) {
        for (const u of data.urls) {
          if (typeof u === 'string') urls.push(u);
        }
      } else if (typeof data.url === 'string') {
        urls.push(data.url);
      }
      if (urls.length === 0) continue;

      const localPaths = Array.isArray(data.localPaths)
        ? (data.localPaths as string[]).filter((p): p is string => typeof p === 'string')
        : undefined;

      const type = inferTaskType(block.toolCall.name, data);

      // prompt: prefer stored field, fall back to tool argument
      const prompt =
        typeof data.prompt === 'string'
          ? data.prompt
          : typeof (block.toolCall.arguments as Record<string, unknown> | undefined)?.prompt ===
              'string'
            ? String((block.toolCall.arguments as Record<string, unknown>).prompt)
            : '';

      tasks.push({
        id: taskId,
        type,
        name: typeof data.name === 'string' ? data.name : prompt,
        prompt,
        providerId: typeof data.providerId === 'string' ? data.providerId : '',
        providerName: typeof data.providerName === 'string' ? data.providerName : '',
        status: 'completed',
        progress: 100,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        result: {
          urls,
          localPaths,
          thumbnailUrl: urls[0],
        },
      });
    }
  }

  return tasks;
}

/**
 * Handle 'error' message - Error occurred
 */
const handleError: MessageHandler = (message, context) => {
  const errorMsg = message.message || 'An error occurred';
  if (context.isCurrentConversation(message.conversationId)) {
    context.setIsThinking(false);
    context.setStreamingMessageId(null);
    context.setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        role: 'assistant',
        content: errorMsg,
        timestamp: Date.now(),
        isError: true,
      },
    ]);
  } else if (message.conversationId) {
    context.updateNonCurrentConversation(message.conversationId, (msgs, _streaming) => ({
      messages: [
        ...msgs,
        {
          id: Date.now().toString(),
          role: 'assistant' as const,
          content: errorMsg,
          timestamp: Date.now(),
          isError: true,
        },
      ],
      streaming: { streamingMessageId: null, isThinking: false },
    }));
  }
};

/**
 * Handle 'historyCleared' message - Conversation cleared
 */
const handleHistoryCleared: MessageHandler = (_message, context) => {
  context.setMessages([]);
  context.setStreamingMessageId(null);
  context.setIsThinking(false);
  // Also clear the Map for current conversation
  if (context.activeConversationIdRef.current) {
    context.conversationMessagesRef.current.delete(context.activeConversationIdRef.current);
    context.conversationStreamingRef.current.delete(context.activeConversationIdRef.current);
  }
};

/**
 * Handle 'conversationList' message - List of conversations
 */
const handleConversationList: MessageHandler = (message, context) => {
  context.setConversations(message.conversations || []);
};

/**
 * Handle 'activeConversation' message - Active conversation changed
 */
const handleActiveConversation: MessageHandler = (message, context) => {
  if (message.conversation) {
    const convId = message.conversation.id;

    // Check if we have cached state for this conversation (preserves streaming state)
    const cachedMessages = context.conversationMessagesRef.current.get(convId);
    const cachedStreaming = context.conversationStreamingRef.current.get(convId);

    if (cachedMessages && cachedMessages.length > 0) {
      // Restore from cache - preserves streaming state
      context.setMessages(cachedMessages);
      context.setStreamingMessageId(cachedStreaming?.streamingMessageId || null);
      context.setIsThinking(cachedStreaming?.isThinking || false);
    } else {
      // New conversation or no cache - load from server
      // Reconstruct backgroundTaskIds from contentBlocks tool results
      const messagesToUse = deriveBackgroundTaskIds(message.conversation.messages || []);
      context.setMessages(messagesToUse);
      context.setStreamingMessageId(null);
      context.setIsThinking(false);
      // Restore completed background tasks so TaskCard can display images after reload
      const rehydratedTasks = rehydrateBackgroundTasks(messagesToUse);
      if (rehydratedTasks.length > 0) {
        context.setBackgroundTasks((prev) => {
          // Merge: keep live tasks that are not yet completed, add rehydrated completed ones
          const liveIds = new Set(prev.map((t) => t.id));
          const newTasks = rehydratedTasks.filter((t) => !liveIds.has(t.id));
          return newTasks.length > 0 ? [...prev, ...newTasks] : prev;
        });
      }
    }

    context.setActiveConversationId(convId);

    const existingTab = context.openTabs.find((t) => t.conversationId === message.conversation.id);
    if (!existingTab) {
      const newTab: OpenTab = {
        id: `tab-${Date.now()}`,
        title: message.conversation.title || 'New Chat',
        conversationId: message.conversation.id,
      };
      context.setOpenTabs((prev) => [...prev, newTab]);
      context.setActiveTabId(newTab.id);
    } else {
      context.setActiveTabId(existingTab.id);
    }
    context.setActiveTab('chat');
  } else {
    // Reset streaming state
    context.setStreamingMessageId(null);
    context.setIsThinking(false);

    context.setMessages([]);
    context.setActiveConversationId(null);
  }
};

/**
 * All conversation handler registrations
 */
export const conversationHandlers: HandlerRegistration[] = [
  { type: 'error', handler: handleError },
  { type: 'historyCleared', handler: handleHistoryCleared },
  { type: 'conversationList', handler: handleConversationList },
  { type: 'activeConversation', handler: handleActiveConversation },
];
