import { describe, expect, it } from 'vitest';
import {
  DESKTOP_BRIDGE_CHANNELS,
  assertDesktopBridgeChannel,
  isDesktopBridgeChannel,
  normalizeViewportIntent,
} from './contracts';

describe('desktop bridge contracts', () => {
  it('accepts known bridge channels and rejects unknown channels visibly', () => {
    expect(isDesktopBridgeChannel(DESKTOP_BRIDGE_CHANNELS.getSnapshot)).toBe(true);
    expect(isDesktopBridgeChannel(DESKTOP_BRIDGE_CHANNELS.sendViewportIntent)).toBe(true);
    expect(isDesktopBridgeChannel('neko-desktop:missing')).toBe(false);
    expect(() => assertDesktopBridgeChannel('neko-desktop:missing')).toThrow(
      'Unknown desktop bridge channel',
    );
  });

  it('normalizes a renderer viewport intent', () => {
    expect(
      normalizeViewportIntent({
        viewportId: 'engine-viewport-primary',
        action: 'inspect',
        source: 'renderer',
        payload: { resourceId: 'scene-1' },
      }),
    ).toEqual({
      viewportId: 'engine-viewport-primary',
      action: 'inspect',
      source: 'renderer',
      payload: { resourceId: 'scene-1' },
    });
  });

  it('rejects malformed viewport intents', () => {
    expect(() => normalizeViewportIntent(undefined)).toThrow('Viewport intent must be an object');
    expect(() =>
      normalizeViewportIntent({ viewportId: '', action: 'inspect', source: 'renderer' }),
    ).toThrow('viewportId is required');
    expect(() =>
      normalizeViewportIntent({
        viewportId: 'engine-viewport-primary',
        action: 'render',
        source: 'renderer',
      }),
    ).toThrow('Unknown viewport intent action');
    expect(() =>
      normalizeViewportIntent({
        viewportId: 'engine-viewport-primary',
        action: 'inspect',
        source: 'main',
      }),
    ).toThrow('source must be renderer');
  });
});
