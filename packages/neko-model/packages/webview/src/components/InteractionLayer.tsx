import React, { useEffect, useRef } from 'react';
import type { SceneControlSocket } from '@neko/neko-client';
import type { SceneHitTestResult } from '../scene/SceneDocument';

export interface ViewportQueryBase extends Record<string, unknown> {
  viewportId: string;
  sceneRevision: number;
}

export interface ViewportPointerQuery extends ViewportQueryBase {
  x: number;
  y: number;
  nodeIds?: string[];
}

export interface InteractionLayerProps {
  viewportId: string;
  sceneRevision: number;
  selectedNodeId: string | null;
  socket: SceneControlSocket | null;
  onSelectNode: (nodeId: string | null) => void;
  onQueryError?: (error: Error) => void;
}

export function InteractionLayer({
  viewportId,
  sceneRevision,
  selectedNodeId,
  socket,
}: InteractionLayerProps): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!socket || !selectedNodeId) return;
    void socket.query('projectedBounds', {
      viewportId,
      sceneRevision,
      nodeIds: [selectedNodeId],
    });
    void socket.query('gizmoAnchor', {
      viewportId,
      sceneRevision,
      nodeIds: [selectedNodeId],
    });
  }, [sceneRevision, selectedNodeId, socket, viewportId]);

  return (
    <div
      ref={rootRef}
      className="pointer-events-none absolute inset-0"
      data-route-a-interaction-layer="engine-queries"
    />
  );
}

export function buildViewportPointerQuery(
  viewportId: string,
  sceneRevision: number,
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  event: Pick<React.PointerEvent, 'clientX' | 'clientY'>,
): ViewportPointerQuery {
  return {
    viewportId,
    sceneRevision,
    x: clamp01((event.clientX - rect.left) / Math.max(1, rect.width)),
    y: clamp01((event.clientY - rect.top) / Math.max(1, rect.height)),
  };
}

export function isCompatibleViewportQueryResult(
  result: Pick<SceneHitTestResult, 'viewportId' | 'revision'>,
  viewportId: string,
  sceneRevision: number,
): boolean {
  return result.viewportId === viewportId && result.revision >= sceneRevision;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
