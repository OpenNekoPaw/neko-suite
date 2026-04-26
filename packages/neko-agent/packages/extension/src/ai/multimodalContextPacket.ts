import type {
  MultimodalContextPacket,
  PerceptionInputRef,
  ArtifactRef,
  ProjectObjectRef,
  SelectionRef,
  ProjectData,
  TimelineElement,
} from '@neko/shared';

export interface CanvasSelectionContextNode {
  readonly nodeId: string;
  readonly type: string;
  readonly summary: string;
  readonly assetUri?: string;
  readonly assetKind?: ArtifactRef['kind'];
  readonly bounds?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

export interface CanvasSelectionContextOptions {
  readonly createdAt?: number;
  readonly userAnnotation?: string;
}

export interface TimelineEditorContextInput {
  readonly content: unknown;
  readonly selectedElementIds: readonly string[];
  readonly selectedTrackId?: string;
  readonly currentTime?: number;
  readonly timeRange?: { readonly start: number; readonly end: number };
  readonly userAnnotation?: string;
  readonly createdAt?: number;
}

export function createTimelineContextPacketFromEditor(
  input: TimelineEditorContextInput,
): MultimodalContextPacket | null {
  const project = asProjectData(input.content);
  const selectedElements = project
    ? resolveTimelineSelection(project, input.selectedElementIds, input.selectedTrackId)
    : input.selectedElementIds.map((elementId) => ({
        elementId,
        ...(input.selectedTrackId ? { trackId: input.selectedTrackId } : {}),
      }));

  return createTimelineSelectionContextPacket(selectedElements, {
    ...(input.createdAt !== undefined ? { createdAt: input.createdAt } : {}),
    ...(input.currentTime !== undefined ? { playheadMs: secondsToMs(input.currentTime) } : {}),
    ...(input.timeRange
      ? {
          rangeStartMs: secondsToMs(input.timeRange.start),
          rangeEndMs: secondsToMs(input.timeRange.end),
        }
      : {}),
    ...(input.selectedTrackId ? { activeTrackId: input.selectedTrackId } : {}),
    ...(input.userAnnotation ? { userAnnotation: input.userAnnotation } : {}),
  });
}

export interface TimelineSelectionContextElement {
  readonly elementId: string;
  readonly trackId?: string;
  readonly sourceUri?: string;
  readonly mediaType?: 'video' | 'image' | 'audio' | 'text' | 'unknown';
  readonly startMs?: number;
  readonly durationMs?: number;
  readonly trimStartMs?: number;
  readonly trimEndMs?: number;
  readonly sourceInMs?: number;
  readonly sourceOutMs?: number;
  readonly resourceId?: string;
  readonly engineObjectId?: string;
  readonly lineage?: unknown;
  readonly summary?: string;
}

export interface TimelineSelectionContextOptions {
  readonly createdAt?: number;
  readonly playheadMs?: number;
  readonly rangeStartMs?: number;
  readonly rangeEndMs?: number;
  readonly activeTrackId?: string;
  readonly userAnnotation?: string;
}

export function createTimelineSelectionContextPacket(
  selectedElements: readonly TimelineSelectionContextElement[],
  options: TimelineSelectionContextOptions = {},
): MultimodalContextPacket | null {
  if (selectedElements.length === 0 && options.rangeStartMs === undefined) {
    return null;
  }

  const createdAt = options.createdAt ?? Date.now();
  const selection = selectedElements.map((element) => toTimelineSelectionRef(element, options));
  const artifactRefs = selectedElements.flatMap(toTimelineArtifactRefs);
  const projectRefs = selectedElements.map(toTimelineProjectObjectRef);
  const perceptionInputs = selectedElements.map((element) =>
    toTimelinePerceptionInputRef(element, options),
  );

  return {
    id: createContextPacketId('timeline'),
    selection,
    artifactRefs,
    projectRefs,
    perceptionInputs,
    uiContext: {
      activePanel: 'timeline',
      selectionIds: selection.map((item) => item.id),
      timeline: {
        ...(options.playheadMs !== undefined ? { playheadMs: options.playheadMs } : {}),
        ...(options.rangeStartMs !== undefined ? { rangeStartMs: options.rangeStartMs } : {}),
        ...(options.rangeEndMs !== undefined ? { rangeEndMs: options.rangeEndMs } : {}),
        ...(options.activeTrackId ? { activeTrackId: options.activeTrackId } : {}),
      },
      ...(options.userAnnotation ? { userAnnotation: options.userAnnotation } : {}),
    },
    createdAt,
  };
}

export function createCanvasSelectionContextPacket(
  selectedNodes: readonly CanvasSelectionContextNode[],
  options: CanvasSelectionContextOptions = {},
): MultimodalContextPacket | null {
  if (selectedNodes.length === 0) {
    return null;
  }

  const createdAt = options.createdAt ?? Date.now();
  const selection = selectedNodes.map(toCanvasSelectionRef);
  const artifactRefs = selectedNodes.flatMap(toCanvasArtifactRefs);
  const projectRefs = selectedNodes.map(toCanvasProjectObjectRef);
  const perceptionInputs = selectedNodes.map(toCanvasPerceptionInputRef);

  return {
    id: createContextPacketId('canvas'),
    selection,
    artifactRefs,
    projectRefs,
    perceptionInputs,
    uiContext: {
      activePanel: 'canvas',
      selectionIds: selection.map((item) => item.id),
      ...(options.userAnnotation ? { userAnnotation: options.userAnnotation } : {}),
    },
    createdAt,
  };
}

function createContextPacketId(scope: 'timeline' | 'canvas'): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `ctx-${scope}-${globalThis.crypto.randomUUID()}`;
  }

  return `ctx-${scope}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toCanvasSelectionRef(node: CanvasSelectionContextNode): SelectionRef {
  return {
    id: `sel-canvas-${node.nodeId}`,
    kind: 'canvas-node',
    panel: 'canvas',
    projectObjectId: `canvas-node-${node.nodeId}`,
    metadata: {
      nodeId: node.nodeId,
      type: node.type,
      summary: node.summary,
      ...(node.bounds ? { bounds: node.bounds } : {}),
      ...(node.assetUri ? { assetUri: node.assetUri } : {}),
    },
  };
}

function toCanvasArtifactRefs(node: CanvasSelectionContextNode): ArtifactRef[] {
  if (!node.assetUri) {
    return [];
  }

  return [
    {
      id: `artifact-canvas-node-${node.nodeId}`,
      kind: node.assetKind ?? 'unknown',
      uri: node.assetUri,
      metadata: {
        nodeId: node.nodeId,
        type: node.type,
      },
    },
  ];
}

function toCanvasProjectObjectRef(node: CanvasSelectionContextNode): ProjectObjectRef {
  return {
    id: `canvas-node-${node.nodeId}`,
    kind: 'canvas-node',
    artifactIds: node.assetUri ? [`artifact-canvas-node-${node.nodeId}`] : [],
    metadata: {
      nodeId: node.nodeId,
      type: node.type,
      summary: node.summary,
      ...(node.bounds ? { bounds: node.bounds } : {}),
      ...(node.assetUri ? { assetUri: node.assetUri } : {}),
    },
  };
}

function toCanvasPerceptionInputRef(node: CanvasSelectionContextNode): PerceptionInputRef {
  const hasVisualAsset =
    node.assetUri && (node.assetKind === 'image' || node.assetKind === 'video');
  return {
    id: `input-canvas-node-${node.nodeId}`,
    kind: hasVisualAsset ? 'canvas-crop' : 'structured-data',
    modality: hasVisualAsset ? 'image' : 'data',
    sourceSelectionId: `sel-canvas-${node.nodeId}`,
    ...(node.assetUri
      ? { artifactId: `artifact-canvas-node-${node.nodeId}`, uri: node.assetUri }
      : {}),
    projectObjectId: `canvas-node-${node.nodeId}`,
    metadata: {
      nodeId: node.nodeId,
      type: node.type,
      summary: node.summary,
      ...(node.bounds ? { bounds: node.bounds } : {}),
      ...(node.assetKind ? { assetKind: node.assetKind } : {}),
    },
  };
}

function toTimelineSelectionRef(
  element: TimelineSelectionContextElement,
  options: TimelineSelectionContextOptions,
): SelectionRef {
  return {
    id: `sel-timeline-${element.elementId}`,
    kind: 'timeline-clip',
    panel: 'timeline',
    projectObjectId: `timeline-clip-${element.elementId}`,
    ...(element.sourceUri ? { artifactId: `artifact-${element.elementId}` } : {}),
    ...(options.playheadMs !== undefined ? { timeMs: options.playheadMs } : {}),
    ...(options.rangeStartMs !== undefined ? { rangeStartMs: options.rangeStartMs } : {}),
    ...(options.rangeEndMs !== undefined ? { rangeEndMs: options.rangeEndMs } : {}),
    metadata: {
      elementId: element.elementId,
      ...(element.trackId ? { trackId: element.trackId } : {}),
      ...(element.summary ? { summary: element.summary } : {}),
    },
  };
}

function toTimelineArtifactRefs(element: TimelineSelectionContextElement): ArtifactRef[] {
  if (!element.sourceUri) {
    return [];
  }

  return [
    {
      id: `artifact-${element.elementId}`,
      kind: toArtifactKind(element.mediaType),
      uri: element.sourceUri,
      metadata: {
        elementId: element.elementId,
        ...(element.trackId ? { trackId: element.trackId } : {}),
      },
    },
  ];
}

function toTimelineProjectObjectRef(element: TimelineSelectionContextElement): ProjectObjectRef {
  return {
    id: `timeline-clip-${element.elementId}`,
    kind: 'timeline-clip',
    engineObjectId: element.engineObjectId ?? createTimelineEngineObjectId(element),
    artifactIds: element.sourceUri ? [`artifact-${element.elementId}`] : [],
    metadata: {
      elementId: element.elementId,
      ...(element.trackId ? { trackId: element.trackId } : {}),
      ...(element.startMs !== undefined ? { startMs: element.startMs } : {}),
      ...(element.durationMs !== undefined ? { durationMs: element.durationMs } : {}),
      ...(element.trimStartMs !== undefined ? { trimStartMs: element.trimStartMs } : {}),
      ...(element.trimEndMs !== undefined ? { trimEndMs: element.trimEndMs } : {}),
      ...(element.sourceInMs !== undefined ? { sourceInMs: element.sourceInMs } : {}),
      ...(element.sourceOutMs !== undefined ? { sourceOutMs: element.sourceOutMs } : {}),
      ...(element.resourceId ? { resourceId: element.resourceId } : {}),
      ...(element.lineage !== undefined ? { lineage: element.lineage } : {}),
      ...(element.summary ? { summary: element.summary } : {}),
    },
  };
}

function toTimelinePerceptionInputRef(
  element: TimelineSelectionContextElement,
  options: TimelineSelectionContextOptions,
): PerceptionInputRef {
  const isAudio = element.mediaType === 'audio';
  const isVideo = element.mediaType === 'video';
  return {
    id: `input-timeline-${element.elementId}`,
    kind: isAudio ? 'audio-segment' : isVideo ? 'video-frame' : 'structured-data',
    modality: isAudio ? 'audio' : isVideo ? 'image' : 'data',
    sourceSelectionId: `sel-timeline-${element.elementId}`,
    ...(element.sourceUri
      ? { artifactId: `artifact-${element.elementId}`, uri: element.sourceUri }
      : {}),
    projectObjectId: `timeline-clip-${element.elementId}`,
    ...(options.playheadMs !== undefined ? { timeMs: options.playheadMs } : {}),
    ...(options.rangeStartMs !== undefined ? { rangeStartMs: options.rangeStartMs } : {}),
    ...(options.rangeEndMs !== undefined ? { rangeEndMs: options.rangeEndMs } : {}),
    metadata: {
      elementId: element.elementId,
      ...(element.trackId ? { trackId: element.trackId } : {}),
      ...(element.mediaType ? { mediaType: element.mediaType } : {}),
      ...(element.startMs !== undefined ? { startMs: element.startMs } : {}),
      ...(element.durationMs !== undefined ? { durationMs: element.durationMs } : {}),
      ...(element.trimStartMs !== undefined ? { trimStartMs: element.trimStartMs } : {}),
      ...(element.trimEndMs !== undefined ? { trimEndMs: element.trimEndMs } : {}),
      ...(element.sourceInMs !== undefined ? { sourceInMs: element.sourceInMs } : {}),
      ...(element.sourceOutMs !== undefined ? { sourceOutMs: element.sourceOutMs } : {}),
      ...(element.resourceId ? { resourceId: element.resourceId } : {}),
      engineObjectId: element.engineObjectId ?? createTimelineEngineObjectId(element),
      ...(element.lineage !== undefined ? { lineage: element.lineage } : {}),
      ...(element.summary ? { summary: element.summary } : {}),
    },
  };
}

function toArtifactKind(
  mediaType: TimelineSelectionContextElement['mediaType'],
): ArtifactRef['kind'] {
  if (mediaType === 'video' || mediaType === 'image' || mediaType === 'audio') {
    return mediaType;
  }
  return 'metadata';
}

function resolveTimelineSelection(
  project: ProjectData,
  selectedElementIds: readonly string[],
  selectedTrackId?: string,
): TimelineSelectionContextElement[] {
  const selectedIds = new Set(selectedElementIds);
  const elements: TimelineSelectionContextElement[] = [];

  for (const track of project.tracks) {
    if (selectedTrackId && track.id !== selectedTrackId) {
      continue;
    }

    for (const element of track.elements) {
      if (!selectedIds.has(element.id)) {
        continue;
      }

      elements.push(toTimelineSelectionElement(element, track.id));
    }
  }

  return elements;
}

function toTimelineSelectionElement(
  element: TimelineElement,
  trackId: string,
): TimelineSelectionContextElement {
  return {
    elementId: element.id,
    trackId,
    ...readElementSource(element),
    engineObjectId: createTimelineEngineObjectId({ elementId: element.id, trackId }),
    ...readElementEngineMetadata(element),
    startMs: secondsToMs(element.startTime),
    durationMs: secondsToMs(element.duration),
    trimStartMs: secondsToMs(element.trimStart),
    trimEndMs: secondsToMs(element.trimEnd),
    sourceInMs: secondsToMs(element.trimStart),
    sourceOutMs: secondsToMs(element.trimStart + element.duration),
    summary: element.name,
  };
}

function createTimelineEngineObjectId(
  element: Pick<TimelineSelectionContextElement, 'elementId' | 'trackId'>,
): string {
  return element.trackId
    ? `timeline:${element.trackId}:${element.elementId}`
    : `timeline:${element.elementId}`;
}

function readElementEngineMetadata(
  element: TimelineElement,
): Pick<TimelineSelectionContextElement, 'resourceId' | 'lineage'> {
  return {
    ...((element.type === 'media' || element.type === 'audio') && element.resourceId
      ? { resourceId: element.resourceId }
      : {}),
    ...(element.lineage !== undefined ? { lineage: element.lineage } : {}),
  };
}

function readElementSource(
  element: TimelineElement,
): Pick<TimelineSelectionContextElement, 'sourceUri' | 'mediaType'> {
  if (element.type === 'media') {
    return { sourceUri: element.src, mediaType: element.mediaType ?? 'video' };
  }

  if (element.type === 'audio') {
    return { sourceUri: element.src, mediaType: 'audio' };
  }

  return { mediaType: element.type === 'text' ? 'text' : 'unknown' };
}

function asProjectData(value: unknown): ProjectData | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const candidate = value as { readonly tracks?: unknown };
  return Array.isArray(candidate.tracks) ? (value as ProjectData) : null;
}

function secondsToMs(seconds: number): number {
  return Math.round(seconds * 1000);
}
