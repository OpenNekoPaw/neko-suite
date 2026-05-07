import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  commands: {
    executeCommand: vi.fn(),
  },
  workspace: {
    fs: {
      readFile: vi.fn(),
    },
  },
}));

import * as vscode from 'vscode';
import {
  getPanoramicImageRoute,
  getPanoramicVideoRoute,
  getHighConfidencePanoramicImageRoute,
  isHighConfidencePanoramicImageCandidate,
  openBestPanoramicPreview,
  openPanoramicImage,
  openPanoramicVideo,
} from '../panoramicRouting';

describe('panoramic image routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(vscode.workspace.fs.readFile).mockRejectedValue(new Error('not mocked') as never);
  });

  it('routes high-confidence HDR/EXR and filename hints', () => {
    expect(isHighConfidencePanoramicImageCandidate('/assets/studio.hdr')).toBe(true);
    expect(isHighConfidencePanoramicImageCandidate('/assets/studio.exr')).toBe(true);
    expect(isHighConfidencePanoramicImageCandidate('/assets/studio_360.jpg')).toBe(true);
    expect(isHighConfidencePanoramicImageCandidate('/assets/flat-wide.jpg')).toBe(false);
  });

  it('keeps low-confidence 2:1 images explicit-only at the route layer', () => {
    expect(getPanoramicImageRoute('/assets/flat-wide.jpg', false)).toBeNull();
    expect(getPanoramicImageRoute('/assets/flat-wide.jpg', true)).toMatchObject({
      command: 'neko.preview.openPanoramicImage',
      viewType: 'neko.preview.panoramicImage',
      confidence: 'explicit',
      signal: 'manual',
    });
  });

  it('routes GPano metadata as a high-confidence image without filename hints', async () => {
    vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
      Buffer.from(
        '<x:xmpmeta><rdf:Description GPano:ProjectionType="equirectangular" /></x:xmpmeta>',
      ) as never,
    );
    const uri = { fsPath: '/assets/mobile-photo.jpg' } as vscode.Uri;

    await expect(getHighConfidencePanoramicImageRoute(uri)).resolves.toMatchObject({
      confidence: 'high',
      signal: 'gpano-metadata',
    });
  });

  it('opens the manifest-backed panoramic custom editor', async () => {
    const uri = { fsPath: '/assets/studio_360.jpg' } as vscode.Uri;

    await openPanoramicImage(uri);

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'vscode.openWith',
      uri,
      'neko.preview.panoramicImage',
    );
  });

  it('routes explicit and high-confidence panoramic videos', async () => {
    expect(getPanoramicVideoRoute('/assets/tour_360.mp4', false)).toMatchObject({
      viewType: 'neko.preview.panoramicVideo',
      confidence: 'high',
    });
    expect(getPanoramicVideoRoute('/assets/ordinary.mp4', false)).toBeNull();
    expect(getPanoramicVideoRoute('/assets/ordinary.mp4', true)).toMatchObject({
      command: 'neko.preview.openPanoramicVideo',
      confidence: 'explicit',
    });

    const uri = { fsPath: '/assets/tour_360.mp4' } as vscode.Uri;
    await openPanoramicVideo(uri);
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'vscode.openWith',
      uri,
      'neko.preview.panoramicVideo',
    );
  });

  it('opens only high-confidence candidates through the best panoramic entry', async () => {
    await expect(
      openBestPanoramicPreview({ fsPath: '/assets/studio_360.jpg' } as vscode.Uri),
    ).resolves.toBe(true);
    vi.mocked(vscode.workspace.fs.readFile).mockRejectedValue(new Error('not mocked') as never);
    await expect(
      openBestPanoramicPreview({ fsPath: '/assets/ordinary.jpg' } as vscode.Uri),
    ).resolves.toBe(false);
  });
});
