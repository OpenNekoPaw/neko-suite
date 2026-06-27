import type { Message, ToolCall } from '@neko-agent/types';
import type { ConversationRecord, ConversationSource } from './conversation-record';
import type { AgentHistoryWithToolContextMessage } from './history-hydration';
import { hydrateAgentHistoryWithToolResults } from './history-hydration';
import {
  sanitizeToolCallArgumentsForHistory,
  sanitizeToolResultFieldsForHistory,
} from './tool-result-sanitizer';

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
    if (message.isError) {
      continue;
    }

    const messageToolCalls = extractMessageToolCalls(message);
    if (message.role === 'assistant' && messageToolCalls.length > 0) {
      const toolCalls = messageToolCalls.map((toolCall) => ({
        id: toolCall.id,
        name: toolCall.name,
        arguments: sanitizeToolCallArgumentsForHistory(toolCall.arguments),
      }));

      const toolResults = messageToolCalls.flatMap((toolCall) => {
        if (!toolCall.result) {
          return [];
        }

        const sanitizedResult = sanitizeToolResultFieldsForHistory(toolCall.result);
        return [
          {
            callId: toolCall.id,
            success: toolCall.result.success,
            data: sanitizedResult.data,
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

function extractMessageToolCalls(message: Message): ToolCall[] {
  return (
    message.contentBlocks
      ?.map((block) => (block.type === 'tool_call' ? block.toolCall : undefined))
      .filter((toolCall): toolCall is ToolCall => toolCall !== undefined) ?? []
  );
}
