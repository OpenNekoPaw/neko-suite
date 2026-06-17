import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectData } from '@neko/shared';
import { MessageHandler } from './messageHandler';

vi.mock('vscode', () => ({
  Uri: {
    file: (filePath: string) => ({
      scheme: 'file',
      fsPath: filePath,
      path: filePath,
      toString: () => `file://${filePath}`,
    }),
  },
  window: {
    showSaveDialog: vi.fn(),
    showInformationMessage: vi.fn(),
  },
  workspace: {
    workspaceFolders: [],
    fs: {
      writeFile: vi.fn(),
    },
  },
  commands: {
    executeCommand: vi.fn(),
  },
}));

vi.mock('../../base', () => ({
  createServiceId: vi.fn((id: string) => id),
  getService: vi.fn(() => null),
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../../services/tools/helpers', async () => {
  const actual = await vi.importActual<typeof import('../../services/tools/helpers')>(
    '../../services/tools/helpers',
  );
  return {
    ...actual,
    normalizePathsForSave: vi.fn(async (project: ProjectData) => project),
  };
});

describe('MessageHandler save', () => {
  let webview: { postMessage: ReturnType<typeof vi.fn> };
  let model: {
    uri: { fsPath: string };
    updateProjectData: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    webview = { postMessage: vi.fn() };
    model = {
      uri: { fsPath: '/workspace/project/test.nkv' },
      updateProjectData: vi.fn(async () => true),
      save: vi.fn(async () => true),
    };
  });

  it('persists the VS Code document before acknowledging save', async () => {
    const handler = createHandler();

    await handler.handleMessage({ type: 'save', content: createProject() });

    expect(model.updateProjectData).toHaveBeenCalledOnce();
    expect(model.save).toHaveBeenCalledOnce();
    expect(webview.postMessage).toHaveBeenCalledWith({ type: 'saved' });
  });

  it('reports an error when the VS Code document save fails', async () => {
    model.save.mockResolvedValue(false);
    const handler = createHandler();

    await handler.handleMessage({ type: 'save', content: createProject() });

    expect(model.updateProjectData).toHaveBeenCalledOnce();
    expect(model.save).toHaveBeenCalledOnce();
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: 'error',
      message: 'Failed to save project',
    });
    expect(webview.postMessage).not.toHaveBeenCalledWith({ type: 'saved' });
  });

  it('registers project add-source requests and posts durable source results', async () => {
    const handler = createHandler();

    await handler.handleMessage({
      type: 'project:addSource',
      request: {
        requestId: 'add-1',
        kind: 'drag-drop',
        formatId: 'nkv',
        sourcePath: '/workspace/project/media/clip.mp4',
        destination: {
          kind: 'project',
          projectRoot: '/workspace/project',
          copyMode: 'register',
        },
      },
    });

    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'project:sourceAdded',
        result: expect.objectContaining({
          ok: true,
          durablePath: 'media/clip.mp4',
        }),
      }),
    );
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: 'fileAdded',
      path: 'media/clip.mp4',
      mediaType: 'video',
    });
  });

  it('rejects add-source requests that only contain a browser file name', async () => {
    const handler = createHandler();

    await handler.handleMessage({
      type: 'project:addSource',
      request: {
        requestId: 'add-2',
        kind: 'drag-drop',
        formatId: 'nkv',
        browserFile: { name: 'clip.mp4', type: 'video/mp4' },
        destination: {
          kind: 'project',
          projectRoot: '/workspace/project',
          copyMode: 'register',
        },
      },
    });

    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'project:sourceAdded',
        result: expect.objectContaining({
          ok: false,
          diagnostics: expect.arrayContaining([
            expect.objectContaining({ code: 'missing-source' }),
          ]),
        }),
      }),
    );
    expect(webview.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'fileAdded' }),
    );
  });

  function createHandler(): MessageHandler {
    return new MessageHandler(
      webview as never,
      model as never,
      { globalStorageUri: { fsPath: '/tmp/neko' } } as never,
      null,
    );
  }
});

function createProject(): ProjectData {
  return {
    version: '2.0',
    name: 'Save test',
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    tracks: [],
  };
}
