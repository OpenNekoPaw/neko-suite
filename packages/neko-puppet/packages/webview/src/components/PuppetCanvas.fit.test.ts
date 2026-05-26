import { describe, expect, it } from 'vitest';
import {
  calculateInitialPuppetViewport,
  calculatePuppetBounds,
  createMeshSnapshotFallbacks,
} from './PuppetCanvas';
import type { DeformedMesh, MeshSnapshot } from '../animation/types';

describe('PuppetCanvas fit-to-view', () => {
  it('calculates bounds from all finite mesh vertices', () => {
    const meshes: DeformedMesh[] = [
      {
        node_id: 'body',
        vertices: [
          [-100, -200],
          [100, 300],
          [Number.NaN, 0],
        ],
        blend_mode: 'Normal',
        opacity: 1,
        z_order: 0,
      },
      {
        node_id: 'hair',
        vertices: [
          [-120, -240],
          [80, -180],
        ],
        blend_mode: 'Normal',
        opacity: 1,
        z_order: 1,
      },
    ];

    expect(calculatePuppetBounds(meshes)).toEqual({
      minX: -120,
      minY: -240,
      maxX: 100,
      maxY: 300,
    });
  });

  it('centers the puppet and chooses a visible initial zoom', () => {
    const viewport = calculateInitialPuppetViewport(
      { minX: -100, minY: -200, maxX: 100, maxY: 300 },
      { width: 1000, height: 800 },
    );

    expect(viewport?.zoom).toBeCloseTo(1.248);
    expect(viewport?.panX).toBeCloseTo(0);
    expect(viewport?.panY).toBeCloseTo(-62.4);
  });

  it('falls back to snapshot mesh vertices when live deformed meshes are not available yet', () => {
    const snapshots: MeshSnapshot[] = [
      {
        node_id: 'ArtMesh2',
        vertices: [
          [0, 0],
          [10, 0],
          [0, 10],
        ],
        uvs: [
          [0, 0],
          [1, 0],
          [0, 1],
        ],
        indices: [0, 1, 2],
        texture_index: null,
      },
    ];

    expect(createMeshSnapshotFallbacks(snapshots, [])).toEqual([
      {
        node_id: 'ArtMesh2',
        vertices: snapshots[0]!.vertices,
        blend_mode: 'normal',
        opacity: 1,
        z_order: 0,
      },
    ]);
  });

  it('keeps authoritative deformed meshes when they are present', () => {
    const meshes: DeformedMesh[] = [
      {
        node_id: 'ArtMesh2',
        vertices: [[1, 2]],
        blend_mode: 'multiply',
        opacity: 0.5,
        z_order: 2,
      },
    ];

    expect(createMeshSnapshotFallbacks([], meshes)).toEqual(meshes);
  });
});
