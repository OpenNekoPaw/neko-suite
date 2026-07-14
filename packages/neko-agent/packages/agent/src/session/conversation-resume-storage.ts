import type { ConversationRecord } from './conversation-record';

export interface ConversationCatalogStaleDiagnostic {
  readonly code: 'metadata-stale-projection';
  readonly operation: 'save' | 'delete';
  readonly conversationId: string;
  readonly authority: 'journal';
  readonly rebuild: 'conversation-catalog';
  readonly cause: unknown;
  readonly staleMarkerError?: unknown;
}

export type ConversationStorageMutationResult =
  | { readonly kind: 'projected' }
  | {
      readonly kind: 'authority-durable-projection-stale';
      readonly diagnostic: ConversationCatalogStaleDiagnostic;
    };

export interface ConversationResumeStorage {
  save(record: ConversationRecord): Promise<void | ConversationStorageMutationResult>;
  load(conversationId: string): Promise<ConversationRecord | undefined>;
  list(): Promise<ConversationRecord[]>;
  search(text: string): Promise<ConversationRecord[]>;
  delete(conversationId: string): Promise<void | ConversationStorageMutationResult>;
  flush(): Promise<void>;
  dispose(): Promise<void>;
}
