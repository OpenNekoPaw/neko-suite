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

  if (isRenderFrameDiagnostics(value.diagnostics)) {
    meta.diagnostics = value.diagnostics;
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

function isRenderFrameDiagnostics(value: unknown): value is EngineRenderFrameDiagnostics {
  return isRecord(value);
}
