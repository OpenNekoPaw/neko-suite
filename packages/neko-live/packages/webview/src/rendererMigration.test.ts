import { describe, expect, it } from 'vitest';
import { NEKO_LIVE_RENDERER_FALLBACK_ENABLED } from './rendererMigration';
import { selectLiveVisualPath } from './viewport/liveVisualPath';

describe('neko-live renderer migration fallback', () => {
  it('keeps the local renderer behind an explicit non-authoritative fallback flag', () => {
    expect(NEKO_LIVE_RENDERER_FALLBACK_ENABLED).toBe(true);
  });

  it('prefers compositor visual truth and only selects local fallback when compositor is unavailable', () => {
    expect(
      selectLiveVisualPath({
        compositorStatus: 'active',
        hasController: true,
        hasAvatar: true,
        fallbackEnabled: NEKO_LIVE_RENDERER_FALLBACK_ENABLED,
      }),
    ).toBe('compositor');

    expect(
      selectLiveVisualPath({
        compositorStatus: 'unavailable',
        hasController: true,
        hasAvatar: true,
        fallbackEnabled: NEKO_LIVE_RENDERER_FALLBACK_ENABLED,
      }),
    ).toBe('local-fallback');
  });
});
