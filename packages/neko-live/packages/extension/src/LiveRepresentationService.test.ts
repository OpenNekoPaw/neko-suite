import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { NekoAssetsAPI } from '@neko/shared';
import { LiveRepresentationService } from './LiveRepresentationService';

vi.mock('vscode', () => ({
  Disposable: class {
    constructor(private readonly callback: () => void) {}
    dispose(): void {
      this.callback();
    }
  },
  EventEmitter: class {
    event = vi.fn();
    fire = vi.fn();
    dispose = vi.fn();
  },
  Uri: {
    file: (fsPath: string) => ({ fsPath }),
    parse: (value: string) => ({ fsPath: value, toString: () => value }),
  },
  workspace: {
    workspaceFolders: undefined,
    fs: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      createDirectory: vi.fn(),
    },
    createFileSystemWatcher: vi.fn(() => ({
      onDidCreate: vi.fn(),
      onDidChange: vi.fn(),
      onDidDelete: vi.fn(),
      dispose: vi.fn(),
    })),
  },
  languages: {},
  window: {},
  commands: {
    registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
  },
}));

describe('LiveRepresentationService', () => {
  it('resolves Live2D avatars through RepresentationResolver and asset package details', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-live-representation-'));
    await fs.writeFile(
      path.join(workspaceRoot, 'characters.json'),
      JSON.stringify({
        version: 1,
        characters: [
          {
            id: 'char_linxia',
            canonicalName: 'Linxia',
            aliases: [],
            status: 'confirmed',
          },
        ],
      }),
      'utf-8',
    );
    await fs.mkdir(path.join(workspaceRoot, '.neko'), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, '.neko', 'entity-bindings.json'),
      JSON.stringify({
        version: 1,
        bindings: [
          {
            id: 'binding-live2d',
            entityId: 'char_linxia',
            entityKind: 'character',
            assetRef: 'project://assets/asset_linxia_live2d',
            role: 'live2d',
            status: 'confirmed',
            source: 'user',
            updatedAt: '2026-05-10T00:00:00.000Z',
          },
        ],
      }),
      'utf-8',
    );

    const assetsApi = {
      getRepresentationPackageDetail: vi.fn(async () => ({
        assetEntityId: 'asset_linxia_live2d',
        assetRef: 'project://assets/asset_linxia_live2d',
        representationKinds: ['live2d'],
        files: [
          {
            role: 'model',
            assetRef: 'project://assets/asset_linxia_live2d?file=model',
            path: '/avatars/linxia/linxia.moc3',
            mediaType: 'document',
          },
        ],
        capabilities: ['live2d-runtime'],
        missingRoles: [],
      })),
    } as Pick<NekoAssetsAPI, 'getRepresentationPackageDetail'>;

    const service = new LiveRepresentationService({
      workspaceRoot,
      getAssetsApi: () => assetsApi as NekoAssetsAPI,
    });

    await expect(service.resolveAvatar('char_linxia')).resolves.toMatchObject({
      status: 'resolved',
      entityId: 'char_linxia',
      assetEntityId: 'asset_linxia_live2d',
      avatarType: 'puppet',
      avatarPath: '/avatars/linxia/linxia.moc3',
      result: {
        resolvedKind: 'live2d',
        fallback: false,
        capabilities: ['live2d-runtime'],
      },
    });
  });

  it('does not resolve portrait as a Live avatar', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-live-missing-'));
    await fs.writeFile(
      path.join(workspaceRoot, 'characters.json'),
      JSON.stringify({
        version: 1,
        characters: [
          {
            id: 'char_linxia',
            canonicalName: 'Linxia',
            aliases: [],
            status: 'confirmed',
          },
        ],
      }),
      'utf-8',
    );
    await fs.mkdir(path.join(workspaceRoot, '.neko'), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, '.neko', 'entity-bindings.json'),
      JSON.stringify({
        version: 1,
        bindings: [
          {
            id: 'binding-portrait',
            entityId: 'char_linxia',
            entityKind: 'character',
            assetRef: 'project://assets/asset_linxia_portrait',
            role: 'portrait',
            status: 'confirmed',
            source: 'user',
            updatedAt: '2026-05-10T00:00:00.000Z',
          },
        ],
      }),
      'utf-8',
    );

    const service = new LiveRepresentationService({ workspaceRoot });

    await expect(service.resolveAvatar('char_linxia')).resolves.toEqual({
      status: 'missing-representation',
      entityId: 'char_linxia',
      missingKinds: ['live3d', 'live2d'],
      suggestedActions: ['generate', 'import', 'bind-existing', 'dismiss'],
    });
  });
});
