import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveGlobalStorageLayout, resolveStorageLayout } from '@neko/shared';
import { createNodeJournalStorage } from '@neko/agent';
import { createResourceCacheGeneratedAssetIndex } from '@neko/platform';
import { createTuiSqliteConversationStorage } from '../tui-sqlite-conversation-storage';

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
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

describe('TUI SQLite conversation storage', () => {
  it('opens the user database and creates only the workspace identity under .neko', async () => {
    const homedir = await createTemporaryDirectory('neko-tui-home-');
    const workDir = join(homedir, 'workspace');
    const binding = await createTuiSqliteConversationStorage({ homedir, workDir });
    const globalLayout = resolveGlobalStorageLayout(homedir);
    const workspaceLayout = resolveStorageLayout(workDir, homedir);

    await expect(access(globalLayout.database)).resolves.toBeUndefined();
    await expect(access(workspaceLayout.project.local.workspaceIdentity)).resolves.toBeUndefined();
    await expect(access(join(workspaceLayout.project.local.root, 'neko.db'))).rejects.toMatchObject(
      { code: 'ENOENT' },
    );
    await expect(
      access(join(workspaceLayout.project.local.cache.root, 'neko.db')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(binding.storage.list()).resolves.toEqual([]);
    await expect(
      binding.catalogItems.list({
        partition: {
          scope: 'workspace',
          workspaceId: binding.workspaceId,
          domain: 'catalog',
        },
      }),
    ).resolves.toEqual([]);

    await binding.dispose();
  });

  it('opens a workspace outside the user home with a portable locator', async () => {
    const homedir = await createTemporaryDirectory('neko-tui-external-home-');
    const workDir = await createTemporaryDirectory('neko-tui-external-workspace-');

    const binding = await createTuiSqliteConversationStorage({ homedir, workDir });

    await expect(binding.storage.list()).resolves.toEqual([]);
    await binding.dispose();
  });

  it('restores the TUI workspace identity after the workspace .neko directory is deleted', async () => {
    const homedir = await createTemporaryDirectory('neko-tui-identity-home-');
    const workDir = join(homedir, 'workspace');
    const first = await createTuiSqliteConversationStorage({ homedir, workDir });
    const workspaceId = first.workspaceId;
    await first.dispose();
    await rm(join(workDir, '.neko'), { recursive: true, force: true });

    const reopened = await createTuiSqliteConversationStorage({ homedir, workDir });

    expect(reopened.workspaceId).toBe(workspaceId);
    await expect(access(join(workDir, '.neko', 'workspace.json'))).resolves.toBeUndefined();
    await expect(access(join(workDir, '.neko', 'config.toml'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(access(join(workDir, '.neko', 'memory.md'))).rejects.toMatchObject({
      code: 'ENOENT',
    });

    await reopened.dispose();
  });

  it('reports deprecated workspace hooks through the TUI startup binding', async () => {
    const homedir = await createTemporaryDirectory('neko-tui-hooks-home-');
    const workDir = join(homedir, 'workspace');
    await mkdir(join(workDir, '.neko', 'hooks'), { recursive: true });

    const binding = await createTuiSqliteConversationStorage({ homedir, workDir });

    expect(binding.workspaceStorageInspection.entries).toEqual([
      expect.objectContaining({
        code: 'deprecated-hook-catalog',
        relativePath: '.neko/hooks',
        suggestedTarget: '.neko/settings.local.json',
      }),
    ]);

    await binding.dispose();
  });

  it('migrates the legacy conversation index before exposing TUI queries', async () => {
    const homedir = await createTemporaryDirectory('neko-tui-migration-home-');
    const workDir = join(homedir, 'workspace');
    await mkdir(workDir, { recursive: true });
    const writer = createNodeJournalStorage(join(homedir, '.neko', 'journals')).createWriter(
      'legacy-tui-conversation',
    );
    await writer.appendEvent(1, { type: 'user_message', content: 'Resume this in the TUI' });
    await writer.flush();
    await writeFile(
      join(homedir, '.neko', 'conversations-index.json'),
      JSON.stringify({
        version: 1,
        workspaces: { [workDir]: ['legacy-tui-conversation'] },
        conversations: {
          'legacy-tui-conversation': {
            conversationId: 'legacy-tui-conversation',
            title: 'Legacy TUI migration',
            workDir,
            createdAt: 1_752_364_800_000,
            updatedAt: 1_752_368_400_000,
            messageCount: 1,
            source: 'tui',
          },
        },
      }),
      'utf8',
    );

    const binding = await createTuiSqliteConversationStorage({ homedir, workDir });

    expect(binding.migrationReport).toMatchObject({
      sourceStatus: 'migrated',
      importedCount: 1,
      verifiedCount: 1,
    });
    await expect(binding.storage.search('Legacy TUI')).resolves.toEqual([
      expect.objectContaining({ id: 'legacy-tui-conversation', title: 'Legacy TUI migration' }),
    ]);

    await binding.dispose();
  });

  it('does not read or mutate a retired workspace Task file', async () => {
    const homedir = await createTemporaryDirectory('neko-tui-task-home-');
    const workDir = join(homedir, 'workspace');
    const legacyTaskPath = join(workDir, '.neko', 'tasks.json');
    await mkdir(join(workDir, '.neko'), { recursive: true });
    await writeFile(legacyTaskPath, '{invalid legacy content', 'utf8');

    const binding = await createTuiSqliteConversationStorage({ homedir, workDir });

    expect(binding).not.toHaveProperty('taskMigration');
    await expect(binding.taskStorage.loadAll()).resolves.toEqual([]);
    await expect(access(legacyTaskPath)).resolves.toBeUndefined();

    await binding.dispose();
  });

  it('migrates the workspace ResourceCache manifest into the shared metadata binding', async () => {
    const homedir = await createTemporaryDirectory('neko-tui-resource-cache-home-');
    const workDir = join(homedir, 'workspace');
    const workspaceLayout = resolveStorageLayout(workDir, homedir);
    const manifestPath = workspaceLayout.project.local.cache.resourceManifest;
    const artifactRoot = join(workspaceLayout.project.local.cache.resources, 'tui');
    await mkdir(artifactRoot, { recursive: true });
    await writeFile(join(artifactRoot, 'thumbnail.png'), 'thumbnail bytes', 'utf8');
    await writeFile(join(artifactRoot, 'page-1.png'), 'page bytes', 'utf8');
    await writeFile(
      manifestPath,
      JSON.stringify({
        version: 1,
        projectRoot: workDir,
        createdAt: '2026-07-13T00:00:00.000Z',
        updatedAt: '2026-07-13T01:00:00.000Z',
        entries: {
          'resource-tui': {
            resource: {
              id: 'resource-tui',
              scope: 'project',
              provider: 'tui-fixture',
              kind: 'media',
              source: { kind: 'file', projectRelativePath: 'media/source.png' },
              fingerprint: { strategy: 'hash', value: 'sha256:tui-resource' },
            },
            status: 'ready',
            createdAt: '2026-07-13T00:00:00.000Z',
            updatedAt: '2026-07-13T01:00:00.000Z',
            variants: [
              {
                key: 'thumbnail:tui',
                role: 'thumbnail',
                status: 'ready',
                relativePath: 'tui/thumbnail.png',
                sizeBytes: 32,
                createdAt: '2026-07-13T00:00:00.000Z',
                updatedAt: '2026-07-13T01:00:00.000Z',
                rebuildable: true,
              },
              {
                key: 'page:tui:1',
                role: 'page-image',
                status: 'ready',
                relativePath: 'tui/page-1.png',
                sizeBytes: 64,
                createdAt: '2026-07-13T00:00:00.000Z',
                updatedAt: '2026-07-13T01:00:00.000Z',
                rebuildable: true,
              },
            ],
          },
        },
      }),
      'utf8',
    );

    const binding = await createTuiSqliteConversationStorage({ homedir, workDir });

    expect(binding.resourceCacheMigrationReport).toMatchObject({
      sourceStatus: 'migrated',
      importedEntryCount: 1,
      importedVariantCount: 2,
      verifiedEntryCount: 1,
      verifiedVariantCount: 2,
    });
    await binding.dispose();

    const reopened = await createTuiSqliteConversationStorage({ homedir, workDir });
    await expect(reopened.resourceCacheManifestStore.load()).resolves.toMatchObject({
      entries: {
        'resource-tui': {
          variants: expect.arrayContaining([
            expect.objectContaining({
              role: 'thumbnail',
              relativePath: 'tui/thumbnail.png',
            }),
            expect.objectContaining({
              role: 'page-image',
              relativePath: 'tui/page-1.png',
            }),
          ]),
        },
      },
    });
    await expect(access(manifestPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(join(artifactRoot, 'thumbnail.png'))).resolves.toBeUndefined();
    await expect(access(join(artifactRoot, 'page-1.png'))).resolves.toBeUndefined();

    await reopened.dispose();
  });

  it('migrates legacy proxy metadata and reopens it from SQLite without moving bytes into the database', async () => {
    const homedir = await createTemporaryDirectory('neko-tui-proxy-home-');
    const workDir = join(homedir, 'workspace');
    const workspaceLayout = resolveStorageLayout(workDir, homedir);
    const legacyProxyRoot = workspaceLayout.project.local.cache.proxies;
    const manifestPath = workspaceLayout.project.local.cache.proxyManifest;
    const legacyProxyPath = join(legacyProxyRoot, 'proxy-tui.mp4');
    await mkdir(legacyProxyRoot, { recursive: true });
    await writeFile(legacyProxyPath, 'proxy bytes', 'utf8');
    await writeFile(
      manifestPath,
      JSON.stringify({
        version: 1,
        proxies: {
          'proxy-resource-tui': {
            source: 'media/source.mov',
            proxy: '.neko/.cache/proxies/proxy-tui.mp4',
            sourceSize: 4096,
            sourceModified: 1_752_361_200_000,
            proxyResolution: '960x540',
            status: 'ready',
            createdAt: 1_752_364_800_000,
          },
        },
      }),
      'utf8',
    );

    const binding = await createTuiSqliteConversationStorage({ homedir, workDir });

    expect(binding.proxyMigrationReport).toMatchObject({
      sourceStatus: 'migrated',
      importedEntryCount: 1,
      importedVariantCount: 1,
      copiedArtifactCount: 1,
      verifiedEntryCount: 1,
      verifiedVariantCount: 1,
    });
    await binding.dispose();

    const reopened = await createTuiSqliteConversationStorage({ homedir, workDir });
    await expect(reopened.resourceCacheManifestStore.load()).resolves.toMatchObject({
      entries: {
        'proxy-resource-tui': {
          variants: [
            expect.objectContaining({
              role: 'proxy',
              relativePath: 'proxies/proxy-tui.mp4',
            }),
          ],
        },
      },
    });
    await expect(
      access(join(workspaceLayout.project.local.cache.resources, 'proxies', 'proxy-tui.mp4')),
    ).resolves.toBeUndefined();
    await expect(access(manifestPath)).rejects.toMatchObject({ code: 'ENOENT' });

    await reopened.dispose();
  });

  it('round-trips Search FTS projection through the shared user database binding', async () => {
    const homedir = await createTemporaryDirectory('neko-tui-search-home-');
    const workDir = join(homedir, 'workspace');
    const first = await createTuiSqliteConversationStorage({ homedir, workDir });
    await first.searchDocuments.replaceSearchPartition({
      partition: first.searchPartition,
      searchPartition: 'media-library',
      documents: [
        {
          documentId: 'media:tui-cat-walk',
          partition: 'media-library',
          kind: 'media',
          label: 'Cat walk.mp4',
          source: {
            partition: 'media-library',
            sourceId: '${MEDIA}/Cat walk.mp4',
            filePath: '${MEDIA}/Cat walk.mp4',
          },
          fileKey: '${MEDIA}/Cat walk.mp4',
          searchText: 'Cat walk video',
          freshness: 'fresh',
          updatedAt: '2026-07-13T05:00:00.000Z',
        },
      ],
      updatedAt: '2026-07-13T05:00:00.000Z',
    });
    await first.dispose();

    const reopened = await createTuiSqliteConversationStorage({ homedir, workDir });

    await expect(
      reopened.searchDocuments.query({
        partition: reopened.searchPartition,
        text: 'cat walk',
        limit: 10,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        documentId: 'media:tui-cat-walk',
        fileKey: '${MEDIA}/Cat walk.mp4',
      }),
    ]);
    await expect(reopened.readSearchRevision()).resolves.toMatchObject({
      freshness: 'fresh',
    });

    await reopened.dispose();
  });

  it('round-trips Entity binding reverse lookup through the shared user database binding', async () => {
    const homedir = await createTemporaryDirectory('neko-tui-entity-home-');
    const workDir = join(homedir, 'workspace');
    const first = await createTuiSqliteConversationStorage({ homedir, workDir });
    await first.entityAssetProjections.replaceSource({
      partition: first.entityAssetPartition,
      sourceId: 'neko-entity-facts',
      records: [
        {
          projectionId: 'binding:rin-portrait',
          kind: 'binding-availability',
          sourceId: 'neko-entity-facts',
          entityId: 'char_rin',
          assetRef: 'project://assets/rin.png',
          freshness: 'fresh',
          value: {
            bindingId: 'binding:rin-portrait',
            entityId: 'char_rin',
            entityKind: 'character',
            assetRef: 'project://assets/rin.png',
            role: 'portrait',
            status: 'confirmed',
            availability: 'active',
          },
          updatedAt: '2026-07-13T08:00:00.000Z',
        },
      ],
      updatedAt: '2026-07-13T08:00:00.000Z',
    });
    await first.dispose();

    const reopened = await createTuiSqliteConversationStorage({ homedir, workDir });

    await expect(
      reopened.entityAssetProjections.list({
        partition: reopened.entityAssetPartition,
        assetRef: 'project://assets/rin.png',
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        kind: 'binding-availability',
        entityId: 'char_rin',
        value: expect.objectContaining({ bindingId: 'binding:rin-portrait' }),
      }),
    ]);
    await expect(reopened.readEntityAssetRevision()).resolves.toMatchObject({
      freshness: 'fresh',
    });

    await reopened.dispose();
  });

  it('round-trips generated draft projection through SQLite while keeping artifact bytes as files', async () => {
    const homedir = await createTemporaryDirectory('neko-tui-generated-home-');
    const workDir = join(homedir, 'workspace');
    const artifactPath = join(workDir, 'neko', 'generated', 'image', 'draft.png');
    await mkdir(join(workDir, 'neko', 'generated', 'image'), { recursive: true });
    await writeFile(artifactPath, Buffer.from('generated-image-bytes'));
    const firstBinding = await createTuiSqliteConversationStorage({ homedir, workDir });
    const firstIndex = await createResourceCacheGeneratedAssetIndex({
      manifestStore: firstBinding.resourceCacheManifestStore,
      workspaceRoot: workDir,
      homedir,
    });
    await firstIndex.index.add({
      id: 'generated-draft-1',
      type: 'generated-image',
      path: artifactPath,
      mimeType: 'image/png',
      generatedAt: '2026-07-13T03:00:00.000Z',
      width: 1024,
      height: 1024,
      ratio: '1:1',
      prompt: 'A generated draft',
      model: 'test-model',
    });
    await firstBinding.dispose();

    const secondBinding = await createTuiSqliteConversationStorage({ homedir, workDir });
    const secondIndex = await createResourceCacheGeneratedAssetIndex({
      manifestStore: secondBinding.resourceCacheManifestStore,
      workspaceRoot: workDir,
      homedir,
    });

    expect(secondIndex.index.get('generated-draft-1')).toMatchObject({
      id: 'generated-draft-1',
      path: artifactPath,
      prompt: 'A generated draft',
    });
    await expect(access(artifactPath)).resolves.toBeUndefined();
    await expect(access(join(workDir, 'neko', 'generated', 'index.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });

    await secondBinding.dispose();
  });
});
