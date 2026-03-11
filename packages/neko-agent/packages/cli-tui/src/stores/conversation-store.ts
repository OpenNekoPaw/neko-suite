/**
 * Conversation Store
 *
 * Manages chat messages, streaming text delta accumulation,
 * tool call lifecycle, and todo items.
 */

import { create } from 'zustand';
import type { Message, ToolCallState, TodoItem } from '../types/state';

let messageCounter = 0;
function nextId(): string {
  return `msg-${++messageCounter}-${Date.now()}`;
}

export interface ConversationSlice {
  // State
  readonly messages: Message[];
  readonly currentDelta: string;
  readonly isStreaming: boolean;
  readonly currentThinking: string;

  // Actions
  addUserMessage: (content: string) => void;
  startAssistantMessage: () => void;
  appendDelta: (delta: string) => void;
  completeMessage: (content: string) => void;
  setThinking: (thinking: string) => void;
  addToolCall: (toolCall: { id: string; name: string; arguments: Record<string, unknown> }) => void;
  updateToolResult: (result: {
    toolCallId: string;
    success: boolean;
    data: unknown;
    error?: string;
  }) => void;
  updateTodos: (todos: TodoItem[]) => void;
  addError: (error: Error) => void;
  addSystemMessage: (content: string) => void;
  clearMessages: () => void;
}

export const useConversationStore = create<ConversationSlice>((set) => ({
  messages: [],
  currentDelta: '',
  isStreaming: false,
  currentThinking: '',

  addUserMessage: (content) => {
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: nextId(),
          role: 'user' as const,
          content,
          toolCalls: [],
          todos: [],
          timestamp: Date.now(),
        },
      ],
    }));
  },

  startAssistantMessage: () => {
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: nextId(),
          role: 'assistant' as const,
          content: '',
          toolCalls: [],
          todos: [],
          timestamp: Date.now(),
        },
      ],
      currentDelta: '',
      isStreaming: true,
      currentThinking: '',
    }));
  },

  appendDelta: (delta) => {
    set((state) => ({
      currentDelta: state.currentDelta + delta,
    }));
  },

  completeMessage: (content) => {
    set((state) => {
      const messages = [...state.messages];
      const last = messages[messages.length - 1];
      if (last?.role === 'assistant') {
        messages[messages.length - 1] = { ...last, content };
      }
      return { messages, currentDelta: '', isStreaming: false };
    });
  },

  setThinking: (thinking) => {
    set((state) => ({
      currentThinking: state.currentThinking + thinking,
    }));
  },

  addToolCall: (toolCall) => {
    set((state) => {
      const messages = [...state.messages];
      const last = messages[messages.length - 1];
      if (last?.role === 'assistant') {
        const tc: ToolCallState = {
          id: toolCall.id,
          name: toolCall.name,
          arguments: toolCall.arguments,
          status: 'running',
        };
        messages[messages.length - 1] = {
          ...last,
          toolCalls: [...last.toolCalls, tc],
        };
      }
      return { messages };
    });
  },

  updateToolResult: (result) => {
    set((state) => {
      const messages = [...state.messages];
      const last = messages[messages.length - 1];
      if (last?.role === 'assistant') {
        const toolCalls = last.toolCalls.map((tc) =>
          tc.id === result.toolCallId
            ? {
                ...tc,
                status: (result.success ? 'success' : 'error') as ToolCallState['status'],
                result: result.data,
                error: result.error,
              }
            : tc,
        );
        messages[messages.length - 1] = { ...last, toolCalls };
      }
      return { messages };
    });
  },

  updateTodos: (todos) => {
    set((state) => {
      const messages = [...state.messages];
      const last = messages[messages.length - 1];
      if (last?.role === 'assistant') {
        messages[messages.length - 1] = { ...last, todos };
      }
      return { messages };
    });
  },

  addError: (error) => {
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: nextId(),
          role: 'system' as const,
          content: `Error: ${error.message}`,
          toolCalls: [],
          todos: [],
          timestamp: Date.now(),
          isError: true,
        },
      ],
      isStreaming: false,
    }));
  },

  addSystemMessage: (content) => {
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: nextId(),
          role: 'system' as const,
          content,
          toolCalls: [],
          todos: [],
          timestamp: Date.now(),
          isError: false,
        },
      ],
    }));
  },

  clearMessages: () => {
    set({ messages: [], currentDelta: '', isStreaming: false, currentThinking: '' });
  },
}));
