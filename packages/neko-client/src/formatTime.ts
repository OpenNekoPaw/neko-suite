/**
 * Time formatting utilities for media players
 */

/**
 * Format seconds to MM:SS or HH:MM:SS display string
 */
export function formatTime(seconds: number): string {
	if (!isFinite(seconds) || seconds < 0) return '0:00';

	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);

	if (h > 0) {
		return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
	}
	return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Format seconds to precise display with milliseconds (M:SS.mmm)
 */
export function formatTimePrecise(seconds: number): string {
	if (!isFinite(seconds) || seconds < 0) return '0:00.000';

	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	const ms = Math.floor((seconds % 1) * 1000);

	return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}
