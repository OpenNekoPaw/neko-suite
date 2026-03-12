/**
 * Selection Manager
 *
 * Manages rectangular, lasso, and magic wand selections.
 * Stores selection as a bitmask.
 */
import type { SelectionMask } from '../types';

export interface ISelectionManager {
  hasSelection(): boolean;
  getSelection(): SelectionMask | null;
  selectRect(
    x: number,
    y: number,
    width: number,
    height: number,
    canvasW: number,
    canvasH: number,
  ): void;
  selectAll(canvasW: number, canvasH: number): void;
  clearSelection(): void;
  invertSelection(canvasW: number, canvasH: number): void;
}

export class SelectionManager implements ISelectionManager {
  private mask: SelectionMask | null = null;

  hasSelection(): boolean {
    return this.mask !== null;
  }

  getSelection(): SelectionMask | null {
    return this.mask;
  }

  selectRect(
    x: number,
    y: number,
    width: number,
    height: number,
    canvasW: number,
    canvasH: number,
  ): void {
    const data = new Uint8Array(canvasW * canvasH);
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(canvasW, Math.ceil(x + width));
    const y1 = Math.min(canvasH, Math.ceil(y + height));

    for (let row = y0; row < y1; row++) {
      for (let col = x0; col < x1; col++) {
        data[row * canvasW + col] = 255;
      }
    }

    this.mask = { width: canvasW, height: canvasH, data };
  }

  selectAll(canvasW: number, canvasH: number): void {
    const data = new Uint8Array(canvasW * canvasH).fill(255);
    this.mask = { width: canvasW, height: canvasH, data };
  }

  clearSelection(): void {
    this.mask = null;
  }

  invertSelection(canvasW: number, canvasH: number): void {
    if (!this.mask) {
      this.selectAll(canvasW, canvasH);
      return;
    }

    const data = new Uint8Array(this.mask.data.length);
    for (let i = 0; i < data.length; i++) {
      data[i] = 255 - (this.mask.data[i] ?? 0);
    }
    this.mask = { width: canvasW, height: canvasH, data };
  }
}
