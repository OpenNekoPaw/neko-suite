import { describe, expect, it } from 'vitest';
import {
  createEngineViewportSummary,
  createViewportIntentAck,
  probeEngineConnection,
  resolveEnginePort,
} from './engine-connection';

describe('desktop engine connection', () => {
  it('resolves the local neko-engine port from environment or default', () => {
    expect(resolveEnginePort({})).toBe(8765);
    expect(resolveEnginePort({ NEKO_ENGINE_PORT: '9001' })).toBe(9001);
    expect(() => resolveEnginePort({ NEKO_ENGINE_PORT: '0' })).toThrow('Invalid NEKO_ENGINE_PORT');
    expect(() => resolveEnginePort({ NEKO_ENGINE_PORT: 'abc' })).toThrow(
      'Invalid NEKO_ENGINE_PORT',
    );
  });

  it('projects reachable engine health into a ready viewport summary', async () => {
    const status = await probeEngineConnection({
      port: 9001,
      createClient: (port) => ({
        health: async () => port === 9001,
      }),
    });
    const viewport = createEngineViewportSummary(status);

    expect(status.reachable).toBe(true);
    expect(viewport.availability).toBe('ready');
    expect(viewport.diagnostic).toContain('127.0.0.1:9001');
    expect(viewport.session.ownerRuntime).toBe('neko-engine');
    expect(viewport.session.output.authoritative).toBe(true);
    expect(viewport.session.output.textureBoundary.status).toBe('planned');
    expect(viewport.session.controlSurfaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'desktop-webview-viewport-controls',
          authoritative: false,
        }),
      ]),
    );
  });

  it('rejects viewport intents visibly when neko-engine is unavailable', async () => {
    const status = await probeEngineConnection({
      port: 9002,
      createClient: () => ({
        health: async () => false,
      }),
    });
    const viewport = createEngineViewportSummary(status);
    const ack = createViewportIntentAck(
      { viewportId: viewport.id, action: 'play', source: 'renderer' },
      viewport,
    );

    expect(viewport.availability).toBe('unavailable');
    expect(viewport.session.output.textureBoundary.status).toBe('unavailable');
    expect(viewport.session.nonAuthoritativeProjections.map((projection) => projection.id)).toEqual([
      'html-video',
      'canvas',
      'webcodecs',
      'electron-webcontents',
    ]);
    expect(ack).toMatchObject({
      accepted: false,
      action: 'play',
      reason: 'engine-unavailable',
    });
    expect(ack.diagnostic).toContain('Start neko-engine');
  });
});
