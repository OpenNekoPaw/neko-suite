import { access, copyFile, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import type { ConversationCatalogRecord, LocalMetadataStore } from '@neko/shared';
import type { ConversationIndexMeta } from './conversation-record';
import type { ConversationJournalMetadata } from './conversation-journal-metadata';
import { getConversationWorkDirHash, parseConversationId } from './conversation-id';
import { createNodeJournalStorage } from './journal-storage';
import type { ConversationSummary } from './journal-projection';

export interface ConversationCatalogMigrationUnrecoverable {
  readonly conversationId: string;
  readonly fields: readonly string[];
  readonly reason: string;
}

export interface ConversationCatalogMigrationReport {
  readonly sourceStatus: 'absent' | 'migrated' | 'quarantined' | 'not-required';
  readonly sourcePath: string;
  readonly backupPath: string | null;
  readonly archivedPath: string | null;
  readonly quarantinePath: string | null;
  readonly sourceDiagnostic: string | null;
  readonly importedCount: number;
  readonly tombstoneCount: number;
  readonly verifiedCount: number;
  readonly unrecoverable: readonly ConversationCatalogMigrationUnrecoverable[];
}

export async function migrateLegacyConversationCatalog(options: {
  readonly homedir: string;
  readonly workDir: string;
  readonly workspaceId: string;
  readonly metadataStore: LocalMetadataStore;
  readonly now?: () => number;
}): Promise<ConversationCatalogMigrationReport> {
  const now = options.now ?? (() => Date.now());
  const sourcePath = join(options.homedir, '.neko', 'conversations-index.json');
  const partition = {
    scope: 'workspace' as const,
    workspaceId: options.workspaceId,
    domain: 'conversations',
  };
  const sourceExists = await pathExists(sourcePath);
  const currentProjection = await options.metadataStore.readPartitionRevision(partition);
  if (!sourceExists && currentProjection?.freshness === 'fresh') {
    return emptyReport('not-required', sourcePath);
  }
  const migratedAt = now();
  let backupPath: string | null = null;
  let archivedPath: string | null = null;
  let quarantinePath: string | null = null;
  let sourceStatus: ConversationCatalogMigrationReport['sourceStatus'] = 'absent';
  let sourceDiagnostic: string | null = null;
  let legacy: LegacyConversationIndex | null = null;
  if (sourceExists) {
    backupPath = `${sourcePath}.backup-${migratedAt}`;
    await copyFile(sourcePath, backupPath);
    try {
      legacy = parseLegacyConversationIndex(await readFile(sourcePath, 'utf8'));
      sourceStatus = 'migrated';
      archivedPath = `${sourcePath}.migrated-${migratedAt}`;
    } catch (error) {
      sourceStatus = 'quarantined';
      sourceDiagnostic = error instanceof Error ? error.message : String(error);
      quarantinePath = `${sourcePath}.quarantine-${migratedAt}`;
      await rename(sourcePath, quarantinePath);
    }
  }
  const journals = createNodeJournalStorage(join(options.homedir, '.neko', 'journals'));
  const projection = journals.createProjection();
  const journalIds = new Set(await journals.listJournals());
  const records: ConversationCatalogRecord[] = [];
  const unrecoverable: ConversationCatalogMigrationUnrecoverable[] = [];
  let tombstoneCount = 0;

  const legacyRecords = legacy ? selectWorkspaceConversations(legacy, options.workDir) : [];
  for (const legacyMeta of legacyRecords) {
    if (!journalIds.has(legacyMeta.conversationId)) {
      unrecoverable.push({
        conversationId: legacyMeta.conversationId,
        fields: ['journal'],
        reason: 'Legacy catalog record has no authoritative Journal.',
      });
      continue;
    }
    const metadata = await projection.projectToConversationMetadata(legacyMeta.conversationId);
    if (!metadata) {
      const summary = await projection.projectToSummary(legacyMeta.conversationId);
      if (!summary) {
        unrecoverable.push({
          conversationId: legacyMeta.conversationId,
          fields: ['journal'],
          reason: 'Journal contains no projectable conversation events.',
        });
        continue;
      }
      records.push(projectLegacyCatalogRecord(legacyMeta, options.workspaceId));
      unrecoverable.push({
        conversationId: legacyMeta.conversationId,
        fields: ['workspaceId', 'catalogTitle', 'source', 'modelSelection', 'tags'],
        reason:
          'Legacy catalog fields were projected without mutating the authoritative Journal and cannot be reconstructed from Journal metadata.',
      });
      continue;
    }
    assertWorkspaceOwner(metadata, options.workspaceId);
    if (metadata.lifecycle.state === 'deleted') {
      tombstoneCount += 1;
      continue;
    }
    records.push(projectCatalogRecord(metadata));
  }

  if (!legacy) {
    for (const conversationId of [...journalIds].sort()) {
      const metadata = await projection.projectToConversationMetadata(conversationId);
      if (!metadata) {
        if (
          parseConversationId(conversationId)?.workDirHash !==
          getConversationWorkDirHash(options.workDir)
        ) {
          unrecoverable.push({
            conversationId,
            fields: ['workspaceId'],
            reason: 'Journal without metadata cannot be assigned to this workspace.',
          });
          continue;
        }
        const summary = await projection.projectToSummary(conversationId);
        if (!summary) {
          unrecoverable.push({
            conversationId,
            fields: ['journal'],
            reason: 'Journal contains no projectable conversation events.',
          });
          continue;
        }
        records.push(projectSummaryCatalogRecord(summary, options.workspaceId));
        unrecoverable.push({
          conversationId,
          fields: ['catalogTitle', 'source', 'modelSelection', 'tags'],
          reason: 'Legacy catalog fields were unavailable; title was derived from Journal history.',
        });
        continue;
      }
      if (metadata.workspaceId !== options.workspaceId) continue;
      if (metadata.lifecycle.state === 'deleted') {
        tombstoneCount += 1;
        continue;
      }
      records.push(projectCatalogRecord(metadata));
    }
  }

  const updatedAt = new Date(migratedAt).toISOString();
  await options.metadataStore.transaction(
    { mode: 'cache-write', ownership: 'cache', operation: 'migrate-conversation-catalog' },
    async ({ repositories }) => {
      await repositories.conversations.replaceProjection({
        workspaceId: options.workspaceId,
        conversations: records,
        authorityRevision: `journal-metadata-v1:${migratedAt}`,
      });
      const verified = await repositories.conversations.list({
        workspaceId: options.workspaceId,
        text: null,
        limit: 1_000,
        offset: 0,
      });
      assertVerifiedProjection(records, verified);
      await repositories.projectionVersions.increment({
        partition,
        freshness: 'fresh',
        diagnostic: null,
        updatedAt,
      });
    },
  );
  if (sourceStatus === 'migrated') {
    if (!archivedPath) {
      throw new Error('Migrated conversation catalog must define an archive path.');
    }
    await rename(sourcePath, archivedPath);
  }

  return {
    sourceStatus,
    sourcePath,
    backupPath,
    archivedPath,
    quarantinePath,
    sourceDiagnostic,
    importedCount: records.length,
    tombstoneCount,
    verifiedCount: records.length,
    unrecoverable,
  };
}

interface LegacyConversationIndex {
  readonly workspaces: Readonly<Record<string, readonly string[]>>;
  readonly conversations: Readonly<Record<string, ConversationIndexMeta>>;
}

function parseLegacyConversationIndex(content: string): LegacyConversationIndex {
  const parsed: unknown = JSON.parse(content);
  if (!isRecord(parsed) || parsed['version'] !== 1) {
    throw new Error('Legacy conversation index must use version 1.');
  }
  if (!isRecord(parsed['workspaces']) || !isRecord(parsed['conversations'])) {
    throw new Error('Legacy conversation index must contain workspaces and conversations objects.');
  }
  const workspaces: Record<string, string[]> = {};
  for (const [workDir, value] of Object.entries(parsed['workspaces'])) {
    if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
      throw new Error(`Legacy conversation workspace entry is invalid: ${workDir}`);
    }
    workspaces[workDir] = [...value];
  }
  const conversations: Record<string, ConversationIndexMeta> = {};
  for (const [conversationId, value] of Object.entries(parsed['conversations'])) {
    conversations[conversationId] = parseLegacyConversationMeta(conversationId, value);
  }
  return { workspaces, conversations };
}

function parseLegacyConversationMeta(
  conversationId: string,
  value: unknown,
): ConversationIndexMeta {
  if (!isRecord(value)) {
    throw new Error(`Legacy conversation metadata is invalid: ${conversationId}`);
  }
  const title = requireString(value['title'], `${conversationId}.title`);
  const workDir = requireString(value['workDir'], `${conversationId}.workDir`);
  const createdAt = requireTimestamp(value['createdAt'], `${conversationId}.createdAt`);
  const updatedAt = requireTimestamp(value['updatedAt'], `${conversationId}.updatedAt`);
  const messageCount = requireTimestamp(value['messageCount'], `${conversationId}.messageCount`);
  const source = value['source'];
  if (source !== 'extension' && source !== 'tui' && source !== 'journal-projection') {
    throw new Error(`Legacy conversation source is invalid: ${conversationId}`);
  }
  const tags = value['tags'];
  if (
    tags !== undefined &&
    (!Array.isArray(tags) || !tags.every((tag) => typeof tag === 'string'))
  ) {
    throw new Error(`Legacy conversation tags are invalid: ${conversationId}`);
  }
  const mediaModelSelection = value['mediaModelSelection'];
  if (mediaModelSelection !== undefined && !isRecord(mediaModelSelection)) {
    throw new Error(`Legacy conversation media model selection is invalid: ${conversationId}`);
  }
  return {
    conversationId,
    title,
    workDir,
    createdAt,
    updatedAt,
    messageCount,
    source,
    ...(tags ? { tags: [...tags] } : {}),
    ...(mediaModelSelection
      ? { mediaModelSelection: parseMediaModelSelection(conversationId, mediaModelSelection) }
      : {}),
  };
}

function selectWorkspaceConversations(
  legacy: LegacyConversationIndex,
  workDir: string,
): ConversationIndexMeta[] {
  const ids = legacy.workspaces[workDir] ?? [];
  return ids.map((conversationId) => {
    const metadata = legacy.conversations[conversationId];
    if (!metadata) {
      throw new Error(`Legacy workspace references missing conversation: ${conversationId}`);
    }
    if (metadata.workDir !== workDir) {
      throw new Error(`Legacy conversation workspace mismatch: ${conversationId}`);
    }
    return metadata;
  });
}

function projectLegacyCatalogRecord(
  metadata: ConversationIndexMeta,
  workspaceId: string,
): ConversationCatalogRecord {
  return {
    conversationId: metadata.conversationId,
    journalId: metadata.conversationId,
    workspaceId,
    title: metadata.title,
    source:
      metadata.source === 'extension' ? 'vscode' : metadata.source === 'tui' ? 'tui' : 'import',
    model: null,
    createdAt: new Date(metadata.createdAt).toISOString(),
    updatedAt: new Date(metadata.updatedAt).toISOString(),
  };
}

function projectSummaryCatalogRecord(
  summary: ConversationSummary,
  workspaceId: string,
): ConversationCatalogRecord {
  return {
    conversationId: summary.conversationId,
    workspaceId,
    journalId: summary.conversationId,
    title: summary.title,
    source: 'import',
    model: null,
    createdAt: new Date(summary.createdAt).toISOString(),
    updatedAt: new Date(summary.updatedAt).toISOString(),
  };
}

function projectCatalogRecord(metadata: ConversationJournalMetadata): ConversationCatalogRecord {
  return {
    conversationId: metadata.conversationId,
    workspaceId: metadata.workspaceId,
    journalId: metadata.journalId,
    title: metadata.title,
    source: metadata.source,
    model: metadata.modelSelection.chat?.modelId ?? null,
    createdAt: new Date(metadata.createdAt).toISOString(),
    updatedAt: new Date(metadata.updatedAt).toISOString(),
  };
}

function assertWorkspaceOwner(metadata: ConversationJournalMetadata, workspaceId: string): void {
  if (metadata.workspaceId !== workspaceId) {
    throw new Error(
      `Conversation Journal workspace mismatch: expected ${workspaceId}, received ${String(metadata.workspaceId)}.`,
    );
  }
}

function assertVerifiedProjection(
  expected: readonly ConversationCatalogRecord[],
  actual: readonly ConversationCatalogRecord[],
): void {
  const expectedIds = expected.map((record) => record.conversationId).sort();
  const actualIds = actual.map((record) => record.conversationId).sort();
  if (
    expectedIds.length !== actualIds.length ||
    expectedIds.some((id, index) => id !== actualIds[index])
  ) {
    throw new Error(
      `Conversation catalog migration count/identity verification failed: expected ${expectedIds.length}, received ${actualIds.length}.`,
    );
  }
}

function parseMediaModelSelection(
  conversationId: string,
  value: Record<string, unknown>,
): NonNullable<ConversationIndexMeta['mediaModelSelection']> {
  const result: NonNullable<ConversationIndexMeta['mediaModelSelection']> = {};
  for (const field of ['image', 'video', 'audio', 'music'] as const) {
    const modelId = value[field];
    if (modelId === undefined) continue;
    result[field] = requireString(modelId, `${conversationId}.mediaModelSelection.${field}`);
  }
  return result;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Legacy conversation index ${field} must be a non-empty string.`);
  }
  return value;
}

function requireTimestamp(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Legacy conversation index ${field} must be a non-negative integer.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function emptyReport(
  sourceStatus: ConversationCatalogMigrationReport['sourceStatus'],
  sourcePath: string,
): ConversationCatalogMigrationReport {
  return {
    sourceStatus,
    sourcePath,
    backupPath: null,
    archivedPath: null,
    quarantinePath: null,
    sourceDiagnostic: null,
    importedCount: 0,
    tombstoneCount: 0,
    verifiedCount: 0,
    unrecoverable: [],
  };
}
