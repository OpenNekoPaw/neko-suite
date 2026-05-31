import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EngineClient,
  createNodeRemovePayload,
  createSceneCommandEnvelope,
  defaultModelLookDevSceneControlCapabilities,
} from '../EngineClient';

function mockDispatchResponse(data: unknown): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({ id: 'req-1', status: 'ok', data }),
  } as Response);
}

function mockDispatchError(message: string): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({
      id: 'req-1',
      status: 'error',
      error: { code: 'engine.unsupported', message },
    }),
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

  it('normalizes lookdev stream descriptors and environment snapshots', async () => {
    mockDispatchResponse({
      streamId: 'stream-main',
      viewportId: 'main',
      container: 'h264-annexb',
      codecString: 'avc1.42001f',
      frameHeader: 'neko-h264-v1',
      width: 1280,
      height: 720,
      fps: 60,
      colorSpace: 'srgb',
      bitDepth: 8,
      toneMapping: 'aces',
      initialRevision: 4,
      renderMode: 'clay',
      debugView: 'albedo',
      lookdev: {
        renderMode: 'clay',
        materialOverride: { kind: 'clay', roughness: 0.9 },
      },
    });
    const client = new EngineClient(7788);

    const stream = await client.startSceneRenderStream({
      viewportId: 'main',
      sceneId: 'scene-main',
      renderMode: 'clay',
      resolution: { width: 1280, height: 720, pixelRatio: 1 },
      fps: 60,
      colorSpace: 'srgb',
      toneMapping: 'aces',
      workMode: 'lookdev',
      lookdev: {
        renderMode: 'clay',
        materialOverride: { kind: 'clay', roughness: 0.9 },
      },
    });

    expect(stream.descriptor.renderMode).toBe('clay');
    expect(stream.descriptor.debugView).toBe('albedo');
    expect(stream.descriptor.lookdev?.materialOverride?.kind).toBe('clay');
    expect(lastDispatchBody()).toEqual(
      expect.objectContaining({
        options: expect.objectContaining({
          renderMode: 'clay',
          lookdev: expect.objectContaining({
            renderMode: 'clay',
          }),
        }),
      }),
    );

    mockDispatchResponse({
      sceneId: 'scene-main',
      revision: 5,
      nodes: [],
      animations: [],
      environment: {
        environmentId: 'env-studio',
        mode: 'background-and-ibl',
        rotationDeg: 10,
        intensity: 1,
        exposure: 0,
        visibleAsBackground: true,
        backgroundColor: { x: 0, y: 0, z: 0, w: 1 },
      },
    });
    await expect(client.getSceneSnapshot()).resolves.toMatchObject({
      environment: {
        environmentId: 'env-studio',
        mode: 'background-and-ibl',
        backgroundColor: { w: 1 },
      },
    });
  });

  it('builds typed scene command envelopes and default lookdev capabilities', () => {
    expect(
      createSceneCommandEnvelope({
        seq: 12,
        baseRevision: 5,
        type: 'node-remove',
        payload: createNodeRemovePayload({ nodeId: 'light-key' }),
      }),
    ).toEqual({
      seq: 12,
      baseRevision: 5,
      command: {
        type: 'node-remove',
        payloadJson: JSON.stringify({ nodeId: 'light-key', cascade: false }),
      },
    });
    expect(defaultModelLookDevSceneControlCapabilities()).toMatchObject({
      clay: true,
      liveViewportSettings: false,
    });
  });

  it('discovers scene LookDev capability flags from Engine', async () => {
    mockDispatchResponse({
      renderModes: ['pbr', 'clay', 'wireframe', 'unknown'],
      liveViewportSettings: true,
      clay: true,
      authoredLights: true,
      environment: true,
      typedPicking: true,
      characterRegions: false,
    });
    const client = new EngineClient(7788);

    await expect(client.getModelLookDevSceneControlCapabilities()).resolves.toEqual({
      renderModes: ['pbr', 'clay', 'wireframe'],
      liveViewportSettings: true,
      clay: true,
      authoredLights: true,
      environment: true,
      typedPicking: true,
      characterRegions: false,
    });
    expect(lastDispatchBody()).toEqual(
      expect.objectContaining({
        group: 'scenes',
        action: 'capabilities',
      }),
    );
  });

  it('rejects scene LookDev capability discovery errors from Engine', async () => {
    mockDispatchError('capability discovery unavailable');
    const client = new EngineClient(7788);

    await expect(client.getModelLookDevSceneControlCapabilities()).rejects.toThrow(
      'capability discovery unavailable',
    );
    expect(lastDispatchBody()).toEqual(
      expect.objectContaining({
        group: 'scenes',
        action: 'capabilities',
      }),
    );
  });

  it('routes typed selection queries through SceneControlSocket helper', async () => {
    const client = new EngineClient(7788);
    const query = vi.fn(async () => ({
      viewportId: 'main',
      revision: 5,
      candidates: [
        {
          kind: 'materialSlot',
          nodeId: 'node_1',
          materialSlotId: 'skin',
          hit: {
            worldPosition: [1, 2, 3],
            worldNormal: { x: 0, y: 1, z: 0 },
            depth: 0.25,
          },
        },
        { kind: 'unknown', nodeId: 'node_2' },
      ],
    }));

    await expect(
      client.querySceneSelection({ query } as never, {
        viewportId: 'main',
        x: 0.5,
        y: 0.4,
        mask: ['node', 'materialSlot'],
        mode: 'replace',
      }),
    ).resolves.toMatchObject({
      viewportId: 'main',
      revision: 5,
      candidates: [
        {
          kind: 'materialSlot',
          nodeId: 'node_1',
          materialSlotId: 'skin',
          hit: {
            worldPosition: { x: 1, y: 2, z: 3 },
            worldNormal: { x: 0, y: 1, z: 0 },
            depth: 0.25,
          },
        },
      ],
    });
    expect(query).toHaveBeenCalledWith('selectionQuery', {
      viewportId: 'main',
      x: 0.5,
      y: 0.4,
      mask: ['node', 'materialSlot'],
      mode: 'replace',
    });
  });
});
