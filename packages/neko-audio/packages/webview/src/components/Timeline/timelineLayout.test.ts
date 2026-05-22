import { describe, expect, it } from 'vitest';
import { calculateTimelineLayout } from './timelineLayout';

describe('calculateTimelineLayout', () => {
  it('fits an empty timeline inside the visible lane width', () => {
    const layout = calculateTimelineLayout({
      trackCount: 0,
      contentDuration: 0,
      zoomLevel: 1,
      viewportWidth: 640,
      labelWidth: 140,
      pixelsPerSecond: 50,
    });

    expect(layout.laneViewportWidth).toBe(500);
    expect(layout.timelineWidth).toBe(500);
  });

  it('does not apply duration minimums to empty timelines', () => {
    const layout = calculateTimelineLayout({
      trackCount: 0,
      contentDuration: 0,
      zoomLevel: 1,
      viewportWidth: 320,
      labelWidth: 140,
      pixelsPerSecond: 50,
    });

    expect(layout.timelineWidth).toBe(180);
    expect(layout.rulerDuration).toBe(3.6);
  });

  it('expands populated timelines only when content exceeds the viewport', () => {
    const layout = calculateTimelineLayout({
      trackCount: 1,
      contentDuration: 20,
      zoomLevel: 1,
      viewportWidth: 640,
      labelWidth: 140,
      pixelsPerSecond: 50,
      trailingSeconds: 4,
    });

    expect(layout.timelineWidth).toBe(1200);
    expect(layout.rulerDuration).toBe(24);
  });
});
