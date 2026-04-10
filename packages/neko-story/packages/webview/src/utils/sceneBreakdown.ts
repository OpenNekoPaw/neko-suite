/**
 * formatDurationShort — "1m 30s" or "45s"
 */
export function formatDurationShort(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m${s > 0 ? ` ${s}s` : ''}` : `${s}s`;
}
