import { describe, expect, it } from 'vitest';
import { cubicTo, lineTo, moveTo, createPath } from './vector-tool';
import {
  createVectorLayerData,
  deleteVectorSelection,
  duplicateSelectedVectorPath,
  getVectorAnchorHandleMode,
  getVectorLayerRenderSignature,
  hitTestVectorPathNode,
  listVectorPathHandleEdges,
  listVectorPathNodes,
  moveVectorLayerNodes,
  moveVectorPathNode,
  replaceVectorLayerPath,
  reverseSelectedVectorPath,
  selectVectorNodesInRect,
  setVectorHandleModeForSelection,
  setSelectedVectorPathClosed,
  toggleVectorNodeSelection,
  toggleSelectedVectorPathClosed,
} from './vector-editing';

describe('vector-editing', () => {
  it('lists anchors and bezier controls with stable segment references', () => {
    let path = createPath();
    path = moveTo(path, 0, 0);
    path = cubicTo(path, 10, 0, 20, 30, 40, 50);

    const nodes = listVectorPathNodes(path);

    expect(nodes.map((node) => node.ref.role)).toEqual([
      'anchor',
      'control-out',
      'control-in',
      'anchor',
    ]);
    expect(nodes[3]?.ref).toMatchObject({
      pathId: path.id,
      segmentIndex: 1,
      pointIndex: 2,
      role: 'anchor',
    });
  });

  it('lists bezier handle edges between anchors and controls', () => {
    let path = createPath();
    path = moveTo(path, 0, 0);
    path = cubicTo(path, 10, 0, 20, 30, 40, 50);

    const edges = listVectorPathHandleEdges(path);

    expect(edges).toEqual([
      {
        pathId: path.id,
        from: { x: 0, y: 0 },
        to: { x: 10, y: 0 },
        role: 'outgoing',
      },
      {
        pathId: path.id,
        from: { x: 20, y: 30 },
        to: { x: 40, y: 50 },
        role: 'incoming',
      },
    ]);
  });

  it('hit-tests the nearest vector node within radius', () => {
    let path = createPath();
    path = moveTo(path, 0, 0);
    path = lineTo(path, 20, 0);

    const hit = hitTestVectorPathNode(path, { x: 18, y: 1 }, 4);

    expect(hit?.x).toBe(20);
    expect(hit?.ref.segmentIndex).toBe(1);
  });

  it('moves an anchor and keeps adjacent bezier handles attached by default', () => {
    let path = createPath();
    path = moveTo(path, 0, 0);
    path = cubicTo(path, 10, 0, 20, 30, 40, 50);
    path = cubicTo(path, 50, 60, 70, 80, 90, 100);
    const anchor = listVectorPathNodes(path).find(
      (node) => node.ref.segmentIndex === 1 && node.ref.role === 'anchor',
    );
    if (!anchor) throw new Error('anchor should exist');

    const moved = moveVectorPathNode(path, anchor.ref, { x: 45, y: 60 });

    expect(moved.segments[1]?.points).toEqual([
      [10, 0],
      [25, 40],
      [45, 60],
    ]);
    expect(moved.segments[2]?.points[0]).toEqual([55, 70]);
  });

  it('toggles vector node selection without duplicating refs', () => {
    const path = lineTo(moveTo(createPath(), 0, 0), 20, 0);
    const ref = listVectorPathNodes(path)[1]!.ref;

    const selected = toggleVectorNodeSelection([], ref);
    const toggledOff = toggleVectorNodeSelection(selected, ref);

    expect(selected).toEqual([ref]);
    expect(toggledOff).toEqual([]);
  });

  it('moves multiple selected vector nodes as a batch', () => {
    let path = createPath();
    path = moveTo(path, 0, 0);
    path = cubicTo(path, 10, 0, 20, 30, 40, 50);
    path = lineTo(path, 90, 100);
    const nodes = listVectorPathNodes(path);
    const firstAnchor = nodes.find(
      (node) => node.ref.segmentIndex === 1 && node.ref.role === 'anchor',
    );
    const secondAnchor = nodes.find(
      (node) => node.ref.segmentIndex === 2 && node.ref.role === 'anchor',
    );
    if (!firstAnchor || !secondAnchor) throw new Error('anchors should exist');
    const layer = createVectorLayerData([path]);

    const moved = moveVectorLayerNodes(layer, [firstAnchor.ref, secondAnchor.ref], {
      dx: 5,
      dy: 10,
    });

    expect(moved.paths[0]?.segments[1]?.points).toEqual([
      [10, 0],
      [25, 40],
      [45, 60],
    ]);
    expect(moved.paths[0]?.segments[2]?.points[0]).toEqual([95, 110]);
  });

  it('sets handle mode for selected bezier anchors', () => {
    let path = createPath();
    path = moveTo(path, 0, 0);
    path = cubicTo(path, 10, 0, 20, 30, 40, 50);
    const anchor = listVectorPathNodes(path).find(
      (node) => node.ref.role === 'anchor' && node.ref.segmentIndex === 1,
    );
    if (!anchor) throw new Error('anchor should exist');
    const layer = { ...createVectorLayerData([path]), selectedNodeRefs: [anchor.ref] };

    const result = setVectorHandleModeForSelection(layer, 'mirrored');

    expect(result.changed).toBe(true);
    expect(result.anchors).toEqual([anchor.ref]);
    expect(getVectorAnchorHandleMode(result.layerData, anchor.ref)).toBe('mirrored');
  });

  it('mirrors the opposite bezier handle for mirrored anchors', () => {
    let path = createPath();
    path = moveTo(path, 0, 0);
    path = cubicTo(path, 10, 0, 20, 30, 40, 50);
    path = cubicTo(path, 50, 60, 70, 80, 90, 100);
    const nodes = listVectorPathNodes(path);
    const anchor = nodes.find((node) => node.ref.role === 'anchor' && node.ref.segmentIndex === 1);
    const outgoing = nodes.find(
      (node) => node.ref.role === 'control-out' && node.ref.segmentIndex === 2,
    );
    if (!anchor || !outgoing) throw new Error('anchor and outgoing control should exist');
    const withMode = setVectorHandleModeForSelection(
      { ...createVectorLayerData([path]), selectedNodeRefs: [anchor.ref] },
      'mirrored',
    ).layerData;

    const moved = moveVectorLayerNodes(withMode, [outgoing.ref], { dx: 10, dy: -10 });

    expect(moved.paths[0]?.segments[2]?.points[0]).toEqual([60, 50]);
    expect(moved.paths[0]?.segments[1]?.points[1]).toEqual([20, 50]);
  });

  it('keeps opposite bezier handle length for smooth anchors', () => {
    let path = createPath();
    path = moveTo(path, 0, 0);
    path = cubicTo(path, 10, 0, 20, 30, 40, 50);
    path = cubicTo(path, 50, 60, 70, 80, 90, 100);
    const nodes = listVectorPathNodes(path);
    const anchor = nodes.find((node) => node.ref.role === 'anchor' && node.ref.segmentIndex === 1);
    const outgoing = nodes.find(
      (node) => node.ref.role === 'control-out' && node.ref.segmentIndex === 2,
    );
    if (!anchor || !outgoing) throw new Error('anchor and outgoing control should exist');
    const withMode = setVectorHandleModeForSelection(
      { ...createVectorLayerData([path]), selectedNodeRefs: [anchor.ref] },
      'smooth',
    ).layerData;

    const moved = moveVectorLayerNodes(withMode, [outgoing.ref], { dx: 10, dy: -10 });
    const incoming = moved.paths[0]?.segments[1]?.points[1];
    if (!incoming) throw new Error('incoming control should exist');

    expect(incoming[1]).toBeCloseTo(50, 6);
    expect(Math.hypot(incoming[0] - 40, incoming[1] - 50)).toBeCloseTo(Math.hypot(20, 20), 6);
  });

  it('leaves opposite bezier handle untouched for corner anchors', () => {
    let path = createPath();
    path = moveTo(path, 0, 0);
    path = cubicTo(path, 10, 0, 20, 30, 40, 50);
    path = cubicTo(path, 50, 60, 70, 80, 90, 100);
    const outgoing = listVectorPathNodes(path).find(
      (node) => node.ref.role === 'control-out' && node.ref.segmentIndex === 2,
    );
    if (!outgoing) throw new Error('outgoing control should exist');

    const moved = moveVectorLayerNodes(createVectorLayerData([path]), [outgoing.ref], {
      dx: 10,
      dy: -10,
    });

    expect(moved.paths[0]?.segments[1]?.points[1]).toEqual([20, 30]);
  });

  it('replaces paths in vector layer data without touching other paths', () => {
    const first = moveTo(createPath(), 0, 0);
    const second = moveTo(createPath(), 10, 10);
    const layer = createVectorLayerData([first, second]);
    const moved = moveVectorPathNode(first, listVectorPathNodes(first)[0]!.ref, { x: 5, y: 5 });

    const updated = replaceVectorLayerPath(layer, moved);

    expect(updated.paths[0]).toBe(moved);
    expect(updated.paths[1]).toBe(second);
    expect(updated.selectedPathId).toBe(first.id);
  });

  it('builds render signatures from paths only', () => {
    const path = lineTo(moveTo(createPath(), 0, 0), 10, 10);
    const layer = createVectorLayerData([path]);

    const selected = {
      ...layer,
      selectedNodeRefs: [listVectorPathNodes(path)[0]!.ref],
    };
    const moved = replaceVectorLayerPath(
      layer,
      moveVectorPathNode(path, listVectorPathNodes(path)[0]!.ref, { x: 4, y: 4 }),
    );

    expect(getVectorLayerRenderSignature(selected)).toBe(getVectorLayerRenderSignature(layer));
    expect(getVectorLayerRenderSignature(moved)).not.toBe(getVectorLayerRenderSignature(layer));
  });

  it('opens and closes the selected vector path without adding segments', () => {
    const path = lineTo(moveTo(createPath(), 0, 0), 10, 0);
    const layer = createVectorLayerData([path]);

    const closed = setSelectedVectorPathClosed(layer, true);
    const opened = setSelectedVectorPathClosed(closed.layerData, false);
    const toggled = toggleSelectedVectorPathClosed(opened.layerData);

    expect(closed.changed).toBe(true);
    expect(closed.layerData.paths[0]?.closed).toBe(true);
    expect(closed.layerData.paths[0]?.segments).toHaveLength(path.segments.length);
    expect(opened.layerData.paths[0]?.closed).toBe(false);
    expect(toggled.layerData.paths[0]?.closed).toBe(true);
  });

  it('reverses selected line paths and keeps selected anchors mapped', () => {
    let path = createPath();
    path = moveTo(path, 0, 0);
    path = lineTo(path, 10, 0);
    path = lineTo(path, 20, 5);
    const middleAnchor = listVectorPathNodes(path).find(
      (node) => node.ref.segmentIndex === 1 && node.ref.role === 'anchor',
    );
    if (!middleAnchor) throw new Error('middle anchor should exist');

    const result = reverseSelectedVectorPath({
      ...createVectorLayerData([path]),
      selectedNodeRefs: [middleAnchor.ref],
    });

    expect(result.changed).toBe(true);
    expect(result.layerData.paths[0]?.segments).toEqual([
      { type: 'move', points: [[20, 5]] },
      { type: 'line', points: [[10, 0]] },
      { type: 'line', points: [[0, 0]] },
    ]);
    expect(result.layerData.selectedNodeRefs).toEqual([
      { pathId: path.id, segmentIndex: 1, pointIndex: 0, role: 'anchor' },
    ]);
  });

  it('reverses cubic paths by swapping incoming and outgoing controls', () => {
    let path = createPath();
    path = moveTo(path, 0, 0);
    path = cubicTo(path, 10, 0, 20, 30, 40, 50);
    const controlOut = listVectorPathNodes(path).find((node) => node.ref.role === 'control-out');
    if (!controlOut) throw new Error('control-out should exist');

    const result = reverseSelectedVectorPath({
      ...createVectorLayerData([path]),
      selectedNodeRefs: [controlOut.ref],
    });

    expect(result.layerData.paths[0]?.segments).toEqual([
      { type: 'move', points: [[40, 50]] },
      {
        type: 'cubic',
        points: [
          [20, 30],
          [10, 0],
          [0, 0],
        ],
      },
    ]);
    expect(result.layerData.selectedNodeRefs).toEqual([
      { pathId: path.id, segmentIndex: 1, pointIndex: 1, role: 'control-in' },
    ]);
  });

  it('duplicates the selected path with offset, selected anchors, and copied handle modes', () => {
    let path = createPath();
    path = moveTo(path, 0, 0);
    path = cubicTo(path, 10, 0, 20, 30, 40, 50);
    const anchor = listVectorPathNodes(path).find(
      (node) => node.ref.segmentIndex === 1 && node.ref.role === 'anchor',
    );
    if (!anchor) throw new Error('anchor should exist');
    const layer = {
      ...createVectorLayerData([path]),
      handleModes: [{ anchor: anchor.ref, mode: 'mirrored' as const }],
    };

    const result = duplicateSelectedVectorPath(layer, {
      id: 'copied-path',
      offset: { dx: 5, dy: 6 },
    });

    expect(result.changed).toBe(true);
    expect(result.pathId).toBe('copied-path');
    expect(result.layerData.paths).toHaveLength(2);
    expect(result.layerData.paths[1]?.segments).toEqual([
      { type: 'move', points: [[5, 6]] },
      {
        type: 'cubic',
        points: [
          [15, 6],
          [25, 36],
          [45, 56],
        ],
      },
    ]);
    expect(result.layerData.selectedPathId).toBe('copied-path');
    expect(result.layerData.selectedNodeRefs).toEqual([
      { pathId: 'copied-path', segmentIndex: 0, pointIndex: 0, role: 'anchor' },
      { pathId: 'copied-path', segmentIndex: 1, pointIndex: 2, role: 'anchor' },
    ]);
    expect(result.layerData.handleModes).toContainEqual({
      anchor: { ...anchor.ref, pathId: 'copied-path' },
      mode: 'mirrored',
    });
  });

  it('box-selects vector nodes and supports additive selection', () => {
    let path = createPath();
    path = moveTo(path, 0, 0);
    path = lineTo(path, 20, 0);
    path = lineTo(path, 40, 0);
    const layer = createVectorLayerData([path]);

    const selected = selectVectorNodesInRect(layer, { x: -1, y: -1, width: 22, height: 2 });
    const additive = selectVectorNodesInRect(
      selected.layerData,
      { x: 39, y: -1, width: 2, height: 2 },
      { additive: true },
    );

    expect(selected.changed).toBe(true);
    expect(selected.layerData.selectedNodeRefs).toEqual([
      { pathId: path.id, segmentIndex: 0, pointIndex: 0, role: 'anchor' },
      { pathId: path.id, segmentIndex: 1, pointIndex: 0, role: 'anchor' },
    ]);
    expect(additive.layerData.selectedNodeRefs).toEqual([
      { pathId: path.id, segmentIndex: 0, pointIndex: 0, role: 'anchor' },
      { pathId: path.id, segmentIndex: 1, pointIndex: 0, role: 'anchor' },
      { pathId: path.id, segmentIndex: 2, pointIndex: 0, role: 'anchor' },
    ]);
  });

  it('deletes the selected vector path when no nodes are selected', () => {
    const first = moveTo(createPath(), 0, 0);
    const second = moveTo(createPath(), 10, 10);
    const result = deleteVectorSelection({
      ...createVectorLayerData([first, second]),
      selectedPathId: second.id,
      selectedNodeRefs: [],
    });

    expect(result.deleted).toBe(true);
    expect(result.layerData.paths).toEqual([first]);
    expect(result.layerData.selectedPathId).toBe(first.id);
  });

  it('deletes selected anchors while preserving a valid path', () => {
    let path = createPath();
    path = moveTo(path, 0, 0);
    path = lineTo(path, 10, 0);
    path = lineTo(path, 20, 0);
    const middleAnchor = listVectorPathNodes(path).find(
      (node) => node.ref.segmentIndex === 1 && node.ref.role === 'anchor',
    );
    if (!middleAnchor) throw new Error('middle anchor should exist');

    const result = deleteVectorSelection({
      ...createVectorLayerData([path]),
      selectedNodeRefs: [middleAnchor.ref],
    });

    expect(result.deleted).toBe(true);
    expect(result.layerData.paths[0]?.segments).toEqual([
      { type: 'move', points: [[0, 0]] },
      { type: 'line', points: [[20, 0]] },
    ]);
    expect(result.layerData.selectedNodeRefs).toEqual([]);
  });

  it('collapses selected bezier controls instead of deleting the path', () => {
    let path = createPath();
    path = moveTo(path, 0, 0);
    path = cubicTo(path, 10, 0, 20, 30, 40, 50);
    const controlIn = listVectorPathNodes(path).find((node) => node.ref.role === 'control-in');
    if (!controlIn) throw new Error('control-in should exist');

    const result = deleteVectorSelection({
      ...createVectorLayerData([path]),
      selectedNodeRefs: [controlIn.ref],
    });

    expect(result.deleted).toBe(true);
    expect(result.layerData.paths[0]?.segments[1]?.points).toEqual([
      [10, 0],
      [40, 50],
      [40, 50],
    ]);
  });
});
