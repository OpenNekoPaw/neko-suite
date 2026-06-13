import type {
  PathSegment,
  VectorHandleMode,
  VectorLayerData,
  VectorNode,
  VectorNodeRef,
  VectorNodeRole,
  VectorPath,
} from '../types/vector';

export interface VectorPoint {
  readonly x: number;
  readonly y: number;
}

export interface VectorHandleEdge {
  readonly pathId: string;
  readonly from: VectorPoint;
  readonly to: VectorPoint;
  readonly role: 'incoming' | 'outgoing' | 'quadratic';
}

export interface VectorNodeMoveOptions {
  readonly moveAdjacentControls?: boolean;
}

export interface VectorNodeDelta {
  readonly dx: number;
  readonly dy: number;
}

export interface VectorDeleteSelectionResult {
  readonly layerData: VectorLayerData;
  readonly deleted: boolean;
}

export interface VectorHandleModeResult {
  readonly layerData: VectorLayerData;
  readonly changed: boolean;
  readonly anchors: readonly VectorNodeRef[];
}

export interface VectorPathEditResult {
  readonly layerData: VectorLayerData;
  readonly changed: boolean;
}

export interface VectorDuplicatePathOptions {
  readonly id?: string;
  readonly offset?: VectorNodeDelta;
}

export interface VectorDuplicatePathResult extends VectorPathEditResult {
  readonly pathId: string | null;
}

export interface VectorSelectionRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface VectorBoxSelectionOptions {
  readonly additive?: boolean;
}

let duplicatedVectorPathCounter = 0;

export function createVectorLayerData(paths: readonly VectorPath[] = []): VectorLayerData {
  return {
    paths,
    selectedPathId: paths[0]?.id ?? null,
    selectedNodeRefs: [],
    handleModes: [],
  };
}

export function listVectorPathNodes(path: VectorPath): VectorNode[] {
  const nodes: VectorNode[] = [];
  path.segments.forEach((segment, segmentIndex) => {
    segment.points.forEach((point, pointIndex) => {
      nodes.push({
        ref: {
          pathId: path.id,
          segmentIndex,
          pointIndex,
          role: getVectorNodeRole(segment, pointIndex),
        },
        x: point[0],
        y: point[1],
      });
    });
  });
  return nodes;
}

export function listVectorPathHandleEdges(path: VectorPath): VectorHandleEdge[] {
  const edges: VectorHandleEdge[] = [];
  path.segments.forEach((segment, segmentIndex) => {
    const previousAnchor = getSegmentAnchorPoint(path.segments[segmentIndex - 1]);
    if (!previousAnchor) {
      return;
    }

    if (segment.type === 'cubic') {
      const controlOut = segment.points[0];
      const controlIn = segment.points[1];
      const anchor = segment.points[2];
      if (controlOut) {
        edges.push({
          pathId: path.id,
          from: toVectorPoint(previousAnchor),
          to: toVectorPoint(controlOut),
          role: 'outgoing',
        });
      }
      if (controlIn && anchor) {
        edges.push({
          pathId: path.id,
          from: toVectorPoint(controlIn),
          to: toVectorPoint(anchor),
          role: 'incoming',
        });
      }
      return;
    }

    if (segment.type === 'quadratic') {
      const control = segment.points[0];
      const anchor = segment.points[1];
      if (control) {
        edges.push({
          pathId: path.id,
          from: toVectorPoint(previousAnchor),
          to: toVectorPoint(control),
          role: 'quadratic',
        });
      }
      if (control && anchor) {
        edges.push({
          pathId: path.id,
          from: toVectorPoint(control),
          to: toVectorPoint(anchor),
          role: 'quadratic',
        });
      }
    }
  });
  return edges;
}

export function hitTestVectorPathNode(
  path: VectorPath,
  point: VectorPoint,
  radius: number,
): VectorNode | null {
  const radiusSq = radius * radius;
  let best: { readonly node: VectorNode; readonly distanceSq: number } | null = null;
  for (const node of listVectorPathNodes(path)) {
    const dx = node.x - point.x;
    const dy = node.y - point.y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq <= radiusSq && (!best || distanceSq < best.distanceSq)) {
      best = { node, distanceSq };
    }
  }
  return best?.node ?? null;
}

function getVectorNodeKey(ref: VectorNodeRef): string {
  return `${ref.pathId}:${ref.segmentIndex}:${ref.pointIndex}`;
}

export function hasVectorNodeRef(
  refs: readonly VectorNodeRef[] | undefined,
  ref: VectorNodeRef,
): boolean {
  return (refs ?? []).some((item) => areVectorNodeRefsEqual(item, ref));
}

export function toggleVectorNodeSelection(
  refs: readonly VectorNodeRef[] | undefined,
  ref: VectorNodeRef,
): readonly VectorNodeRef[] {
  if (hasVectorNodeRef(refs, ref)) {
    return (refs ?? []).filter((item) => !areVectorNodeRefsEqual(item, ref));
  }
  return [...(refs ?? []), ref];
}

export function getVectorAnchorHandleMode(
  layerData: VectorLayerData,
  anchorRef: VectorNodeRef,
): VectorHandleMode {
  const found = (layerData.handleModes ?? []).find((item) =>
    areVectorNodeRefsEqual(item.anchor, anchorRef),
  );
  return found?.mode ?? 'corner';
}

export function getVectorHandleAnchorRefsForSelection(
  layerData: VectorLayerData,
): readonly VectorNodeRef[] {
  const anchors: VectorNodeRef[] = [];
  const seen = new Set<string>();
  for (const ref of layerData.selectedNodeRefs ?? []) {
    const path = layerData.paths.find((item) => item.id === ref.pathId);
    if (!path) {
      continue;
    }
    const anchor = getVectorHandleAnchorRef(path, ref);
    if (!anchor) {
      continue;
    }
    const key = getVectorNodeKey(anchor);
    if (!seen.has(key)) {
      anchors.push(anchor);
      seen.add(key);
    }
  }
  return anchors;
}

export function setVectorHandleModeForSelection(
  layerData: VectorLayerData,
  mode: VectorHandleMode,
): VectorHandleModeResult {
  const anchors = getVectorHandleAnchorRefsForSelection(layerData);
  if (anchors.length === 0) {
    return { layerData, changed: false, anchors };
  }

  const anchorKeys = new Set(anchors.map(getVectorNodeKey));
  const handleModes = [
    ...(layerData.handleModes ?? []).filter(
      (item) => !anchorKeys.has(getVectorNodeKey(item.anchor)),
    ),
    ...anchors.map((anchor) => ({ anchor, mode })),
  ];
  const nextLayerData = { ...layerData, handleModes };
  return {
    layerData: nextLayerData,
    changed: JSON.stringify(layerData.handleModes ?? []) !== JSON.stringify(handleModes),
    anchors,
  };
}

export function moveVectorPathNode(
  path: VectorPath,
  ref: VectorNodeRef,
  target: VectorPoint,
  options: VectorNodeMoveOptions = {},
): VectorPath {
  if (ref.pathId !== path.id) {
    return path;
  }

  const sourcePoint = path.segments[ref.segmentIndex]?.points[ref.pointIndex];
  if (!sourcePoint) {
    return path;
  }

  const dx = target.x - sourcePoint[0];
  const dy = target.y - sourcePoint[1];
  const segments = path.segments.map((segment, segmentIndex) =>
    updateSegmentPoint(segment, segmentIndex, ref, target, {
      dx,
      dy,
      moveAdjacentControls: options.moveAdjacentControls ?? true,
      nextSegmentIndex: ref.segmentIndex + 1,
    }),
  );

  return { ...path, segments };
}

export function moveVectorLayerNodes(
  layerData: VectorLayerData,
  refs: readonly VectorNodeRef[],
  delta: VectorNodeDelta,
  options: VectorNodeMoveOptions = {},
): VectorLayerData {
  if (refs.length === 0 || (delta.dx === 0 && delta.dy === 0)) {
    return layerData;
  }

  const refsByPath = groupRefsByPath(refs);
  const paths = layerData.paths.map((path) => {
    const pathRefs = refsByPath.get(path.id);
    if (!pathRefs || pathRefs.length === 0) {
      return path;
    }
    return moveVectorPathNodes(layerData, path, pathRefs, delta, options);
  });

  return { ...layerData, paths };
}

export function replaceVectorLayerPath(
  layerData: VectorLayerData,
  updatedPath: VectorPath,
): VectorLayerData {
  return {
    ...layerData,
    paths: layerData.paths.map((path) => (path.id === updatedPath.id ? updatedPath : path)),
  };
}

export function setSelectedVectorPathClosed(
  layerData: VectorLayerData,
  closed: boolean,
): VectorPathEditResult {
  const selectedPath = getSelectedVectorPath(layerData);
  if (!selectedPath || selectedPath.closed === closed) {
    return { layerData, changed: false };
  }

  return {
    layerData: replaceVectorLayerPath(layerData, { ...selectedPath, closed }),
    changed: true,
  };
}

export function toggleSelectedVectorPathClosed(layerData: VectorLayerData): VectorPathEditResult {
  const selectedPath = getSelectedVectorPath(layerData);
  if (!selectedPath) {
    return { layerData, changed: false };
  }
  return setSelectedVectorPathClosed(layerData, !selectedPath.closed);
}

export function reverseSelectedVectorPath(layerData: VectorLayerData): VectorPathEditResult {
  const selectedPath = getSelectedVectorPath(layerData);
  if (!selectedPath) {
    return { layerData, changed: false };
  }

  const reversed = reverseVectorPath(selectedPath);
  if (
    !reversed ||
    JSON.stringify(reversed.path.segments) === JSON.stringify(selectedPath.segments)
  ) {
    return { layerData, changed: false };
  }

  return {
    layerData: {
      ...replaceVectorLayerPath(layerData, reversed.path),
      selectedNodeRefs: mapVectorNodeRefs(
        layerData.selectedNodeRefs ?? [],
        selectedPath.id,
        reversed.refMap,
      ),
      handleModes: mapVectorHandleModeAssignments(
        layerData.handleModes ?? [],
        selectedPath.id,
        reversed.refMap,
      ),
    },
    changed: true,
  };
}

export function duplicateSelectedVectorPath(
  layerData: VectorLayerData,
  options: VectorDuplicatePathOptions = {},
): VectorDuplicatePathResult {
  const selectedPath = getSelectedVectorPath(layerData);
  if (!selectedPath) {
    return { layerData, changed: false, pathId: null };
  }

  const offset = options.offset ?? { dx: 16, dy: 16 };
  const pathId = createUniqueVectorPathId(
    options.id ?? createDuplicateVectorPathId(selectedPath.id),
    new Set(layerData.paths.map((path) => path.id)),
  );
  const duplicatedPath = offsetVectorPath({ ...selectedPath, id: pathId }, offset);
  const selectedNodeRefs = listVectorPathNodes(duplicatedPath)
    .filter((node) => node.ref.role === 'anchor')
    .map((node) => node.ref);
  const copiedHandleModes = (layerData.handleModes ?? [])
    .filter((assignment) => assignment.anchor.pathId === selectedPath.id)
    .map((assignment) => ({
      anchor: { ...assignment.anchor, pathId },
      mode: assignment.mode,
    }));

  return {
    layerData: {
      ...layerData,
      paths: [...layerData.paths, duplicatedPath],
      selectedPathId: pathId,
      selectedNodeRefs,
      handleModes: [...(layerData.handleModes ?? []), ...copiedHandleModes],
    },
    changed: true,
    pathId,
  };
}

export function selectVectorNodesInRect(
  layerData: VectorLayerData,
  rect: VectorSelectionRect,
  options: VectorBoxSelectionOptions = {},
): VectorPathEditResult {
  const bounds = normalizeSelectionRect(rect);
  const hits: VectorNodeRef[] = [];
  for (const path of layerData.paths) {
    for (const node of listVectorPathNodes(path)) {
      if (
        node.x >= bounds.minX &&
        node.x <= bounds.maxX &&
        node.y >= bounds.minY &&
        node.y <= bounds.maxY
      ) {
        hits.push(node.ref);
      }
    }
  }

  const selectedNodeRefs = options.additive
    ? dedupeVectorNodeRefs([...(layerData.selectedNodeRefs ?? []), ...hits])
    : hits;
  const selectedPathId = selectedNodeRefs[0]?.pathId ?? layerData.selectedPathId ?? null;
  const nextLayerData: VectorLayerData = {
    ...layerData,
    selectedNodeRefs,
    selectedPathId,
  };

  return {
    layerData: nextLayerData,
    changed:
      !areVectorNodeRefArraysEqual(layerData.selectedNodeRefs ?? [], selectedNodeRefs) ||
      (layerData.selectedPathId ?? null) !== selectedPathId,
  };
}

export function deleteVectorSelection(layerData: VectorLayerData): VectorDeleteSelectionResult {
  const selectedRefs = layerData.selectedNodeRefs ?? [];
  if (selectedRefs.length === 0) {
    return deleteSelectedPath(layerData);
  }

  const refsByPath = groupRefsByPath(selectedRefs);
  const paths: VectorPath[] = [];
  for (const path of layerData.paths) {
    const pathRefs = refsByPath.get(path.id);
    if (!pathRefs || pathRefs.length === 0) {
      paths.push(path);
      continue;
    }
    const updatedPath = deleteVectorPathNodes(path, pathRefs);
    if (updatedPath) {
      paths.push(updatedPath);
    }
  }

  const nextLayerData: VectorLayerData = {
    ...layerData,
    paths,
    selectedPathId: paths.some((path) => path.id === layerData.selectedPathId)
      ? layerData.selectedPathId
      : (paths[0]?.id ?? null),
    selectedNodeRefs: [],
  };

  return {
    layerData: nextLayerData,
    deleted:
      getVectorLayerRenderSignature(nextLayerData) !== getVectorLayerRenderSignature(layerData),
  };
}

export function getVectorLayerRenderSignature(layerData: VectorLayerData): string {
  return JSON.stringify(layerData.paths);
}

function getSelectedVectorPath(layerData: VectorLayerData): VectorPath | null {
  const selectedPathId = layerData.selectedPathId ?? null;
  if (!selectedPathId) {
    return null;
  }
  return layerData.paths.find((path) => path.id === selectedPathId) ?? null;
}

function reverseVectorPath(
  path: VectorPath,
): { readonly path: VectorPath; readonly refMap: ReadonlyMap<string, VectorNodeRef> } | null {
  if (path.segments.length < 2) {
    return null;
  }

  const lastSegment = path.segments[path.segments.length - 1];
  const lastAnchor = getSegmentAnchorPoint(lastSegment);
  if (!lastAnchor) {
    return null;
  }

  const segments: PathSegment[] = [{ type: 'move', points: [cloneVectorTuple(lastAnchor)] }];
  for (let segmentIndex = path.segments.length - 1; segmentIndex >= 1; segmentIndex--) {
    const segment = path.segments[segmentIndex];
    const previousAnchor = getSegmentAnchorPoint(path.segments[segmentIndex - 1]);
    if (!segment || !previousAnchor) {
      return null;
    }
    const reversedSegment = reversePathSegment(segment, previousAnchor);
    if (!reversedSegment) {
      return null;
    }
    segments.push(reversedSegment);
  }

  const reversedPath = { ...path, segments };
  return {
    path: reversedPath,
    refMap: buildReversedVectorNodeRefMap(path, reversedPath),
  };
}

function reversePathSegment(
  segment: PathSegment,
  previousAnchor: readonly [number, number],
): PathSegment | null {
  switch (segment.type) {
    case 'line':
    case 'move':
      return { type: 'line', points: [cloneVectorTuple(previousAnchor)] };
    case 'quadratic': {
      const control = segment.points[0];
      return control
        ? {
            type: 'quadratic',
            points: [cloneVectorTuple(control), cloneVectorTuple(previousAnchor)],
          }
        : null;
    }
    case 'cubic': {
      const controlOut = segment.points[0];
      const controlIn = segment.points[1];
      return controlOut && controlIn
        ? {
            type: 'cubic',
            points: [
              cloneVectorTuple(controlIn),
              cloneVectorTuple(controlOut),
              cloneVectorTuple(previousAnchor),
            ],
          }
        : null;
    }
    default:
      return null;
  }
}

function buildReversedVectorNodeRefMap(
  original: VectorPath,
  reversed: VectorPath,
): ReadonlyMap<string, VectorNodeRef> {
  const refMap = new Map<string, VectorNodeRef>();
  const lastIndex = original.segments.length - 1;

  original.segments.forEach((segment, segmentIndex) => {
    segment.points.forEach((_, pointIndex) => {
      const originalRef: VectorNodeRef = {
        pathId: original.id,
        segmentIndex,
        pointIndex,
        role: getVectorNodeRole(segment, pointIndex),
      };
      const reversedRef = mapVectorNodeRefToReversedPath(originalRef, segment, lastIndex, reversed);
      if (reversedRef) {
        refMap.set(getVectorNodeKey(originalRef), reversedRef);
      }
    });
  });

  return refMap;
}

function mapVectorNodeRefToReversedPath(
  originalRef: VectorNodeRef,
  originalSegment: PathSegment,
  originalLastIndex: number,
  reversed: VectorPath,
): VectorNodeRef | null {
  if (originalRef.role === 'anchor') {
    const newSegmentIndex = originalLastIndex - originalRef.segmentIndex;
    const newSegment = reversed.segments[newSegmentIndex];
    if (!newSegment) {
      return null;
    }
    const newPointIndex = getSegmentAnchorPointIndex(newSegment);
    return newPointIndex === null
      ? null
      : {
          pathId: reversed.id,
          segmentIndex: newSegmentIndex,
          pointIndex: newPointIndex,
          role: 'anchor',
        };
  }

  const newSegmentIndex = originalLastIndex + 1 - originalRef.segmentIndex;
  const newSegment = reversed.segments[newSegmentIndex];
  if (!newSegment) {
    return null;
  }

  if (originalSegment.type === 'cubic') {
    const newPointIndex = originalRef.pointIndex === 0 ? 1 : 0;
    return {
      pathId: reversed.id,
      segmentIndex: newSegmentIndex,
      pointIndex: newPointIndex,
      role: getVectorNodeRole(newSegment, newPointIndex),
    };
  }

  if (originalSegment.type === 'quadratic' && originalRef.pointIndex === 0) {
    return {
      pathId: reversed.id,
      segmentIndex: newSegmentIndex,
      pointIndex: 0,
      role: getVectorNodeRole(newSegment, 0),
    };
  }

  return null;
}

function mapVectorNodeRefs(
  refs: readonly VectorNodeRef[],
  pathId: string,
  refMap: ReadonlyMap<string, VectorNodeRef>,
): readonly VectorNodeRef[] {
  return dedupeVectorNodeRefs(
    refs.flatMap((ref) => {
      if (ref.pathId !== pathId) {
        return [ref];
      }
      const mapped = refMap.get(getVectorNodeKey(ref));
      return mapped ? [mapped] : [];
    }),
  );
}

function mapVectorHandleModeAssignments(
  assignments: readonly NonNullable<VectorLayerData['handleModes']>[number][],
  pathId: string,
  refMap: ReadonlyMap<string, VectorNodeRef>,
): NonNullable<VectorLayerData['handleModes']> {
  return assignments.flatMap((assignment) => {
    if (assignment.anchor.pathId !== pathId) {
      return [assignment];
    }
    const mapped = refMap.get(getVectorNodeKey(assignment.anchor));
    return mapped?.role === 'anchor' ? [{ anchor: mapped, mode: assignment.mode }] : [];
  });
}

function createDuplicateVectorPathId(pathId: string): string {
  duplicatedVectorPathCounter += 1;
  return `${pathId}-copy-${duplicatedVectorPathCounter}`;
}

function createUniqueVectorPathId(baseId: string, existingIds: ReadonlySet<string>): string {
  if (!existingIds.has(baseId)) {
    return baseId;
  }
  let index = 2;
  let candidate = `${baseId}-${index}`;
  while (existingIds.has(candidate)) {
    index += 1;
    candidate = `${baseId}-${index}`;
  }
  return candidate;
}

function offsetVectorPath(path: VectorPath, delta: VectorNodeDelta): VectorPath {
  return {
    ...path,
    segments: path.segments.map((segment) => ({
      ...segment,
      points: segment.points.map((point) => offsetVectorTuple(point, delta)),
    })),
  };
}

function offsetVectorTuple(
  point: readonly [number, number],
  delta: VectorNodeDelta,
): [number, number] {
  return [point[0] + delta.dx, point[1] + delta.dy];
}

function cloneVectorTuple(point: readonly [number, number]): [number, number] {
  return [point[0], point[1]];
}

function normalizeSelectionRect(rect: VectorSelectionRect): {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
} {
  const x2 = rect.x + rect.width;
  const y2 = rect.y + rect.height;
  return {
    minX: Math.min(rect.x, x2),
    minY: Math.min(rect.y, y2),
    maxX: Math.max(rect.x, x2),
    maxY: Math.max(rect.y, y2),
  };
}

function dedupeVectorNodeRefs(refs: readonly VectorNodeRef[]): readonly VectorNodeRef[] {
  const seen = new Set<string>();
  const result: VectorNodeRef[] = [];
  for (const ref of refs) {
    const key = getVectorNodeKey(ref);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(ref);
  }
  return result;
}

function areVectorNodeRefArraysEqual(
  left: readonly VectorNodeRef[],
  right: readonly VectorNodeRef[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((ref, index) => {
    const other = right[index];
    return other ? areVectorNodeRefsEqual(ref, other) : false;
  });
}

function areVectorNodeRefsEqual(left: VectorNodeRef, right: VectorNodeRef): boolean {
  return (
    left.pathId === right.pathId &&
    left.segmentIndex === right.segmentIndex &&
    left.pointIndex === right.pointIndex
  );
}

function groupRefsByPath(refs: readonly VectorNodeRef[]): Map<string, VectorNodeRef[]> {
  const grouped = new Map<string, VectorNodeRef[]>();
  for (const ref of refs) {
    const existing = grouped.get(ref.pathId);
    if (existing) {
      existing.push(ref);
    } else {
      grouped.set(ref.pathId, [ref]);
    }
  }
  return grouped;
}

function moveVectorPathNodes(
  layerData: VectorLayerData,
  path: VectorPath,
  refs: readonly VectorNodeRef[],
  delta: VectorNodeDelta,
  options: VectorNodeMoveOptions,
): VectorPath {
  const pointKeys = collectMovedPointKeys(path, refs, options.moveAdjacentControls ?? true);
  const segments = path.segments.map((segment, segmentIndex) => ({
    ...segment,
    points: segment.points.map((point, pointIndex) =>
      pointKeys.has(toSegmentPointKey(segmentIndex, pointIndex))
        ? ([point[0] + delta.dx, point[1] + delta.dy] as [number, number])
        : point,
    ),
  }));
  return applyMovedControlHandleConstraints(layerData, { ...path, segments }, refs, pointKeys);
}

function applyMovedControlHandleConstraints(
  layerData: VectorLayerData,
  path: VectorPath,
  refs: readonly VectorNodeRef[],
  movedPointKeys: ReadonlySet<string>,
): VectorPath {
  let updatedPath = path;
  for (const ref of refs) {
    if (ref.role === 'anchor') {
      continue;
    }

    const anchorRef = getVectorHandleAnchorRef(updatedPath, ref);
    if (!anchorRef) {
      continue;
    }
    const mode = getVectorAnchorHandleMode(layerData, anchorRef);
    if (mode === 'corner') {
      continue;
    }

    const oppositeRef = getOppositeControlRef(updatedPath, anchorRef, ref);
    if (
      !oppositeRef ||
      movedPointKeys.has(toSegmentPointKey(oppositeRef.segmentIndex, oppositeRef.pointIndex))
    ) {
      continue;
    }

    const anchor = getPathPoint(updatedPath, anchorRef);
    const movedControl = getPathPoint(updatedPath, ref);
    const oppositeControl = getPathPoint(updatedPath, oppositeRef);
    if (!anchor || !movedControl || !oppositeControl) {
      continue;
    }

    const dx = anchor[0] - movedControl[0];
    const dy = anchor[1] - movedControl[1];
    const movedLength = Math.hypot(dx, dy);
    if (movedLength === 0) {
      continue;
    }
    const oppositeLength =
      mode === 'mirrored'
        ? movedLength
        : Math.hypot(oppositeControl[0] - anchor[0], oppositeControl[1] - anchor[1]);
    const nextPoint: [number, number] = [
      anchor[0] + (dx / movedLength) * oppositeLength,
      anchor[1] + (dy / movedLength) * oppositeLength,
    ];
    updatedPath = setPathPoint(updatedPath, oppositeRef, nextPoint);
  }
  return updatedPath;
}

function collectMovedPointKeys(
  path: VectorPath,
  refs: readonly VectorNodeRef[],
  moveAdjacentControls: boolean,
): Set<string> {
  const keys = new Set<string>();
  for (const ref of refs) {
    if (ref.pathId !== path.id || !path.segments[ref.segmentIndex]?.points[ref.pointIndex]) {
      continue;
    }
    keys.add(toSegmentPointKey(ref.segmentIndex, ref.pointIndex));
    if (!moveAdjacentControls || ref.role !== 'anchor') {
      continue;
    }

    const segment = path.segments[ref.segmentIndex];
    if (segment) {
      segment.points.forEach((_, pointIndex) => {
        if (isIncomingControl(segment, pointIndex)) {
          keys.add(toSegmentPointKey(ref.segmentIndex, pointIndex));
        }
      });
    }

    const nextSegmentIndex = ref.segmentIndex + 1;
    const nextSegment = path.segments[nextSegmentIndex];
    if (nextSegment) {
      nextSegment.points.forEach((_, pointIndex) => {
        if (isOutgoingControl(nextSegment, pointIndex)) {
          keys.add(toSegmentPointKey(nextSegmentIndex, pointIndex));
        }
      });
    }
  }
  return keys;
}

function deleteSelectedPath(layerData: VectorLayerData): VectorDeleteSelectionResult {
  const selectedPathId = layerData.selectedPathId ?? null;
  if (!selectedPathId) {
    return { layerData, deleted: false };
  }

  const paths = layerData.paths.filter((path) => path.id !== selectedPathId);
  if (paths.length === layerData.paths.length) {
    return { layerData, deleted: false };
  }

  return {
    layerData: {
      ...layerData,
      paths,
      selectedPathId: paths[0]?.id ?? null,
      selectedNodeRefs: [],
    },
    deleted: true,
  };
}

function deleteVectorPathNodes(
  path: VectorPath,
  refs: readonly VectorNodeRef[],
): VectorPath | null {
  const selectedAnchorKeys = new Set(
    refs
      .filter((ref) => ref.role === 'anchor')
      .map((ref) => toSegmentPointKey(ref.segmentIndex, ref.pointIndex)),
  );
  const selectedControlKeys = new Set(
    refs
      .filter((ref) => ref.role !== 'anchor')
      .map((ref) => toSegmentPointKey(ref.segmentIndex, ref.pointIndex)),
  );
  const collapsed = collapseSelectedControls(path, selectedControlKeys);

  if (selectedAnchorKeys.size === 0) {
    return { ...path, segments: collapsed };
  }

  const anchorCount = collapsed.filter((segment) => getSegmentAnchorPoint(segment)).length;
  if (anchorCount - selectedAnchorKeys.size < 2) {
    return null;
  }

  const segments = collapsed.filter((segment, segmentIndex) => {
    const anchorPointIndex = getSegmentAnchorPointIndex(segment);
    return (
      anchorPointIndex === null ||
      !selectedAnchorKeys.has(toSegmentPointKey(segmentIndex, anchorPointIndex))
    );
  });
  const normalizedSegments = normalizeFirstSegment(segments);
  if (normalizedSegments.length < 2) {
    return null;
  }

  return {
    ...path,
    segments: normalizedSegments,
    closed: path.closed && normalizedSegments.length >= 3,
  };
}

function collapseSelectedControls(
  path: VectorPath,
  selectedControlKeys: ReadonlySet<string>,
): PathSegment[] {
  return path.segments.map((segment, segmentIndex) => {
    if (segment.type === 'quadratic') {
      const end = segment.points[1];
      if (end && selectedControlKeys.has(toSegmentPointKey(segmentIndex, 0))) {
        return { type: 'line', points: [end] };
      }
      return segment;
    }

    if (segment.type !== 'cubic') {
      return segment;
    }

    const previousAnchor = getSegmentAnchorPoint(path.segments[segmentIndex - 1]);
    const end = segment.points[2];
    const points = segment.points.map((point, pointIndex) => {
      if (pointIndex === 0 && selectedControlKeys.has(toSegmentPointKey(segmentIndex, 0))) {
        return previousAnchor
          ? ([previousAnchor[0], previousAnchor[1]] as [number, number])
          : point;
      }
      if (pointIndex === 1 && selectedControlKeys.has(toSegmentPointKey(segmentIndex, 1))) {
        return end ? ([end[0], end[1]] as [number, number]) : point;
      }
      return point;
    });
    return { ...segment, points };
  });
}

function normalizeFirstSegment(segments: readonly PathSegment[]): PathSegment[] {
  const first = segments[0];
  if (!first) {
    return [];
  }
  if (first.type === 'move') {
    return [...segments];
  }

  const anchor = getSegmentAnchorPoint(first);
  if (!anchor) {
    return [...segments.slice(1)];
  }
  return [{ type: 'move', points: [[anchor[0], anchor[1]]] }, ...segments.slice(1)];
}

function toSegmentPointKey(segmentIndex: number, pointIndex: number): string {
  return `${segmentIndex}:${pointIndex}`;
}

function updateSegmentPoint(
  segment: PathSegment,
  segmentIndex: number,
  ref: VectorNodeRef,
  target: VectorPoint,
  context: {
    readonly dx: number;
    readonly dy: number;
    readonly moveAdjacentControls: boolean;
    readonly nextSegmentIndex: number;
  },
): PathSegment {
  const points = segment.points.map((point, pointIndex) => {
    if (segmentIndex === ref.segmentIndex && pointIndex === ref.pointIndex) {
      return [target.x, target.y] as [number, number];
    }
    if (shouldMoveAdjacentControl(segment, segmentIndex, pointIndex, ref, context)) {
      return [point[0] + context.dx, point[1] + context.dy] as [number, number];
    }
    return point;
  });
  return { ...segment, points };
}

function shouldMoveAdjacentControl(
  segment: PathSegment,
  segmentIndex: number,
  pointIndex: number,
  ref: VectorNodeRef,
  context: {
    readonly moveAdjacentControls: boolean;
    readonly nextSegmentIndex: number;
  },
): boolean {
  if (!context.moveAdjacentControls || ref.role !== 'anchor') {
    return false;
  }

  if (segmentIndex === ref.segmentIndex && isIncomingControl(segment, pointIndex)) {
    return true;
  }

  if (segmentIndex === context.nextSegmentIndex && isOutgoingControl(segment, pointIndex)) {
    return true;
  }

  return false;
}

function getVectorNodeRole(segment: PathSegment, pointIndex: number): VectorNodeRole {
  switch (segment.type) {
    case 'move':
    case 'line':
      return 'anchor';
    case 'quadratic':
      return pointIndex === 1 ? 'anchor' : 'control';
    case 'cubic':
      if (pointIndex === 0) return 'control-out';
      if (pointIndex === 1) return 'control-in';
      return 'anchor';
    default:
      return 'anchor';
  }
}

function isIncomingControl(segment: PathSegment, pointIndex: number): boolean {
  return (
    (segment.type === 'cubic' && pointIndex === 1) ||
    (segment.type === 'quadratic' && pointIndex === 0)
  );
}

function getVectorHandleAnchorRef(path: VectorPath, ref: VectorNodeRef): VectorNodeRef | null {
  if (ref.pathId !== path.id) {
    return null;
  }
  if (ref.role === 'anchor') {
    return ref;
  }

  if (ref.role === 'control-in' || ref.role === 'control') {
    const segment = path.segments[ref.segmentIndex];
    const anchorPointIndex = segment ? getSegmentAnchorPointIndex(segment) : null;
    return anchorPointIndex === null
      ? null
      : {
          pathId: path.id,
          segmentIndex: ref.segmentIndex,
          pointIndex: anchorPointIndex,
          role: 'anchor',
        };
  }

  if (ref.role === 'control-out') {
    const segmentIndex = ref.segmentIndex - 1;
    const segment = path.segments[segmentIndex];
    const anchorPointIndex = segment ? getSegmentAnchorPointIndex(segment) : null;
    return anchorPointIndex === null
      ? null
      : {
          pathId: path.id,
          segmentIndex,
          pointIndex: anchorPointIndex,
          role: 'anchor',
        };
  }

  return null;
}

function getOppositeControlRef(
  path: VectorPath,
  anchorRef: VectorNodeRef,
  movedControlRef: VectorNodeRef,
): VectorNodeRef | null {
  if (movedControlRef.role === 'control-in') {
    const segmentIndex = anchorRef.segmentIndex + 1;
    const segment = path.segments[segmentIndex];
    if (segment?.type === 'cubic' && segment.points[0]) {
      return { pathId: path.id, segmentIndex, pointIndex: 0, role: 'control-out' };
    }
    return null;
  }

  if (movedControlRef.role === 'control-out') {
    const segment = path.segments[anchorRef.segmentIndex];
    if (segment?.type === 'cubic' && segment.points[1]) {
      return {
        pathId: path.id,
        segmentIndex: anchorRef.segmentIndex,
        pointIndex: 1,
        role: 'control-in',
      };
    }
  }

  return null;
}

function getPathPoint(path: VectorPath, ref: VectorNodeRef): readonly [number, number] | null {
  return path.segments[ref.segmentIndex]?.points[ref.pointIndex] ?? null;
}

function setPathPoint(
  path: VectorPath,
  ref: VectorNodeRef,
  point: readonly [number, number],
): VectorPath {
  return {
    ...path,
    segments: path.segments.map((segment, segmentIndex) =>
      segmentIndex === ref.segmentIndex
        ? {
            ...segment,
            points: segment.points.map((currentPoint, pointIndex) =>
              pointIndex === ref.pointIndex
                ? ([point[0], point[1]] as [number, number])
                : currentPoint,
            ),
          }
        : segment,
    ),
  };
}

function getSegmentAnchorPoint(segment: PathSegment | undefined): readonly [number, number] | null {
  if (!segment) {
    return null;
  }
  switch (segment.type) {
    case 'move':
    case 'line':
      return segment.points[0] ?? null;
    case 'quadratic':
      return segment.points[1] ?? null;
    case 'cubic':
      return segment.points[2] ?? null;
    default:
      return null;
  }
}

function getSegmentAnchorPointIndex(segment: PathSegment): number | null {
  switch (segment.type) {
    case 'move':
    case 'line':
      return 0;
    case 'quadratic':
      return 1;
    case 'cubic':
      return 2;
    default:
      return null;
  }
}

function toVectorPoint(point: readonly [number, number]): VectorPoint {
  return { x: point[0], y: point[1] };
}

function isOutgoingControl(segment: PathSegment, pointIndex: number): boolean {
  return (
    (segment.type === 'cubic' && pointIndex === 0) ||
    (segment.type === 'quadratic' && pointIndex === 0)
  );
}
