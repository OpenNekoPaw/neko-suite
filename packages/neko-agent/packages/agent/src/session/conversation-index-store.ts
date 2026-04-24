/**
 * ConversationIndexStore - Persistent metadata index for resume/recovery.
 *
 * Stores workDir -> conversationIds and per-conversation metadata in
 * ~/.neko/conversations-index.json. Message history remains in Journal.
 */

import type {
  ConversationIndexMeta,
  ConversationsIndexFile,
  ConversationMediaModelSelection,
} from './conversation-record';
import { getLogger } from '../utils/logger';

const logger = getLogger('ConversationIndexStore');

const INDEX_VERSION = 1;
const SAVE_DEBOUNCE_MS = 1000;

export interface ConversationIndexStoreFsOps {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  exists: (path: string) => Promise<boolean>;
}

export interface ConversationIndexStoreOptions extends ConversationIndexStoreFsOps {
  filePath: string;
}

export interface IConversationIndexStore {
  ensureWorkDir(workDir: string): Promise<void>;
  hasWorkDir(workDir: string): Promise<boolean>;
  upsert(meta: ConversationIndexMeta): Promise<void>;
  registerAlias(legacyConversationId: string, conversationId: string): Promise<void>;
  resolveId(conversationId: string): Promise<string | undefined>;
  getMeta(conversationId: string): Promise<ConversationIndexMeta | undefined>;
  listByWorkDir(workDir: string): Promise<ConversationIndexMeta[]>;
  delete(conversationId: string): Promise<void>;
  pruneWorkDir(workDir: string, limit: number): Promise<string[]>;
  flush(): Promise<void>;
  dispose(): Promise<void>;
}

export class ConversationIndexStore implements IConversationIndexStore {
  private readonly _options: ConversationIndexStoreOptions;
  private readonly _workspaces = new Map<string, string[]>();
  private readonly _conversations = new Map<string, ConversationIndexMeta>();
  private readonly _aliases = new Map<string, string>();
  private _initialized = false;
  private _dirty = false;
  private _saveTimer?: ReturnType<typeof setTimeout>;

  constructor(options: ConversationIndexStoreOptions) {
    this._options = options;
  }

  async ensureWorkDir(workDir: string): Promise<void> {
    await this._ensureInitialized();
    if (this._workspaces.has(workDir)) return;
    this._workspaces.set(workDir, []);
    this._scheduleSave();
  }

  async hasWorkDir(workDir: string): Promise<boolean> {
    await this._ensureInitialized();
    return this._workspaces.has(workDir);
  }

  async upsert(meta: ConversationIndexMeta): Promise<void> {
    await this._ensureInitialized();

    const existing = this._conversations.get(meta.conversationId);
    const nextMeta = existing ? mergeConversationMeta(existing, meta) : cloneConversationMeta(meta);

    let changed = false;
    if (!existing || !isSameConversationMeta(existing, nextMeta)) {
      this._conversations.set(meta.conversationId, nextMeta);
      changed = true;
    }

    const previousWorkDir = existing?.workDir;
    if (previousWorkDir && previousWorkDir !== nextMeta.workDir) {
      changed = this._removeFromWorkspace(previousWorkDir, meta.conversationId) || changed;
    }

    const workspaceIds = this._workspaces.get(nextMeta.workDir);
    if (!workspaceIds) {
      this._workspaces.set(nextMeta.workDir, [meta.conversationId]);
      changed = true;
    } else if (!workspaceIds.includes(meta.conversationId)) {
      workspaceIds.push(meta.conversationId);
      changed = true;
    }

    if (changed) {
      this._scheduleSave();
    }
  }

  async registerAlias(legacyConversationId: string, conversationId: string): Promise<void> {
    await this._ensureInitialized();
    if (
      legacyConversationId.length === 0 ||
      legacyConversationId === conversationId ||
      this._aliases.get(legacyConversationId) === conversationId
    ) {
      return;
    }

    this._aliases.set(legacyConversationId, conversationId);
    this._scheduleSave();
  }

  async resolveId(conversationId: string): Promise<string | undefined> {
    await this._ensureInitialized();

    let current = conversationId;
    const visited = new Set<string>();

    while (!visited.has(current)) {
      visited.add(current);

      if (this._conversations.has(current)) {
        return current;
      }

      const aliasTarget = this._aliases.get(current);
      if (!aliasTarget) {
        return current === conversationId ? undefined : current;
      }
      current = aliasTarget;
    }

    return conversationId;
  }

  async getMeta(conversationId: string): Promise<ConversationIndexMeta | undefined> {
    await this._ensureInitialized();
    const meta = this._conversations.get(conversationId);
    return meta ? cloneConversationMeta(meta) : undefined;
  }

  async listByWorkDir(workDir: string): Promise<ConversationIndexMeta[]> {
    await this._ensureInitialized();
    const conversationIds = this._workspaces.get(workDir) ?? [];
    return conversationIds
      .map((conversationId) => this._conversations.get(conversationId))
      .filter((meta): meta is ConversationIndexMeta => meta !== undefined)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((meta) => cloneConversationMeta(meta));
  }

  async delete(conversationId: string): Promise<void> {
    await this._ensureInitialized();

    const existing = this._conversations.get(conversationId);
    let changed = false;
    if (existing) {
      this._conversations.delete(conversationId);
      changed = true;
      changed = this._removeFromWorkspace(existing.workDir, conversationId) || changed;
    }

    changed = this._removeAlias(conversationId) || changed;
    changed = this._removeAliasesTargeting(conversationId) || changed;

    if (changed) {
      this._scheduleSave();
    }
  }

  async pruneWorkDir(workDir: string, limit: number): Promise<string[]> {
    await this._ensureInitialized();
    const conversationIds = this._workspaces.get(workDir);
    if (!conversationIds || conversationIds.length <= limit) {
      return [];
    }

    const sortedIds = conversationIds
      .map((conversationId) => ({
        conversationId,
        updatedAt: this._conversations.get(conversationId)?.updatedAt ?? 0,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((item) => item.conversationId);

    const keptIds = sortedIds.slice(0, limit);
    const removedIds = sortedIds.slice(limit);

    this._workspaces.set(workDir, keptIds);
    for (const conversationId of removedIds) {
      this._conversations.delete(conversationId);
      this._removeAliasesTargeting(conversationId);
    }

    if (removedIds.length > 0) {
      this._scheduleSave();
    }

    return removedIds;
  }

  async flush(): Promise<void> {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = undefined;
    }

    if (!this._dirty && this._initialized) {
      return;
    }

    const data: ConversationsIndexFile = {
      version: INDEX_VERSION,
      workspaces: Object.fromEntries(
        Array.from(this._workspaces.entries()).map(([workDir, conversationIds]) => [
          workDir,
          [...conversationIds],
        ]),
      ),
      conversations: Object.fromEntries(
        Array.from(this._conversations.entries()).map(([conversationId, meta]) => [
          conversationId,
          cloneConversationMeta(meta),
        ]),
      ),
      ...(this._aliases.size > 0 && {
        aliases: Object.fromEntries(Array.from(this._aliases.entries())),
      }),
    };

    await this._options.writeFile(this._options.filePath, JSON.stringify(data, null, 2));
    this._dirty = false;
  }

  async dispose(): Promise<void> {
    await this.flush();
  }

  private async _ensureInitialized(): Promise<void> {
    if (this._initialized) return;

    try {
      const fileExists = await this._options.exists(this._options.filePath);
      if (fileExists) {
        const content = await this._options.readFile(this._options.filePath);
        const parsed = JSON.parse(content) as Partial<ConversationsIndexFile>;

        if (parsed.workspaces && typeof parsed.workspaces === 'object') {
          for (const [workDir, conversationIds] of Object.entries(parsed.workspaces)) {
            if (Array.isArray(conversationIds)) {
              this._workspaces.set(
                workDir,
                conversationIds.filter((conversationId): conversationId is string => {
                  return typeof conversationId === 'string' && conversationId.length > 0;
                }),
              );
            }
          }
        }

        if (parsed.conversations && typeof parsed.conversations === 'object') {
          for (const [conversationId, meta] of Object.entries(parsed.conversations)) {
            const parsedMeta = parseConversationMeta(conversationId, meta);
            if (parsedMeta) {
              this._conversations.set(conversationId, parsedMeta);
            }
          }
        }

        if (parsed.aliases && typeof parsed.aliases === 'object') {
          for (const [legacyConversationId, conversationId] of Object.entries(parsed.aliases)) {
            if (
              typeof legacyConversationId === 'string' &&
              legacyConversationId.length > 0 &&
              typeof conversationId === 'string' &&
              conversationId.length > 0
            ) {
              this._aliases.set(legacyConversationId, conversationId);
            }
          }
        }
      }
    } catch (error) {
      logger.warn('Failed to load conversations index file', { error });
    }

    this._initialized = true;
  }

  private _removeFromWorkspace(workDir: string, conversationId: string): boolean {
    const conversationIds = this._workspaces.get(workDir);
    if (!conversationIds) return false;

    const nextIds = conversationIds.filter((id) => id !== conversationId);
    if (nextIds.length === conversationIds.length) {
      return false;
    }

    this._workspaces.set(workDir, nextIds);
    return true;
  }

  private _removeAlias(legacyConversationId: string): boolean {
    if (!this._aliases.has(legacyConversationId)) {
      return false;
    }

    this._aliases.delete(legacyConversationId);
    return true;
  }

  private _removeAliasesTargeting(conversationId: string): boolean {
    let removed = false;
    for (const [legacyConversationId, targetId] of this._aliases.entries()) {
      if (targetId === conversationId) {
        this._aliases.delete(legacyConversationId);
        removed = true;
      }
    }
    return removed;
  }

  private _scheduleSave(): void {
    this._dirty = true;
    if (this._saveTimer) return;

    this._saveTimer = setTimeout(() => {
      this._saveTimer = undefined;
      this.flush().catch((error) => {
        logger.error('Failed to save conversations index file', { error });
      });
    }, SAVE_DEBOUNCE_MS);
  }
}

function parseConversationMeta(
  conversationId: string,
  raw: unknown,
): ConversationIndexMeta | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  const data = raw as Partial<ConversationIndexMeta>;
  if (
    typeof data.title !== 'string' ||
    typeof data.workDir !== 'string' ||
    typeof data.createdAt !== 'number' ||
    typeof data.updatedAt !== 'number'
  ) {
    return undefined;
  }

  return {
    conversationId,
    title: data.title,
    workDir: data.workDir,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    messageCount: typeof data.messageCount === 'number' ? data.messageCount : 0,
    source: parseConversationSource(data.source),
    ...(data.mediaModelSelection && {
      mediaModelSelection: cloneMediaModelSelection(data.mediaModelSelection),
    }),
    ...(Array.isArray(data.tags) && {
      tags: data.tags.filter((tag): tag is string => typeof tag === 'string'),
    }),
  };
}

function parseConversationSource(source: unknown): ConversationIndexMeta['source'] {
  return source === 'extension' || source === 'tui' || source === 'journal-projection'
    ? source
    : 'journal-projection';
}

function mergeConversationMeta(
  existing: ConversationIndexMeta,
  next: ConversationIndexMeta,
): ConversationIndexMeta {
  return {
    ...existing,
    ...next,
    mediaModelSelection:
      next.mediaModelSelection !== undefined
        ? cloneMediaModelSelection(next.mediaModelSelection)
        : existing.mediaModelSelection
          ? cloneMediaModelSelection(existing.mediaModelSelection)
          : undefined,
    tags: next.tags ? [...next.tags] : existing.tags ? [...existing.tags] : undefined,
  };
}

function isSameConversationMeta(
  left: ConversationIndexMeta,
  right: ConversationIndexMeta,
): boolean {
  return (
    left.conversationId === right.conversationId &&
    left.title === right.title &&
    left.workDir === right.workDir &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt &&
    left.messageCount === right.messageCount &&
    left.source === right.source &&
    isSameMediaModelSelection(left.mediaModelSelection, right.mediaModelSelection) &&
    isSameTags(left.tags, right.tags)
  );
}

function isSameMediaModelSelection(
  left?: ConversationMediaModelSelection,
  right?: ConversationMediaModelSelection,
): boolean {
  return (
    left?.image === right?.image &&
    left?.video === right?.video &&
    left?.audio === right?.audio &&
    left?.music === right?.music
  );
}

function isSameTags(left?: readonly string[], right?: readonly string[]): boolean {
  if (left === right) return true;
  if (!left || !right) return !left && !right;
  if (left.length !== right.length) return false;
  return left.every((tag, index) => tag === right[index]);
}

function cloneConversationMeta(meta: ConversationIndexMeta): ConversationIndexMeta {
  return {
    ...meta,
    ...(meta.mediaModelSelection && {
      mediaModelSelection: cloneMediaModelSelection(meta.mediaModelSelection),
    }),
    ...(meta.tags && { tags: [...meta.tags] }),
  };
}

function cloneMediaModelSelection(
  selection: ConversationMediaModelSelection,
): ConversationMediaModelSelection {
  return { ...selection };
}
