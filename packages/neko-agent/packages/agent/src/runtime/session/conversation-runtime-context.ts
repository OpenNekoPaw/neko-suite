import {
  createConversationRunRegistry,
  type ConversationRunRegistry,
} from './conversation-run-registry';

export type ConversationRuntimeLifecycle = 'restoring' | 'ready' | 'disposing' | 'disposed';

export interface ManagedConversationRuntimeSession {
  cancel(): void;
  dispose(): void;
}

export interface ConversationRuntimeContext<
  TSession extends ManagedConversationRuntimeSession = ManagedConversationRuntimeSession,
> {
  readonly conversationId: string;
  readonly session: TSession;
  readonly runs: ConversationRunRegistry;
  readonly lifecycle: ConversationRuntimeLifecycle;
  markReady(): void;
  cancel(): void;
  dispose(): void;
}

export function createConversationRuntimeContext<
  TSession extends ManagedConversationRuntimeSession,
>(input: {
  readonly conversationId: string;
  readonly session: TSession;
}): ConversationRuntimeContext<TSession> {
  return new DefaultConversationRuntimeContext(input.conversationId, input.session);
}

class DefaultConversationRuntimeContext<
  TSession extends ManagedConversationRuntimeSession,
> implements ConversationRuntimeContext<TSession> {
  private _lifecycle: ConversationRuntimeLifecycle = 'restoring';
  readonly runs: ConversationRunRegistry;

  constructor(
    readonly conversationId: string,
    readonly session: TSession,
  ) {
    assertConversationId(conversationId);
    this.runs = createConversationRunRegistry(conversationId);
  }

  get lifecycle(): ConversationRuntimeLifecycle {
    return this._lifecycle;
  }

  markReady(): void {
    if (this._lifecycle !== 'restoring') {
      throw new Error(
        `Conversation runtime ${this.conversationId} cannot become ready from ${this._lifecycle}.`,
      );
    }
    this._lifecycle = 'ready';
  }

  cancel(): void {
    if (this._lifecycle === 'disposed') {
      throw new Error(`Conversation runtime ${this.conversationId} is disposed.`);
    }
    this.session.cancel();
  }

  dispose(): void {
    if (this._lifecycle === 'disposed') return;
    if (this._lifecycle === 'disposing') {
      throw new Error(`Conversation runtime ${this.conversationId} is already disposing.`);
    }

    this._lifecycle = 'disposing';
    const errors: unknown[] = [];
    try {
      this.runs.dispose(new Error(`Conversation runtime ${this.conversationId} is disposing.`));
    } catch (error) {
      errors.push(error);
    }
    try {
      this.session.cancel();
    } catch (error) {
      errors.push(error);
    }
    try {
      this.session.dispose();
    } catch (error) {
      errors.push(error);
    } finally {
      this._lifecycle = 'disposed';
    }

    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(
        errors,
        `Conversation runtime ${this.conversationId} failed to dispose.`,
      );
    }
  }
}

function assertConversationId(conversationId: string): void {
  if (conversationId.trim().length === 0) {
    throw new Error('conversationId is required for a conversation runtime.');
  }
}
