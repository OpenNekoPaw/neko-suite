import type { Message } from '@neko-agent/types';
import type { ConversationRecord, ConversationSource } from './conversation-record';
import type { AgentHistoryWithToolContextMessage } from './history-hydration';
import { hydrateAgentHistoryWithToolResults } from './history-hydration';

export interface ConversationRecordProjectionConversation {
  id: string;
  title: string;
  messages: readonly Message[];
  createdAt: number;
  updatedAt: number;
}

export interface ConversationRecordSavePlanInput {
  conversation: ConversationRecordProjectionConversation | null | undefined;
  workDir: string | null | undefined;
  source?: ConversationSource;
  version?: ConversationRecord['version'];
}

export type ConversationRecordSavePlan =
  | {
      kind: 'skip';
      reason: 'missing-work-dir' | 'missing-conversation' | 'empty-conversation';
    }
  | {
      kind: 'save';
      record: ConversationRecord;
    };

export type AgentHistoryEntry = AgentHistoryWithToolContextMessage;

export function buildConversationRecordSavePlan(
  input: ConversationRecordSavePlanInput,
): ConversationRecordSavePlan {
  if (!input.workDir) {
    return { kind: 'skip', reason: 'missing-work-dir' };
  }

  if (!input.conversation) {
    return { kind: 'skip', reason: 'missing-conversation' };
  }

  if (input.conversation.messages.length === 0) {
    return { kind: 'skip', reason: 'empty-conversation' };
  }

  const messages = hydrateAgentHistoryWithToolResults(
    projectConversationMessagesToAgentHistory(input.conversation.messages),
  );

  return {
    kind: 'save',
    record: {
      id: input.conversation.id,
      version: input.version ?? 2,
      title: input.conversation.title,
      workDir: input.workDir,
      messages,
      createdAt: input.conversation.createdAt,
      updatedAt: input.conversation.updatedAt,
      source: input.source ?? 'extension',
    },
  };
}

export function projectConversationMessagesToAgentHistory(
  messages: readonly Message[],
): AgentHistoryEntry[] {
  const result: AgentHistoryEntry[] = [];

  for (const message of messages) {
    if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0) {
      const toolCalls = message.toolCalls.map((toolCall) => ({
        id: toolCall.id,
        name: toolCall.name,
        arguments: toolCall.arguments,
      }));

      const toolResults = message.toolCalls.flatMap((toolCall) => {
        if (!toolCall.result) {
          return [];
        }

        return [
          {
            callId: toolCall.id,
            success: toolCall.result.success,
            data: toolCall.result.data,
          },
        ];
      });

      result.push({
        role: message.role,
        content: message.content,
        toolCalls,
        ...(toolResults.length > 0 ? { toolResults } : {}),
      });
      continue;
    }

    result.push({
      role: message.role,
      content: message.content,
    });
  }

  return result;
}
