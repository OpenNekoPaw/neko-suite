import { describe, it, expect } from 'vitest';
import {
  timeToPixels,
  pixelsToTime,
  calculateTimeMarkerInterval,
  generateTimeMarkers,
  calculateVisibleTimeRange,
  isElementVisible,
  calculateSelectionBoxIntersection,
  calculateSelectionBoxElementIntersection,
} from '../timelineCalculations';

// PIXELS_PER_SECOND = 50 (from constants)
const PPS = 50;

// ---------------------------------------------------------------------------
// timeToPixels
// ---------------------------------------------------------------------------
describe('timeToPixels', () => {
  it('converts 1 second at zoom 1 to PIXELS_PER_SECOND', () => {
    expect(timeToPixels(1, 1)).toBe(PPS);
  });

  it('scales linearly with time', () => {
    expect(timeToPixels(3, 1)).toBe(3 * PPS);
  });

  it('scales linearly with zoom', () => {
    expect(timeToPixels(1, 2)).toBe(2 * PPS);
  });

  it('returns 0 for time = 0', () => {
    expect(timeToPixels(0, 1)).toBe(0);
    expect(timeToPixels(0, 5)).toBe(0);
  });

  it('handles negative time', () => {
    expect(timeToPixels(-2, 1)).toBe(-2 * PPS);
  });

  it('handles very large values without overflow', () => {
    const largeTime = 1_000_000;
    expect(timeToPixels(largeTime, 1)).toBe(largeTime * PPS);
  });

  it('handles fractional zoom', () => {
    expect(timeToPixels(1, 0.5)).toBe(PPS * 0.5);
  });

  it('handles fractional time', () => {
    expect(timeToPixels(0.1, 1)).toBeCloseTo(PPS * 0.1);
  });
});

// ---------------------------------------------------------------------------
// pixelsToTime
// ---------------------------------------------------------------------------
describe('pixelsToTime', () => {
  it('converts PIXELS_PER_SECOND pixels at zoom 1 to 1 second', () => {
    expect(pixelsToTime(PPS, 1)).toBe(1);
  });

  it('returns 0 for 0 pixels', () => {
    expect(pixelsToTime(0, 1)).toBe(0);
    expect(pixelsToTime(0, 3)).toBe(0);
  });

  it('handles negative pixels', () => {
    expect(pixelsToTime(-PPS, 1)).toBe(-1);
  });

  it('handles fractional zoom', () => {
    expect(pixelsToTime(PPS, 0.5)).toBe(2);
  });

  it('handles very large pixel values', () => {
    const px = 1e9;
    expect(pixelsToTime(px, 1)).toBe(px / PPS);
  });
});

// ---------------------------------------------------------------------------
// Round-trip: timeToPixels <-> pixelsToTime
// ---------------------------------------------------------------------------
describe('timeToPixels / pixelsToTime round-trip', () => {
  const cases: Array<{ time: number; zoom: number }> = [
    { time: 0, zoom: 1 },
    { time: 5.5, zoom: 1 },
    { time: 120, zoom: 0.25 },
    { time: 0.001, zoom: 4 },
    { time: 999, zoom: 2.5 },
    { time: -3, zoom: 1 },
  ];

  cases.forEach(({ time, zoom }) => {
    it(`time=${time}, zoom=${zoom} survives round-trip`, () => {
      const px = timeToPixels(time, zoom);
      expect(pixelsToTime(px, zoom)).toBeCloseTo(time, 10);
    });
  });

  it('round-trip from pixels side', () => {
    const px = 1234;
    const zoom = 1.5;
    const time = pixelsToTime(px, zoom);
    expect(timeToPixels(time, zoom)).toBeCloseTo(px, 10);
  });
});

// ---------------------------------------------------------------------------
// Floating-point precision
// ---------------------------------------------------------------------------
describe('floating-point precision', () => {
  it('timeToPixels with 0.1 is close but may not be exact IEEE-754', () => {
    // 0.1 * 50 * 1 = 5.000000000000001 in some runtimes
    const result = timeToPixels(0.1, 1);
    expect(result).toBeCloseTo(5, 12);
  });

  it('pixelsToTime result with repeating decimal', () => {
    // 1 / (50 * 3) is a repeating decimal
    const result = pixelsToTime(1, 3);
    expect(result).toBeCloseTo(1 / 150, 12);
  });

  it('round-trip preserves precision within 1e-10', () => {
    const time = 1 / 3;
    const zoom = 1.7;
    const recovered = pixelsToTime(timeToPixels(time, zoom), zoom);
    expect(Math.abs(recovered - time)).toBeLessThan(1e-10);
  });
});

// ---------------------------------------------------------------------------
// calculateTimeMarkerInterval
// ---------------------------------------------------------------------------
describe('calculateTimeMarkerInterval', () => {
  it('returns 1 for zoom >= 4', () => {
    expect(calculateTimeMarkerInterval(4)).toBe(1);
    expect(calculateTimeMarkerInterval(10)).toBe(1);
    expect(calculateTimeMarkerInterval(100)).toBe(1);
  });

  it('returns 2 for 2 <= zoom < 4', () => {
    expect(calculateTimeMarkerInterval(2)).toBe(2);
    expect(calculateTimeMarkerInterval(3)).toBe(2);
    expect(calculateTimeMarkerInterval(3.99)).toBe(2);
  });

  it('returns 5 for 1 <= zoom < 2', () => {
    expect(calculateTimeMarkerInterval(1)).toBe(5);
    expect(calculateTimeMarkerInterval(1.5)).toBe(5);
    expect(calculateTimeMarkerInterval(1.99)).toBe(5);
  });

  it('returns 10 for 0.5 <= zoom < 1', () => {
    expect(calculateTimeMarkerInterval(0.5)).toBe(10);
    expect(calculateTimeMarkerInterval(0.75)).toBe(10);
    expect(calculateTimeMarkerInterval(0.99)).toBe(10);
  });

  it('returns 30 for 0.25 <= zoom < 0.5', () => {
    expect(calculateTimeMarkerInterval(0.25)).toBe(30);
    expect(calculateTimeMarkerInterval(0.3)).toBe(30);
    expect(calculateTimeMarkerInterval(0.49)).toBe(30);
  });

  it('returns 60 for zoom < 0.25', () => {
    expect(calculateTimeMarkerInterval(0.1)).toBe(60);
    expect(calculateTimeMarkerInterval(0.01)).toBe(60);
    expect(calculateTimeMarkerInterval(0.24)).toBe(60);
  });

  it('exact boundary values are included in their tier', () => {
    expect(calculateTimeMarkerInterval(4)).toBe(1);
    expect(calculateTimeMarkerInterval(2)).toBe(2);
    expect(calculateTimeMarkerInterval(1)).toBe(5);
    expect(calculateTimeMarkerInterval(0.5)).toBe(10);
    expect(calculateTimeMarkerInterval(0.25)).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// generateTimeMarkers
// ---------------------------------------------------------------------------
describe('generateTimeMarkers', () => {
  it('generates markers at the correct interval for zoom 1', () => {
    // zoom 1 => interval 5
    const markers = generateTimeMarkers(20, 1);
    expect(markers).toEqual([0, 5, 10, 15, 20]);
  });

  it('generates markers at 1s interval for high zoom', () => {
    const markers = generateTimeMarkers(5, 4);
    expect(markers).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('includes the duration when it aligns with interval', () => {
    const markers = generateTimeMarkers(10, 1); // interval=5
    expect(markers[markers.length - 1]).toBe(10);
  });

  it('stops before duration when it does not align', () => {
    const markers = generateTimeMarkers(7, 1); // interval=5
    expect(markers).toEqual([0, 5]);
  });

  it('returns only [0] for duration = 0', () => {
    expect(generateTimeMarkers(0, 1)).toEqual([0]);
  });

  it('always starts with 0', () => {
    const markers = generateTimeMarkers(100, 0.1); // interval=60
    expect(markers[0]).toBe(0);
  });

  it('generates correct 60s markers for very low zoom', () => {
    const markers = generateTimeMarkers(180, 0.1);
    expect(markers).toEqual([0, 60, 120, 180]);
  });

  it('handles large duration', () => {
    const markers = generateTimeMarkers(3600, 1); // interval=5
    expect(markers.length).toBe(721); // 0..3600 step 5
    expect(markers[0]).toBe(0);
    expect(markers[markers.length - 1]).toBe(3600);
  });
});

// ---------------------------------------------------------------------------
// calculateVisibleTimeRange
// ---------------------------------------------------------------------------
describe('calculateVisibleTimeRange', () => {
  const zoom = 1;

  it('returns correct range with no scroll', () => {
    const { startTime, endTime } = calculateVisibleTimeRange(0, 500, zoom);
    // buffer = 500 * 0.5 = 250
    // startTime = max(0, 0 - 250) / (50*1) = 0
    // endTime = (0 + 500 + 250) / (50*1) = 15
    expect(startTime).toBe(0);
    expect(endTime).toBe(15);
  });

  it('clamps startTime to >= 0', () => {
    const { startTime } = calculateVisibleTimeRange(0, 1000, zoom);
    expect(startTime).toBeGreaterThanOrEqual(0);
  });

  it('accounts for scroll offset', () => {
    // scrollLeft=1000, containerWidth=500, zoom=1, bufferRatio=0.5
    // buffer = 250
    // startTime = (1000-250)/(50) = 15
    // endTime   = (1000+500+250)/(50) = 35
    const { startTime, endTime } = calculateVisibleTimeRange(1000, 500, zoom);
    expect(startTime).toBe(15);
    expect(endTime).toBe(35);
  });

  it('respects custom bufferRatio', () => {
    const { startTime, endTime } = calculateVisibleTimeRange(500, 500, zoom, 0);
    // no buffer
    expect(startTime).toBe(500 / PPS);
    expect(endTime).toBe(1000 / PPS);
  });

  it('scales correctly with zoom', () => {
    const zoomLevel = 2;
    const { startTime, endTime } = calculateVisibleTimeRange(0, 500, zoomLevel, 0);
    // startTime = 0
    // endTime = 500 / (50*2) = 5
    expect(startTime).toBe(0);
    expect(endTime).toBe(5);
  });

  it('startTime is always <= endTime', () => {
    const { startTime, endTime } = calculateVisibleTimeRange(0, 100, 0.1, 2);
    expect(startTime).toBeLessThanOrEqual(endTime);
  });
});

// ---------------------------------------------------------------------------
// isElementVisible
// ---------------------------------------------------------------------------
describe('isElementVisible', () => {
  it('returns true when element is fully inside visible range', () => {
    expect(isElementVisible(2, 5, 0, 10)).toBe(true);
  });

  it('returns true when element overlaps start of visible range', () => {
    expect(isElementVisible(0, 3, 2, 10)).toBe(true);
  });

  it('returns true when element overlaps end of visible range', () => {
    expect(isElementVisible(8, 12, 2, 10)).toBe(true);
  });

  it('returns true when element spans entire visible range', () => {
    expect(isElementVisible(0, 100, 2, 10)).toBe(true);
  });

  it('returns false when element is entirely before visible range', () => {
    expect(isElementVisible(0, 1, 2, 10)).toBe(false);
  });

  it('returns false when element is entirely after visible range', () => {
    expect(isElementVisible(11, 15, 2, 10)).toBe(false);
  });

  it('returns true when element end exactly equals visible start (boundary)', () => {
    // elementEnd == visibleStart => elementEndTime >= visibleStartTime is true
    expect(isElementVisible(0, 2, 2, 10)).toBe(true);
  });

  it('returns true when element start exactly equals visible end (boundary)', () => {
    expect(isElementVisible(10, 15, 2, 10)).toBe(true);
  });

  it('handles zero-length element at visible boundary', () => {
    expect(isElementVisible(5, 5, 5, 10)).toBe(true);
    expect(isElementVisible(10, 10, 5, 10)).toBe(true);
  });

  it('returns false for zero-length element just outside range', () => {
    expect(isElementVisible(4, 4, 5, 10)).toBe(false);
    expect(isElementVisible(11, 11, 5, 10)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// calculateSelectionBoxIntersection (box vs track row)
// ---------------------------------------------------------------------------
describe('calculateSelectionBoxIntersection', () => {
  const trackHeight = 40;

  it('returns true when box overlaps the track vertically', () => {
    const box = { startX: 0, startY: 10, currentX: 100, currentY: 50 };
    // track 0: 0..40 — box Y: 10..50 overlaps
    expect(calculateSelectionBoxIntersection(box, 0, trackHeight)).toBe(true);
  });

  it('returns false when box is entirely above the track', () => {
    const box = { startX: 0, startY: 0, currentX: 100, currentY: 5 };
    // track 1: 40..80 — box Y: 0..5
    expect(calculateSelectionBoxIntersection(box, 1, trackHeight)).toBe(false);
  });

  it('returns false when box is entirely below the track', () => {
    const box = { startX: 0, startY: 100, currentX: 100, currentY: 120 };
    // track 0: 0..40
    expect(calculateSelectionBoxIntersection(box, 0, trackHeight)).toBe(false);
  });

  it('handles inverted selection (currentY < startY)', () => {
    const box = { startX: 100, startY: 50, currentX: 0, currentY: 10 };
    // min/max gives Y: 10..50, track 0: 0..40
    expect(calculateSelectionBoxIntersection(box, 0, trackHeight)).toBe(true);
  });

  it('boundary: box bottom exactly equals track top', () => {
    const box = { startX: 0, startY: 0, currentX: 100, currentY: 40 };
    // boxBottom=40, track 1: 40..80 => 40 >= 40 && 0 <= 80 => true
    expect(calculateSelectionBoxIntersection(box, 1, trackHeight)).toBe(true);
  });

  it('boundary: box top exactly equals track bottom', () => {
    const box = { startX: 0, startY: 80, currentX: 100, currentY: 100 };
    // boxTop=80, track 0: 0..40 => 100 >= 0 && 80 <= 40 => false
    expect(calculateSelectionBoxIntersection(box, 0, trackHeight)).toBe(false);
  });

  it('works for higher track indices', () => {
    const box = { startX: 0, startY: 82, currentX: 100, currentY: 118 };
    // track 2: 80..120, box Y: 82..118
    expect(calculateSelectionBoxIntersection(box, 2, trackHeight)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// calculateSelectionBoxElementIntersection (box vs element on timeline)
// ---------------------------------------------------------------------------
describe('calculateSelectionBoxElementIntersection', () => {
  const zoom = 1;
  const trackLabelWidth = 100;

  it('returns true when box overlaps element horizontally', () => {
    // element at 2s..5s => pixels 100..250
    // box X adjusted: (200-100)..(400-100) = 100..300
    const box = { startX: 200, startY: 0, currentX: 400, currentY: 40 };
    expect(calculateSelectionBoxElementIntersection(box, 2, 5, zoom, trackLabelWidth)).toBe(true);
  });

  it('returns false when box is entirely to the left of element', () => {
    // element at 10s..15s => 500..750
    // box X adjusted: (0-100)..(50-100) = -100..-50
    const box = { startX: 0, startY: 0, currentX: 50, currentY: 40 };
    expect(calculateSelectionBoxElementIntersection(box, 10, 15, zoom, trackLabelWidth)).toBe(
      false,
    );
  });

  it('returns false when box is entirely to the right of element', () => {
    // element at 0s..1s => 0..50
    // box X adjusted: (200-100)..(300-100) = 100..200
    const box = { startX: 200, startY: 0, currentX: 300, currentY: 40 };
    expect(calculateSelectionBoxElementIntersection(box, 0, 1, zoom, trackLabelWidth)).toBe(false);
  });

  it('handles inverted selection (currentX < startX)', () => {
    // element at 2s..5s => 100..250
    // box X adjusted: min(400,200)-100 .. max(400,200)-100 = 100..300
    const box = { startX: 400, startY: 0, currentX: 200, currentY: 40 };
    expect(calculateSelectionBoxElementIntersection(box, 2, 5, zoom, trackLabelWidth)).toBe(true);
  });

  it('boundary: box right edge equals element left edge', () => {
    // element at 2s => 100px left
    // box adjusted right = elementLeft => boxRight >= elementLeft => true
    const box = { startX: 100, startY: 0, currentX: 200, currentY: 40 };
    // adjusted: 0..100, element: 100..250
    expect(calculateSelectionBoxElementIntersection(box, 2, 5, zoom, trackLabelWidth)).toBe(true);
  });

  it('scales with zoom level', () => {
    const zoomLevel = 2;
    // element at 1s..2s => 100..200 at zoom 2
    // box adjusted: (250-100)..(350-100) = 150..250
    const box = { startX: 250, startY: 0, currentX: 350, currentY: 40 };
    expect(calculateSelectionBoxElementIntersection(box, 1, 2, zoomLevel, trackLabelWidth)).toBe(
      true,
    );
  });

  it('handles zero-width element', () => {
    // element at 5s..5s => 250..250
    // box adjusted: (300-100)..(400-100) = 200..300
    const box = { startX: 300, startY: 0, currentX: 400, currentY: 40 };
    expect(calculateSelectionBoxElementIntersection(box, 5, 5, zoom, trackLabelWidth)).toBe(true);
  });

  it('handles trackLabelWidth = 0', () => {
    // element at 1s..3s => 50..150
    // box: 60..140
    const box = { startX: 60, startY: 0, currentX: 140, currentY: 40 };
    expect(calculateSelectionBoxElementIntersection(box, 1, 3, zoom, 0)).toBe(true);
  });
});
