/**
 * Audio formatting utility functions.
 * Extracted from AudioDiffViewer.tsx.
 */

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(2);
  return `${mins}:${parseFloat(secs) < 10 ? '0' : ''}${secs}`;
}

export function formatBitrate(bps: number): string {
  if (bps >= 1000) return `${(bps / 1000).toFixed(0)} kbps`;
  return `${bps} bps`;
}
