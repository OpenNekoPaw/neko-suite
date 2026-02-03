/**
 * Video Decoder Worker
 *
 * Runs WebCodecs video decoding in a Web Worker to avoid blocking the main thread.
 * Supports zero-copy VideoFrame transfer via Transferable.
 *
 * @module
 */

import type {
  VideoWorkerRequest,
  VideoWorkerResponse,
  VideoDecoderWorkerConfig,
  VideoMediaInfo,
} from './types';

// =============================================================================
// Types
// =============================================================================

interface BufferedFrame {
  frame: VideoFrame;
  timestamp: number;
}

interface DecoderState {
  config: VideoDecoderWorkerConfig;
  decoder: VideoDecoder | null;
  mediaInfo: VideoMediaInfo | null;
  frameBuffer: BufferedFrame[];
  pendingRequests: Map<number, (frame: VideoFrame | null) => void>;
  isOpen: boolean;
  currentTime: number;
}

// =============================================================================
// Worker State
// =============================================================================

const decoders = new Map<string, DecoderState>();

const DEFAULT_MAX_BUFFER_SIZE = 30;
const FRAME_TOLERANCE_FACTOR = 0.5;

// =============================================================================
// Response Helper
// =============================================================================

function postResponse(response: VideoWorkerResponse, transfer?: Transferable[]): void {
  if (transfer && transfer.length > 0) {
    (self as unknown as Worker).postMessage(response, transfer);
  } else {
    self.postMessage(response);
  }
}

function postError(id: string, error: unknown): void {
  postResponse({
    type: 'error',
    id,
    error: error instanceof Error ? error.message : String(error),
  });
}

// =============================================================================
// Decoder Operations
// =============================================================================

async function initDecoder(id: string, config: VideoDecoderWorkerConfig): Promise<void> {
  const state: DecoderState = {
    config,
    decoder: null,
    mediaInfo: null,
    frameBuffer: [],
    pendingRequests: new Map(),
    isOpen: false,
    currentTime: 0,
  };
  decoders.set(id, state);
  postResponse({ type: 'init:done', id });
}

async function openDecoder(id: string): Promise<void> {
  const state = decoders.get(id);
  if (!state) throw new Error(`Decoder ${id} not found`);

  // Fetch video file
  const response = await fetch(state.config.source);
  if (!response.ok) {
    throw new Error(`Failed to fetch video: ${response.statusText}`);
  }

  // Store buffer for future MP4 parsing (will use mp4box.js)
  const _videoBuffer = await response.arrayBuffer();

  // TODO: Parse MP4 using mp4box.js to get actual video info
  // For now, create a placeholder media info
  // In production, this would extract codec, dimensions, fps from the container
  console.debug('[VideoWorker] Loaded video buffer:', _videoBuffer.byteLength, 'bytes');

  const mediaInfo: VideoMediaInfo = {
    duration: 10, // Placeholder
    width: 1920,
    height: 1080,
    fps: 30,
    codec: 'avc1.64001f',
  };

  state.mediaInfo = mediaInfo;
  state.isOpen = true;

  // Initialize WebCodecs decoder
  state.decoder = new VideoDecoder({
    output: (frame: VideoFrame) => {
      handleDecodedFrame(state, frame);
    },
    error: (error: DOMException) => {
      console.error('[VideoWorker] Decoder error:', error);
    },
  });

  // Configure decoder
  state.decoder.configure({
    codec: mediaInfo.codec,
    codedWidth: mediaInfo.width,
    codedHeight: mediaInfo.height,
    optimizeForLatency: true,
  });

  postResponse({ type: 'open:done', id, mediaInfo });
}

function handleDecodedFrame(state: DecoderState, frame: VideoFrame): void {
  const timestamp = frame.timestamp / 1_000_000;
  const fps = state.mediaInfo?.fps ?? 30;
  const tolerance = (1 / fps) * FRAME_TOLERANCE_FACTOR;

  // Check if this frame satisfies a pending request
  for (const [requestTime, resolve] of state.pendingRequests.entries()) {
    if (Math.abs(timestamp - requestTime) <= tolerance) {
      state.pendingRequests.delete(requestTime);
      resolve(frame); // Transfer ownership
      return;
    }
  }

  // Add to buffer
  addToBuffer(state, frame, timestamp);
}

function addToBuffer(state: DecoderState, frame: VideoFrame, timestamp: number): void {
  const maxBufferSize = state.config.maxBufferSize ?? DEFAULT_MAX_BUFFER_SIZE;

  // Check for duplicate
  const existingIndex = state.frameBuffer.findIndex(
    f => Math.abs(f.timestamp - timestamp) < 0.001
  );

  if (existingIndex >= 0) {
    const old = state.frameBuffer[existingIndex];
    if (old) {
      try { old.frame.close(); } catch { /* ignore */ }
    }
    state.frameBuffer[existingIndex] = { frame, timestamp };
  } else {
    state.frameBuffer.push({ frame, timestamp });
    state.frameBuffer.sort((a, b) => a.timestamp - b.timestamp);

    // Evict oldest if over capacity
    while (state.frameBuffer.length > maxBufferSize) {
      const evicted = state.frameBuffer.shift();
      if (evicted) {
        try { evicted.frame.close(); } catch { /* ignore */ }
      }
    }
  }
}

function findFrameInBuffer(state: DecoderState, time: number, tolerance: number): VideoFrame | null {
  for (const entry of state.frameBuffer) {
    if (Math.abs(entry.timestamp - time) <= tolerance) {
      // Clone the frame for transfer
      return entry.frame.clone();
    }
  }
  return null;
}

async function getFrame(id: string, time: number): Promise<void> {
  const state = decoders.get(id);
  if (!state || !state.isOpen) {
    postResponse({ type: 'getFrame:done', id, frame: null, timestamp: time });
    return;
  }

  const fps = state.mediaInfo?.fps ?? 30;
  const tolerance = (1 / fps) * FRAME_TOLERANCE_FACTOR;

  // Check buffer first
  const bufferedFrame = findFrameInBuffer(state, time, tolerance);
  if (bufferedFrame) {
    // Transfer frame ownership to main thread
    postResponse(
      { type: 'getFrame:done', id, frame: bufferedFrame, timestamp: time },
      [bufferedFrame]
    );
    return;
  }

  // Need to decode - for now return null
  // In production, this would trigger demuxing and decoding
  postResponse({ type: 'getFrame:done', id, frame: null, timestamp: time });
}

async function preloadRange(id: string, startTime: number, endTime: number): Promise<void> {
  const state = decoders.get(id);
  if (!state || !state.isOpen) {
    postResponse({ type: 'preload:done', id, frameCount: 0 });
    return;
  }

  // Simplified preload - in production this would demux and decode
  const fps = state.mediaInfo?.fps ?? 30;
  const frameCount = Math.ceil((endTime - startTime) * fps);

  postResponse({ type: 'preload:done', id, frameCount });
}

function clearBuffer(id: string): void {
  const state = decoders.get(id);
  if (!state) {
    postResponse({ type: 'clearBuffer:done', id });
    return;
  }

  for (const entry of state.frameBuffer) {
    try { entry.frame.close(); } catch { /* ignore */ }
  }
  state.frameBuffer = [];

  postResponse({ type: 'clearBuffer:done', id });
}

async function closeDecoder(id: string): Promise<void> {
  const state = decoders.get(id);
  if (!state) {
    postResponse({ type: 'close:done', id });
    return;
  }

  // Close decoder
  if (state.decoder) {
    try {
      await state.decoder.flush();
      state.decoder.close();
    } catch { /* ignore */ }
  }

  // Clear buffer
  for (const entry of state.frameBuffer) {
    try { entry.frame.close(); } catch { /* ignore */ }
  }

  // Reject pending requests
  for (const resolve of state.pendingRequests.values()) {
    resolve(null);
  }

  decoders.delete(id);
  postResponse({ type: 'close:done', id });
}

// =============================================================================
// Message Handler
// =============================================================================

self.onmessage = async (event: MessageEvent<VideoWorkerRequest>) => {
  const msg = event.data;
  const id = 'id' in msg ? msg.id : '';

  try {
    switch (msg.type) {
      case 'init':
        await initDecoder(msg.id, msg.config);
        break;
      case 'open':
        await openDecoder(msg.id);
        break;
      case 'close':
        await closeDecoder(msg.id);
        break;
      case 'getFrame':
        await getFrame(msg.id, msg.time);
        break;
      case 'preload':
        await preloadRange(msg.id, msg.startTime, msg.endTime);
        break;
      case 'clearBuffer':
        clearBuffer(msg.id);
        break;
      case 'terminate':
        // Cleanup all decoders
        for (const [decoderId] of decoders) {
          await closeDecoder(decoderId);
        }
        self.close();
        break;
    }
  } catch (error) {
    postError(id, error);
  }
};

// Notify ready
postResponse({ type: 'init:done', id: '__worker_ready__' });
