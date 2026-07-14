import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveGlobalStorageLayout } from '@neko/shared';
import { M1_LOCAL_METADATA_MIGRATIONS } from '@neko/shared/local-metadata/sqlite';
import { createNodeSqliteLocalMetadataStore } from '@neko/shared/local-metadata/node-sqlite-local-metadata-store';
import { migrateLegacyConversationCatalog } from '../conversation-catalog-migration';
import { createConversationId } from '../conversation-id';
import { createNodeJournalStorage } from '../journal-storage';
import { createNodeSqliteConversationStorage } from '../node-sqlite-conversation-storage';

const WORKSPACE_ID = '9b2de3b5-5f50-4be4-9551-71fb5b512489';
const MIGRATED_AT = 1_752_379_200_000;
const temporaryDirectories: string[] = [];

async function createTemporaryHome(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'neko-conversation-migration-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('legacy conversation catalog migration', () => {
  it('backs up a valid legacy index and projects it without mutating the Journal', async () => {
    const homedir = await createTemporaryHome();
    const workDir = join(homedir, 'workspace');
    await mkdir(workDir, { recursive: true });
    const store = createNodeSqliteLocalMetadataStore({ homedir });
    await store.open({
      databasePath: resolveGlobalStorageLayout(homedir).database,
      busyTimeoutMs: 1_000,
    });
    await store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    const binding = await createNodeSqliteConversationStorage({
      homedir,
      workDir,
      source: 'vscode',
      metadataStore: store,
      createWorkspaceId: () => WORKSPACE_ID,
    });
    const journals = createNodeJournalStorage(join(homedir, '.neko', 'journals'));
    const writer = journals.createWriter('legacy-conversation');
    await writer.appendEvent(1, { type: 'user_message', content: 'Recover the old catalog' });
    await writer.appendEvent(2, { type: 'text', content: 'Projected from Journal events.' });
    await writer.flush();
    const journalPath = journals.getJournalPath('legacy-conversation');
    const journalBeforeMigration = await readFile(journalPath, 'utf8');
    const legacyPath = join(homedir, '.neko', 'conversations-index.json');
    await writeFile(
      legacyPath,
      JSON.stringify({
        version: 1,
        workspaces: { [workDir]: ['legacy-conversation'] },
        conversations: {
          'legacy-conversation': {
            conversationId: 'legacy-conversation',
            title: 'Recovered legacy conversation',
            workDir,
            createdAt: 1_752_364_800_000,
            updatedAt: 1_752_368_400_000,
            messageCount: 2,
            source: 'extension',
            tags: ['legacy'],
          },
        },
      }),
      'utf8',
    );

    const report = await migrateLegacyConversationCatalog({
      homedir,
      workDir,
      workspaceId: WORKSPACE_ID,
      metadataStore: store,
      now: () => MIGRATED_AT,
    });

    expect(report).toMatchObject({
      sourceStatus: 'migrated',
      importedCount: 1,
      tombstoneCount: 0,
      verifiedCount: 1,
      unrecoverable: [
        {
          conversationId: 'legacy-conversation',
          fields: ['workspaceId', 'catalogTitle', 'source', 'modelSelection', 'tags'],
        },
      ],
    });
    await expect(access(report.backupPath!)).resolves.toBeUndefined();
    await expect(access(report.archivedPath!)).resolves.toBeUndefined();
    await expect(access(legacyPath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(JSON.parse(await readFile(report.backupPath!, 'utf8'))).toMatchObject({ version: 1 });
    await expect(binding.storage.list()).resolves.toEqual([
      expect.objectContaining({
        id: 'legacy-conversation',
        title: 'Recovered legacy conversation',
        messages: [
          expect.objectContaining({ role: 'user', content: 'Recover the old catalog' }),
          expect.objectContaining({ role: 'assistant', content: 'Projected from Journal events.' }),
        ],
      }),
    ]);
    await expect(readFile(journalPath, 'utf8')).resolves.toBe(journalBeforeMigration);
    await expect(
      journals.createProjection().projectToConversationMetadata('legacy-conversation'),
    ).resolves.toBeNull();

    await store.dispose();
  });

  it.each([
    ['zero-byte', ''],
    ['truncated', '{"version":1'],
  ])(
    'quarantines a %s legacy index and rebuilds active Journal metadata',
    async (_case, content) => {
      const homedir = await createTemporaryHome();
      const workDir = join(homedir, 'workspace');
      await mkdir(workDir, { recursive: true });
      const store = createNodeSqliteLocalMetadataStore({ homedir });
      await store.open({
        databasePath: resolveGlobalStorageLayout(homedir).database,
        busyTimeoutMs: 1_000,
      });
      await store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
      const binding = await createNodeSqliteConversationStorage({
        homedir,
        workDir,
        source: 'vscode',
        metadataStore: store,
        createWorkspaceId: () => WORKSPACE_ID,
      });
      const journals = createNodeJournalStorage(join(homedir, '.neko', 'journals'));
      const activeWriter = journals.createWriter('active-conversation');
      await activeWriter.appendEvent(1, {
        type: 'user_message',
        content: 'Keep this conversation',
      });
      await activeWriter.appendConversationMetadata({
        version: 1,
        conversationId: 'active-conversation',
        journalId: 'active-conversation',
        workspaceId: WORKSPACE_ID,
        title: 'Active Journal conversation',
        source: 'tui',
        createdAt: 1_752_364_800_000,
        updatedAt: 1_752_368_400_000,
        messageCount: 1,
        modelSelection: { chat: null, media: null },
        tags: [],
        lifecycle: { state: 'active', deletedAt: null },
      });
      await activeWriter.flush();
      const deletedWriter = journals.createWriter('deleted-conversation');
      const deletedMetadata = {
        version: 1,
        conversationId: 'deleted-conversation',
        journalId: 'deleted-conversation',
        workspaceId: WORKSPACE_ID,
        title: 'Deleted Journal conversation',
        source: 'vscode',
        createdAt: 1_752_364_800_000,
        updatedAt: 1_752_368_400_000,
        messageCount: 1,
        modelSelection: { chat: null, media: null },
        tags: [],
        lifecycle: { state: 'active', deletedAt: null },
      } as const;
      await deletedWriter.appendConversationMetadata(deletedMetadata);
      await deletedWriter.appendConversationMetadata({
        ...deletedMetadata,
        updatedAt: 1_752_372_000_000,
        lifecycle: { state: 'deleted', deletedAt: 1_752_372_000_000 },
      });
      await deletedWriter.flush();
      const legacyPath = join(homedir, '.neko', 'conversations-index.json');
      await writeFile(legacyPath, content, 'utf8');

      const report = await migrateLegacyConversationCatalog({
        homedir,
        workDir,
        workspaceId: WORKSPACE_ID,
        metadataStore: store,
        now: () => MIGRATED_AT,
      });

      expect(report).toMatchObject({
        sourceStatus: 'quarantined',
        importedCount: 1,
        tombstoneCount: 1,
        verifiedCount: 1,
        unrecoverable: [],
      });
      await expect(access(report.backupPath!)).resolves.toBeUndefined();
      await expect(access(report.quarantinePath!)).resolves.toBeUndefined();
      await expect(access(legacyPath)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(binding.storage.list()).resolves.toEqual([
        expect.objectContaining({
          id: 'active-conversation',
          title: 'Active Journal conversation',
        }),
      ]);

      await store.dispose();
    },
  );

  it('rebuilds a missing index from canonical Journal history exactly once', async () => {
    const homedir = await createTemporaryHome();
    const workDir = join(homedir, 'workspace');
    await mkdir(workDir, { recursive: true });
    const store = createNodeSqliteLocalMetadataStore({ homedir });
    await store.open({
      databasePath: resolveGlobalStorageLayout(homedir).database,
      busyTimeoutMs: 1_000,
    });
    await store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    const binding = await createNodeSqliteConversationStorage({
      homedir,
      workDir,
      source: 'vscode',
      metadataStore: store,
      createWorkspaceId: () => WORKSPACE_ID,
    });
    const conversationId = createConversationId(workDir, {
      now: 1_752_364_800_000,
      random: new Uint8Array(10).fill(7),
    });
    const writer = createNodeJournalStorage(join(homedir, '.neko', 'journals')).createWriter(
      conversationId,
    );
    await writer.appendEvent(1, {
      type: 'user_message',
      content: 'Derive a title from this Journal',
    });
    await writer.flush();
    const journalPath = join(homedir, '.neko', 'journals', `${conversationId}.jsonl`);
    const journalBeforeMigration = await readFile(journalPath, 'utf8');

    const first = await migrateLegacyConversationCatalog({
      homedir,
      workDir,
      workspaceId: WORKSPACE_ID,
      metadataStore: store,
      now: () => MIGRATED_AT,
    });
    const second = await migrateLegacyConversationCatalog({
      homedir,
      workDir,
      workspaceId: WORKSPACE_ID,
      metadataStore: store,
      now: () => MIGRATED_AT + 1,
    });

    expect(first).toMatchObject({
      sourceStatus: 'absent',
      importedCount: 1,
      verifiedCount: 1,
      unrecoverable: [
        {
          conversationId,
          fields: ['catalogTitle', 'source', 'modelSelection', 'tags'],
        },
      ],
    });
    expect(second).toMatchObject({ sourceStatus: 'not-required', importedCount: 0 });
    await expect(binding.storage.list()).resolves.toEqual([
      expect.objectContaining({
        id: conversationId,
        title: 'Derive a title from this Journal',
      }),
    ]);
    await expect(readFile(journalPath, 'utf8')).resolves.toBe(journalBeforeMigration);

    await store.dispose();
  });
});
