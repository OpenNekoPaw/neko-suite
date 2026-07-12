import { describe, expect, it } from 'vitest';
import {
  isGeneratedDraftRef,
  resolveGeneratedAssetMediaKind,
  resolveWorkspaceGeneratedAssetRelativeDirectory,
  sanitizeGeneratedAssetPathSegment,
} from '../generated-asset';
import { createGeneratedAssetRevisionRef } from '../generated-asset-lifecycle';

describe('generated asset path contracts', () => {
  it('resolves durable workspace generated roots by media kind', () => {
    expect(resolveWorkspaceGeneratedAssetRelativeDirectory({ mimeType: 'image/png' })).toBe(
      'neko/generated/image',
    );
    expect(resolveWorkspaceGeneratedAssetRelativeDirectory({ mimeType: 'audio/wav' })).toBe(
      'neko/generated/audio',
    );
    expect(resolveWorkspaceGeneratedAssetRelativeDirectory({ mimeType: 'video/mp4' })).toBe(
      'neko/generated/video',
    );
    expect(
      resolveWorkspaceGeneratedAssetRelativeDirectory({
        mimeType: 'application/vnd.neko.storyboard+json',
      }),
    ).toBe('neko/generated/storyboard');
    expect(
      resolveWorkspaceGeneratedAssetRelativeDirectory({ mimeType: 'application/octet-stream' }),
    ).toBe('neko/generated/file');
  });

  it('accepts explicit media kind only for canonical generated asset directories', () => {
    expect(resolveGeneratedAssetMediaKind({ mediaKind: 'Image', mimeType: 'video/mp4' })).toBe(
      'image',
    );
    expect(resolveGeneratedAssetMediaKind({ mediaKind: 'thumbnail', mimeType: 'image/png' })).toBe(
      'image',
    );
    expect(sanitizeGeneratedAssetPathSegment(' Story Board! ')).toBe('story-board');
  });

  it('models generated drafts as runtime projections, not durable result urls', () => {
    expect(
      isGeneratedDraftRef({
        kind: 'generated-draft',
        draftId: 'draft-1',
        mediaKind: 'image',
        mimeType: 'image/png',
        lifecycle: createGeneratedAssetRevisionRef({
          assetId: 'draft-1',
          contentDigest: 'sha256:draft',
          mediaKind: 'image',
          mimeType: 'image/png',
          generation: { taskId: 'task-1' },
        }),
      }),
    ).toBe(true);
    expect(
      isGeneratedDraftRef({
        kind: 'generated-draft',
        draftId: 'draft-2',
        mediaKind: 'thumbnail',
      }),
    ).toBe(false);
  });
});
