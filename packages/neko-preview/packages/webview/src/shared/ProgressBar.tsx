/**
 * ProgressBar - Shared seek-safe progress bar component
 *
 * Separates drag preview from actual seek to avoid "seek storm"
 * on large files. Only commits seek on mouseup.
 *
 * Renders as a standalone row above the controls buttons.
 */

import { useState, useRef, useCallback } from 'react';
import { formatTime } from '@neko/neko-client';

interface ProgressBarProps {
	/** Current playback time in seconds */
	currentTime: number;
	/** Total duration in seconds */
	duration: number;
	/** Called on mouseup — commits the seek to backend */
	onSeekCommit: (time: number) => void;
	/** Called during drag — updates UI time only (no backend seek) */
	onSeeking?: (time: number) => void;
}

export function ProgressBar({
	currentTime,
	duration,
	onSeekCommit,
	onSeeking,
}: ProgressBarProps) {
	const trackRef = useRef<HTMLDivElement>(null);
	const [isDragging, setIsDragging] = useState(false);
	const [seekingTime, setSeekingTime] = useState(0);
	const [hoverTime, setHoverTime] = useState<number | null>(null);
	const [hoverX, setHoverX] = useState(0);

	// =========================================================================
	// Helpers
	// =========================================================================

	const getTimeFromClientX = useCallback(
		(clientX: number): number => {
			const track = trackRef.current;
			if (!track || duration <= 0) return 0;
			const rect = track.getBoundingClientRect();
			const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
			return ratio * duration;
		},
		[duration]
	);

	// =========================================================================
	// Mouse interactions
	// =========================================================================

	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			const time = getTimeFromClientX(e.clientX);
			setIsDragging(true);
			setSeekingTime(time);
			onSeeking?.(time);

			const handleMouseMove = (ev: MouseEvent) => {
				const t = getTimeFromClientX(ev.clientX);
				setSeekingTime(t);
				onSeeking?.(t);
			};

			const handleMouseUp = (ev: MouseEvent) => {
				const t = getTimeFromClientX(ev.clientX);
				setIsDragging(false);
				onSeekCommit(t);
				document.removeEventListener('mousemove', handleMouseMove);
				document.removeEventListener('mouseup', handleMouseUp);
			};

			document.addEventListener('mousemove', handleMouseMove);
			document.addEventListener('mouseup', handleMouseUp);
		},
		[getTimeFromClientX, onSeekCommit, onSeeking]
	);

	const handleMouseMove = useCallback(
		(e: React.MouseEvent) => {
			const track = trackRef.current;
			if (!track || duration <= 0) return;
			const rect = track.getBoundingClientRect();
			const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
			setHoverTime(ratio * duration);
			setHoverX(e.clientX - rect.left);
		},
		[duration]
	);

	const handleMouseLeave = useCallback(() => {
		setHoverTime(null);
	}, []);

	// =========================================================================
	// Computed values
	// =========================================================================

	const displayTime = isDragging ? seekingTime : currentTime;
	const progress = duration > 0 ? (displayTime / duration) * 100 : 0;

	return (
		<div className="controls__progress-wrapper">
			<div
				ref={trackRef}
				className="controls__progress-track"
				onMouseDown={handleMouseDown}
				onMouseMove={handleMouseMove}
				onMouseLeave={handleMouseLeave}
			>
				<div
					className="controls__progress-fill"
					style={{ width: `${progress}%` }}
				/>
				<div
					className="controls__progress-thumb"
					style={{ left: `${progress}%` }}
				/>
			</div>

			{/* Hover tooltip */}
			{hoverTime !== null && !isDragging && (
				<div
					className="controls__progress-tooltip"
					style={{ left: `${hoverX}px` }}
				>
					{formatTime(hoverTime)}
				</div>
			)}
		</div>
	);
}
