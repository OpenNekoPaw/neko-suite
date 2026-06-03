import type {
  EngineRenderFrameDiagnostics,
  RenderFrameMeta,
  RenderStreamDescriptor,
} from '@neko/shared';

export function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function readRenderFrameMeta(value: unknown): RenderFrameMeta | null {
  if (!isRecord(value)) {
    return null;
  }

  const streamId = readString(value.streamId);
  const viewportId = readString(value.viewportId);
  const frameId = readFiniteNumber(value.frameId);
  const ptsUs = readFiniteNumber(value.ptsUs);
  const durationUs = readFiniteNumber(value.durationUs);
  const isKeyframe = readBoolean(value.isKeyframe);
  const sceneRevision = readFiniteNumber(value.sceneRevision);
  const appliedSeq = readFiniteNumber(value.appliedSeq);

  if (
    streamId === undefined ||
    viewportId === undefined ||
    frameId === undefined ||
    ptsUs === undefined ||
    durationUs === undefined ||
    isKeyframe === undefined ||
    sceneRevision === undefined ||
    appliedSeq === undefined
  ) {
    return null;
  }

  const meta: RenderFrameMeta = {
    streamId,
    viewportId,
    frameId,
    ptsUs,
    durationUs,
    isKeyframe,
    sceneRevision,
    appliedSeq,
    frameTimestamp: readFiniteNumber(value.frameTimestamp) ?? ptsUs / 1000,
    viewTransform: readViewTransform(value.viewTransform) ?? [1, 0, 0, 1, 0, 0],
  };

  const diagnostics = readRenderFrameDiagnostics(value.diagnostics);
  if (diagnostics !== undefined) {
    meta.diagnostics = diagnostics;
  }

  const sceneId = readString(value.sceneId);
  if (sceneId !== undefined) {
    meta.sceneId = sceneId;
  }

  const projectionJson = readString(value.projectionJson);
  if (projectionJson !== undefined) {
    meta.projectionJson = projectionJson;
  }

  const activePreviewMode = readString(value.activePreviewMode);
  if (activePreviewMode !== undefined) {
    meta.activePreviewMode = activePreviewMode;
  }

  const previewPlaybackClockMs = readFiniteNumber(value.previewPlaybackClockMs);
  if (previewPlaybackClockMs !== undefined) {
    meta.previewPlaybackClockMs = previewPlaybackClockMs;
  }

  return meta;
}

export function descriptorSceneId(descriptor: RenderStreamDescriptor): string {
  const descriptorWithSceneId = descriptor as RenderStreamDescriptor & {
    sceneId?: unknown;
  };
  return readString(descriptorWithSceneId.sceneId) ?? 'default';
}

export function trimOldestMapEntry<TKey, TValue>(map: Map<TKey, TValue>, maxSize: number): void {
  if (map.size <= maxSize) {
    return;
  }
  const oldest = map.keys().next().value as TKey | undefined;
  if (oldest !== undefined) {
    map.delete(oldest);
  }
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function readRenderFrameDiagnostics(
  value: unknown,
): EngineRenderFrameDiagnostics | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const diagnostics: EngineRenderFrameDiagnostics = {};
  const gpuFrameTimeMs = readFiniteNumber(value.gpuFrameTimeMs);
  if (gpuFrameTimeMs !== undefined) diagnostics.gpuFrameTimeMs = gpuFrameTimeMs;
  const encodeTimeMs = readFiniteNumber(value.encodeTimeMs);
  if (encodeTimeMs !== undefined) diagnostics.encodeTimeMs = encodeTimeMs;
  if (typeof value.qualityTier === 'string') diagnostics.qualityTier = value.qualityTier;
  const droppedFramesSinceLast = readFiniteNumber(value.droppedFramesSinceLast);
  if (droppedFramesSinceLast !== undefined)
    diagnostics.droppedFramesSinceLast = droppedFramesSinceLast;
  const gpuUploadTimeMs = readFiniteNumber(value.gpuUploadTimeMs);
  if (gpuUploadTimeMs !== undefined) diagnostics.gpuUploadTimeMs = gpuUploadTimeMs;
  if (typeof value.renderPath === 'string') diagnostics.renderPath = value.renderPath;
  const iosurfaceCreations = readFiniteNumber(value.iosurfaceCreations);
  if (iosurfaceCreations !== undefined) diagnostics.iosurfaceCreations = iosurfaceCreations;
  const textureAllocations = readFiniteNumber(value.textureAllocations);
  if (textureAllocations !== undefined) diagnostics.textureAllocations = textureAllocations;
  const renderTimeMs = readFiniteNumber(value.renderTimeMs);
  if (renderTimeMs !== undefined) diagnostics.renderTimeMs = renderTimeMs;
  const convertTimeMs = readFiniteNumber(value.convertTimeMs);
  if (convertTimeMs !== undefined) diagnostics.convertTimeMs = convertTimeMs;
  const decodeTimeMs = readFiniteNumber(value.decodeTimeMs);
  if (decodeTimeMs !== undefined) diagnostics.decodeTimeMs = decodeTimeMs;
  const drawTimeMs = readFiniteNumber(value.drawTimeMs);
  if (drawTimeMs !== undefined) diagnostics.drawTimeMs = drawTimeMs;
  const queueDepth = readFiniteNumber(value.queueDepth);
  if (queueDepth !== undefined) diagnostics.queueDepth = queueDepth;
  const gpuWaitTimeMs = readFiniteNumber(value.gpuWaitTimeMs);
  if (gpuWaitTimeMs !== undefined) diagnostics.gpuWaitTimeMs = gpuWaitTimeMs;
  const decodeSubmitToOutputMs = readFiniteNumber(value.decodeSubmitToOutputMs);
  if (decodeSubmitToOutputMs !== undefined) {
    diagnostics.decodeSubmitToOutputMs = decodeSubmitToOutputMs;
  }
  const droppedBeforeDecode = readFiniteNumber(value.droppedBeforeDecode);
  if (droppedBeforeDecode !== undefined) diagnostics.droppedBeforeDecode = droppedBeforeDecode;
  const decodedDroppedBeforePresent = readFiniteNumber(value.decodedDroppedBeforePresent);
  if (decodedDroppedBeforePresent !== undefined) {
    diagnostics.decodedDroppedBeforePresent = decodedDroppedBeforePresent;
  }
  const staleDecodedOutputsDropped = readFiniteNumber(value.staleDecodedOutputsDropped);
  if (staleDecodedOutputsDropped !== undefined) {
    diagnostics.staleDecodedOutputsDropped = staleDecodedOutputsDropped;
  }
  const packetToPresentedMs = readFiniteNumber(value.packetToPresentedMs);
  if (packetToPresentedMs !== undefined) diagnostics.packetToPresentedMs = packetToPresentedMs;
  const presentIntervalMs = readFiniteNumber(value.presentIntervalMs);
  if (presentIntervalMs !== undefined) diagnostics.presentIntervalMs = presentIntervalMs;
  const presentFps = readFiniteNumber(value.presentFps);
  if (presentFps !== undefined) diagnostics.presentFps = presentFps;
  const packetToDecodeSubmitMs = readFiniteNumber(value.packetToDecodeSubmitMs);
  if (packetToDecodeSubmitMs !== undefined) {
    diagnostics.packetToDecodeSubmitMs = packetToDecodeSubmitMs;
  }
  const packetToDecodeOutputMs = readFiniteNumber(value.packetToDecodeOutputMs);
  if (packetToDecodeOutputMs !== undefined) {
    diagnostics.packetToDecodeOutputMs = packetToDecodeOutputMs;
  }
  const decodeOutputToPresentedMs = readFiniteNumber(value.decodeOutputToPresentedMs);
  if (decodeOutputToPresentedMs !== undefined) {
    diagnostics.decodeOutputToPresentedMs = decodeOutputToPresentedMs;
  }
  const decodeOutputLagFrames = readFiniteNumber(value.decodeOutputLagFrames);
  if (decodeOutputLagFrames !== undefined)
    diagnostics.decodeOutputLagFrames = decodeOutputLagFrames;
  const producerFrameTimeMs = readFiniteNumber(value.producerFrameTimeMs);
  if (producerFrameTimeMs !== undefined) diagnostics.producerFrameTimeMs = producerFrameTimeMs;
  const streamSubmitTimeMs = readFiniteNumber(value.streamSubmitTimeMs);
  if (streamSubmitTimeMs !== undefined) diagnostics.streamSubmitTimeMs = streamSubmitTimeMs;
  const scheduleLagMs = readFiniteNumber(value.scheduleLagMs);
  if (scheduleLagMs !== undefined) diagnostics.scheduleLagMs = scheduleLagMs;
  const skippedIntervals = readFiniteNumber(value.skippedIntervals);
  if (skippedIntervals !== undefined) diagnostics.skippedIntervals = skippedIntervals;
  if (typeof value.presentationHostLimited === 'boolean') {
    diagnostics.presentationHostLimited = value.presentationHostLimited;
  }
  const webcodecsDecodeQueueSize = readFiniteNumber(value.webcodecsDecodeQueueSize);
  if (webcodecsDecodeQueueSize !== undefined) {
    diagnostics.webcodecsDecodeQueueSize = webcodecsDecodeQueueSize;
  }
  const pendingDecodeFrames = readFiniteNumber(value.pendingDecodeFrames);
  if (pendingDecodeFrames !== undefined) diagnostics.pendingDecodeFrames = pendingDecodeFrames;
  const decodeOutputIntervalMs = readFiniteNumber(value.decodeOutputIntervalMs);
  if (decodeOutputIntervalMs !== undefined) {
    diagnostics.decodeOutputIntervalMs = decodeOutputIntervalMs;
  }
  const decodeOutputBurst = readFiniteNumber(value.decodeOutputBurst);
  if (decodeOutputBurst !== undefined) diagnostics.decodeOutputBurst = decodeOutputBurst;
  const streamWidth = readFiniteNumber(value.streamWidth);
  if (streamWidth !== undefined) diagnostics.streamWidth = streamWidth;
  const streamHeight = readFiniteNumber(value.streamHeight);
  if (streamHeight !== undefined) diagnostics.streamHeight = streamHeight;
  const codedWidth = readFiniteNumber(value.codedWidth);
  if (codedWidth !== undefined) diagnostics.codedWidth = codedWidth;
  const codedHeight = readFiniteNumber(value.codedHeight);
  if (codedHeight !== undefined) diagnostics.codedHeight = codedHeight;
  const scheduledWidth = readFiniteNumber(value.scheduledWidth);
  if (scheduledWidth !== undefined) diagnostics.scheduledWidth = scheduledWidth;
  const scheduledHeight = readFiniteNumber(value.scheduledHeight);
  if (scheduledHeight !== undefined) diagnostics.scheduledHeight = scheduledHeight;
  const scheduledFps = readFiniteNumber(value.scheduledFps);
  if (scheduledFps !== undefined) diagnostics.scheduledFps = scheduledFps;
  const gopSize = readFiniteNumber(value.gopSize);
  if (gopSize !== undefined) diagnostics.gopSize = gopSize;
  const transportBitrateBps = readFiniteNumber(value.transportBitrateBps);
  if (transportBitrateBps !== undefined) diagnostics.transportBitrateBps = transportBitrateBps;
  if (typeof value.codecString === 'string') diagnostics.codecString = value.codecString;
  if (typeof value.codecProfile === 'string') diagnostics.codecProfile = value.codecProfile;
  if (typeof value.codecLevel === 'string') diagnostics.codecLevel = value.codecLevel;
  if (typeof value.latencyMode === 'string') diagnostics.latencyMode = value.latencyMode;
  if (typeof value.postProcessEnabled === 'boolean') {
    diagnostics.postProcessEnabled = value.postProcessEnabled;
  }
  if (typeof value.helperPassesEnabled === 'boolean') {
    diagnostics.helperPassesEnabled = value.helperPassesEnabled;
  }
  const renderMode = readViewportRenderMode(value.renderMode);
  if (renderMode !== undefined) {
    diagnostics.renderMode = renderMode;
  }

  return Object.keys(diagnostics).length > 0 ? diagnostics : undefined;
}

function readViewportRenderMode(value: unknown): EngineRenderFrameDiagnostics['renderMode'] {
  switch (value) {
    case 'pbr':
    case 'clay':
    case 'wireframe':
    case 'unlit':
    case 'normal':
    case 'depth':
    case 'lightComplexity':
    case 'shadowAtlas':
      return value;
    default:
      return undefined;
  }
}

export function readViewTransform(value: unknown): number[] | undefined {
  if (
    !Array.isArray(value) ||
    value.length !== 6 ||
    value.some((item) => readFiniteNumber(item) === undefined)
  ) {
    return undefined;
  }
  return value;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
