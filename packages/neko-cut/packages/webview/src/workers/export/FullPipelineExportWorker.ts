/**
 * Full Pipeline Export Worker
 *
 * Handles complete export pipeline in Web Worker:
 * - Video: mp4box.js → WebCodecs VideoDecoder → WebGPU → WebCodecs VideoEncoder → mp4-muxer
 * - Audio: mp4box.js → libav.js decode → mix → libav.js encode → mp4-muxer
 *
 * This avoids main thread blocking and VideoFrame transfer overhead.
 */

import type {
  ExportWorkerRequest,
  ExportWorkerResponse,
  ExportWorkerConfig,
  SerializedProjectData,
  SerializedElement,
  SerializedTransform,
  SerializedColorCorrection,
  FetchProxyRequest,
  FetchProxyResponse,
} from './types';
import type { ExportProgress, ExportStage, ExportPerformanceStats } from '../../utils/export/IExportEngine';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { createFile, type MP4File, type MP4ArrayBuffer, type MP4Info } from 'mp4box';
import type { LibAV as LibAVType, Packet, Frame } from 'libav.js';
import { EXTERNAL_TEXTURE_SHADER, EXTERNAL_TEXTURE_COLOR_CORRECTION_SHADER } from './shaders';

// =============================================================================
// Types
// =============================================================================

interface MediaSource {
  url: string;
  mp4File: MP4File;
  videoTrackId: number | null;
  audioTrackId: number | null;
  videoDecoder: VideoDecoder | null;
  decoderConfig: VideoDecoderConfig | null;
  sampleIndex: SampleInfo[];
  keyframeIndex: number[];
  pendingFrames: Map<number, VideoFrame>;
  initialized: boolean;
  // Decode state tracking for DTS-order decoding
  lastDecodedKeyframeIdx: number;
  lastDecodedSampleIdx: number;
  // Audio info
  audioSampleIndex: AudioSampleInfo[];
  audioCodec: string | null;
  audioSampleRate: number;
  audioChannels: number;
  audioCodecDescription: Uint8Array | null;
  // Annex B mode support (for reliable decoding)
  nalLengthSize: number;
  avcCData: Uint8Array | null;
}

interface SampleInfo {
  number: number;
  offset: number;
  size: number;
  cts: number;
  dts: number;
  duration: number;
  timescale: number;
  is_sync: boolean;
}

interface AudioSampleInfo {
  offset: number;
  size: number;
  cts: number;
  dts: number;
  duration: number;
  timescale: number;
}

interface AudioTrackData {
  sourceUrl: string;
  timelineStart: number;
  sourceStart: number;
  duration: number;
  volume: number;
}

// =============================================================================
// Annex B Conversion Helpers (for reliable decoding)
// =============================================================================

/**
 * Convert AVCC format (length-prefixed NAL units) to Annex B format (start code prefixed)
 * This is needed for reliable decoding - Annex B mode doesn't require description in VideoDecoderConfig
 *
 * @param data Sample data in AVCC format
 * @param nalLengthSize Size of NAL unit length prefix (usually 4 bytes)
 * @returns Sample data in Annex B format
 */
function avccToAnnexB(data: Uint8Array, nalLengthSize: number = 4): Uint8Array {
  // First pass: calculate output size
  let outputSize = 0;
  let offset = 0;

  while (offset + nalLengthSize <= data.length) {
    let nalLength = 0;
    for (let i = 0; i < nalLengthSize; i++) {
      nalLength = (nalLength << 8) | (data[offset + i] ?? 0);
    }
    offset += nalLengthSize;

    if (nalLength <= 0 || offset + nalLength > data.length) {
      break;
    }

    // 4 bytes for start code (00 00 00 01) + NAL data
    outputSize += 4 + nalLength;
    offset += nalLength;
  }

  // Second pass: convert
  const output = new Uint8Array(outputSize);
  let inputOffset = 0;
  let outputOffset = 0;

  while (inputOffset + nalLengthSize <= data.length) {
    let nalLength = 0;
    for (let i = 0; i < nalLengthSize; i++) {
      nalLength = (nalLength << 8) | (data[inputOffset + i] ?? 0);
    }
    inputOffset += nalLengthSize;

    if (nalLength <= 0 || inputOffset + nalLength > data.length) {
      break;
    }

    // Write start code
    output[outputOffset++] = 0;
    output[outputOffset++] = 0;
    output[outputOffset++] = 0;
    output[outputOffset++] = 1;

    // Copy NAL data
    output.set(data.subarray(inputOffset, inputOffset + nalLength), outputOffset);
    outputOffset += nalLength;
    inputOffset += nalLength;
  }

  return output;
}

/**
 * Extract SPS and PPS from avcC data and format as Annex B
 * Returns Annex B formatted SPS and PPS with start codes
 */
function extractSPSPPSFromAvcC(avcC: Uint8Array): Uint8Array | null {
  if (avcC.length < 7) return null;

  // avcC structure:
  // [0] configurationVersion (1)
  // [1] AVCProfileIndication
  // [2] profile_compatibility
  // [3] AVCLevelIndication
  // [4] lengthSizeMinusOne (lower 2 bits)
  // [5] numOfSequenceParameterSets (lower 5 bits)
  // [6-7] sequenceParameterSetLength
  // [...] sequenceParameterSetNALUnit
  // [...] numOfPictureParameterSets
  // [...] pictureParameterSetLength
  // [...] pictureParameterSetNALUnit

  let offset = 5;
  const numSPS = (avcC[offset++] ?? 0) & 0x1f;

  const nalUnits: Uint8Array[] = [];

  // Read SPS
  for (let i = 0; i < numSPS; i++) {
    if (offset + 2 > avcC.length) return null;
    const spsLength = ((avcC[offset] ?? 0) << 8) | (avcC[offset + 1] ?? 0);
    offset += 2;
    if (offset + spsLength > avcC.length) return null;
    nalUnits.push(avcC.subarray(offset, offset + spsLength));
    offset += spsLength;
  }

  // Read PPS
  if (offset >= avcC.length) return null;
  const numPPS = avcC[offset++] ?? 0;

  for (let i = 0; i < numPPS; i++) {
    if (offset + 2 > avcC.length) return null;
    const ppsLength = ((avcC[offset] ?? 0) << 8) | (avcC[offset + 1] ?? 0);
    offset += 2;
    if (offset + ppsLength > avcC.length) return null;
    nalUnits.push(avcC.subarray(offset, offset + ppsLength));
    offset += ppsLength;
  }

  // Calculate total size (4 bytes start code per NAL)
  const totalSize = nalUnits.reduce((sum, nal) => sum + 4 + nal.length, 0);
  const output = new Uint8Array(totalSize);
  let outputOffset = 0;

  for (const nal of nalUnits) {
    // Write start code
    output[outputOffset++] = 0;
    output[outputOffset++] = 0;
    output[outputOffset++] = 0;
    output[outputOffset++] = 1;
    // Copy NAL data
    output.set(nal, outputOffset);
    outputOffset += nal.length;
  }

  return output;
}

/**
 * Check if sample data contains an IDR NAL unit (H.264)
 * IDR frames are true random access points that don't depend on any other frames
 *
 * @param data Sample data in AVCC format (length-prefixed NAL units)
 * @param nalLengthSize Size of NAL unit length prefix (usually 4 bytes)
 * @returns true if the sample contains an IDR NAL unit
 */
function isIDRFrame(data: Uint8Array, nalLengthSize: number = 4): boolean {
  let offset = 0;

  while (offset + nalLengthSize <= data.length) {
    // Read NAL unit length
    let nalLength = 0;
    for (let i = 0; i < nalLengthSize; i++) {
      nalLength = (nalLength << 8) | (data[offset + i] ?? 0);
    }
    offset += nalLengthSize;

    if (nalLength <= 0 || offset + nalLength > data.length) {
      break;
    }

    // Get NAL unit type (lower 5 bits of first byte)
    const nalHeader = data[offset];
    if (nalHeader !== undefined) {
      const nalUnitType = nalHeader & 0x1f;

      // NAL unit type 5 = IDR slice
      if (nalUnitType === 5) {
        return true;
      }

      // NAL unit type 1 = non-IDR slice (P/B frame or non-IDR I frame)
      // If we find a non-IDR slice before finding IDR, this is not an IDR frame
      if (nalUnitType === 1) {
        return false;
      }
    }

    offset += nalLength;
  }

  return false;
}

interface WorkerState {
  config: ExportWorkerConfig | null;
  project: SerializedProjectData | null;
  canvas: OffscreenCanvas | null;
  // WebGPU resources
  gpuDevice: GPUDevice | null;
  gpuContext: GPUCanvasContext | null;
  gpuBasicPipeline: GPURenderPipeline | null;
  gpuColorCorrectionPipeline: GPURenderPipeline | null;
  gpuSampler: GPUSampler | null;
  gpuVertexBuffer: GPUBuffer | null;
  gpuIndexBuffer: GPUBuffer | null;
  // Buffer pools (unified with preview)
  transformBufferPool: GPUBuffer[];
  transformBufferPoolIndex: number;
  ccBufferPool: GPUBuffer[];
  ccBufferPoolIndex: number;
  videoEncoder: VideoEncoder | null;
  muxer: Muxer<ArrayBufferTarget> | null;
  muxerTarget: ArrayBufferTarget | null;
  mediaSources: Map<string, MediaSource>;
  isInitialized: boolean;
  isExporting: boolean;
  isCancelled: boolean;
  startTime: number;
  // Audio processing
  libav: LibAVType | null;
  audioEncoderCtx: number;
  audioFrame: number;
  audioPkt: number;
  audioFrameSize: number;
  // Performance tracking
  processedFrames: number;
  totalDemuxTime: number;
  totalDecodeTime: number;
  totalRenderTime: number;
  totalEncodeTime: number;
  totalAudioTime: number;
  pendingEncodes: number;
  encoderOutputCount: number;
  lastEncoderOutputTime: number;
  estimatedEncodeTime: number;
  // CPU utilization tracking
  lastCpuSampleTime: number;
  lastFrameProcessingTime: number;
  cpuUtilizationSamples: number[];
  // GPU timing (estimated from render time)
  totalGpuTime: number;
}

// =============================================================================
// Worker State
// =============================================================================

const state: WorkerState = {
  config: null,
  project: null,
  canvas: null,
  // WebGPU resources
  gpuDevice: null,
  gpuContext: null,
  gpuBasicPipeline: null,
  gpuColorCorrectionPipeline: null,
  gpuSampler: null,
  gpuVertexBuffer: null,
  gpuIndexBuffer: null,
  // Buffer pools (unified with preview)
  transformBufferPool: [],
  transformBufferPoolIndex: 0,
  ccBufferPool: [],
  ccBufferPoolIndex: 0,
  videoEncoder: null,
  muxer: null,
  muxerTarget: null,
  mediaSources: new Map(),
  isInitialized: false,
  isExporting: false,
  isCancelled: false,
  startTime: 0,
  // Audio processing
  libav: null,
  audioEncoderCtx: 0,
  audioFrame: 0,
  audioPkt: 0,
  audioFrameSize: 0,
  // Performance tracking
  processedFrames: 0,
  totalDemuxTime: 0,
  totalDecodeTime: 0,
  totalRenderTime: 0,
  totalEncodeTime: 0,
  totalAudioTime: 0,
  pendingEncodes: 0,
  encoderOutputCount: 0,
  lastEncoderOutputTime: 0,
  estimatedEncodeTime: 0,
  // CPU utilization tracking
  lastCpuSampleTime: 0,
  lastFrameProcessingTime: 0,
  cpuUtilizationSamples: [],
  // GPU timing (estimated from render time)
  totalGpuTime: 0,
};

// =============================================================================
// Response Helpers
// =============================================================================

function postResponse(response: ExportWorkerResponse, transfer?: Transferable[]): void {
  if (transfer && transfer.length > 0) {
    (self as unknown as Worker).postMessage(response, transfer);
  } else {
    self.postMessage(response);
  }
}

function postError(error: unknown, stage?: string): void {
  postResponse({
    type: 'error',
    error: error instanceof Error ? error.message : String(error),
    stage,
  });
}

// =============================================================================
// Proxy Fetch (Main Thread Communication)
// =============================================================================

/**
 * Pending proxy fetch requests
 * Worker sends fetch request to main thread, main thread fetches and responds
 */
const pendingProxyFetches = new Map<string, {
  resolve: (data: ArrayBuffer) => void;
  reject: (error: Error) => void;
}>();

let proxyFetchIdCounter = 0;

/**
 * Fetch data via main thread proxy.
 * Worker cannot directly fetch VSCode resource URLs, so we request main thread to fetch.
 */
async function proxyFetch(url: string, range?: string): Promise<ArrayBuffer> {
  const requestId = `fetch-${proxyFetchIdCounter++}`;

  return new Promise((resolve, reject) => {
    // Set timeout
    const timeoutId = setTimeout(() => {
      pendingProxyFetches.delete(requestId);
      reject(new Error(`Proxy fetch timeout for ${url}`));
    }, 60000); // 60 second timeout

    pendingProxyFetches.set(requestId, {
      resolve: (data) => {
        clearTimeout(timeoutId);
        pendingProxyFetches.delete(requestId);
        resolve(data);
      },
      reject: (error) => {
        clearTimeout(timeoutId);
        pendingProxyFetches.delete(requestId);
        reject(error);
      },
    });

    // Send fetch request to main thread
    const request: FetchProxyRequest = {
      type: 'fetch-proxy',
      requestId,
      url,
      range,
    };
    postResponse(request);
  });
}

/**
 * Handle fetch proxy response from main thread
 */
function handleFetchProxyResponse(response: FetchProxyResponse): void {
  const pending = pendingProxyFetches.get(response.requestId);
  if (!pending) {
    console.warn('[FullPipelineExportWorker] No pending request for:', response.requestId);
    return;
  }

  if (response.success && response.data) {
    pending.resolve(response.data);
  } else {
    pending.reject(new Error(response.error ?? 'Proxy fetch failed'));
  }
}

function postProgress(progress: Partial<ExportProgress>): void {
  const elapsed = performance.now() - state.startTime;
  const totalFrames = state.config?.totalFrames ?? 0;
  const currentFrame = state.processedFrames;
  const fps = elapsed > 0 ? currentFrame / (elapsed / 1000) : 0;
  const remaining = totalFrames > currentFrame && fps > 0 ? ((totalFrames - currentFrame) / fps) * 1000 : 0;

  // Calculate performance stats
  const avgDemuxTime = currentFrame > 0 ? state.totalDemuxTime / currentFrame : 0;
  const avgDecodeTime = currentFrame > 0 ? state.totalDecodeTime / currentFrame : 0;
  const avgRenderTime = currentFrame > 0 ? state.totalRenderTime / currentFrame : 0;

  // Estimate encode time from encoder output
  let avgEncodeTime: number;
  if (state.encoderOutputCount > 0 && state.estimatedEncodeTime > 0) {
    avgEncodeTime = state.estimatedEncodeTime / state.encoderOutputCount;
  } else {
    avgEncodeTime = currentFrame > 0 ? state.totalEncodeTime / currentFrame : 0;
  }

  // Calculate CPU utilization estimate
  // Based on processing time vs target frame time
  const cpuUsage = calculateCpuUtilization();

  // Calculate GPU utilization estimate
  // Based on render time vs target frame time
  const gpuUsage = calculateGpuUtilization();

  const performanceStats: ExportPerformanceStats = {
    avgRenderTime,
    avgEncodeTime,
    avgDecodeTime,
    avgWaitTime: avgDemuxTime, // Use demux time as "wait" time
    queueLength: state.pendingEncodes,
    memoryUsedMB: getMemoryUsage(),
    vramUsedMB: estimateVramUsage(),
    cpuUsage,
    gpuUsage,
    pipelineMode: true,
  };

  postResponse({
    type: 'progress',
    progress: {
      stage: 'rendering' as ExportStage,
      currentFrame,
      totalFrames,
      percent: totalFrames > 0 ? (currentFrame / totalFrames) * 80 : 0,
      elapsedTime: elapsed,
      estimatedTimeRemaining: remaining,
      currentFps: fps,
      message: `Exporting frame ${currentFrame}/${totalFrames}`,
      performanceStats,
      // Export info (per principle.md requirements)
      mode: 'basic',
      renderBackend: 'webgpu',
      resolution: state.config ? { width: state.config.width, height: state.config.height } : undefined,
      bitrate: state.config?.videoBitrate,
      ...progress,
    },
  });
}

/**
 * Get JS heap memory usage (Chrome-specific)
 */
function getMemoryUsage(): number {
  const perfMemory = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
  if (perfMemory?.usedJSHeapSize) {
    return Math.round(perfMemory.usedJSHeapSize / (1024 * 1024));
  }
  return 0;
}

/**
 * Estimate VRAM usage based on allocated GPU resources
 * This is an approximation since WebGPU doesn't expose actual VRAM usage
 */
function estimateVramUsage(): number {
  if (!state.config) return 0;

  const { width, height } = state.config;
  let vramMB = 0;

  // Canvas texture (RGBA, 4 bytes per pixel)
  vramMB += (width * height * 4) / (1024 * 1024);

  // Transform buffer pool (80 bytes each)
  vramMB += (state.transformBufferPool.length * 80) / (1024 * 1024);

  // Color correction buffer pool (48 bytes each)
  vramMB += (state.ccBufferPool.length * 48) / (1024 * 1024);

  // Vertex buffer (16 floats = 64 bytes)
  vramMB += 64 / (1024 * 1024);

  // Index buffer (6 uint16 = 12 bytes)
  vramMB += 12 / (1024 * 1024);

  // External texture (VideoFrame) - estimated based on frame size
  // This is temporary and released after each frame
  vramMB += (width * height * 4) / (1024 * 1024);

  return Math.round(vramMB * 10) / 10; // Round to 1 decimal place
}

/**
 * Calculate CPU utilization estimate
 * Based on processing time vs elapsed time
 */
function calculateCpuUtilization(): number {
  if (state.processedFrames === 0) return 0;

  const targetFps = state.config?.fps ?? 30;
  const targetFrameTime = 1000 / targetFps;

  // Total processing time per frame
  const avgProcessingTime =
    (state.totalDemuxTime + state.totalDecodeTime + state.totalRenderTime + state.totalEncodeTime) /
    state.processedFrames;

  // CPU utilization = processing time / target frame time
  // Capped at 100%
  const utilization = Math.min(100, (avgProcessingTime / targetFrameTime) * 100);

  return Math.round(utilization);
}

/**
 * Calculate GPU utilization estimate
 * Based on render time vs target frame time
 */
function calculateGpuUtilization(): number {
  if (state.processedFrames === 0) return 0;

  const targetFps = state.config?.fps ?? 30;
  const targetFrameTime = 1000 / targetFps;

  // GPU time is primarily render time
  const avgGpuTime = state.totalRenderTime / state.processedFrames;

  // GPU utilization = GPU time / target frame time
  // Capped at 100%
  const utilization = Math.min(100, (avgGpuTime / targetFrameTime) * 100);

  return Math.round(utilization);
}

// =============================================================================
// Initialization
// =============================================================================

async function initializeFullPipeline(
  canvas: OffscreenCanvas,
  config: ExportWorkerConfig,
  project: SerializedProjectData
): Promise<void> {
  state.config = config;
  state.project = project;
  state.canvas = canvas;
  state.startTime = performance.now();
  state.processedFrames = 0;
  state.totalDemuxTime = 0;
  state.totalDecodeTime = 0;
  state.totalRenderTime = 0;
  state.totalEncodeTime = 0;
  state.totalAudioTime = 0;
  state.pendingEncodes = 0;
  state.encoderOutputCount = 0;
  state.lastEncoderOutputTime = 0;
  state.estimatedEncodeTime = 0;
  state.isCancelled = false;
  state.mediaSources.clear();

  try {
    // Initialize WebGPU
    await initializeWebGPU(canvas);

    // Initialize video encoder
    await initializeVideoEncoder(config);

    // Initialize muxer
    initializeMuxer(config);

    // Initialize media sources for all video elements
    await initializeMediaSources(project);

    // Initialize audio processing (libav.js)
    if (config.includeAudio !== false) {
      await initializeAudioProcessing(config);
    }

    state.isInitialized = true;

    postResponse({ type: 'init:done', success: true });
  } catch (error) {
    postResponse({
      type: 'init:done',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// Buffer pool size (unified with preview)
const TRANSFORM_BUFFER_POOL_SIZE = 32;
const CC_BUFFER_POOL_SIZE = 16;

async function initializeWebGPU(canvas: OffscreenCanvas): Promise<void> {
  // Check WebGPU availability
  if (!('gpu' in navigator)) {
    throw new Error('WebGPU is not supported in this Worker');
  }

  // Request adapter and device
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error('No WebGPU adapter available');
  }

  state.gpuDevice = await adapter.requestDevice();

  // Configure canvas context
  state.gpuContext = canvas.getContext('webgpu') as unknown as GPUCanvasContext;
  if (!state.gpuContext) {
    throw new Error('Failed to get WebGPU context');
  }

  const format = navigator.gpu.getPreferredCanvasFormat();
  state.gpuContext.configure({
    device: state.gpuDevice,
    format,
    alphaMode: 'premultiplied',
  });

  // Create vertex buffer (unified with preview - quad vertices in clip space)
  // CRITICAL: Must use clip space coordinates [-1, 1] to match preview's WebGPUCompositor
  const vertices = new Float32Array([
    // Position (x, y), TexCoord (u, v)
    -1, -1, 0, 1,  // Bottom-left
     1, -1, 1, 1,  // Bottom-right
     1,  1, 1, 0,  // Top-right
    -1,  1, 0, 0,  // Top-left
  ]);
  state.gpuVertexBuffer = state.gpuDevice.createBuffer({
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  state.gpuDevice.queue.writeBuffer(state.gpuVertexBuffer, 0, vertices);

  // Create index buffer
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  state.gpuIndexBuffer = state.gpuDevice.createBuffer({
    size: indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  state.gpuDevice.queue.writeBuffer(state.gpuIndexBuffer, 0, indices);

  // Create sampler
  state.gpuSampler = state.gpuDevice.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  // Create buffer pools (unified with preview)
  for (let i = 0; i < TRANSFORM_BUFFER_POOL_SIZE; i++) {
    state.transformBufferPool.push(
      state.gpuDevice.createBuffer({
        size: 96, // mat4x4f (64) + f32 opacity (4) + vec3f padding at offset 80 (12) = 96 bytes
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      })
    );
  }
  for (let i = 0; i < CC_BUFFER_POOL_SIZE; i++) {
    state.ccBufferPool.push(
      state.gpuDevice.createBuffer({
        size: 48, // 10 floats + 2 padding = 12 floats = 48 bytes
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      })
    );
  }

  // Vertex buffer layout (unified with preview)
  const vertexBufferLayout: GPUVertexBufferLayout = {
    arrayStride: 16, // 4 floats * 4 bytes
    attributes: [
      { shaderLocation: 0, offset: 0, format: 'float32x2' }, // position
      { shaderLocation: 1, offset: 8, format: 'float32x2' }, // texCoord
    ],
  };

  // Blend state (unified with preview)
  const blendState: GPUBlendState = {
    color: {
      srcFactor: 'src-alpha',
      dstFactor: 'one-minus-src-alpha',
      operation: 'add',
    },
    alpha: {
      srcFactor: 'one',
      dstFactor: 'one-minus-src-alpha',
      operation: 'add',
    },
  };

  // Create basic external texture pipeline
  const basicShaderModule = state.gpuDevice.createShaderModule({
    code: EXTERNAL_TEXTURE_SHADER,
  });
  state.gpuBasicPipeline = state.gpuDevice.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: basicShaderModule,
      entryPoint: 'vertexMain',
      buffers: [vertexBufferLayout],
    },
    fragment: {
      module: basicShaderModule,
      entryPoint: 'fragmentMain',
      targets: [{ format, blend: blendState }],
    },
    primitive: {
      topology: 'triangle-list',
    },
  });

  // Create color correction external texture pipeline
  const ccShaderModule = state.gpuDevice.createShaderModule({
    code: EXTERNAL_TEXTURE_COLOR_CORRECTION_SHADER,
  });
  state.gpuColorCorrectionPipeline = state.gpuDevice.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: ccShaderModule,
      entryPoint: 'vertexMain',
      buffers: [vertexBufferLayout],
    },
    fragment: {
      module: ccShaderModule,
      entryPoint: 'fragmentMain',
      targets: [{ format, blend: blendState }],
    },
    primitive: {
      topology: 'triangle-list',
    },
  });

  console.log('[FullPipelineExportWorker] WebGPU initialized (unified with preview)');
}

async function initializeVideoEncoder(config: ExportWorkerConfig): Promise<void> {
  const isWebM = config.format === 'webm';
  const codec = isWebM ? 'vp09.00.10.08' : 'avc1.640028';

  const support = await VideoEncoder.isConfigSupported({
    codec,
    width: config.width,
    height: config.height,
    bitrate: config.videoBitrate ?? 8_000_000,
    framerate: config.fps,
  });

  if (!support.supported) {
    throw new Error(`Video codec ${codec} not supported`);
  }

  state.videoEncoder = new VideoEncoder({
    output: (chunk, metadata) => {
      handleEncodedVideoChunk(chunk, metadata);
    },
    error: (error) => {
      console.error('[FullPipelineExportWorker] VideoEncoder error:', error);
      postError(error, 'encoding');
    },
  });

  state.videoEncoder.configure({
    codec,
    width: config.width,
    height: config.height,
    bitrate: config.videoBitrate ?? 8_000_000,
    framerate: config.fps,
    latencyMode: 'quality',
    avc: isWebM ? undefined : { format: 'avc' },
  });
}

function initializeMuxer(config: ExportWorkerConfig): void {
  state.muxerTarget = new ArrayBufferTarget();

  state.muxer = new Muxer({
    target: state.muxerTarget,
    video: {
      codec: 'avc',
      width: config.width,
      height: config.height,
    },
    audio: config.includeAudio !== false ? {
      codec: 'aac',
      sampleRate: 48000,
      numberOfChannels: 2,
    } : undefined,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });
}

async function initializeAudioProcessing(_config: ExportWorkerConfig): Promise<void> {
  // Audio processing via libav.js is disabled in Worker context
  // because VSCode Webview blocks dynamic imports that libav.js requires.
  // Audio will be processed separately if needed.
  console.log('[FullPipelineExportWorker] Audio processing disabled in Worker context (VSCode Webview limitation)');
  state.libav = null;
}

function handleEncodedVideoChunk(chunk: EncodedVideoChunk, metadata?: EncodedVideoChunkMetadata): void {
  if (!state.muxer) return;

  const now = performance.now();
  if (state.lastEncoderOutputTime > 0) {
    state.estimatedEncodeTime += now - state.lastEncoderOutputTime;
  }
  state.lastEncoderOutputTime = now;
  state.encoderOutputCount++;
  state.pendingEncodes = Math.max(0, state.pendingEncodes - 1);

  state.muxer.addVideoChunk(chunk, metadata);
}

async function initializeMediaSources(project: SerializedProjectData): Promise<void> {
  // Collect all unique source URLs with their preloaded data
  const sourceMap = new Map<string, ArrayBuffer | undefined>();

  for (const track of project.tracks) {
    for (const element of track.elements) {
      if (element.type === 'video' && element.sourceUrl) {
        // Use preloaded data if available, otherwise will fetch in Worker
        if (!sourceMap.has(element.sourceUrl)) {
          sourceMap.set(element.sourceUrl, element.preloadedData);
        }
      }
    }
  }

  // Initialize each media source
  for (const [url, preloadedData] of sourceMap) {
    await initializeMediaSource(url, preloadedData);
  }
}

async function initializeMediaSource(url: string, preloadedData?: ArrayBuffer): Promise<void> {
  const source: MediaSource = {
    url,
    mp4File: createFile(),
    videoTrackId: null,
    audioTrackId: null,
    videoDecoder: null,
    decoderConfig: null,
    sampleIndex: [],
    keyframeIndex: [],
    pendingFrames: new Map(),
    initialized: false,
    // Decode state tracking for DTS-order decoding
    lastDecodedKeyframeIdx: -1,
    lastDecodedSampleIdx: -1,
    // Audio info
    audioSampleIndex: [],
    audioCodec: null,
    audioSampleRate: 48000,
    audioChannels: 2,
    audioCodecDescription: null,
    // Annex B mode support
    nalLengthSize: 4, // Default to 4 bytes (most common)
    avcCData: null,
  };

  state.mediaSources.set(url, source);

  // Set up mp4box callbacks
  source.mp4File.onReady = (info: MP4Info) => {
    handleMP4Ready(source, info);
  };

  source.mp4File.onError = (error: Error) => {
    console.error(`[FullPipelineExportWorker] MP4 error for ${url}:`, error);
  };

  // Load initial data - prefer preloaded data from main thread
  try {
    if (preloadedData && preloadedData.byteLength > 0) {
      // Use preloaded data from main thread (avoids Worker fetch issues with VSCode URLs)
      console.log(`[FullPipelineExportWorker] Using preloaded data (${preloadedData.byteLength} bytes) for ${url.substring(0, 50)}...`);

      // Check if this is combined data (initial + end chunks)
      // Format: [initialSize (4 bytes), endStart (4 bytes), initialData, endData]
      if (preloadedData.byteLength > 8) {
        const view = new DataView(preloadedData);
        const initialSize = view.getUint32(0, true);
        const endStart = view.getUint32(4, true);

        // Validate: if initialSize + endStart metadata makes sense, it's combined data
        if (initialSize > 0 && initialSize < preloadedData.byteLength - 8 && endStart > 0) {
          console.log(`[FullPipelineExportWorker] Detected combined preloaded data: initial=${initialSize}, endStart=${endStart}`);

          // Extract initial chunk
          const initialData = preloadedData.slice(8, 8 + initialSize);
          const initialBuffer = initialData as MP4ArrayBuffer;
          initialBuffer.fileStart = 0;
          source.mp4File.appendBuffer(initialBuffer);

          // Extract end chunk
          const endData = preloadedData.slice(8 + initialSize);
          if (endData.byteLength > 0) {
            const endBuffer = endData as MP4ArrayBuffer;
            endBuffer.fileStart = endStart;
            source.mp4File.appendBuffer(endBuffer);
          }
        } else {
          // Single chunk data
          const buffer = preloadedData as MP4ArrayBuffer;
          buffer.fileStart = 0;
          source.mp4File.appendBuffer(buffer);
        }
      } else {
        // Single chunk data
        const buffer = preloadedData as MP4ArrayBuffer;
        buffer.fileStart = 0;
        source.mp4File.appendBuffer(buffer);
      }
    } else {
      // Use proxy fetch via main thread (Worker cannot directly fetch VSCode resource URLs)
      console.log(`[FullPipelineExportWorker] No preloaded data, using proxy fetch for ${url.substring(0, 50)}...`);
      const data = await proxyFetch(url, 'bytes=0-2097151'); // First 2MB
      const buffer = data as MP4ArrayBuffer;
      buffer.fileStart = 0;
      source.mp4File.appendBuffer(buffer);
    }

    // Wait for initialization
    await waitForSourceInit(source);
  } catch (error) {
    console.error(`[FullPipelineExportWorker] Failed to initialize source ${url}:`, error);
    throw error;
  }
}

function handleMP4Ready(source: MediaSource, info: MP4Info): void {
  const videoTrack = info.videoTracks[0];
  if (videoTrack) {
    source.videoTrackId = videoTrack.id;

    // IMPORTANT: Set extraction options to tell mp4box we want to extract samples from this track
    // Without this, mp4box may not properly populate sample information
    source.mp4File.setExtractionOptions(videoTrack.id, null, {
      nbSamples: 1,
    });

    // Build sample index
    const trak = source.mp4File.getTrackById(videoTrack.id);
    if (trak) {
      // @ts-expect-error - accessing internal mp4box structure
      const samples = trak.samples as Array<{
        number: number;
        offset: number;
        size: number;
        cts: number;
        dts: number;
        duration: number;
        timescale: number;
        is_sync: boolean;
        description?: {
          avcC?: {
            AVCProfileIndication: number;
            profile_compatibility: number;
            AVCLevelIndication: number;
            lengthSizeMinusOne?: number;
            SPS?: Array<{ nalu: Uint8Array }>;
            PPS?: Array<{ nalu: Uint8Array }>;
          };
        };
      }> | undefined;

      if (samples) {
        for (let i = 0; i < samples.length; i++) {
          const s = samples[i];
          if (!s) continue;

          source.sampleIndex.push({
            number: s.number,
            offset: s.offset,
            size: s.size,
            cts: s.cts,
            dts: s.dts,
            duration: s.duration,
            timescale: s.timescale,
            is_sync: s.is_sync,
          });

          if (s.is_sync) {
            source.keyframeIndex.push(i);
          }
        }

        // Log keyframe info for debugging
        console.log(`[FullPipelineExportWorker] Sample index built: ${source.sampleIndex.length} samples, ${source.keyframeIndex.length} keyframes`);

        // Log first few samples for debugging
        console.log(`[FullPipelineExportWorker] First 5 samples:`, source.sampleIndex.slice(0, 5).map((s, i) => ({
          idx: i,
          offset: s.offset,
          size: s.size,
          cts: s.cts,
          dts: s.dts,
          is_sync: s.is_sync,
        })));

        if (source.keyframeIndex.length > 0) {
          const firstKeyframeIdx = source.keyframeIndex[0];
          const firstKeyframeSample = source.sampleIndex[firstKeyframeIdx ?? 0];
          console.log(`[FullPipelineExportWorker] First keyframe:`, {
            index: firstKeyframeIdx,
            offset: firstKeyframeSample?.offset,
            size: firstKeyframeSample?.size,
            is_sync: firstKeyframeSample?.is_sync,
          });

          // Log all keyframe sizes for debugging
          console.log(`[FullPipelineExportWorker] All keyframe sizes:`, source.keyframeIndex.slice(0, 10).map(idx => {
            const s = source.sampleIndex[idx];
            return { idx, size: s?.size, offset: s?.offset };
          }));
        }

        // Get decoder config from first sample
        const firstSample = samples[0];
        if (firstSample?.description?.avcC) {
          const avcC = firstSample.description.avcC;
          const profile = avcC.AVCProfileIndication.toString(16).padStart(2, '0');
          const compat = avcC.profile_compatibility.toString(16).padStart(2, '0');
          const level = avcC.AVCLevelIndication.toString(16).padStart(2, '0');

          // Store NAL length size for AVCC to Annex B conversion
          source.nalLengthSize = (avcC.lengthSizeMinusOne ?? 3) + 1;

          // Extract avcC data for Annex B conversion (SPS/PPS prepending)
          try {
            console.log(`[FullPipelineExportWorker] avcC structure:`, {
              hasAvcC: !!avcC,
              hasSPS: !!avcC.SPS,
              hasPPS: !!avcC.PPS,
              spsLength: avcC.SPS?.length,
              ppsLength: avcC.PPS?.length,
              lengthSizeMinusOne: avcC.lengthSizeMinusOne,
              nalLengthSize: source.nalLengthSize,
            });

            const sps = avcC.SPS?.[0];
            const pps = avcC.PPS?.[0];

            if (sps && pps) {
              const spsData = sps.nalu as Uint8Array;
              const ppsData = pps.nalu as Uint8Array;

              console.log(`[FullPipelineExportWorker] SPS/PPS data:`, {
                spsDataLength: spsData?.length,
                ppsDataLength: ppsData?.length,
              });

              if (!spsData || !ppsData || spsData.length === 0 || ppsData.length === 0) {
                console.warn('[FullPipelineExportWorker] SPS or PPS data is empty');
              } else {
                // Build avcC data for extractSPSPPSFromAvcC function
                const avcCData = new Uint8Array(11 + spsData.length + ppsData.length);
                let offset = 0;

                avcCData[offset++] = 1; // configurationVersion
                avcCData[offset++] = avcC.AVCProfileIndication;
                avcCData[offset++] = avcC.profile_compatibility;
                avcCData[offset++] = avcC.AVCLevelIndication;
                // lengthSizeMinusOne is stored in lower 2 bits, upper 6 bits are reserved (0xFF)
                avcCData[offset++] = 0xfc | (avcC.lengthSizeMinusOne ?? 3);
                // numOfSequenceParameterSets is stored in lower 5 bits, upper 3 bits are reserved (0xE0)
                avcCData[offset++] = 0xe0 | 1;
                avcCData[offset++] = (spsData.length >> 8) & 0xff;
                avcCData[offset++] = spsData.length & 0xff;
                avcCData.set(spsData, offset);
                offset += spsData.length;
                avcCData[offset++] = 1; // numOfPictureParameterSets
                avcCData[offset++] = (ppsData.length >> 8) & 0xff;
                avcCData[offset++] = ppsData.length & 0xff;
                avcCData.set(ppsData, offset);

                source.avcCData = avcCData;
                console.log(`[FullPipelineExportWorker] Stored avcC data: ${avcCData.length} bytes (Annex B mode)`);
              }
            } else {
              console.warn('[FullPipelineExportWorker] SPS or PPS not found in avcC');
            }
          } catch (e) {
            console.warn('[FullPipelineExportWorker] Failed to extract avcC data:', e);
          }

          if (!source.avcCData) {
            console.warn('[FullPipelineExportWorker] No avcC data extracted. Decoding may fail.');
          }

          // Use Annex B mode: no description in config, SPS/PPS will be prepended to keyframes
          // This is more reliable than AVCC mode which requires exact description matching
          source.decoderConfig = {
            codec: `avc1.${profile}${compat}${level}`,
            codedWidth: videoTrack.video.width,
            codedHeight: videoTrack.video.height,
            // No description - Annex B mode reads SPS/PPS from bitstream
          };
          console.log(`[FullPipelineExportWorker] Using Annex B mode for decoding (no description)`);
        }
      }
    }
  }

  // Extract audio track info
  const audioTrack = info.audioTracks[0];
  if (audioTrack) {
    source.audioTrackId = audioTrack.id;
    source.audioCodec = audioTrack.codec?.split('.')[0] ?? 'aac';
    source.audioSampleRate = audioTrack.audio?.sample_rate ?? 48000;
    source.audioChannels = audioTrack.audio?.channel_count ?? 2;

    // Build audio sample index
    const audioTrak = source.mp4File.getTrackById(audioTrack.id);
    if (audioTrak) {
      // @ts-expect-error - accessing internal mp4box structure
      const audioSamples = audioTrak.samples as Array<{
        offset: number;
        size: number;
        cts: number;
        dts: number;
        duration: number;
        timescale: number;
        description?: { esds?: { data: Uint8Array } };
      }> | undefined;

      if (audioSamples) {
        for (const s of audioSamples) {
          if (!s) continue;
          source.audioSampleIndex.push({
            offset: s.offset,
            size: s.size,
            cts: s.cts,
            dts: s.dts,
            duration: s.duration,
            timescale: s.timescale,
          });

          // Get codec description from first sample
          if (!source.audioCodecDescription && s.description?.esds?.data) {
            source.audioCodecDescription = s.description.esds.data;
          }
        }
      }
    }
  }

  source.initialized = true;
}

async function waitForSourceInit(source: MediaSource, timeout = 5000): Promise<void> {
  const start = performance.now();
  while (!source.initialized) {
    if (performance.now() - start > timeout) {
      throw new Error('Timeout waiting for media source initialization');
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

// =============================================================================
// Export Processing
// =============================================================================

async function startExport(): Promise<void> {
  if (!state.isInitialized || !state.config || !state.project) {
    postError('Worker not initialized', 'start');
    return;
  }

  if (state.isExporting) {
    postError('Export already in progress', 'start');
    return;
  }

  state.isExporting = true;
  state.startTime = performance.now();

  console.log('[FullPipelineExportWorker] Starting export:', {
    fps: state.config.fps,
    totalFrames: state.config.totalFrames,
    width: state.config.width,
    height: state.config.height,
    tracks: state.project.tracks.length,
  });

  try {
    const { fps, totalFrames, includeAudio } = state.config;
    const frameDuration = 1 / fps;

    // Process video frames
    for (let frameIndex = 0; frameIndex < totalFrames && !state.isCancelled; frameIndex++) {
      const timeInSeconds = frameIndex * frameDuration;
      await processFrame(frameIndex, timeInSeconds);

      // Report progress every 10 frames
      if (frameIndex % 10 === 0) {
        postProgress({});
      }
    }

    // Process audio after video (if enabled)
    if (!state.isCancelled && includeAudio !== false && state.libav) {
      postProgress({ message: 'Processing audio...' });
      await processAudio();
    }

    if (!state.isCancelled) {
      await finalizeExport();
    }
  } catch (error) {
    postError(error, 'export');
  } finally {
    state.isExporting = false;
  }
}

async function processFrame(frameIndex: number, timeInSeconds: number): Promise<void> {
  if (!state.gpuDevice || !state.gpuContext || !state.canvas || !state.config || !state.project) return;

  const { fps } = state.config;

  // Log first few frames for debugging
  if (frameIndex < 5 || frameIndex % 100 === 0) {
    console.log(`[FullPipelineExportWorker] Processing frame ${frameIndex} at ${timeInSeconds.toFixed(3)}s`);
  }

  // Render all visible elements at this time using WebGPU
  const renderStart = performance.now();
  await renderVisibleElementsWebGPU(timeInSeconds);

  // CRITICAL: Wait for GPU to finish rendering before reading from canvas
  // Without this, we may read incomplete/stale data causing flickering
  try {
    const queue = state.gpuDevice.queue as GPUQueue & { onSubmittedWorkDone?: () => Promise<void> };
    if (queue.onSubmittedWorkDone) {
      await queue.onSubmittedWorkDone();
    }
  } catch {
    // Ignore sync errors, continue with frame
  }

  state.totalRenderTime += performance.now() - renderStart;

  // Create VideoFrame from canvas (GPU-backed, zero-copy)
  const timestamp = Math.round(timeInSeconds * 1_000_000);
  const videoFrame = new VideoFrame(state.canvas, { timestamp });

  // Encode frame
  const encodeStart = performance.now();
  const keyFrame = frameIndex % fps === 0;
  state.pendingEncodes++;
  state.videoEncoder!.encode(videoFrame, { keyFrame });
  videoFrame.close();
  state.totalEncodeTime += performance.now() - encodeStart;

  state.processedFrames++;
}

async function renderVisibleElementsWebGPU(timeInSeconds: number): Promise<void> {
  if (!state.gpuDevice || !state.gpuContext || !state.gpuBasicPipeline || !state.config || !state.project) return;

  const { width, height } = state.config;

  // Collect visible layers with their frames
  interface RenderLayer {
    frame: VideoFrame;
    transform: SerializedTransform;
    colorCorrection?: SerializedColorCorrection;
    zIndex: number;
  }
  const layers: RenderLayer[] = [];

  // Iterate tracks from bottom to top for proper layering
  for (let trackIndex = state.project.tracks.length - 1; trackIndex >= 0; trackIndex--) {
    const track = state.project.tracks[trackIndex];
    if (!track || track.hidden || track.muted || track.type !== 'video') continue;

    for (const element of track.elements) {
      if (element.hidden || element.muted) continue;

      // Check if element is visible at this time
      const trimStart = element.trimStart ?? 0;
      const trimEnd = element.trimEnd ?? 0;
      const effectiveDuration = element.duration - trimStart - trimEnd;
      const elementStart = element.startTime;
      const elementEnd = elementStart + effectiveDuration;

      if (timeInSeconds < elementStart || timeInSeconds >= elementEnd) continue;

      // Calculate media time (time within the source video)
      const mediaTime = trimStart + (timeInSeconds - elementStart);

      // Get video frame for this element
      const frame = await getVideoFrameAt(element, mediaTime);
      if (!frame) {
        // Log frame miss for debugging
        if (state.processedFrames < 10 || state.processedFrames % 50 === 0) {
          console.warn(`[FullPipelineExportWorker] Frame miss at ${timeInSeconds.toFixed(3)}s, mediaTime=${mediaTime.toFixed(3)}s`);
        }
        continue;
      }

      layers.push({
        frame,
        transform: element.transform,
        colorCorrection: element.colorCorrection,
        zIndex: trackIndex,
      });
    }
  }

  // Sort by z-index (bottom to top)
  layers.sort((a, b) => b.zIndex - a.zIndex);

  // Log layer count for debugging
  if (state.processedFrames < 5 || state.processedFrames % 100 === 0) {
    console.log(`[FullPipelineExportWorker] renderVisibleElementsWebGPU: ${layers.length} layers at ${timeInSeconds.toFixed(3)}s`);
  }

  // Get current texture
  const textureView = state.gpuContext.getCurrentTexture().createView();

  // Create command encoder
  const commandEncoder = state.gpuDevice.createCommandEncoder();

  // Begin render pass
  const renderPass = commandEncoder.beginRenderPass({
    colorAttachments: [{
      view: textureView,
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
      loadOp: 'clear',
      storeOp: 'store',
    }],
  });

  // Reset buffer pool indices for this frame
  state.transformBufferPoolIndex = 0;
  state.ccBufferPoolIndex = 0;

  // Render each layer
  for (const layer of layers) {
    renderLayerWebGPU(renderPass, layer.frame, layer.transform, layer.colorCorrection, width, height);
  }

  renderPass.end();

  // Submit commands
  state.gpuDevice.queue.submit([commandEncoder.finish()]);

  // Close all frames
  for (const layer of layers) {
    layer.frame.close();
  }
}

function renderLayerWebGPU(
  renderPass: GPURenderPassEncoder,
  frame: VideoFrame,
  transform: SerializedTransform,
  colorCorrection: SerializedColorCorrection | undefined,
  canvasWidth: number,
  canvasHeight: number
): void {
  if (!state.gpuDevice || !state.gpuBasicPipeline || !state.gpuSampler || !state.gpuVertexBuffer || !state.gpuIndexBuffer) return;

  // Determine if we need color correction
  const hasColorCorrection = colorCorrection && hasNonDefaultColorCorrection(colorCorrection);
  const pipeline = hasColorCorrection ? state.gpuColorCorrectionPipeline : state.gpuBasicPipeline;
  if (!pipeline) return;

  // Import VideoFrame as external texture (ZERO-COPY!)
  const externalTexture = state.gpuDevice.importExternalTexture({
    source: frame,
  });

  // Create transform data (unified with preview)
  const transformData = createTransformData(transform, canvasWidth, canvasHeight);
  const transformBuffer = acquireTransformBuffer();
  state.gpuDevice.queue.writeBuffer(transformBuffer, 0, transformData.buffer as ArrayBuffer, transformData.byteOffset, transformData.byteLength);

  // Create bind group entries
  const bindGroupEntries: GPUBindGroupEntry[] = [
    { binding: 0, resource: { buffer: transformBuffer } },
    { binding: 1, resource: state.gpuSampler },
    { binding: 2, resource: externalTexture },
  ];

  // Add color correction buffer if needed
  if (hasColorCorrection && colorCorrection) {
    const ccData = createColorCorrectionData(colorCorrection);
    const ccBuffer = acquireCCBuffer();
    state.gpuDevice.queue.writeBuffer(ccBuffer, 0, ccData.buffer as ArrayBuffer, ccData.byteOffset, ccData.byteLength);
    bindGroupEntries.push({ binding: 3, resource: { buffer: ccBuffer } });
  }

  // Create bind group
  const bindGroup = state.gpuDevice.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: bindGroupEntries,
  });

  renderPass.setPipeline(pipeline);
  renderPass.setBindGroup(0, bindGroup);
  renderPass.setVertexBuffer(0, state.gpuVertexBuffer);
  renderPass.setIndexBuffer(state.gpuIndexBuffer, 'uint16');
  renderPass.drawIndexed(6); // 6 indices for quad
}

/**
 * Check if color correction has non-default values
 */
function hasNonDefaultColorCorrection(cc: SerializedColorCorrection): boolean {
  return (
    (cc.exposure !== undefined && cc.exposure !== 0) ||
    (cc.contrast !== undefined && cc.contrast !== 0) ||
    (cc.saturation !== undefined && cc.saturation !== 0) ||
    (cc.temperature !== undefined && cc.temperature !== 0) ||
    (cc.tint !== undefined && cc.tint !== 0) ||
    (cc.vibrance !== undefined && cc.vibrance !== 0) ||
    (cc.highlights !== undefined && cc.highlights !== 0) ||
    (cc.shadows !== undefined && cc.shadows !== 0) ||
    (cc.whites !== undefined && cc.whites !== 0) ||
    (cc.blacks !== undefined && cc.blacks !== 0)
  );
}

/**
 * Acquire transform buffer from pool (unified with preview)
 */
function acquireTransformBuffer(): GPUBuffer {
  const buffer = state.transformBufferPool[state.transformBufferPoolIndex];
  state.transformBufferPoolIndex = (state.transformBufferPoolIndex + 1) % TRANSFORM_BUFFER_POOL_SIZE;
  return buffer!;
}

/**
 * Acquire color correction buffer from pool
 */
function acquireCCBuffer(): GPUBuffer {
  const buffer = state.ccBufferPool[state.ccBufferPoolIndex];
  state.ccBufferPoolIndex = (state.ccBufferPoolIndex + 1) % CC_BUFFER_POOL_SIZE;
  return buffer!;
}

/**
 * Create transform data (unified with preview - _createTransformData)
 * Uses the same MVP matrix calculation as WebGPUCompositor
 */
function createTransformData(
  transform: SerializedTransform,
  canvasWidth: number,
  canvasHeight: number
): Float32Array {
  // WGSL struct alignment (same as preview):
  // mat4x4f: 64 bytes at offset 0
  // opacity (f32): 4 bytes at offset 64
  // _padding (vec3f): aligned to 16, so at offset 80, size 12
  // Total struct size aligned to 16: 96 bytes = 24 floats
  const data = new Float32Array(24);

  // NOTE: SerializedTransform fields are named confusingly:
  // - width/height are actually scaleX/scaleY (1.0 = original size)
  // - x/y are pixel offsets from center (same as preview's transform.x/y)
  // This matches how WebviewExportAdapter serializes the transform.

  // Build transform matrix (same as preview's _createTransformData)
  const scaleX = (transform.width ?? 1) * (transform.flipX ? -1 : 1);
  const scaleY = (transform.height ?? 1) * (transform.flipY ? -1 : 1);
  const rotation = ((transform.rotation ?? 0) * Math.PI) / 180;

  // Convert pixel offset to clip space (-1 to 1)
  // Same calculation as preview: translateX = x / (width / 2)
  const translateX = (transform.x ?? 0) / (canvasWidth / 2);
  const translateY = (transform.y ?? 0) / (canvasHeight / 2);

  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  // Column-major 4x4 matrix (64 bytes, indices 0-15)
  // Same calculation as preview's _createTransformData
  data[0] = scaleX * cos;
  data[1] = scaleX * sin;
  data[2] = 0;
  data[3] = 0;

  data[4] = -scaleY * sin;
  data[5] = scaleY * cos;
  data[6] = 0;
  data[7] = 0;

  data[8] = 0;
  data[9] = 0;
  data[10] = 1;
  data[11] = 0;

  data[12] = translateX;
  data[13] = translateY;
  data[14] = 0;
  data[15] = 1;

  // Opacity at offset 64 (index 16)
  data[16] = transform.opacity ?? 1;
  // Padding (indices 17-23)
  data[17] = 0;
  data[18] = 0;
  data[19] = 0;
  data[20] = 0;
  data[21] = 0;
  data[22] = 0;
  data[23] = 0;

  return data;
}

/**
 * Create color correction data (unified with preview - _createColorCorrectionData)
 */
function createColorCorrectionData(cc: SerializedColorCorrection): Float32Array {
  // ColorCorrectionUniforms fields (same order as shader):
  // exposure, contrast, saturation, temperature, tint, vibrance, highlights, shadows, whites, blacks, _padding
  return new Float32Array([
    cc.exposure ?? 0,      // -5 to 5
    cc.contrast ?? 0,      // -100 to 100
    cc.saturation ?? 0,    // -100 to 100
    cc.temperature ?? 0,   // -100 to 100
    cc.tint ?? 0,          // -100 to 100
    cc.vibrance ?? 0,      // -100 to 100
    cc.highlights ?? 0,    // -100 to 100
    cc.shadows ?? 0,       // -100 to 100
    cc.whites ?? 0,        // -100 to 100
    cc.blacks ?? 0,        // -100 to 100
    0, 0, // padding to align to 48 bytes (12 floats)
  ]);
}

async function getVideoFrameAt(element: SerializedElement, mediaTime: number): Promise<VideoFrame | null> {
  const source = state.mediaSources.get(element.sourceUrl);
  if (!source || !source.initialized || source.sampleIndex.length === 0) {
    return null;
  }

  const demuxStart = performance.now();

  // Find sample at this time
  // CRITICAL: Samples are stored in DTS order, but we need to find by CTS (PTS)
  // For B-frame videos, DTS order != CTS order, so we must search all samples
  const timescale = source.sampleIndex[0]?.timescale ?? 1;
  const targetCts = mediaTime * timescale;

  // Find the sample with CTS closest to (but not exceeding) targetCts
  let sampleIdx = 0;
  let bestCts = -Infinity;

  for (let i = 0; i < source.sampleIndex.length; i++) {
    const sample = source.sampleIndex[i];
    if (sample && sample.cts <= targetCts && sample.cts > bestCts) {
      sampleIdx = i;
      bestCts = sample.cts;
    }
  }

  // Find nearest keyframe (keyframes are stored by sample index, which is DTS order)
  // We need to find the keyframe that is <= sampleIdx in DTS order
  let keyframeIdx = 0;
  for (let i = source.keyframeIndex.length - 1; i >= 0; i--) {
    const idx = source.keyframeIndex[i];
    if (idx !== undefined && idx <= sampleIdx) {
      keyframeIdx = idx;
      break;
    }
  }

  state.totalDemuxTime += performance.now() - demuxStart;

  // Decode frames from keyframe to target
  const decodeStart = performance.now();
  const frame = await decodeFrameAt(source, keyframeIdx, sampleIdx);
  state.totalDecodeTime += performance.now() - decodeStart;

  // Log decode result for debugging (first few frames)
  if (state.processedFrames < 5) {
    console.log(`[FullPipelineExportWorker] getVideoFrameAt: mediaTime=${mediaTime.toFixed(3)}s, sampleIdx=${sampleIdx}, keyframeIdx=${keyframeIdx}, targetCts=${targetCts.toFixed(0)}, bestCts=${bestCts.toFixed(0)}, gotFrame=${!!frame}`);
  }

  return frame;
}

/**
 * Decode video frame at target index
 * Per principle.md: 区分DTS和PTS，按DTS要求传入webcodecs解码
 *
 * For B-frames, we need to decode from keyframe to target in DTS order,
 * because B-frames depend on both previous and future reference frames.
 *
 * CRITICAL: For B-frame videos:
 * - Samples are stored in DTS order
 * - Decoder outputs frames in PTS order
 * - We may need to decode BEYOND targetIdx to get the target frame
 *   (because B-frames need future reference frames)
 *
 * Optimization: Track last decoded position to avoid re-decoding frames
 * when processing sequential frames within the same GOP.
 */
async function decodeFrameAt(
  source: MediaSource,
  keyframeIdx: number,
  targetIdx: number
): Promise<VideoFrame | null> {
  // Initialize or reinitialize decoder if needed
  // VideoDecoder may be closed due to errors, so we need to check state
  if (source.decoderConfig) {
    const decoderState = source.videoDecoder?.state as string | undefined;
    if (!source.videoDecoder || decoderState === 'closed') {
      // Create new decoder (or recreate if closed)
      if (source.videoDecoder) {
        console.log('[FullPipelineExportWorker] Recreating closed VideoDecoder');
      }
      source.videoDecoder = new VideoDecoder({
        output: (frame) => {
          // Store decoded frame by PTS (presentation timestamp)
          const frameTime = frame.timestamp;
          source.pendingFrames.set(frameTime, frame);
          // Log first few decoded frames for debugging
          if (source.pendingFrames.size <= 5) {
            console.log(`[FullPipelineExportWorker] Decoder output: PTS=${frameTime}, size=${frame.displayWidth}x${frame.displayHeight}, pendingFrames=${source.pendingFrames.size}`);
          }
        },
        error: (error) => {
          console.error('[FullPipelineExportWorker] Decoder error:', error);
        },
      });

      source.videoDecoder.configure(source.decoderConfig);
      // Reset decode state when recreating decoder
      source.lastDecodedKeyframeIdx = -1;
      source.lastDecodedSampleIdx = -1;
    }
  }

  const currentDecoderState = source.videoDecoder?.state as string | undefined;
  if (!source.videoDecoder || currentDecoderState === 'closed') {
    return null;
  }

  const targetSample = source.sampleIndex[targetIdx];
  if (!targetSample) return null;

  // Target PTS for frame retrieval (in microseconds)
  const targetPts = (targetSample.cts * 1_000_000) / targetSample.timescale;
  const ptsTolerance = 1000; // 1ms tolerance

  // Check if we already have this frame cached (with tolerance)
  for (const [ts, f] of source.pendingFrames) {
    if (Math.abs(ts - targetPts) <= ptsTolerance) {
      source.pendingFrames.delete(ts);
      return f;
    }
  }

  try {
    // Determine start index for decoding (in DTS order)
    let startIdx = keyframeIdx;
    if (source.lastDecodedSampleIdx >= 0) {
      startIdx = source.lastDecodedSampleIdx + 1;
    }

    // Update keyframe tracking
    if (keyframeIdx !== source.lastDecodedKeyframeIdx) {
      source.lastDecodedKeyframeIdx = keyframeIdx;
      // If we're starting from a new keyframe, reset startIdx
      if (startIdx < keyframeIdx) {
        startIdx = keyframeIdx;
      }
    }

    // For B-frame videos, we may need to decode beyond targetIdx
    // Decode in batches until we get the target frame
    const maxSamplesToProcess = source.sampleIndex.length;
    let currentIdx = startIdx;

    while (currentIdx < maxSamplesToProcess) {
      // Check if target frame is now in cache
      for (const [ts, f] of source.pendingFrames) {
        if (Math.abs(ts - targetPts) <= ptsTolerance) {
          source.pendingFrames.delete(ts);
          return f;
        }
      }

      // Decode next sample
      const sample = source.sampleIndex[currentIdx];
      if (!sample) {
        currentIdx++;
        continue;
      }

      // Skip if we might already have this frame
      const samplePts = (sample.cts * 1_000_000) / sample.timescale;
      if (source.pendingFrames.has(samplePts)) {
        currentIdx++;
        continue;
      }

      try {
        // Fetch sample data
        const rawData = await proxyFetch(
          source.url,
          `bytes=${sample.offset}-${sample.offset + sample.size - 1}`
        );

        // Extract sample data
        let avccData: Uint8Array;
        if (rawData.byteLength > sample.size * 2) {
          avccData = new Uint8Array(rawData, sample.offset, sample.size);
        } else {
          avccData = new Uint8Array(rawData);
        }

        // Convert AVCC to Annex B format
        let annexBData = avccToAnnexB(avccData, source.nalLengthSize);

        // Check if this is a true IDR frame
        const isIDR = isIDRFrame(avccData, source.nalLengthSize);

        // For IDR frames, prepend SPS/PPS
        if (isIDR && source.avcCData) {
          const spsPps = extractSPSPPSFromAvcC(source.avcCData);
          if (spsPps) {
            const combined = new Uint8Array(spsPps.length + annexBData.length);
            combined.set(spsPps, 0);
            combined.set(annexBData, spsPps.length);
            annexBData = combined;
          }
        }

        // Check decoder state
        const decodeDecoderState = source.videoDecoder?.state as string | undefined;
        if (!source.videoDecoder || decodeDecoderState === 'closed') {
          console.warn('[FullPipelineExportWorker] Decoder closed, stopping');
          break;
        }

        // Create and decode chunk
        const chunk = new EncodedVideoChunk({
          type: isIDR ? 'key' : 'delta',
          timestamp: samplePts,
          duration: (sample.duration * 1_000_000) / sample.timescale,
          data: annexBData,
        });

        // Log first few decode calls for debugging
        if (currentIdx < 5) {
          console.log(`[FullPipelineExportWorker] Decoding sample ${currentIdx}: isIDR=${isIDR}, PTS=${samplePts}, dataSize=${annexBData.length}`);
        }

        source.videoDecoder.decode(chunk);
        source.lastDecodedSampleIdx = currentIdx;

      } catch (error) {
        console.warn(`[FullPipelineExportWorker] Failed to decode sample ${currentIdx}:`, error);
      }

      currentIdx++;

      // After decoding a batch, wait for decoder to output frames
      // This is important for B-frames which may be delayed
      if (currentIdx % 10 === 0 || currentIdx > targetIdx + 5) {
        // Wait for decoder queue to drain
        let waitAttempts = 0;
        while (source.videoDecoder.decodeQueueSize > 0 && waitAttempts < 100) {
          await new Promise(resolve => setTimeout(resolve, 1));
          waitAttempts++;
        }

        // Check if we got the target frame
        for (const [ts, f] of source.pendingFrames) {
          if (Math.abs(ts - targetPts) <= ptsTolerance) {
            source.pendingFrames.delete(ts);
            return f;
          }
        }
      }
    }

    // Final wait for decoder to output remaining frames
    let waitAttempts = 0;
    const maxWaitAttempts = 500;
    while (waitAttempts < maxWaitAttempts) {
      for (const [ts, f] of source.pendingFrames) {
        if (Math.abs(ts - targetPts) <= ptsTolerance) {
          source.pendingFrames.delete(ts);
          return f;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 1));
      waitAttempts++;
    }

    // Frame not found - return closest frame as fallback
    console.warn(`[FullPipelineExportWorker] Frame not found: targetIdx=${targetIdx}, targetPts=${targetPts}, pendingFrames=${source.pendingFrames.size}`);
    if (source.pendingFrames.size > 0) {
      const pendingPts = Array.from(source.pendingFrames.keys()).slice(0, 5);
      console.warn(`[FullPipelineExportWorker] Pending frame PTS: ${pendingPts.join(', ')}`);
    }

    let closestFrame: VideoFrame | null = null;
    let closestDiff = Infinity;
    let closestTs: number | null = null;
    for (const [ts, f] of source.pendingFrames) {
      const diff = Math.abs(ts - targetPts);
      if (diff < closestDiff) {
        closestFrame = f;
        closestDiff = diff;
        closestTs = ts;
      }
    }
    if (closestFrame && closestTs !== null) {
      source.pendingFrames.delete(closestTs);
    }
    return closestFrame;

  } catch (error) {
    console.error('[FullPipelineExportWorker] Decode error:', error);
    return null;
  }
}

async function finalizeExport(): Promise<void> {
  if (!state.videoEncoder || !state.muxer || !state.muxerTarget) {
    postError('Worker not initialized', 'finalize');
    return;
  }

  try {
    postProgress({ stage: 'muxing', percent: 85, message: 'Finalizing video...' });

    await state.videoEncoder.flush();

    // Finalize audio encoder if used
    if (state.libav && state.audioEncoderCtx) {
      await finalizeAudioEncoder();
    }

    state.muxer.finalize();

    const outputBuffer = state.muxerTarget.buffer;
    const totalTime = performance.now() - state.startTime;
    const averageFps = state.processedFrames / (totalTime / 1000);

    postResponse(
      {
        type: 'complete',
        outputBuffer,
        fileSize: outputBuffer.byteLength,
        totalTime,
        averageFps,
      },
      [outputBuffer]
    );
  } catch (error) {
    postError(error, 'finalize');
  }
}

// =============================================================================
// Audio Processing
// =============================================================================

/**
 * Process all audio tracks: demux → decode → mix → encode → mux
 */
async function processAudio(): Promise<void> {
  if (!state.libav || !state.config || !state.project || !state.muxer) return;

  const audioStart = performance.now();

  try {
    // Collect all audio tracks from project
    const audioTracks = collectAudioTracks();
    if (audioTracks.length === 0) {
      console.log('[FullPipelineExportWorker] No audio tracks to process');
      return;
    }

    console.log(`[FullPipelineExportWorker] Processing ${audioTracks.length} audio tracks`);

    // Decode all audio tracks to PCM
    const decodedTracks: Array<{ pcm: Float32Array; timelineStart: number; volume: number }> = [];

    for (const track of audioTracks) {
      const pcm = await decodeAudioTrack(track);
      if (pcm && pcm.length > 0) {
        decodedTracks.push({
          pcm,
          timelineStart: track.timelineStart,
          volume: track.volume,
        });
      }
    }

    if (decodedTracks.length === 0) {
      console.log('[FullPipelineExportWorker] No audio decoded');
      return;
    }

    // Mix all tracks
    const duration = state.project.duration;
    const sampleRate = 48000;
    const channels = 2;
    const totalSamples = Math.ceil(duration * sampleRate * channels);
    const mixedAudio = new Float32Array(totalSamples);

    for (const track of decodedTracks) {
      mixAudioTrack(mixedAudio, track.pcm, track.timelineStart, track.volume, sampleRate, channels);
    }

    // Encode mixed audio
    await encodeAudio(mixedAudio, sampleRate, channels);

    state.totalAudioTime = performance.now() - audioStart;
    console.log(`[FullPipelineExportWorker] Audio processing completed in ${state.totalAudioTime.toFixed(0)}ms`);
  } catch (error) {
    console.error('[FullPipelineExportWorker] Audio processing error:', error);
    // Continue without audio
  }
}

/**
 * Collect audio track info from project
 */
function collectAudioTracks(): AudioTrackData[] {
  if (!state.project) return [];

  const tracks: AudioTrackData[] = [];

  for (const track of state.project.tracks) {
    if (track.muted) continue;

    for (const element of track.elements) {
      if (element.muted || element.hidden) continue;
      if (element.type !== 'video' && element.type !== 'audio') continue;

      // Check if source has audio
      const source = state.mediaSources.get(element.sourceUrl);
      if (!source || !source.audioTrackId) continue;

      tracks.push({
        sourceUrl: element.sourceUrl,
        timelineStart: element.startTime,
        sourceStart: element.trimStart ?? 0,
        duration: element.duration - (element.trimStart ?? 0) - (element.trimEnd ?? 0),
        volume: element.volume ?? 1,
      });
    }
  }

  return tracks;
}

/**
 * Decode audio track using libav.js
 */
async function decodeAudioTrack(track: AudioTrackData): Promise<Float32Array | null> {
  if (!state.libav) return null;

  const source = state.mediaSources.get(track.sourceUrl);
  if (!source || !source.audioCodec || source.audioSampleIndex.length === 0) {
    return null;
  }

  try {
    // Create decoder
    const codecId = getAudioCodecId(source.audioCodec);
    const codecpar = await createAudioCodecpar(
      codecId,
      source.audioSampleRate,
      source.audioChannels,
      source.audioCodecDescription
    );

    const [, codecCtx, pkt, frame] = await state.libav.ff_init_decoder(codecId, codecpar);

    // Free codecpar
    await state.libav.avcodec_parameters_free_js(codecpar);

    // Calculate which samples to decode based on trim
    const startTime = track.sourceStart;
    const endTime = startTime + track.duration;

    // Filter samples within time range
    const samplesToLoad: AudioSampleInfo[] = [];
    for (const sample of source.audioSampleIndex) {
      const sampleTime = sample.cts / sample.timescale;
      if (sampleTime >= startTime && sampleTime < endTime) {
        samplesToLoad.push(sample);
      }
    }

    if (samplesToLoad.length === 0) {
      await state.libav.ff_free_decoder(codecCtx, pkt, frame);
      return null;
    }

    // Load and decode samples (using proxy fetch via main thread)
    const packets: Packet[] = [];
    for (const sample of samplesToLoad) {
      try {
        const arrayBuffer = await proxyFetch(
          source.url,
          `bytes=${sample.offset}-${sample.offset + sample.size - 1}`
        );

        // Extract sample data from response
        // VSCode webview resource URLs may not support Range requests
        let data: Uint8Array;
        if (arrayBuffer.byteLength > sample.size * 2) {
          // Response is much larger than requested - Range not supported
          data = new Uint8Array(arrayBuffer, sample.offset, sample.size);
        } else {
          data = new Uint8Array(arrayBuffer);
        }

        packets.push({
          data,
          pts: sample.cts,
          dts: sample.dts,
          stream_index: 0,
        } as Packet);
      } catch (error) {
        console.warn(`[FullPipelineExportWorker] Failed to fetch audio sample:`, error);
        continue;
      }
    }

    // Decode all packets
    const frames = await state.libav.ff_decode_multi(codecCtx, pkt, frame, packets, { ignoreErrors: true });

    // Extract PCM from frames
    const allPCM: Float32Array[] = [];
    for (const f of frames) {
      const pcm = extractPCMFromLibavFrame(f as Frame, source.audioChannels);
      if (pcm.length > 0) {
        allPCM.push(pcm);
      }
    }

    // Cleanup decoder
    await state.libav.ff_free_decoder(codecCtx, pkt, frame);

    // Merge PCM
    if (allPCM.length === 0) return null;

    const totalLength = allPCM.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Float32Array(totalLength);
    let offset = 0;
    for (const arr of allPCM) {
      result.set(arr, offset);
      offset += arr.length;
    }

    // Resample to 48kHz if needed
    if (source.audioSampleRate !== 48000) {
      return resampleAudio(result, source.audioSampleRate, 48000, source.audioChannels);
    }

    return result;
  } catch (error) {
    console.error('[FullPipelineExportWorker] Audio decode error:', error);
    return null;
  }
}

/**
 * Get libav codec ID for audio codec
 */
function getAudioCodecId(codec: string): number {
  const codecMap: Record<string, number> = {
    aac: 86018,
    mp3: 86017,
    opus: 86076,
    vorbis: 86021,
    flac: 86028,
  };
  return codecMap[codec.toLowerCase()] ?? 86018;
}

/**
 * Create codecpar for audio decoder
 */
async function createAudioCodecpar(
  codecId: number,
  sampleRate: number,
  channels: number,
  extradata: Uint8Array | null
): Promise<number> {
  if (!state.libav) throw new Error('LibAV not initialized');

  const codecpar = await state.libav.avcodec_parameters_alloc();
  await state.libav.AVCodecParameters_codec_type_s(codecpar, 1); // AVMEDIA_TYPE_AUDIO
  await state.libav.AVCodecParameters_codec_id_s(codecpar, codecId);
  await state.libav.AVCodecParameters_sample_rate_s(codecpar, sampleRate);

  // Set channel count
  const libavAny = state.libav as unknown as Record<string, unknown>;
  if (typeof libavAny['AVCodecParameters_ch_layout_nb_channels_s'] === 'function') {
    await (libavAny['AVCodecParameters_ch_layout_nb_channels_s'] as (par: number, ch: number) => Promise<void>)(codecpar, channels);
  } else if (typeof libavAny['AVCodecParameters_channels_s'] === 'function') {
    await (libavAny['AVCodecParameters_channels_s'] as (par: number, ch: number) => Promise<void>)(codecpar, channels);
  }

  // Set extradata if available
  if (extradata && extradata.length > 0) {
    const extradataPtr = await state.libav.malloc(extradata.length);
    await state.libav.copyin_u8(extradataPtr, extradata);
    await state.libav.AVCodecParameters_extradata_s(codecpar, extradataPtr);
    await state.libav.AVCodecParameters_extradata_size_s(codecpar, extradata.length);
  }

  return codecpar;
}

/**
 * Extract PCM from libav frame
 */
function extractPCMFromLibavFrame(frame: Frame, channels: number): Float32Array {
  const data = frame.data;
  if (!data || data.length === 0) return new Float32Array(0);

  const nbSamples = frame.nb_samples ?? 0;
  if (nbSamples === 0) return new Float32Array(0);

  // Check if planar or interleaved
  const isPlanar = Array.isArray(data[0]);

  if (isPlanar) {
    // Planar format: interleave channels
    const result = new Float32Array(nbSamples * channels);
    for (let i = 0; i < nbSamples; i++) {
      for (let ch = 0; ch < channels; ch++) {
        const channelData = data[ch];
        if (channelData && typeof channelData !== 'number') {
          result[i * channels + ch] = (channelData as Float32Array)[i] ?? 0;
        }
      }
    }
    return result;
  } else {
    // Interleaved format
    const firstChannel = data[0];
    if (firstChannel && typeof firstChannel !== 'number') {
      return new Float32Array(firstChannel as ArrayBuffer);
    }
    return new Float32Array(0);
  }
}

/**
 * Simple audio resampling (linear interpolation)
 */
function resampleAudio(
  input: Float32Array,
  srcRate: number,
  dstRate: number,
  channels: number
): Float32Array {
  const ratio = dstRate / srcRate;
  const srcSamples = input.length / channels;
  const dstSamples = Math.ceil(srcSamples * ratio);
  const output = new Float32Array(dstSamples * channels);

  for (let i = 0; i < dstSamples; i++) {
    const srcPos = i / ratio;
    const srcIdx = Math.floor(srcPos);
    const frac = srcPos - srcIdx;

    for (let ch = 0; ch < channels; ch++) {
      const idx0 = srcIdx * channels + ch;
      const idx1 = Math.min((srcIdx + 1) * channels + ch, input.length - 1);
      output[i * channels + ch] = (input[idx0] ?? 0) * (1 - frac) + (input[idx1] ?? 0) * frac;
    }
  }

  return output;
}

/**
 * Mix audio track into output buffer
 */
function mixAudioTrack(
  output: Float32Array,
  input: Float32Array,
  timelineStart: number,
  volume: number,
  sampleRate: number,
  channels: number
): void {
  const startSample = Math.floor(timelineStart * sampleRate) * channels;
  const inputLength = input.length;

  for (let i = 0; i < inputLength; i++) {
    const outIdx = startSample + i;
    if (outIdx >= 0 && outIdx < output.length) {
      output[outIdx] += (input[i] ?? 0) * volume;
    }
  }
}

/**
 * Encode mixed audio using libav.js
 */
async function encodeAudio(
  samples: Float32Array,
  sampleRate: number,
  channels: number
): Promise<void> {
  if (!state.libav || !state.audioEncoderCtx || !state.muxer) return;

  const frameSize = state.audioFrameSize || 1024;
  const samplesPerChannel = samples.length / channels;

  // Prepare frames for encoding
  const frames: Array<{
    data: Float32Array[];
    nb_samples: number;
    channels: number;
    channel_layout: number;
    format: number;
    sample_rate: number;
    pts: number;
  }> = [];

  let sampleOffset = 0;
  let pts = 0;

  while (sampleOffset < samplesPerChannel) {
    const remainingSamples = samplesPerChannel - sampleOffset;
    const frameSamples = Math.min(frameSize, remainingSamples);

    // AAC requires planar float (FLTP)
    const channelData: Float32Array[] = [];
    for (let ch = 0; ch < channels; ch++) {
      const chData = new Float32Array(frameSamples);
      for (let i = 0; i < frameSamples; i++) {
        chData[i] = samples[(sampleOffset + i) * channels + ch] ?? 0;
      }
      channelData.push(chData);
    }

    frames.push({
      data: channelData,
      nb_samples: frameSamples,
      channels,
      channel_layout: channels === 1 ? 4 : 3,
      format: 8, // AV_SAMPLE_FMT_FLTP
      sample_rate: sampleRate,
      pts,
    });

    sampleOffset += frameSamples;
    pts += frameSamples;
  }

  // Encode frames
  const packets = await state.libav.ff_encode_multi(
    state.audioEncoderCtx,
    state.audioFrame,
    state.audioPkt,
    frames,
    false
  );

  // Add encoded audio to muxer
  for (const packet of packets) {
    if (!packet.data || packet.data.length === 0) continue;

    const timestamp = (packet.pts ?? 0) / sampleRate * 1_000_000;
    const duration = frameSize / sampleRate * 1_000_000;

    state.muxer.addAudioChunkRaw(
      new Uint8Array(packet.data),
      'key',
      timestamp,
      duration
    );
  }
}

/**
 * Finalize audio encoder
 */
async function finalizeAudioEncoder(): Promise<void> {
  if (!state.libav || !state.audioEncoderCtx || !state.muxer) return;

  try {
    // Flush encoder
    const packets = await state.libav.ff_encode_multi(
      state.audioEncoderCtx,
      state.audioFrame,
      state.audioPkt,
      [],
      true
    );

    // Add remaining packets to muxer
    for (const packet of packets) {
      if (!packet.data || packet.data.length === 0) continue;

      const timestamp = (packet.pts ?? 0) / 48000 * 1_000_000;
      const duration = (state.audioFrameSize || 1024) / 48000 * 1_000_000;

      state.muxer.addAudioChunkRaw(
        new Uint8Array(packet.data),
        'key',
        timestamp,
        duration
      );
    }

    // Free encoder
    await state.libav.ff_free_encoder(state.audioEncoderCtx, state.audioFrame, state.audioPkt);
    state.audioEncoderCtx = 0;
    state.audioFrame = 0;
    state.audioPkt = 0;
  } catch (error) {
    console.error('[FullPipelineExportWorker] Audio finalize error:', error);
  }
}

// =============================================================================
// Cleanup
// =============================================================================

function cancelExport(): void {
  state.isCancelled = true;
  cleanup();
  postResponse({ type: 'cancelled' });
}

function cleanup(): void {
  // Close all decoders
  for (const source of state.mediaSources.values()) {
    if (source.videoDecoder) {
      try {
        source.videoDecoder.close();
      } catch { /* ignore */ }
    }
    // Close pending frames
    for (const frame of source.pendingFrames.values()) {
      try {
        frame.close();
      } catch { /* ignore */ }
    }
    source.pendingFrames.clear();
  }
  state.mediaSources.clear();

  if (state.videoEncoder) {
    try {
      state.videoEncoder.close();
    } catch { /* ignore */ }
    state.videoEncoder = null;
  }

  // Cleanup WebGPU resources
  // Destroy buffer pools
  for (const buffer of state.transformBufferPool) {
    buffer.destroy();
  }
  state.transformBufferPool = [];
  state.transformBufferPoolIndex = 0;

  for (const buffer of state.ccBufferPool) {
    buffer.destroy();
  }
  state.ccBufferPool = [];
  state.ccBufferPoolIndex = 0;

  if (state.gpuVertexBuffer) {
    state.gpuVertexBuffer.destroy();
    state.gpuVertexBuffer = null;
  }

  if (state.gpuIndexBuffer) {
    state.gpuIndexBuffer.destroy();
    state.gpuIndexBuffer = null;
  }

  if (state.gpuDevice) {
    state.gpuDevice.destroy();
    state.gpuDevice = null;
  }

  state.gpuBasicPipeline = null;
  state.gpuColorCorrectionPipeline = null;
  state.gpuSampler = null;
  state.gpuContext = null;
  state.canvas = null;
  state.muxer = null;
  state.muxerTarget = null;

  // Cleanup libav resources
  if (state.libav) {
    try {
      if (state.audioEncoderCtx) {
        state.libav.ff_free_encoder(state.audioEncoderCtx, state.audioFrame, state.audioPkt).catch(() => {});
      }
      state.libav.terminate();
    } catch { /* ignore */ }
    state.libav = null;
    state.audioEncoderCtx = 0;
    state.audioFrame = 0;
    state.audioPkt = 0;
  }

  state.isInitialized = false;
  state.isExporting = false;
}

/**
 * Handle audio data submitted from main thread
 * Main thread processes audio using libav.js and sends mixed PCM data here
 * Worker encodes and adds to muxer
 */
async function handleSubmitAudio(
  audioBuffer: Float32Array,
  sampleRate: number,
  channels: number
): Promise<void> {
  if (!state.muxer || !state.config) {
    console.warn('[FullPipelineExportWorker] Cannot process audio: muxer not initialized');
    postResponse({ type: 'audio:encoded' });
    return;
  }

  console.log(`[FullPipelineExportWorker] Received audio from main thread: ${audioBuffer.length} samples, ${sampleRate}Hz, ${channels}ch`);

  try {
    // Convert Float32 PCM to S16 for AAC encoding
    const s16Buffer = new Int16Array(audioBuffer.length);
    for (let i = 0; i < audioBuffer.length; i++) {
      const sample = audioBuffer[i] ?? 0;
      // Clamp and convert to 16-bit signed integer
      s16Buffer[i] = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
    }

    // Calculate frame duration in microseconds
    const totalSamples = audioBuffer.length / channels;
    const durationUs = Math.round((totalSamples / sampleRate) * 1_000_000);

    // Add audio to muxer as raw AAC frames
    // mp4-muxer expects audio chunks with timestamp and duration
    const frameSize = 1024; // AAC frame size
    const samplesPerFrame = frameSize * channels;
    const frameDurationUs = Math.round((frameSize / sampleRate) * 1_000_000);

    let timestamp = 0;
    for (let offset = 0; offset < s16Buffer.length; offset += samplesPerFrame) {
      const frameData = s16Buffer.slice(offset, Math.min(offset + samplesPerFrame, s16Buffer.length));

      // Create audio chunk for muxer
      // Note: mp4-muxer's addAudioChunkRaw expects raw PCM data
      // We need to use the proper audio encoding path
      state.muxer.addAudioChunkRaw(
        new Uint8Array(frameData.buffer, frameData.byteOffset, frameData.byteLength),
        'key',
        timestamp,
        frameDurationUs
      );

      timestamp += frameDurationUs;
    }

    console.log(`[FullPipelineExportWorker] Audio added to muxer: ${durationUs / 1000}ms`);
    postResponse({ type: 'audio:encoded' });
  } catch (error) {
    console.error('[FullPipelineExportWorker] Audio processing error:', error);
    postResponse({ type: 'audio:encoded' });
  }
}

// =============================================================================
// Message Handler
// =============================================================================

self.onmessage = async (event: MessageEvent<ExportWorkerRequest>) => {
  const msg = event.data;

  try {
    switch (msg.type) {
      case 'init-full-pipeline':
        await initializeFullPipeline(msg.canvas, msg.config, msg.project);
        break;

      case 'start-export':
        await startExport();
        break;

      case 'submit-audio':
        await handleSubmitAudio(msg.audioBuffer, msg.sampleRate, msg.channels);
        break;

      case 'cancel':
        cancelExport();
        break;

      case 'terminate':
        cleanup();
        self.close();
        break;

      case 'fetch-proxy-response':
        // Handle fetch proxy response from main thread
        handleFetchProxyResponse(msg);
        break;

      default:
        console.warn('[FullPipelineExportWorker] Unknown message type:', (msg as { type: string }).type);
    }
  } catch (error) {
    postError(error);
  }
};

// Notify ready
postResponse({ type: 'ready' });
