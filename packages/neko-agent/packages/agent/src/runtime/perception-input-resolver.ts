import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { MultimodalContextPacket, PerceptionInputRef } from '@neko/shared';

export interface FrameExtractionClient {
  extractFrame(
    source: string,
    time: number,
    options?: { quality?: number; format?: string; width?: number; height?: number },
  ): Promise<ArrayBuffer | null>;
}

export interface ImageCaptureClient {
  captureImage?(
    source: string,
    options?: { quality?: number; format?: string; width?: number; height?: number },
  ): Promise<ArrayBuffer | null>;
}

export interface AudioSegmentExtractionClient {
  extractAudioSegment?(
    source: string,
    start: number,
    duration: number,
    options?: { format?: string; sampleRate?: number; channels?: number },
  ): Promise<ArrayBuffer | null>;
}

export type TimelinePerceptionInputClient = FrameExtractionClient &
  AudioSegmentExtractionClient &
  ImageCaptureClient;

export interface PerceptionInputResolverFsOps {
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
}

export interface ResolvePerceptionInputsOptions {
  readonly engineClient: TimelinePerceptionInputClient;
  readonly workspaceRoot: string;
  readonly fsOps?: PerceptionInputResolverFsOps;
  readonly cacheDir?: string;
  readonly imageFormat?: 'jpeg' | 'png';
  readonly audioFormat?: 'wav' | 'mp3' | 'flac';
  readonly quality?: number;
  readonly audioSampleRate?: number;
  readonly audioChannels?: number;
}

const DEFAULT_CACHE_DIR = '.neko/.cache/perception';
const PROJECT_URI_PREFIX = '${PROJECT}';

const nodeFsOps: PerceptionInputResolverFsOps = {
  mkdir: async (targetPath, options) => {
    await fs.mkdir(targetPath, options);
  },
  writeFile: async (targetPath, data) => {
    await fs.writeFile(targetPath, data);
  },
};

export async function resolveTimelinePerceptionInputs(
  packet: MultimodalContextPacket,
  options: ResolvePerceptionInputsOptions,
): Promise<MultimodalContextPacket> {
  const fsOps = options.fsOps ?? nodeFsOps;
  const cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR;
  const resolvedInputs: PerceptionInputRef[] = [];

  for (const input of packet.perceptionInputs) {
    const resolvedInput = await resolveTimelinePerceptionInput(input, options, fsOps, cacheDir);
    resolvedInputs.push(resolvedInput);
  }

  return { ...packet, perceptionInputs: resolvedInputs };
}

export function resolveTimelineVideoFrameInputs(
  packet: MultimodalContextPacket,
  options: ResolvePerceptionInputsOptions,
): Promise<MultimodalContextPacket> {
  return resolveTimelinePerceptionInputs(packet, options);
}

async function resolveTimelinePerceptionInput(
  input: PerceptionInputRef,
  options: ResolvePerceptionInputsOptions,
  fsOps: PerceptionInputResolverFsOps,
  cacheDir: string,
): Promise<PerceptionInputRef> {
  const inputUri = input.uri;
  if (input.kind === 'video-frame' && inputUri) {
    return resolveVideoFrameInput(input, inputUri, options, fsOps, cacheDir);
  }

  if (input.kind === 'audio-segment' && inputUri && options.engineClient.extractAudioSegment) {
    return resolveAudioSegmentInput(input, inputUri, options, fsOps, cacheDir);
  }

  if (input.kind === 'canvas-crop' && inputUri && options.engineClient.captureImage) {
    return resolveCanvasCropInput(input, inputUri, options, fsOps, cacheDir);
  }

  return input;
}

async function resolveVideoFrameInput(
  input: PerceptionInputRef,
  inputUri: string,
  options: ResolvePerceptionInputsOptions,
  fsOps: PerceptionInputResolverFsOps,
  cacheDir: string,
): Promise<PerceptionInputRef> {
  const sourcePath = resolveProjectUri(inputUri, options.workspaceRoot);
  const sourceTimeMs = resolveSourceTimeMs(input);
  const imageFormat = options.imageFormat ?? 'jpeg';
  const frameData = await options.engineClient.extractFrame(sourcePath, sourceTimeMs / 1000, {
    quality: options.quality ?? 85,
    format: imageFormat,
  });

  if (!frameData) {
    return input;
  }

  const extension = imageFormat === 'png' ? 'png' : 'jpg';
  const outputRelativePath = path.posix.join(
    cacheDir,
    `${sanitizeFilePart(input.id)}-${sourceTimeMs}.${extension}`,
  );
  const outputPath = path.join(options.workspaceRoot, ...outputRelativePath.split('/'));
  await writeResolvedInput(fsOps, outputPath, frameData);

  return {
    ...input,
    kind: 'image-file',
    uri: `${PROJECT_URI_PREFIX}/${outputRelativePath}`,
    metadata: {
      ...readMetadata(input),
      resolvedFromInputId: input.id,
      resolvedSourceUri: inputUri,
      resolvedSourceTimeMs: sourceTimeMs,
    },
  };
}

async function resolveCanvasCropInput(
  input: PerceptionInputRef,
  inputUri: string,
  options: ResolvePerceptionInputsOptions,
  fsOps: PerceptionInputResolverFsOps,
  cacheDir: string,
): Promise<PerceptionInputRef> {
  const captureImage = options.engineClient.captureImage;
  if (!captureImage) {
    return input;
  }

  const sourcePath = resolveProjectUri(inputUri, options.workspaceRoot);
  const imageFormat = options.imageFormat ?? 'jpeg';
  const bounds = readBounds(readMetadata(input), 'bounds');
  const imageData = await captureImage(sourcePath, {
    quality: options.quality ?? 85,
    format: imageFormat,
    ...(bounds ? { width: Math.round(bounds.width), height: Math.round(bounds.height) } : {}),
  });

  if (!imageData) {
    return input;
  }

  const extension = imageFormat === 'png' ? 'png' : 'jpg';
  const outputRelativePath = path.posix.join(
    cacheDir,
    `${sanitizeFilePart(input.id)}-canvas-crop.${extension}`,
  );
  const outputPath = path.join(options.workspaceRoot, ...outputRelativePath.split('/'));
  await writeResolvedInput(fsOps, outputPath, imageData);

  return {
    ...input,
    kind: 'image-file',
    uri: `${PROJECT_URI_PREFIX}/${outputRelativePath}`,
    metadata: {
      ...readMetadata(input),
      resolvedFromInputId: input.id,
      resolvedSourceUri: inputUri,
      resolvedInputKind: 'canvas-crop',
      ...(bounds ? { resolvedCropBounds: bounds } : {}),
    },
  };
}

async function resolveAudioSegmentInput(
  input: PerceptionInputRef,
  inputUri: string,
  options: ResolvePerceptionInputsOptions,
  fsOps: PerceptionInputResolverFsOps,
  cacheDir: string,
): Promise<PerceptionInputRef> {
  const extractAudioSegment = options.engineClient.extractAudioSegment;
  if (!extractAudioSegment) {
    return input;
  }

  const sourcePath = resolveProjectUri(inputUri, options.workspaceRoot);
  const sourceStartMs = resolveSourceRangeStartMs(input);
  const sourceDurationMs = resolveSourceDurationMs(input);
  if (sourceDurationMs <= 0) {
    return input;
  }

  const audioFormat = options.audioFormat ?? 'wav';
  const segmentData = await extractAudioSegment(
    sourcePath,
    sourceStartMs / 1000,
    sourceDurationMs / 1000,
    {
      format: audioFormat,
      ...(options.audioSampleRate !== undefined ? { sampleRate: options.audioSampleRate } : {}),
      ...(options.audioChannels !== undefined ? { channels: options.audioChannels } : {}),
    },
  );

  if (!segmentData) {
    return input;
  }

  const outputRelativePath = path.posix.join(
    cacheDir,
    `${sanitizeFilePart(input.id)}-${sourceStartMs}-${sourceDurationMs}.${audioFormat}`,
  );
  const outputPath = path.join(options.workspaceRoot, ...outputRelativePath.split('/'));
  await writeResolvedInput(fsOps, outputPath, segmentData);

  return {
    ...input,
    uri: `${PROJECT_URI_PREFIX}/${outputRelativePath}`,
    metadata: {
      ...readMetadata(input),
      resolvedFromInputId: input.id,
      resolvedSourceUri: inputUri,
      resolvedSourceStartMs: sourceStartMs,
      resolvedSourceDurationMs: sourceDurationMs,
    },
  };
}

async function writeResolvedInput(
  fsOps: PerceptionInputResolverFsOps,
  outputPath: string,
  data: ArrayBuffer,
): Promise<void> {
  await fsOps.mkdir(path.dirname(outputPath), { recursive: true });
  await fsOps.writeFile(outputPath, new Uint8Array(data));
}

function resolveProjectUri(uri: string, workspaceRoot: string): string {
  if (uri === PROJECT_URI_PREFIX) {
    return workspaceRoot;
  }

  if (uri.startsWith(`${PROJECT_URI_PREFIX}/`)) {
    return path.join(workspaceRoot, ...uri.slice(PROJECT_URI_PREFIX.length + 1).split('/'));
  }

  return uri;
}

function resolveSourceTimeMs(input: PerceptionInputRef): number {
  const metadata = readMetadata(input);
  const timeMs = input.timeMs ?? 0;
  const startMs = readNumber(metadata, 'startMs') ?? 0;
  const sourceInMs = readNumber(metadata, 'sourceInMs') ?? 0;
  return Math.max(0, Math.round(sourceInMs + Math.max(0, timeMs - startMs)));
}

function resolveSourceRangeStartMs(input: PerceptionInputRef): number {
  const metadata = readMetadata(input);
  const rangeStartMs = input.rangeStartMs ?? input.timeMs ?? readNumber(metadata, 'startMs') ?? 0;
  const startMs = readNumber(metadata, 'startMs') ?? 0;
  const sourceInMs = readNumber(metadata, 'sourceInMs') ?? 0;
  return Math.max(0, Math.round(sourceInMs + Math.max(0, rangeStartMs - startMs)));
}

function resolveSourceDurationMs(input: PerceptionInputRef): number {
  const metadata = readMetadata(input);
  const sourceOutMs = readNumber(metadata, 'sourceOutMs');
  const sourceInMs = readNumber(metadata, 'sourceInMs') ?? 0;
  const metadataDurationMs = readNumber(metadata, 'durationMs');

  if (input.rangeStartMs !== undefined && input.rangeEndMs !== undefined) {
    return Math.max(0, Math.round(input.rangeEndMs - input.rangeStartMs));
  }

  if (metadataDurationMs !== undefined) {
    return Math.max(0, Math.round(metadataDurationMs));
  }

  if (sourceOutMs !== undefined) {
    return Math.max(0, Math.round(sourceOutMs - sourceInMs));
  }

  return 0;
}

function readMetadata(input: PerceptionInputRef): Readonly<Record<string, unknown>> {
  return input.metadata ?? {};
}

interface InputBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function readBounds(
  metadata: Readonly<Record<string, unknown>>,
  key: string,
): InputBounds | undefined {
  const value = metadata[key];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Readonly<Record<string, unknown>>;
  const x = readNumber(record, 'x');
  const y = readNumber(record, 'y');
  const width = readNumber(record, 'width');
  const height = readNumber(record, 'height');
  if (x === undefined || y === undefined || width === undefined || height === undefined) {
    return undefined;
  }
  return { x, y, width, height };
}

function readNumber(metadata: Readonly<Record<string, unknown>>, key: string): number | undefined {
  const value = metadata[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function sanitizeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-');
}
