/**
 * Selection Manager
 *
 * Manages rectangular, lasso, and magic wand selections.
 * Stores selection as a bitmask.
 */
import type { SelectionMask } from '../types';
import { scanlineFill } from '../utils/scanline-fill';
import type { Point2D } from '../utils/scanline-fill';

export interface ISelectionManager {
  hasSelection(): boolean;
  getSelection(): SelectionMask | null;
  setSelection(mask: SelectionMask | null): void;
  selectRect(
    x: number,
    y: number,
    width: number,
    height: number,
    canvasW: number,
    canvasH: number,
  ): void;
  selectLasso(points: readonly Point2D[], canvasW: number, canvasH: number): void;
  selectWand(
    imageData: Uint8Array,
    startX: number,
    startY: number,
    tolerance: number,
    canvasW: number,
    canvasH: number,
    contiguous: boolean,
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

  setSelection(mask: SelectionMask | null): void {
    this.mask = mask;
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

  selectLasso(points: readonly Point2D[], canvasW: number, canvasH: number): void {
    if (points.length < 3) return;
    const data = scanlineFill(points, canvasW, canvasH);
    this.mask = { width: canvasW, height: canvasH, data };
  }

  selectWand(
    imageData: Uint8Array,
    startX: number,
    startY: number,
    tolerance: number,
    canvasW: number,
    canvasH: number,
    contiguous: boolean,
  ): void {
    const sx = Math.floor(startX);
    const sy = Math.floor(startY);
    if (sx < 0 || sx >= canvasW || sy < 0 || sy >= canvasH) return;

    const idx = (sy * canvasW + sx) * 4;
    const refR = imageData[idx] ?? 0;
    const refG = imageData[idx + 1] ?? 0;
    const refB = imageData[idx + 2] ?? 0;

    const data = new Uint8Array(canvasW * canvasH);
    const tolSq = tolerance * tolerance;

    const matchesColor = (i: number): boolean => {
      const dr = (imageData[i] ?? 0) - refR;
      const dg = (imageData[i + 1] ?? 0) - refG;
      const db = (imageData[i + 2] ?? 0) - refB;
      return dr * dr + dg * dg + db * db <= tolSq;
    };

    if (contiguous) {
      // BFS flood fill from start point
      const visited = new Uint8Array(canvasW * canvasH);
      const queue: number[] = [sy * canvasW + sx];
      visited[sy * canvasW + sx] = 1;

      while (queue.length > 0) {
        const pos = queue.pop()!;
        const px = pos % canvasW;
        const py = (pos - px) / canvasW;

        if (!matchesColor(pos * 4)) continue;
        data[pos] = 255;

        // 4-connected neighbors
        if (px > 0 && !visited[pos - 1]) {
          visited[pos - 1] = 1;
          queue.push(pos - 1);
        }
        if (px < canvasW - 1 && !visited[pos + 1]) {
          visited[pos + 1] = 1;
          queue.push(pos + 1);
        }
        if (py > 0 && !visited[pos - canvasW]) {
          visited[pos - canvasW] = 1;
          queue.push(pos - canvasW);
        }
        if (py < canvasH - 1 && !visited[pos + canvasW]) {
          visited[pos + canvasW] = 1;
          queue.push(pos + canvasW);
        }
      }
    } else {
      // Global: select all pixels matching the reference color
      for (let i = 0; i < canvasW * canvasH; i++) {
        if (matchesColor(i * 4)) {
          data[i] = 255;
        }
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
