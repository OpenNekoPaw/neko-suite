/**
 * FileConversationStorage - Resume storage backed by conversations index +
 * Journal projection.
 */

import type { ConversationRecord, ConversationIndexMeta } from './conversation-record';
import type { ConversationSummary, IJournalProjection } from './journal-projection';
import { JournalProjection } from './journal-projection';
import { ConversationIndexStore, type IConversationIndexStore } from './conversation-index-store';
import { getLogger } from '../utils/logger';

const logger = getLogger('FileConversationStorage');

/** Maximum number of conversations retained per workDir (oldest pruned first). */
const MAX_RECORDS = 100;

export interface FileConversationStorageOptions {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  exists: (path: string) => Promise<boolean>;
  /** Primary metadata index path: ~/.neko/conversations-index.json */
  indexFilePath: string;
  workDir: string;
  journalProjection?: IJournalProjection;
  indexStore?: IConversationIndexStore;
}

/**
 * Persistent conversation storage with Journal as the primary history source.
 * Writes only metadata into the global conversations index.
 */
export class FileConversationStorage {
  private readonly _options: FileConversationStorageOptions;
  private readonly _indexStore: IConversationIndexStore;
  private readonly _cache = new Map<string, ConversationRecord>();
  private _initialized = false;

  constructor(options: FileConversationStorageOptions) {
    this._options = options;
    this._indexStore =
      options.indexStore ??
      new ConversationIndexStore({
        filePath: options.indexFilePath,
        readFile: options.readFile,
        writeFile: options.writeFile,
        exists: options.exists,
      });
  }

  async save(record: ConversationRecord): Promise<void> {
    await this._ensureInitialized();
    this._cache.set(record.id, cloneRecord(record));
    await this._indexStore.upsert(recordToIndexMeta(record));
    await this._pruneIfNeeded();
  }

  async load(id: string): Promise<ConversationRecord | undefined> {
    await this._ensureInitialized();

    const meta = await this._indexStore.getMeta(id);
    if (meta) {
      return this._loadFromMeta(meta);
    }

    const cached = this._cache.get(id);
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
    this._cache.delete(id);
    await this._indexStore.delete(id);
  }

  async flush(): Promise<void> {
    await this._indexStore.flush();
  }

  async dispose(): Promise<void> {
    await this._indexStore.dispose();
  }

  private async _ensureInitialized(): Promise<void> {
    if (this._initialized) return;

    if (!(await this._indexStore.hasWorkDir(this._options.workDir))) {
      await this._indexStore.ensureWorkDir(this._options.workDir);
    }

    this._initialized = true;
  }

  private async _loadFromMeta(
    meta: ConversationIndexMeta,
  ): Promise<ConversationRecord | undefined> {
    const projected = await this._projectFromJournal(meta);
    if (projected) {
      this._cache.set(projected.id, cloneRecord(projected));
      return projected;
    }

    const cached = this._cache.get(meta.conversationId);
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
    }
  }
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

/**
 * Create a FileConversationStorage for the given workDir.
 * Runtime defaults to Journal + conversations-index.json only.
 */
export function createFileConversationStorage(workDir: string): FileConversationStorage {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const os = require('os') as typeof import('os');

  const indexFilePath = path.join(os.homedir(), '.neko', 'conversations-index.json');
  const journalsDir = path.join(os.homedir(), '.neko', 'journals');

  return new FileConversationStorage({
    indexFilePath,
    workDir,
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
  });
}
