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

  constructor(
    readonly conversationId: string,
    readonly session: TSession,
  ) {
    assertConversationId(conversationId);
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
    let cancellationError: unknown;
    try {
      this.session.cancel();
    } catch (error) {
      cancellationError = error;
    }

    let disposalError: unknown;
    try {
      this.session.dispose();
    } catch (error) {
      disposalError = error;
    } finally {
      this._lifecycle = 'disposed';
    }

    if (cancellationError !== undefined && disposalError !== undefined) {
      throw new AggregateError(
        [cancellationError, disposalError],
        `Conversation runtime ${this.conversationId} failed to cancel and dispose.`,
      );
    }
    if (cancellationError !== undefined) throw cancellationError;
    if (disposalError !== undefined) throw disposalError;
  }
}

function assertConversationId(conversationId: string): void {
  if (conversationId.trim().length === 0) {
    throw new Error('conversationId is required for a conversation runtime.');
  }
}
