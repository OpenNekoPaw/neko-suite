import { describe, expect, it } from 'vitest';
import { createArtifactIndexStore } from '../artifact-index-store';

describe('ArtifactIndexStore', () => {
  it('writes formatted snapshots to the canonical cache file', async () => {
    const writes: Array<{ path: string; data: string; encoding: string }> = [];
    const dirs: string[] = [];
    const store = createArtifactIndexStore({
      filePath: '/r/.neko/cache/artifact-index.json',
      now: () => 42,
      fsOps: {
        async mkdir(path: string): Promise<void> {
          dirs.push(path);
        },
        async writeFile(path: string, data: string, encoding: 'utf-8'): Promise<void> {
          writes.push({ path, data, encoding });
        },
      },
    });

    store.replace([
      {
        kind: 'draft',
        runId: 'run-1',
        artifactId: 'draft-1',
        path: '/r/.neko/drafts/draft-run-1.md',
        updatedAt: 12,
        title: 'Launch teaser',
        status: 'pending_review',
        domain: 'cut',
      },
    ]);
    await store.flush();

    expect(dirs).toEqual(['/r/.neko/cache']);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual(
      expect.objectContaining({
        path: '/r/.neko/cache/artifact-index.json',
        encoding: 'utf-8',
      }),
    );

    const parsed = JSON.parse(writes[0]!.data) as {
      schemaVersion: number;
      updatedAt: number;
      entries: Array<{ artifactId: string; title?: string }>;
    };
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.updatedAt).toBe(42);
    expect(parsed.entries).toEqual([
      expect.objectContaining({
        artifactId: 'draft-1',
        title: 'Launch teaser',
      }),
    ]);
  });

  it('keeps the last queued snapshot on disk order', async () => {
    const writes: string[] = [];
    const store = createArtifactIndexStore({
      filePath: '/r/.neko/cache/artifact-index.json',
      fsOps: {
        async mkdir(): Promise<void> {},
        async writeFile(_path: string, data: string, _encoding: 'utf-8'): Promise<void> {
          writes.push(data);
        },
      },
    });

    store.replace([
      {
        kind: 'draft',
        runId: 'run-1',
        artifactId: 'draft-1',
        path: '/r/.neko/drafts/draft-run-1.md',
        updatedAt: 1,
        title: 'First',
        status: 'pending_review',
        domain: 'cut',
      },
    ]);
    store.replace([
      {
        kind: 'plan',
        runId: 'run-1',
        artifactId: 'plan-1',
        path: '/r/.neko/plans/plan-run-1.md',
        updatedAt: 2,
        title: 'Second',
        status: 'ready',
        draftId: 'draft-1',
      },
    ]);
    await store.flush();

    expect(writes).toHaveLength(2);
    const last = JSON.parse(writes[1]!) as { entries: Array<{ kind: string; artifactId: string }> };
    expect(last.entries).toEqual([
      expect.objectContaining({
        kind: 'plan',
        artifactId: 'plan-1',
      }),
    ]);
  });
});
