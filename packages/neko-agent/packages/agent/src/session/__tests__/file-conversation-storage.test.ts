import { describe, expect, it, vi } from 'vitest';
import { FileConversationStorage } from '../file-conversation-storage';
import type { ConversationRecord } from '../conversation-record';
import { createLegacyConversationMigrationId } from '../conversation-id';

describe('FileConversationStorage', () => {
  it('prefers journal projection when available', async () => {
    const workDir = '/workspace/demo';
    const legacyPath = '/tmp/conversations/demo.json';
    const indexPath = '/tmp/conversations-index.json';
    const legacyRecord: ConversationRecord = {
      id: 'conv-1',
      version: 1,
      title: 'Legacy title',
      workDir,
      messages: [{ role: 'user', content: 'legacy history' }],
      createdAt: 1000,
      updatedAt: 1500,
      source: 'tui',
    };

    const { files, readFile, writeFile, exists } = createMemoryFs({
      [legacyPath]: JSON.stringify({ records: [legacyRecord] }),
    });

    const storage = new FileConversationStorage({
      workDir,
      filePath: legacyPath,
      indexFilePath: indexPath,
      legacySupportMode: 'runtime-fallback',
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
        filterEvents: vi.fn(),
      },
    });

    const loaded = await storage.load('conv-1');
    await storage.flush();

    expect(loaded).toEqual({
      id: 'conv-1',
      version: 2,
      title: 'Legacy title',
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

  it('falls back to the legacy file cache when projection has no summary', async () => {
    const workDir = '/workspace/demo';
    const legacyPath = '/tmp/conversations/demo.json';
    const indexPath = '/tmp/conversations-index.json';
    const legacyRecord: ConversationRecord = {
      id: 'conv-2',
      version: 1,
      title: 'Legacy only',
      workDir,
      messages: [{ role: 'user', content: 'legacy history' }],
      createdAt: 1000,
      updatedAt: 1500,
      source: 'extension',
    };

    const { readFile, writeFile, exists } = createMemoryFs({
      [legacyPath]: JSON.stringify({ records: [legacyRecord] }),
    });

    const storage = new FileConversationStorage({
      workDir,
      filePath: legacyPath,
      indexFilePath: indexPath,
      legacySupportMode: 'runtime-fallback',
      readFile,
      writeFile,
      exists,
      journalProjection: {
        projectToHistory: vi.fn().mockResolvedValue([]),
        projectToHistoryWithEventIds: vi.fn().mockResolvedValue({
          messages: [],
          messageEventIds: [],
        }),
        projectToSummary: vi.fn().mockResolvedValue(null),
        filterEvents: vi.fn(),
      },
    });

    const loaded = await storage.load('conv-2');
    await storage.flush();

    expect(loaded).toEqual(legacyRecord);
  });

  it('can disable journal projection and prefer the legacy record path', async () => {
    const workDir = '/workspace/demo';
    const legacyPath = '/tmp/conversations/demo.json';
    const indexPath = '/tmp/conversations-index.json';
    const legacyRecord: ConversationRecord = {
      id: 'conv-legacy-first',
      version: 1,
      title: 'Legacy preferred',
      workDir,
      messages: [{ role: 'user', content: 'legacy history' }],
      createdAt: 1000,
      updatedAt: 1500,
      source: 'extension',
    };

    const { readFile, writeFile, exists } = createMemoryFs({
      [legacyPath]: JSON.stringify({ records: [legacyRecord] }),
      [indexPath]: JSON.stringify({
        version: 1,
        workspaces: { [workDir]: ['conv-legacy-first'] },
        conversations: {
          'conv-legacy-first': {
            conversationId: 'conv-legacy-first',
            title: 'Indexed title',
            workDir,
            createdAt: 1000,
            updatedAt: 2000,
            messageCount: 2,
            source: 'journal-projection',
          },
        },
      }),
    });

    const journalProjection = {
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
        conversationId: 'conv-legacy-first',
        title: 'Journal title',
        createdAt: 900,
        updatedAt: 2000,
        messageCount: 2,
        source: 'journal-projection',
      }),
      filterEvents: vi.fn(),
    };

    const storage = new FileConversationStorage({
      workDir,
      filePath: legacyPath,
      indexFilePath: indexPath,
      journalAsSSOT: false,
      readFile,
      writeFile,
      exists,
      journalProjection,
    });

    const loaded = await storage.load('conv-legacy-first');
    await storage.flush();

    expect(loaded).toEqual(legacyRecord);
    expect(journalProjection.projectToSummary).not.toHaveBeenCalled();
  });

  it('ignores legacy JSON by default when no index or journal metadata exists', async () => {
    const workDir = '/workspace/demo';
    const legacyPath = '/tmp/conversations/demo.json';
    const indexPath = '/tmp/conversations-index.json';
    const legacyRecord: ConversationRecord = {
      id: 'conv-legacy-default-disabled',
      version: 1,
      title: 'Legacy ignored',
      workDir,
      messages: [{ role: 'user', content: 'legacy history' }],
      createdAt: 1000,
      updatedAt: 1500,
      source: 'extension',
    };

    const { files, readFile, writeFile, exists } = createMemoryFs({
      [legacyPath]: JSON.stringify({ records: [legacyRecord] }),
    });

    const storage = new FileConversationStorage({
      workDir,
      filePath: legacyPath,
      indexFilePath: indexPath,
      readFile,
      writeFile,
      exists,
    });

    const loaded = await storage.load(legacyRecord.id);
    await storage.flush();

    expect(loaded).toBeUndefined();

    const indexData = JSON.parse(files.get(indexPath) ?? '{}') as {
      workspaces?: Record<string, string[]>;
      conversations?: Record<string, unknown>;
    };
    expect(indexData.workspaces?.[workDir]).toEqual([]);
    expect(indexData.conversations ?? {}).toEqual({});
  });

  it('save updates conversations index without rewriting the legacy cache file', async () => {
    const workDir = '/workspace/demo';
    const legacyPath = '/tmp/conversations/demo.json';
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
      filePath: legacyPath,
      indexFilePath: indexPath,
      legacySupportMode: 'runtime-fallback',
      readFile,
      writeFile,
      exists,
    });

    await storage.save(record);
    await storage.flush();

    expect(files.has(legacyPath)).toBe(false);

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

  it('save also rewrites the legacy cache file when journalAsSSOT is disabled', async () => {
    const workDir = '/workspace/demo';
    const legacyPath = '/tmp/conversations/demo.json';
    const indexPath = '/tmp/conversations-index.json';
    const record: ConversationRecord = {
      id: 'conv-legacy-write',
      version: 1,
      title: 'Legacy cache write',
      workDir,
      messages: [{ role: 'user', content: 'hello legacy' }],
      createdAt: 3000,
      updatedAt: 3500,
      source: 'tui',
    };

    const { files, readFile, writeFile, exists } = createMemoryFs();

    const storage = new FileConversationStorage({
      workDir,
      filePath: legacyPath,
      indexFilePath: indexPath,
      journalAsSSOT: false,
      readFile,
      writeFile,
      exists,
    });

    await storage.save(record);
    await storage.flush();

    expect(files.get(legacyPath)).toContain('conv-legacy-write');
    expect(files.get(legacyPath)).toContain('hello legacy');
  });

  it('lists conversations from the index and journal instead of the legacy cache only', async () => {
    const workDir = '/workspace/demo';
    const legacyPath = '/tmp/conversations/demo.json';
    const indexPath = '/tmp/conversations-index.json';
    const { readFile, writeFile, exists } = createMemoryFs({
      [indexPath]: JSON.stringify({
        version: 1,
        workspaces: {
          [workDir]: ['conv-10'],
        },
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
      filePath: legacyPath,
      indexFilePath: indexPath,
      legacySupportMode: 'runtime-fallback',
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

  it('migrates legacy record IDs without journals to canonical IDs and keeps alias lookup', async () => {
    const workDir = '/workspace/demo';
    const legacyPath = '/tmp/conversations/demo.json';
    const indexPath = '/tmp/conversations-index.json';
    const legacyRecord: ConversationRecord = {
      id: 'conv-legacy-id',
      version: 1,
      title: 'Legacy only',
      workDir,
      messages: [{ role: 'user', content: 'legacy history' }],
      createdAt: 1000,
      updatedAt: 1500,
      source: 'extension',
    };
    const migratedId = createLegacyConversationMigrationId(
      workDir,
      legacyRecord.id,
      legacyRecord.createdAt,
    );
    const { files, readFile, writeFile, exists } = createMemoryFs({
      [legacyPath]: JSON.stringify({ records: [legacyRecord] }),
    });

    const storage = new FileConversationStorage({
      workDir,
      filePath: legacyPath,
      indexFilePath: indexPath,
      legacySupportMode: 'runtime-fallback',
      readFile,
      writeFile,
      exists,
      hasJournal: vi.fn().mockResolvedValue(false),
      journalProjection: {
        projectToHistory: vi.fn().mockResolvedValue([]),
        projectToHistoryWithEventIds: vi.fn().mockResolvedValue({
          messages: [],
          messageEventIds: [],
        }),
        projectToSummary: vi.fn().mockResolvedValue(null),
        filterEvents: vi.fn(),
      },
    });

    const loadedFromLegacyId = await storage.load('conv-legacy-id');
    const listed = await storage.list();
    await storage.flush();

    expect(loadedFromLegacyId).toEqual({
      ...legacyRecord,
      id: migratedId,
    });
    expect(listed).toEqual([
      {
        ...legacyRecord,
        id: migratedId,
      },
    ]);

    const indexData = JSON.parse(files.get(indexPath) ?? '{}') as {
      workspaces?: Record<string, string[]>;
      conversations?: Record<string, { title: string }>;
      aliases?: Record<string, string>;
    };
    expect(indexData.workspaces?.[workDir]).toEqual([migratedId]);
    expect(indexData.conversations?.[migratedId]).toMatchObject({
      title: 'Legacy only',
    });
    expect(indexData.aliases).toEqual({
      'conv-legacy-id': migratedId,
    });
  });

  it('keeps legacy IDs when a matching legacy journal already exists', async () => {
    const workDir = '/workspace/demo';
    const legacyPath = '/tmp/conversations/demo.json';
    const indexPath = '/tmp/conversations-index.json';
    const legacyRecord: ConversationRecord = {
      id: 'conv-with-journal',
      version: 1,
      title: 'Legacy journal',
      workDir,
      messages: [{ role: 'user', content: 'legacy history' }],
      createdAt: 1000,
      updatedAt: 1500,
      source: 'tui',
    };

    const { files, readFile, writeFile, exists } = createMemoryFs({
      [legacyPath]: JSON.stringify({ records: [legacyRecord] }),
    });

    const storage = new FileConversationStorage({
      workDir,
      filePath: legacyPath,
      indexFilePath: indexPath,
      legacySupportMode: 'runtime-fallback',
      readFile,
      writeFile,
      exists,
      hasJournal: vi.fn().mockImplementation(async (conversationId: string) => {
        return conversationId === 'conv-with-journal';
      }),
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
          messageEventIds: [['evt-20'], ['evt-21']],
        }),
        projectToSummary: vi.fn().mockResolvedValue({
          conversationId: 'conv-with-journal',
          title: 'Legacy journal',
          createdAt: 1000,
          updatedAt: 2000,
          messageCount: 2,
          source: 'journal-projection',
        }),
        filterEvents: vi.fn(),
      },
    });

    const loaded = await storage.load('conv-with-journal');
    await storage.flush();

    expect(loaded?.id).toBe('conv-with-journal');

    const indexData = JSON.parse(files.get(indexPath) ?? '{}') as {
      aliases?: Record<string, string>;
    };
    expect(indexData.aliases).toBeUndefined();
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
