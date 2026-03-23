/**
 * AudioPlayer - Compact audio preview card
 *
 * Displays audio metadata with file info.
 * Clicking "Open" opens the file in neko-preview
 * (hardware-accelerated audio preview with waveform via customEditor).
 */

import { useState, useRef, useCallback, memo } from 'react';

// Get vscode API for postMessage
const vscode = (window as { vscode?: { postMessage: (msg: unknown) => void } }).vscode;

interface AudioPlayerProps {
  src: string;
  title?: string;
  className?: string;
  /** Local file path for opening in neko-preview */
  localPath?: string;
  /** Inline mode: native audio controls embedded (for use inside TaskCard) */
  inline?: boolean;
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

/**
 * Compact inline audio player shown inside TaskCard.
 * Uses native <audio controls> which works for MP3/WAV/AAC/OGG-Vorbis in Electron.
 * Falls back to "Open in Preview" if the browser cannot decode the format (e.g. raw Opus).
 */
function InlineAudioPlayer({
  src,
  title,
  localPath,
  className,
}: {
  src: string;
  title?: string;
  localPath?: string;
  className?: string;
}) {
  const [cannotPlay, setCannotPlay] = useState(false);
  const fileName = getFileName(src, title);

  const handleOpenPreview = useCallback(() => {
    const pathToOpen = localPath || src;
    if (pathToOpen.startsWith('/') || /^[A-Za-z]:[\\/]/.test(pathToOpen)) {
      vscode?.postMessage({ type: 'openFile', filePath: pathToOpen });
    } else {
      vscode?.postMessage({ type: 'openUrl', url: pathToOpen });
    }
  }, [localPath, src]);

  if (cannotPlay) {
    return (
      <div
        className={`flex items-center gap-2 px-2 py-1.5 rounded bg-[color-mix(in_srgb,var(--vscode-textBlockQuote-background)_95%,#a855f7)] ${className || ''}`}
      >
        <AudioIcon className="w-3 h-3 text-[var(--vscode-charts-purple)] shrink-0" />
        <span className="text-[10px] text-[var(--vscode-descriptionForeground)] truncate flex-1">
          {fileName}
        </span>
        <button
          onClick={handleOpenPreview}
          className="px-1.5 py-0.5 rounded bg-[var(--vscode-button-secondaryBackground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] text-[var(--vscode-button-secondaryForeground)] text-[10px] transition-colors shrink-0"
        >
          Open in Preview
        </button>
      </div>
    );
  }

  return (
    <div className={`rounded overflow-hidden ${className || ''}`}>
      <audio
        src={src}
        controls
        preload="metadata"
        className="w-full h-8"
        style={{ colorScheme: 'dark' }}
        onError={() => setCannotPlay(true)}
      />
    </div>
  );
}

function AudioPlayerComponent({ src, title, className, localPath, inline = false }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [duration, setDuration] = useState(0);
  const [hasError, setHasError] = useState(false);

  const fileName = getFileName(src, title);

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      setDuration(audio.duration);
    }
  }, []);

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  // Open file in neko-preview (hardware-accelerated preview with waveform)
  const handleOpenPreview = useCallback(() => {
    const pathToOpen = localPath || src;
    // Check if it's a local file path → open with neko-preview
    if (pathToOpen.startsWith('/') || /^[A-Za-z]:[\\/]/.test(pathToOpen)) {
      vscode?.postMessage({ type: 'openFile', filePath: pathToOpen });
    } else {
      // For URLs, open in browser
      vscode?.postMessage({ type: 'openUrl', url: pathToOpen });
    }
  }, [localPath, src]);

  // Inline mode: compact native audio player for use inside TaskCard
  if (inline) {
    return (
      <InlineAudioPlayer src={src} title={title} localPath={localPath} className={className} />
    );
  }

  return (
    <div className={`my-1 ${className || ''}`}>
      {/* Hidden audio element for metadata extraction */}
      <audio
        ref={audioRef}
        src={src}
        onLoadedMetadata={handleLoadedMetadata}
        onError={handleError}
        preload="metadata"
      />

      {/* Compact header - matches ToolCallDisplay style */}
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded-t text-[11px] cursor-pointer transition-colors
          ${
            hasError
              ? 'bg-[color-mix(in_srgb,var(--vscode-textBlockQuote-background)_95%,#ef4444)]'
              : 'bg-[color-mix(in_srgb,var(--vscode-textBlockQuote-background)_95%,#a855f7)]'
          }
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
        <span className="font-medium text-[var(--vscode-foreground)] truncate">{fileName}</span>

        {/* Duration badge */}
        {duration > 0 && !hasError && (
          <span className="text-[var(--vscode-descriptionForeground)] text-[10px]">
            {formatTime(duration)}
          </span>
        )}

        {/* Spacer */}
        <span className="flex-1" />

        {/* Open in Preview button */}
        {!hasError && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleOpenPreview();
            }}
            className="px-1.5 py-0.5 rounded bg-[var(--vscode-button-secondaryBackground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] text-[var(--vscode-button-secondaryForeground)] transition-colors flex items-center gap-1 shrink-0"
            title="Open in Neko Preview"
          >
            <OpenIcon className="w-3 h-3" />
            <span>Preview</span>
          </button>
        )}

        {/* Expand indicator */}
        <ChevronIcon
          className={`w-3 h-3 text-[var(--vscode-descriptionForeground)] transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
        />
      </div>

      {/* Expanded content — audio info card with click-to-open */}
      {isExpanded && (
        <div className="border border-t-0 border-[var(--vscode-panel-border)] rounded-b bg-[var(--vscode-editor-background)] overflow-hidden">
          {hasError ? (
            <div className="flex items-center justify-center py-4 text-[var(--vscode-errorForeground)] text-[11px]">
              <ErrorIcon className="w-4 h-4 mr-2" />
              <span>Failed to load audio</span>
            </div>
          ) : (
            <div
              className="flex items-center gap-3 p-3 cursor-pointer group hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
              onClick={handleOpenPreview}
            >
              {/* Play button icon */}
              <div className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-[var(--vscode-button-background)] group-hover:bg-[var(--vscode-button-hoverBackground)] text-[var(--vscode-button-foreground)] transition-colors">
                <PlayIcon className="w-4 h-4 ml-0.5" />
              </div>

              {/* Audio info */}
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium text-[var(--vscode-foreground)] truncate">
                  {fileName}
                </div>
                <div className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                  {duration > 0 ? formatTime(duration) : 'Loading...'} · Click to open in Neko
                  Preview
                </div>
              </div>

              {/* Open icon */}
              <OpenIcon className="w-4 h-4 text-[var(--vscode-descriptionForeground)] group-hover:text-[var(--vscode-foreground)] transition-colors shrink-0" />
            </div>
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
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
      />
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
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
      />
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
