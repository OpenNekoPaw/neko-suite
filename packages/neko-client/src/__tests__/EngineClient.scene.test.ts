import { afterEach, describe, expect, it, vi } from 'vitest';
import { EngineClient } from '../EngineClient';

function mockDispatchResponse(data: unknown): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({ id: 'req-1', status: 'ok', data }),
  } as Response);
}

function lastDispatchBody(): Record<string, unknown> {
  const calls = vi.mocked(globalThis.fetch).mock.calls;
  const call = calls[calls.length - 1];
  if (!call) {
    throw new Error('fetch was not called');
  }
  const init = call[1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

describe('EngineClient scene operations', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes procedural scene operation responses into scene snapshots', async () => {
    mockDispatchResponse({
      nodes: [
        {
          id: 'shape-1',
          name: 'Shape Cube',
          position: [1, 2, 3],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
          children: [],
          visible: true,
          has_mesh: true,
        },
      ],
      animations: [{ name: 'Idle', duration: 1.25, channel_count: 2 }],
    });
    const client = new EngineClient(7788);

    await expect(client.createShape('cube', { width: 1 })).resolves.toMatchObject({
      sceneId: 'default',
      revision: 0,
      nodes: [
        {
          nodeId: 'shape-1',
          name: 'Shape Cube',
          visible: true,
          kind: 'mesh',
          transform: {
            position: { x: 1, y: 2, z: 3 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
          },
        },
      ],
      animations: [{ name: 'Idle', duration: 1.25 }],
    });
    expect(lastDispatchBody()).toEqual(
      expect.objectContaining({
        group: 'scenes',
        action: 'create_shape',
        options: { type: 'cube', width: 1 },
      }),
    );
  });

  it('normalizes text and CSG scene operation responses through the same snapshot contract', async () => {
    mockDispatchResponse({ sceneId: 'scene-main', revision: 4, nodes: [], animations: [] });
    const client = new EngineClient(7788);

    await expect(client.createTextMesh('Hello', 1, 0.1)).resolves.toMatchObject({
      sceneId: 'scene-main',
      revision: 4,
      nodes: [],
      animations: [],
    });
    expect(lastDispatchBody()).toEqual(
      expect.objectContaining({
        group: 'scenes',
        action: 'create_text',
        options: { text: 'Hello', fontSize: 1, extrusionDepth: 0.1 },
      }),
    );

    mockDispatchResponse({ sceneId: 'scene-main', revision: 5, nodes: [], animations: [] });
    await expect(client.csgBoolean('a', 'b', 'union')).resolves.toMatchObject({
      sceneId: 'scene-main',
      revision: 5,
      nodes: [],
      animations: [],
    });
    expect(lastDispatchBody()).toEqual(
      expect.objectContaining({
        group: 'scenes',
        action: 'csg_boolean',
        options: { entityA: 'a', entityB: 'b', operation: 'union' },
      }),
    );
  });
});
