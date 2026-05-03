import type { PromptMode } from './system-prompt-builder-types';
import { buildPromptModeChangedMessage, type PromptModeChangedMessage } from '../plan';

export interface ConversationPromptModeSnapshot {
  conversationId: string;
  mode: PromptMode;
  isPlanMode: boolean;
}

export interface ConversationPromptModeRuntime {
  setMode(conversationId: string, mode: PromptMode): ConversationPromptModeSnapshot;
  togglePlanMode(conversationId: string): ConversationPromptModeSnapshot;
  getMode(conversationId: string): PromptMode;
  isPlanMode(conversationId: string): boolean;
  clear(conversationId: string): void;
  clearAll(): void;
}

export interface ConversationPromptModeRuntimeOptions {
  defaultMode?: PromptMode;
}

export interface ConversationPromptModeMessageRuntimeEffects {
  postMessage(message: PromptModeChangedMessage): void | Promise<void>;
}

export interface ConversationPromptModeMessageRuntimeResult {
  conversationId: string;
  snapshot: ConversationPromptModeSnapshot;
  message: PromptModeChangedMessage;
}

export function createConversationPromptModeRuntime(
  options: ConversationPromptModeRuntimeOptions = {},
): ConversationPromptModeRuntime {
  return new InMemoryConversationPromptModeRuntime(options.defaultMode ?? 'default');
}

export function buildConversationPromptModeChangedMessage(
  snapshot: ConversationPromptModeSnapshot,
): PromptModeChangedMessage {
  return buildPromptModeChangedMessage({
    conversationId: snapshot.conversationId,
    mode: snapshot.mode,
    isPlanMode: snapshot.isPlanMode,
  });
}

export async function runSetConversationPromptModeRuntime(
  input: { conversationId: string; mode: PromptMode },
  runtime: ConversationPromptModeRuntime,
  effects: ConversationPromptModeMessageRuntimeEffects,
): Promise<ConversationPromptModeMessageRuntimeResult> {
  const snapshot = runtime.setMode(input.conversationId, input.mode);
  return postConversationPromptModeSnapshot(snapshot, effects);
}

export async function runToggleConversationPromptModeRuntime(
  input: { conversationId: string },
  runtime: ConversationPromptModeRuntime,
  effects: ConversationPromptModeMessageRuntimeEffects,
): Promise<ConversationPromptModeMessageRuntimeResult> {
  const snapshot = runtime.togglePlanMode(input.conversationId);
  return postConversationPromptModeSnapshot(snapshot, effects);
}

export async function runSendConversationPromptModeRuntime(
  input: { conversationId: string },
  runtime: ConversationPromptModeRuntime,
  effects: ConversationPromptModeMessageRuntimeEffects,
): Promise<ConversationPromptModeMessageRuntimeResult> {
  const mode = runtime.getMode(input.conversationId);
  return postConversationPromptModeSnapshot(
    {
      conversationId: input.conversationId,
      mode,
      isPlanMode: mode === 'plan',
    },
    effects,
  );
}

class InMemoryConversationPromptModeRuntime implements ConversationPromptModeRuntime {
  private readonly modes = new Map<string, PromptMode>();

  constructor(private readonly defaultMode: PromptMode) {}

  setMode(conversationId: string, mode: PromptMode): ConversationPromptModeSnapshot {
    this.modes.set(conversationId, mode);
    return this.snapshot(conversationId);
  }

  togglePlanMode(conversationId: string): ConversationPromptModeSnapshot {
    const nextMode = this.getMode(conversationId) === 'plan' ? 'default' : 'plan';
    return this.setMode(conversationId, nextMode);
  }

  getMode(conversationId: string): PromptMode {
    return this.modes.get(conversationId) ?? this.defaultMode;
  }

  isPlanMode(conversationId: string): boolean {
    return this.getMode(conversationId) === 'plan';
  }

  clear(conversationId: string): void {
    this.modes.delete(conversationId);
  }

  clearAll(): void {
    this.modes.clear();
  }

  private snapshot(conversationId: string): ConversationPromptModeSnapshot {
    const mode = this.getMode(conversationId);
    return {
      conversationId,
      mode,
      isPlanMode: mode === 'plan',
    };
  }
}

async function postConversationPromptModeSnapshot(
  snapshot: ConversationPromptModeSnapshot,
  effects: ConversationPromptModeMessageRuntimeEffects,
): Promise<ConversationPromptModeMessageRuntimeResult> {
  const message = buildConversationPromptModeChangedMessage(snapshot);
  await effects.postMessage(message);
  return {
    conversationId: snapshot.conversationId,
    snapshot,
    message,
  };
}
