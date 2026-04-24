/**
 * FileConversationStorage - Resume storage backed by conversations index +
 * Journal projection. Legacy per-workDir JSON is migration-only.
 */

import type {
  ConversationRecord,
  ConversationIndexMeta,
  ConversationIndex,
} from './conversation-record';
import type { ConversationSummary, IJournalProjection } from './journal-projection';
import { JournalProjection } from './journal-projection';
import { createLegacyConversationMigrationId, isCanonicalConversationId } from './conversation-id';
import { ConversationIndexStore, type IConversationIndexStore } from './conversation-index-store';
import { getLogger } from '../utils/logger';

const logger = getLogger('FileConversationStorage');

/** Maximum number of conversations retained per workDir (oldest pruned first) */
const MAX_RECORDS = 100;

export type LegacyConversationSupportMode = 'disabled' | 'migration-only' | 'runtime-fallback';

export interface FileConversationStorageOptions {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  exists: (path: string) => Promise<boolean>;
  hasJournal?: (conversationId: string) => Promise<boolean>;
  /**
   * Legacy migration file path: ~/.neko/conversations/<workDir-hash>.json
   *
   * Only read when `legacySupportMode` is enabled explicitly.
   */
  filePath: string;
  /** Primary metadata index path: ~/.neko/conversations-index.json */
  indexFilePath?: string;
  workDir: string;
  journalProjection?: IJournalProjection;
  indexStore?: IConversationIndexStore;
  /**
   * Whether Journal projection is the primary read path.
   * false = prefer legacy Record-first loading/writing as a rollback hatch.
   */
  journalAsSSOT?: boolean;
  /**
   * Legacy compatibility policy:
   * - disabled: runtime ignores legacy conversation JSON
   * - migration-only: import journal-backed legacy IDs into the new index
   * - runtime-fallback: allow legacy JSON as a read fallback (compat only)
   */
  legacySupportMode?: LegacyConversationSupportMode;
}

/**
 * Persistent conversation storage with Journal as the primary history source.
 * Writes only metadata into the global conversations index.
 */
export class FileConversationStorage {
  private readonly _options: FileConversationStorageOptions;
  private readonly _indexStore: IConversationIndexStore;
  private readonly _legacySupportMode: LegacyConversationSupportMode;
  private readonly _journalAsSSOT: boolean;
  private readonly _cache = new Map<string, ConversationRecord>();
  private readonly _legacyCache = new Map<string, ConversationRecord>();
  private _initialized = false;

  constructor(options: FileConversationStorageOptions) {
    this._options = options;
    this._journalAsSSOT = options.journalAsSSOT ?? true;
    this._legacySupportMode =
      options.legacySupportMode ?? (this._journalAsSSOT ? 'disabled' : 'runtime-fallback');
    this._indexStore =
      options.indexStore ??
      new ConversationIndexStore({
        filePath: resolveIndexFilePath(options),
        readFile: options.readFile,
        writeFile: options.writeFile,
        exists: options.exists,
      });
  }

  async save(record: ConversationRecord): Promise<void> {
    await this._ensureInitialized();
    this._cache.set(record.id, cloneRecord(record));
    if (!this._journalAsSSOT) {
      await this._upsertLegacyRecord(record);
      this._legacyCache.set(record.id, cloneRecord(record));
    }
    await this._indexStore.upsert(recordToIndexMeta(record));
    await this._pruneIfNeeded();
  }

  async load(id: string): Promise<ConversationRecord | undefined> {
    await this._ensureInitialized();

    const resolvedId = (await this._indexStore.resolveId(id)) ?? id;
    const meta = await this._indexStore.getMeta(resolvedId);
    if (meta) {
      return this._loadFromMeta(meta);
    }

    const cached =
      this._cache.get(resolvedId) ??
      this._cache.get(id) ??
      this._legacyCache.get(resolvedId) ??
      this._legacyCache.get(id);
    return cached ? cloneRecord(cached) : undefined;
  }

  /** Returns all records sorted by updatedAt descending (newest first) */
  async list(): Promise<ConversationRecord[]> {
    await this._ensureInitialized();

    const metas = await this._indexStore.listByWorkDir(this._options.workDir);
    const records: ConversationRecord[] = [];

    for (const meta of metas) {
      const record = await this._loadFromMeta(meta);
      if (record) {
        records.push(record);
      }
    }

    return records.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async delete(id: string): Promise<void> {
    await this._ensureInitialized();
    const resolvedId = (await this._indexStore.resolveId(id)) ?? id;
    this._cache.delete(id);
    this._cache.delete(resolvedId);
    this._legacyCache.delete(id);
    this._legacyCache.delete(resolvedId);
    if (!this._journalAsSSOT) {
      await this._deleteLegacyRecords([id, resolvedId]);
    }
    await this._indexStore.delete(resolvedId);
  }

  async flush(): Promise<void> {
    await this._indexStore.flush();
  }

  async dispose(): Promise<void> {
    await this._indexStore.dispose();
  }

  private async _ensureInitialized(): Promise<void> {
    if (this._initialized) return;

    let hasIndexedRecords = false;

    if (this._legacySupportMode !== 'disabled') {
      const legacyRecords = await this._loadLegacyRecords();
      for (const legacyRecord of legacyRecords) {
        if (legacyRecord.aliasFrom) {
          const existingLegacyMeta = await this._indexStore.getMeta(legacyRecord.aliasFrom);
          if (existingLegacyMeta) {
            await this._indexStore.delete(legacyRecord.aliasFrom);
          }
          await this._indexStore.registerAlias(legacyRecord.aliasFrom, legacyRecord.record.id);
        }

        const existingMeta = await this._indexStore.getMeta(legacyRecord.record.id);
        if (!existingMeta) {
          await this._indexStore.upsert(recordToIndexMeta(legacyRecord.record));
        }
        hasIndexedRecords = true;
      }
      if (legacyRecords.length > 0) {
        await this._pruneIfNeeded();
      }
    }

    if (!hasIndexedRecords && !(await this._indexStore.hasWorkDir(this._options.workDir))) {
      await this._indexStore.ensureWorkDir(this._options.workDir);
    }

    this._initialized = true;
  }

  private async _loadLegacyRecords(): Promise<LoadedLegacyRecord[]> {
    try {
      const fileExists = await this._options.exists(this._options.filePath);
      if (!fileExists) {
        return [];
      }

      const content = await this._options.readFile(this._options.filePath);
      const index = JSON.parse(content) as ConversationIndex;
      const records = Array.isArray(index.records) ? index.records : [];
      const loadedRecords: LoadedLegacyRecord[] = [];

      for (const record of records) {
        const normalized = await normalizeLegacyRecord(
          record,
          this._options.hasJournal,
          this._legacySupportMode,
        );
        if (!normalized) {
          continue;
        }
        if (this._legacySupportMode === 'runtime-fallback') {
          this._legacyCache.set(record.id, cloneRecord(record));
          this._legacyCache.set(normalized.record.id, cloneRecord(normalized.record));
        }
        loadedRecords.push(normalized);
      }

      return loadedRecords;
    } catch (error) {
      logger.warn('Failed to load legacy conversation storage file', { error });
      return [];
    }
  }

  private async _loadFromMeta(
    meta: ConversationIndexMeta,
  ): Promise<ConversationRecord | undefined> {
    if (!this._journalAsSSOT) {
      const cached =
        this._cache.get(meta.conversationId) ?? this._legacyCache.get(meta.conversationId);
      return cached ? cloneRecord(cached) : undefined;
    }

    const projected = await this._projectFromJournal(meta);
    if (projected) {
      this._cache.set(projected.id, cloneRecord(projected));
      return projected;
    }

    const cached =
      this._cache.get(meta.conversationId) ?? this._legacyCache.get(meta.conversationId);
    return cached ? cloneRecord(cached) : undefined;
  }

  private async _projectFromJournal(
    meta: ConversationIndexMeta,
  ): Promise<ConversationRecord | undefined> {
    if (!this._options.journalProjection) {
      return undefined;
    }

    try {
      const summary = await this._options.journalProjection.projectToSummary(meta.conversationId);
      if (!summary) {
        return undefined;
      }

      const nextMeta = mergeMetaWithSummary(meta, summary);
      await this._indexStore.upsert(nextMeta);

      const projectedHistory = await this._options.journalProjection.projectToHistoryWithEventIds(
        meta.conversationId,
      );
      return {
        id: meta.conversationId,
        version: 2,
        title: nextMeta.title,
        workDir: nextMeta.workDir,
        messages: projectedHistory.messages,
        ...(projectedHistory.messageEventIds.some((eventIds) => eventIds.length > 0) && {
          messageEventIds: projectedHistory.messageEventIds,
        }),
        createdAt: nextMeta.createdAt,
        updatedAt: nextMeta.updatedAt,
        source: 'journal-projection',
        ...(nextMeta.mediaModelSelection && {
          mediaModelSelection: { ...nextMeta.mediaModelSelection },
        }),
      };
    } catch (error) {
      logger.warn('Failed to project conversation from journal, falling back to cached record', {
        id: meta.conversationId,
        error,
      });
      return undefined;
    }
  }

  private async _pruneIfNeeded(): Promise<void> {
    const removedIds = await this._indexStore.pruneWorkDir(this._options.workDir, MAX_RECORDS);
    for (const conversationId of removedIds) {
      this._cache.delete(conversationId);
      this._legacyCache.delete(conversationId);
    }
    if (!this._journalAsSSOT && removedIds.length > 0) {
      await this._deleteLegacyRecords(removedIds);
    }
  }

  private async _readLegacyIndex(): Promise<ConversationIndex> {
    try {
      const fileExists = await this._options.exists(this._options.filePath);
      if (!fileExists) {
        return { records: [] };
      }

      const content = await this._options.readFile(this._options.filePath);
      const parsed = JSON.parse(content) as ConversationIndex;
      return {
        records: Array.isArray(parsed.records)
          ? parsed.records.map((record) => cloneRecord(record))
          : [],
      };
    } catch (error) {
      logger.warn('Failed to read legacy conversation file; starting from empty index', {
        filePath: this._options.filePath,
        error,
      });
      return { records: [] };
    }
  }

  private async _writeLegacyIndex(index: ConversationIndex): Promise<void> {
    await this._options.writeFile(this._options.filePath, JSON.stringify(index, null, 2));
  }

  private async _upsertLegacyRecord(record: ConversationRecord): Promise<void> {
    const legacyIndex = await this._readLegacyIndex();
    const nextRecords = legacyIndex.records.filter((entry) => entry.id !== record.id);
    nextRecords.push(cloneRecord(record));
    nextRecords.sort((left, right) => right.updatedAt - left.updatedAt);
    await this._writeLegacyIndex({ records: nextRecords.slice(0, MAX_RECORDS) });
  }

  private async _deleteLegacyRecords(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    const idSet = new Set(ids);
    const legacyIndex = await this._readLegacyIndex();
    const nextRecords = legacyIndex.records.filter((record) => !idSet.has(record.id));
    await this._writeLegacyIndex({ records: nextRecords });
  }
}

/**
 * Compute a short stable hash for a workDir path, used as the filename component.
 */
function hashWorkDir(workDir: string): string {
  // Lazy require to avoid issues in non-Node environments
  const crypto = require('crypto') as typeof import('crypto');
  return crypto.createHash('sha1').update(workDir).digest('hex').slice(0, 8);
}

function resolveIndexFilePath(options: FileConversationStorageOptions): string {
  if (options.indexFilePath) {
    return options.indexFilePath;
  }

  const path = require('path') as typeof import('path');
  return path.join(path.dirname(path.dirname(options.filePath)), 'conversations-index.json');
}

function recordToIndexMeta(record: ConversationRecord): ConversationIndexMeta {
  return {
    conversationId: record.id,
    title: record.title,
    workDir: record.workDir,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    messageCount: countNonSystemMessages(record.messages),
    source: record.source,
    ...(record.mediaModelSelection && {
      mediaModelSelection: { ...record.mediaModelSelection },
    }),
  };
}

function mergeMetaWithSummary(
  meta: ConversationIndexMeta,
  summary: ConversationSummary,
): ConversationIndexMeta {
  return {
    ...meta,
    title: meta.title.trim().length > 0 ? meta.title : summary.title,
    createdAt: meta.createdAt || summary.createdAt,
    updatedAt: summary.updatedAt,
    messageCount: summary.messageCount,
  };
}

function countNonSystemMessages(messages: ConversationRecord['messages']): number {
  return messages.filter((message) => message.role !== 'system').length;
}

function cloneRecord(record: ConversationRecord): ConversationRecord {
  return {
    ...record,
    messages: [...record.messages],
    ...(record.messageEventIds && {
      messageEventIds: record.messageEventIds.map((eventIds) => [...eventIds]),
    }),
    ...(record.mediaModelSelection && {
      mediaModelSelection: { ...record.mediaModelSelection },
    }),
  };
}

interface LoadedLegacyRecord {
  record: ConversationRecord;
  aliasFrom?: string;
}

async function normalizeLegacyRecord(
  record: ConversationRecord,
  hasJournal?: (conversationId: string) => Promise<boolean>,
  legacySupportMode: LegacyConversationSupportMode = 'disabled',
): Promise<LoadedLegacyRecord | null> {
  const clonedRecord = cloneRecord(record);

  if (legacySupportMode === 'disabled') {
    return null;
  }

  if (legacySupportMode === 'migration-only') {
    if (!hasJournal) {
      return null;
    }
    return (await hasJournal(clonedRecord.id)) ? { record: clonedRecord } : null;
  }

  if (isCanonicalConversationId(clonedRecord.id) || !hasJournal) {
    return { record: clonedRecord };
  }

  if (await hasJournal(clonedRecord.id)) {
    return { record: clonedRecord };
  }

  const migratedId = createLegacyConversationMigrationId(
    clonedRecord.workDir,
    clonedRecord.id,
    clonedRecord.createdAt,
  );

  return {
    aliasFrom: clonedRecord.id,
    record: {
      ...clonedRecord,
      id: migratedId,
    },
  };
}

/**
 * Create a FileConversationStorage for the given workDir.
 * Runtime defaults to Journal + conversations-index.json only.
 * Legacy conversations JSON is ignored unless explicitly re-enabled.
 */
export interface CreateFileConversationStorageOptions {
  legacySupportMode?: LegacyConversationSupportMode;
  journalAsSSOT?: boolean;
}

export function createFileConversationStorage(
  workDir: string,
  options?: CreateFileConversationStorageOptions,
): FileConversationStorage {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const os = require('os') as typeof import('os');

  const hash = hashWorkDir(workDir);
  const legacyFilePath = path.join(os.homedir(), '.neko', 'conversations', `${hash}.json`);
  const indexFilePath = path.join(os.homedir(), '.neko', 'conversations-index.json');
  const journalsDir = path.join(os.homedir(), '.neko', 'journals');

  return new FileConversationStorage({
    filePath: legacyFilePath,
    indexFilePath,
    workDir,
    legacySupportMode:
      options?.legacySupportMode ??
      (options?.journalAsSSOT === false ? 'runtime-fallback' : 'disabled'),
    journalAsSSOT: options?.journalAsSSOT,
    readFile: (p) => fs.promises.readFile(p, 'utf-8'),
    writeFile: async (p, content) => {
      await fs.promises.mkdir(path.dirname(p), { recursive: true });
      await fs.promises.writeFile(p, content, 'utf-8');
    },
    exists: async (p) => {
      try {
        await fs.promises.access(p);
        return true;
      } catch {
        return false;
      }
    },
    hasJournal: async (conversationId) => {
      try {
        await fs.promises.access(path.join(journalsDir, `${conversationId}.jsonl`));
        return true;
      } catch {
        return false;
      }
    },
    ...(options?.journalAsSSOT === false
      ? {}
      : {
          journalProjection: new JournalProjection(journalsDir, {
            readFile: (p) => fs.promises.readFile(p, 'utf-8'),
            exists: async (p) => {
              try {
                await fs.promises.access(p);
                return true;
              } catch {
                return false;
              }
            },
          }),
        }),
  });
}
