import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as vscode from 'vscode';
import { PuppetEditorProvider } from './puppetEditorProvider';

vi.mock('vscode', () => ({
  Uri: {
    file: (fsPath: string) => createUri(fsPath),
    joinPath: (base: { fsPath?: string }, ...parts: string[]) =>
      createUri([base.fsPath, ...parts].filter(Boolean).join('/')),
  },
  workspace: {
    workspaceFolders: [
      {
        uri: createUri('/workspace'),
        name: 'workspace',
        index: 0,
      },
    ],
    fs: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      delete: vi.fn(),
      rename: vi.fn(),
    },
  },
  commands: {
    executeCommand: vi.fn(),
  },
  window: {
    showOpenDialog: vi.fn(),
    showQuickPick: vi.fn(),
    showErrorMessage: vi.fn(),
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      dispose: vi.fn(),
    })),
  },
  EventEmitter: class EventEmitter<T = void> {
    readonly event = vi.fn();
    fire = vi.fn((_value?: T) => undefined);
    dispose = vi.fn();
  },
  l10n: {
    t: (key: string) => key,
  },
}));

vi.mock('@neko/shared/vscode/extension', async () => {
  const actual = await vi.importActual<typeof import('@neko/shared/vscode/extension')>(
    '@neko/shared/vscode/extension',
  );
  return {
    ...actual,
    injectLocaleAttribute: () => 'lang="en"',
    createProjectSnapshotPackage: vi.fn(),
  };
});

describe('PuppetEditorProvider project file I/O', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storage.clear();
  });

  it('loads, saves, reverts, and backs up .nkp documents through the shared store', async () => {
    storage.set(
      '/workspace/puppet/hero.nkp',
      encodeJson({
        version: '2.0',
        name: 'Hero',
        puppet: { src: '/workspace/puppet/models/hero.moc3' },
        parameters: {},
        viewport: { zoom: 1 },
      }),
    );
    const provider = new PuppetEditorProvider(createExtensionContext());
    const document = await provider.openCustomDocument(
      createUri('/workspace/puppet/hero.nkp'),
      {} as never,
      {} as never,
    );

    expect(document.projectData?.puppet.src).toBe('/workspace/puppet/models/hero.moc3');

    await provider.saveCustomDocument(document, {} as never);

    expect(decodeText(storage.get('/workspace/puppet/hero.nkp'))).toContain(
      '"src": "puppet/models/hero.moc3"',
    );

    storage.set(
      '/workspace/puppet/hero.nkp',
      encodeJson({
        version: '2.0',
        name: 'Hero Restored',
        puppet: { src: './restored.moc3' },
        parameters: { ParamAngleX: 0.4 },
        viewport: { zoom: 2 },
      }),
    );
    await provider.revertCustomDocument(document, {} as never);

    expect(document.projectData?.name).toBe('Hero Restored');
    expect(document.projectData?.parameters).toEqual({ ParamAngleX: 0.4 });

    await provider.backupCustomDocument(
      document,
      { destination: createUri('/workspace/.backups/hero.nkp') } as never,
      {} as never,
    );

    expect(decodeText(storage.get('/workspace/.backups/hero.nkp'))).toContain(
      '"name": "Hero Restored"',
    );
  });

  it('keeps a non-portable absolute source from being saved', async () => {
    storage.set(
      '/workspace/puppet/hero.nkp',
      encodeJson({
        version: '2.0',
        name: 'Hero',
        puppet: { src: '/Volumes/external/hero.moc3' },
        parameters: {},
        viewport: { zoom: 1 },
      }),
    );
    const provider = new PuppetEditorProvider(createExtensionContext());
    const document = await provider.openCustomDocument(
      createUri('/workspace/puppet/hero.nkp'),
      {} as never,
      {} as never,
    );

    await expect(provider.saveCustomDocument(document, {} as never)).rejects.toThrow(
      'absolute local path',
    );
    expect(decodeText(storage.get('/workspace/puppet/hero.nkp'))).toContain(
      '/Volumes/external/hero.moc3',
    );
  });

  it('routes editor import sources through the shared add-source path instead of path.relative', () => {
    const source = readFileSync(join(__dirname, './puppetEditorProvider.ts'), 'utf-8');

    expect(source).toContain('private createPuppetProjectSourceAddRequest(');
    expect(source).toContain('private async acquirePuppetProjectSource(');
    expect(source).toContain('handlePuppetFilePickerSourceAdd(');
    expect(source).toContain("caller: request.caller ?? 'neko-puppet.project-add-source'");
    expect(source).toContain("caller: 'neko-puppet.import-live2d-bundle-editor'");
    expect(source).not.toContain("case 'puppet:import'");
    expect(source).not.toContain('private async linkPuppetSourcePath(');
    expect(source).not.toContain('path.relative(nkpDir, uris[0].fsPath)');
    expect(source).not.toContain('path.relative(nkpDir, bundleUri.fsPath)');
  });
});

const storage = new Map<string, Uint8Array>();

function createUri(fsPath: string) {
  return {
    fsPath,
    scheme: 'file',
    toString() {
      return `file://${fsPath}`;
    },
  };
}

function createExtensionContext(): ConstructorParameters<typeof PuppetEditorProvider>[0] {
  return {
    subscriptions: [],
    extensionUri: createUri('/ext'),
  } as unknown as ConstructorParameters<typeof PuppetEditorProvider>[0];
}

function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value, null, 2));
}

function decodeText(value: Uint8Array | undefined): string {
  return new TextDecoder().decode(value);
}

vi.mocked(vscode.workspace.fs.readFile).mockImplementation(async (uri: { fsPath: string }) => {
  const content = storage.get(uri.fsPath);
  if (!content) throw new Error(`ENOENT ${uri.fsPath}`);
  return content;
});

vi.mocked(vscode.workspace.fs.writeFile).mockImplementation(
  async (uri: { fsPath: string }, content: Uint8Array) => {
    storage.set(uri.fsPath, content);
  },
);

vi.mocked(vscode.workspace.fs.delete).mockImplementation(async (uri: { fsPath: string }) => {
  storage.delete(uri.fsPath);
});

vi.mocked(vscode.workspace.fs.rename).mockImplementation(
  async (from: { fsPath: string }, to: { fsPath: string }) => {
    const content = storage.get(from.fsPath);
    if (!content) throw new Error(`ENOENT ${from.fsPath}`);
    storage.set(to.fsPath, content);
    storage.delete(from.fsPath);
  },
);
