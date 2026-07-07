import type {
  CanvasAgentContentPayload,
  CanvasAuthoringDiagnostic,
  CanvasStoryboardActionIntent,
  CanvasStoryboardActionIntentId,
  CanvasStoryboardAdvancedParameterId,
  CanvasStoryboardGenerationParams,
  CanvasStoryboardModelCapabilityProjection,
  CanvasStoryboardPromptBlocks,
  CanvasStoryboardPromptDocumentRef,
  CanvasStoryboardPromptState,
  CanvasStoryboardReferenceMedia,
  CanvasStoryboardResultRef,
  CanvasStoryboardSemanticPromptDocument,
  CanvasStoryboardShotTarget,
  CanvasStoryboardTaskRef,
} from '@neko/shared';
import {
  CANVAS_STORYBOARD_ADVANCED_PARAMETER_IDS,
  CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
  resolveCanvasStoryboardNextCreativeState,
  validateCanvasStoryboardActionIntent,
} from '@neko/shared';
import type {
  AgentBackgroundTask,
  AgentWorkItemTaskStatus,
  AgentWorkItemTaskStep,
  AgentWorkItemTaskType,
  TaskWorkItem,
} from '@neko-agent/types';
import { projectBackgroundTaskToWorkItem } from '@neko-agent/types';

export const CANVAS_STORYBOARD_AGENT_TASK_SOURCE = 'neko-agent';

type CanvasStoryboardTaskKind = NonNullable<CanvasStoryboardTaskRef['taskKind']>;

export interface CanvasStoryboardAgentTaskProviderMetadata {
  readonly providerId?: string;
  readonly providerName?: string;
  readonly modelId?: string;
}

export interface CanvasStoryboardAgentTaskInternalExecution {
  readonly workerId?: string;
  readonly subAgentId?: string;
  readonly runId?: string;
}

export interface CreateCanvasStoryboardAgentTaskInput {
  readonly intent: CanvasStoryboardActionIntent;
  readonly conversationId: string;
  readonly provider?: CanvasStoryboardAgentTaskProviderMetadata;
  readonly taskId?: string;
  readonly status?: AgentWorkItemTaskStatus;
  readonly progress?: number;
  readonly currentStepId?: string;
  readonly result?: AgentBackgroundTask['result'];
  readonly error?: string;
  readonly now?: () => number;
  readonly parentMessageId?: string | null;
  readonly parentToolCallId?: string | null;
  readonly internalExecution?: CanvasStoryboardAgentTaskInternalExecution;
}

export interface CanvasStoryboardAgentTaskProjection {
  readonly task: AgentBackgroundTask;
  readonly workItem: TaskWorkItem;
  readonly taskRef: CanvasStoryboardTaskRef;
  readonly taskKind: CanvasStoryboardTaskKind;
}

export interface CanvasStoryboardExecutableActionPayload {
  readonly actionId: CanvasStoryboardActionIntentId;
  readonly target: CanvasStoryboardShotTarget;
  readonly promptDocuments?: readonly CanvasStoryboardPromptDocumentRef[];
  readonly referenceMedia?: CanvasStoryboardReferenceMedia;
  readonly generationParams?: CanvasStoryboardGenerationParams;
  readonly taskRef?: CanvasStoryboardTaskRef;
  readonly resultRef?: CanvasStoryboardResultRef;
  readonly provider?: CanvasStoryboardAgentTaskProviderMetadata;
}

export interface CanvasStoryboardExecutableActionProjection {
  readonly payload: CanvasStoryboardExecutableActionPayload;
  readonly diagnostics: readonly CanvasAuthoringDiagnostic[];
}

export interface ProjectCanvasStoryboardExecutableActionInput {
  readonly intent: CanvasStoryboardActionIntent;
  readonly modelCapability?: CanvasStoryboardModelCapabilityProjection;
  readonly provider?: CanvasStoryboardAgentTaskProviderMetadata;
}

export interface BuildCanvasStoryboardTaskWritebackPayloadInput {
  readonly intent: CanvasStoryboardActionIntent;
  readonly currentPromptState: CanvasStoryboardPromptState;
  readonly taskRef?: CanvasStoryboardTaskRef;
  readonly resultRef?: CanvasStoryboardResultRef;
  readonly promptDocuments?: readonly CanvasStoryboardSemanticPromptDocument[];
  readonly diagnostics?: readonly CanvasAuthoringDiagnostic[];
  readonly conversationId?: string;
  readonly messageId?: string;
  readonly toolCallId?: string;
  readonly title?: string;
  readonly internalExecution?: CanvasStoryboardAgentTaskInternalExecution;
}

const STORYBOARD_TASK_ACTION_IDS = new Set<CanvasStoryboardActionIntentId>([
  'process-reference',
  'optimize-image-prompt',
  'optimize-video-prompt',
  'generate-image',
  'generate-video',
  'fix-alignment',
  'retry',
]);

const PROVIDER_EXECUTION_ACTION_IDS = new Set<CanvasStoryboardActionIntentId>([
  'process-reference',
  'generate-image',
  'generate-video',
  'retry',
]);

export function createCanvasStoryboardAgentTaskProjection(
  input: CreateCanvasStoryboardAgentTaskInput,
): CanvasStoryboardAgentTaskProjection {
  assertValidStoryboardIntent(input.intent);
  const taskKind = toStoryboardTaskKind(input.intent);
  if (!taskKind) {
    throw new Error(
      `Storyboard action "${input.intent.actionId}" does not create an Agent async task.`,
    );
  }

  const now = input.now?.() ?? Date.now();
  const timestamp = new Date(now).toISOString();
  const taskId = input.taskId ?? createStoryboardTaskId(input.intent, now);
  const providerId = input.provider?.providerId ?? 'neko-agent';
  const providerName =
    input.provider?.providerName ?? input.provider?.modelId ?? providerId ?? 'Neko Agent';
  const status = input.status ?? 'queued';
  const task: AgentBackgroundTask = {
    id: taskId,
    type: inferStoryboardTaskType(input.intent),
    name: formatStoryboardTaskName(input.intent),
    prompt: formatStoryboardTaskPrompt(input.intent),
    providerId,
    providerName,
    status,
    progress: clampTaskProgress(input.progress ?? defaultProgressForStatus(status)),
    createdAt: timestamp,
    updatedAt: timestamp,
    steps: createStoryboardTaskSteps({
      actionId: input.intent.actionId,
      status,
      currentStepId: input.currentStepId,
      timestamp: now,
    }),
    currentStepId: input.currentStepId ?? defaultCurrentStepId(status),
    ...(input.result ? { result: input.result } : {}),
    ...(input.error ? { error: input.error } : {}),
  };
  const workItem = projectBackgroundTaskToWorkItem({
    conversationId: input.conversationId,
    task,
    kind: taskKind === 'prompt-optimization' ? 'tool-background-task' : 'media-task',
    parentMessageId: input.parentMessageId,
    parentToolCallId: input.parentToolCallId,
  });
  const taskRef: CanvasStoryboardTaskRef = {
    source: CANVAS_STORYBOARD_AGENT_TASK_SOURCE,
    sourceTaskId: taskId,
    taskId,
    taskKind,
    conversationId: input.conversationId,
  };

  return { task, workItem, taskRef, taskKind };
}

export function projectCanvasStoryboardExecutableActionInput(
  input: ProjectCanvasStoryboardExecutableActionInput,
): CanvasStoryboardExecutableActionProjection {
  assertValidStoryboardIntent(input.intent);
  const diagnostics: CanvasAuthoringDiagnostic[] = [];
  const providerAction = PROVIDER_EXECUTION_ACTION_IDS.has(input.intent.actionId);
  const referenceMedia = projectExecutableReferenceMedia(input, diagnostics, providerAction);
  const generationParams = projectExecutableGenerationParams(input, diagnostics, providerAction);
  const payload: CanvasStoryboardExecutableActionPayload = {
    actionId: input.intent.actionId,
    target: input.intent.target,
    ...(input.intent.promptDocuments ? { promptDocuments: input.intent.promptDocuments } : {}),
    ...(referenceMedia ? { referenceMedia } : {}),
    ...(generationParams ? { generationParams } : {}),
    ...(input.intent.taskRef ? { taskRef: input.intent.taskRef } : {}),
    ...(input.intent.resultRef ? { resultRef: input.intent.resultRef } : {}),
    ...(input.provider ? { provider: input.provider } : {}),
  };

  return { payload, diagnostics };
}

export function buildCanvasStoryboardTaskWritebackPayload(
  input: BuildCanvasStoryboardTaskWritebackPayloadInput,
): CanvasAgentContentPayload {
  assertValidStoryboardIntent(input.intent);
  const promptBlocks = mergePromptDocuments(
    input.currentPromptState.promptBlocks,
    input.promptDocuments ?? [],
  );
  const executionRefs = {
    ...(input.currentPromptState.executionRefs ?? {}),
    taskRefs: appendUniqueTaskRef(
      input.currentPromptState.executionRefs?.taskRefs ?? [],
      input.taskRef,
    ),
    resultRefs: appendUniqueResultRef(
      input.currentPromptState.executionRefs?.resultRefs ?? [],
      input.resultRef,
    ),
  };
  const diagnostics = mergeDiagnostics(
    input.currentPromptState.diagnostics ?? [],
    input.diagnostics ?? [],
  );
  const nextPromptState: CanvasStoryboardPromptState = {
    ...input.currentPromptState,
    version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
    ...(hasPromptBlocks(promptBlocks) ? { promptBlocks } : {}),
    executionRefs,
    nextCreativeState: resolveCanvasStoryboardNextCreativeState({
      promptBlocks,
      referenceMedia: input.currentPromptState.referenceMedia,
      generationParams: input.currentPromptState.generationParams,
      executionRefs,
      diagnostics,
    }),
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
  };

  return {
    kind: 'structured',
    format: 'json',
    title: input.title ?? formatStoryboardTaskWritebackTitle(input.intent),
    content: nextPromptState,
    target: {
      nodeId: input.intent.target.nodeId,
      fieldPath: '/storyboardPrompt',
      mode: 'replace',
    },
    provenance: {
      source: 'agent',
      ...(input.conversationId ? { conversationId: input.conversationId } : {}),
      ...(input.messageId ? { messageId: input.messageId } : {}),
      ...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
      label: 'canvas-storyboard-task-writeback',
    },
  };
}

export function diagnoseCanvasStoryboardExecutableActionInput(
  input: ProjectCanvasStoryboardExecutableActionInput,
): readonly CanvasAuthoringDiagnostic[] {
  return projectCanvasStoryboardExecutableActionInput(input).diagnostics;
}

function assertValidStoryboardIntent(intent: CanvasStoryboardActionIntent): void {
  const validation = validateCanvasStoryboardActionIntent(intent);
  if (validation.valid) return;
  const details = validation.diagnostics
    .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
    .join('; ');
  throw new Error(`Invalid Canvas storyboard action intent.${details ? ` ${details}` : ''}`);
}

function toStoryboardTaskKind(
  intent: CanvasStoryboardActionIntent,
): CanvasStoryboardTaskKind | null {
  if (!STORYBOARD_TASK_ACTION_IDS.has(intent.actionId)) return null;
  switch (intent.actionId) {
    case 'process-reference':
      return 'reference-processing';
    case 'optimize-image-prompt':
    case 'optimize-video-prompt':
    case 'fix-alignment':
      return 'prompt-optimization';
    case 'generate-image':
      return 'image';
    case 'generate-video':
      return 'video';
    case 'retry':
      return inferRetryTaskKind(intent);
    case 'review-result':
    case 'accept-result':
      return null;
  }
}

function inferRetryTaskKind(intent: CanvasStoryboardActionIntent): CanvasStoryboardTaskKind {
  if (intent.taskRef?.taskKind) return intent.taskRef.taskKind;
  if (intent.promptDocuments?.some((document) => document.blockKind === 'video')) return 'video';
  if (intent.promptDocuments?.some((document) => document.blockKind === 'voice')) return 'audio';
  return 'image';
}

function inferStoryboardTaskType(intent: CanvasStoryboardActionIntent): AgentWorkItemTaskType {
  switch (intent.actionId) {
    case 'generate-video':
      return 'video';
    case 'generate-image':
      return 'image';
    case 'optimize-video-prompt':
      return 'video';
    case 'optimize-image-prompt':
    case 'fix-alignment':
      return 'image';
    case 'process-reference':
      if (
        (intent.referenceMedia?.audioRefs?.length ?? 0) > 0 &&
        (intent.referenceMedia?.imageRefs.length ?? 0) === 0 &&
        (intent.referenceMedia?.videoRefs?.length ?? 0) === 0
      ) {
        return 'audio';
      }
      if (
        (intent.referenceMedia?.videoRefs?.length ?? 0) > 0 &&
        (intent.referenceMedia?.imageRefs.length ?? 0) === 0
      ) {
        return 'video';
      }
      return 'image';
    case 'retry':
      if (inferRetryTaskKind(intent) === 'audio') return 'audio';
      if (inferRetryTaskKind(intent) === 'video') return 'video';
      return 'image';
    case 'review-result':
    case 'accept-result':
      throw new Error(`Storyboard action "${intent.actionId}" does not have a task media type.`);
  }
}

function projectExecutableReferenceMedia(
  input: ProjectCanvasStoryboardExecutableActionInput,
  diagnostics: CanvasAuthoringDiagnostic[],
  providerAction: boolean,
): CanvasStoryboardReferenceMedia | undefined {
  if (!providerAction || !input.intent.referenceMedia) return undefined;
  const capability = input.modelCapability;
  const imageRefs = input.intent.referenceMedia.imageRefs;
  const nextImageRefs =
    imageRefs.length > 0 && capability?.referenceInputs?.image !== false ? imageRefs : [];
  let nextVideoRefs: CanvasStoryboardReferenceMedia['videoRefs'];
  let nextAudioRefs: CanvasStoryboardReferenceMedia['audioRefs'];

  const videoRefs = input.intent.referenceMedia.videoRefs ?? [];
  if (videoRefs.length > 0) {
    if (
      capability?.referenceInputs?.video === true &&
      supportsVideoReferenceAction(input.intent.actionId)
    ) {
      nextVideoRefs = videoRefs;
    } else {
      diagnostics.push(
        createDiagnostic({
          code: 'storyboard-video-reference-unsupported',
          message:
            'Active model capability does not support video reference input for this action.',
          target: 'referenceMedia.videoRefs',
        }),
      );
    }
  }

  const audioRefs = input.intent.referenceMedia.audioRefs ?? [];
  if (audioRefs.length > 0) {
    if (
      capability?.referenceInputs?.audio === true &&
      supportsAudioReferenceAction(input.intent.actionId)
    ) {
      nextAudioRefs = audioRefs;
    } else {
      diagnostics.push(
        createDiagnostic({
          code: 'storyboard-audio-reference-unsupported',
          message:
            'Active model capability does not support audio reference input for this action.',
          target: 'referenceMedia.audioRefs',
        }),
      );
    }
  }

  if (
    nextImageRefs.length === 0 &&
    (nextVideoRefs?.length ?? 0) === 0 &&
    (nextAudioRefs?.length ?? 0) === 0 &&
    !input.intent.referenceMedia.diagnostics
  ) {
    return undefined;
  }
  return {
    imageRefs: nextImageRefs,
    ...(nextVideoRefs ? { videoRefs: nextVideoRefs } : {}),
    ...(nextAudioRefs ? { audioRefs: nextAudioRefs } : {}),
    ...(input.intent.referenceMedia.diagnostics
      ? { diagnostics: input.intent.referenceMedia.diagnostics }
      : {}),
  };
}

function projectExecutableGenerationParams(
  input: ProjectCanvasStoryboardExecutableActionInput,
  diagnostics: CanvasAuthoringDiagnostic[],
  providerAction: boolean,
): CanvasStoryboardGenerationParams | undefined {
  const params = input.intent.generationParams;
  if (!params) return undefined;
  const advancedParameters = projectExecutableAdvancedParameters(
    input.intent.actionId,
    params.advancedParameters,
    input.modelCapability,
    diagnostics,
    providerAction,
  );
  const nextParams: CanvasStoryboardGenerationParams = {
    ...(params.duration !== undefined ? { duration: params.duration } : {}),
    ...(params.dialogue !== undefined ? { dialogue: params.dialogue } : {}),
    ...(params.voiceOver !== undefined ? { voiceOver: params.voiceOver } : {}),
    ...(params.aspectRatio !== undefined && isAdvancedParameterExecutable(input, 'aspectRatio')
      ? { aspectRatio: params.aspectRatio }
      : {}),
    ...(params.modelId !== undefined ? { modelId: params.modelId } : {}),
    ...(advancedParameters ? { advancedParameters } : {}),
  };
  if (Object.keys(nextParams).length === 0) return undefined;
  return nextParams;
}

function projectExecutableAdvancedParameters(
  actionId: CanvasStoryboardActionIntentId,
  value: Readonly<Record<string, unknown>> | undefined,
  capability: CanvasStoryboardModelCapabilityProjection | undefined,
  diagnostics: CanvasAuthoringDiagnostic[],
  providerAction: boolean,
): Readonly<Record<string, unknown>> | undefined {
  if (!value) return undefined;
  const supported = new Set(capability?.advancedParameters ?? []);
  const executable: Record<string, unknown> = {};

  for (const [key, parameterValue] of Object.entries(value)) {
    if (!isStoryboardAdvancedParameterId(key)) {
      diagnostics.push(
        createDiagnostic({
          code: 'unsupported-storyboard-advanced-parameter',
          message: 'Storyboard advanced parameter is unknown.',
          target: `generationParams.advancedParameters.${key}`,
        }),
      );
      continue;
    }
    if (!providerAction || !isAdvancedParameterRelevantToAction(actionId, key)) {
      diagnostics.push(
        createDiagnostic({
          code: 'storyboard-advanced-parameter-action-unsupported',
          message: 'Storyboard advanced parameter is not executable for this action.',
          target: `generationParams.advancedParameters.${key}`,
        }),
      );
      continue;
    }
    if (!supported.has(key)) {
      diagnostics.push(
        createDiagnostic({
          code: 'unsupported-storyboard-advanced-parameter',
          message: 'Storyboard advanced parameter is not supported by the active model capability.',
          target: `generationParams.advancedParameters.${key}`,
        }),
      );
      continue;
    }
    executable[key] = parameterValue;
  }

  return Object.keys(executable).length > 0 ? executable : undefined;
}

function isAdvancedParameterExecutable(
  input: ProjectCanvasStoryboardExecutableActionInput,
  parameterId: CanvasStoryboardAdvancedParameterId,
): boolean {
  return (
    Boolean(input.intent.generationParams?.advancedParameters?.[parameterId]) &&
    PROVIDER_EXECUTION_ACTION_IDS.has(input.intent.actionId) &&
    Boolean(input.modelCapability?.advancedParameters?.includes(parameterId)) &&
    isAdvancedParameterRelevantToAction(input.intent.actionId, parameterId)
  );
}

function isAdvancedParameterRelevantToAction(
  actionId: CanvasStoryboardActionIntentId,
  parameterId: CanvasStoryboardAdvancedParameterId,
): boolean {
  switch (parameterId) {
    case 'videoReference':
    case 'audioReference':
    case 'cameraControl':
    case 'motionStrength':
    case 'startFrame':
    case 'endFrame':
      return (
        actionId === 'generate-video' || actionId === 'retry' || actionId === 'process-reference'
      );
    case 'negativePrompt':
    case 'seed':
    case 'aspectRatio':
      return actionId === 'generate-image' || actionId === 'generate-video' || actionId === 'retry';
  }
}

function supportsVideoReferenceAction(actionId: CanvasStoryboardActionIntentId): boolean {
  return actionId === 'generate-video' || actionId === 'retry' || actionId === 'process-reference';
}

function supportsAudioReferenceAction(actionId: CanvasStoryboardActionIntentId): boolean {
  return actionId === 'generate-video' || actionId === 'retry' || actionId === 'process-reference';
}

function isStoryboardAdvancedParameterId(
  value: string,
): value is CanvasStoryboardAdvancedParameterId {
  return CANVAS_STORYBOARD_ADVANCED_PARAMETER_IDS.includes(
    value as CanvasStoryboardAdvancedParameterId,
  );
}

function createStoryboardTaskSteps(input: {
  readonly actionId: CanvasStoryboardActionIntentId;
  readonly status: AgentWorkItemTaskStatus;
  readonly currentStepId: string | undefined;
  readonly timestamp: number;
}): AgentWorkItemTaskStep[] {
  const activeStepId = input.currentStepId ?? defaultCurrentStepId(input.status);
  const steps = [
    { id: 'validate-intent', name: 'Validate Canvas storyboard intent' },
    { id: 'execute-agent-action', name: formatExecuteStepName(input.actionId) },
    { id: 'writeback-canvas', name: 'Write structured task result to Canvas' },
  ] as const;
  const activeIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === activeStepId),
  );
  return steps.map((step, index) => ({
    id: step.id,
    name: step.name,
    status: toStepStatus(input.status, index, activeIndex),
    ...(index <= activeIndex ? { startTime: input.timestamp } : {}),
    ...(input.status === 'completed' || (input.status === 'failed' && index <= activeIndex)
      ? { endTime: input.timestamp }
      : {}),
  }));
}

function defaultCurrentStepId(status: AgentWorkItemTaskStatus): string {
  if (status === 'completed' || status === 'failed') return 'writeback-canvas';
  if (status === 'processing') return 'execute-agent-action';
  return 'validate-intent';
}

function toStepStatus(
  taskStatus: AgentWorkItemTaskStatus,
  stepIndex: number,
  activeIndex: number,
): AgentWorkItemTaskStep['status'] {
  if (taskStatus === 'completed') return 'completed';
  if (taskStatus === 'failed') {
    if (stepIndex < activeIndex) return 'completed';
    if (stepIndex === activeIndex) return 'failed';
    return 'pending';
  }
  if (taskStatus === 'cancelled') {
    return stepIndex <= activeIndex ? 'failed' : 'pending';
  }
  if (stepIndex < activeIndex) return 'completed';
  if (stepIndex === activeIndex && taskStatus === 'processing') return 'running';
  return 'pending';
}

function mergePromptDocuments(
  current: CanvasStoryboardPromptBlocks | undefined,
  documents: readonly CanvasStoryboardSemanticPromptDocument[],
): CanvasStoryboardPromptBlocks {
  let promptBlocks: CanvasStoryboardPromptBlocks = { ...(current ?? {}) };
  for (const document of documents) {
    switch (document.blockKind) {
      case 'image':
        promptBlocks = { ...promptBlocks, imagePromptDocument: document };
        break;
      case 'video':
        promptBlocks = { ...promptBlocks, videoPromptDocument: document };
        break;
      case 'voice':
        promptBlocks = { ...promptBlocks, voicePromptDocument: document };
        break;
    }
  }
  return promptBlocks;
}

function hasPromptBlocks(promptBlocks: CanvasStoryboardPromptBlocks): boolean {
  return Boolean(
    promptBlocks.imagePromptDocument ||
    promptBlocks.videoPromptDocument ||
    promptBlocks.voicePromptDocument,
  );
}

function appendUniqueTaskRef(
  current: readonly CanvasStoryboardTaskRef[],
  next: CanvasStoryboardTaskRef | undefined,
): CanvasStoryboardTaskRef[] {
  if (!next) return [...current];
  const refs = [...current, next];
  return refs.filter(
    (ref, index) => refs.findIndex((item) => taskRefKey(item) === taskRefKey(ref)) === index,
  );
}

function appendUniqueResultRef(
  current: readonly CanvasStoryboardResultRef[],
  next: CanvasStoryboardResultRef | undefined,
): CanvasStoryboardResultRef[] {
  if (!next) return [...current];
  const refs = [...current, next];
  return refs.filter(
    (ref, index) => refs.findIndex((item) => resultRefKey(item) === resultRefKey(ref)) === index,
  );
}

function mergeDiagnostics(
  current: readonly CanvasAuthoringDiagnostic[],
  next: readonly CanvasAuthoringDiagnostic[],
): CanvasAuthoringDiagnostic[] {
  const diagnostics = [...current, ...next];
  return diagnostics.filter(
    (diagnostic, index) =>
      diagnostics.findIndex((item) => diagnosticKey(item) === diagnosticKey(diagnostic)) === index,
  );
}

function taskRefKey(ref: CanvasStoryboardTaskRef): string {
  return `${ref.source}:${ref.sourceTaskId}`;
}

function resultRefKey(ref: CanvasStoryboardResultRef): string {
  if (ref.mediaRef) return `media:${ref.mediaRef.refId}`;
  if (ref.canvasRef) return `canvas:${ref.canvasRef.id}`;
  if (ref.agentResult) return `agent:${ref.agentResult.id}`;
  return JSON.stringify(ref);
}

function diagnosticKey(diagnostic: CanvasAuthoringDiagnostic): string {
  return `${diagnostic.severity}:${diagnostic.code}:${diagnostic.target ?? ''}:${diagnostic.message}`;
}

function createStoryboardTaskId(intent: CanvasStoryboardActionIntent, now: number): string {
  const suffix = intent.requestId ?? String(now);
  return sanitizeTaskId(`storyboard-${intent.actionId}-${intent.target.nodeId}-${suffix}`);
}

function sanitizeTaskId(value: string): string {
  return value.replace(/[^A-Za-z0-9:._-]+/g, '-');
}

function formatStoryboardTaskName(intent: CanvasStoryboardActionIntent): string {
  return `Canvas storyboard: ${formatActionLabel(intent.actionId)} for ${formatTargetLabel(intent.target)}`;
}

function formatStoryboardTaskPrompt(intent: CanvasStoryboardActionIntent): string {
  const documents = intent.promptDocuments
    ?.map((document) => `${document.blockKind}:${document.documentId}@v${document.version}`)
    .join(', ');
  return [
    `Storyboard action ${intent.actionId} for ${formatTargetLabel(intent.target)}.`,
    documents ? `Prompt documents: ${documents}.` : undefined,
    intent.expectedNextStateId ? `Expected state: ${intent.expectedNextStateId}.` : undefined,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' ');
}

function formatStoryboardTaskWritebackTitle(intent: CanvasStoryboardActionIntent): string {
  return `Storyboard ${formatActionLabel(intent.actionId)} writeback`;
}

function formatExecuteStepName(actionId: CanvasStoryboardActionIntentId): string {
  if (actionId === 'process-reference') return 'Process reference media';
  if (actionId === 'generate-image') return 'Generate reference image';
  if (actionId === 'generate-video') return 'Generate video media';
  if (actionId === 'retry') return 'Retry storyboard media task';
  if (actionId === 'fix-alignment') return 'Repair semantic prompt alignment';
  return 'Optimize semantic prompt document';
}

function formatActionLabel(actionId: CanvasStoryboardActionIntentId): string {
  return actionId
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatTargetLabel(target: CanvasStoryboardShotTarget): string {
  if (target.shotNumber !== undefined) return `shot ${target.shotNumber}`;
  if (target.shotId) return target.shotId;
  return target.nodeId;
}

function defaultProgressForStatus(status: AgentWorkItemTaskStatus): number {
  if (status === 'completed') return 100;
  if (status === 'failed' || status === 'cancelled') return 100;
  if (status === 'processing') return 25;
  return 0;
}

function clampTaskProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(100, Math.max(0, progress));
}

function createDiagnostic(input: {
  readonly code: string;
  readonly message: string;
  readonly target: string;
}): CanvasAuthoringDiagnostic {
  return {
    severity: 'error',
    code: input.code,
    message: input.message,
    target: input.target,
    retryable: true,
  };
}
