import React, { useEffect, useRef } from 'react';
import type { SceneControlSocket } from '@neko/neko-client';
import type { SceneDelta, SelectionTarget } from '@neko/shared';
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
  selectedTargets?: readonly SelectionTarget[];
  lightNodeIds?: readonly string[];
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
  selectedTargets = [],
  lightNodeIds = [],
  socket,
  onQueryError,
}: InteractionLayerProps): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!socket || !hasOverlayQueryTarget(selectedNodeId, selectedTargets, lightNodeIds)) return;
    const applyQueryError = (error: unknown) => {
      if (error instanceof Error) {
        onQueryError?.(error);
        return;
      }
      onQueryError?.(new Error(String(error)));
    };
    const queryPayload = buildViewportOverlayQueryPayload({
      viewportId,
      sceneId,
      sceneRevision,
      resolution: resolution ?? undefined,
      selectedNodeId,
      selectedTargets,
      lightNodeIds,
    });
    void socket
      .query('overlayState', queryPayload)
      .then((overlayResult) => {
        const overlay = viewportOverlayFromQueryResults({
          sceneId,
          viewportId,
          sceneRevision,
          selectedNodeId: selectedNodeId ?? '',
          selectedTargets,
          overlayResult,
          boundsResult: overlayResult,
          anchorResult: overlayResult,
        });
        if (overlay) {
          useModelStore.getState().setViewportOverlay(overlay);
        }
      })
      .catch(applyQueryError);
  }, [
    lightNodeIds,
    onQueryError,
    sceneId,
    sceneRevision,
    resolution,
    selectedNodeId,
    selectedTargets,
    socket,
    viewportId,
  ]);

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

export interface ViewportOverlayQueryPayload extends ViewportQueryBase {
  nodeIds: string[];
  selectedNodeIds: string[];
  selectedTargets?: SelectionTarget[];
  lightNodeIds: string[];
}

export interface ViewportOverlayQueryPayloadOptions {
  viewportId: string;
  sceneId?: string;
  sceneRevision: number;
  resolution?: ViewportQueryResolution;
  selectedNodeId: string | null;
  selectedTargets?: readonly SelectionTarget[];
  lightNodeIds?: readonly string[];
}

export function buildViewportOverlayQueryPayload({
  viewportId,
  sceneId,
  sceneRevision,
  resolution,
  selectedNodeId,
  selectedTargets = [],
  lightNodeIds = [],
}: ViewportOverlayQueryPayloadOptions): ViewportOverlayQueryPayload {
  const targets = selectedTargets.map(cloneSelectionTarget);
  const selectedNodeIds = uniqueStrings([
    ...(selectedNodeId ? [selectedNodeId] : []),
    ...nodeIdsFromSelectionTargets(targets),
  ]);
  return {
    viewportId,
    sceneId,
    sceneRevision,
    resolution,
    nodeIds: selectedNodeIds,
    selectedNodeIds,
    ...(targets.length > 0 ? { selectedTargets: targets } : {}),
    lightNodeIds: [...lightNodeIds],
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
  readonly selectedTargets?: readonly SelectionTarget[];
  readonly overlayResult?: unknown;
  readonly boundsResult: unknown;
  readonly anchorResult: unknown;
}

export function viewportOverlayFromQueryResults({
  sceneId,
  viewportId,
  sceneRevision,
  selectedNodeId,
  selectedTargets = [],
  overlayResult,
  boundsResult,
  anchorResult,
}: ViewportOverlayQueryResults): ViewportOverlayPatch | null {
  const projectedBounds = readProjectedBounds(boundsResult, selectedNodeId);
  const gizmoAnchors = readGizmoAnchors(anchorResult, selectedNodeId);
  const selectedNodeIds = readSelectedNodeIds(overlayResult).filter(Boolean);
  const returnedTargets = readSelectedTargets(overlayResult);
  const resolvedTargets = returnedTargets.length > 0 ? returnedTargets : [...selectedTargets];
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
    selectedNodeIds:
      selectedNodeIds.length > 0
        ? selectedNodeIds
        : selectedNodeId
          ? [selectedNodeId]
          : nodeIdsFromSelectionTargets(resolvedTargets),
    projectedBounds,
    gizmoAnchors,
    ...(resolvedTargets.length > 0 ? { selectedTargets: resolvedTargets } : {}),
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
  const aliases =
    key === 'projectedBounds' ? [value['bounds']] : [value['anchors'], value['lightHelpers']];
  for (const alias of aliases) {
    if (Array.isArray(alias)) return alias;
  }
  const items = value['items'];
  if (Array.isArray(items)) return items;
  return [value];
}

function readSelectedNodeIds(value: unknown): string[] {
  if (!isRecord(value)) return [];
  const selectedNodeIds = value['selectedNodeIds'];
  if (!Array.isArray(selectedNodeIds)) return [];
  return selectedNodeIds.filter((item): item is string => typeof item === 'string');
}

function readSelectedTargets(value: unknown): SelectionTarget[] {
  if (!isRecord(value)) return [];
  const selectedTargets = value['selectedTargets'];
  if (!Array.isArray(selectedTargets)) return [];
  return selectedTargets
    .map(readSelectionTarget)
    .filter((target): target is SelectionTarget => target !== undefined);
}

function readProjectedBoundsItem(value: unknown, selectedNodeId: string): ProjectedBounds | null {
  if (!isRecord(value)) return null;
  const nodeId = readString(value['nodeId']) ?? selectedNodeId;
  const min = readVec2(value['min']);
  const max = readVec2(value['max']);
  if (!min || !max) return null;
  const target = readSelectionTarget(value['target']);
  return {
    nodeId,
    min,
    max,
    ...(target ? { target } : {}),
  };
}

function readGizmoAnchorItem(value: unknown, selectedNodeId: string): GizmoAnchor | null {
  if (!isRecord(value)) return null;
  const nodeId = readString(value['nodeId']) ?? selectedNodeId;
  const screenPosition = readVec2(value['screenPosition']);
  const worldPosition = readVec3(value['worldPosition']);
  const target = readSelectionTarget(value['target']);
  if (!screenPosition && !worldPosition) return null;
  return {
    nodeId,
    ...(screenPosition ? { screenPosition } : {}),
    ...(worldPosition ? { worldPosition } : {}),
    ...(target ? { target } : {}),
  };
}

function readSelectionTarget(value: unknown): SelectionTarget | undefined {
  if (!isRecord(value)) return undefined;
  const kind = readSelectionKind(value['kind']);
  if (!kind) return undefined;
  const target: SelectionTarget = { kind };
  const nodeId = readString(value['nodeId']);
  if (nodeId !== undefined) target.nodeId = nodeId;
  const characterId = readString(value['characterId']);
  if (characterId !== undefined) target.characterId = characterId;
  const boneId = readString(value['boneId']);
  if (boneId !== undefined) target.boneId = boneId;
  const materialSlotId = readString(value['materialSlotId']);
  if (materialSlotId !== undefined) target.materialSlotId = materialSlotId;
  const submeshId = readString(value['submeshId']);
  if (submeshId !== undefined) target.submeshId = submeshId;
  const primitiveId = readString(value['primitiveId']);
  if (primitiveId !== undefined) target.primitiveId = primitiveId;
  const regionId = readString(value['regionId']);
  if (regionId !== undefined) target.regionId = regionId;
  const morphId = readString(value['morphId']);
  if (morphId !== undefined) target.morphId = morphId;
  const environmentId = readString(value['environmentId']);
  if (environmentId !== undefined) target.environmentId = environmentId;
  return target;
}

function hasOverlayQueryTarget(
  selectedNodeId: string | null,
  selectedTargets: readonly SelectionTarget[],
  lightNodeIds: readonly string[],
): boolean {
  return (
    selectedNodeId !== null ||
    selectedTargets.some((target) => typeof target.nodeId === 'string') ||
    lightNodeIds.length > 0
  );
}

function nodeIdsFromSelectionTargets(targets: readonly SelectionTarget[]): string[] {
  return uniqueStrings(
    targets
      .map((target) => target.nodeId)
      .filter((nodeId): nodeId is string => typeof nodeId === 'string' && nodeId.length > 0),
  );
}

function uniqueStrings(values: readonly string[]): string[] {
  const result: string[] = [];
  for (const value of values) {
    if (!result.includes(value)) {
      result.push(value);
    }
  }
  return result;
}

function cloneSelectionTarget(target: SelectionTarget): SelectionTarget {
  const cloned: SelectionTarget = { ...target };
  if (target.hit) {
    cloned.hit = {
      ...target.hit,
      ...(target.hit.worldPosition ? { worldPosition: { ...target.hit.worldPosition } } : {}),
      ...(target.hit.worldNormal ? { worldNormal: { ...target.hit.worldNormal } } : {}),
    };
  }
  return cloned;
}

function readSelectionKind(value: unknown): SelectionTarget['kind'] | undefined {
  switch (value) {
    case 'node':
    case 'bone':
    case 'materialSlot':
    case 'submesh':
    case 'primitive':
    case 'characterRegion':
    case 'morphControl':
    case 'environment':
      return value;
    default:
      return undefined;
  }
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
