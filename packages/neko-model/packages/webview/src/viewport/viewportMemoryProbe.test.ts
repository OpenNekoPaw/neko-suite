import { afterEach, describe, expect, it } from 'vitest';
import { sampleViewportMemory } from './viewportMemoryProbe';

type MutablePerformance = Performance & {
  memory?: {
    usedJSHeapSize?: number;
    totalJSHeapSize?: number;
    jsHeapSizeLimit?: number;
  };
};

const originalMemory = (performance as MutablePerformance).memory;

afterEach(() => {
  Object.defineProperty(performance, 'memory', {
    configurable: true,
    value: originalMemory,
  });
});

describe('sampleViewportMemory', () => {
  it('reports JS heap when the browser exposes performance.memory', () => {
    Object.defineProperty(performance, 'memory', {
      configurable: true,
      value: {
        usedJSHeapSize: 32,
        totalJSHeapSize: 64,
        jsHeapSizeLimit: 128,
      },
    });

    expect(
      sampleViewportMemory({
        decodedFrameWidth: 10,
        decodedFrameHeight: 20,
        canvasCssWidth: 15,
        canvasCssHeight: 40,
        devicePixelRatio: 2,
      }),
    ).toEqual({
      jsHeapUsedBytes: 32,
      jsHeapTotalBytes: 64,
      jsHeapLimitBytes: 128,
      estimatedDecodedFrameBytes: 800,
      decodedFrameWidth: 10,
      decodedFrameHeight: 20,
      canvasCssWidth: 15,
      canvasCssHeight: 40,
      canvasPhysicalWidth: 30,
      canvasPhysicalHeight: 80,
      devicePixelRatio: 2,
      presentationScaleX: 3,
      presentationScaleY: 4,
    });
  });

  it('does not invent heap values when the browser does not expose memory', () => {
    Object.defineProperty(performance, 'memory', {
      configurable: true,
      value: undefined,
    });

    expect(sampleViewportMemory({ decodedFrameWidth: 10, decodedFrameHeight: 20 })).toEqual({
      jsHeapUsedBytes: undefined,
      jsHeapTotalBytes: undefined,
      jsHeapLimitBytes: undefined,
      estimatedDecodedFrameBytes: 800,
      decodedFrameWidth: 10,
      decodedFrameHeight: 20,
      canvasCssWidth: undefined,
      canvasCssHeight: undefined,
      canvasPhysicalWidth: undefined,
      canvasPhysicalHeight: undefined,
      devicePixelRatio: 1,
      presentationScaleX: undefined,
      presentationScaleY: undefined,
    });
  });
});
