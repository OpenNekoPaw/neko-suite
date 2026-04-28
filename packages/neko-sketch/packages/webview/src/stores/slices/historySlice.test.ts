import { beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import type { LayerData, RegionSnapshot, SelectionMask } from '../../types';
import { createHistorySlice, type HistoryRootState, type HistorySlice } from './historySlice';

type TestStore = HistoryRootState & HistorySlice;

describe('history slice state replay', () => {
  let useStore: ReturnType<typeof createTestStore>;
  let markDirty: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    markDirty = vi.fn();
    useStore = createTestStore(markDirty);
    useStore.getState().clearHistory();
  });

  it('restores layer tree snapshots on undo and redo', () => {
    const beforeLayer = createLayer('layer-before');
    const afterLayer = createLayer('layer-after');
    useStore.setState({ layers: [beforeLayer], activeLayerId: beforeLayer.id });

    useStore.getState().pushHistory({
      type: 'layer-add',
      label: 'Add AI layer',
      snapshot: null,
      stateSnapshot: {
        before: { layers: [beforeLayer], activeLayerId: beforeLayer.id },
        after: { layers: [beforeLayer, afterLayer], activeLayerId: afterLayer.id },
      },
    });
    useStore.setState({ layers: [beforeLayer, afterLayer], activeLayerId: afterLayer.id });

    const undone = useStore.getState().undo();
    expect(undone?.label).toBe('Add AI layer');
    expect(useStore.getState().layers.map((layer) => layer.id)).toEqual([beforeLayer.id]);
    expect(useStore.getState().activeLayerId).toBe(beforeLayer.id);

    const redone = useStore.getState().redo();
    expect(redone?.label).toBe('Add AI layer');
    expect(useStore.getState().layers.map((layer) => layer.id)).toEqual([
      beforeLayer.id,
      afterLayer.id,
    ]);
    expect(useStore.getState().activeLayerId).toBe(afterLayer.id);
    expect(markDirty).toHaveBeenCalledTimes(2);
  });

  it('restores selection snapshots on undo and redo', () => {
    const before: SelectionMask = { width: 1, height: 1, data: new Uint8Array([0]) };
    const after: SelectionMask = { width: 1, height: 1, data: new Uint8Array([255]) };
    useStore.setState({ selection: before });

    useStore.getState().pushHistory({
      type: 'selection',
      label: 'AI selection',
      snapshot: null,
      stateSnapshot: {
        before: { selection: before },
        after: { selection: after },
      },
    });
    useStore.setState({ selection: after });

    useStore.getState().undo();
    expect(Array.from(useStore.getState().selection?.data ?? [])).toEqual([0]);

    useStore.getState().redo();
    expect(Array.from(useStore.getState().selection?.data ?? [])).toEqual([255]);
  });

  it('restores region snapshots through the registered applier on undo and redo', () => {
    const before = createRegionSnapshot('layer-1', new Uint8Array([1, 2, 3, 4]));
    const after = createRegionSnapshot('layer-1', new Uint8Array([5, 6, 7, 8]));
    const applied: number[][] = [];

    useStore.getState().setHistoryRegionApplier((snapshot) => {
      applied.push(Array.from(snapshot.data));
      return true;
    });
    useStore.getState().pushHistory({
      type: 'stroke',
      label: 'Paint stroke',
      snapshot: { before, after },
    });

    useStore.getState().undo();
    useStore.getState().redo();

    expect(applied).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
    ]);
    expect(markDirty).toHaveBeenCalledTimes(2);
  });
});

function createTestStore(markDirty: () => void) {
  return create<TestStore>()((...args) => ({
    layers: [],
    activeLayerId: null,
    selection: null,
    markDirty,
    ...createHistorySlice(...args),
  }));
}

function createLayer(id: string): LayerData {
  return {
    id,
    name: id,
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 1,
    height: 1,
    offsetX: 0,
    offsetY: 0,
    clippingMask: false,
    maskLayerId: null,
    children: [],
    texture: null,
    alphaLock: false,
  };
}

function createRegionSnapshot(layerId: string, data: Uint8Array): RegionSnapshot {
  return {
    layerId,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    data,
  };
}
