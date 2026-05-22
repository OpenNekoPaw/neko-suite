export interface TimelineLayoutInput {
  trackCount: number;
  contentDuration: number;
  zoomLevel: number;
  viewportWidth: number;
  labelWidth: number;
  pixelsPerSecond: number;
  trailingSeconds?: number;
  minEmptyDuration?: number;
}

export interface TimelineLayout {
  laneViewportWidth: number;
  rulerDuration: number;
  timelineWidth: number;
}

const DEFAULT_TRAILING_SECONDS = 4;
const DEFAULT_MIN_EMPTY_DURATION = 8;

export function calculateTimelineLayout({
  trackCount,
  contentDuration,
  zoomLevel,
  viewportWidth,
  labelWidth,
  pixelsPerSecond,
  trailingSeconds = DEFAULT_TRAILING_SECONDS,
  minEmptyDuration = DEFAULT_MIN_EMPTY_DURATION,
}: TimelineLayoutInput): TimelineLayout {
  const pps = Math.max(
    1,
    toNonNegativeFiniteNumber(pixelsPerSecond, 1) *
      Math.max(0.01, toNonNegativeFiniteNumber(zoomLevel, 1)),
  );
  const safeViewportWidth = toNonNegativeFiniteNumber(viewportWidth, 0);
  const safeLabelWidth = toNonNegativeFiniteNumber(labelWidth, 0);
  const laneViewportWidth = Math.max(0, safeViewportWidth - safeLabelWidth);
  const visibleDuration = laneViewportWidth > 0 ? laneViewportWidth / pps : 0;

  if (trackCount <= 0) {
    const rulerDuration = visibleDuration;
    return {
      laneViewportWidth,
      rulerDuration,
      timelineWidth: Math.ceil(laneViewportWidth),
    };
  }

  const paddedDuration =
    Math.max(0, toNonNegativeFiniteNumber(contentDuration, 0)) + Math.max(0, trailingSeconds);
  const rulerDuration = Math.max(visibleDuration, paddedDuration, minEmptyDuration);
  return {
    laneViewportWidth,
    rulerDuration,
    timelineWidth: Math.ceil(Math.max(laneViewportWidth, rulerDuration * pps)),
  };
}

function toNonNegativeFiniteNumber(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
