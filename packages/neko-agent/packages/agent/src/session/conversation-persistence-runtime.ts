import type { ConversationRecord, ConversationSource } from './conversation-record';
import {
  buildConversationRecordSavePlan,
  type ConversationRecordProjectionConversation,
  type ConversationRecordSavePlan,
} from './conversation-record-projector';
import { createFileConversationStorage } from './file-conversation-storage';
import {
  ConversationPersistenceCoordinator,
  type ConversationPersistenceCoordinatorMetrics,
  type ConversationPersistenceDiagnostic,
  type ConversationPersistenceDisposeResult,
  type ConversationPersistenceFlushResult,
  type ConversationPersistenceOperationResult,
  type ConversationPersistenceStoragePort,
  type ConversationPersistenceSubmitResult,
} from './conversation-persistence-coordinator';

export interface ConversationPersistenceRuntimeStorage extends ConversationPersistenceStoragePort {}

export interface ConversationPersistenceRuntimeWarning {
  code: 'save-failed' | 'delete-failed';
  conversationId: string;
  error: unknown;
  diagnostic?: ConversationPersistenceDiagnostic;
}

export interface ConversationPersistenceRuntimeOptions {
  workDir?: string | null;
  source?: ConversationSource;
  storage: ConversationPersistenceRuntimeStorage;
  coordinator?: ConversationPersistenceCoordinator;
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
      revision: number;
    }
  | {
      kind: 'deleted';
      conversationId: string;
      revision: number;
    }
  | {
      kind: 'failed';
      conversationId: string;
      diagnostic: ConversationPersistenceDiagnostic;
    }
  | {
      kind: 'rejected';
      conversationId: string;
      diagnostic: ConversationPersistenceDiagnostic;
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
      revision: number;
    }
  | {
      kind: 'delete-queued';
      conversationId: string;
      revision: number;
    }
  | {
      kind: 'rejected';
      conversationId: string;
      diagnostic: ConversationPersistenceDiagnostic;
    };

export class ConversationPersistenceRuntime {
  private readonly coordinator: ConversationPersistenceCoordinator;

  constructor(private readonly options: ConversationPersistenceRuntimeOptions) {
    this.coordinator =
      options.coordinator ?? new ConversationPersistenceCoordinator({ storage: options.storage });
  }

  async persistConversation(conversationId: string): Promise<ConversationPersistenceRuntimeResult> {
    const plan = this.buildSavePlan(conversationId);
    if (plan.kind === 'skip') {
      if (plan.reason === 'empty-conversation') {
        return this.awaitSubmission(conversationId, this.coordinator.enqueueDelete(conversationId));
      }
      return { kind: 'skip', conversationId, reason: plan.reason };
    }

    return this.awaitSubmission(conversationId, this.coordinator.enqueueTerminal(plan.record));
  }

  queueConversationSync(conversationId: string): ConversationPersistenceRuntimeQueueResult {
    const plan = this.buildSavePlan(conversationId);
    if (plan.kind === 'skip') {
      if (plan.reason === 'empty-conversation') {
        return this.queueDelete(conversationId);
      }
      return { kind: 'skip', conversationId, reason: plan.reason };
    }

    const submission = this.coordinator.enqueuePartial(plan.record);
    if (!submission.accepted) {
      return { kind: 'rejected', conversationId, diagnostic: submission.diagnostic };
    }
    this.observeQueuedCompletion(submission.completion, conversationId, 'save-failed');
    return { kind: 'save-queued', conversationId, revision: submission.revision };
  }

  async deleteConversation(conversationId: string): Promise<ConversationPersistenceRuntimeResult> {
    return this.awaitSubmission(conversationId, this.coordinator.enqueueDelete(conversationId));
  }

  queueConversationDelete(conversationId: string): ConversationPersistenceRuntimeQueueResult {
    return this.queueDelete(conversationId);
  }

  flush(): Promise<ConversationPersistenceFlushResult> {
    return this.coordinator.flush();
  }

  metrics(): ConversationPersistenceCoordinatorMetrics {
    return this.coordinator.metrics();
  }

  dispose(): Promise<ConversationPersistenceDisposeResult> {
    return this.coordinator.dispose();
  }

  private buildSavePlan(conversationId: string): ConversationRecordSavePlan {
    return buildConversationRecordSavePlan({
      conversation: this.options.getConversation(conversationId),
      workDir: this.options.workDir,
      source: this.options.source,
    });
  }

  private queueDelete(conversationId: string): ConversationPersistenceRuntimeQueueResult {
    const submission = this.coordinator.enqueueDelete(conversationId);
    if (!submission.accepted) {
      return { kind: 'rejected', conversationId, diagnostic: submission.diagnostic };
    }
    this.observeQueuedCompletion(submission.completion, conversationId, 'delete-failed');
    return { kind: 'delete-queued', conversationId, revision: submission.revision };
  }

  private async awaitSubmission(
    conversationId: string,
    submission: ConversationPersistenceSubmitResult,
  ): Promise<ConversationPersistenceRuntimeResult> {
    const result = await submission.completion;
    if (result.kind === 'written') {
      return result.operation === 'delete'
        ? { kind: 'deleted', conversationId, revision: result.revision }
        : { kind: 'saved', conversationId, revision: result.revision };
    }
    if (result.kind === 'failed') {
      return { kind: 'failed', conversationId, diagnostic: result.diagnostic };
    }
    if (result.kind === 'rejected') {
      return { kind: 'rejected', conversationId, diagnostic: result.diagnostic };
    }
    throw new Error('Terminal conversation persistence was unexpectedly superseded.');
  }

  private observeQueuedCompletion(
    completion: Promise<ConversationPersistenceOperationResult>,
    conversationId: string,
    code: ConversationPersistenceRuntimeWarning['code'],
  ): void {
    void completion.then((result) => {
      if (result.kind !== 'failed') return;
      this.options.onWarning?.({
        code,
        conversationId,
        error: result.diagnostic.error,
        diagnostic: result.diagnostic,
      });
    });
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
