/**
 * Multi-Track Export Worker Client
 *
 * Main thread client for communicating with MultiTrackExportWorker.
 * Provides Promise-based API for multi-track video/audio export.
 */

import type {
  MultiTrackExportRequest,
  MultiTrackExportResponse,
  MultiTrackExportConfig,
  SerializedProjectData,
  ExportProgressDetail,
  WorkerCapabilities,
} from './protocol/messages';

// Import worker as inline (Vite will bundle and inline it)
import MultiTrackWorkerInline from './MultiTrackExportWorker?worker&inline';

// =============================================================================
// Types
// =============================================================================

export interface MultiTrackExportClientConfig {
  /** Worker script URL (optional, uses inline worker if not provided) */
  workerUrl?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
}

export interface MultiTrackExportResult {
  /** Output MP4 data */
  outputBuffer: ArrayBuffer;
  /** File size in bytes */
  fileSize: number;
  /** Total export time in ms */
  totalTime: number;
  /** Average FPS during export */
  averageFps: number;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout?: ReturnType<typeof setTimeout>;
}

// =============================================================================
// MultiTrackExportWorkerClient
// =============================================================================

export class MultiTrackExportWorkerClient {
  private _worker: Worker | null = null;
  private _config: MultiTrackExportClientConfig;
  private _isInitialized = false;
  private _isExporting = false;
  private _capabilities: WorkerCapabilities | null = null;

  // Pending requests
  private _pendingRequests = new Map<string, PendingRequest>();

  // Callbacks
  private _onProgress: ((progress: ExportProgressDetail) => void) | null = null;
  private _onError: ((error: string) => void) | null = null;

  constructor(config: MultiTrackExportClientConfig = {}) {
    this._config = config;
  }

  // ===========================================================================
  // Properties
  // ===========================================================================

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  get isExporting(): boolean {
    return this._isExporting;
  }

  get capabilities(): WorkerCapabilities | null {
    return this._capabilities;
  }

  // ===========================================================================
  // Callbacks
  // ===========================================================================

  set onProgress(callback: ((progress: ExportProgressDetail) => void) | null) {
    this._onProgress = callback;
  }

  set onError(callback: ((error: string) => void) | null) {
    this._onError = callback;
  }

  // ===========================================================================
  // Public Methods
  // ===========================================================================

  /**
   * Initialize export worker with canvas and project data
   */
  async init(
    canvas: OffscreenCanvas,
    config: MultiTrackExportConfig,
    project: SerializedProjectData
  ): Promise<void> {
    if (this._worker) {
      throw new Error('Worker already initialized');
    }

    // Create worker
    this._worker = this._createWorker();
    this._setupMessageHandler();

    // Wait for worker ready
    const readyResponse = await this._waitForReady();
    this._capabilities = readyResponse.capabilities;

    // Send init request with canvas transfer
    const request: MultiTrackExportRequest = {
      type: 'init-multitrack',
      canvas,
      config,
      project,
    };

    const response = await this._sendRequest<{ success: boolean; error?: string }>(
      request,
      '__init__',
      [canvas],
      60000 // 60 second timeout for initialization
    );

    if (!response.success) {
      throw new Error(response.error ?? 'Worker initialization failed');
    }

    this._isInitialized = true;
  }

  /**
   * Start export process
   */
  async start(): Promise<MultiTrackExportResult> {
    if (!this._isInitialized) {
      throw new Error('Worker not initialized');
    }

    if (this._isExporting) {
      throw new Error('Export already in progress');
    }

    this._isExporting = true;

    try {
      const request: MultiTrackExportRequest = { type: 'start-export' };

      const response = await this._sendRequest<MultiTrackExportResult>(
        request,
        '__complete__',
        [],
        0 // No timeout for export (can take a long time)
      );

      return response;
    } finally {
      this._isExporting = false;
    }
  }

  /**
   * Pause export
   */
  pause(): void {
    if (!this._worker || !this._isExporting) return;

    const request: MultiTrackExportRequest = { type: 'pause-export' };
    this._worker.postMessage(request);
  }

  /**
   * Resume export
   */
  resume(): void {
    if (!this._worker || !this._isExporting) return;

    const request: MultiTrackExportRequest = { type: 'resume-export' };
    this._worker.postMessage(request);
  }

  /**
   * Cancel export
   */
  cancel(): void {
    if (!this._worker) return;

    const request: MultiTrackExportRequest = { type: 'cancel-export' };
    this._worker.postMessage(request);

    this._isExporting = false;

    // Reject pending complete request
    const pending = this._pendingRequests.get('__complete__');
    if (pending) {
      pending.reject(new Error('Export cancelled'));
      this._pendingRequests.delete('__complete__');
    }
  }

  /**
   * Terminate worker and cleanup
   */
  terminate(): void {
    if (!this._worker) return;

    const request: MultiTrackExportRequest = { type: 'terminate' };
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
    this._isExporting = false;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private _createWorker(): Worker {
    if (this._config.workerUrl) {
      return new Worker(this._config.workerUrl, { type: 'module' });
    }

    // Use Vite's inline worker
    return new MultiTrackWorkerInline();
  }

  private _setupMessageHandler(): void {
    if (!this._worker) return;

    this._worker.onmessage = (event: MessageEvent<MultiTrackExportResponse>) => {
      this._handleMessage(event.data);
    };

    this._worker.onerror = (error) => {
      console.error('[MultiTrackExportWorkerClient] Worker error:', error);
      this._onError?.(`Worker error: ${error.message}`);
    };
  }

  private _handleMessage(response: MultiTrackExportResponse): void {
    switch (response.type) {
      case 'ready':
        this._resolvePending('__ready__', response);
        break;

      case 'init-done':
        this._resolvePending('__init__', response);
        break;

      case 'progress':
        this._onProgress?.(response.progress);
        break;

      case 'complete':
        this._resolvePending('__complete__', response);
        break;

      case 'paused':
        // Could emit event if needed
        break;

      case 'resumed':
        // Could emit event if needed
        break;

      case 'cancelled':
        this._resolvePending('__cancelled__', response);
        break;

      case 'error':
        console.error('[MultiTrackExportWorkerClient] Worker error:', response.error);
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

  private async _waitForReady(): Promise<{ capabilities: WorkerCapabilities }> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this._pendingRequests.delete('__ready__');
        reject(new Error('Worker ready timeout'));
      }, this._config.timeout ?? 30000);

      this._pendingRequests.set('__ready__', {
        resolve: (value) => resolve(value as { capabilities: WorkerCapabilities }),
        reject,
        timeout,
      });
    });
  }

  private async _sendRequest<T>(
    request: MultiTrackExportRequest,
    responseKey: string,
    transferables: Transferable[] = [],
    timeout?: number
  ): Promise<T> {
    if (!this._worker) {
      throw new Error('Worker not available');
    }

    return new Promise((resolve, reject) => {
      const timeoutMs = timeout ?? this._config.timeout ?? 30000;

      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      if (timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          this._pendingRequests.delete(responseKey);
          reject(new Error(`Request timeout: ${request.type}`));
        }, timeoutMs);
      }

      this._pendingRequests.set(responseKey, {
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
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create Multi-Track Export Worker client
 */
export function createMultiTrackExportClient(
  config?: MultiTrackExportClientConfig
): MultiTrackExportWorkerClient {
  return new MultiTrackExportWorkerClient(config);
}

/**
 * Check if Multi-Track Worker export is available
 */
export function isMultiTrackExportAvailable(): boolean {
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
