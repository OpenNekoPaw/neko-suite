import type {
  ChatMessage,
  IService,
  ServiceCallContext,
  ServiceOptions,
  ServiceResponse,
  StreamChunk,
} from '@neko/shared';

export type ScriptedServiceStep =
  | { readonly type: 'text'; readonly content: string }
  | {
      readonly type: 'tool_call';
      readonly id: string;
      readonly name: string;
      readonly arguments: Record<string, unknown>;
    }
  | { readonly type: 'error'; readonly message: string };

export interface ScriptedServiceOptions {
  readonly model?: string;
  readonly steps: readonly ScriptedServiceStep[];
  readonly streamCalls?: readonly (readonly ScriptedServiceStep[])[];
  readonly streamDelayMs?: number;
}

export function createScriptedService(options: ScriptedServiceOptions): IService {
  const model = options.model ?? 'mock-agent-harness-model';
  let streamCallIndex = 0;
  return {
    async chat(messages, serviceOptions, context) {
      return collectScriptedResponse(model, options.steps, messages, serviceOptions, context);
    },
    chatStream() {
      const steps = options.streamCalls?.[streamCallIndex] ?? options.steps;
      streamCallIndex += 1;
      return scriptedStepsToStream(steps, options.streamDelayMs);
    },
    async embed(texts) {
      return { embeddings: texts.map(() => []) };
    },
  };
}

async function collectScriptedResponse(
  model: string,
  steps: readonly ScriptedServiceStep[],
  _messages: ChatMessage[],
  _options?: ServiceOptions,
  _context?: ServiceCallContext,
): Promise<ServiceResponse> {
  const firstToolCall = steps.find((step) => step.type === 'tool_call');
  if (firstToolCall?.type === 'tool_call') {
    return {
      id: 'mock-tool-call-response',
      model,
      message: {
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: firstToolCall.id,
            type: 'function',
            function: {
              name: firstToolCall.name,
              arguments: JSON.stringify(firstToolCall.arguments),
            },
          },
        ],
      },
      finishReason: 'tool_calls',
    };
  }
  const content = steps
    .filter(
      (step): step is Extract<ScriptedServiceStep, { readonly type: 'text' }> =>
        step.type === 'text',
    )
    .map((step) => step.content)
    .join('');
  return {
    id: 'mock-text-response',
    model,
    message: { role: 'assistant', content },
    finishReason: 'stop',
  };
}

async function* scriptedStepsToStream(
  steps: readonly ScriptedServiceStep[],
  delayMs = 0,
): AsyncIterable<StreamChunk> {
  for (const step of steps) {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    switch (step.type) {
      case 'text':
        yield { type: 'content', content: step.content };
        break;
      case 'tool_call':
        yield {
          type: 'tool_call',
          toolCall: {
            id: step.id,
            type: 'function',
            function: {
              name: step.name,
              arguments: JSON.stringify(step.arguments),
            },
          },
        };
        break;
      case 'error':
        throw new Error(step.message);
    }
  }
  yield { type: 'done', finishReason: 'stop' };
}
