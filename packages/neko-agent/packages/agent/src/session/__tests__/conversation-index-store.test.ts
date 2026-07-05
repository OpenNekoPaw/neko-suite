import { describe, expect, it, vi } from 'vitest';
import { ConversationIndexStore } from '../conversation-index-store';

describe('ConversationIndexStore', () => {
  it('lists conversations for a workDir sorted by updatedAt descending', async () => {
    const indexPath = '/tmp/conversations-index.json';
    const { readFile, writeFile, exists } = createMemoryFs();
    const store = new ConversationIndexStore({
      filePath: indexPath,
      readFile,
      writeFile,
      exists,
    });

    await store.upsert({
      conversationId: 'conv-1',
      title: 'Older',
      workDir: '/workspace/demo',
      createdAt: 1000,
      updatedAt: 2000,
      messageCount: 2,
      source: 'tui',
    });
    await store.upsert({
      conversationId: 'conv-2',
      title: 'Newer',
      workDir: '/workspace/demo',
      createdAt: 1500,
      updatedAt: 3000,
      messageCount: 4,
      source: 'extension',
    });

    const listed = await store.listByWorkDir('/workspace/demo');

    expect(listed.map((meta) => meta.conversationId)).toEqual(['conv-2', 'conv-1']);
  });

  it('keeps an empty workDir mapping after deleting the last conversation', async () => {
    const indexPath = '/tmp/conversations-index.json';
    const { files, readFile, writeFile, exists } = createMemoryFs();
    const store = new ConversationIndexStore({
      filePath: indexPath,
      readFile,
      writeFile,
      exists,
    });

    await store.ensureWorkDir('/workspace/demo');
    await store.upsert({
      conversationId: 'conv-1',
      title: 'Only conversation',
      workDir: '/workspace/demo',
      createdAt: 1000,
      updatedAt: 2000,
      messageCount: 1,
      source: 'tui',
    });
    await store.delete('conv-1');
    await store.flush();

    expect(await store.hasWorkDir('/workspace/demo')).toBe(true);
    expect(await store.listByWorkDir('/workspace/demo')).toEqual([]);

    const indexData = JSON.parse(files.get(indexPath) ?? '{}') as {
      workspaces?: Record<string, string[]>;
      conversations?: Record<string, unknown>;
    };
    expect(indexData.workspaces?.['/workspace/demo']).toEqual([]);
    expect(indexData.conversations).toEqual({});
  });

  it('prunes the oldest conversations when a workDir exceeds the limit', async () => {
    const indexPath = '/tmp/conversations-index.json';
    const { readFile, writeFile, exists } = createMemoryFs();
    const store = new ConversationIndexStore({
      filePath: indexPath,
      readFile,
      writeFile,
      exists,
    });

    await store.upsert({
      conversationId: 'conv-1',
      title: 'One',
      workDir: '/workspace/demo',
      createdAt: 1000,
      updatedAt: 1000,
      messageCount: 1,
      source: 'tui',
    });
    await store.upsert({
      conversationId: 'conv-2',
      title: 'Two',
      workDir: '/workspace/demo',
      createdAt: 2000,
      updatedAt: 2000,
      messageCount: 1,
      source: 'tui',
    });
    await store.upsert({
      conversationId: 'conv-3',
      title: 'Three',
      workDir: '/workspace/demo',
      createdAt: 3000,
      updatedAt: 3000,
      messageCount: 1,
      source: 'tui',
    });

    const removed = await store.pruneWorkDir('/workspace/demo', 2);
    const listed = await store.listByWorkDir('/workspace/demo');

    expect(removed).toEqual(['conv-1']);
    expect(listed.map((meta) => meta.conversationId)).toEqual(['conv-3', 'conv-2']);
    expect(await store.getMeta('conv-1')).toBeUndefined();
  });

  it('rejects stale whole-file writers before overwriting another conversation partition', async () => {
    const indexPath = '/tmp/conversations-index.json';
    const { files, readFile, writeFile, exists } = createMemoryFs();
    const firstWriter = new ConversationIndexStore({
      filePath: indexPath,
      readFile,
      writeFile,
      exists,
      writerId: 'writer-a',
      now: () => 3000,
    });
    const secondWriter = new ConversationIndexStore({
      filePath: indexPath,
      readFile,
      writeFile,
      exists,
      writerId: 'writer-b',
      now: () => 4000,
    });

    await firstWriter.upsert({
      conversationId: 'conv-a',
      title: 'First writer',
      workDir: '/workspace/demo',
      createdAt: 1000,
      updatedAt: 1000,
      messageCount: 1,
      source: 'extension',
    });
    await secondWriter.upsert({
      conversationId: 'conv-b',
      title: 'Second writer',
      workDir: '/workspace/demo',
      createdAt: 2000,
      updatedAt: 2000,
      messageCount: 1,
      source: 'tui',
    });

    await firstWriter.flush();
    await expect(secondWriter.flush()).rejects.toMatchObject({
      code: 'stale-json-file-write',
      details: {
        filePath: indexPath,
        ownerId: 'writer-b',
        loadedRevision: 0,
        currentRevision: 1,
        currentOwnerId: 'writer-a',
      },
    });

    const persisted = JSON.parse(files.get(indexPath) ?? '{}') as {
      writeMetadata?: { ownerId: string; revision: number };
      workspaces?: Record<string, string[]>;
      conversations?: Record<string, unknown>;
    };
    expect(persisted.writeMetadata).toEqual(
      expect.objectContaining({ ownerId: 'writer-a', revision: 1 }),
    );
    expect(persisted.workspaces?.['/workspace/demo']).toEqual(['conv-a']);
    expect(Object.keys(persisted.conversations ?? {})).toEqual(['conv-a']);
    expect(await firstWriter.getMeta('conv-a')).toEqual(
      expect.objectContaining({ conversationId: 'conv-a' }),
    );
  });
});

function createMemoryFs(initialFiles?: Record<string, string>): {
  files: Map<string, string>;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  exists: (path: string) => Promise<boolean>;
} {
  const files = new Map<string, string>(Object.entries(initialFiles ?? {}));

  return {
    files,
    readFile: vi.fn(async (path: string) => {
      const content = files.get(path);
      if (content === undefined) {
        throw new Error(`File not found: ${path}`);
      }
      return content;
    }),
    writeFile: vi.fn(async (path: string, content: string) => {
      files.set(path, content);
    }),
    exists: vi.fn(async (path: string) => files.has(path)),
  };
}
