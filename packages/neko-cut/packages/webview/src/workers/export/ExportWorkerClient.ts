/**
 * Export Worker Client
 *
 * Main thread client for communicating with Export Worker.
 * Provides Promise-based API for export operations.
 */

import type {
  ExportWorkerRequest,
  ExportWorkerResponse,
  ExportWorkerConfig,
  ExportWorkerClientConfig,
  PendingExportRequest,
  FrameTransform,
} from './types';
import type { ExportProgress } from '../../utils/export/IExportEngine';

// Import worker as inline (Vite will bundle and inline it)
import ExportWorkerInline from './ExportWorker?worker&inline';

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_TIMEOUT = 30000; // 30 seconds

// =============================================================================
// ExportWorkerClient
// =============================================================================

/**
 * Client for Export Worker communication
 */
export class ExportWorkerClient {
  private _worker: Worker | null = null;
  private _config: ExportWorkerClientConfig;
  private _isInitialized = false;
  private _pendingRequests = new Map<string, PendingExportRequest>();
  private _requestId = 0;

  // Callbacks
  private _onProgress: ((progress: ExportProgress) => void) | null = null;
  private _onError: ((error: string) => void) | null = null;

  constructor(config: ExportWorkerClientConfig = {}) {
    this._config = config;
  }

  // ===========================================================================
  // Properties
  // ===========================================================================

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  // ===========================================================================
  // Callbacks
  // ===========================================================================

  /**
   * Set progress callback
   */
  set onProgress(callback: ((progress: ExportProgress) => void) | null) {
    this._onProgress = callback;
  }

  /**
   * Set error callback
   */
  set onError(callback: ((error: string) => void) | null) {
    this._onError = callback;
  }

  // ===========================================================================
  // Public Methods
  // ===========================================================================

  /**
   * Initialize export worker with OffscreenCanvas
   */
  async init(canvas: OffscreenCanvas, config: ExportWorkerConfig): Promise<void> {
    if (this._worker) {
      throw new Error('Worker already initialized');
    }

    // Create worker
    this._worker = this._createWorker();
    this._setupMessageHandler();

    // Wait for worker ready
    await this._waitForReady();

    // Send init request with canvas transfer
    const request: ExportWorkerRequest = {
      type: 'init',
      canvas,
      config,
    };

    const response = await this._sendRequest<{ success: boolean; error?: string }>(
      request,
      [canvas]
    );

    if (!response.success) {
      throw new Error(response.error ?? 'Worker initialization failed');
    }

    this._isInitialized = true;
  }

  /**
   * Submit a video frame for rendering and encoding
   */
  async submitFrame(
    frameIndex: number,
    timeInSeconds: number,
    videoFrames: Array<{ elementId: string; frame: VideoFrame; transform: FrameTransform }>
  ): Promise<void> {
    if (!this._isInitialized) {
      throw new Error('Worker not initialized');
    }

    const request: ExportWorkerRequest = {
      type: 'submit-frame',
      frameIndex,
      timeInSeconds,
      videoFrames,
    };

    // Transfer VideoFrames
    const transferables = videoFrames.map(f => f.frame);

    await this._sendRequest(request, transferables);
  }

  /**
   * Submit audio data for encoding
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

    // Transfer audio buffer
    await this._sendRequest(request, [audioBuffer.buffer]);
  }

  /**
   * Finalize export and get result
   */
  async finalize(): Promise<{
    outputBuffer: ArrayBuffer;
    fileSize: number;
    totalTime: number;
    averageFps: number;
  }> {
    if (!this._isInitialized) {
      throw new Error('Worker not initialized');
    }

    const request: ExportWorkerRequest = { type: 'finalize' };

    const response = await this._sendRequest<{
      outputBuffer: ArrayBuffer;
      fileSize: number;
      totalTime: number;
      averageFps: number;
    }>(request, [], 120000); // 2 minute timeout for finalize

    return response;
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

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private _createWorker(): Worker {
    // Use provided URL or create inline worker
    if (this._config.workerUrl) {
      return new Worker(this._config.workerUrl, { type: 'module' });
    }

    // Use Vite's inline worker (bundled as base64, avoids CORS issues in VSCode webview)
    return new ExportWorkerInline();
  }

  private _setupMessageHandler(): void {
    if (!this._worker) return;

    this._worker.onmessage = (event: MessageEvent<ExportWorkerResponse>) => {
      this._handleMessage(event.data);
    };

    this._worker.onerror = (error) => {
      console.error('[ExportWorkerClient] Worker error:', error);
      this._onError?.(`Worker error: ${error.message}`);
    };
  }

  private _handleMessage(response: ExportWorkerResponse): void {
    switch (response.type) {
      case 'ready':
        // Worker is ready
        this._resolvePending('__ready__', response);
        break;

      case 'init:done':
        this._resolvePending('__init__', response);
        break;

      case 'frame:encoded':
        this._resolvePending(`frame:${response.frameIndex}`, response);
        break;

      case 'audio:encoded':
        this._resolvePending('__audio__', response);
        break;

      case 'progress':
        this._onProgress?.(response.progress);
        break;

      case 'complete':
        this._resolvePending('__finalize__', response);
        break;

      case 'cancelled':
        this._resolvePending('__cancel__', response);
        break;

      case 'error':
        console.error('[ExportWorkerClient] Worker error:', response.error);
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
      }, this._config.timeout ?? DEFAULT_TIMEOUT);

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
    timeout?: number
  ): Promise<T> {
    if (!this._worker) {
      throw new Error('Worker not available');
    }

    const requestKey = this._getRequestKey(request);

    return new Promise((resolve, reject) => {
      const timeoutMs = timeout ?? this._config.timeout ?? DEFAULT_TIMEOUT;
      const timeoutId = setTimeout(() => {
        this._pendingRequests.delete(requestKey);
        reject(new Error(`Request timeout: ${request.type}`));
      }, timeoutMs);

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
      case 'init':
        return '__init__';
      case 'submit-frame':
        return `frame:${request.frameIndex}`;
      case 'submit-audio':
        return '__audio__';
      case 'finalize':
        return '__finalize__';
      case 'cancel':
        return '__cancel__';
      default:
        return `__${this._requestId++}__`;
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create Export Worker client
 */
export function createExportWorkerClient(
  config?: ExportWorkerClientConfig
): ExportWorkerClient {
  return new ExportWorkerClient(config);
}

/**
 * Check if Worker export is available
 */
export function isWorkerExportAvailable(): boolean {
  // Check Worker support
  if (typeof Worker === 'undefined') {
    return false;
  }

  // Check OffscreenCanvas support
  if (typeof OffscreenCanvas === 'undefined') {
    return false;
  }

  // Check VideoEncoder support
  if (typeof VideoEncoder === 'undefined') {
    return false;
  }

  return true;
}
