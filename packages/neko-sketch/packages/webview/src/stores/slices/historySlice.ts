/**
 * History Slice - undo/redo state using HistoryManager
 */
import type { StateCreator } from 'zustand';
import type {
  HistoryEntry,
  HistoryStateSnapshot,
  LayerData,
  RegionSnapshot,
  SelectionMask,
} from '../../types';
import { HistoryManager } from '../../history';

export interface HistoryRootState {
  layers: LayerData[];
  activeLayerId: string | null;
  selection: SelectionMask | null;
  markDirty: () => void;
}

export interface HistorySlice {
  canUndo: boolean;
  canRedo: boolean;
  pushHistory: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void;
  undo: () => HistoryEntry | null;
  redo: () => HistoryEntry | null;
  clearHistory: () => void;
  setHistoryRegionApplier: (applier: ((snapshot: RegionSnapshot) => boolean) | null) => void;
}

export const createHistorySlice: StateCreator<
  HistoryRootState & HistorySlice,
  [],
  [],
  HistorySlice
> = (set, get) => {
  const historyManager = new HistoryManager();
  let regionApplier: ((snapshot: RegionSnapshot) => boolean) | null = null;
  const applyRegionSnapshot = (snapshot: RegionSnapshot | undefined): boolean => {
    if (!snapshot || !regionApplier) {
      return false;
    }
    return regionApplier(snapshot);
  };

  return {
    canUndo: false,
    canRedo: false,

    pushHistory: (entry) => {
      historyManager.push(entry);
      set({
        canUndo: historyManager.canUndo(),
        canRedo: historyManager.canRedo(),
      });
    },

    undo: () => {
      const entry = historyManager.undo();
      if (entry) {
        applyHistorySnapshot(set, entry.stateSnapshot?.before);
        const restoredRegion = applyRegionSnapshot(entry.snapshot?.before);
        if (entry.stateSnapshot || restoredRegion) {
          get().markDirty();
        }
      }
      set({
        canUndo: historyManager.canUndo(),
        canRedo: historyManager.canRedo(),
      });
      return entry;
    },

    redo: () => {
      const entry = historyManager.redo();
      if (entry) {
        applyHistorySnapshot(set, entry.stateSnapshot?.after);
        const restoredRegion = applyRegionSnapshot(entry.snapshot?.after);
        if (entry.stateSnapshot || restoredRegion) {
          get().markDirty();
        }
      }
      set({
        canUndo: historyManager.canUndo(),
        canRedo: historyManager.canRedo(),
      });
      return entry;
    },

    clearHistory: () => {
      historyManager.clear();
      set({ canUndo: false, canRedo: false });
    },

    setHistoryRegionApplier: (applier) => {
      regionApplier = applier;
    },
  };
};

function applyHistorySnapshot(
  set: Parameters<StateCreator<HistoryRootState & HistorySlice, [], [], HistorySlice>>[0],
  snapshot: HistoryStateSnapshot | undefined,
): void {
  if (!snapshot) {
    return;
  }

  const patch: Partial<HistoryRootState> = {};
  if (snapshot.layers !== undefined) {
    patch.layers = [...snapshot.layers];
  }
  if (snapshot.activeLayerId !== undefined) {
    patch.activeLayerId = snapshot.activeLayerId;
  }
  if (snapshot.selection !== undefined) {
    patch.selection = snapshot.selection
      ? {
          width: snapshot.selection.width,
          height: snapshot.selection.height,
          data: new Uint8Array(snapshot.selection.data),
        }
      : null;
  }

  if (Object.keys(patch).length > 0) {
    set(patch);
  }
}
