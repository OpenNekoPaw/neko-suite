import type {
  AgentTurnTimelineCompletion,
  AgentTurnTimelineCompletionStatus,
  AgentTurnTimelineItem,
  AgentTurnTimelineItemStatus,
  AgentTurnTimelineOperation,
  AgentWorkItem,
  ContentBlock,
} from '@neko-agent/types';
import type { AgentEvent } from '../../session/types';
import { applyToolResultBackfillToResult } from '../tool-result-backfill';

export interface AgentTurnTimelineAccumulatorUpdate {
  readonly type: 'agentTurnTimelineUpdate';
  readonly conversationId: string;
  readonly turnId: string;
  readonly messageId: string;
  readonly operations: readonly AgentTurnTimelineOperation[];
  readonly completion?: AgentTurnTimelineCompletion;
}

export interface AgentTurnTimelineAccumulatorSnapshot {
  readonly conversationId: string;
  readonly turnId: string;
  readonly messageId: string;
  readonly items: readonly AgentTurnTimelineItem[];
  readonly completion?: AgentTurnTimelineCompletion;
}

export interface AgentTurnTimelineAccumulator {
  project(event: AgentEvent, eventTime: number): AgentTurnTimelineAccumulatorUpdate | null;
  projectWorkItem(workItem: AgentWorkItem): AgentTurnTimelineAccumulatorUpdate | null;
  complete(
    contentBlocks: readonly ContentBlock[],
    status?: AgentTurnTimelineCompletionStatus,
  ): AgentTurnTimelineAccumulatorUpdate | null;
  snapshot(): AgentTurnTimelineAccumulatorSnapshot;
  dispose(): void;
}

export function createAgentTurnTimelineAccumulator(input: {
  readonly conversationId: string;
  readonly messageId: string;
  readonly now?: () => number;
}): AgentTurnTimelineAccumulator {
  const turnId = `turn-${input.messageId}`;
  let sequence = 0;
  let activeTextItem: Extract<AgentTurnTimelineItem, { readonly kind: 'assistant_text' }> | null =
    null;
  let activeThinkingItem: Extract<AgentTurnTimelineItem, { readonly kind: 'thinking' }> | null =
    null;
  const toolItemsByToolCallId = new Map<
    string,
    Extract<AgentTurnTimelineItem, { readonly kind: 'tool_call' }>
  >();
  const workItemsById = new Map<string, AgentTurnTimelineItem>();
  const items = new Map<string, AgentTurnTimelineItem>();
  let completion: AgentTurnTimelineCompletion | undefined;
  let lifecycle: 'active' | 'completed' | 'disposed' = 'active';

  const nextSequence = (): number => {
    sequence += 1;
    return sequence;
  };
  const completeTextItems = (eventTime: number): AgentTurnTimelineOperation[] => {
    const operations: AgentTurnTimelineOperation[] = [];
    if (activeTextItem) {
      const itemRevision = activeTextItem.itemRevision + 1;
      operations.push({
        operation: 'complete',
        itemId: activeTextItem.itemId,
        itemRevision,
        kind: 'assistant_text',
        sourceGeneration: activeTextItem.payload.sourceGeneration,
        status: 'complete',
        updatedAt: eventTime,
      });
      activeTextItem = null;
    }
    if (activeThinkingItem) {
      const itemRevision = activeThinkingItem.itemRevision + 1;
      operations.push({
        operation: 'complete',
        itemId: activeThinkingItem.itemId,
        itemRevision,
        kind: 'thinking',
        sourceGeneration: activeThinkingItem.payload.sourceGeneration,
        status: 'complete',
        updatedAt: eventTime,
      });
      activeThinkingItem = null;
    }
    return operations;
  };

  const completeThinking = (eventTime: number): AgentTurnTimelineOperation[] => {
    if (!activeThinkingItem) return [];
    const operation: AgentTurnTimelineOperation = {
      operation: 'complete',
      itemId: activeThinkingItem.itemId,
      itemRevision: activeThinkingItem.itemRevision + 1,
      kind: 'thinking',
      sourceGeneration: activeThinkingItem.payload.sourceGeneration,
      status: 'complete',
      updatedAt: eventTime,
    };
    activeThinkingItem = null;
    return [operation];
  };

  const buildUpdate = (
    operations: readonly AgentTurnTimelineOperation[],
    nextCompletion?: AgentTurnTimelineCompletion,
  ): AgentTurnTimelineAccumulatorUpdate | null => {
    if (operations.length === 0 && !nextCompletion) return null;
    applyOperationsToAuthoritativeItems(items, operations);
    if (nextCompletion) completion = cloneValue(nextCompletion);
    return {
      type: 'agentTurnTimelineUpdate',
      conversationId: input.conversationId,
      turnId,
      messageId: input.messageId,
      operations: operations.map((operation) => cloneValue(operation)),
      ...(nextCompletion ? { completion: cloneValue(nextCompletion) } : {}),
    };
  };

  return {
    project(event, eventTime) {
      assertActive(lifecycle);
      switch (event.type) {
        case 'assistant_text_replacement': {
          const operations = completeThinking(eventTime);
          if (activeTextItem) {
            activeTextItem = {
              ...activeTextItem,
              itemRevision: activeTextItem.itemRevision + 1,
              status: 'streaming',
              payload: {
                ...activeTextItem.payload,
                content: '',
                sourceGeneration: activeTextItem.payload.sourceGeneration + 1,
              },
              updatedAt: eventTime,
            };
          } else {
            activeTextItem = {
              conversationId: input.conversationId,
              turnId,
              messageId: input.messageId,
              itemId: `text-${nextSequence()}`,
              sequence,
              itemRevision: 1,
              kind: 'assistant_text',
              status: 'streaming',
              payload: { content: '', format: 'markdown', sourceGeneration: 1 },
              createdAt: eventTime,
              updatedAt: eventTime,
            };
          }
          operations.push({ operation: 'replace', item: activeTextItem });
          return buildUpdate(operations);
        }
        case 'thinking_content': {
          const delta = event.thinking ?? '';
          if (activeThinkingItem) {
            activeThinkingItem = {
              ...activeThinkingItem,
              itemRevision: activeThinkingItem.itemRevision + 1,
              payload: {
                ...activeThinkingItem.payload,
                content: `${activeThinkingItem.payload.content}${delta}`,
              },
              updatedAt: eventTime,
            };
          } else {
            activeThinkingItem = {
              conversationId: input.conversationId,
              turnId,
              messageId: input.messageId,
              itemId: `thinking-${nextSequence()}`,
              sequence,
              itemRevision: 1,
              kind: 'thinking',
              status: 'streaming',
              payload: { content: delta, sourceGeneration: 1 },
              createdAt: eventTime,
              updatedAt: eventTime,
            };
          }
          return buildUpdate([
            {
              operation: 'append',
              item: {
                ...activeThinkingItem,
                payload: { ...activeThinkingItem.payload, content: delta },
              },
            },
          ]);
        }
        case 'text':
        case 'text_delta': {
          const operations = completeThinking(eventTime);
          const delta = event.content ?? '';
          if (activeTextItem) {
            activeTextItem = {
              ...activeTextItem,
              itemRevision: activeTextItem.itemRevision + 1,
              payload: {
                ...activeTextItem.payload,
                content: `${activeTextItem.payload.content}${delta}`,
              },
              updatedAt: eventTime,
            };
          } else {
            activeTextItem = {
              conversationId: input.conversationId,
              turnId,
              messageId: input.messageId,
              itemId: `text-${nextSequence()}`,
              sequence,
              itemRevision: 1,
              kind: 'assistant_text',
              status: 'streaming',
              payload: { content: delta, format: 'markdown', sourceGeneration: 1 },
              createdAt: eventTime,
              updatedAt: eventTime,
            };
          }
          operations.push({
            operation: 'append',
            item: {
              ...activeTextItem,
              payload: { ...activeTextItem.payload, content: delta },
            },
          });
          return buildUpdate(operations);
        }
        case 'tool_call': {
          const operations = completeTextItems(eventTime);
          const toolCall = event.toolCall;
          if (!toolCall) return buildUpdate(operations);
          const item: Extract<AgentTurnTimelineItem, { readonly kind: 'tool_call' }> = {
            conversationId: input.conversationId,
            turnId,
            messageId: input.messageId,
            itemId: `tool-${toolCall.id}`,
            sequence: nextSequence(),
            itemRevision: 1,
            kind: 'tool_call',
            status: 'pending',
            payload: { toolCall },
            createdAt: eventTime,
            updatedAt: eventTime,
          };
          toolItemsByToolCallId.set(toolCall.id, cloneValue(item));
          operations.push({ operation: 'upsert', item });
          return buildUpdate(operations);
        }
        case 'tool_result': {
          const result = event.toolResult;
          if (!result?.toolCallId) return null;
          const existingItem = toolItemsByToolCallId.get(result.toolCallId);
          if (!existingItem) return null;
          const existingToolCall = existingItem.payload.toolCall;
          const item: typeof existingItem = {
            ...existingItem,
            itemRevision: existingItem.itemRevision + 1,
            status: result.success ? 'succeeded' : 'failed',
            payload: {
              toolCall: {
                id: result.toolCallId,
                name: existingToolCall.name,
                arguments: existingToolCall.arguments,
                result: {
                  success: result.success,
                  data: result.data,
                  error: result.error,
                  ...(result.attachments ? { attachments: result.attachments } : {}),
                  ...(result.perceptionCards ? { perceptionCards: result.perceptionCards } : {}),
                  ...(result.backfillDiagnostics
                    ? { backfillDiagnostics: result.backfillDiagnostics }
                    : {}),
                  ...(result.artifacts ? { artifacts: result.artifacts } : {}),
                },
              },
            },
            updatedAt: eventTime,
          };
          toolItemsByToolCallId.set(result.toolCallId, cloneValue(item));
          return buildUpdate([{ operation: 'upsert', item }]);
        }
        case 'tool_result_backfill': {
          const backfill = event.toolResultBackfill;
          if (!backfill?.toolCallId) return null;
          const existingItem = toolItemsByToolCallId.get(backfill.toolCallId);
          if (!existingItem) return null;
          const mergedResult = applyToolResultBackfillToResult(
            existingItem.payload.toolCall.result,
            backfill,
          );
          const item: typeof existingItem = {
            ...existingItem,
            itemRevision: existingItem.itemRevision + 1,
            status: mergedResult.result.success ? 'succeeded' : 'failed',
            payload: {
              toolCall: { ...existingItem.payload.toolCall, result: mergedResult.result },
            },
            updatedAt: eventTime,
          };
          toolItemsByToolCallId.set(backfill.toolCallId, cloneValue(item));
          return buildUpdate([{ operation: 'upsert', item }]);
        }
        case 'tool_confirmation': {
          const toolCall = event.toolConfirmation?.toolCall;
          if (!toolCall?.id) return null;
          const existingItem = toolItemsByToolCallId.get(toolCall.id);
          if (!existingItem) return null;
          const item: typeof existingItem = {
            ...existingItem,
            itemRevision: existingItem.itemRevision + 1,
            status: 'pending',
            payload: {
              toolCall: {
                ...existingItem.payload.toolCall,
                pendingConfirmation: true,
                confirmation: {
                  action: event.toolConfirmation?.action ?? '',
                  description: event.toolConfirmation?.description ?? '',
                  details: event.toolConfirmation?.details ?? {},
                },
              },
            },
            updatedAt: eventTime,
          };
          toolItemsByToolCallId.set(toolCall.id, cloneValue(item));
          return buildUpdate([{ operation: 'upsert', item }]);
        }
        case 'error': {
          const operations = completeTextItems(eventTime);
          const errorCode = readErrorCode(event.error);
          const errorDetails = readErrorDetails(event.error);
          const item: Extract<AgentTurnTimelineItem, { readonly kind: 'error' }> = {
            conversationId: input.conversationId,
            turnId,
            messageId: input.messageId,
            itemId: `error-${nextSequence()}`,
            sequence,
            itemRevision: 1,
            kind: 'error',
            status: 'failed',
            payload: {
              message: event.error?.message ?? 'An error occurred',
              ...(errorCode ? { code: errorCode } : {}),
              ...(errorDetails ? { details: errorDetails } : {}),
            },
            createdAt: eventTime,
            updatedAt: eventTime,
          };
          operations.push({ operation: 'upsert', item });
          return buildUpdate(operations);
        }
        case 'done':
          return null;
        default:
          return null;
      }
    },
    complete(contentBlocks, status = 'completed') {
      assertActive(lifecycle);
      const eventTime = input.now?.() ?? Date.now();
      const update = buildUpdate(completeTextItems(eventTime), {
        status,
        completedAt: eventTime,
        ...(contentBlocks.length > 0 ? { finalContentBlocks: contentBlocks } : {}),
      });
      lifecycle = 'completed';
      return update;
    },
    projectWorkItem(workItem) {
      assertActive(lifecycle);
      const eventTime = input.now?.() ?? Date.now();
      const existing = workItemsById.get(workItem.id);
      const sequenceValue = existing?.sequence ?? nextSequence();
      const core = {
        conversationId: input.conversationId,
        turnId,
        messageId: input.messageId,
        itemId: `${workItem.kind}-${workItem.id}`,
        sequence: sequenceValue,
        itemRevision: (existing?.itemRevision ?? 0) + 1,
        status: toTimelineStatus(workItem.status),
        createdAt: existing?.createdAt ?? eventTime,
        updatedAt: eventTime,
      };
      const anchor = workItem.parentToolCallId
        ? { parentAnchor: 'tool_call' as const, parentToolCallId: workItem.parentToolCallId }
        : { parentAnchor: 'turn' as const };
      const item: AgentTurnTimelineItem =
        workItem.kind === 'media-task'
          ? { ...core, ...anchor, kind: 'media', payload: { workItem } }
          : { ...core, ...anchor, kind: 'task', payload: { workItem } };
      workItemsById.set(workItem.id, cloneValue(item));
      return buildUpdate([{ operation: 'upsert', item }]);
    },
    snapshot() {
      if (lifecycle === 'disposed') {
        throw new Error('Agent Timeline accumulator is disposed.');
      }
      return {
        conversationId: input.conversationId,
        turnId,
        messageId: input.messageId,
        items: Array.from(items.values())
          .sort((left, right) => left.sequence - right.sequence)
          .map((item) => cloneTimelineItem(item)),
        ...(completion ? { completion: cloneValue(completion) } : {}),
      };
    },
    dispose() {
      lifecycle = 'disposed';
      activeTextItem = null;
      activeThinkingItem = null;
      toolItemsByToolCallId.clear();
      workItemsById.clear();
      items.clear();
      completion = undefined;
    },
  };
}

function assertActive(lifecycle: 'active' | 'completed' | 'disposed'): void {
  if (lifecycle !== 'active') {
    throw new Error(`Agent Timeline accumulator rejects mutation after ${lifecycle}.`);
  }
}

function applyOperationsToAuthoritativeItems(
  items: Map<string, AgentTurnTimelineItem>,
  operations: readonly AgentTurnTimelineOperation[],
): void {
  for (const operation of operations) {
    if (operation.operation === 'complete') {
      const current = items.get(operation.itemId);
      if (!current || (current.kind !== 'assistant_text' && current.kind !== 'thinking')) {
        throw new Error(`Timeline completion references unknown text item: ${operation.itemId}`);
      }
      items.set(operation.itemId, {
        ...current,
        itemRevision: operation.itemRevision,
        status: operation.status,
        updatedAt: operation.updatedAt,
      });
      continue;
    }
    const item = operation.item;
    const current = items.get(item.itemId);
    if (operation.operation === 'append' && current) {
      if (current.kind === 'assistant_text' && item.kind === 'assistant_text') {
        items.set(item.itemId, {
          ...item,
          createdAt: current.createdAt,
          sequence: current.sequence,
          payload: { ...item.payload, content: current.payload.content + item.payload.content },
        });
        continue;
      }
      if (current.kind === 'thinking' && item.kind === 'thinking') {
        items.set(item.itemId, {
          ...item,
          createdAt: current.createdAt,
          sequence: current.sequence,
          payload: { ...item.payload, content: current.payload.content + item.payload.content },
        });
        continue;
      }
      throw new Error(`Timeline append changed item kind: ${item.itemId}`);
    }
    items.set(item.itemId, cloneTimelineItem(item));
  }
}

function cloneTimelineItem(item: AgentTurnTimelineItem): AgentTurnTimelineItem {
  return cloneValue(item);
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function toTimelineStatus(status: AgentWorkItem['status']): AgentTurnTimelineItemStatus {
  switch (status) {
    case 'completed':
      return 'succeeded';
    case 'failed':
    case 'cancelled':
      return 'failed';
    case 'queued':
    case 'processing':
      return 'pending';
  }
}

function readErrorCode(error: AgentEvent['error']): string | undefined {
  if (!isRecord(error)) return undefined;
  const code = error['code'];
  return typeof code === 'string' && code.length > 0 ? code : undefined;
}

function readErrorDetails(error: AgentEvent['error']): Record<string, unknown> | undefined {
  if (!isRecord(error)) return undefined;
  const context = error['context'];
  return isRecord(context) ? context : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
