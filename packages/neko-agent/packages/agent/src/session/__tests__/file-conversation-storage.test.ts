import { describe, expect, it, vi } from 'vitest';
import { FileConversationStorage } from '../file-conversation-storage';
import type { ConversationRecord } from '../conversation-record';

describe('FileConversationStorage', () => {
  it('projects records from journal metadata when indexed', async () => {
    const workDir = '/workspace/demo';
    const indexPath = '/tmp/conversations-index.json';
    const { files, readFile, writeFile, exists } = createMemoryFs({
      [indexPath]: JSON.stringify({
        version: 1,
        workspaces: { [workDir]: ['conv-1'] },
        conversations: {
          'conv-1': {
            conversationId: 'conv-1',
            title: 'Indexed title',
            workDir,
            createdAt: 1000,
            updatedAt: 1500,
            messageCount: 1,
            source: 'tui',
          },
        },
      }),
    });

    const storage = new FileConversationStorage({
      workDir,
      indexFilePath: indexPath,
      readFile,
      writeFile,
      exists,
      journalProjection: {
        projectToHistory: vi.fn().mockResolvedValue([
          { role: 'user', content: 'journal history' },
          { role: 'assistant', content: 'journal answer' },
        ]),
        projectToHistoryWithEventIds: vi.fn().mockResolvedValue({
          messages: [
            { role: 'user', content: 'journal history' },
            { role: 'assistant', content: 'journal answer' },
          ],
          messageEventIds: [['evt-1'], ['evt-2']],
        }),
        projectToSummary: vi.fn().mockResolvedValue({
          conversationId: 'conv-1',
          title: 'Journal title',
          createdAt: 900,
          updatedAt: 2000,
          messageCount: 2,
          source: 'journal-projection',
        }),
        projectAgentFirstGraph: vi.fn().mockResolvedValue(emptyAgentFirstGraph('conv-1')),
        scanAgentFirstIntegrity: vi.fn().mockResolvedValue(emptyIntegrityScan('conv-1')),
        filterEvents: vi.fn(),
      },
    });

    const loaded = await storage.load('conv-1');
    await storage.flush();

    expect(loaded).toEqual({
      id: 'conv-1',
      version: 2,
      title: 'Indexed title',
      workDir,
      messages: [
        { role: 'user', content: 'journal history' },
        { role: 'assistant', content: 'journal answer' },
      ],
      messageEventIds: [['evt-1'], ['evt-2']],
      createdAt: 1000,
      updatedAt: 2000,
      source: 'journal-projection',
    });

    const indexData = JSON.parse(files.get(indexPath) ?? '{}') as {
      conversations?: Record<string, { updatedAt: number; messageCount: number }>;
    };
    expect(indexData.conversations?.['conv-1']).toMatchObject({
      updatedAt: 2000,
      messageCount: 2,
    });
  });

  it('initializes an empty index when no index metadata exists', async () => {
    const workDir = '/workspace/demo';
    const indexPath = '/tmp/conversations-index.json';

    const { files, readFile, writeFile, exists } = createMemoryFs();

    const storage = new FileConversationStorage({
      workDir,
      indexFilePath: indexPath,
      readFile,
      writeFile,
      exists,
    });

    const loaded = await storage.load('conv-old-json');
    await storage.flush();

    expect(loaded).toBeUndefined();

    const indexData = JSON.parse(files.get(indexPath) ?? '{}') as {
      workspaces?: Record<string, string[]>;
      conversations?: Record<string, unknown>;
    };
    expect(indexData.workspaces?.[workDir]).toEqual([]);
    expect(indexData.conversations ?? {}).toEqual({});
  });

  it('save updates conversations index without writing the old record file', async () => {
    const workDir = '/workspace/demo';
    const indexPath = '/tmp/conversations-index.json';
    const record: ConversationRecord = {
      id: 'conv-3',
      version: 1,
      title: 'New conversation',
      workDir,
      messages: [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
      ],
      createdAt: 3000,
      updatedAt: 3500,
      source: 'tui',
    };

    const { files, readFile, writeFile, exists } = createMemoryFs();

    const storage = new FileConversationStorage({
      workDir,
      indexFilePath: indexPath,
      readFile,
      writeFile,
      exists,
    });

    await storage.save(record);
    await storage.flush();

    const indexData = JSON.parse(files.get(indexPath) ?? '{}') as {
      workspaces?: Record<string, string[]>;
      conversations?: Record<string, { title: string; messageCount: number }>;
    };
    expect(indexData.workspaces?.[workDir]).toEqual(['conv-3']);
    expect(indexData.conversations?.['conv-3']).toMatchObject({
      title: 'New conversation',
      messageCount: 2,
    });
  });

  it('falls back to cached records when journal projection is unavailable', async () => {
    const workDir = '/workspace/demo';
    const indexPath = '/tmp/conversations-index.json';
    const record: ConversationRecord = {
      id: 'conv-memory-first',
      version: 1,
      title: 'Memory first',
      workDir,
      messages: [{ role: 'user', content: 'hello' }],
      createdAt: 3000,
      updatedAt: 3500,
      source: 'tui',
    };

    const { files, readFile, writeFile, exists } = createMemoryFs();

    const storage = new FileConversationStorage({
      workDir,
      indexFilePath: indexPath,
      readFile,
      writeFile,
      exists,
    });

    await storage.save(record);

    expect(await storage.load(record.id)).toEqual(record);
    await storage.flush();
  });

  it('lists conversations from the index and journal projection', async () => {
    const workDir = '/workspace/demo';
    const indexPath = '/tmp/conversations-index.json';
    const { readFile, writeFile, exists } = createMemoryFs({
      [indexPath]: JSON.stringify({
        version: 1,
        workspaces: { [workDir]: ['conv-10'] },
        conversations: {
          'conv-10': {
            conversationId: 'conv-10',
            title: 'Indexed conversation',
            workDir,
            createdAt: 5000,
            updatedAt: 6000,
            messageCount: 2,
            source: 'tui',
          },
        },
      }),
    });

    const storage = new FileConversationStorage({
      workDir,
      indexFilePath: indexPath,
      readFile,
      writeFile,
      exists,
      journalProjection: {
        projectToHistory: vi.fn().mockResolvedValue([
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'world' },
        ]),
        projectToHistoryWithEventIds: vi.fn().mockResolvedValue({
          messages: [
            { role: 'user', content: 'hello' },
            { role: 'assistant', content: 'world' },
          ],
          messageEventIds: [['evt-10'], ['evt-11']],
        }),
        projectToSummary: vi.fn().mockResolvedValue({
          conversationId: 'conv-10',
          title: 'Indexed conversation',
          createdAt: 5000,
          updatedAt: 6000,
          messageCount: 2,
          source: 'journal-projection',
        }),
        projectAgentFirstGraph: vi.fn().mockResolvedValue(emptyAgentFirstGraph('conv-10')),
        scanAgentFirstIntegrity: vi.fn().mockResolvedValue(emptyIntegrityScan('conv-10')),
        filterEvents: vi.fn(),
      },
    });

    const records = await storage.list();
    await storage.flush();

    expect(records).toEqual([
      {
        id: 'conv-10',
        version: 2,
        title: 'Indexed conversation',
        workDir,
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'world' },
        ],
        messageEventIds: [['evt-10'], ['evt-11']],
        createdAt: 5000,
        updatedAt: 6000,
        source: 'journal-projection',
      },
    ]);
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

function emptyAgentFirstGraph(conversationId: string) {
  return {
    conversationId,
    observations: [],
    evidence: [],
    rationales: [],
  };
}

function emptyIntegrityScan(conversationId: string) {
  return {
    conversationId,
    issues: [],
  };
}
