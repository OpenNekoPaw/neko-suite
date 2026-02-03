import { useCallback, useState, memo } from 'react';
import { useEditorStore } from '../../stores/editor-store';

interface PlayheadProps {
  currentTime: number;
  zoomLevel: number;
  pixelsPerSecond: number;
  height: number;
}

export const Playhead = memo(function Playhead({
  currentTime,
  zoomLevel,
  pixelsPerSecond,
  height,
}: PlayheadProps) {
  const { seek, getTotalDuration, pause } = useEditorStore();
  const [isDragging, setIsDragging] = useState(false);

  const left = currentTime * pixelsPerSecond * zoomLevel;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    pause(); // Pause playback when dragging
    setIsDragging(true);

    const startX = e.clientX;
    const startLeft = left;
    const totalDuration = getTotalDuration() || 60;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newLeft = startLeft + deltaX;
      const newTime = Math.max(0, Math.min(totalDuration, newLeft / (pixelsPerSecond * zoomLevel)));
      seek(newTime);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [left, seek, pixelsPerSecond, zoomLevel, getTotalDuration, pause]);

  return (
    <div
      className="absolute top-0 z-20 pointer-events-none"
      style={{ left, height }}
    >
      {/* Playhead line */}
      <div className={`w-0.5 h-full ${isDragging ? 'bg-red-400' : 'bg-red-500'}`} />

      {/* Playhead handle */}
      <div
        className={`absolute -top-2 -left-2 w-4 h-4 pointer-events-auto cursor-ew-resize transition-transform
          ${isDragging ? 'scale-110' : 'hover:scale-110'}
        `}
        style={{
          clipPath: 'polygon(0 0, 100% 0, 100% 50%, 50% 100%, 0 50%)',
          backgroundColor: isDragging ? '#f87171' : '#ef4444',
        }}
        onMouseDown={handleMouseDown}
      />
    </div>
  );
});
