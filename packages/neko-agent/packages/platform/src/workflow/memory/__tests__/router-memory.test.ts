import { describe, expect, it } from 'vitest';
import {
  RouterMemory,
  ROUTER_MEMORY_SECTION_KEY,
  extractSection,
  parseEntries,
  serialiseEntry,
  type RouterMemoryBackingStore,
  type RouterMemoryEntry,
} from '../router-memory';

function makeStore(initial: string | null = null): RouterMemoryBackingStore & {
  getWrittenContent(): string | null;
} {
  let content = initial;
  return {
    getContent: () => content,
    upsertEntry: async (key, body) => {
      content = `## ${key}\n${body}\n`;
    },
    getWrittenContent: () => content,
  };
}

const ENTRY: RouterMemoryEntry = {
  hash: 'abc',
  level: 'L2',
  reason: 'rule: fountain → L2',
  at: 100,
  source: 'rules',
  textLength: 1800,
};

// =============================================================================
// Unit parsing
// =============================================================================

describe('router-memory — parsing helpers', () => {
  it('round-trips an entry through serialise+parse', () => {
    const line = serialiseEntry(ENTRY);
    const parsed = parseEntries(line);
    expect(parsed).toEqual([ENTRY]);
  });

  it('parseEntries skips malformed / non-entry lines', () => {
    const section = [
      '- not-json',
      '- {"hash":"x","level":"L0","reason":"r","at":1,"source":"rules"}',
      'stray text',
      '- {"hash":"y","level":"L2","reason":"r","at":2,"source":"llm"}',
    ].join('\n');
    const parsed = parseEntries(section);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.hash).toBe('x');
    expect(parsed[1]?.hash).toBe('y');
  });

  it('extractSection returns only the named H2 body', () => {
    const md = `## other\nstuff\n\n## ${ROUTER_MEMORY_SECTION_KEY}\n- {"hash":"x","level":"L1","reason":"r","at":1,"source":"rules"}\n\n## after\nzzz`;
    const body = extractSection(md, ROUTER_MEMORY_SECTION_KEY);
    expect(body).toContain('"hash":"x"');
    expect(body).not.toContain('zzz');
    expect(body).not.toContain('stuff');
  });
});

// =============================================================================
// RouterMemory integration
// =============================================================================

describe('RouterMemory', () => {
  it('round-trips record → lookup', async () => {
    const store = makeStore();
    const mem = new RouterMemory(store);
    await mem.record(ENTRY);

    // Simulate reloading: the store now has content
    const reloaded = new RouterMemory({
      getContent: () => store.getWrittenContent(),
      upsertEntry: store.upsertEntry,
    });
    const hit = reloaded.lookup('abc');
    expect(hit?.level).toBe('L2');
    expect(hit?.reason).toBe('rule: fountain → L2');
  });

  it('returns undefined on lookup miss', () => {
    const mem = new RouterMemory(makeStore());
    expect(mem.lookup('nope')).toBeUndefined();
  });

  it('listRecent filters by level and source', async () => {
    const store = makeStore();
    const mem = new RouterMemory(store);
    await mem.record({ ...ENTRY, hash: 'a', level: 'L2', source: 'rules' });
    await mem.record({ ...ENTRY, hash: 'b', level: 'L3', source: 'llm' });
    await mem.record({ ...ENTRY, hash: 'c', level: 'L3', source: 'rules' });

    const reloaded = new RouterMemory({
      getContent: () => store.getWrittenContent(),
      upsertEntry: store.upsertEntry,
    });
    const l3 = reloaded.listRecent({ level: 'L3' });
    expect(l3.map((e) => e.hash)).toEqual(['c', 'b']); // newest-first
    const llm = reloaded.listRecent({ source: 'llm' });
    expect(llm).toHaveLength(1);
    expect(llm[0]?.hash).toBe('b');
  });

  it('trims to maxEntries', async () => {
    const store = makeStore();
    const mem = new RouterMemory(store, { maxEntries: 2 });
    await mem.record({ ...ENTRY, hash: '1' });
    await mem.record({ ...ENTRY, hash: '2' });
    await mem.record({ ...ENTRY, hash: '3' });

    const reloaded = new RouterMemory({
      getContent: () => store.getWrittenContent(),
      upsertEntry: store.upsertEntry,
    });
    const all = reloaded.listRecent({});
    expect(all.map((e) => e.hash)).toEqual(['3', '2']);
  });

  it('later lookups win over earlier collisions', async () => {
    const store = makeStore();
    const mem = new RouterMemory(store);
    await mem.record({ ...ENTRY, hash: 'dup', level: 'L0' });
    await mem.record({ ...ENTRY, hash: 'dup', level: 'L3', at: 200 });

    const reloaded = new RouterMemory({
      getContent: () => store.getWrittenContent(),
      upsertEntry: store.upsertEntry,
    });
    const hit = reloaded.lookup('dup');
    expect(hit?.level).toBe('L3');
  });

  it('deleteByHash removes all entries with that hash', async () => {
    const store = makeStore();
    const mem = new RouterMemory(store);
    await mem.record({ ...ENTRY, hash: 'a' });
    await mem.record({ ...ENTRY, hash: 'b' });
    await mem.record({ ...ENTRY, hash: 'a', at: 200 });

    const reloaded = new RouterMemory({
      getContent: () => store.getWrittenContent(),
      upsertEntry: store.upsertEntry,
    });
    const removed = await reloaded.deleteByHash('a');
    expect(removed).toBe(true);

    const finalMem = new RouterMemory({
      getContent: () => store.getWrittenContent(),
      upsertEntry: store.upsertEntry,
    });
    expect(finalMem.lookup('a')).toBeUndefined();
    expect(finalMem.lookup('b')).toBeDefined();
  });

  it('deleteByHash returns false on unknown hash', async () => {
    const mem = new RouterMemory(makeStore());
    const removed = await mem.deleteByHash('never');
    expect(removed).toBe(false);
  });

  it('clearAll empties the section', async () => {
    const store = makeStore();
    const mem = new RouterMemory(store);
    await mem.record({ ...ENTRY, hash: 'a' });
    await mem.record({ ...ENTRY, hash: 'b' });
    await mem.clearAll();

    const reloaded = new RouterMemory({
      getContent: () => store.getWrittenContent(),
      upsertEntry: store.upsertEntry,
    });
    expect(reloaded.count()).toBe(0);
    expect(reloaded.listRecent()).toEqual([]);
  });

  it('count reflects current entry total', async () => {
    const store = makeStore();
    const mem = new RouterMemory(store);
    expect(mem.count()).toBe(0);
    await mem.record({ ...ENTRY, hash: 'a' });
    const reloaded = new RouterMemory({
      getContent: () => store.getWrittenContent(),
      upsertEntry: store.upsertEntry,
    });
    expect(reloaded.count()).toBe(1);
  });
});
