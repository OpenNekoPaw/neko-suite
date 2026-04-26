import type {
  EditOperation,
  IOperationToolAdapter,
  OperationToolAdapterContext,
  OperationToolIntent,
  OperationToolPlan,
  ProjectData,
  TimelineElement,
} from '@neko/shared';

export interface TimelineElementUpdateAdapterOptions {
  readonly now?: () => number;
  readonly idPrefix?: string;
}

export function createTimelineElementUpdateAdapter(
  options: TimelineElementUpdateAdapterOptions = {},
): IOperationToolAdapter {
  const now = options.now ?? Date.now;
  const idPrefix = options.idPrefix ?? 'timeline-element-update';

  return {
    domain: 'timeline',
    canPlan: (intent, context) =>
      createTimelineElementDraft(intent, context, now, idPrefix) !== null,
    plan: async (intent, context) => {
      const draft = createTimelineElementDraft(intent, context, now, idPrefix);
      if (!draft) {
        throw new Error('Cannot plan timeline element operation for the provided intent');
      }
      return draft;
    },
  };
}

function createTimelineElementDraft(
  intent: OperationToolIntent,
  context: OperationToolAdapterContext,
  now: () => number,
  idPrefix: string,
): OperationToolPlan | null {
  if (intent.domain !== 'timeline' || intent.targetIds.length === 0) {
    return null;
  }

  const project = readProjectData(context.metadata);
  const elementId = intent.targetIds[0];
  if (!project || !elementId) {
    return null;
  }

  const match = findTimelineElement(project, elementId, readString(intent.parameters, 'trackId'));
  if (!match) {
    return null;
  }

  const splitPoint = readNumber(intent.parameters, 'splitPoint');
  if (splitPoint !== undefined) {
    return createElementSplitPlan(intent, elementId, match, splitPoint, now, idPrefix);
  }

  const updates = readSupportedElementUpdates(intent.parameters);
  if (Object.keys(updates).length > 0) {
    return createElementUpdatePlan(intent, elementId, match, updates, now, idPrefix);
  }

  const toTrackId = readString(intent.parameters, 'toTrackId');
  if (toTrackId) {
    return createElementMovePlan(intent, elementId, match, toTrackId, project, now, idPrefix);
  }

  return null;
}

function createElementUpdatePlan(
  intent: OperationToolIntent,
  elementId: string,
  match: TimelineElementMatch,
  updates: Partial<TimelineElement>,
  now: () => number,
  idPrefix: string,
): OperationToolPlan {
  const beforeUpdates = pickBeforeUpdates(match.element, Object.keys(updates));
  const timestamp = now();
  const operation: EditOperation = {
    type: 'element.update',
    meta: { id: `${idPrefix}:${intent.id}`, timestamp, source: 'ai', description: intent.summary },
    payload: { trackId: match.trackId, elementId, updates },
    before: { updates: beforeUpdates },
  };
  return createSingleOperationPlan(intent, operation, timestamp);
}

function createElementMovePlan(
  intent: OperationToolIntent,
  elementId: string,
  match: TimelineElementMatch,
  toTrackId: string,
  project: ProjectData,
  now: () => number,
  idPrefix: string,
): OperationToolPlan | null {
  if (toTrackId === match.trackId || !project.tracks.some((track) => track.id === toTrackId)) {
    return null;
  }

  const timestamp = now();
  const operation: EditOperation = {
    type: 'element.move',
    meta: { id: `${idPrefix}:${intent.id}`, timestamp, source: 'ai', description: intent.summary },
    payload: { fromTrackId: match.trackId, toTrackId, elementId },
    before: { fromIndex: match.index },
  };
  return createSingleOperationPlan(intent, operation, timestamp);
}

function createElementSplitPlan(
  intent: OperationToolIntent,
  elementId: string,
  match: TimelineElementMatch,
  splitPoint: number,
  now: () => number,
  idPrefix: string,
): OperationToolPlan | null {
  if (!isValidSplitPoint(match.element, splitPoint)) {
    return null;
  }

  const splitMode = readSplitMode(intent.parameters);
  const timestamp = now();
  const meta = {
    id: `${idPrefix}:${intent.id}`,
    timestamp,
    source: 'ai' as const,
    description: intent.summary,
  };

  if (splitMode === 'keep-left') {
    const operation: EditOperation = {
      type: 'element.splitKeepLeft',
      meta,
      payload: {
        trackId: match.trackId,
        elementId,
        splitPoint,
        newName: readString(intent.parameters, 'newName') ?? match.element.name,
      },
      before: { trimEnd: match.element.trimEnd, name: match.element.name },
    };
    return createSingleOperationPlan(intent, operation, timestamp);
  }

  if (splitMode === 'keep-right') {
    const newStartTime =
      readNumber(intent.parameters, 'newStartTime') ??
      match.element.startTime + Math.max(0, splitPoint - match.element.trimStart);
    const operation: EditOperation = {
      type: 'element.splitKeepRight',
      meta,
      payload: {
        trackId: match.trackId,
        elementId,
        splitPoint,
        newStartTime,
        newName: readString(intent.parameters, 'newName') ?? match.element.name,
      },
      before: {
        startTime: match.element.startTime,
        trimStart: match.element.trimStart,
        name: match.element.name,
      },
    };
    return createSingleOperationPlan(intent, operation, timestamp);
  }

  const rightElement: TimelineElement = {
    ...match.element,
    id: readString(intent.parameters, 'rightElementId') ?? `${elementId}:right:${intent.id}`,
    name: readString(intent.parameters, 'rightElementName') ?? `${match.element.name} (right)`,
    startTime:
      readNumber(intent.parameters, 'rightStartTime') ??
      match.element.startTime + Math.max(0, splitPoint - match.element.trimStart),
    trimStart: splitPoint,
    trimEnd: match.element.trimEnd,
  };
  const operation: EditOperation = {
    type: 'element.splitAt',
    meta,
    payload: { trackId: match.trackId, elementId, splitPoint, rightElement },
    before: { trimEnd: match.element.trimEnd },
  };
  return createSingleOperationPlan(intent, operation, timestamp);
}

function createSingleOperationPlan(
  intent: OperationToolIntent,
  operation: EditOperation,
  timestamp: number,
): OperationToolPlan {
  return {
    id: `plan:${intent.id}`,
    intentId: intent.id,
    rationaleId: intent.rationaleId,
    operations: [operation],
    requiresUserApproval: intent.requiresUserApproval ?? intent.risk === 'high',
    reversible: true,
    createdAt: timestamp,
  };
}

function isValidSplitPoint(element: TimelineElement, splitPoint: number): boolean {
  return splitPoint > element.trimStart && splitPoint < element.duration - element.trimEnd;
}

type SplitMode = 'at' | 'keep-left' | 'keep-right';

function readSplitMode(parameters: OperationToolIntent['parameters']): SplitMode {
  const mode = readString(parameters, 'splitMode') ?? readString(parameters, 'mode');
  if (mode === 'keep-left' || mode === 'keep-right' || mode === 'at') {
    return mode;
  }
  return 'at';
}

function readProjectData(metadata: OperationToolAdapterContext['metadata']): ProjectData | null {
  const projectData = metadata?.['projectData'];
  if (typeof projectData !== 'object' || projectData === null || Array.isArray(projectData)) {
    return null;
  }

  const candidate = projectData as { readonly tracks?: unknown };
  return Array.isArray(candidate.tracks) ? (projectData as ProjectData) : null;
}

function readSupportedElementUpdates(
  parameters: OperationToolIntent['parameters'],
): Partial<TimelineElement> {
  const updates = readRecord(parameters, 'updates');
  const next: Partial<TimelineElement> = {};

  const name = updates ? readString(updates, 'name') : readString(parameters, 'name');
  if (name !== undefined) {
    next.name = name;
  }

  const hidden = updates ? readBoolean(updates, 'hidden') : readBoolean(parameters, 'hidden');
  if (hidden !== undefined) {
    next.hidden = hidden;
  }

  const muted = updates ? readBoolean(updates, 'muted') : readBoolean(parameters, 'muted');
  if (muted !== undefined) {
    next.muted = muted;
  }

  const locked = updates ? readBoolean(updates, 'locked') : readBoolean(parameters, 'locked');
  if (locked !== undefined) {
    next.locked = locked;
  }

  const startTime = updates
    ? readNumber(updates, 'startTime')
    : readNumber(parameters, 'startTime');
  if (startTime !== undefined) {
    next.startTime = startTime;
  }

  const duration = updates ? readNumber(updates, 'duration') : readNumber(parameters, 'duration');
  if (duration !== undefined) {
    next.duration = duration;
  }

  const trimStart = updates
    ? readNumber(updates, 'trimStart')
    : readNumber(parameters, 'trimStart');
  if (trimStart !== undefined) {
    next.trimStart = trimStart;
  }

  const trimEnd = updates ? readNumber(updates, 'trimEnd') : readNumber(parameters, 'trimEnd');
  if (trimEnd !== undefined) {
    next.trimEnd = trimEnd;
  }

  return next;
}

interface TimelineElementMatch {
  readonly trackId: string;
  readonly element: TimelineElement;
  readonly index: number;
}

function findTimelineElement(
  project: ProjectData,
  elementId: string,
  preferredTrackId?: string,
): TimelineElementMatch | null {
  for (const track of project.tracks) {
    if (preferredTrackId && track.id !== preferredTrackId) {
      continue;
    }

    const index = track.elements.findIndex((item) => item.id === elementId);
    const element = index >= 0 ? track.elements[index] : undefined;
    if (element) {
      return { trackId: track.id, element, index };
    }
  }

  return null;
}

function pickBeforeUpdates(
  element: TimelineElement,
  keys: readonly string[],
): Partial<TimelineElement> {
  const before: Partial<TimelineElement> = {};
  for (const key of keys) {
    if (key === 'name') {
      before.name = element.name;
    } else if (key === 'hidden') {
      before.hidden = element.hidden;
    } else if (key === 'muted') {
      before.muted = element.muted;
    } else if (key === 'locked') {
      before.locked = element.locked;
    } else if (key === 'startTime') {
      before.startTime = element.startTime;
    } else if (key === 'duration') {
      before.duration = element.duration;
    } else if (key === 'trimStart') {
      before.trimStart = element.trimStart;
    } else if (key === 'trimEnd') {
      before.trimEnd = element.trimEnd;
    }
  }
  return before;
}

function readRecord(
  value: Readonly<Record<string, unknown>> | undefined,
  key: string,
): Readonly<Record<string, unknown>> | undefined {
  const nested = value?.[key];
  if (typeof nested !== 'object' || nested === null || Array.isArray(nested)) {
    return undefined;
  }
  return nested as Readonly<Record<string, unknown>>;
}

function readString(
  value: Readonly<Record<string, unknown>> | undefined,
  key: string,
): string | undefined {
  const candidate = value?.[key];
  return typeof candidate === 'string' ? candidate : undefined;
}

function readBoolean(
  value: Readonly<Record<string, unknown>> | undefined,
  key: string,
): boolean | undefined {
  const candidate = value?.[key];
  return typeof candidate === 'boolean' ? candidate : undefined;
}

function readNumber(
  value: Readonly<Record<string, unknown>> | undefined,
  key: string,
): number | undefined {
  const candidate = value?.[key];
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : undefined;
}
