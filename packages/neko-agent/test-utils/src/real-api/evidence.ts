import type { AgentEvent } from '@neko/agent';
import type { AgentRealApiProfileConfig } from './profile-config';

export type AgentHarnessStatus = 'passed' | 'failed' | 'interrupted';

export interface AgentRunEvidence {
  readonly schemaVersion: 1;
  readonly profile: AgentRealApiProfileConfig;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly startedAt: number;
  readonly endedAt?: number;
  readonly status: AgentHarnessStatus;
  readonly events: readonly AgentEvent[];
  readonly text: string;
  readonly toolCalls: readonly {
    readonly id: string;
    readonly name: string;
    readonly arguments: unknown;
  }[];
  readonly toolResults: readonly {
    readonly id?: string;
    readonly success: boolean;
    readonly error?: string;
    readonly data?: unknown;
  }[];
  readonly diagnostics: readonly string[];
  readonly errors: readonly string[];
}

export interface AgentEventRecorder {
  readonly events: readonly AgentEvent[];
  record(event: AgentEvent): void;
  finish(input?: {
    readonly status?: AgentHarnessStatus;
    readonly providerId?: string;
    readonly modelId?: string;
  }): AgentRunEvidence;
}

export function createAgentEventRecorder(
  profile: AgentRealApiProfileConfig,
  now: () => number = () => Date.now(),
): AgentEventRecorder {
  const startedAt = now();
  const events: AgentEvent[] = [];
  let text = '';
  const toolCalls: AgentRunEvidence['toolCalls'][number][] = [];
  const toolResults: AgentRunEvidence['toolResults'][number][] = [];
  const diagnostics: string[] = [];
  const errors: string[] = [];

  return {
    get events() {
      return [...events];
    },
    record(event) {
      events.push(event);
      switch (event.type) {
        case 'text':
        case 'text_delta':
          if (event.content) text += event.content;
          break;
        case 'tool_call':
          if (event.toolCall) {
            toolCalls.push({
              id: event.toolCall.id,
              name: event.toolCall.name,
              arguments: event.toolCall.arguments,
            });
          }
          break;
        case 'tool_result':
          if (event.toolResult) {
            toolResults.push({
              id: event.toolResult.toolCallId,
              success: event.toolResult.success,
              ...(event.toolResult.error ? { error: event.toolResult.error } : {}),
              ...(event.toolResult.data !== undefined ? { data: event.toolResult.data } : {}),
            });
            if (!event.toolResult.success && event.toolResult.error) {
              diagnostics.push(event.toolResult.error);
            }
          }
          break;
        case 'error':
          if (event.error) errors.push(event.error.message);
          break;
      }
    },
    finish(input = {}) {
      const status =
        input.status ?? (errors.length > 0 ? 'failed' : hasDoneEvent(events) ? 'passed' : 'failed');
      return {
        schemaVersion: 1,
        profile,
        ...(input.providerId ? { providerId: input.providerId } : {}),
        ...(input.modelId ? { modelId: input.modelId } : {}),
        startedAt,
        endedAt: now(),
        status,
        events: [...events],
        text,
        toolCalls: [...toolCalls],
        toolResults: [...toolResults],
        diagnostics: [...diagnostics],
        errors: [...errors],
      };
    },
  };
}

export function toAgentRunEvidenceJson(evidence: AgentRunEvidence): string {
  return JSON.stringify(
    {
      schemaVersion: 1,
      kind: 'neko.agent.realApiHarness.evidence',
      evaluatorPolicy: {
        internalAssertionsRequired: true,
        supplementalEvaluators: ['promptfoo', 'deepeval'],
      },
      evidence,
    },
    null,
    2,
  );
}

function hasDoneEvent(events: readonly AgentEvent[]): boolean {
  return events.some((event) => event.type === 'done');
}
