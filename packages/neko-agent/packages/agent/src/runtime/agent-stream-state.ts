import {
  extractCompositeContentBlocks,
  type AgentPhase,
  type ContentBlock,
  type Plan,
  type ToolCall,
} from '@neko-agent/types';
import type { AgentEvent } from '../session';
import { createPlanContentBlockFromToolResultData } from '../plan';
import { applyToolResultBackfillToResult } from './tool-result-backfill';

export interface CollectedToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: ToolCall['result'];
}

export interface AgentStreamProjectionState {
  accumulatedResponse: string;
  accumulatedThinking: string;
  hasError: boolean;
  errorMessage?: string;
  currentPhase: AgentPhase;
  collectedToolCalls: CollectedToolCall[];
  contentBlocks: ContentBlock[];
  currentTextBlockId: string | null;
  currentThinkingBlockId: string | null;
}

export interface AgentStreamStateUpdate {
  phaseChange?: {
    phase: AgentPhase;
    toolName?: string;
  };
  plan?: Plan;
}

export interface AgentStreamStateOptions {
  now?: () => number;
}

export interface AgentStreamMessageIdOptions {
  now?: () => number;
  randomSuffix?: () => string;
  prefix?: string;
}

export type AgentStreamWebviewMessage =
  | {
      type: 'streamThinking';
      conversationId: string;
      messageId: string;
      content?: string;
    }
  | {
      type: 'streamText';
      conversationId: string;
      messageId: string;
      content?: string;
    }
  | {
      type: 'toolCall';
      conversationId: string;
      messageId: string;
      toolCallId?: string;
      toolName?: string;
      arguments?: Record<string, unknown>;
    }
  | {
      type: 'toolResult';
      conversationId: string;
      messageId: string;
      toolCallId?: string;
      success?: boolean;
      data?: unknown;
      attachments?: import('@neko/shared').ToolResultAttachment[];
      perceptionCards?: import('@neko/shared').PerceptionCard[];
      backfillDiagnostics?: import('@neko/shared').ToolResultBackfillDiagnostic[];
      plan?: Plan;
    }
  | {
      type: 'toolResultBackfill';
      conversationId: string;
      messageId: string;
      toolCallId: string;
      dataPatch: Record<string, unknown>;
      attachments?: readonly import('@neko/shared').ToolResultAttachment[];
      perceptionCards?: readonly import('@neko/shared').PerceptionCard[];
      backfillDiagnostics?: readonly import('@neko/shared').ToolResultBackfillDiagnostic[];
    }
  | {
      type: 'toolConfirmation';
      conversationId: string;
      toolCallId?: string;
      toolName?: string;
      action?: string;
      description?: string;
      details?: Record<string, unknown>;
    }
  | {
      type: 'error';
      conversationId: string;
      message: string;
    }
  | {
      type: 'messageQueued';
      conversationId: string;
      content?: string;
    }
  | {
      type: 'streamComplete';
      conversationId: string;
      messageId: string;
    }
  | {
      type: 'contextTokenCount';
      conversationId: string;
      tokenCount: number;
    };

export interface ProjectAgentStreamEventToWebviewMessagesInput {
  conversationId: string;
  messageId: string;
  event: AgentEvent;
  plan?: Plan;
}

export function createAgentStreamProjectionState(): AgentStreamProjectionState {
  return {
    accumulatedResponse: '',
    accumulatedThinking: '',
    hasError: false,
    currentPhase: 'idle',
    collectedToolCalls: [],
    contentBlocks: [],
    currentTextBlockId: null,
    currentThinkingBlockId: null,
  };
}

export function createAgentStreamMessageId(options: AgentStreamMessageIdOptions = {}): string {
  const prefix = options.prefix ?? 'msg';
  const timestamp = options.now?.() ?? Date.now();
  const suffix = options.randomSuffix?.() ?? Math.random().toString(36).slice(2, 9);
  return `${prefix}-${timestamp}-${suffix}`;
}

export function projectAgentStreamEventToWebviewMessages(
  input: ProjectAgentStreamEventToWebviewMessagesInput,
): AgentStreamWebviewMessage[] {
  const { conversationId, messageId, event, plan } = input;

  switch (event.type) {
    case 'thinking_content':
      return [
        {
          type: 'streamThinking',
          conversationId,
          messageId,
          content: event.thinking,
        },
      ];
    case 'text':
    case 'text_delta':
      return [
        {
          type: 'streamText',
          conversationId,
          messageId,
          content: event.content,
        },
      ];
    case 'tool_call':
      return [
        {
          type: 'toolCall',
          conversationId,
          messageId,
          toolCallId: event.toolCall?.id,
          toolName: event.toolCall?.name,
          arguments: event.toolCall?.arguments,
        },
      ];
    case 'tool_result':
      return [
        {
          type: 'toolResult',
          conversationId,
          messageId,
          toolCallId: event.toolResult?.toolCallId,
          success: event.toolResult?.success,
          data: event.toolResult?.data,
          attachments: event.toolResult?.attachments,
          perceptionCards: event.toolResult?.perceptionCards,
          backfillDiagnostics: event.toolResult?.backfillDiagnostics,
          plan,
        },
      ];
    case 'tool_result_backfill':
      return event.toolResultBackfill
        ? [
            {
              type: 'toolResultBackfill',
              conversationId,
              messageId,
              toolCallId: event.toolResultBackfill.toolCallId,
              dataPatch: event.toolResultBackfill.dataPatch,
              attachments: event.toolResultBackfill.attachments,
              perceptionCards: event.toolResultBackfill.perceptionCards,
              backfillDiagnostics: event.toolResultBackfill.diagnostics,
            },
          ]
        : [];
    case 'tool_confirmation':
      return [
        {
          type: 'toolConfirmation',
          conversationId,
          toolCallId: event.toolConfirmation?.toolCall.id,
          toolName: event.toolConfirmation?.toolCall.name,
          action: event.toolConfirmation?.action,
          description: event.toolConfirmation?.description,
          details: event.toolConfirmation?.details,
        },
      ];
    case 'error':
      return [
        {
          type: 'error',
          conversationId,
          message: event.error?.message || 'An error occurred',
        },
      ];
    case 'messageQueued':
      return [
        {
          type: 'messageQueued',
          conversationId,
          content: event.content,
        },
      ];
    case 'done': {
      const messages: AgentStreamWebviewMessage[] = [
        {
          type: 'streamComplete',
          conversationId,
          messageId,
        },
      ];
      if (event.usage) {
        messages.push({
          type: 'contextTokenCount',
          conversationId,
          tokenCount: event.usage.totalTokens,
        });
      }
      return messages;
    }
    default:
      return [];
  }
}

export function applyAgentStreamEventToState(
  state: AgentStreamProjectionState,
  event: AgentEvent,
  options: AgentStreamStateOptions = {},
): AgentStreamStateUpdate {
  switch (event.type) {
    case 'thinking_content':
      return applyThinkingContent(state, event.thinking ?? '', options);
    case 'text':
    case 'text_delta':
      return applyTextContent(state, event.content ?? '', options);
    case 'tool_call':
      return applyToolCall(state, event, options);
    case 'tool_result':
      return applyToolResult(state, event, options);
    case 'tool_result_backfill':
      return applyToolResultBackfill(state, event);
    case 'error':
      state.hasError = true;
      state.errorMessage = event.error?.message || 'An error occurred';
      return setPhase(state, 'idle');
    case 'done':
      return setPhase(state, 'idle');
    default:
      return {};
  }
}

export function finalizeAgentStreamProjectionState(
  state: AgentStreamProjectionState,
): AgentStreamProjectionState {
  const finalizedBlocks: ContentBlock[] = [];
  for (const block of state.contentBlocks) {
    if (block.type === 'text' && block.isStreaming) {
      finalizedBlocks.push(...finalizeTextContentBlock(block));
      continue;
    }
    if (block.type === 'thinking' && !block.isThinkingComplete) {
      block.isThinkingComplete = true;
    }
    finalizedBlocks.push(block);
  }

  state.contentBlocks = finalizedBlocks;
  state.accumulatedResponse = finalizedBlocks
    .filter((block) => block.type === 'text')
    .map((block) => block.content ?? '')
    .join('');
  state.currentTextBlockId = null;
  state.currentThinkingBlockId = null;
  return state;
}

function applyThinkingContent(
  state: AgentStreamProjectionState,
  thinking: string,
  options: AgentStreamStateOptions,
): AgentStreamStateUpdate {
  const phaseChange = setPhase(state, 'thinking').phaseChange;
  state.accumulatedThinking += thinking;

  const currentThinkingBlock = state.currentThinkingBlockId
    ? findContentBlock(state, state.currentThinkingBlockId)
    : undefined;
  if (currentThinkingBlock?.type === 'thinking') {
    currentThinkingBlock.thinking = (currentThinkingBlock.thinking ?? '') + thinking;
  } else {
    const block: ContentBlock = {
      id: `block-thinking-${getNow(options)}`,
      type: 'thinking',
      timestamp: getNow(options),
      thinking,
      isThinkingComplete: false,
    };
    state.contentBlocks.push(block);
    state.currentThinkingBlockId = block.id;
  }

  return phaseChange ? { phaseChange } : {};
}

function applyTextContent(
  state: AgentStreamProjectionState,
  content: string,
  options: AgentStreamStateOptions,
): AgentStreamStateUpdate {
  const phaseChange = setPhase(state, 'streaming').phaseChange;
  state.accumulatedResponse += content;

  const currentThinkingBlock = state.currentThinkingBlockId
    ? findContentBlock(state, state.currentThinkingBlockId)
    : undefined;
  if (currentThinkingBlock?.type === 'thinking') {
    currentThinkingBlock.isThinkingComplete = true;
    state.currentThinkingBlockId = null;
  }

  const currentTextBlock = state.currentTextBlockId
    ? findContentBlock(state, state.currentTextBlockId)
    : undefined;
  if (currentTextBlock?.type === 'text') {
    currentTextBlock.content = (currentTextBlock.content ?? '') + content;
  } else {
    const block: ContentBlock = {
      id: `block-text-${getNow(options)}`,
      type: 'text',
      timestamp: getNow(options),
      content,
      isStreaming: true,
    };
    state.contentBlocks.push(block);
    state.currentTextBlockId = block.id;
  }

  return phaseChange ? { phaseChange } : {};
}

function applyToolCall(
  state: AgentStreamProjectionState,
  event: AgentEvent,
  options: AgentStreamStateOptions,
): AgentStreamStateUpdate {
  const phaseChange = setPhase(state, 'acting', event.toolCall?.name).phaseChange;
  const currentTextBlock = state.currentTextBlockId
    ? findContentBlock(state, state.currentTextBlockId)
    : undefined;
  if (currentTextBlock?.type === 'text') {
    currentTextBlock.isStreaming = false;
    state.currentTextBlockId = null;
  }

  if (event.toolCall) {
    const toolCall: CollectedToolCall = {
      id: event.toolCall.id,
      name: event.toolCall.name,
      arguments: event.toolCall.arguments,
    };
    state.collectedToolCalls.push(toolCall);
    state.contentBlocks.push({
      id: `block-tool-${event.toolCall.id}`,
      type: 'tool_call',
      timestamp: getNow(options),
      toolCall,
    });
  }

  return phaseChange ? { phaseChange } : {};
}

function applyToolResult(
  state: AgentStreamProjectionState,
  event: AgentEvent,
  options: AgentStreamStateOptions,
): AgentStreamStateUpdate {
  if (!event.toolResult) return {};

  const result = {
    success: event.toolResult.success,
    data: event.toolResult.data,
    error: event.toolResult.error,
    ...(event.toolResult.attachments ? { attachments: event.toolResult.attachments } : {}),
    ...(event.toolResult.perceptionCards
      ? { perceptionCards: event.toolResult.perceptionCards }
      : {}),
    ...(event.toolResult.backfillDiagnostics
      ? { backfillDiagnostics: event.toolResult.backfillDiagnostics }
      : {}),
  };

  const collectedToolCall = state.collectedToolCalls.find(
    (toolCall) => toolCall.id === event.toolResult?.toolCallId,
  );
  if (collectedToolCall) {
    collectedToolCall.result = result;
  }

  const toolBlock = state.contentBlocks.find(
    (block) => block.type === 'tool_call' && block.toolCall?.id === event.toolResult?.toolCallId,
  );
  if (toolBlock?.toolCall) {
    toolBlock.toolCall.result = result;
  }

  const planProjection = createPlanContentBlockFromToolResultData(event.toolResult.data, {
    now: options.now,
  });
  if (!planProjection) return {};

  state.contentBlocks.push(planProjection.contentBlock);
  return { plan: planProjection.plan };
}

function applyToolResultBackfill(
  state: AgentStreamProjectionState,
  event: AgentEvent,
): AgentStreamStateUpdate {
  const payload = event.toolResultBackfill;
  if (!payload) return {};

  const collectedToolCall = state.collectedToolCalls.find(
    (toolCall) => toolCall.id === payload.toolCallId,
  );
  let mergedCollectedResult: ToolCall['result'] | undefined;

  if (collectedToolCall?.result) {
    mergedCollectedResult = applyToolResultBackfillToResult(
      collectedToolCall.result,
      payload,
    ).result;
    collectedToolCall.result = mergedCollectedResult;
  }

  const toolBlock = state.contentBlocks.find(
    (block) => block.type === 'tool_call' && block.toolCall?.id === payload.toolCallId,
  );
  if (toolBlock?.toolCall?.result) {
    toolBlock.toolCall.result =
      toolBlock.toolCall === collectedToolCall && mergedCollectedResult
        ? mergedCollectedResult
        : applyToolResultBackfillToResult(toolBlock.toolCall.result, payload).result;
  }

  return {};
}

function setPhase(
  state: AgentStreamProjectionState,
  phase: AgentPhase,
  toolName?: string,
): AgentStreamStateUpdate {
  if (state.currentPhase === phase) return {};

  state.currentPhase = phase;
  return { phaseChange: { phase, toolName } };
}

function findContentBlock(
  state: AgentStreamProjectionState,
  blockId: string,
): ContentBlock | undefined {
  return state.contentBlocks.find((block) => block.id === blockId);
}

function finalizeTextContentBlock(block: ContentBlock): ContentBlock[] {
  const content = block.content ?? '';
  const extracted = extractCompositeContentBlocks(content);
  const text = extracted.composites.length > 0 ? extracted.text : content;
  const nextBlocks: ContentBlock[] = [];
  if (text.length > 0) {
    nextBlocks.push({
      ...block,
      content: text,
      isStreaming: false,
    });
  }
  nextBlocks.push(
    ...extracted.composites.map((composite, index) => ({
      id: `${block.id}-composite-${index + 1}`,
      type: 'composite' as const,
      timestamp: block.timestamp,
      composite,
    })),
  );
  return nextBlocks;
}

function getNow(options: AgentStreamStateOptions): number {
  return options.now?.() ?? Date.now();
}
