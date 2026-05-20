import { describe, expect, it, vi } from 'vitest';
import { MediaImportDispatcher, classifyZipEntries } from './ImportDispatcher';

describe('MediaImportDispatcher', () => {
  it('sniffs ZIP roots with market priority and ambiguity diagnostics', () => {
    expect(
      classifyZipEntries([
        entry('avatars/sakura/sakura.model3.json'),
        entry('manifest.json'),
        entry('scene/hero.gltf'),
      ]),
    ).toMatchObject({ kind: 'market-bundle', manifestEntryPath: 'manifest.json' });

    expect(
      classifyZipEntries([entry('avatars/sakura/sakura.model3.json'), entry('scene/hero.gltf')]),
    ).toMatchObject({
      kind: 'ambiguous',
      candidates: ['live2d', 'gltf-package'],
    });

    expect(classifyZipEntries([entry('../escape.gltf')])).toMatchObject({
      kind: 'unsupported',
    });
  });

  it('routes Live2D ZIPs through the puppet bundle command without extracting', async () => {
    const commands = createCommandBus();
    const fs = createFs({ '/external/sakura.zip': new Uint8Array([1, 2, 3]) });
    const dispatcher = new MediaImportDispatcher({
      fs,
      commands,
      zipConstructor: zipWith([entry('avatars/sakura/sakura.model3.json')]),
    });

    await expect(
      dispatcher.importFile({
        sourcePath: '/external/sakura.zip',
        workspaceFolderPaths: ['/repo'],
      }),
    ).resolves.toMatchObject({
      importedAssets: [{ mediaKind: 'puppet-model', storageMode: 'bundle-memory' }],
    });
    expect(commands.executeCommand).toHaveBeenCalledWith('neko.puppet.importLive2dBundle', {
      path: '/repo/.neko/imports/puppets/sakura.zip',
      workspaceFolderPath: '/repo',
    });
    expect(fs.files.get('/repo/.neko/imports/puppets/sakura.zip')).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it('copies external model files into project imports before invoking model import', async () => {
    const commands = createCommandBus();
    const fs = createFs({ '/external/hero.glb': new Uint8Array([1, 2, 3]) });
    const dispatcher = new MediaImportDispatcher({ fs, commands });

    await expect(
      dispatcher.importFile({
        sourcePath: '/external/hero.glb',
        documentPath: '/repo/scenes/shot.nkm',
        workspaceFolderPaths: ['/repo'],
      }),
    ).resolves.toMatchObject({
      importedAssets: [{ mediaKind: 'model-3d', storageMode: 'disk' }],
    });
    expect(fs.files.get('/repo/.neko/imports/models/hero.glb')).toEqual(new Uint8Array([1, 2, 3]));
    expect(commands.executeCommand).toHaveBeenCalledWith('neko.model.importAsset', {
      path: '/repo/.neko/imports/models/hero.glb',
    });
  });

  it('extracts glTF ZIPs under .neko/imports/models with zip-slip protection', async () => {
    const commands = createCommandBus();
    const fs = createFs({ '/downloads/hero.zip': new Uint8Array([9]) });
    const dispatcher = new MediaImportDispatcher({
      fs,
      commands,
      now: () => 123,
      zipConstructor: zipWith([
        entry('hero/hero.gltf', '{"asset":{"version":"2.0"}}'),
        entry('hero/hero.bin', 'binary'),
        entry('hero/textures/albedo.png', 'png'),
      ]),
    });

    await expect(
      dispatcher.importFile({
        sourcePath: '/downloads/hero.zip',
        workspaceFolderPaths: ['/repo'],
      }),
    ).resolves.toMatchObject({
      projectFilePath: '/repo/.neko/imports/models/hero-123/hero/hero.gltf',
      importedAssets: [{ mediaKind: 'model-3d', storageMode: 'disk' }],
    });
    expect([...fs.files.keys()].sort()).toEqual([
      '/downloads/hero.zip',
      '/repo/.neko/imports/models/hero-123/hero/hero.bin',
      '/repo/.neko/imports/models/hero-123/hero/hero.gltf',
      '/repo/.neko/imports/models/hero-123/hero/textures/albedo.png',
    ]);
    expect(commands.executeCommand).toHaveBeenCalledWith('neko.model.importAsset', {
      path: '/repo/.neko/imports/models/hero-123/hero/hero.gltf',
    });
  });

  it('opens bare MOC3 files through the puppet editor and copies external sources', async () => {
    const commands = createCommandBus();
    const fs = createFs({ '/external/avatar.moc3': new Uint8Array([5]) });
    const dispatcher = new MediaImportDispatcher({ fs, commands });

    await expect(
      dispatcher.importFile({
        sourcePath: '/external/avatar.moc3',
        workspaceFolderPaths: ['/repo'],
      }),
    ).resolves.toMatchObject({
      projectFilePath: '/repo/.neko/imports/puppets/avatar.moc3',
      importedAssets: [{ mediaKind: 'puppet-model', storageMode: 'disk' }],
    });
    expect(commands.executeCommand).toHaveBeenCalledWith(
      'vscode.openWith',
      {
        fsPath: '/repo/.neko/imports/puppets/avatar.moc3',
        path: '/repo/.neko/imports/puppets/avatar.moc3',
      },
      'neko.puppetEditor',
    );
  });
});

function entry(entryName: string, data = '') {
  return {
    entryName,
    isDirectory: false,
    header: { size: data.length, compressedSize: data.length },
    data: Buffer.from(data, 'utf-8'),
  };
}

function zipWith(entries: readonly ReturnType<typeof entry>[]) {
  return class FakeZip {
    constructor(_data: Buffer) {}

    getEntries() {
      return [...entries];
    }

    readFile(entryRef: string | ReturnType<typeof entry>) {
      const entryName = typeof entryRef === 'string' ? entryRef : entryRef.entryName;
      return entries.find((candidate) => candidate.entryName === entryName)?.data ?? null;
    }

    readAsText(entryRef: string | ReturnType<typeof entry>) {
      return this.readFile(entryRef)?.toString('utf-8') ?? '';
    }
  };
}

function createCommandBus() {
  return {
    executeCommand: vi.fn(async () => undefined),
  };
}

function createFs(initialFiles: Record<string, Uint8Array>) {
  const files = new Map(Object.entries(initialFiles));
  return {
    files,
    readFile: vi.fn(async (filePath: string) => {
      const file = files.get(filePath);
      if (!file) throw new Error(`Missing file: ${filePath}`);
      return file;
    }),
    writeFile: vi.fn(async (filePath: string, data: Uint8Array) => {
      files.set(filePath, data);
    }),
    createDirectory: vi.fn(async () => undefined),
    exists: vi.fn(async (filePath: string) => files.has(filePath)),
  };
}
