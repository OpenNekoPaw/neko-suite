import { describe, expect, it } from 'vitest';
import {
  buildViewportPointerQuery,
  INTERACTION_LAYER_INPUT_POLICY,
  buildViewportPointerQueryFromPosition,
  isCompatibleViewportQueryResult,
  viewportOverlayFromQueryResults,
} from './InteractionLayer';

describe('InteractionLayer query helpers', () => {
  it('routes pointer coordinates through viewport and scene revision scoped payloads', () => {
    expect(
      buildViewportPointerQuery(
        'main',
        7,
        { left: 10, top: 20, width: 200, height: 100 },
        { clientX: 110, clientY: 70 },
      ),
    ).toEqual({
      viewportId: 'main',
      sceneRevision: 7,
      x: 0.5,
      y: 0.5,
    });
    expect(
      buildViewportPointerQueryFromPosition(
        'main',
        7,
        { width: 200, height: 100 },
        [100, 50],
      ),
    ).toEqual({
      viewportId: 'main',
      sceneRevision: 7,
      x: 0.5,
      y: 0.5,
    });
  });

  it('accepts only matching viewport query revisions', () => {
    expect(
      isCompatibleViewportQueryResult(
        { sceneId: 'scene-a', viewportId: 'main', revision: 8 },
        'scene-a',
        'main',
        7,
      ),
    ).toBe(true);
    expect(
      isCompatibleViewportQueryResult({ viewportId: 'main', revision: 8 }, 'scene-a', 'main', 7),
    ).toBe(true);
    expect(
      isCompatibleViewportQueryResult(
        { sceneId: 'scene-b', viewportId: 'main', revision: 8 },
        'scene-a',
        'main',
        7,
      ),
    ).toBe(false);
    expect(
      isCompatibleViewportQueryResult(
        { sceneId: 'scene-a', viewportId: 'side', revision: 8 },
        'scene-a',
        'main',
        7,
      ),
    ).toBe(false);
    expect(
      isCompatibleViewportQueryResult(
        { sceneId: 'scene-a', viewportId: 'main', revision: 6 },
        'scene-a',
        'main',
        7,
      ),
    ).toBe(false);
  });

  it('keeps the default interaction layer render-only for semantic input ownership', () => {
    expect(INTERACTION_LAYER_INPUT_POLICY).toEqual({
      role: 'render-only',
      semanticOwner: 'viewport-shell',
      pointerEvents: 'none',
    });
  });

  it('builds viewport overlay state from compatible bounds and gizmo query results', () => {
    expect(
      viewportOverlayFromQueryResults({
        sceneId: 'scene-a',
        viewportId: 'main',
        sceneRevision: 7,
        selectedNodeId: 'node-1',
        boundsResult: {
          sceneId: 'scene-a',
          viewportId: 'main',
          revision: 8,
          projectedBounds: [
            {
              nodeId: 'node-1',
              min: { x: 0.1, y: 0.2 },
              max: { x: 0.4, y: 0.6 },
            },
          ],
        },
        anchorResult: {
          sceneId: 'scene-a',
          viewportId: 'main',
          revision: 8,
          gizmoAnchors: [
            {
              nodeId: 'node-1',
              screenPosition: { x: 0.25, y: 0.35 },
            },
          ],
        },
      }),
    ).toEqual({
      viewportId: 'main',
      revision: 8,
      selectedNodeIds: ['node-1'],
      projectedBounds: [
        {
          nodeId: 'node-1',
          min: { x: 0.1, y: 0.2 },
          max: { x: 0.4, y: 0.6 },
        },
      ],
      gizmoAnchors: [
        {
          nodeId: 'node-1',
          screenPosition: { x: 0.25, y: 0.35 },
        },
      ],
    });
  });

  it('rejects stale or wrong-viewport overlay query results', () => {
    expect(
      viewportOverlayFromQueryResults({
        sceneId: 'scene-a',
        viewportId: 'main',
        sceneRevision: 7,
        selectedNodeId: 'node-1',
        boundsResult: {
          sceneId: 'scene-a',
          viewportId: 'main',
          revision: 6,
          projectedBounds: [
            {
              min: { x: 0, y: 0 },
              max: { x: 1, y: 1 },
            },
          ],
        },
        anchorResult: {
          sceneId: 'scene-a',
          viewportId: 'side',
          revision: 8,
          gizmoAnchors: [
            {
              screenPosition: { x: 0.5, y: 0.5 },
            },
          ],
        },
      }),
    ).toBeNull();
  });
});
