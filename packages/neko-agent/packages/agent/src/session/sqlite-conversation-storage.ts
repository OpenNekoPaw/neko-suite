import type { LocalMetadataStore } from '@neko/shared';
import type { ConversationJournalMetadata } from './conversation-journal-metadata';
import type { ConversationRecord } from './conversation-record';
import type { IJournalProjection } from './journal-projection';
import type {
  ConversationResumeStorage,
  ConversationStorageMutationResult,
} from './conversation-resume-storage';

export interface ConversationMetadataJournalWriter {
  appendConversationMetadata(metadata: ConversationJournalMetadata): Promise<string>;
  flush(): Promise<void>;
}

export interface SqliteConversationStorageOptions {
  readonly workDir: string;
  readonly workspaceId: string;
  readonly source: ConversationJournalMetadata['source'];
  readonly metadataStore: LocalMetadataStore;
  readonly journalProjection: IJournalProjection;
  readonly createJournalWriter: (conversationId: string) => ConversationMetadataJournalWriter;
}

export class SqliteConversationStorage implements ConversationResumeStorage {
  constructor(private readonly options: SqliteConversationStorageOptions) {}

  async save(record: ConversationRecord): Promise<ConversationStorageMutationResult> {
    if (record.workDir !== this.options.workDir) {
      throw new Error(
        `Conversation workspace mismatch: expected ${this.options.workDir}, received ${record.workDir}.`,
      );
    }
    const metadata = toJournalMetadata(record, this.options);
    const writer = this.options.createJournalWriter(record.id);
    await writer.appendConversationMetadata(metadata);
    await writer.flush();
    const updatedAt = new Date(metadata.updatedAt).toISOString();
    return this.projectCatalogMutation('save', record.id, updatedAt, async (repositories) => {
      await repositories.conversations.upsert({
        conversationId: metadata.conversationId,
        workspaceId: metadata.workspaceId,
        journalId: metadata.journalId,
        title: metadata.title,
        source: metadata.source,
        model: metadata.modelSelection.chat?.modelId ?? null,
        createdAt: new Date(metadata.createdAt).toISOString(),
        updatedAt,
      });
    });
  }

  async load(conversationId: string): Promise<ConversationRecord | undefined> {
    const catalogRecord =
      await this.options.metadataStore.repositories.conversations.get(conversationId);
    if (!catalogRecord) return undefined;
    if (catalogRecord.workspaceId !== this.options.workspaceId) {
      throw new Error(
        `Conversation catalog owner mismatch: expected ${this.options.workspaceId}, received ${String(catalogRecord.workspaceId)}.`,
      );
    }
    const metadata =
      await this.options.journalProjection.projectToConversationMetadata(conversationId);
    if (!metadata) {
      const summary = await this.options.journalProjection.projectToSummary(conversationId);
      if (!summary) {
        throw new Error(`Conversation ${conversationId} has no projectable Journal events.`);
      }
      const projected =
        await this.options.journalProjection.projectToHistoryWithEventIds(conversationId);
      return {
        id: conversationId,
        version: 2,
        title: catalogRecord.title,
        workDir: this.options.workDir,
        messages: projected.messages,
        ...(projected.messageEventIds.some((eventIds) => eventIds.length > 0)
          ? { messageEventIds: projected.messageEventIds.map((eventIds) => [...eventIds]) }
          : {}),
        createdAt: parseCatalogTimestamp(catalogRecord.createdAt, 'createdAt'),
        updatedAt: parseCatalogTimestamp(catalogRecord.updatedAt, 'updatedAt'),
        source: 'journal-projection',
      };
    }
    if (metadata.workspaceId !== this.options.workspaceId) {
      throw new Error(
        `Conversation Journal workspace mismatch: expected ${this.options.workspaceId}, received ${String(metadata.workspaceId)}.`,
      );
    }
    if (metadata.lifecycle.state === 'deleted') return undefined;
    const projected =
      await this.options.journalProjection.projectToHistoryWithEventIds(conversationId);
    return {
      id: conversationId,
      version: 2,
      title: metadata.title,
      workDir: this.options.workDir,
      messages: projected.messages,
      ...(projected.messageEventIds.some((eventIds) => eventIds.length > 0)
        ? { messageEventIds: projected.messageEventIds.map((eventIds) => [...eventIds]) }
        : {}),
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
      source: 'journal-projection',
      ...(metadata.modelSelection.chat
        ? { chatModelSelection: { ...metadata.modelSelection.chat } }
        : {}),
      ...(metadata.modelSelection.media
        ? { mediaModelSelection: { ...metadata.modelSelection.media } }
        : {}),
      ...(metadata.tags.length > 0 ? { tags: [...metadata.tags] } : {}),
    };
  }

  list(): Promise<ConversationRecord[]> {
    return this.query(null);
  }

  search(text: string): Promise<ConversationRecord[]> {
    return this.query(text.trim() || null);
  }

  async delete(conversationId: string): Promise<ConversationStorageMutationResult> {
    const metadata =
      await this.options.journalProjection.projectToConversationMetadata(conversationId);
    if (!metadata) {
      throw new Error(`Conversation ${conversationId} is missing authoritative Journal metadata.`);
    }
    if (metadata.workspaceId !== this.options.workspaceId) {
      throw new Error(
        `Conversation Journal workspace mismatch: expected ${this.options.workspaceId}, received ${String(metadata.workspaceId)}.`,
      );
    }
    const deletedAt = Date.now();
    const writer = this.options.createJournalWriter(conversationId);
    await writer.appendConversationMetadata({
      ...metadata,
      updatedAt: deletedAt,
      lifecycle: { state: 'deleted', deletedAt },
    });
    await writer.flush();
    const updatedAt = new Date(deletedAt).toISOString();
    return this.projectCatalogMutation(
      'delete',
      conversationId,
      updatedAt,
      async (repositories) => {
        await repositories.conversations.delete(conversationId);
      },
    );
  }

  flush(): Promise<void> {
    return Promise.resolve();
  }

  dispose(): Promise<void> {
    return Promise.resolve();
  }

  private async query(text: string | null): Promise<ConversationRecord[]> {
    const catalogRecords = await this.options.metadataStore.repositories.conversations.list({
      workspaceId: this.options.workspaceId,
      text,
      limit: 100,
      offset: 0,
    });
    const projected = await Promise.all(
      catalogRecords.map(async (record) => {
        return this.load(record.conversationId);
      }),
    );
    return projected.filter((record): record is ConversationRecord => record !== undefined);
  }

  private async projectCatalogMutation(
    operation: 'save' | 'delete',
    conversationId: string,
    updatedAt: string,
    mutation: (repositories: LocalMetadataStore['repositories']) => Promise<void>,
  ): Promise<ConversationStorageMutationResult> {
    try {
      await this.options.metadataStore.transaction(
        {
          mode: 'cache-write',
          ownership: 'cache',
          operation: `${operation}-conversation-catalog`,
        },
        async ({ repositories }) => {
          await mutation(repositories);
          await repositories.projectionVersions.increment({
            partition: conversationPartition(this.options.workspaceId),
            freshness: 'fresh',
            diagnostic: null,
            updatedAt,
          });
        },
      );
      return { kind: 'projected' };
    } catch (cause) {
      let staleMarkerError: unknown;
      try {
        await this.options.metadataStore.transaction(
          {
            mode: 'cache-write',
            ownership: 'cache',
            operation: 'mark-conversation-catalog-stale',
          },
          async ({ repositories }) => {
            await repositories.projectionVersions.markStale({
              partition: conversationPartition(this.options.workspaceId),
              freshness: 'stale',
              diagnostic: `conversation-catalog-${operation}-failed`,
              updatedAt,
            });
          },
        );
      } catch (error) {
        staleMarkerError = error;
      }
      return {
        kind: 'authority-durable-projection-stale',
        diagnostic: {
          code: 'metadata-stale-projection',
          operation,
          conversationId,
          authority: 'journal',
          rebuild: 'conversation-catalog',
          cause,
          ...(staleMarkerError !== undefined ? { staleMarkerError } : {}),
        },
      };
    }
  }
}

function parseCatalogTimestamp(value: string, field: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`Conversation catalog ${field} is invalid: ${value}`);
  }
  return timestamp;
}

function conversationPartition(workspaceId: string) {
  return { scope: 'workspace' as const, workspaceId, domain: 'conversations' };
}

function toJournalMetadata(
  record: ConversationRecord,
  options: SqliteConversationStorageOptions,
): ConversationJournalMetadata {
  return {
    version: 1,
    conversationId: record.id,
    journalId: record.id,
    workspaceId: options.workspaceId,
    title: record.title,
    source: options.source,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    messageCount: record.messages.filter((message) => message.role !== 'system').length,
    modelSelection: {
      chat: record.chatModelSelection ? { ...record.chatModelSelection } : null,
      media: record.mediaModelSelection ? { ...record.mediaModelSelection } : null,
    },
    tags: record.tags ? [...record.tags] : [],
    lifecycle: { state: 'active', deletedAt: null },
  };
}
