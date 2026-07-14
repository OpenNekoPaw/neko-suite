import { type LocalMetadataStore, type WorkspaceIdentityDescriptor } from '@neko/shared';
import { resolveNodeWorkspaceIdentity } from '@neko/shared/local-metadata/node-workspace-identity';
import { createNodeJournalStorage } from './journal-storage';
import {
  SqliteConversationStorage,
  type SqliteConversationStorageOptions,
} from './sqlite-conversation-storage';

export interface CreateNodeSqliteConversationStorageOptions {
  readonly homedir: string;
  readonly workDir: string;
  readonly source: SqliteConversationStorageOptions['source'];
  readonly metadataStore: LocalMetadataStore;
  readonly createWorkspaceId?: () => string;
  readonly now?: () => string;
}

export interface NodeSqliteConversationStorageBinding {
  readonly storage: SqliteConversationStorage;
  readonly workspaceIdentity: WorkspaceIdentityDescriptor;
}

export async function createNodeSqliteConversationStorage(
  options: CreateNodeSqliteConversationStorageOptions,
): Promise<NodeSqliteConversationStorageBinding> {
  const workspaceResolution = await resolveNodeWorkspaceIdentity({
    workspaceRoot: options.workDir,
    homedir: options.homedir,
    metadataStore: options.metadataStore,
    ...(options.createWorkspaceId ? { createWorkspaceId: options.createWorkspaceId } : {}),
    ...(options.now ? { now: options.now } : {}),
  });
  const workspaceIdentity = workspaceResolution.identity;
  const normalizedHome = normalizePath(options.homedir);
  const journalStorage = createNodeJournalStorage(`${normalizedHome}/.neko/journals`);
  return {
    workspaceIdentity,
    storage: new SqliteConversationStorage({
      workDir: options.workDir,
      workspaceId: workspaceIdentity.workspaceId,
      source: options.source,
      metadataStore: options.metadataStore,
      journalProjection: journalStorage.createProjection(),
      createJournalWriter: (conversationId) => journalStorage.createWriter(conversationId),
    }),
  };
}

function normalizePath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;
}
