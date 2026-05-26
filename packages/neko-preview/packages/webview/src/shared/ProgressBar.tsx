import { useCallback, useState } from 'react';
import { formatTime } from '@neko/neko-client';
import { Progress } from '@neko/ui/primitives';

export interface ProgressBarProps {
  currentTime: number;
  duration: number;
  onSeekCommit: (time: number) => void;
  onSeeking?: (time: number) => void;
  variant?: 'default' | 'video';
  formatTooltip?: (time: number) => string;
}

export function ProgressBar({
  currentTime,
  duration,
  formatTooltip = formatTime,
  onSeekCommit,
  onSeeking,
  variant = 'default',
}: ProgressBarProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [seekingTime, setSeekingTime] = useState(0);
  const displayTime = isDragging ? seekingTime : currentTime;
  const progressClass =
    variant === 'video' ? 'bg-white/25 [&>div]:bg-white' : 'bg-[var(--neko-surface)]';

  const readTime = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): number => {
      if (duration <= 0) return 0;
      const rect = event.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const time = readTime(event);
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsDragging(true);
      setSeekingTime(time);
      onSeeking?.(time);
    },
    [onSeeking, readTime],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      const time = readTime(event);
      setSeekingTime(time);
      onSeeking?.(time);
    },
    [isDragging, onSeeking, readTime],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const time = readTime(event);
      setIsDragging(false);
      onSeekCommit(time);
    },
    [onSeekCommit, readTime],
  );

  return (
    <div
      aria-label={formatTooltip(displayTime)}
      className="cursor-pointer"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <Progress
        className={`h-1 transition-all hover:h-1.5 ${progressClass}`}
        max={duration > 0 ? duration : 1}
        value={displayTime}
      />
    </div>
  );
}
