import { beforeEach, describe, expect, it, vi } from 'vitest';

const getExtension = vi.fn();
const warn = vi.fn();

vi.mock('vscode', () => ({
  extensions: {
    getExtension,
  },
  Uri: {
    file: vi.fn(),
  },
  workspace: {
    fs: {
      readFile: vi.fn(),
    },
  },
}));

vi.mock('../base', () => ({
  getLogger: vi.fn(() => ({
    warn,
    info: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('CanvasStoryboardSinkAdapter', () => {
  beforeEach(() => {
    getExtension.mockReset();
    warn.mockReset();
  });

  it('returns undefined and warns when required extensions are unavailable', async () => {
    getExtension.mockReturnValue(undefined);

    const { CanvasStoryboardSinkAdapter } = await import('./workflow-adapters');
    const adapter = new CanvasStoryboardSinkAdapter();

    await expect(
      adapter.importStoryboard({
        source: '/tmp/script.fountain',
        sourceFormat: 'fountain',
        scenePlans: [{ sceneId: 'scene-1' }],
      }),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      'importStoryboardToCanvas: neko-story or neko-canvas extension is unavailable, skipping canvas import',
    );
  });
});
