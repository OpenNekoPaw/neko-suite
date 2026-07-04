import type {
  EditOperation,
  IOperationToolAdapter,
  OperationToolAdapterContext,
  OperationToolIntent,
  OperationToolPlan,
  ProjectData,
  TimelineElement,
} from '@neko/shared';

type Scene3DModelElement = Extract<TimelineElement, { type: 'scene3d' }>;
type PuppetModelElement = Extract<TimelineElement, { type: 'puppet' }>;
type ModelTimelineElement = Scene3DModelElement | PuppetModelElement;
type ModelElementUpdates = Partial<Omit<Scene3DModelElement, 'type'>> &
  Partial<Omit<PuppetModelElement, 'type'>>;

export interface ModelElementUpdateAdapterOptions {
  readonly now?: () => number;
  readonly idPrefix?: string;
}

export function createModelElementUpdateAdapter(
  options: ModelElementUpdateAdapterOptions = {},
): IOperationToolAdapter {
  const now = options.now ?? Date.now;
  const idPrefix = options.idPrefix ?? 'model-element-update';

  return {
    domain: 'model',
    canPlan: (intent, context) => createModelElementPlan(intent, context, now, idPrefix) !== null,
    plan: async (intent, context) => {
      const plan = createModelElementPlan(intent, context, now, idPrefix);
      if (!plan) {
        throw new Error('Cannot plan model element operation for the provided intent');
      }
      return plan;
    },
  };
}

function createModelElementPlan(
  intent: OperationToolIntent,
  context: OperationToolAdapterContext,
  now: () => number,
  idPrefix: string,
): OperationToolPlan | null {
  if (intent.domain !== 'model' || intent.targetIds.length === 0) {
    return null;
  }

  const project = readProjectData(context.metadata);
  const elementId = intent.targetIds[0];
  if (!project || !elementId) {
    return null;
  }

  const match = findModelElement(project, elementId, readString(intent.parameters, 'trackId'));
  if (!match) {
    return null;
  }

  const updates = readSupportedModelUpdates(intent.parameters, match.element.type);
  if (Object.keys(updates).length === 0) {
    return null;
  }

  const timestamp = now();
  const operation: EditOperation = {
    type: 'element.update',
    meta: { id: `${idPrefix}:${intent.id}`, timestamp, source: 'ai', description: intent.summary },
    payload: { trackId: match.trackId, elementId, updates: toEditOperationUpdates(updates) },
    before: {
      updates: toEditOperationUpdates(pickBeforeUpdates(match.element, Object.keys(updates))),
    },
  };

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

interface ModelElementMatch {
  readonly trackId: string;
  readonly element: ModelTimelineElement;
}

function findModelElement(
  project: ProjectData,
  elementId: string,
  preferredTrackId?: string,
): ModelElementMatch | null {
  for (const track of project.tracks) {
    if (preferredTrackId && track.id !== preferredTrackId) {
      continue;
    }

    const element = track.elements.find((item) => item.id === elementId);
    if (element && isModelElement(element)) {
      return { trackId: track.id, element };
    }
  }
  return null;
}

function isModelElement(element: TimelineElement): element is ModelTimelineElement {
  return element.type === 'scene3d' || element.type === 'puppet';
}

function readSupportedModelUpdates(
  parameters: OperationToolIntent['parameters'],
  elementType: ModelTimelineElement['type'],
): ModelElementUpdates {
  const updates = readRecord(parameters, 'updates');
  const next: ModelElementUpdates = {};

  const animationClip = updates
    ? readString(updates, 'animationClip')
    : readString(parameters, 'animationClip');
  if (animationClip !== undefined) next.animationClip = animationClip;

  const animationLoop = updates
    ? readBoolean(updates, 'animationLoop')
    : readBoolean(parameters, 'animationLoop');
  if (animationLoop !== undefined) next.animationLoop = animationLoop;

  const animationSpeed = updates
    ? readNumber(updates, 'animationSpeed')
    : readNumber(parameters, 'animationSpeed');
  if (animationSpeed !== undefined) next.animationSpeed = animationSpeed;

  if (elementType === 'scene3d') {
    const cameraNodeId = updates
      ? readString(updates, 'cameraNodeId')
      : readString(parameters, 'cameraNodeId');
    if (cameraNodeId !== undefined) next.cameraNodeId = cameraNodeId;

    const backgroundColor = updates
      ? readRgba(updates, 'backgroundColor')
      : readRgba(parameters, 'backgroundColor');
    if (backgroundColor) next.backgroundColor = backgroundColor;

    const cameraOverride = updates
      ? readCameraOverride(updates, 'cameraOverride')
      : readCameraOverride(parameters, 'cameraOverride');
    if (cameraOverride) next.cameraOverride = cameraOverride;
  }

  if (elementType === 'puppet') {
    const expression = updates
      ? readString(updates, 'expression')
      : readString(parameters, 'expression');
    if (expression !== undefined) next.expression = expression;

    const parameterOverrides = updates
      ? readNumberRecord(updates, 'parameterOverrides')
      : readNumberRecord(parameters, 'parameterOverrides');
    if (parameterOverrides) next.parameterOverrides = parameterOverrides;
  }

  return next;
}

function pickBeforeUpdates(
  element: ModelTimelineElement,
  keys: readonly string[],
): ModelElementUpdates {
  const before: ModelElementUpdates = {};
  for (const key of keys) {
    if (key === 'animationClip') before.animationClip = element.animationClip;
    if (key === 'animationLoop') before.animationLoop = element.animationLoop;
    if (key === 'animationSpeed') before.animationSpeed = element.animationSpeed;
    if (element.type === 'scene3d') {
      if (key === 'cameraNodeId') before.cameraNodeId = element.cameraNodeId;
      if (key === 'backgroundColor') before.backgroundColor = element.backgroundColor;
      if (key === 'cameraOverride') before.cameraOverride = element.cameraOverride;
    }
    if (element.type === 'puppet') {
      if (key === 'expression') before.expression = element.expression;
      if (key === 'parameterOverrides') before.parameterOverrides = element.parameterOverrides;
    }
  }
  return before;
}

function toEditOperationUpdates(updates: ModelElementUpdates): Partial<TimelineElement> {
  return updates as Partial<TimelineElement>;
}

function readProjectData(metadata: OperationToolAdapterContext['metadata']): ProjectData | null {
  const projectData = metadata?.['projectData'];
  if (typeof projectData !== 'object' || projectData === null || Array.isArray(projectData)) {
    return null;
  }

  const candidate = projectData as { readonly tracks?: unknown };
  return Array.isArray(candidate.tracks) ? (projectData as ProjectData) : null;
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

function readRgba(
  value: Readonly<Record<string, unknown>> | undefined,
  key: string,
): [number, number, number, number] | undefined {
  const candidate = value?.[key];
  return isNumberTuple4(candidate) ? candidate : undefined;
}

function readNumberTuple3(value: unknown): [number, number, number] | undefined {
  return isNumberTuple3(value) ? value : undefined;
}

function isNumberTuple4(value: unknown): value is [number, number, number, number] {
  return Array.isArray(value) && value.length === 4 && value.every(isFiniteNumber);
}

function isNumberTuple3(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function readCameraOverride(
  value: Readonly<Record<string, unknown>> | undefined,
  key: string,
): Scene3DModelElement['cameraOverride'] | undefined {
  const record = readRecord(value, key);
  if (!record) {
    return undefined;
  }

  const position = readNumberTuple3(record['position']);
  const target = readNumberTuple3(record['target']);
  if (!position || !target) {
    return undefined;
  }

  const up = readNumberTuple3(record['up']);
  const fovY = readNumber(record, 'fovY');
  return { position, target, ...(up ? { up } : {}), ...(fovY !== undefined ? { fovY } : {}) };
}

function readNumberRecord(
  value: Readonly<Record<string, unknown>> | undefined,
  key: string,
): Record<string, number> | undefined {
  const record = readRecord(value, key);
  if (!record) {
    return undefined;
  }

  const next: Record<string, number> = {};
  for (const [name, candidate] of Object.entries(record)) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      next[name] = candidate;
    }
  }
  return Object.keys(next).length > 0 ? next : undefined;
}
