import type {
  ConversationChatModelSelection,
  ConversationMediaModelSelection,
  ConversationSource,
} from './conversation-record';
import type { ConversationCatalogStaleDiagnostic } from './conversation-resume-storage';
import {
  buildConversationRecordSavePlan,
  type ConversationRecordProjectionConversation,
  type ConversationRecordSavePlan,
} from './conversation-record-projector';
import { RetiredAgentMetadataStoreError } from '../retired-metadata-store';
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
  code: 'save-failed' | 'delete-failed' | 'projection-stale';
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
  getChatModelSelection?: (conversationId: string) => ConversationChatModelSelection | undefined;
  getMediaModelSelection?: (conversationId: string) => ConversationMediaModelSelection | undefined;
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
      projectionDiagnostic?: ConversationCatalogStaleDiagnostic;
    }
  | {
      kind: 'deleted';
      conversationId: string;
      revision: number;
      projectionDiagnostic?: ConversationCatalogStaleDiagnostic;
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
    const plan = buildConversationRecordSavePlan({
      conversation: this.options.getConversation(conversationId),
      workDir: this.options.workDir,
      source: this.options.source,
    });
    if (plan.kind === 'skip') return plan;
    const chatModelSelection = this.options.getChatModelSelection?.(conversationId);
    const mediaModelSelection = this.options.getMediaModelSelection?.(conversationId);
    return {
      kind: 'save',
      record: {
        ...plan.record,
        ...(chatModelSelection ? { chatModelSelection: { ...chatModelSelection } } : {}),
        ...(mediaModelSelection ? { mediaModelSelection: { ...mediaModelSelection } } : {}),
      },
    };
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
      this.reportProjectionDiagnostic(result, conversationId);
      const projection = result.projectionDiagnostic
        ? { projectionDiagnostic: result.projectionDiagnostic }
        : {};
      return result.operation === 'delete'
        ? { kind: 'deleted', conversationId, revision: result.revision, ...projection }
        : { kind: 'saved', conversationId, revision: result.revision, ...projection };
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
      if (result.kind === 'written') {
        this.reportProjectionDiagnostic(result, conversationId);
      } else if (result.kind === 'failed') {
        this.options.onWarning?.({
          code,
          conversationId,
          error: result.diagnostic.error,
          diagnostic: result.diagnostic,
        });
      }
    });
  }

  private reportProjectionDiagnostic(
    result: Extract<ConversationPersistenceOperationResult, { kind: 'written' }>,
    conversationId: string,
  ): void {
    if (!result.projectionDiagnostic) return;
    this.options.onWarning?.({
      code: 'projection-stale',
      conversationId,
      error: result.projectionDiagnostic.cause,
    });
  }
}

export function createConversationPersistenceRuntime(
  options: ConversationPersistenceRuntimeOptions,
): ConversationPersistenceRuntime {
  return new ConversationPersistenceRuntime(options);
}

export function createFileConversationPersistenceRuntime(
  _options: Omit<ConversationPersistenceRuntimeOptions, 'storage' | 'workDir'> & {
    workspaceRoot: string;
  },
): ConversationPersistenceRuntime {
  throw new RetiredAgentMetadataStoreError('conversation-file-storage');
}
