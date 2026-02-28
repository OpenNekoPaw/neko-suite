/**
 * MediaDiffApp — Top-level component for the Media Diff webview.
 *
 * Responsibilities:
 * - Bridge useMediaDiffProtocol state → presentation components
 * - Auto-init diff on mount
 * - Manage GitRefSelector and ProgressOverlay
 */

import { useEffect, useCallback, memo } from 'react';
import { useMediaDiffProtocol } from '../../hooks/useMediaDiffProtocol';
import { MediaDiffViewer } from './MediaDiffViewer';

// =============================================================================
// ProgressOverlay
// =============================================================================

interface ProgressOverlayProps {
  progress: number;
  stage: string;
  onCancel: () => void;
}

const ProgressOverlay = memo(function ProgressOverlay({
  progress,
  stage,
  onCancel,
}: ProgressOverlayProps) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-[var(--vscode-editor-background)]/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 p-6 bg-[var(--vscode-editor-background)] rounded-lg border border-[var(--vscode-panel-border)] shadow-lg min-w-[300px]">
        {/* Progress bar */}
        <div className="w-full h-2 bg-[var(--vscode-input-background)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--vscode-button-background)] rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="text-sm text-[var(--vscode-foreground)]">
          {stage}
        </div>
        <div className="text-xs text-[var(--vscode-descriptionForeground)]">
          {Math.round(progress)}%
        </div>
        <button
          type="button"
          className="px-4 py-1.5 text-xs bg-[var(--vscode-input-background)] text-[var(--vscode-foreground)] rounded hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
});

// =============================================================================
// GitRefSelector
// =============================================================================

interface GitRefSelectorProps {
  commits: Array<{ hash: string; shortHash: string; subject: string; authorName: string; date: string }>;
  currentRef?: string;
  onChangeRef: (ref: string) => void;
  onLoadHistory: () => void;
}

const GitRefSelector = memo(function GitRefSelector({
  commits,
  currentRef,
  onChangeRef,
  onLoadHistory,
}: GitRefSelectorProps) {
  if (commits.length === 0) {
    return (
      <button
        type="button"
        className="px-3 py-1.5 text-xs bg-[var(--vscode-input-background)] text-[var(--vscode-foreground)] rounded hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
        onClick={onLoadHistory}
      >
        Load Git History
      </button>
    );
  }

  return (
    <select
      className="px-2 py-1 text-xs bg-[var(--vscode-input-background)] text-[var(--vscode-foreground)] border border-[var(--vscode-panel-border)] rounded"
      value={currentRef ?? 'HEAD'}
      onChange={(e) => onChangeRef(e.target.value)}
    >
      <option value="HEAD">HEAD</option>
      {commits.map((c) => (
        <option key={c.hash} value={c.hash}>
          {c.shortHash} — {c.subject} ({c.authorName})
        </option>
      ))}
    </select>
  );
});

// =============================================================================
// Error Display
// =============================================================================

interface ErrorDisplayProps {
  error: string;
  onRetry: () => void;
}

const ErrorDisplay = memo(function ErrorDisplay({ error, onRetry }: ErrorDisplayProps) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-md p-6">
        <div className="text-4xl mb-4">⚠️</div>
        <div className="text-sm text-red-400 mb-4">{error}</div>
        <button
          type="button"
          className="px-4 py-2 text-xs bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] rounded hover:bg-[var(--vscode-button-hoverBackground)] transition-colors"
          onClick={onRetry}
        >
          Retry
        </button>
      </div>
    </div>
  );
});

// =============================================================================
// MediaDiffApp
// =============================================================================

export default function MediaDiffApp() {
  const protocol = useMediaDiffProtocol();
  const {
    diffResult,
    isLoading,
    progress,
    error,
    currentImageSrc,
    previousImageSrc,
    heatmapSrc,
    currentWaveform,
    previousWaveform,
    currentFrameSrc,
    previousFrameSrc,
    commits,
    elementThumbnails,
    streamConfig,
    initialState,
    sendInit,
    sendInitLocal,
    sendSeek,
    sendCancel,
    sendGetFileHistory,
    sendChangeRef,
    sendInspectElement,
    sendStreamControl,
    audioStreamConfig,
    sendAudioStreamControl,
  } = protocol;

  // Auto-init on mount
  useEffect(() => {
    if (initialState.isLocalComparison && initialState.previousUri) {
      sendInitLocal(initialState.fileUri, initialState.previousUri);
    } else {
      sendInit(initialState.ref);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Streaming: no auto-start — streams are created lazily on first
  // Play click via handleStreamControl/handleAudioStreamControl('play')
  // in the extension, matching the neko-preview pattern.

  const handleRetry = useCallback(() => {
    if (initialState.isLocalComparison && initialState.previousUri) {
      sendInitLocal(initialState.fileUri, initialState.previousUri);
    } else {
      sendInit(initialState.ref);
    }
  }, [initialState, sendInit, sendInitLocal]);

  const handleTimeChange = useCallback(
    (time: number) => {
      if (diffResult?.mediaType === 'video') {
        sendSeek(time);
      }
    },
    [diffResult?.mediaType, sendSeek]
  );

  const handleChangeRef = useCallback(
    (ref: string) => {
      sendChangeRef(ref);
    },
    [sendChangeRef]
  );

  // Error state (non-loading)
  if (error && !isLoading) {
    return (
      <div className="h-screen flex flex-col bg-[var(--vscode-editor-background)]">
        <ErrorDisplay error={error} onRetry={handleRetry} />
      </div>
    );
  }

  return (
    <div className="relative h-screen flex flex-col bg-[var(--vscode-editor-background)]">
      {/* Git ref selector bar (only for Git mode) */}
      {!initialState.isLocalComparison && (
        <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--vscode-panel-border)]">
          <span className="text-xs text-[var(--vscode-descriptionForeground)]">
            Compare with:
          </span>
          <GitRefSelector
            commits={commits}
            currentRef={initialState.ref}
            onChangeRef={handleChangeRef}
            onLoadHistory={() => sendGetFileHistory(50)}
          />
        </div>
      )}

      {/* Main viewer */}
      <div className="flex-1 overflow-hidden">
        <MediaDiffViewer
          diffResult={diffResult ?? undefined}
          currentSrc={currentImageSrc ?? ''}
          previousSrc={previousImageSrc ?? ''}
          heatmapSrc={heatmapSrc ?? undefined}
          currentFrameSrc={currentFrameSrc ?? undefined}
          previousFrameSrc={previousFrameSrc ?? undefined}
          currentWaveform={currentWaveform}
          previousWaveform={previousWaveform}
          elementThumbnails={elementThumbnails}
          isLoading={isLoading && !progress}
          error={undefined}
          gitRef={initialState.ref ?? 'HEAD'}
          filePath={initialState.fileName}
          streamConfig={streamConfig}
          onTimeChange={handleTimeChange}
          onInspectElement={sendInspectElement}
          onStreamControl={sendStreamControl}
          audioStreamConfig={audioStreamConfig}
          onAudioStreamControl={sendAudioStreamControl}
        />
      </div>

      {/* Progress overlay */}
      {progress && (
        <ProgressOverlay
          progress={progress.progress}
          stage={progress.stage}
          onCancel={sendCancel}
        />
      )}
    </div>
  );
}
