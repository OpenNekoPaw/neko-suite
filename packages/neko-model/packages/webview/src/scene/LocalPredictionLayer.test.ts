import { describe, expect, it } from 'vitest';
import { LocalPredictionLayer } from './LocalPredictionLayer';

describe('LocalPredictionLayer', () => {
  it('manages create, update, commit, rollback, timeout, and topology invalidation', () => {
    const layer = new LocalPredictionLayer();
    const transform = layer.create({
      kind: 'transform',
      seq: 10,
      viewportId: 'main',
      sceneRevision: 2,
      nodeId: 'node_1',
      payload: { x: 1 },
      nowMs: 100,
      timeoutMs: 50,
    });
    expect(transform.status).toBe('active');
    expect(layer.update(transform.id, { y: 2 }, 120)?.payload).toEqual({ x: 1, y: 2 });

    layer.commitThrough(10);
    expect(layer.active()).toHaveLength(0);

    const morph = layer.create({
      kind: 'morph',
      seq: 11,
      viewportId: 'main',
      sceneRevision: 3,
      characterId: 'character-a',
      topologyVersion: 7,
      payload: { morphId: 'Smile', weight: 0.5 },
      nowMs: 200,
    });
    layer.rollback(morph.seq);
    expect(layer.active()).toHaveLength(0);

    layer.create({
      kind: 'brush',
      seq: 12,
      viewportId: 'main',
      sceneRevision: 3,
      sessionId: 'sculpt-1',
      topologyVersion: 7,
      payload: { strokeId: 'stroke-1' },
      nowMs: 300,
      timeoutMs: 10,
    });
    layer.timeout(320);
    expect(layer.active()).toHaveLength(0);

    layer.create({
      kind: 'topology',
      seq: 13,
      viewportId: 'main',
      sceneRevision: 4,
      topologyVersion: 7,
      payload: {},
    });
    layer.invalidate({ topologyVersion: 8 });
    expect(layer.active()).toHaveLength(0);
  });
});
