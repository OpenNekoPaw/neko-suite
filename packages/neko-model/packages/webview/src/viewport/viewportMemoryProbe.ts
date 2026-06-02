import type { ViewportMemorySample } from '../scene/AuthoringPerformanceMetrics';

interface BrowserPerformanceMemory {
  readonly usedJSHeapSize?: number;
  readonly totalJSHeapSize?: number;
  readonly jsHeapSizeLimit?: number;
}

interface BrowserPerformanceWithMemory extends Performance {
  readonly memory?: BrowserPerformanceMemory;
}

export interface ViewportPresentationProbeInput {
  readonly decodedFrameWidth: number;
  readonly decodedFrameHeight: number;
  readonly canvasCssWidth?: number;
  readonly canvasCssHeight?: number;
  readonly devicePixelRatio?: number;
}

export function sampleViewportMemory(input: ViewportPresentationProbeInput): ViewportMemorySample {
  const memory = (performance as BrowserPerformanceWithMemory).memory;
  const decodedFrameWidth = finitePositive(input.decodedFrameWidth);
  const decodedFrameHeight = finitePositive(input.decodedFrameHeight);
  const canvasCssWidth = finitePositive(input.canvasCssWidth);
  const canvasCssHeight = finitePositive(input.canvasCssHeight);
  const devicePixelRatio = finitePositive(input.devicePixelRatio) ?? 1;
  const canvasPhysicalWidth =
    canvasCssWidth !== undefined ? canvasCssWidth * devicePixelRatio : undefined;
  const canvasPhysicalHeight =
    canvasCssHeight !== undefined ? canvasCssHeight * devicePixelRatio : undefined;
  return {
    jsHeapUsedBytes: finiteNonNegative(memory?.usedJSHeapSize),
    jsHeapTotalBytes: finiteNonNegative(memory?.totalJSHeapSize),
    jsHeapLimitBytes: finiteNonNegative(memory?.jsHeapSizeLimit),
    estimatedDecodedFrameBytes:
      decodedFrameWidth !== undefined && decodedFrameHeight !== undefined
        ? estimateRgbaFrameBytes(decodedFrameWidth, decodedFrameHeight)
        : undefined,
    decodedFrameWidth,
    decodedFrameHeight,
    canvasCssWidth,
    canvasCssHeight,
    canvasPhysicalWidth,
    canvasPhysicalHeight,
    devicePixelRatio,
    presentationScaleX:
      decodedFrameWidth !== undefined && canvasPhysicalWidth !== undefined
        ? canvasPhysicalWidth / decodedFrameWidth
        : undefined,
    presentationScaleY:
      decodedFrameHeight !== undefined && canvasPhysicalHeight !== undefined
        ? canvasPhysicalHeight / decodedFrameHeight
        : undefined,
  };
}

function estimateRgbaFrameBytes(width: number, height: number): number {
  return Math.round(width * height * 4);
}

function finitePositive(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function finiteNonNegative(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}
