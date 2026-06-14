import type { ConversationRecord, ConversationSource } from './conversation-record';
import {
  buildConversationRecordSavePlan,
  type ConversationRecordProjectionConversation,
  type ConversationRecordSavePlan,
} from './conversation-record-projector';
import { createFileConversationStorage } from './file-conversation-storage';

export interface ConversationPersistenceRuntimeStorage {
  save(record: ConversationRecord): Promise<void>;
  delete(conversationId: string): Promise<void>;
  flush?(): Promise<void>;
  dispose?(): void | Promise<void>;
}

export interface ConversationPersistenceRuntimeWarning {
  code: 'save-failed' | 'delete-failed';
  conversationId: string;
  error: unknown;
}

export interface ConversationPersistenceRuntimeOptions {
  workDir?: string | null;
  source?: ConversationSource;
  storage: ConversationPersistenceRuntimeStorage;
  getConversation: (
    conversationId: string,
  ) => ConversationRecordProjectionConversation | null | undefined;
  onWarning?: (warning: ConversationPersistenceRuntimeWarning) => void;
}

export type ConversationPersistenceRuntimeResult =
  | {
      kind: 'skip';
      conversationId: string;
      reason: Extract<ConversationRecordSavePlan, { kind: 'skip' }>['reason'];
    }
  | {
      kind: 'saved';
      conversationId: string;
    }
  | {
      kind: 'deleted';
      conversationId: string;
    };

export type ConversationPersistenceRuntimeQueueResult =
  | {
      kind: 'skip';
      conversationId: string;
      reason: Extract<ConversationRecordSavePlan, { kind: 'skip' }>['reason'];
    }
  | {
      kind: 'save-queued';
      conversationId: string;
    }
  | {
      kind: 'delete-queued';
      conversationId: string;
    };

export class ConversationPersistenceRuntime {
  constructor(private readonly options: ConversationPersistenceRuntimeOptions) {}

  async persistConversation(conversationId: string): Promise<ConversationPersistenceRuntimeResult> {
    const plan = this.buildSavePlan(conversationId);
    if (plan.kind === 'skip') {
      if (plan.reason === 'empty-conversation') {
        await this.options.storage.delete(conversationId);
        await this.options.storage.flush?.();
        return { kind: 'deleted', conversationId };
      }
      return { kind: 'skip', conversationId, reason: plan.reason };
    }

    await this.options.storage.save(plan.record);
    await this.options.storage.flush?.();
    return { kind: 'saved', conversationId };
  }

  queueConversationSync(conversationId: string): ConversationPersistenceRuntimeQueueResult {
    const plan = this.buildSavePlan(conversationId);
    if (plan.kind === 'skip') {
      if (plan.reason === 'empty-conversation') {
        this.queueDelete(conversationId);
        return { kind: 'delete-queued', conversationId };
      }
      return { kind: 'skip', conversationId, reason: plan.reason };
    }

    try {
      void this.options.storage
        .save(plan.record)
        .then(
          () => this.options.storage.flush?.(),
          (error: unknown) => {
            this.options.onWarning?.({ code: 'save-failed', conversationId, error });
          },
        )
        .catch((error: unknown) => {
          this.options.onWarning?.({ code: 'save-failed', conversationId, error });
        });
    } catch (error: unknown) {
      this.options.onWarning?.({ code: 'save-failed', conversationId, error });
    }

    return { kind: 'save-queued', conversationId };
  }

  async deleteConversation(conversationId: string): Promise<ConversationPersistenceRuntimeResult> {
    await this.options.storage.delete(conversationId);
    await this.options.storage.flush?.();
    return { kind: 'deleted', conversationId };
  }

  queueConversationDelete(conversationId: string): ConversationPersistenceRuntimeQueueResult {
    this.queueDelete(conversationId);
    return { kind: 'delete-queued', conversationId };
  }

  dispose(): void | Promise<void> {
    return this.options.storage.dispose?.();
  }

  private buildSavePlan(conversationId: string): ConversationRecordSavePlan {
    return buildConversationRecordSavePlan({
      conversation: this.options.getConversation(conversationId),
      workDir: this.options.workDir,
      source: this.options.source,
    });
  }

  private queueDelete(conversationId: string): void {
    try {
      void this.options.storage
        .delete(conversationId)
        .then(
          () => this.options.storage.flush?.(),
          (error: unknown) => {
            this.options.onWarning?.({ code: 'delete-failed', conversationId, error });
          },
        )
        .catch((error: unknown) => {
          this.options.onWarning?.({ code: 'delete-failed', conversationId, error });
        });
    } catch (error: unknown) {
      this.options.onWarning?.({ code: 'delete-failed', conversationId, error });
    }
  }
}

export function createConversationPersistenceRuntime(
  options: ConversationPersistenceRuntimeOptions,
): ConversationPersistenceRuntime {
  return new ConversationPersistenceRuntime(options);
}

export function createFileConversationPersistenceRuntime(
  options: Omit<ConversationPersistenceRuntimeOptions, 'storage' | 'workDir'> & {
    workspaceRoot: string;
  },
): ConversationPersistenceRuntime {
  return createConversationPersistenceRuntime({
    ...options,
    workDir: options.workspaceRoot,
    storage: createFileConversationStorage(options.workspaceRoot),
  });
}
