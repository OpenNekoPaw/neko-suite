/**
 * History Manager
 *
 * Manages undo/redo stack using region-based snapshots.
 * Captures only the affected region of a layer before modification.
 */
import type { HistoryEntry, RegionSnapshot } from '../types';

export interface IHistoryManager {
  push(entry: Omit<HistoryEntry, 'id' | 'timestamp'>): void;
  undo(): HistoryEntry | null;
  redo(): HistoryEntry | null;
  canUndo(): boolean;
  canRedo(): boolean;
  clear(): void;
  getUndoStack(): ReadonlyArray<HistoryEntry>;
  getRedoStack(): ReadonlyArray<HistoryEntry>;
}

const MAX_HISTORY = 100;

export class HistoryManager implements IHistoryManager {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private nextId = 1;

  push(entry: Omit<HistoryEntry, 'id' | 'timestamp'>): void {
    const fullEntry: HistoryEntry = {
      ...entry,
      id: `history-${this.nextId++}`,
      timestamp: Date.now(),
    };

    this.undoStack.push(fullEntry);
    this.redoStack = []; // Clear redo on new action

    // Trim history to max size
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift();
    }
  }

  undo(): HistoryEntry | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    this.redoStack.push(entry);
    return entry;
  }

  redo(): HistoryEntry | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    this.undoStack.push(entry);
    return entry;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  getUndoStack(): ReadonlyArray<HistoryEntry> {
    return this.undoStack;
  }

  getRedoStack(): ReadonlyArray<HistoryEntry> {
    return this.redoStack;
  }
}

/** Capture a region snapshot from texture pixels */
export function captureRegionSnapshot(
  layerId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  readPixels: (x: number, y: number, w: number, h: number) => Uint8Array,
): RegionSnapshot {
  return {
    layerId,
    x,
    y,
    width,
    height,
    data: readPixels(x, y, width, height),
  };
}
