/**
 * RouterMemory — read/write for the Router's dedicated H2 section of
 * `.neko/memory.md` (section key: "workflow-router").
 *
 * Each entry is a single line beginning with `- ` and a compact JSON object.
 * Lines not matching this shape are preserved verbatim on rewrite so an
 * accidentally hand-edited memory file isn't reformatted aggressively.
 *
 * Entry shape:
 *   { hash, level, reason, at, source, textLength? }
 *
 *   hash        — stable input hash (see input-hash.ts)
 *   level       — RouteLevel that was committed
 *   reason      — short reason the router surfaced ("long text → L3", etc.)
 *   at          — ms timestamp
 *   source      — 'rules' | 'llm' | 'user-override'
 *   textLength  — optional, handy for aggregate stats
 *
 * The LLMRouter writes on commit; the Router-level facade reads on decide().
 */

import type { RouteLevel } from '../types';

// =============================================================================
// Entry shape
// =============================================================================

export type RouterMemorySource = 'rules' | 'llm' | 'user-override' | 'memory';

export interface RouterMemoryEntry {
  readonly hash: string;
  readonly level: RouteLevel;
  readonly reason: string;
  readonly at: number;
  readonly source: RouterMemorySource;
  readonly textLength?: number;
}

export interface RouterMemoryQuery {
  /** Max number of entries to return (most recent first). */
  limit?: number;
  /** Filter by level */
  level?: RouteLevel;
  /** Filter by source */
  source?: RouterMemorySource;
}

// =============================================================================
// Backing store contract
// =============================================================================

export const ROUTER_MEMORY_SECTION_KEY = 'workflow-router';

/** Minimal contract — matches the subset of IProjectMemoryManager we need. */
export interface RouterMemoryBackingStore {
  getContent(): string | null;
  upsertEntry(key: string, content: string): Promise<void>;
}

// =============================================================================
// Implementation
// =============================================================================

export interface RouterMemoryOptions {
  /** Keep at most this many entries in the section (oldest trimmed first). */
  maxEntries?: number;
}

export class RouterMemory {
  private readonly maxEntries: number;

  constructor(
    private readonly store: RouterMemoryBackingStore,
    options: RouterMemoryOptions = {},
  ) {
    this.maxEntries = options.maxEntries ?? 100;
  }

  /** Return the most recent entry matching `hash`, or undefined. */
  lookup(hash: string): RouterMemoryEntry | undefined {
    const entries = this.readAll();
    // Walk newest-to-oldest so hash collisions never return a stale entry.
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry && entry.hash === hash) return entry;
    }
    return undefined;
  }

  /** List entries matching the query (most recent first). */
  listRecent(query: RouterMemoryQuery = {}): RouterMemoryEntry[] {
    const entries = this.readAll();
    const out: RouterMemoryEntry[] = [];
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      if (!e) continue;
      if (query.level !== undefined && e.level !== query.level) continue;
      if (query.source !== undefined && e.source !== query.source) continue;
      out.push(e);
      if (query.limit !== undefined && out.length >= query.limit) break;
    }
    return out;
  }

  /** Record a new entry; the section is trimmed to maxEntries on overflow. */
  async record(entry: RouterMemoryEntry): Promise<void> {
    const entries = this.readAll();
    entries.push(entry);
    while (entries.length > this.maxEntries) entries.shift();
    const body = entries.map(serialiseEntry).join('\n');
    await this.store.upsertEntry(ROUTER_MEMORY_SECTION_KEY, body);
  }

  /** Remove a single entry by hash.  No-op if not found. */
  async deleteByHash(hash: string): Promise<boolean> {
    const entries = this.readAll();
    const next = entries.filter((e) => e.hash !== hash);
    if (next.length === entries.length) return false;
    const body = next.map(serialiseEntry).join('\n');
    await this.store.upsertEntry(ROUTER_MEMORY_SECTION_KEY, body);
    return true;
  }

  /** Drop every entry (section body reset to empty).  Preserves the H2 header. */
  async clearAll(): Promise<void> {
    await this.store.upsertEntry(ROUTER_MEMORY_SECTION_KEY, '');
  }

  /** Count entries currently stored. */
  count(): number {
    return this.readAll().length;
  }

  // ---------------------------------------------------------------------------

  private readAll(): RouterMemoryEntry[] {
    const content = this.store.getContent();
    if (!content) return [];
    const section = extractSection(content, ROUTER_MEMORY_SECTION_KEY);
    if (section === undefined) return [];
    return parseEntries(section);
  }
}

// =============================================================================
// Internals — exposed for tests
// =============================================================================

export function serialiseEntry(entry: RouterMemoryEntry): string {
  const payload: Record<string, unknown> = {
    hash: entry.hash,
    level: entry.level,
    reason: entry.reason,
    at: entry.at,
    source: entry.source,
  };
  if (entry.textLength !== undefined) payload['textLength'] = entry.textLength;
  return `- ${JSON.stringify(payload)}`;
}

export function parseEntries(section: string): RouterMemoryEntry[] {
  const out: RouterMemoryEntry[] = [];
  for (const line of section.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('- ')) continue;
    try {
      const json = JSON.parse(trimmed.slice(2)) as Record<string, unknown>;
      if (!isValidEntry(json)) continue;
      out.push(json as unknown as RouterMemoryEntry);
    } catch {
      // Skip malformed lines rather than exploding — memory files can be
      // hand-edited by curious users.
      continue;
    }
  }
  return out;
}

function isValidEntry(obj: Record<string, unknown>): boolean {
  return (
    typeof obj['hash'] === 'string' &&
    typeof obj['level'] === 'string' &&
    typeof obj['reason'] === 'string' &&
    typeof obj['at'] === 'number' &&
    typeof obj['source'] === 'string'
  );
}

/**
 * Extract a single H2 section's body from a full Markdown document.
 * Returns undefined when the section is absent.
 */
export function extractSection(content: string, key: string): string | undefined {
  const lines = content.split('\n');
  let inside = false;
  const collected: string[] = [];
  for (const line of lines) {
    const match = /^## (.+)$/.exec(line);
    if (match) {
      if (inside) break; // next H2 ends the section
      if (match[1] === key) {
        inside = true;
        continue;
      }
    } else if (inside) {
      collected.push(line);
    }
  }
  if (!inside && collected.length === 0) return undefined;
  return collected.join('\n').trim();
}
