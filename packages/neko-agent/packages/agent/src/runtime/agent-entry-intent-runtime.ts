import type {
  AgentContextPayload,
  AgentContextType,
  CanvasAuthoringDiagnostic,
  CanvasStoryboardActionIntent,
  CanvasStoryboardActionIntentId,
  CanvasStoryboardModelCapabilityProjection,
  CanvasStoryboardPromptBlockKind,
} from '@neko/shared';
import {
  isCanvasStoryboardActionIntent,
  TOOL_NAMES_CANVAS,
  validateCanvasStoryboardActionIntent,
} from '@neko/shared';
import { diagnoseCanvasStoryboardExecutableActionInput } from './storyboard-action-task-runtime';

export interface BuildAgentCreationMessageInput {
  readonly intent: string;
  readonly sourceFilePath?: string;
}

export type AgentPromptCommandKind = 'generate-image' | 'generate-video';

export type AgentScriptCommandKind = 'generate' | 'optimize' | 'generate-image' | 'generate-video';

export interface BuildAgentPromptCommandMessageInput {
  readonly kind: AgentPromptCommandKind;
  readonly prompt: string;
}

export interface BuildAgentScriptCommandMessageInput {
  readonly kind: AgentScriptCommandKind;
  readonly text: string;
}

export interface BuildAgentFileContextPayloadInput {
  readonly filePath: string;
  readonly relativePath: string;
  readonly intent?: string;
  readonly id?: string;
  readonly label?: string;
  readonly typeOverride?: AgentContextType;
  readonly now?: () => number;
}

export interface BuildCanvasStoryboardActionIntentContextPayloadInput {
  readonly payload: AgentContextPayload;
  readonly locale?: string;
}

export type CanvasStoryboardActionDecisionStatus = 'ready' | 'requires-approval' | 'blocked';

export interface CanvasStoryboardActionDecisionInput {
  readonly intent: CanvasStoryboardActionIntent;
  readonly supportedActionIntentIds?: readonly CanvasStoryboardActionIntentId[];
  readonly modelCapability?: CanvasStoryboardModelCapabilityProjection;
  readonly approvalGranted?: boolean;
}

export interface CanvasStoryboardActionDecision {
  readonly status: CanvasStoryboardActionDecisionStatus;
  readonly requiredQueries: readonly string[];
  readonly diagnostics: readonly CanvasAuthoringDiagnostic[];
  readonly requiresApproval: boolean;
}

export const AGENT_DOCUMENT_CONTEXT_INTENTS = {
  summarizeDocument: '请总结这个文档的要点：',
  chatWithDocument: '我想讨论一下这个文档：',
  analyzeImage: '请分析这张图片：',
  extractImageText: '请提取这张图片中的文字（OCR）：',
  analyzeVideo: '请分析这个视频：',
  generateSubtitles: '请为这个视频生成字幕：',
} as const;

export const AGENT_RETRY_CREATION_MESSAGE = 'Retry the failed scenes from my last creation run';

const CREATION_INTENT_BY_EXTENSION: Readonly<Record<string, string>> = {
  fountain: 'Convert this screenplay to video',
  nks: 'Convert this screenplay to video',
  pdf: 'Create a video from this document',
  docx: 'Create a video from this document',
  doc: 'Create a video from this document',
  md: 'Create a video from this text',
  txt: 'Create a video from this text',
};

const IMAGE_FILE_EXTENSION_RE = /\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i;

export function buildAgentCreationMessage(input: BuildAgentCreationMessageInput): string {
  if (!input.sourceFilePath) {
    return input.intent;
  }
  return `${input.intent}. Source file: ${input.sourceFilePath}`;
}

export function buildAgentPromptCommandMessage(input: BuildAgentPromptCommandMessageInput): string {
  switch (input.kind) {
    case 'generate-image':
      return `Generate an image: ${input.prompt}`;
    case 'generate-video':
      return `Generate a video: ${input.prompt}`;
  }
}

export function buildAgentScriptCommandMessage(input: BuildAgentScriptCommandMessageInput): string {
  switch (input.kind) {
    case 'generate':
      return `Generate a script based on: ${input.text}`;
    case 'optimize':
      return `Optimize this script: ${input.text}`;
    case 'generate-image':
      return `Generate images for this script: ${input.text}`;
    case 'generate-video':
      return `Generate a video from this script: ${input.text}`;
  }
}

export function buildAgentRetryCreationMessage(): string {
  return AGENT_RETRY_CREATION_MESSAGE;
}

export function inferAgentCreationIntentFromFilePath(filePath: string): string {
  return (
    CREATION_INTENT_BY_EXTENSION[getFileExtension(filePath)] ?? 'Create a video from this file'
  );
}

export function inferAgentFileContextType(
  filePath: string,
  typeOverride?: AgentContextType,
): AgentContextType {
  return typeOverride ?? (IMAGE_FILE_EXTENSION_RE.test(filePath) ? 'image' : 'file');
}

export function createAgentFileContextPayloadId(
  filePath: string,
  options: { readonly now?: () => number } = {},
): string {
  return `file:${filePath}:${options.now?.() ?? Date.now()}`;
}

export function buildAgentFileContextPayload(
  input: BuildAgentFileContextPayloadInput,
): AgentContextPayload {
  const label = input.label ?? getPathBaseName(input.filePath);
  return {
    type: inferAgentFileContextType(input.filePath, input.typeOverride),
    id: input.id ?? createAgentFileContextPayloadId(input.filePath, { now: input.now }),
    label,
    summary: `File: ${input.relativePath}`,
    data: { filePath: input.filePath, relativePath: input.relativePath },
    ...(input.intent ? { intent: input.intent } : {}),
  };
}

export function buildCanvasStoryboardActionIntentContextPayload(
  input: BuildCanvasStoryboardActionIntentContextPayloadInput,
): AgentContextPayload | null {
  if (input.payload.type !== 'canvas-storyboard-action-intent') {
    return null;
  }
  const intent = readCanvasStoryboardActionIntent(input.payload);
  return {
    ...input.payload,
    label: input.payload.label || formatStoryboardActionLabel(intent.actionId),
    summary: formatStoryboardActionSummary(intent),
    intent: buildCanvasStoryboardActionIntentPrompt({ intent, locale: input.locale }),
  };
}

export function buildCanvasStoryboardActionIntentPrompt(input: {
  readonly intent: CanvasStoryboardActionIntent;
  readonly locale?: string;
}): string {
  return isZhLocale(input.locale)
    ? buildCanvasStoryboardActionIntentPromptZh(input.intent)
    : buildCanvasStoryboardActionIntentPromptEn(input.intent);
}

export function decideCanvasStoryboardActionIntent(
  input: CanvasStoryboardActionDecisionInput,
): CanvasStoryboardActionDecision {
  const requiredQueries = [
    TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES,
    TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
  ];
  const diagnostics: CanvasAuthoringDiagnostic[] = [];

  if (
    input.supportedActionIntentIds &&
    !input.supportedActionIntentIds.includes(input.intent.actionId)
  ) {
    diagnostics.push({
      severity: 'error',
      code: 'unsupported-storyboard-action-intent',
      message: `Canvas storyboard action intent "${input.intent.actionId}" is not supported by the active Canvas catalog.`,
      target: 'actionId',
      retryable: true,
      requiredQuery: TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES,
    });
  }

  const capabilityDiagnostics = validateCanvasStoryboardActionIntent(input.intent, {
    supportedAdvancedParameters: input.modelCapability?.advancedParameters,
  }).diagnostics.filter(
    (diagnostic) => diagnostic.code === 'unsupported-storyboard-advanced-parameter',
  );
  diagnostics.push(...capabilityDiagnostics);

  diagnostics.push(...missingInputDiagnostics(input.intent));
  if (requiresProviderCapability(input.intent.actionId) && !input.modelCapability) {
    diagnostics.push({
      severity: 'warning',
      code: 'storyboard-model-capability-required',
      message:
        'Storyboard provider-consuming actions require model capability details before execution.',
      target: 'modelCapability',
      retryable: true,
    });
  } else if (input.modelCapability) {
    diagnostics.push(...unsupportedCapabilityDiagnostics(input.intent, input.modelCapability));
    diagnostics.push(
      ...diagnoseCanvasStoryboardExecutableActionInput({
        intent: input.intent,
        modelCapability: input.modelCapability,
      }),
    );
  }

  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return {
      status: 'blocked',
      requiredQueries,
      diagnostics,
      requiresApproval: requiresStoryboardActionApproval(input.intent.actionId),
    };
  }

  const requiresApproval = requiresStoryboardActionApproval(input.intent.actionId);
  if (requiresApproval && !input.approvalGranted) {
    return {
      status: 'requires-approval',
      requiredQueries,
      diagnostics: [
        ...diagnostics,
        {
          severity: 'warning',
          code: 'approval-required',
          message:
            'Storyboard action requires user approval before mutation, provider use, async task creation, or Canvas writeback.',
          target: 'approval',
          retryable: true,
        },
      ],
      requiresApproval,
    };
  }

  return {
    status: diagnostics.length > 0 ? 'blocked' : 'ready',
    requiredQueries,
    diagnostics,
    requiresApproval,
  };
}

function readCanvasStoryboardActionIntent(
  payload: AgentContextPayload,
): CanvasStoryboardActionIntent {
  const data = readRecord(payload.data);
  const intent = data?.['intent'];
  const validation = validateCanvasStoryboardActionIntent(intent);
  if (!validation.valid || !isCanvasStoryboardActionIntent(intent)) {
    const details = validation.diagnostics
      .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
      .join('; ');
    throw new Error(
      `Invalid Canvas storyboard action intent context payload.${details ? ` ${details}` : ''}`,
    );
  }
  return intent;
}

function buildCanvasStoryboardActionIntentPromptZh(intent: CanvasStoryboardActionIntent): string {
  return [
    `处理 Canvas 分镜下一步动作：${formatStoryboardActionLabel(intent.actionId)}`,
    `Action intent: ${intent.actionId}`,
    formatStoryboardTargetLine(intent),
    '请先查询 Canvas authoring catalog、当前 Canvas context 和可用模型能力，再判断是否优化提示词、处理参考媒体、生成媒体、审阅结果、修复对齐、接受结果或重试。',
    storyboardActionGuidanceZh(intent.actionId),
    '如果动作会修改 Canvas、消耗 provider、创建异步任务或写回结果，先请求确认/批准；不支持的参数或缺失输入要返回可修复 diagnostics。',
    'Agent 拥有 provider 调用、异步任务、进度、日志、subagent/worker 编排和结构化写回；Canvas 只保存 task refs、result refs、diagnostics 和 next creative state。',
    '使用附加的 canvas-storyboard-action-intent 结构化上下文，不要把它当作普通文本表格或旧 generationPrompt 路径。',
  ].join('\n');
}

function buildCanvasStoryboardActionIntentPromptEn(intent: CanvasStoryboardActionIntent): string {
  return [
    `Handle Canvas storyboard next action: ${formatStoryboardActionLabel(intent.actionId)}`,
    `Action intent: ${intent.actionId}`,
    formatStoryboardTargetLine(intent),
    'First query the Canvas authoring catalog, active Canvas context, and available model capabilities, then decide whether to optimize prompts, process reference media, generate media, review results, fix alignment, accept results, or retry.',
    storyboardActionGuidanceEn(intent.actionId),
    'Request confirmation/approval before mutating Canvas, consuming providers, creating async tasks, or writing results back. Return repairable diagnostics for unsupported parameters or missing inputs.',
    'Agent owns provider calls, async tasks, progress, logs, subagent/worker orchestration, and structured writeback. Canvas only stores task refs, result refs, diagnostics, and next creative state.',
    'Use the attached canvas-storyboard-action-intent structured context; do not treat it as a generic text table or legacy generationPrompt path.',
  ].join('\n');
}

function storyboardActionGuidanceZh(actionId: CanvasStoryboardActionIntentId): string {
  switch (actionId) {
    case 'process-reference':
      return '目标是检查参考媒体是否可用，必要时规划参考图处理或关键帧准备。';
    case 'optimize-image-prompt':
      return '目标是优化 image prompt document；只在需要准备/生成/修复参考图时处理图片提示词。';
    case 'optimize-video-prompt':
      return '目标是优化 video prompt document；视频提示词是生成/编辑视频的核心输入。';
    case 'generate-image':
      return '目标是生成或修复参考图/关键帧；生成进度必须进入 Agent 异步任务。';
    case 'generate-video':
      return '目标是基于参考媒体、video prompt 和参数生成/编辑视频；生成进度必须进入 Agent 异步任务。';
    case 'review-result':
      return '目标是审阅已有结果 ref，决定接受、修复对齐或重试。';
    case 'fix-alignment':
      return '目标是诊断并修复语义 prompt span、字段 projection 和 Canvas profile 的对齐。';
    case 'accept-result':
      return '目标是确认结果可作为该 shot 的 durable result ref，并写回接受状态。';
    case 'retry':
      return '目标是基于失败 diagnostics 或 task/result ref 规划可恢复重试。';
  }
}

function storyboardActionGuidanceEn(actionId: CanvasStoryboardActionIntentId): string {
  switch (actionId) {
    case 'process-reference':
      return 'Goal: check whether reference media is usable and plan reference processing or keyframe preparation when needed.';
    case 'optimize-image-prompt':
      return 'Goal: optimize the image prompt document only when reference preparation, generation, or repair needs it.';
    case 'optimize-video-prompt':
      return 'Goal: optimize the video prompt document, the core input for video generation or editing.';
    case 'generate-image':
      return 'Goal: generate or repair reference imagery/keyframes; progress belongs in Agent async tasks.';
    case 'generate-video':
      return 'Goal: generate or edit video from reference media, the video prompt, and parameters; progress belongs in Agent async tasks.';
    case 'review-result':
      return 'Goal: review the existing result ref and decide whether to accept, fix alignment, or retry.';
    case 'fix-alignment':
      return 'Goal: diagnose and repair alignment between semantic prompt spans, field projections, and the Canvas profile.';
    case 'accept-result':
      return 'Goal: confirm the result as the durable shot result ref and write back the accepted state.';
    case 'retry':
      return 'Goal: plan a recoverable retry from failure diagnostics or task/result refs.';
  }
}

function missingInputDiagnostics(
  intent: CanvasStoryboardActionIntent,
): readonly CanvasAuthoringDiagnostic[] {
  const diagnostics: CanvasAuthoringDiagnostic[] = [];
  if (intent.actionId === 'generate-video' && !hasPromptDocumentRef(intent, 'video')) {
    diagnostics.push({
      severity: 'error',
      code: 'storyboard-video-prompt-required',
      message: 'Generate video requires a semantic video prompt document ref.',
      target: 'promptDocuments.video',
      retryable: true,
      requiredQuery: TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
    });
  }
  if (intent.actionId === 'generate-image' && !hasPromptDocumentRef(intent, 'image')) {
    diagnostics.push({
      severity: 'error',
      code: 'storyboard-image-prompt-required',
      message: 'Generate image requires a semantic image prompt document ref.',
      target: 'promptDocuments.image',
      retryable: true,
      requiredQuery: TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
    });
  }
  if (
    (intent.actionId === 'review-result' || intent.actionId === 'accept-result') &&
    !intent.resultRef
  ) {
    diagnostics.push({
      severity: 'error',
      code: 'storyboard-result-ref-required',
      message: 'Result review and acceptance require a result ref.',
      target: 'resultRef',
      retryable: true,
      requiredQuery: TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
    });
  }
  return diagnostics;
}

function unsupportedCapabilityDiagnostics(
  intent: CanvasStoryboardActionIntent,
  capability: CanvasStoryboardModelCapabilityProjection,
): readonly CanvasAuthoringDiagnostic[] {
  const diagnostics: CanvasAuthoringDiagnostic[] = [];
  if (
    intent.actionId === 'generate-video' &&
    !capability.videoGeneration &&
    !capability.videoEditing
  ) {
    diagnostics.push({
      severity: 'error',
      code: 'storyboard-video-capability-unsupported',
      message: 'Active model capability does not support video generation or editing.',
      target: 'modelCapability.videoGeneration',
      retryable: true,
    });
  }
  if (
    intent.actionId === 'generate-image' &&
    !capability.imageGeneration &&
    !capability.imageEditing
  ) {
    diagnostics.push({
      severity: 'error',
      code: 'storyboard-image-capability-unsupported',
      message: 'Active model capability does not support image generation or editing.',
      target: 'modelCapability.imageGeneration',
      retryable: true,
    });
  }
  const duration = intent.generationParams?.duration;
  if (
    duration !== undefined &&
    capability.duration?.maxSeconds !== undefined &&
    duration > capability.duration.maxSeconds
  ) {
    diagnostics.push({
      severity: 'error',
      code: 'storyboard-duration-unsupported',
      message: `Storyboard duration ${duration}s exceeds active model maximum ${capability.duration.maxSeconds}s.`,
      target: 'generationParams.duration',
      retryable: true,
    });
  }
  return diagnostics;
}

function hasPromptDocumentRef(
  intent: CanvasStoryboardActionIntent,
  blockKind: CanvasStoryboardPromptBlockKind,
): boolean {
  return Boolean(intent.promptDocuments?.some((document) => document.blockKind === blockKind));
}

function requiresProviderCapability(actionId: CanvasStoryboardActionIntentId): boolean {
  return (
    actionId === 'process-reference' ||
    actionId === 'generate-image' ||
    actionId === 'generate-video' ||
    actionId === 'retry'
  );
}

function requiresStoryboardActionApproval(actionId: CanvasStoryboardActionIntentId): boolean {
  return actionId !== 'review-result';
}

function formatStoryboardTargetLine(intent: CanvasStoryboardActionIntent): string {
  const parts = [
    `nodeId=${intent.target.nodeId}`,
    intent.target.sceneNodeId ? `sceneNodeId=${intent.target.sceneNodeId}` : undefined,
    intent.target.shotId ? `shotId=${intent.target.shotId}` : undefined,
    intent.target.shotNumber !== undefined ? `shotNumber=${intent.target.shotNumber}` : undefined,
    intent.expectedNextStateId ? `expectedNextStateId=${intent.expectedNextStateId}` : undefined,
  ].filter((part): part is string => Boolean(part));
  return `Target: ${parts.join(', ')}`;
}

function formatStoryboardActionSummary(intent: CanvasStoryboardActionIntent): string {
  return `${formatStoryboardActionLabel(intent.actionId)} for ${intent.target.nodeId}`;
}

function formatStoryboardActionLabel(actionId: CanvasStoryboardActionIntentId): string {
  return actionId
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function isZhLocale(locale: string | undefined): boolean {
  return Boolean(locale?.toLowerCase().startsWith('zh'));
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function getFileExtension(filePath: string): string {
  const baseName = getPathBaseName(filePath);
  const dotIndex = baseName.lastIndexOf('.');
  return dotIndex >= 0 ? baseName.slice(dotIndex + 1).toLowerCase() : '';
}

function getPathBaseName(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).pop() ?? filePath;
}
