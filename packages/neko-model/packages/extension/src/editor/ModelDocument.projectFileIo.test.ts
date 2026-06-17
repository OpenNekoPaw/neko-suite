import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { createDefaultNkmProject } from '@neko/shared';
import { loadNkmProject, ModelDocument, resolveNkmProjectModelSource } from './ModelDocument';

vi.mock('vscode', () => ({
  Uri: {
    file: (fsPath: string) => createUri(fsPath),
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

describe('ModelDocument project file I/O', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storage.clear();
  });

  it('loads, saves, saves-as, and reverts .nkm documents through the shared store', async () => {
    storage.set(
      '/workspace/model/hero.nkm',
      encodeJson({
        ...createDefaultNkmProject('Hero', '/workspace/model/models/hero.glb'),
        editorState: { selectedNodeId: 'Body' },
      }),
    );

    const document = await ModelDocument.fromNkm(createUri('/workspace/model/hero.nkm'));

    expect(document.projectData.model.src).toBe('/workspace/model/models/hero.glb');

    await document.save();

    expect(decodeText(storage.get('/workspace/model/hero.nkm'))).toContain(
      '"src": "models/hero.glb"',
    );

    await document.saveAs(createUri('/workspace/model/copy.nkm'));
    expect(decodeText(storage.get('/workspace/model/copy.nkm'))).toContain(
      '"src": "models/hero.glb"',
    );

    storage.set(
      '/workspace/model/hero.nkm',
      encodeJson({
        ...createDefaultNkmProject('Restored', './restored.glb'),
        editorState: { selectedNodeId: 'Head' },
      }),
    );
    await document.revert();

    expect(document.projectData.name).toBe('Restored');
    expect(document.projectData.model.src).toBe('./restored.glb');
  });

  it('diagnoses non-portable absolute model sources without overwriting the project file', async () => {
    storage.set(
      '/workspace/model/hero.nkm',
      encodeJson(createDefaultNkmProject('Hero', '/Volumes/media/hero.glb')),
    );

    const document = await ModelDocument.fromNkm(createUri('/workspace/model/hero.nkm'));

    await expect(document.save()).rejects.toThrow('absolute local path');
    expect(decodeText(storage.get('/workspace/model/hero.nkm'))).toContain(
      '/Volumes/media/hero.glb',
    );
  });

  it('reports future-version diagnostics while keeping the document readable for recovery', async () => {
    storage.set(
      '/workspace/model/future.nkm',
      encodeJson({
        ...createDefaultNkmProject('Future', './hero.glb'),
        version: 999,
      }),
    );

    const result = await loadNkmProject(createUri('/workspace/model/future.nkm'));

    expect(result.project?.name).toBe('Future');
    expect(result.readOnly).toBe(true);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'unsupported-version',
    );
  });

  it('resolves relative model sources from the .nkm document directory', async () => {
    storage.set(
      '/workspace/model/hero.nkm',
      encodeJson(createDefaultNkmProject('Hero', 'models/hero.glb')),
    );

    await expect(
      resolveNkmProjectModelSource(createUri('/workspace/model/hero.nkm')),
    ).resolves.toBe('/workspace/model/models/hero.glb');
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
