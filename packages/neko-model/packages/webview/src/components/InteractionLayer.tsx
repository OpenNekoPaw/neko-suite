import React, { useEffect, useRef } from 'react';
import type { SceneControlSocket } from '@neko/neko-client';
import type { SceneDelta } from '@neko/shared';
import type { SceneHitTestResult } from '../scene/SceneDocument';
import { useModelStore } from '../stores/modelStore';

export interface ViewportQueryBase extends Record<string, unknown> {
  viewportId: string;
  sceneId?: string;
  sceneRevision: number;
  resolution?: ViewportQueryResolution;
}

export interface ViewportPointerQuery extends ViewportQueryBase {
  x: number;
  y: number;
  nodeIds?: string[];
}

export interface ViewportQueryResolution {
  width: number;
  height: number;
  pixelRatio: number;
}

type ViewportOverlayPatch = NonNullable<SceneDelta['overlay']>;
type ProjectedBounds = NonNullable<ViewportOverlayPatch['projectedBounds']>[number];
type GizmoAnchor = NonNullable<ViewportOverlayPatch['gizmoAnchors']>[number];

export interface InteractionLayerProps {
  viewportId: string;
  sceneId?: string;
  sceneRevision: number;
  resolution?: ViewportQueryResolution | null;
  selectedNodeId: string | null;
  socket: SceneControlSocket | null;
  onSelectNode: (nodeId: string | null) => void;
  onQueryError?: (error: Error) => void;
}

export const INTERACTION_LAYER_INPUT_POLICY = {
  role: 'render-only',
  semanticOwner: 'viewport-shell',
  pointerEvents: 'none',
} as const;

export function InteractionLayer({
  viewportId,
  sceneId,
  sceneRevision,
  resolution,
  selectedNodeId,
  socket,
  onQueryError,
}: InteractionLayerProps): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!socket || !selectedNodeId) return;
    const applyQueryError = (error: unknown) => {
      if (error instanceof Error) {
        onQueryError?.(error);
        return;
      }
      onQueryError?.(new Error(String(error)));
    };
    const queryPayload = {
      viewportId,
      sceneId,
      sceneRevision,
      resolution: resolution ?? undefined,
      nodeIds: [selectedNodeId],
    };
    void Promise.all([
      socket.query('projectedBounds', queryPayload),
      socket.query('gizmoAnchor', queryPayload),
    ])
      .then(([boundsResult, anchorResult]) => {
        const overlay = viewportOverlayFromQueryResults({
          sceneId,
          viewportId,
          sceneRevision,
          selectedNodeId,
          boundsResult,
          anchorResult,
        });
        if (overlay) {
          useModelStore.getState().setViewportOverlay(overlay);
        }
      })
      .catch(applyQueryError);
  }, [onQueryError, sceneId, sceneRevision, resolution, selectedNodeId, socket, viewportId]);

  return (
    <div
      ref={rootRef}
      className="pointer-events-none absolute inset-0"
      data-route-a-interaction-layer="engine-queries"
      data-semantic-input-owner={INTERACTION_LAYER_INPUT_POLICY.semanticOwner}
      data-interaction-layer-policy={INTERACTION_LAYER_INPUT_POLICY.role}
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

export function buildViewportPointerQueryFromPosition(
  viewportId: string,
  sceneRevision: number,
  rect: Pick<DOMRect, 'width' | 'height'>,
  position: readonly [number, number],
): ViewportPointerQuery {
  return {
    viewportId,
    sceneRevision,
    x: clamp01(position[0] / Math.max(1, rect.width)),
    y: clamp01(position[1] / Math.max(1, rect.height)),
  };
}

export function isCompatibleViewportQueryResult(
  result: Pick<SceneHitTestResult, 'sceneId' | 'viewportId' | 'revision'>,
  sceneId: string,
  viewportId: string,
  sceneRevision: number,
): boolean {
  return (
    (result.sceneId === undefined || result.sceneId === sceneId) &&
    result.viewportId === viewportId &&
    result.revision >= sceneRevision
  );
}

export interface ViewportOverlayQueryResults {
  readonly sceneId?: string;
  readonly viewportId: string;
  readonly sceneRevision: number;
  readonly selectedNodeId: string;
  readonly boundsResult: unknown;
  readonly anchorResult: unknown;
}

export function viewportOverlayFromQueryResults({
  sceneId,
  viewportId,
  sceneRevision,
  selectedNodeId,
  boundsResult,
  anchorResult,
}: ViewportOverlayQueryResults): ViewportOverlayPatch | null {
  const projectedBounds = readProjectedBounds(boundsResult, selectedNodeId);
  const gizmoAnchors = readGizmoAnchors(anchorResult, selectedNodeId);
  const boundsRevision = readViewportQueryRevision(boundsResult);
  const anchorRevision = readViewportQueryRevision(anchorResult);
  const revision = Math.max(boundsRevision ?? sceneRevision, anchorRevision ?? sceneRevision);
  const compatibleBounds =
    projectedBounds.length === 0 ||
    isCompatibleQueryEnvelope(boundsResult, sceneId, viewportId, sceneRevision);
  const compatibleAnchor =
    gizmoAnchors.length === 0 ||
    isCompatibleQueryEnvelope(anchorResult, sceneId, viewportId, sceneRevision);
  if (!compatibleBounds || !compatibleAnchor) {
    return null;
  }
  return {
    viewportId,
    revision,
    selectedNodeIds: [selectedNodeId],
    projectedBounds,
    gizmoAnchors,
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function isCompatibleQueryEnvelope(
  value: unknown,
  sceneId: string | undefined,
  viewportId: string,
  sceneRevision: number,
): boolean {
  if (!isRecord(value)) return false;
  return isCompatibleViewportQueryResult(
    {
      sceneId: readString(value['sceneId']),
      viewportId: readString(value['viewportId']) ?? viewportId,
      revision: readFiniteNumber(value['revision']) ?? sceneRevision,
    },
    sceneId ?? '',
    viewportId,
    sceneRevision,
  );
}

function readViewportQueryRevision(value: unknown): number | undefined {
  return isRecord(value) ? readFiniteNumber(value['revision']) : undefined;
}

function readProjectedBounds(value: unknown, selectedNodeId: string): ProjectedBounds[] {
  const items = readQueryItems(value, 'projectedBounds');
  return items
    .map((item) => readProjectedBoundsItem(item, selectedNodeId))
    .filter((item): item is ProjectedBounds => item !== null);
}

function readGizmoAnchors(value: unknown, selectedNodeId: string): GizmoAnchor[] {
  const items = readQueryItems(value, 'gizmoAnchors');
  return items
    .map((item) => readGizmoAnchorItem(item, selectedNodeId))
    .filter((item): item is GizmoAnchor => item !== null);
}

function readQueryItems(value: unknown, key: 'projectedBounds' | 'gizmoAnchors'): unknown[] {
  if (!isRecord(value)) return [];
  const direct = value[key];
  if (Array.isArray(direct)) return direct;
  const items = value['items'];
  if (Array.isArray(items)) return items;
  return [value];
}

function readProjectedBoundsItem(value: unknown, selectedNodeId: string): ProjectedBounds | null {
  if (!isRecord(value)) return null;
  const nodeId = readString(value['nodeId']) ?? selectedNodeId;
  const min = readVec2(value['min']);
  const max = readVec2(value['max']);
  if (!min || !max) return null;
  return { nodeId, min, max };
}

function readGizmoAnchorItem(value: unknown, selectedNodeId: string): GizmoAnchor | null {
  if (!isRecord(value)) return null;
  const nodeId = readString(value['nodeId']) ?? selectedNodeId;
  const screenPosition = readVec2(value['screenPosition']);
  const worldPosition = readVec3(value['worldPosition']);
  if (!screenPosition && !worldPosition) return null;
  return {
    nodeId,
    ...(screenPosition ? { screenPosition } : {}),
    ...(worldPosition ? { worldPosition } : {}),
  };
}

function readVec2(value: unknown): { x: number; y: number } | undefined {
  if (!isRecord(value)) return undefined;
  const x = readFiniteNumber(value['x']);
  const y = readFiniteNumber(value['y']);
  return x !== undefined && y !== undefined ? { x, y } : undefined;
}

function readVec3(value: unknown): { x: number; y: number; z: number } | undefined {
  if (!isRecord(value)) return undefined;
  const x = readFiniteNumber(value['x']);
  const y = readFiniteNumber(value['y']);
  const z = readFiniteNumber(value['z']);
  return x !== undefined && y !== undefined && z !== undefined ? { x, y, z } : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
