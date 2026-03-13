/**
 * FrameTimeline - horizontal frame strip for frame-by-frame animation
 *
 * Displays frame thumbnails in a scrollable strip.
 * Click to select, keyboard shortcuts for navigation.
 */
import { useCallback, useRef, useEffect } from 'react';
import { useSketchStore } from '../stores';
import { useFramePlayback } from '../hooks/useFramePlayback';

export function FrameTimeline() {
  const frameLayers = useSketchStore((s) => s.frameLayers);
  const selectedLayerId = useSketchStore((s) => s.selectedFrameLayerId);
  const currentIndex = useSketchStore((s) => s.currentFrameIndex);
  const setCurrentFrameIndex = useSketchStore((s) => s.setCurrentFrameIndex);
  const fps = useSketchStore((s) => s.fps);
  const setFps = useSketchStore((s) => s.setFps);
  const onionSkin = useSketchStore((s) => s.onionSkin);
  const toggleOnionSkin = useSketchStore((s) => s.toggleOnionSkin);

  const { toggle, isPlaying } = useFramePlayback();
  const scrollRef = useRef<HTMLDivElement>(null);

  const currentLayer = frameLayers.find((l) => l.id === selectedLayerId);

  // Auto-scroll to keep current frame visible
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const frameEl = container.children[currentIndex] as HTMLElement | undefined;
    if (frameEl) {
      frameEl.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    }
  }, [currentIndex]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only handle when no input is focused
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case ',':
          e.preventDefault();
          useSketchStore.getState().prevFrame();
          break;
        case '.':
          e.preventDefault();
          useSketchStore.getState().nextFrame();
          break;
        case 'F5':
          e.preventDefault();
          toggle();
          break;
        case 'o':
        case 'O':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            toggleOnionSkin();
          }
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggle, toggleOnionSkin]);

  if (frameLayers.length === 0) return null;

  const handleFpsChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setFps(parseInt(e.target.value, 10) || 12);
    },
    [setFps],
  );

  return (
    <div className="flex flex-col border-t border-[var(--sketch-border)] bg-[var(--vscode-editor-background)]">
      {/* Controls bar */}
      <div className="flex items-center gap-1 px-2 py-1 text-xs">
        <button
          className="px-2 py-0.5 rounded border border-[var(--vscode-button-border)]"
          onClick={toggle}
          aria-label={isPlaying ? 'Stop playback' : 'Play animation'}
        >
          {isPlaying ? '■' : '▶'}
        </button>

        <span className="opacity-60">FPS:</span>
        <input
          type="number"
          min={1}
          max={60}
          value={fps}
          onChange={handleFpsChange}
          className="w-10 text-xs text-center bg-transparent border border-[var(--vscode-input-border)] rounded px-1"
          aria-label="Frames per second"
        />

        <button
          className={`px-1.5 py-0.5 rounded border border-[var(--vscode-button-border)] ${
            onionSkin.enabled
              ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
              : ''
          }`}
          onClick={toggleOnionSkin}
          title="Toggle onion skin (O)"
          aria-label="Toggle onion skin"
          aria-pressed={onionSkin.enabled}
        >
          🧅
        </button>

        <span className="flex-1" />

        <span className="opacity-50 tabular-nums">
          {currentIndex + 1}/{currentLayer?.frames.length ?? 0}
        </span>
      </div>

      {/* Frame strip */}
      <div
        ref={scrollRef}
        className="flex items-stretch overflow-x-auto px-1 pb-1 gap-0.5"
        role="listbox"
        aria-label="Animation frames"
      >
        {currentLayer?.frames.map((frame) => (
          <div
            key={frame.id}
            role="option"
            aria-selected={frame.index === currentIndex}
            className={`flex-shrink-0 w-10 h-10 flex items-center justify-center text-[10px] rounded cursor-pointer border ${
              frame.index === currentIndex
                ? 'border-[var(--vscode-focusBorder)] bg-[var(--vscode-list-activeSelectionBackground)]'
                : 'border-[var(--vscode-input-border)] hover:bg-[var(--vscode-list-hoverBackground)]'
            } ${frame.isKeyframe ? 'font-bold' : 'opacity-60'}`}
            onClick={() => setCurrentFrameIndex(frame.index)}
            title={`Frame ${frame.index + 1}${frame.isKeyframe ? ' (key)' : ''}`}
          >
            {frame.imageData ? (
              <span className="text-[10px]">{frame.index + 1}</span>
            ) : (
              <span className="opacity-30">○</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
