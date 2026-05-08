import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchPreviewDelegate } from './previewDelegates';

describe('dispatchPreviewDelegate', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      vscode: { postMessage: vi.fn() },
    });
  });

  it('delegates through the VSCode message boundary', () => {
    dispatchPreviewDelegate({
      action: { id: 'open', label: 'Open', target: 'preview' },
      asset: { kind: 'asset-identity', path: 'pano.exr', mediaType: 'image' },
    });

    expect(window.vscode?.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'preview:delegateAction',
        action: expect.objectContaining({ target: 'preview' }),
        asset: expect.objectContaining({ path: 'pano.exr' }),
      }),
    );
  });
});
