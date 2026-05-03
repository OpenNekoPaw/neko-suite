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
