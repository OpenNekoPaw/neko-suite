/**
 * Video Decoder Worker Client
 *
 * Main thread client for communicating with the Video Decoder Worker.
 * Provides zero-copy VideoFrame transfer via Transferable.
 *
 * @module
 */

import type {
  VideoWorkerRequest,
  VideoWorkerResponse,
  VideoDecoderWorkerConfig,
  VideoMediaInfo,
  PendingVideoRequest,
  VideoWorkerClientConfig,
} from './types';

// =============================================================================
// Worker Manager (Singleton)
// =============================================================================

let workerInstance: Worker | null = null;
let workerReadyPromise: Promise<void> | null = null;
const pendingRequests = new Map<string, PendingVideoRequest>();
let requestIdCounter = 0;

/**
 * Get or create the shared video worker instance
 */
function getWorker(config?: VideoWorkerClientConfig): Worker {
  if (!workerInstance) {
    const workerUrl = config?.workerUrl ?? new URL('./VideoDecoderWorker.ts', import.meta.url);
    workerInstance = new Worker(workerUrl, { type: 'module' });

    workerInstance.onmessage = handleWorkerMessage;
    workerInstance.onerror = handleWorkerError;

    workerReadyPromise = new Promise((resolve) => {
      const readyHandler = (event: MessageEvent<VideoWorkerResponse>) => {
        if (event.data.type === 'init:done' && event.data.id === '__worker_ready__') {
          resolve();
        }
      };
      workerInstance!.addEventListener('message', readyHandler, { once: true });
    });
  }
  return workerInstance;
}

async function waitForWorkerReady(): Promise<void> {
  if (workerReadyPromise) {
    await workerReadyPromise;
  }
}

function generateRequestId(): string {
  return `vreq_${++requestIdCounter}_${Date.now()}`;
}

function sendRequest<T>(
  request: VideoWorkerRequest,
  timeout = 5000
): Promise<T> {
  const worker = getWorker();
  const id = 'id' in request ? request.id : generateRequestId();

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`Video worker request timeout: ${request.type}`));
    }, timeout);

    pendingRequests.set(id, {
      resolve: (value) => {
        clearTimeout(timeoutId);
        resolve(value as T);
      },
      reject: (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    });

    worker.postMessage(request);
  });
}

function handleWorkerMessage(event: MessageEvent<VideoWorkerResponse>): void {
  const response = event.data;
  const id = 'id' in response ? response.id : '';

  const pending = pendingRequests.get(id);
  if (!pending) return;

  pendingRequests.delete(id);

  if (response.type === 'error') {
    pending.reject(new Error(response.error));
    return;
  }

  switch (response.type) {
    case 'open:done':
      pending.resolve(response.mediaInfo);
      break;
    case 'getFrame:done':
      pending.resolve({ frame: response.frame, timestamp: response.timestamp });
      break;
    case 'preload:done':
      pending.resolve(response.frameCount);
      break;
    default:
      pending.resolve(undefined);
  }
}

function handleWorkerError(event: ErrorEvent): void {
  console.error('[VideoWorkerClient] Worker error:', event.error);
  for (const [id, pending] of pendingRequests) {
    pending.reject(new Error(`Worker error: ${event.message}`));
    pendingRequests.delete(id);
  }
}

// =============================================================================
// Worker Video Decoder
// =============================================================================

/**
 * Video decoder that delegates to the Video Worker
 * Provides zero-copy VideoFrame transfer
 */
export class WorkerVideoDecoder {
  private _id: string;
  private _config: VideoDecoderWorkerConfig;
  private _mediaInfo: VideoMediaInfo | null = null;
  private _isOpen = false;

  constructor(config: VideoDecoderWorkerConfig) {
    this._id = `vdec_${generateRequestId()}`;
    this._config = config;
  }

  get mediaInfo(): VideoMediaInfo | null {
    return this._mediaInfo;
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  async open(): Promise<VideoMediaInfo> {
    await waitForWorkerReady();

    await sendRequest({ type: 'init', id: this._id, config: this._config });
    this._mediaInfo = await sendRequest<VideoMediaInfo>({ type: 'open', id: this._id });
    this._isOpen = true;

    return this._mediaInfo;
  }

  async close(): Promise<void> {
    await sendRequest({ type: 'close', id: this._id });
    this._isOpen = false;
    this._mediaInfo = null;
  }

  /**
   * Get a video frame at the specified time
   * Returns a VideoFrame that has been transferred from the worker (zero-copy)
   */
  async getFrameAt(time: number): Promise<VideoFrame | null> {
    if (!this._isOpen) {
      await this.open();
    }

    const result = await sendRequest<{ frame: VideoFrame | null; timestamp: number }>({
      type: 'getFrame',
      id: this._id,
      time,
    });

    return result.frame;
  }

  /**
   * Preload frames in a time range
   */
  async preloadRange(startTime: number, endTime: number): Promise<number> {
    return sendRequest<number>({
      type: 'preload',
      id: this._id,
      startTime,
      endTime,
    });
  }

  /**
   * Clear the frame buffer
   */
  async clearBuffer(): Promise<void> {
    await sendRequest({ type: 'clearBuffer', id: this._id });
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a worker-based video decoder
 */
export function createWorkerVideoDecoder(config: VideoDecoderWorkerConfig): WorkerVideoDecoder {
  return new WorkerVideoDecoder(config);
}

/**
 * Terminate the shared video worker
 */
export function terminateVideoWorker(): void {
  if (workerInstance) {
    workerInstance.postMessage({ type: 'terminate' });
    workerInstance.terminate();
    workerInstance = null;
    workerReadyPromise = null;
  }
}
