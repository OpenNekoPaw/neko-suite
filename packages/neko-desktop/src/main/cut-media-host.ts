import { access } from 'node:fs/promises';
import { dirname, isAbsolute, join, sep } from 'node:path';
import { EngineClient, type ActionRequest, type ActionResponse } from '@neko/neko-client';
import type { ProbeResult, WaveformResult } from '@neko/neko-client';
import type {
  DesktopFeatureWebviewHostMessage,
  DesktopFeatureWebviewMessageRequest,
} from '../shared/contracts';
import type { EngineConnectionStatus } from './engine-connection';
import type { DesktopProjectFileIoAdapter } from './project-file-io';

export interface DesktopCutMediaEngineClient {
  readonly port: number;
  dispatch(request: ActionRequest): Promise<ActionResponse>;
  probe(group: 'videos' | 'audios', source: string): Promise<ProbeResult>;
  waveform(source: string, options?: { readonly peaksPerSecond?: number }): Promise<WaveformResult>;
}

export interface DesktopCutMediaHostDeps {
  readonly getProjectFileIo: () => DesktopProjectFileIoAdapter;
  readonly probeEngineConnection: () => Promise<EngineConnectionStatus>;
  readonly createEngineClient?: (port: number) => DesktopCutMediaEngineClient;
}

interface CutMediaRouteContext {
  readonly request: DesktopFeatureWebviewMessageRequest;
  readonly message: Readonly<Record<string, unknown>>;
  readonly route: string;
  readonly requestId: string;
  readonly deps: DesktopCutMediaHostDeps;
}

export async function handleDesktopCutMediaMessage(
  request: DesktopFeatureWebviewMessageRequest,
  deps: DesktopCutMediaHostDeps,
): Promise<readonly DesktopFeatureWebviewHostMessage[] | undefined> {
  const message = asRecord(request.message);
  if (!message) {
    return undefined;
  }
  const route = typeof message['type'] === 'string' ? message['type'] : undefined;
  if (!route?.startsWith('media:')) {
    return undefined;
  }

  if (request.runtimeId !== '@neko/webview/root') {
    return [
      createMediaErrorResponse(message, `Cut media route '${route}' cannot be handled by ${request.runtimeId}.`),
    ];
  }

  const requestId = typeof message['requestId'] === 'string' ? message['requestId'] : undefined;
  if (!requestId) {
    return [
      {
        type: 'desktopFeatureDiagnostic',
        diagnostic: {
          code: 'invalid-feature-webview-message',
          runtimeId: request.runtimeId,
          panelKind: request.panelKind,
          route,
          message: `Cut media route '${route}' requires a requestId.`,
        },
      },
    ];
  }

  const context: CutMediaRouteContext = { request, message, route, requestId, deps };
  try {
    switch (route) {
      case 'media:probeMediaInfo':
        return [await handleProbeMediaInfo(context)];
      case 'media:getWaveform':
        return [await handleGetWaveform(context)];
      case 'media:getVideoFrame':
        return [await handleGetVideoFrame(context)];
      case 'media:getVideoFrameRange':
        return [await handleGetVideoFrameRange(context)];
      case 'media:compatibleGetVideoFrame':
        return [await handleCompatibleGetVideoFrame(context)];
      case 'media:extractSubtitles':
        return [await handleExtractSubtitles(context)];
      case 'media:getMediaBitrate':
        return [await handleGetMediaBitrate(context)];
      case 'media:getStreamStats':
        return [
          {
            type: 'media:response:getStreamStats',
            requestId,
            payload: null,
          },
        ];
      case 'media:decodeAudioSegment':
      case 'media:renderCompositeFrame':
        return [
          createMediaErrorResponse(
            message,
            `Desktop Cut media route is not implemented yet: ${route}`,
          ),
        ];
      default:
        if (route.startsWith('media:frameServer:')) {
          return [
            createDesktopCutMediaDiagnostic(
              request,
              route,
              `Desktop Cut frame server route is not implemented yet: ${route}`,
            ),
          ];
        }
        return [
          createMediaErrorResponse(
            message,
            `Desktop Cut media route is not implemented yet: ${route}`,
          ),
        ];
    }
  } catch (error: unknown) {
    return [createMediaErrorResponse(message, describeUnknownError(error))];
  }
}

async function handleProbeMediaInfo(
  context: CutMediaRouteContext,
): Promise<DesktopFeatureWebviewHostMessage> {
  const payload = readPayload(context.message);
  const source = readRequiredString(payload, 'videoPath', context.route);
  const client = await createReachableEngineClient(context);
  const mediaInfo = await probeMedia(client, await resolveCutMediaSource(source, context));
  return {
    type: 'media:response:probeMediaInfo',
    requestId: context.requestId,
    payload: {
      duration: mediaInfo.duration,
      width: mediaInfo.width,
      height: mediaInfo.height,
      fps: mediaInfo.fps,
      codec: mediaInfo.codec,
      format: mediaInfo.format,
      bitrate: mediaInfo.bitrate,
      hasAudio: mediaInfo.hasAudio,
      audioCodec: mediaInfo.audioCodec,
      audioSampleRate: mediaInfo.audioSampleRate,
      audioChannels: mediaInfo.audioChannels,
      audioBitrate: mediaInfo.audioBitrate,
      hasSubtitles: false,
      subtitleStreams: [],
    },
  };
}

async function handleGetWaveform(
  context: CutMediaRouteContext,
): Promise<DesktopFeatureWebviewHostMessage> {
  const payload = readPayload(context.message);
  const source = readRequiredString(payload, 'filePath', context.route);
  const client = await createReachableEngineClient(context);
  const waveform = await client.waveform(await resolveCutMediaSource(source, context));
  return {
    type: 'media:response:getWaveform',
    requestId: context.requestId,
    payload: {
      sampleRate: waveform.sampleRate,
      channels: waveform.channels,
      peaksPerSecond: waveform.peaksPerSecond,
      duration: waveform.duration,
      peaks: waveform.channelPeaks ?? [waveform.peaks],
    },
  };
}

async function handleGetVideoFrame(
  context: CutMediaRouteContext,
): Promise<DesktopFeatureWebviewHostMessage> {
  const payload = readPayload(context.message);
  const source = readRequiredString(payload, 'videoPath', context.route);
  const timeInSeconds = readFiniteNumber(payload, 'timeInSeconds', context.route);
  const client = await createReachableEngineClient(context);
  const absoluteSource = await resolveCutMediaSource(source, context);
  const scale = readOptionalFiniteNumber(payload, 'scale');
  const size = scale !== undefined && scale > 0 && scale < 1
    ? await readScaledFrameSize(client, absoluteSource, scale)
    : undefined;
  return {
    type: 'media:response:getVideoFrame',
    requestId: context.requestId,
    payload: {
      imageDataUrl: await captureFrameDataUrl(client, absoluteSource, timeInSeconds, {
        quality: readOptionalFiniteNumber(payload, 'quality') ?? 85,
        ...(size ? { width: size.width, height: size.height } : {}),
      }),
    },
  };
}

async function handleGetVideoFrameRange(
  context: CutMediaRouteContext,
): Promise<DesktopFeatureWebviewHostMessage> {
  const payload = readPayload(context.message);
  const source = readRequiredString(payload, 'videoPath', context.route);
  const startTime = readFiniteNumber(payload, 'startTime', context.route);
  const duration = readFiniteNumber(payload, 'duration', context.route);
  const fps = readFiniteNumber(payload, 'fps', context.route);
  const maxFrames = readOptionalFiniteNumber(payload, 'maxFrames');
  const client = await createReachableEngineClient(context);
  const absoluteSource = await resolveCutMediaSource(source, context);
  const actualDuration = maxFrames ? Math.min(duration, maxFrames / fps) : duration;
  const frameCount = Math.max(0, Math.ceil(actualDuration * fps));
  const frameInterval = 1 / fps;
  const quality = readOptionalFiniteNumber(payload, 'quality') ?? 85;
  const frames: Array<{ readonly time: number; readonly imageDataUrl: string }> = [];

  for (let index = 0; index < frameCount; index += 1) {
    const time = startTime + index * frameInterval;
    frames.push({
      time,
      imageDataUrl: await captureFrameDataUrl(client, absoluteSource, time, { quality }),
    });
  }

  return {
    type: 'media:response:getVideoFrameRange',
    requestId: context.requestId,
    payload: {
      frames,
      mimeType: 'image/jpeg',
    },
  };
}

async function handleCompatibleGetVideoFrame(
  context: CutMediaRouteContext,
): Promise<DesktopFeatureWebviewHostMessage> {
  const payload = readPayload(context.message);
  const source = readRequiredString(payload, 'videoPath', context.route);
  const timeInSeconds = readFiniteNumber(payload, 'timeInSeconds', context.route);
  const client = await createReachableEngineClient(context);
  const absoluteSource = await resolveCutMediaSource(source, context);
  const width = readOptionalFiniteNumber(payload, 'width');
  const height = readOptionalFiniteNumber(payload, 'height');
  return {
    type: 'media:response:compatibleGetVideoFrame',
    requestId: context.requestId,
    payload: {
      imageDataUrl: await captureFrameDataUrl(client, absoluteSource, timeInSeconds, {
        quality: 85,
        ...(width !== undefined ? { width } : {}),
        ...(height !== undefined ? { height } : {}),
      }),
      width: width ?? 0,
      height: height ?? 0,
    },
  };
}

async function handleExtractSubtitles(
  context: CutMediaRouteContext,
): Promise<DesktopFeatureWebviewHostMessage> {
  const payload = readPayload(context.message);
  const source = readRequiredString(payload, 'videoPath', context.route);
  const client = await createReachableEngineClient(context);
  const absoluteSource = await resolveCutMediaSource(source, context);
  const response = await client.dispatch({
    group: 'videos',
    action: 'extract',
    id: absoluteSource,
    options: {
      source: absoluteSource,
      type: 'subtitles',
    },
  });
  assertActionOk(response, 'videos:extract');
  return {
    type: 'media:response:extractSubtitles',
    requestId: context.requestId,
    payload: response.data,
  };
}

async function handleGetMediaBitrate(
  context: CutMediaRouteContext,
): Promise<DesktopFeatureWebviewHostMessage> {
  const payload = readPayload(context.message);
  const source = readRequiredString(payload, 'mediaPath', context.route);
  const client = await createReachableEngineClient(context);
  const mediaInfo = await probeMedia(client, await resolveCutMediaSource(source, context));
  const videoBitrate = mediaInfo.bitrate ?? 0;
  const audioBitrate = mediaInfo.audioBitrate ?? 0;
  const totalBitrate = videoBitrate + audioBitrate;
  return {
    type: 'media:response:getMediaBitrate',
    requestId: context.requestId,
    payload: {
      videoBitrate,
      audioBitrate,
      totalBitrate,
      videoBitrateStr: formatBitrate(videoBitrate),
      totalBitrateStr: formatBitrate(totalBitrate),
    },
  };
}

async function createReachableEngineClient(
  context: CutMediaRouteContext,
): Promise<DesktopCutMediaEngineClient> {
  const status = await context.deps.probeEngineConnection();
  if (!status.reachable) {
    throw new Error(status.diagnostic);
  }
  return context.deps.createEngineClient?.(status.port) ?? new EngineClient(status.port);
}

async function probeMedia(
  client: DesktopCutMediaEngineClient,
  source: string,
): Promise<ProbeResult> {
  try {
    return await client.probe('videos', source);
  } catch {
    return client.probe('audios', source);
  }
}

async function captureFrameDataUrl(
  client: DesktopCutMediaEngineClient,
  source: string,
  time: number,
  options: {
    readonly quality: number;
    readonly width?: number;
    readonly height?: number;
  },
): Promise<string> {
  const response = await client.dispatch({
    group: 'videos',
    action: 'capture',
    options: {
      source,
      time,
      quality: options.quality,
      format: 'jpeg',
      ...(options.width !== undefined ? { width: options.width } : {}),
      ...(options.height !== undefined ? { height: options.height } : {}),
    },
  });
  assertActionOk(response, 'videos:capture');

  const data = asRecord(response.data);
  const base64 = readOptionalString(data, 'data') ?? readOptionalString(data, 'base64');
  if (!base64) {
    throw new Error('videos:capture returned no image data.');
  }
  return base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
}

async function readScaledFrameSize(
  client: DesktopCutMediaEngineClient,
  source: string,
  scale: number,
): Promise<{ readonly width: number; readonly height: number } | undefined> {
  try {
    const mediaInfo = await probeMedia(client, source);
    if (mediaInfo.width <= 0 || mediaInfo.height <= 0) {
      return undefined;
    }
    return {
      width: Math.max(1, Math.round(mediaInfo.width * scale)),
      height: Math.max(1, Math.round(mediaInfo.height * scale)),
    };
  } catch {
    return undefined;
  }
}

async function resolveCutMediaSource(
  source: string,
  context: CutMediaRouteContext,
): Promise<string> {
  if (isRemoteUrl(source)) {
    return source;
  }
  if (source.trim().length === 0) {
    throw new Error('Cut media source path is required.');
  }

  const fileIo = context.deps.getProjectFileIo();
  const expandedSource = source
    .replace(/^\$\{WORKSPACE\}(?:\/|\\)?/u, '')
    .replace(/^\$\{PROJECT\}(?:\/|\\)?/u, '');
  if (isAbsolute(expandedSource)) {
    return fileIo.resolveWorkspacePath(expandedSource);
  }

  const documentDirectory = dirname(context.request.relativePath);
  const documentRelativeCandidate =
    documentDirectory === '.' ? expandedSource : join(documentDirectory, expandedSource);
  const candidates = uniqueStrings([documentRelativeCandidate, expandedSource]);

  for (const candidate of candidates) {
    const absoluteCandidate = fileIo.resolveWorkspacePath(candidate);
    if (await fileExists(absoluteCandidate)) {
      return absoluteCandidate;
    }
  }

  return fileIo.resolveWorkspacePath(candidates[0] ?? expandedSource);
}

function createMediaErrorResponse(
  message: Readonly<Record<string, unknown>> | undefined,
  error: string,
): DesktopFeatureWebviewHostMessage {
  const type = typeof message?.['type'] === 'string' ? message['type'] : 'media:unknown';
  const requestId = typeof message?.['requestId'] === 'string' ? message['requestId'] : 'unknown';
  const responseType = type.startsWith('media:response:')
    ? type
    : `media:response:${type.slice('media:'.length)}`;
  return {
    type: responseType,
    requestId,
    error,
  };
}

function createDesktopCutMediaDiagnostic(
  request: DesktopFeatureWebviewMessageRequest,
  route: string,
  message: string,
): DesktopFeatureWebviewHostMessage {
  return {
    type: 'desktopFeatureDiagnostic',
    diagnostic: {
      code: 'unsupported-feature-webview-route',
      runtimeId: request.runtimeId,
      panelKind: request.panelKind,
      route,
      message,
    },
  };
}

function assertActionOk(response: ActionResponse, label: string): void {
  if (response.status === 'error') {
    throw new Error(response.error?.message ?? `${label} failed.`);
  }
}

function readPayload(message: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const payload = message['payload'];
  if (!isRecord(payload)) {
    throw new Error(`${message['type'] ?? 'media request'} payload must be an object.`);
  }
  return payload;
}

function readRequiredString(
  value: Readonly<Record<string, unknown>> | undefined,
  key: string,
  route: string,
): string {
  const result = readOptionalString(value, key);
  if (!result) {
    throw new Error(`${route} payload.${key} is required.`);
  }
  return result;
}

function readOptionalString(
  value: Readonly<Record<string, unknown>> | undefined,
  key: string,
): string | undefined {
  const result = value?.[key];
  return typeof result === 'string' ? result : undefined;
}

function readFiniteNumber(
  value: Readonly<Record<string, unknown>>,
  key: string,
  route: string,
): number {
  const result = readOptionalFiniteNumber(value, key);
  if (result === undefined) {
    throw new Error(`${route} payload.${key} must be a finite number.`);
  }
  return result;
}

function readOptionalFiniteNumber(
  value: Readonly<Record<string, unknown>>,
  key: string,
): number | undefined {
  const result = value[key];
  return typeof result === 'number' && Number.isFinite(result) ? result : undefined;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function formatBitrate(bitsPerSecond: number): string {
  if (bitsPerSecond >= 1_000_000) {
    return `${(bitsPerSecond / 1_000_000).toFixed(1)} Mbps`;
  }
  if (bitsPerSecond >= 1_000) {
    return `${(bitsPerSecond / 1_000).toFixed(0)} Kbps`;
  }
  return `${bitsPerSecond} bps`;
}

function isRemoteUrl(source: string): boolean {
  return /^https?:\/\//iu.test(source);
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => normalizePath(value)).filter(Boolean))];
}

function normalizePath(value: string): string {
  return value.split(sep).join('/');
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describeUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
