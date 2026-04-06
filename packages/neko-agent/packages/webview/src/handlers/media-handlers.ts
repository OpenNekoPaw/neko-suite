/**
 * Media Task Message Handlers
 *
 * Handles: mediaTaskCreated, mediaTaskProgress
 *
 * Maps MediaTask (platform type, from extension) to BackgroundTask (webview type).
 * On creation: adds task + synthetic assistant message + stops thinking indicator.
 * On progress: updates task in backgroundTasks (TaskCard re-renders automatically).
 */

import type { MessageHandler, HandlerRegistration } from './types';
import type { BackgroundTask, TaskStatus, TaskType } from '@/components/TaskListView';

// ---------------------------------------------------------------------------
// MediaTask (shape coming from extension postMessage)
// Mirrors platform MediaTask — only the fields we need.
// ---------------------------------------------------------------------------

interface MediaOutput {
  url: string;
  width?: number;
  height?: number;
  duration?: number;
  thumbnailUrl?: string;
}

interface MediaAdapterError {
  code: string;
  message: string;
}

interface MediaTask {
  id: string;
  type: string; // 'image' | 'video' | 'audio'
  status: string; // 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
  progress: number;
  providerId: string;
  modelId: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  outputs?: MediaOutput[];
  error?: MediaAdapterError;
  request: {
    prompt: string;
  };
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function toTaskType(mediaType: string): TaskType {
  if (mediaType === 'video') return 'video';
  return 'image'; // 'image' and 'audio' both map to 'image' card
}

function toTaskStatus(mediaStatus: string): TaskStatus {
  switch (mediaStatus) {
    case 'pending':
      return 'queued';
    case 'processing':
      return 'processing';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'queued';
  }
}

function toDateString(value: string | Date): string {
  if (typeof value === 'string') return value;
  return value.toISOString();
}

function mediaTaskToBackgroundTask(task: MediaTask): BackgroundTask {
  const outputs = task.outputs ?? [];
  const firstOutput = outputs[0];

  const result: BackgroundTask['result'] =
    firstOutput !== undefined
      ? {
          urls: outputs.map((o) => o.url).filter(Boolean),
          thumbnailUrl: firstOutput.thumbnailUrl,
          width: firstOutput.width,
          height: firstOutput.height,
          duration: firstOutput.duration,
        }
      : undefined;

  const promptText = task.request.prompt;
  const name = promptText.length > 50 ? `${promptText.slice(0, 47)}...` : promptText;

  return {
    id: task.id,
    type: toTaskType(task.type),
    name,
    prompt: promptText,
    providerId: task.providerId,
    providerName: task.modelId,
    status: toTaskStatus(task.status),
    progress: task.progress,
    createdAt: toDateString(task.createdAt),
    updatedAt: toDateString(task.updatedAt),
    result,
    error: task.error?.message,
  };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * Handle 'mediaTaskCreated' — task just submitted to the provider.
 * Stops the thinking indicator, adds a BackgroundTask, and appends a
 * synthetic assistant message so the TaskCard renders inline.
 */
const handleMediaTaskCreated: MessageHandler = (message, context) => {
  const rawTask = message.task as MediaTask;
  const conversationId = message.conversationId as string | undefined;

  if (!rawTask) return;

  const task = mediaTaskToBackgroundTask(rawTask);

  // Stop thinking indicator (only for the active conversation)
  if (context.isCurrentConversation(conversationId)) {
    context.setIsThinking(false);
    context.setStreamingMessageId(null);

    // Add task to backgroundTasks list
    context.setBackgroundTasks((prev) => [...prev, task]);

    // Append synthetic assistant message that embeds the TaskCard
    context.setMessages((prev) => [
      ...prev,
      {
        id: `media-task-${task.id}`,
        role: 'assistant' as const,
        content: '',
        timestamp: Date.now(),
        backgroundTaskIds: [task.id],
      },
    ]);
  } else if (conversationId) {
    // Non-current conversation: update refs only
    context.setBackgroundTasks((prev) => [...prev, task]);
    context.updateNonCurrentConversation(conversationId, (messages, streaming) => ({
      messages: [
        ...messages,
        {
          id: `media-task-${task.id}`,
          role: 'assistant' as const,
          content: '',
          timestamp: Date.now(),
          backgroundTaskIds: [task.id],
        },
      ],
      streaming: { ...streaming, isThinking: false, streamingMessageId: null },
    }));
  }
};

/**
 * Handle 'mediaTaskProgress' — task status/progress updated.
 * Only updates backgroundTasks; TaskCard re-renders automatically.
 */
const handleMediaTaskProgress: MessageHandler = (message, context) => {
  const rawTask = message.task as MediaTask;
  if (!rawTask) return;

  const updated = mediaTaskToBackgroundTask(rawTask);

  context.setBackgroundTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
};

// ---------------------------------------------------------------------------
// Registrations
// ---------------------------------------------------------------------------

export const mediaHandlers: HandlerRegistration[] = [
  { type: 'mediaTaskCreated', handler: handleMediaTaskCreated },
  { type: 'mediaTaskProgress', handler: handleMediaTaskProgress },
];
