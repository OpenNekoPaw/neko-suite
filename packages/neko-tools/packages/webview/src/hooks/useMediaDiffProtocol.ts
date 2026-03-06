/**
 * useMediaDiffProtocol — Core hook for Extension ↔ Webview IPC
 *
 * Responsibilities:
 * - Listen to Extension → Webview messages
 * - Convert ArrayBuffer → Blob URL for binary data
 * - Expose typed send* methods for Webview → Extension requests
 * - Clean up Blob URLs on unmount
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  DiffResult,
  GitCommitInfo,
  MediaType,
  StreamConfig,
  AudioStreamConfig,
} from '@neko/shared';
import type { InitialState } from '../components/MediaDiff/types';

// Acquire VSCode API (singleton)
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

// =============================================================================
// State Interface
// =============================================================================

export interface MediaDiffProtocolState {
  diffResult: DiffResult | null;
  isLoading: boolean;
  progress: { progress: number; stage: string } | null;
  error: string | null;
  currentImageSrc: string | null;
  previousImageSrc: string | null;
  heatmapSrc: string | null;
  currentWaveform: number[];
  previousWaveform: number[];
  currentFrameSrc: string | null;
  previousFrameSrc: string | null;
  commits: GitCommitInfo[];
  elementThumbnails: Map<string, string>;
  initialState: InitialState;
  /** Stream config from extension (set when streaming is active) */
  streamConfig: StreamConfig | null;
  /** Stream error message */
  streamError: string | null;
  /** Audio-only stream config from extension (set when audio streaming is active) */
  audioStreamConfig: AudioStreamConfig | null;
  /**
   * True while the extension is running `git show` to extract the previous
   * version to a temp file. Play button should be disabled during this time
   * to prevent a race condition where streaming starts before the file exists.
   */
  isFetchingPrevious: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

let requestCounter = 0;
function nextRequestId(): string {
  return `req-${Date.now()}-${++requestCounter}`;
}

function arrayBufferToBlobUrl(buffer: ArrayBuffer, mimeType: string): string {
  const blob = new Blob([buffer], { type: mimeType });
  return URL.createObjectURL(blob);
}

function getDefaultInitialState(): InitialState {
  // Extension injects window.initialState before script loads
  const win = window as unknown as { initialState?: InitialState };
  return (
    win.initialState ?? {
      mediaType: 'image' as MediaType,
      fileName: '',
      isLocalComparison: false,
      fileUri: '',
    }
  );
}

// =============================================================================
// Hook
// =============================================================================

export function useMediaDiffProtocol(): MediaDiffProtocolState & {
  sendInit: (ref?: string) => void;
  sendInitLocal: (currentUri: string, previousUri: string) => void;
  sendSeek: (time: number) => void;
  sendGetFrame: (time: number, version: 'current' | 'previous') => void;
  sendChangeRef: (ref: string) => void;
  sendCancel: () => void;
  sendGetFileHistory: (maxCount?: number) => void;
  sendInspectElement: (src: string) => void;
  sendStartStreaming: () => void;
  sendStopStreaming: () => void;
  sendStreamControl: (action: 'play' | 'pause' | 'seek', payload?: { time?: number; speed?: number }) => void;
  sendStartAudioStreaming: () => void;
  sendStopAudioStreaming: () => void;
  sendAudioStreamControl: (action: 'play' | 'pause' | 'seek', payload?: { time?: number }) => void;
  sendSetTimeRange: (startTime?: number, endTime?: number) => void;
} {
  const [state, setState] = useState<MediaDiffProtocolState>(() => ({
    diffResult: null,
    isLoading: false,
    progress: null,
    error: null,
    currentImageSrc: null,
    previousImageSrc: null,
    heatmapSrc: null,
    currentWaveform: [],
    previousWaveform: [],
    currentFrameSrc: null,
    previousFrameSrc: null,
    commits: [],
    elementThumbnails: new Map(),
    initialState: getDefaultInitialState(),
    streamConfig: null,
    streamError: null,
    audioStreamConfig: null,
    isFetchingPrevious: false,
  }));

  // Track Blob URLs for cleanup
  const blobUrlsRef = useRef<string[]>([]);

  const trackBlobUrl = useCallback((url: string) => {
    blobUrlsRef.current.push(url);
    return url;
  }, []);

  const revokeBlobUrl = useCallback((url: string | null) => {
    if (url) {
      URL.revokeObjectURL(url);
      blobUrlsRef.current = blobUrlsRef.current.filter((u) => u !== url);
    }
  }, []);

  // =========================================================================
  // Message listener
  // =========================================================================

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const msg = event.data;
      if (!msg || !msg.type) return;

      switch (msg.type) {
        case 'mediaDiff:progress':
          setState((prev) => ({
            ...prev,
            // When a preliminary diffResult already exists (video/audio fast path),
            // keep current isLoading to avoid re-blocking the interactive UI.
            isLoading: prev.diffResult != null ? prev.isLoading : true,
            progress: msg.payload,
            error: null,
          }));
          break;

        case 'mediaDiff:result':
          setState((prev) => ({
            ...prev,
            diffResult: msg.payload,
            isLoading: false,
            progress: null,
          }));
          break;

        case 'mediaDiff:error':
          setState((prev) => ({
            ...prev,
            isLoading: false,
            progress: null,
            error: msg.error ?? 'Unknown error',
          }));
          break;

        case 'mediaDiff:imageData': {
          const { currentImage, previousImage, heatmap, mimeType } =
            msg.payload;
          setState((prev) => {
            // Revoke old URLs
            revokeBlobUrl(prev.currentImageSrc);
            revokeBlobUrl(prev.previousImageSrc);
            revokeBlobUrl(prev.heatmapSrc);

            const mime = mimeType ?? 'image/png';
            return {
              ...prev,
              currentImageSrc: currentImage
                ? trackBlobUrl(arrayBufferToBlobUrl(currentImage, mime))
                : null,
              previousImageSrc: previousImage
                ? trackBlobUrl(arrayBufferToBlobUrl(previousImage, mime))
                : null,
              heatmapSrc: heatmap
                ? trackBlobUrl(arrayBufferToBlobUrl(heatmap, 'image/png'))
                : null,
            };
          });
          break;
        }

        case 'mediaDiff:waveformData':
          setState((prev) => ({
            ...prev,
            currentWaveform: msg.payload.currentWaveform ?? [],
            previousWaveform: msg.payload.previousWaveform ?? [],
          }));
          break;

        case 'mediaDiff:frameData': {
          const { version, imageBuffer } = msg.payload;
          setState((prev) => {
            const key =
              version === 'current' ? 'currentFrameSrc' : 'previousFrameSrc';
            revokeBlobUrl(prev[key]);
            return {
              ...prev,
              [key]: trackBlobUrl(
                arrayBufferToBlobUrl(imageBuffer, 'image/jpeg')
              ),
            };
          });
          break;
        }

        case 'mediaDiff:fileHistory':
          setState((prev) => ({
            ...prev,
            commits: msg.payload.commits ?? [],
          }));
          break;

        case 'mediaDiff:elementThumbnail': {
          const { src, imageBuffer } = msg.payload;
          setState((prev) => {
            const next = new Map(prev.elementThumbnails);
            const oldUrl = next.get(src);
            if (oldUrl) revokeBlobUrl(oldUrl);
            next.set(
              src,
              trackBlobUrl(arrayBufferToBlobUrl(imageBuffer, 'image/jpeg'))
            );
            return { ...prev, elementThumbnails: next };
          });
          break;
        }

        // ── Fetch state (git show progress) ─────────────────────────
        case 'mediaDiff:fetchState':
          setState((prev) => ({
            ...prev,
            isFetchingPrevious: msg.state === 'fetching',
          }));
          break;

        // ── Streaming responses ──────────────────────────────────────
        case 'mediaDiff:streamConfig':
          setState((prev) => ({
            ...prev,
            streamConfig: msg.payload,
            streamError: null,
          }));
          break;

        case 'mediaDiff:audioStreamConfig':
          setState((prev) => ({
            ...prev,
            audioStreamConfig: msg.payload,
            streamError: null,
          }));
          break;

        case 'mediaDiff:streamError':
          setState((prev) => ({
            ...prev,
            streamError: msg.error ?? 'Stream error',
          }));
          break;
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [trackBlobUrl, revokeBlobUrl]);

  // Cleanup all Blob URLs on unmount
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  // =========================================================================
  // Send methods (Webview → Extension)
  // =========================================================================

  const sendInit = useCallback((ref?: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    vscode.postMessage({
      type: 'mediaDiff:init',
      requestId: nextRequestId(),
      timestamp: Date.now(),
      payload: { fileUri: state.initialState.fileUri, ref },
    });
  }, [state.initialState.fileUri]);

  const sendInitLocal = useCallback(
    (currentUri: string, previousUri: string) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      vscode.postMessage({
        type: 'mediaDiff:initLocal',
        requestId: nextRequestId(),
        timestamp: Date.now(),
        payload: { currentUri, previousUri },
      });
    },
    []
  );

  const sendSeek = useCallback((time: number) => {
    vscode.postMessage({
      type: 'mediaDiff:seek',
      requestId: nextRequestId(),
      timestamp: Date.now(),
      payload: { time },
    });
  }, []);

  const sendGetFrame = useCallback(
    (time: number, version: 'current' | 'previous') => {
      vscode.postMessage({
        type: 'mediaDiff:getFrame',
        requestId: nextRequestId(),
        timestamp: Date.now(),
        payload: { time, version },
      });
    },
    []
  );

  const sendChangeRef = useCallback((ref: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    vscode.postMessage({
      type: 'mediaDiff:changeRef',
      requestId: nextRequestId(),
      timestamp: Date.now(),
      payload: { ref },
    });
  }, []);

  const sendCancel = useCallback(() => {
    vscode.postMessage({
      type: 'mediaDiff:cancel',
      requestId: nextRequestId(),
      timestamp: Date.now(),
    });
    setState((prev) => ({ ...prev, isLoading: false, progress: null }));
  }, []);

  const sendGetFileHistory = useCallback((maxCount?: number) => {
    vscode.postMessage({
      type: 'mediaDiff:getFileHistory',
      requestId: nextRequestId(),
      timestamp: Date.now(),
      payload: { maxCount },
    });
  }, []);

  const sendInspectElement = useCallback((src: string) => {
    vscode.postMessage({
      type: 'mediaDiff:inspectElement',
      requestId: nextRequestId(),
      timestamp: Date.now(),
      payload: { src },
    });
  }, []);

  const sendStartStreaming = useCallback(() => {
    vscode.postMessage({
      type: 'mediaDiff:startStreaming',
      requestId: nextRequestId(),
      timestamp: Date.now(),
      payload: {},
    });
  }, []);

  const sendStopStreaming = useCallback(() => {
    setState((prev) => ({ ...prev, streamConfig: null, streamError: null }));
    vscode.postMessage({
      type: 'mediaDiff:stopStreaming',
      requestId: nextRequestId(),
      timestamp: Date.now(),
      payload: {},
    });
  }, []);

  const sendStreamControl = useCallback(
    (action: 'play' | 'pause' | 'seek', payload?: { time?: number; speed?: number }) => {
      vscode.postMessage({
        type: 'mediaDiff:streamControl',
        requestId: nextRequestId(),
        timestamp: Date.now(),
        payload: { action, ...payload },
      });
    },
    []
  );

  const sendStartAudioStreaming = useCallback(() => {
    vscode.postMessage({
      type: 'mediaDiff:startAudioStreaming',
      requestId: nextRequestId(),
      timestamp: Date.now(),
      payload: {},
    });
  }, []);

  const sendStopAudioStreaming = useCallback(() => {
    setState((prev) => ({ ...prev, audioStreamConfig: null, streamError: null }));
    vscode.postMessage({
      type: 'mediaDiff:stopAudioStreaming',
      requestId: nextRequestId(),
      timestamp: Date.now(),
      payload: {},
    });
  }, []);

  const sendAudioStreamControl = useCallback(
    (action: 'play' | 'pause' | 'seek', payload?: { time?: number }) => {
      vscode.postMessage({
        type: 'mediaDiff:audioStreamControl',
        requestId: nextRequestId(),
        timestamp: Date.now(),
        payload: { action, ...payload },
      });
    },
    []
  );

  const sendSetTimeRange = useCallback(
    (startTime?: number, endTime?: number) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      vscode.postMessage({
        type: 'mediaDiff:setTimeRange',
        requestId: nextRequestId(),
        timestamp: Date.now(),
        payload: { startTime, endTime },
      });
    },
    []
  );

  return {
    ...state,
    sendInit,
    sendInitLocal,
    sendSeek,
    sendGetFrame,
    sendChangeRef,
    sendCancel,
    sendGetFileHistory,
    sendInspectElement,
    sendStartStreaming,
    sendStopStreaming,
    sendStreamControl,
    sendStartAudioStreaming,
    sendStopAudioStreaming,
    sendAudioStreamControl,
    sendSetTimeRange,
  };
}
