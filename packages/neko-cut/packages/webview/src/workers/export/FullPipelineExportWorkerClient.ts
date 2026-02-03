/**
 * Full Pipeline Export Worker Client
 *
 * Main thread client for communicating with Full Pipeline Export Worker.
 * Provides Promise-based API for export operations where all processing
 * (demux, decode, render, encode, mux) happens in the Worker.
 */

import type {
  ExportWorkerRequest,
  ExportWorkerResponse,
  ExportWorkerConfig,
  SerializedProjectData,
  FetchProxyRequest,
  FetchProxyResponse,
} from './types';
import type { ExportProgress } from '../../utils/export/IExportEngine';
import { getPathFromUri, readFileRangeCached } from '../../hooks/useVSCodeMessaging';

// Import worker as inline (Vite will bundle and inline it)
import FullPipelineExportWorkerInline from './FullPipelineExportWorker?worker&inline';

// =============================================================================
// Types
// =============================================================================

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout?: ReturnType<typeof setTimeout>;
}

export interface FullPipelineExportResult {
  outputBuffer: ArrayBuffer;
  fileSize: number;
  totalTime: number;
  averageFps: number;
}

// =============================================================================
// FullPipelineExportWorkerClient
// =============================================================================

export class FullPipelineExportWorkerClient {
  private _worker: Worker | null = null;
  private _isInitialized = false;
  private _pendingRequests = new Map<string, PendingRequest>();

  // Callbacks
  private _onProgress: ((progress: ExportProgress) => void) | null = null;
  private _onError: ((error: string) => void) | null = null;

  // ==========================================================================
  // Properties
  // ==========================================================================

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  // ==========================================================================
  // Callbacks
  // ==========================================================================

  set onProgress(callback: ((progress: ExportProgress) => void) | null) {
    this._onProgress = callback;
  }

  set onError(callback: ((error: string) => void) | null) {
    this._onError = callback;
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Initialize export worker with full pipeline mode
   * Worker will handle demux, decode, render, encode, mux internally
   */
  async init(
    canvas: OffscreenCanvas,
    config: ExportWorkerConfig,
    project: SerializedProjectData
  ): Promise<void> {
    if (this._worker) {
      throw new Error('Worker already initialized');
    }

    // Create worker
    this._worker = new FullPipelineExportWorkerInline();
    this._setupMessageHandler();

    // Wait for worker ready
    await this._waitForReady();

    // Collect preloaded data buffers for transfer
    const transferables: Transferable[] = [canvas];
    for (const track of project.tracks) {
      for (const element of track.elements) {
        if (element.preloadedData) {
          transferables.push(element.preloadedData);
        }
      }
    }

    // Send init request with canvas and preloaded data transfer
    const request: ExportWorkerRequest = {
      type: 'init-full-pipeline',
      canvas,
      config,
      project,
    };

    const response = await this._sendRequest<{ success: boolean; error?: string }>(
      request,
      transferables,
      120000 // 120 second timeout for initialization
    );

    if (!response.success) {
      throw new Error(response.error ?? 'Worker initialization failed');
    }

    this._isInitialized = true;
  }

  /**
   * Start export process
   * Worker will process all frames and return the result
   */
  async startExport(): Promise<FullPipelineExportResult> {
    if (!this._isInitialized) {
      throw new Error('Worker not initialized');
    }

    const request: ExportWorkerRequest = { type: 'start-export' };

    const response = await this._sendRequest<FullPipelineExportResult>(
      request,
      [],
      600000 // 10 minute timeout for export
    );

    return response;
  }

  /**
   * Submit mixed audio data for encoding
   * Audio is processed in main thread (using libav.js) and sent to Worker for muxing
   */
  async submitAudio(
    audioBuffer: Float32Array,
    sampleRate: number,
    channels: number
  ): Promise<void> {
    if (!this._isInitialized) {
      throw new Error('Worker not initialized');
    }

    const request: ExportWorkerRequest = {
      type: 'submit-audio',
      audioBuffer,
      sampleRate,
      channels,
    };

    // Transfer the audio buffer for zero-copy
    await this._sendRequest<{ success: boolean }>(
      request,
      [audioBuffer.buffer],
      60000 // 60 second timeout for audio encoding
    );
  }

  /**
   * Cancel export
   */
  cancel(): void {
    if (!this._worker) return;

    const request: ExportWorkerRequest = { type: 'cancel' };
    this._worker.postMessage(request);
  }

  /**
   * Terminate worker and cleanup
   */
  terminate(): void {
    if (!this._worker) return;

    const request: ExportWorkerRequest = { type: 'terminate' };
    this._worker.postMessage(request);

    // Clear pending requests
    for (const [, pending] of this._pendingRequests) {
      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }
      pending.reject(new Error('Worker terminated'));
    }
    this._pendingRequests.clear();

    this._worker.terminate();
    this._worker = null;
    this._isInitialized = false;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private _setupMessageHandler(): void {
    if (!this._worker) return;

    this._worker.onmessage = (event: MessageEvent<ExportWorkerResponse>) => {
      this._handleMessage(event.data);
    };

    this._worker.onerror = (error) => {
      console.error('[FullPipelineExportWorkerClient] Worker error:', error);
      this._onError?.(`Worker error: ${error.message}`);
    };
  }

  private _handleMessage(response: ExportWorkerResponse): void {
    switch (response.type) {
      case 'ready':
        this._resolvePending('__ready__', response);
        break;

      case 'init:done':
        this._resolvePending('__init__', response);
        break;

      case 'progress':
        this._onProgress?.(response.progress);
        break;

      case 'complete':
        this._resolvePending('__export__', response);
        break;

      case 'audio:encoded':
        this._resolvePending('__audio__', { success: true });
        break;

      case 'cancelled':
        this._resolvePending('__cancel__', response);
        break;

      case 'error':
        console.error('[FullPipelineExportWorkerClient] Worker error:', response.error);
        this._onError?.(response.error);
        // Reject all pending requests
        for (const [key, pending] of this._pendingRequests) {
          if (pending.timeout) {
            clearTimeout(pending.timeout);
          }
          pending.reject(new Error(response.error));
          this._pendingRequests.delete(key);
        }
        break;

      case 'fetch-proxy':
        // Worker requests main thread to fetch data (Worker cannot fetch VSCode resource URLs)
        this._handleFetchProxy(response as FetchProxyRequest);
        break;
    }
  }

  /**
   * Handle fetch proxy request from Worker.
   * Worker cannot directly fetch VSCode resource URLs, so main thread fetches and sends back.
   *
   * OPTIMIZATION: Uses Extension Host file reading with caching to avoid
   * repeatedly loading the entire file (VSCode webview URLs don't support Range requests).
   */
  private async _handleFetchProxy(request: FetchProxyRequest): Promise<void> {
    if (!this._worker) return;

    try {
      // Try to get file path from URI cache (reverse lookup)
      const filePath = getPathFromUri(request.url);

      let data: ArrayBuffer;

      if (filePath && request.range) {
        // OPTIMIZED PATH: Use Extension Host file reading with caching
        // Parse range header: "bytes=start-end"
        const rangeMatch = request.range.match(/bytes=(\d+)-(\d+)?/);
        if (rangeMatch) {
          const start = parseInt(rangeMatch[1], 10);
          const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : start + 10 * 1024 * 1024; // Default 10MB if no end

          data = await readFileRangeCached(filePath, start, end);
        } else {
          // No valid range header, load initial chunk (2MB) for metadata parsing
          // The demuxer will request additional ranges as needed
          data = await readFileRangeCached(filePath, 0, 2 * 1024 * 1024 - 1);
        }
      } else {
        // FALLBACK: Use fetch (for non-cached URLs or when path not found)
        const headers: HeadersInit = {};
        if (request.range) {
          headers['Range'] = request.range;
        }

        const response = await fetch(request.url, { headers });

        if (!response.ok && response.status !== 206) {
          throw new Error(`HTTP ${response.status}`);
        }

        data = await response.arrayBuffer();
      }

      // Send response back to Worker (transfer ArrayBuffer for zero-copy)
      const proxyResponse: FetchProxyResponse = {
        type: 'fetch-proxy-response',
        requestId: request.requestId,
        success: true,
        data,
      };
      this._worker.postMessage(proxyResponse, [data]);
    } catch (error) {
      console.error(`[FullPipelineExportWorkerClient] Proxy fetch failed:`, error);

      // Send error response back to Worker
      const proxyResponse: FetchProxyResponse = {
        type: 'fetch-proxy-response',
        requestId: request.requestId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
      this._worker.postMessage(proxyResponse);
    }
  }

  private _resolvePending(key: string, value: unknown): void {
    const pending = this._pendingRequests.get(key);
    if (pending) {
      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }
      pending.resolve(value);
      this._pendingRequests.delete(key);
    }
  }

  private async _waitForReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this._pendingRequests.delete('__ready__');
        reject(new Error('Worker ready timeout'));
      }, 30000);

      this._pendingRequests.set('__ready__', {
        resolve: () => resolve(),
        reject,
        timeout,
      });
    });
  }

  private async _sendRequest<T>(
    request: ExportWorkerRequest,
    transferables: Transferable[] = [],
    timeout = 30000
  ): Promise<T> {
    if (!this._worker) {
      throw new Error('Worker not available');
    }

    const requestKey = this._getRequestKey(request);

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this._pendingRequests.delete(requestKey);
        reject(new Error(`Request timeout: ${request.type}`));
      }, timeout);

      this._pendingRequests.set(requestKey, {
        resolve: (value) => resolve(value as T),
        reject,
        timeout: timeoutId,
      });

      if (transferables.length > 0) {
        this._worker!.postMessage(request, transferables);
      } else {
        this._worker!.postMessage(request);
      }
    });
  }

  private _getRequestKey(request: ExportWorkerRequest): string {
    switch (request.type) {
      case 'init-full-pipeline':
        return '__init__';
      case 'start-export':
        return '__export__';
      case 'submit-audio':
        return '__audio__';
      case 'cancel':
        return '__cancel__';
      default:
        return `__${request.type}__`;
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createFullPipelineExportWorkerClient(): FullPipelineExportWorkerClient {
  return new FullPipelineExportWorkerClient();
}

/**
 * Check if Full Pipeline Worker export is available
 */
export function isFullPipelineExportAvailable(): boolean {
  // Check Worker support
  if (typeof Worker === 'undefined') {
    return false;
  }

  // Check OffscreenCanvas support
  if (typeof OffscreenCanvas === 'undefined') {
    return false;
  }

  // Check VideoEncoder/VideoDecoder support
  if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined') {
    return false;
  }

  return true;
}
