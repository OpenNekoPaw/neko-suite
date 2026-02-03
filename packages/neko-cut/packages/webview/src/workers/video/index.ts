/**
 * Video Decoder Worker Module
 *
 * Provides worker-based video decoding to avoid blocking the main thread.
 * Supports zero-copy VideoFrame transfer via Transferable.
 *
 * @example
 * ```typescript
 * import { createWorkerVideoDecoder } from '@neko/webview/workers/video';
 *
 * const decoder = createWorkerVideoDecoder({ source: videoUrl });
 * await decoder.open();
 *
 * // Get frame at specific time (zero-copy transfer from worker)
 * const frame = await decoder.getFrameAt(1.5);
 * if (frame) {
 *   // Use frame for rendering
 *   ctx.drawImage(frame, 0, 0);
 *   frame.close();
 * }
 *
 * await decoder.close();
 * ```
 *
 * @module
 */

export type {
  VideoWorkerRequest,
  VideoWorkerResponse,
  VideoDecoderWorkerConfig,
  VideoMediaInfo,
  PendingVideoRequest,
  VideoWorkerClientConfig,
} from './types';

export {
  WorkerVideoDecoder,
  createWorkerVideoDecoder,
  terminateVideoWorker,
} from './VideoDecoderWorkerClient';
