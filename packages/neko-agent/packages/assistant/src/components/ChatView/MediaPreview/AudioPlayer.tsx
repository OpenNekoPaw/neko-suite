/**
 * AudioPlayer - Compact audio preview card
 * Matches ToolCallDisplay style with collapsible content
 * Supports click-to-open for local files
 */

import { useState, useRef, useCallback, useEffect, memo } from 'react';

// Get vscode API for postMessage
const vscode = (window as { vscode?: { postMessage: (msg: unknown) => void } }).vscode;

interface AudioPlayerProps {
  src: string;
  title?: string;
  className?: string;
  /** Local file path for opening in VSCode */
  localPath?: string;
}

/**
 * Extract filename from path or URL
 */
function getFileName(src: string, title?: string): string {
  if (title) return title.split('/').pop() || title;
  try {
    const url = new URL(src);
    return url.pathname.split('/').pop() || 'audio';
  } catch {
    return src.split('/').pop() || 'audio';
  }
}

/**
 * Format time as MM:SS
 */
function formatTime(time: number): string {
  if (!isFinite(time)) return '0:00';
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function AudioPlayerComponent({ src, title, className, localPath }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasError, setHasError] = useState(false);

  const fileName = getFileName(src, title);

  const toggleExpand = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      setCurrentTime(audio.currentTime);
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      setDuration(audio.duration);
    }
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (audio) {
      const newTime = parseFloat(e.target.value);
      audio.currentTime = newTime;
      setCurrentTime(newTime);
    }
  }, []);

  // Open file in VSCode or system default
  const handleOpenFile = useCallback(() => {
    const pathToOpen = localPath || src;
    // Check if it's a local file path
    if (pathToOpen.startsWith('/') || /^[A-Za-z]:[\\/]/.test(pathToOpen)) {
      vscode?.postMessage({ type: 'openFile', filePath: pathToOpen });
    } else {
      // For URLs, open in browser
      vscode?.postMessage({ type: 'openUrl', url: pathToOpen });
    }
  }, [localPath, src]);

  // Pause on collapse
  useEffect(() => {
    if (!isExpanded && isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    }
  }, [isExpanded, isPlaying]);

  // Cleanup on unmount
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (audio) {
        audio.pause();
      }
    };
  }, []);

  return (
    <div className={`my-1 ${className || ''}`}>
      {/* Compact header - matches ToolCallDisplay style */}
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded-t text-[11px] cursor-pointer transition-colors
          ${hasError
            ? 'bg-[color-mix(in_srgb,var(--vscode-textBlockQuote-background)_95%,#ef4444)]'
            : 'bg-[color-mix(in_srgb,var(--vscode-textBlockQuote-background)_95%,#a855f7)]'}
          hover:bg-[var(--vscode-list-hoverBackground)]
          ${!isExpanded ? 'rounded-b' : ''}
        `}
        onClick={toggleExpand}
      >
        {/* Status indicator */}
        {hasError ? (
          <ErrorIcon className="w-3 h-3 text-[var(--vscode-charts-red)] shrink-0" />
        ) : (
          <AudioIcon className="w-3 h-3 text-[var(--vscode-charts-purple)] shrink-0" />
        )}

        {/* File name */}
        <span className="font-medium text-[var(--vscode-foreground)] truncate">
          {fileName}
        </span>

        {/* Duration badge */}
        {duration > 0 && !hasError && (
          <span className="text-[var(--vscode-descriptionForeground)] text-[10px]">
            {formatTime(duration)}
          </span>
        )}

        {/* Spacer */}
        <span className="flex-1" />

        {/* Open button */}
        {!hasError && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleOpenFile();
            }}
            className="px-1.5 py-0.5 rounded bg-[var(--vscode-button-secondaryBackground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] text-[var(--vscode-button-secondaryForeground)] transition-colors flex items-center gap-1 shrink-0"
            title="Open file"
          >
            <OpenIcon className="w-3 h-3" />
            <span>Open</span>
          </button>
        )}

        {/* Expand indicator */}
        <ChevronIcon className={`w-3 h-3 text-[var(--vscode-descriptionForeground)] transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border border-t-0 border-[var(--vscode-panel-border)] rounded-b bg-[var(--vscode-editor-background)] p-2">
          {hasError ? (
            <div className="flex items-center justify-center py-4 text-[var(--vscode-errorForeground)] text-[11px]">
              <ErrorIcon className="w-4 h-4 mr-2" />
              <span>Failed to load audio</span>
            </div>
          ) : (
            <>
              <audio
                ref={audioRef}
                src={src}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={handleEnded}
                onError={handleError}
                preload="metadata"
              />
              <div className="flex items-center gap-2">
                {/* Play/Pause button */}
                <button
                  onClick={togglePlay}
                  className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-[var(--vscode-button-background)] hover:bg-[var(--vscode-button-hoverBackground)] text-[var(--vscode-button-foreground)] transition-colors"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <PauseIcon className="w-3.5 h-3.5" /> : <PlayIcon className="w-3.5 h-3.5" />}
                </button>

                {/* Progress bar */}
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  value={currentTime}
                  onChange={handleSeek}
                  className="flex-1 h-1 bg-[var(--vscode-scrollbarSlider-background)] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--vscode-button-background)]"
                />

                {/* Time display */}
                <span className="text-[10px] text-[var(--vscode-descriptionForeground)] tabular-nums min-w-[60px] text-right">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export const AudioPlayer = memo(AudioPlayerComponent);

// Icons
function AudioIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
    </svg>
  );
}

function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function OpenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
}
