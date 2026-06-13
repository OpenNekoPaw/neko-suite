import { describe, expect, it } from 'vitest';
import { NEKO_LIVE_LOCAL_PREVIEW_ENABLED } from './rendererMigration';
import { selectLiveVisualPath } from './viewport/liveVisualPath';

describe('neko-live renderer migration preview', () => {
  it('keeps the local renderer behind an explicit non-authoritative preview flag', () => {
    expect(NEKO_LIVE_LOCAL_PREVIEW_ENABLED).toBe(true);
  });

  it('prefers compositor visual truth and only selects local preview when compositor is unavailable', () => {
    expect(
      selectLiveVisualPath({
        compositorStatus: 'active',
        hasController: true,
        hasAvatar: true,
        localPreviewEnabled: NEKO_LIVE_LOCAL_PREVIEW_ENABLED,
      }),
    ).toBe('compositor');

    expect(
      selectLiveVisualPath({
        compositorStatus: 'unavailable',
        hasController: true,
        hasAvatar: true,
        localPreviewEnabled: NEKO_LIVE_LOCAL_PREVIEW_ENABLED,
      }),
    ).toBe('local-preview');
  });
});
