/**
 * VideoPlayer - Compact video preview card
 * Matches ToolCallDisplay style with collapsible content
 * Supports click-to-open for local files
 */

import { useState, useRef, useCallback, useEffect, memo } from 'react';

// Get vscode API for postMessage
const vscode = (window as { vscode?: { postMessage: (msg: unknown) => void } }).vscode;

interface VideoPlayerProps {
  src: string;
  poster?: string;
  title?: string;
  className?: string;
  /** Local file path for opening in VSCode */
  localPath?: string;
  /** Inline mode: show only video without header (for use inside cards like TaskCard) */
  inline?: boolean;
}

/**
 * Extract filename from path or URL
 */
function getFileName(src: string, title?: string): string {
  if (title) return title.split('/').pop() || title;
  try {
    const url = new URL(src);
    return url.pathname.split('/').pop() || 'video';
  } catch {
    return src.split('/').pop() || 'video';
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

function VideoPlayerComponent({ src, poster, title, className, localPath, inline = false }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
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
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      setCurrentTime(video.currentTime);
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      setDuration(video.duration);
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
    const video = videoRef.current;
    if (video) {
      const newTime = parseFloat(e.target.value);
      video.currentTime = newTime;
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
      videoRef.current?.pause();
      setIsPlaying(false);
    }
  }, [isExpanded, isPlaying]);

  // Cleanup on unmount
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      if (video) {
        video.pause();
      }
    };
  }, []);

  // Inline mode: show only the video without header
  if (inline) {
    return (
      <div className={`rounded overflow-hidden bg-black ${className || ''}`}>
        {hasError ? (
          <div className="flex items-center justify-center py-6 text-[var(--vscode-errorForeground)] text-[11px] bg-[var(--vscode-editor-background)]">
            <ErrorIcon className="w-4 h-4 mr-2" />
            <span>Failed to load video</span>
          </div>
        ) : (
          <div className="relative">
            <video
              ref={videoRef}
              src={src}
              poster={poster}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={handleEnded}
              onError={handleError}
              onClick={togglePlay}
              className="w-full max-h-[200px] object-contain cursor-pointer"
              preload="metadata"
            />

            {/* Play overlay (when paused) */}
            {!isPlaying && (
              <div
                className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer"
                onClick={togglePlay}
              >
                <div className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                  <PlayIcon className="w-5 h-5 text-white ml-0.5" />
                </div>
              </div>
            )}

            {/* Simple progress bar */}
            <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent">
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePlay();
                  }}
                  className="p-0.5 hover:bg-white/20 rounded transition-colors"
                >
                  {isPlaying ? (
                    <PauseIcon className="w-3.5 h-3.5 text-white" />
                  ) : (
                    <PlayIcon className="w-3.5 h-3.5 text-white" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  value={currentTime}
                  onChange={handleSeek}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 h-1 bg-white/30 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                />
                <span className="text-[9px] text-white/80 tabular-nums min-w-[60px] text-right">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`my-1 ${className || ''}`}>
      {/* Compact header - matches ToolCallDisplay style */}
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded-t text-[11px] cursor-pointer transition-colors
          ${hasError
            ? 'bg-[color-mix(in_srgb,var(--vscode-textBlockQuote-background)_95%,#ef4444)]'
            : 'bg-[color-mix(in_srgb,var(--vscode-textBlockQuote-background)_95%,#3b82f6)]'}
          hover:bg-[var(--vscode-list-hoverBackground)]
          ${!isExpanded ? 'rounded-b' : ''}
        `}
        onClick={toggleExpand}
      >
        {/* Status indicator */}
        {hasError ? (
          <ErrorIcon className="w-3 h-3 text-[var(--vscode-charts-red)] shrink-0" />
        ) : (
          <VideoIcon className="w-3 h-3 text-[var(--vscode-charts-blue)] shrink-0" />
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
        <div className="border border-t-0 border-[var(--vscode-panel-border)] rounded-b bg-black overflow-hidden">
          {hasError ? (
            <div className="flex items-center justify-center py-6 text-[var(--vscode-errorForeground)] text-[11px] bg-[var(--vscode-editor-background)]">
              <ErrorIcon className="w-4 h-4 mr-2" />
              <span>Failed to load video</span>
            </div>
          ) : (
            <div className="relative">
              <video
                ref={videoRef}
                src={src}
                poster={poster}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={handleEnded}
                onError={handleError}
                onClick={togglePlay}
                className="w-full max-h-[200px] object-contain cursor-pointer"
                preload="metadata"
              />

              {/* Play overlay (when paused) */}
              {!isPlaying && (
                <div
                  className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer"
                  onClick={togglePlay}
                >
                  <div className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                    <PlayIcon className="w-5 h-5 text-white ml-0.5" />
                  </div>
                </div>
              )}

              {/* Simple progress bar */}
              <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent">
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePlay();
                    }}
                    className="p-0.5 hover:bg-white/20 rounded transition-colors"
                  >
                    {isPlaying ? (
                      <PauseIcon className="w-3.5 h-3.5 text-white" />
                    ) : (
                      <PlayIcon className="w-3.5 h-3.5 text-white" />
                    )}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    value={currentTime}
                    onChange={handleSeek}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 h-1 bg-white/30 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                  />
                  <span className="text-[9px] text-white/80 tabular-nums min-w-[60px] text-right">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const VideoPlayer = memo(VideoPlayerComponent);

// Icons
function VideoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
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
