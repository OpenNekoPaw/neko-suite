import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultNkmProject } from '@neko/shared';
import { ModelProjectAuthoringService } from './ModelProjectAuthoringService';

const vscodeMockState = vi.hoisted(() => {
  class MockUri {
    private constructor(readonly fsPath: string) {}

    static file(filePath: string): MockUri {
      return new MockUri(filePath);
    }

    static parse(value: string): MockUri {
      return value.startsWith('file://')
        ? new MockUri(value.slice('file://'.length))
        : new MockUri(value);
    }

    static joinPath(base: MockUri, ...parts: readonly string[]): MockUri {
      return new MockUri([base.fsPath.replace(/\/+$/, ''), ...parts].join('/'));
    }

    toString(): string {
      return `file://${this.fsPath}`;
    }
  }

  const files = new Map<string, Uint8Array>();
  const readFile = vi.fn(async (uri: MockUri) => {
    const content = files.get(uri.fsPath);
    if (!content) throw new Error(`ENOENT: ${uri.fsPath}`);
    return content;
  });
  const writeFile = vi.fn(async (uri: MockUri, content: Uint8Array) => {
    files.set(uri.fsPath, content);
  });
  const stat = vi.fn(async (uri: MockUri) => {
    if (!files.has(uri.fsPath)) throw new Error(`ENOENT: ${uri.fsPath}`);
    return { type: 1 };
  });
  const rename = vi.fn(async (from: MockUri, to: MockUri) => {
    const content = files.get(from.fsPath);
    if (!content) throw new Error(`ENOENT: ${from.fsPath}`);
    files.set(to.fsPath, content);
    files.delete(from.fsPath);
  });
  const deleteFile = vi.fn(async (uri: MockUri) => {
    files.delete(uri.fsPath);
  });
  const createDirectory = vi.fn(async () => undefined);
  const executeCommand = vi.fn(async () => undefined);

  return {
    MockUri,
    files,
    readFile,
    writeFile,
    stat,
    rename,
    deleteFile,
    createDirectory,
    executeCommand,
  };
});

vi.mock('vscode', () => ({
  Uri: vscodeMockState.MockUri,
  workspace: {
    workspaceFolders: [
      {
        uri: vscodeMockState.MockUri.file('/workspace'),
        name: 'workspace',
        index: 0,
      },
    ],
    fs: {
      readFile: vscodeMockState.readFile,
      writeFile: vscodeMockState.writeFile,
      stat: vscodeMockState.stat,
      rename: vscodeMockState.rename,
      delete: vscodeMockState.deleteFile,
      createDirectory: vscodeMockState.createDirectory,
    },
  },
  commands: {
    executeCommand: vscodeMockState.executeCommand,
  },
  EventEmitter: class EventEmitter<T = void> {
    readonly event = vi.fn();
    fire = vi.fn((_value?: T) => undefined);
    dispose = vi.fn();
  },
  window: {
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      dispose: vi.fn(),
    })),
  },
}));

describe('ModelProjectAuthoringService', () => {
  beforeEach(() => {
    vscodeMockState.files.clear();
    vscodeMockState.readFile.mockClear();
    vscodeMockState.writeFile.mockClear();
    vscodeMockState.stat.mockClear();
    vscodeMockState.rename.mockClear();
    vscodeMockState.deleteFile.mockClear();
    vscodeMockState.createDirectory.mockClear();
    vscodeMockState.executeCommand.mockClear();
  });

  it('imports a model asset into an unopened explicit .nkm document without opening a Webview', async () => {
    seedJson('/workspace/scenes/shot.nkm', createDefaultNkmProject('Shot'));
    vscodeMockState.files.set('/workspace/assets/hero.glb', new Uint8Array([1, 2, 3]));
    const service = new ModelProjectAuthoringService();

    const result = await service.importAsset({
      assetPath: '/workspace/assets/hero.glb',
      target: { documentUri: 'file:///workspace/scenes/shot.nkm' },
    });

    expect(result.ok).toBe(true);
    expect(result.documentUri).toBe('file:///workspace/scenes/shot.nkm');
    expect(result.data?.modelSrc).toBe('assets/hero.glb');
    expect(readJson('/workspace/scenes/shot.nkm')).toMatchObject({
      model: { src: 'assets/hero.glb' },
    });
    expect(vscodeMockState.executeCommand).not.toHaveBeenCalled();
  });

  it('creates a new .nkm project file when requested', async () => {
    vscodeMockState.files.set('/workspace/assets/hero.glb', new Uint8Array([1, 2, 3]));
    const service = new ModelProjectAuthoringService();

    const result = await service.importAsset({
      assetPath: '/workspace/assets/hero.glb',
      name: 'Hero Rig',
      target: { kind: 'new', title: 'Hero Scene' },
    });

    expect(result.ok).toBe(true);
    expect(result.created).toBe(true);
    expect(result.documentUri).toBe('file:///workspace/Hero Scene.nkm');
    expect(readJson('/workspace/Hero Scene.nkm')).toMatchObject({
      name: 'Hero Rig',
      model: { src: 'assets/hero.glb' },
    });
  });

  it('rejects runtime handles before saving durable model sources', async () => {
    seedJson('/workspace/scenes/shot.nkm', createDefaultNkmProject('Shot'));
    const service = new ModelProjectAuthoringService();

    const result = await service.importAsset({
      assetPath: 'blob:hero.glb',
      target: { documentUri: 'file:///workspace/scenes/shot.nkm' },
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.code).toBe('runtime-handle-persisted');
    expect(readJson('/workspace/scenes/shot.nkm')).toMatchObject({
      model: { src: null },
    });
  });
});

function seedJson(filePath: string, value: unknown): void {
  vscodeMockState.files.set(filePath, new TextEncoder().encode(JSON.stringify(value, null, 2)));
}

function readJson(filePath: string): unknown {
  const content = vscodeMockState.files.get(filePath);
  if (!content) throw new Error(`Missing file ${filePath}`);
  return JSON.parse(new TextDecoder().decode(content)) as unknown;
}
