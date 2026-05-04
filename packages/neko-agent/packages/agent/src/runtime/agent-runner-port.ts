import type { ChatMessage, ConfiguredToolGroup, Skill, SkillInjection } from '@neko/shared';
import type { ISkillProvider } from '../tools/core/meta-tools';
import type { AgentEvent, CompressionResult } from '../session/types';
import type { SubAgentEvent } from '../subagent/types';

export interface DisposableLike {
  dispose(): void;
}

export type AgentRunnerEventSource<TEvent> = (listener: (event: TEvent) => void) => DisposableLike;

export interface AgentRunnerConfirmationRequest {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly action: string;
  readonly description: string;
  readonly details: Record<string, unknown>;
}

export type AgentRunnerPortEvent =
  | {
      readonly type: 'start';
    }
  | {
      readonly type: 'stop';
    }
  | {
      readonly type: 'confirmation';
      readonly request: AgentRunnerConfirmationRequest;
    }
  | {
      readonly type: 'subagent';
      readonly event: SubAgentEvent;
    }
  | {
      readonly type: 'cancel';
    }
  | {
      readonly type: 'historyLoaded';
      readonly messageCount: number;
    }
  | {
      readonly type: 'contextCompressed';
      readonly result: CompressionResult;
    };

export interface AgentRunnerPort<TConfig, TContext> extends DisposableLike {
  configure(config: TConfig): Promise<void>;
  getConfig(): TConfig | undefined;
  execute(input: string, context: TContext): AsyncIterable<AgentEvent>;
  cancel(): void;
  isRunning(): boolean;
  appendMessage(input: string): boolean;
  getPendingMessagesCount(): number;
  clearPendingMessages(): void;
  getContextTokenCount(): number;
  compressContext(): Promise<CompressionResult>;
  confirmTool(toolCallId: string, approved: boolean): void;
  getPendingConfirmations(): AgentRunnerConfirmationRequest[];
  getHistory(): ChatMessage[];
  clearHistory(): void;
  addMessage(message: ChatMessage, sourceEventIds?: readonly string[]): void;
  loadHistory(messages: ChatMessage[], messageEventIds?: readonly (readonly string[])[]): void;
  getToolSkills(): ConfiguredToolGroup[];
  setSkillProvider(provider: ISkillProvider): void;
  refreshCapabilityRuntime(): void;
  applySkillInjection(injection: SkillInjection, skill?: Skill): void;
  getActiveSkill(): Skill | undefined;
  clearActiveSkill(): void;
  isToolAllowed(toolName: string): boolean;
  readonly onDidStart: AgentRunnerEventSource<void>;
  readonly onDidStop: AgentRunnerEventSource<void>;
  readonly onDidRequestConfirmation: AgentRunnerEventSource<AgentRunnerConfirmationRequest>;
  readonly onDidSubAgentEvent: AgentRunnerEventSource<SubAgentEvent>;
  readonly onDidRunnerEvent: AgentRunnerEventSource<AgentRunnerPortEvent>;
}

export interface AgentRunnerEventEmitter<TEvent> extends DisposableLike {
  readonly event: AgentRunnerEventSource<TEvent>;
  fire(event: TEvent): void;
}

export function createAgentRunnerEventEmitter<TEvent>(): AgentRunnerEventEmitter<TEvent> {
  return new DefaultAgentRunnerEventEmitter<TEvent>();
}

class DefaultAgentRunnerEventEmitter<TEvent> implements AgentRunnerEventEmitter<TEvent> {
  private readonly listeners = new Set<(event: TEvent) => void>();

  readonly event: AgentRunnerEventSource<TEvent> = (listener) => {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  };

  fire(event: TEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  dispose(): void {
    this.listeners.clear();
  }
}
