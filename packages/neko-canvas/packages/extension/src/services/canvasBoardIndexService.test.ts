import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CANVAS_BOARD_DIRECTORY,
  CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
  createEmptyCanvasData,
  saveNkc,
} from '@neko/shared';
import { CanvasBoardIndexService } from './canvasBoardIndexService';

const vscodeMockState = vi.hoisted(() => {
  class MockUri {
    readonly scheme = 'file';

    private constructor(readonly fsPath: string) {}

    static file(filePath: string): MockUri {
      return new MockUri(filePath);
    }

    toString(): string {
      return `file://${this.fsPath}`;
    }
  }

  class MockRelativePattern {
    constructor(
      readonly base: { readonly uri: MockUri },
      readonly pattern: string,
    ) {}
  }

  const files = new Map<string, Uint8Array>();
  const mtimes = new Map<string, number>();
  const readFile = vi.fn(async (uri: MockUri) => {
    const content = files.get(uri.fsPath);
    if (!content) throw new Error(`ENOENT: ${uri.fsPath}`);
    return content;
  });
  const stat = vi.fn(async (uri: MockUri) => {
    if (!files.has(uri.fsPath)) throw new Error(`ENOENT: ${uri.fsPath}`);
    return { type: 1, mtime: mtimes.get(uri.fsPath) ?? 0 };
  });
  const writeFile = vi.fn(async (uri: MockUri, content: Uint8Array) => {
    files.set(uri.fsPath, content);
  });
  const rename = vi.fn(async (from: MockUri, to: MockUri) => {
    const content = files.get(from.fsPath);
    if (!content) throw new Error(`ENOENT: ${from.fsPath}`);
    files.set(to.fsPath, content);
    files.delete(from.fsPath);
  });
  const deleteFile = vi.fn(async (uri: MockUri) => files.delete(uri.fsPath));
  const findFiles = vi.fn(async () =>
    [...files.keys()]
      .filter((filePath) => /^\/workspace\/project\/neko\/boards\/[^/]+\.nkc$/i.test(filePath))
      .map(MockUri.file),
  );

  return {
    MockUri,
    MockRelativePattern,
    files,
    mtimes,
    readFile,
    stat,
    writeFile,
    rename,
    deleteFile,
    findFiles,
  };
});

vi.mock('vscode', () => ({
  Uri: vscodeMockState.MockUri,
  RelativePattern: vscodeMockState.MockRelativePattern,
  workspace: {
    workspaceFolders: [
      {
        uri: vscodeMockState.MockUri.file('/workspace/project'),
        name: 'project',
        index: 0,
      },
    ],
    findFiles: vscodeMockState.findFiles,
    fs: {
      readFile: vscodeMockState.readFile,
      stat: vscodeMockState.stat,
      writeFile: vscodeMockState.writeFile,
      rename: vscodeMockState.rename,
      delete: vscodeMockState.deleteFile,
    },
  },
}));

function putCanvas(
  relativePath: string,
  input: {
    readonly title: string;
    readonly projectId?: string;
    readonly workId?: string;
    readonly mtime?: number;
  },
): void {
  const canvas = createEmptyCanvasData(input.title);
  canvas.creativeScope = {
    kind: 'generic',
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.workId ? { workId: input.workId } : {}),
  };
  const absolutePath = `/workspace/project/${relativePath}`;
  vscodeMockState.files.set(absolutePath, new TextEncoder().encode(saveNkc(canvas)));
  vscodeMockState.mtimes.set(absolutePath, input.mtime ?? Date.UTC(2026, 6, 15));
}

describe('CanvasBoardIndexService', () => {
  beforeEach(() => {
    vscodeMockState.files.clear();
    vscodeMockState.mtimes.clear();
    vscodeMockState.findFiles.mockClear();
    vscodeMockState.readFile.mockClear();
    vscodeMockState.stat.mockClear();
  });

  it('returns sanitized exact summaries only from neko/boards', async () => {
    putCanvas('neko/boards/story.nkc', {
      title: 'Story',
      projectId: 'project:1',
      workId: 'work:1',
    });
    putCanvas('neko/boards/other.nkc', {
      title: 'Other',
      projectId: 'project:2',
      workId: 'work:2',
    });
    putCanvas('neko/cut/professional.nkc', {
      title: 'Professional',
      projectId: 'project:1',
      workId: 'work:1',
    });

    const result = await new CanvasBoardIndexService().query({
      version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
      directory: CANVAS_BOARD_DIRECTORY,
      filter: { projectId: 'project:1', workId: 'work:1' },
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.summaries).toHaveLength(1);
    expect(result.summaries[0]).toMatchObject({
      documentRef: { kind: 'workspace-path', path: 'neko/boards/story.nkc' },
      title: 'Story',
      projectId: 'project:1',
      workId: 'work:1',
      revision: expect.stringMatching(/^nkc:/),
      updatedAt: '2026-07-15T00:00:00.000Z',
    });
    expect(JSON.stringify(result)).not.toMatch(/\/workspace|file:|renderUri|canvasData|nodes/);
  });

  it('does not reuse Boards without stable project/work evidence', async () => {
    putCanvas('neko/boards/notes.nkc', { title: 'Notes' });

    const result = await new CanvasBoardIndexService().query({
      version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
      directory: CANVAS_BOARD_DIRECTORY,
      filter: { scopeKind: 'generic' },
    });

    expect(result.summaries).toEqual([]);
  });

  it('returns a diagnostic instead of raw content for an invalid Board file', async () => {
    vscodeMockState.files.set(
      '/workspace/project/neko/boards/broken.nkc',
      new TextEncoder().encode('{broken'),
    );

    const result = await new CanvasBoardIndexService().query({
      version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
      directory: CANVAS_BOARD_DIRECTORY,
      filter: { projectId: 'project:1' },
    });

    expect(result.summaries).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe('stale-board-target');
    expect(JSON.stringify(result)).not.toContain('{broken');
  });

  it('returns undefined for a deleted Board target', async () => {
    const result = await new CanvasBoardIndexService().get({
      kind: 'workspace-path',
      path: 'neko/boards/deleted.nkc',
    });

    expect(result).toBeUndefined();
  });
});
