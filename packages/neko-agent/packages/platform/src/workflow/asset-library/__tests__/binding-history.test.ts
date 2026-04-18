import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { BindingHistory, createMemoryFileIO } from '../binding-history';

describe('BindingHistory', () => {
  let history: BindingHistory;
  let io: ReturnType<typeof createMemoryFileIO>;
  const path = '/test/.neko/.cache/bindings.json';

  beforeEach(async () => {
    io = createMemoryFileIO();
    history = new BindingHistory({ filePath: path, fileIO: io, debounceMs: 1 });
    await history.load();
  });

  afterEach(() => {
    history.dispose();
  });

  it('upsert stores a binding', async () => {
    const b = await history.upsert({
      shotId: 'shot_1',
      slot: 'character',
      entityId: 'alice',
      assetId: 'alice_casual',
      provenance: 'L1',
      confidence: 0.95,
      userConfirmed: false,
    });
    expect(b.id).toMatch(/^bind_shot_1_character_/);
    expect(b.timestamp).toBeGreaterThan(0);

    const found = history.find({ entityId: 'alice' });
    expect(found).toHaveLength(1);
    expect(found[0]?.assetId).toBe('alice_casual');
  });

  it('upsert replaces existing binding for same (shotId, slot)', async () => {
    await history.upsert({
      shotId: 'shot_1',
      slot: 'character',
      entityId: 'alice',
      assetId: 'alice_old',
      provenance: 'L2',
      confidence: 0.7,
      userConfirmed: false,
    });
    await history.upsert({
      shotId: 'shot_1',
      slot: 'character',
      entityId: 'alice',
      assetId: 'alice_new',
      provenance: 'user',
      confidence: 1.0,
      userConfirmed: true,
    });

    const all = history.find({ entityId: 'alice' });
    expect(all).toHaveLength(1);
    expect(all[0]?.assetId).toBe('alice_new');
    expect(all[0]?.userConfirmed).toBe(true);
  });

  it('find returns results sorted newest-first', async () => {
    await history.upsert({
      shotId: 'shot_1',
      slot: 'character',
      entityId: 'alice',
      assetId: 'a1',
      provenance: 'L1',
      confidence: 0.9,
      userConfirmed: false,
      timestamp: 1000,
    });
    await history.upsert({
      shotId: 'shot_2',
      slot: 'character',
      entityId: 'alice',
      assetId: 'a2',
      provenance: 'L1',
      confidence: 0.9,
      userConfirmed: false,
      timestamp: 2000,
    });
    const found = history.find({ entityId: 'alice' });
    expect(found[0]?.shotId).toBe('shot_2');
    expect(found[1]?.shotId).toBe('shot_1');
  });

  it('find honors limit', async () => {
    for (let i = 0; i < 5; i++) {
      await history.upsert({
        shotId: `shot_${i}`,
        slot: 'character',
        entityId: 'alice',
        assetId: 'a',
        provenance: 'L1',
        confidence: 0.9,
        userConfirmed: false,
        timestamp: 1000 + i,
      });
    }
    expect(history.find({ entityId: 'alice', limit: 2 })).toHaveLength(2);
  });

  it('findSiblings returns bindings from same sceneGroup, excluding the query shot', async () => {
    await history.upsert({
      shotId: 'shot_1',
      slot: 'character',
      entityId: 'alice',
      assetId: 'a1',
      provenance: 'L1',
      confidence: 0.9,
      userConfirmed: false,
      sceneGroupId: 'group_A',
    });
    await history.upsert({
      shotId: 'shot_2',
      slot: 'character',
      entityId: 'alice',
      assetId: 'a2',
      provenance: 'L5',
      confidence: 0.9,
      userConfirmed: false,
      sceneGroupId: 'group_A',
    });
    await history.upsert({
      shotId: 'shot_3',
      slot: 'character',
      entityId: 'alice',
      assetId: 'a3',
      provenance: 'L1',
      confidence: 0.9,
      userConfirmed: false,
      sceneGroupId: 'group_B',
    });

    const siblings = history.findSiblings('shot_1');
    expect(siblings.map((b) => b.shotId)).toEqual(['shot_2']);
  });

  it('LRU trims excess bindings per (entity, slot)', async () => {
    const lru = new BindingHistory({
      filePath: path,
      fileIO: io,
      debounceMs: 1,
      maxPerEntitySlot: 3,
    });
    await lru.load();

    for (let i = 0; i < 5; i++) {
      await lru.upsert({
        shotId: `shot_${i}`,
        slot: 'character',
        entityId: 'alice',
        assetId: `a${i}`,
        provenance: 'L1',
        confidence: 0.9,
        userConfirmed: false,
        timestamp: 1000 + i,
      });
    }

    const all = lru.find({ entityId: 'alice' });
    expect(all).toHaveLength(3);
    // LRU keeps the newest 3
    expect(all.map((b) => b.shotId).sort()).toEqual(['shot_2', 'shot_3', 'shot_4']);

    lru.dispose();
  });

  it('flush persists to the underlying fileIO', async () => {
    await history.upsert({
      shotId: 's',
      slot: 'character',
      entityId: 'e',
      assetId: 'a',
      provenance: 'L1',
      confidence: 0.9,
      userConfirmed: false,
    });
    await history.flush();
    const stored = io.store.get(path);
    expect(stored).toBeDefined();
    const parsed = JSON.parse(stored!);
    expect(parsed.version).toBe(1);
    expect(parsed.bindings).toHaveLength(1);
  });

  it('reloads from persisted file', async () => {
    await history.upsert({
      shotId: 's',
      slot: 'character',
      entityId: 'e',
      assetId: 'a',
      provenance: 'L1',
      confidence: 0.9,
      userConfirmed: false,
    });
    await history.flush();

    const h2 = new BindingHistory({ filePath: path, fileIO: io, debounceMs: 1 });
    await h2.load();
    expect(h2.find({ entityId: 'e' })).toHaveLength(1);
    h2.dispose();
  });

  it('handles corrupt file gracefully', async () => {
    await io.write(path, '{ malformed json');
    const h = new BindingHistory({ filePath: path, fileIO: io, debounceMs: 1 });
    await h.load();
    expect(h.find({})).toHaveLength(0);
    h.dispose();
  });

  it('ignores file missing (ENOENT)', async () => {
    const h = new BindingHistory({ filePath: '/nonexistent/file.json', fileIO: io, debounceMs: 1 });
    await h.load();
    expect(h.find({})).toHaveLength(0);
    h.dispose();
  });
});
