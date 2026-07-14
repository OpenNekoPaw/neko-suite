import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import {
  resolveGlobalStorageLayout,
  type SerializableTask,
  type TaskRecoveryInfo,
  type TaskRunScope,
} from '@neko/shared';
import { M1_LOCAL_METADATA_MIGRATIONS } from '@neko/shared/local-metadata/sqlite';
import { createNodeSqliteLocalMetadataStore } from '@neko/shared/vscode/extension';
import {
  SqliteConversationStorage,
  createNodeSqliteConversationStorage,
  createNodeJournalStorage,
  type ConversationRecord,
} from '@neko/agent';
import { createExtensionConversationResume } from '../extensionConversationResume';

const WORKSPACE_ID = '9b2de3b5-5f50-4be4-9551-71fb5b512489';
const temporaryDirectories: string[] = [];
const execFileAsync = promisify(execFile);

async function createTemporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('SqliteConversationStorage', () => {
  it('saves searchable catalog metadata and resumes authoritative Journal history', async () => {
    const homedir = await createTemporaryDirectory('neko-conversation-db-');
    const workDir = join(homedir, 'workspace');
    await mkdir(workDir, { recursive: true });
    const journalsDir = join(homedir, '.neko', 'journals');
    const journalStorage = createNodeJournalStorage(journalsDir);
    const metadataStore = createNodeSqliteLocalMetadataStore({ homedir });
    await metadataStore.open({
      databasePath: resolveGlobalStorageLayout(homedir).database,
      busyTimeoutMs: 1_000,
    });
    await metadataStore.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);

    const journalWriter = journalStorage.createWriter('conversation-1');
    await journalWriter.appendEvent(1, { type: 'user_message', content: 'Design SQLite storage' });
    await journalWriter.appendEvent(2, { type: 'text', content: 'Use one user database.' });
    await journalWriter.flush();

    const { storage, workspaceIdentity } = await createNodeSqliteConversationStorage({
      homedir,
      workDir,
      source: 'vscode',
      metadataStore,
      createWorkspaceId: () => WORKSPACE_ID,
    });
    expect(storage).toBeInstanceOf(SqliteConversationStorage);
    expect(workspaceIdentity.workspaceId).toBe(WORKSPACE_ID);
    const record: ConversationRecord = {
      id: 'conversation-1',
      version: 2,
      title: 'SQLite storage design',
      workDir,
      messages: [
        { role: 'user', content: 'Design SQLite storage' },
        { role: 'assistant', content: 'Use one user database.' },
      ],
      createdAt: 1_752_364_800_000,
      updatedAt: 1_752_368_400_000,
      source: 'extension',
      chatModelSelection: { providerId: 'openai', modelId: 'gpt-5' },
      mediaModelSelection: { image: 'gpt-image-1' },
      tags: ['storage'],
    };

    await storage.save(record);

    await expect(storage.search('SQLite')).resolves.toEqual([
      expect.objectContaining({
        id: 'conversation-1',
        title: 'SQLite storage design',
        messages: record.messages,
        chatModelSelection: { providerId: 'openai', modelId: 'gpt-5' },
        mediaModelSelection: { image: 'gpt-image-1' },
        tags: ['storage'],
      }),
    ]);
    await expect(storage.load('conversation-1')).resolves.toMatchObject({
      id: 'conversation-1',
      source: 'journal-projection',
      messages: record.messages,
    });
    await expect(
      metadataStore.readPartitionRevision({
        scope: 'workspace',
        workspaceId: WORKSPACE_ID,
        domain: 'conversations',
      }),
    ).resolves.toMatchObject({ revision: 1, freshness: 'fresh' });

    await metadataStore.dispose();
  });

  it('persists an authoritative Journal tombstone before removing the catalog row', async () => {
    const homedir = await createTemporaryDirectory('neko-conversation-delete-');
    const workDir = join(homedir, 'workspace');
    await mkdir(workDir, { recursive: true });
    const journalStorage = createNodeJournalStorage(join(homedir, '.neko', 'journals'));
    const metadataStore = createNodeSqliteLocalMetadataStore({ homedir });
    await metadataStore.open({
      databasePath: resolveGlobalStorageLayout(homedir).database,
      busyTimeoutMs: 1_000,
    });
    await metadataStore.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    const writer = journalStorage.createWriter('conversation-delete');
    await writer.appendEvent(1, { type: 'user_message', content: 'Delete this conversation' });
    await writer.flush();
    const { storage } = await createNodeSqliteConversationStorage({
      homedir,
      workDir,
      source: 'vscode',
      metadataStore,
      createWorkspaceId: () => WORKSPACE_ID,
    });
    await storage.save({
      id: 'conversation-delete',
      version: 2,
      title: 'Conversation to delete',
      workDir,
      messages: [{ role: 'user', content: 'Delete this conversation' }],
      createdAt: 1_752_364_800_000,
      updatedAt: 1_752_368_400_000,
      source: 'extension',
    });

    await storage.delete('conversation-delete');

    await expect(
      journalStorage.createProjection().projectToConversationMetadata('conversation-delete'),
    ).resolves.toMatchObject({
      lifecycle: { state: 'deleted', deletedAt: expect.any(Number) },
    });
    await metadataStore.repositories.conversations.upsert({
      conversationId: 'conversation-delete',
      workspaceId: WORKSPACE_ID,
      journalId: 'conversation-delete',
      title: 'Stale catalog row',
      source: 'vscode',
      model: null,
      createdAt: new Date(1_752_364_800_000).toISOString(),
      updatedAt: new Date(1_752_368_400_000).toISOString(),
    });
    await expect(storage.load('conversation-delete')).resolves.toBeUndefined();

    await metadataStore.dispose();
  });

  it('keeps Journal durability when the catalog projection fails', async () => {
    const homedir = await createTemporaryDirectory('neko-conversation-stale-catalog-');
    const workDir = join(homedir, 'workspace');
    await mkdir(workDir, { recursive: true });
    const journals = createNodeJournalStorage(join(homedir, '.neko', 'journals'));
    const eventWriter = journals.createWriter('conversation-stale-catalog');
    await eventWriter.appendEvent(1, {
      type: 'user_message',
      content: 'The Journal must remain authoritative',
    });
    await eventWriter.flush();
    const metadataStore = createNodeSqliteLocalMetadataStore({ homedir });
    await metadataStore.open({
      databasePath: resolveGlobalStorageLayout(homedir).database,
      busyTimeoutMs: 1_000,
    });
    await metadataStore.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    const { storage } = await createNodeSqliteConversationStorage({
      homedir,
      workDir,
      source: 'vscode',
      metadataStore,
      createWorkspaceId: () => WORKSPACE_ID,
    });
    await metadataStore.dispose();

    await expect(
      storage.save({
        id: 'conversation-stale-catalog',
        version: 2,
        title: 'Journal durable, catalog stale',
        workDir,
        messages: [{ role: 'user', content: 'The Journal must remain authoritative' }],
        createdAt: 1_752_364_800_000,
        updatedAt: 1_752_368_400_000,
        source: 'extension',
      }),
    ).resolves.toMatchObject({
      kind: 'authority-durable-projection-stale',
      diagnostic: {
        code: 'metadata-stale-projection',
        operation: 'save',
        conversationId: 'conversation-stale-catalog',
        authority: 'journal',
        rebuild: 'conversation-catalog',
      },
    });
    await expect(
      journals.createProjection().projectToConversationMetadata('conversation-stale-catalog'),
    ).resolves.toMatchObject({
      title: 'Journal durable, catalog stale',
      lifecycle: { state: 'active', deletedAt: null },
    });
  });

  it('preloads TUI catalog records through the Extension activation binding', async () => {
    const homedir = await createTemporaryDirectory('neko-extension-resume-');
    const workDir = join(homedir, 'workspace');
    await mkdir(workDir, { recursive: true });
    const metadataStore = createNodeSqliteLocalMetadataStore({ homedir });
    await metadataStore.open({
      databasePath: resolveGlobalStorageLayout(homedir).database,
      busyTimeoutMs: 1_000,
    });
    await metadataStore.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    const tuiBinding = await createNodeSqliteConversationStorage({
      homedir,
      workDir,
      source: 'tui',
      metadataStore,
      createWorkspaceId: () => WORKSPACE_ID,
    });
    const journalWriter = createNodeJournalStorage(join(homedir, '.neko', 'journals')).createWriter(
      'conversation-from-tui',
    );
    await journalWriter.appendEvent(1, {
      type: 'user_message',
      content: 'Open this TUI conversation in VS Code',
    });
    await journalWriter.appendEvent(2, {
      type: 'text',
      content: 'Loaded through the shared catalog.',
    });
    await journalWriter.flush();
    await tuiBinding.storage.save({
      id: 'conversation-from-tui',
      version: 2,
      title: 'Cross-host activation',
      workDir,
      messages: [
        { role: 'user', content: 'Open this TUI conversation in VS Code' },
        { role: 'assistant', content: 'Loaded through the shared catalog.' },
      ],
      createdAt: 1_752_364_800_000,
      updatedAt: 1_752_368_400_000,
      source: 'tui',
    });
    await metadataStore.dispose();

    const extensionResume = await createExtensionConversationResume({ homedir, workDir });
    expect(extensionResume.initialRecords).toEqual([
      expect.objectContaining({
        id: 'conversation-from-tui',
        title: 'Cross-host activation',
        source: 'journal-projection',
        messages: [
          expect.objectContaining({
            role: 'user',
            content: 'Open this TUI conversation in VS Code',
          }),
          expect.objectContaining({
            role: 'assistant',
            content: 'Loaded through the shared catalog.',
          }),
        ],
      }),
    ]);

    await extensionResume.disposeHost();
  });

  it('reports deprecated workspace hooks through the Extension activation binding', async () => {
    const homedir = await createTemporaryDirectory('neko-extension-hooks-home-');
    const workDir = join(homedir, 'workspace');
    await mkdir(join(workDir, '.neko', 'hooks'), { recursive: true });

    const extensionResume = await createExtensionConversationResume({ homedir, workDir });

    expect(extensionResume.workspaceStorageInspection.entries).toEqual([
      expect.objectContaining({
        code: 'deprecated-hook-catalog',
        relativePath: '.neko/hooks',
        suggestedTarget: '.neko/settings.local.json',
      }),
    ]);

    await extensionResume.disposeHost();
  });

  it('restores the Extension workspace identity after the workspace .neko directory is deleted', async () => {
    const homedir = await createTemporaryDirectory('neko-extension-identity-home-');
    const workDir = join(homedir, 'workspace');
    const first = await createExtensionConversationResume({ homedir, workDir });
    const workspaceId = first.workspaceId;
    await first.disposeHost();
    await rm(join(workDir, '.neko'), { recursive: true, force: true });

    const reopened = await createExtensionConversationResume({ homedir, workDir });

    expect(reopened.workspaceId).toBe(workspaceId);
    await expect(readFile(join(workDir, '.neko', 'workspace.json'), 'utf8')).resolves.toContain(
      workspaceId,
    );
    await expect(access(join(workDir, '.neko', 'config.toml'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(access(join(workDir, '.neko', 'memory.md'))).rejects.toMatchObject({
      code: 'ENOENT',
    });

    await reopened.disposeHost();
  });

  it('migrates the legacy index before Extension activation hydration', async () => {
    const homedir = await createTemporaryDirectory('neko-extension-legacy-migration-');
    const workDir = join(homedir, 'workspace');
    await mkdir(workDir, { recursive: true });
    const journals = createNodeJournalStorage(join(homedir, '.neko', 'journals'));
    const writer = journals.createWriter('legacy-activation-conversation');
    await writer.appendEvent(1, {
      type: 'user_message',
      content: 'Migrate this conversation during activation',
    });
    await writer.flush();
    await writeFile(
      join(homedir, '.neko', 'conversations-index.json'),
      JSON.stringify({
        version: 1,
        workspaces: { [workDir]: ['legacy-activation-conversation'] },
        conversations: {
          'legacy-activation-conversation': {
            conversationId: 'legacy-activation-conversation',
            title: 'Activation migration',
            workDir,
            createdAt: 1_752_364_800_000,
            updatedAt: 1_752_368_400_000,
            messageCount: 1,
            source: 'extension',
          },
        },
      }),
      'utf8',
    );

    const extensionResume = await createExtensionConversationResume({ homedir, workDir });

    expect(extensionResume.migrationReport).toMatchObject({
      sourceStatus: 'migrated',
      importedCount: 1,
      verifiedCount: 1,
    });
    expect(extensionResume.initialRecords).toEqual([
      expect.objectContaining({
        id: 'legacy-activation-conversation',
        title: 'Activation migration',
      }),
    ]);
    await expect(
      extensionResume.catalogItems.list({
        partition: {
          scope: 'workspace',
          workspaceId: extensionResume.workspaceId,
          domain: 'catalog',
        },
      }),
    ).resolves.toEqual([]);

    await extensionResume.disposeHost();
  });

  it('shares list, search, and resume records with the compiled Bun TUI binding', async () => {
    const homedir = await createTemporaryDirectory('neko-extension-bun-resume-');
    const workDir = join(homedir, 'workspace');
    await mkdir(workDir, { recursive: true });
    const skillDirectory = join(workDir, '.agents', 'skills', 'catalog-parity');
    const skillFile = join(skillDirectory, 'SKILL.md');
    await mkdir(skillDirectory, { recursive: true });
    await writeFile(
      skillFile,
      '---\nname: catalog-parity\ndescription: Catalog parity v1\n---\n\nVersion one.\n',
      'utf8',
    );
    const extensionResume = await createExtensionConversationResume({ homedir, workDir });
    const catalogPartition = {
      scope: 'workspace' as const,
      workspaceId: extensionResume.workspaceId,
      domain: 'catalog',
    };
    await extensionResume.catalogItems.replaceSlice({
      partition: catalogPartition,
      kind: 'skill',
      source: 'project',
      items: [
        {
          catalogId: 'project-agent-skills:catalog-parity',
          kind: 'skill',
          source: 'project',
          name: 'catalog-parity',
          displayName: 'Catalog parity',
          description: 'Catalog parity v1',
          version: null,
          rootId: 'project-agent-skills',
          relativePath: 'catalog-parity',
          fingerprint: 'sha256:catalog-parity-v1',
          enabled: false,
          diagnosticCodes: ['provider-not-configured:test-image-provider'],
          updatedAt: '2026-07-13T09:00:00.000Z',
        },
      ],
      updatedAt: '2026-07-13T09:00:00.000Z',
    });
    const journalWriter = createNodeJournalStorage(join(homedir, '.neko', 'journals')).createWriter(
      'extension-conversation',
    );
    await journalWriter.appendEvent(1, {
      type: 'user_message',
      content: 'Can Bun resume this Extension conversation?',
    });
    await journalWriter.appendEvent(2, { type: 'text', content: 'Yes, from the same database.' });
    await journalWriter.flush();
    await extensionResume.storage.save({
      id: 'extension-conversation',
      version: 2,
      title: 'Extension to Bun catalog',
      workDir,
      messages: [
        { role: 'user', content: 'Can Bun resume this Extension conversation?' },
        { role: 'assistant', content: 'Yes, from the same database.' },
      ],
      createdAt: 1_752_364_800_000,
      updatedAt: 1_752_368_400_000,
      source: 'extension',
    });
    const extensionTask = createCrossHostTask('extension-task', 'extension-task-conversation');
    const extensionCheckpoint = createCrossHostCheckpoint(extensionTask);
    await extensionResume.taskStorage.save(extensionTask);
    await extensionResume.taskRecoveryStorage.save(extensionCheckpoint);

    const bunFixture = fileURLToPath(
      new URL(
        '../../../../../../../scripts/test-orchestration/fixtures/bun-tui-conversation-storage-roundtrip.ts',
        import.meta.url,
      ),
    );
    await execFileAsync('bun', [bunFixture], {
      env: {
        ...process.env,
        NEKO_SQLITE_TEST_HOME: homedir,
        NEKO_SQLITE_TEST_WORKSPACE: workDir,
        NEKO_SQLITE_TEST_SKILL_FILE: skillFile,
      },
    });

    await expect(extensionResume.pollRevisions()).resolves.toEqual({
      changedDomains: ['conversations', 'tasks', 'catalog'],
      revisions: { conversations: 3, tasks: 4, catalog: 2 },
    });

    await expect(
      extensionResume.catalogItems.list({ partition: catalogPartition }),
    ).resolves.toEqual([
      expect.objectContaining({
        name: 'catalog-parity',
        description: 'Catalog parity v2',
        fingerprint: 'sha256:catalog-parity-v2',
        enabled: true,
        diagnosticCodes: [],
      }),
    ]);
    await expect(readFile(skillFile, 'utf8')).resolves.toContain('Version two.');

    await expect(extensionResume.storage.search('Bun to Extension')).resolves.toEqual([
      expect.objectContaining({
        id: 'tui-conversation',
        title: 'Bun to Extension catalog',
        source: 'journal-projection',
        messages: [
          expect.objectContaining({
            role: 'user',
            content: 'Can Extension resume this TUI conversation?',
          }),
          expect.objectContaining({
            role: 'assistant',
            content: 'Yes, through the shared catalog.',
          }),
        ],
      }),
    ]);
    await expect(
      extensionResume.taskStorage.load(taskScope('tui-task', 'tui-task-conversation')),
    ).resolves.toMatchObject({ id: 'tui-task', status: 'running' });
    await expect(
      extensionResume.taskRecoveryStorage.load(taskScope('tui-task', 'tui-task-conversation')),
    ).resolves.toMatchObject({
      taskId: 'tui-task',
      externalTaskId: 'provider-tui-task',
    });

    await extensionResume.disposeHost();
  });
});

function createCrossHostTask(id: string, conversationId: string): SerializableTask {
  return {
    scope: taskScope(id, conversationId),
    id,
    type: 'custom',
    status: 'running',
    input: { type: 'custom', payload: { id } },
    progress: 50,
    createdAt: 1_752_364_800_000,
    updatedAt: 1_752_368_400_000,
  };
}

function createCrossHostCheckpoint(task: SerializableTask): TaskRecoveryInfo {
  return {
    scope: task.scope,
    taskId: task.id,
    externalTaskId: `provider-${task.id}`,
    providerId: 'cross-host-provider',
    taskType: 'custom',
    payload: { id: task.id },
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function taskScope(childRunId: string, conversationId: string): TaskRunScope {
  const runId = `run-${conversationId}`;
  return {
    conversationId,
    runId,
    parentRunId: runId,
    childRunId,
    childKind: 'task',
  };
}
