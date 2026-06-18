import type {
  AgentMediaModelSelections,
  ContentBlock,
  ErrorMessage,
  GlobalErrorMessage,
  MediaModelCategory,
  Message,
  MessageContextReference,
  ModelRef,
  ProjectFileMentionInfo,
  ProjectFilesWebviewMessage,
  ProjectMentionExtra,
  ProjectMentionExtraType,
  ProjectMentionMediaType,
  ProjectMentionSource,
  RuntimeMediaModelSelections,
  SessionMode,
  ThinkingMessage,
} from '@neko-agent/types';
import {
  buildErrorMessage,
  buildGlobalErrorMessage,
  buildThinkingMessage,
} from '@neko-agent/types';
import type {
  AgentContextPayload,
  DocumentContextData,
  DocumentLocator,
  MessageAttachment,
  ProviderGenerationCapability,
} from '@neko/shared';
import type { AgentEvent } from '../session/types';
import {
  createPlanModeIdcMetadata,
  mergeIdcExecutionMetadata,
} from '../session/idc-execution-metadata';
import { DEFAULT_MENTION_EXCLUDE_GLOB } from '../input/mention-excludes';
import {
  extractFileReferencePaths,
  type AgentBase64ImageAttachment,
  type AgentProcessedAttachments,
} from './attachment-projection';
import { getLogger } from '../utils/logger';

function getMessageRuntimeLogger() {
  return getLogger('MessageRuntime');
}

export interface AgentMessageExecutionOverrides {
  readonly executionMode?: 'auto' | 'ask' | 'plan';
  readonly metadata?: Record<string, unknown>;
}

export interface AgentMessageIdOptions {
  readonly now?: () => number;
  readonly randomSuffix?: () => string;
}

export interface AgentMessageRuntimeRequest {
  readonly conversationId: string;
  readonly messageText: string;
  readonly sessionMode: SessionMode;
  readonly chatModel?: ModelRef<'llm'>;
  readonly mediaModel?: ModelRef<MediaModelCategory>;
  readonly mediaModels?: AgentMediaModelSelections;
  readonly attachments?: MessageAttachment[];
  readonly contextPayloads?: readonly AgentContextPayload[];
  readonly promptId?: string;
  readonly executionOverrides?: AgentMessageExecutionOverrides;
}

export interface ProviderExpressionTargetConfig {
  readonly capability: ProviderGenerationCapability;
  readonly providerId: string;
  readonly modelId: string;
}

export interface AgentExecutionMetadataInput {
  readonly metadata?: Record<string, unknown>;
  readonly multimodalContextPacket?: unknown;
  readonly conversationId?: string;
  readonly parentAgentId?: string;
}

export interface AgentReferencedFileContent {
  readonly path: string;
  readonly content: string;
}

export interface AgentMessageFileReferenceProcessor {
  process(input: string): Promise<{
    fileReferences: readonly {
      path: string;
      content?: string;
    }[];
    errors: readonly {
      reference: string;
      error: string;
    }[];
  }>;
}

export interface PrepareAgentMessageFileReferencesInput {
  readonly messageText: string;
  readonly inputProcessor?: AgentMessageFileReferenceProcessor | null;
  readonly onReferenceError?: (error: { reference: string; error: string }) => void;
  readonly onProcessingError?: (error: unknown) => void;
}

export interface PreparedAgentMessageFileReferences {
  readonly message: string;
  readonly fileContents: AgentReferencedFileContent[];
}

export interface BuildEnhancedAgentMessageInput {
  readonly message: string;
  readonly fileContents?: readonly AgentReferencedFileContent[];
  readonly attachmentText?: string;
  readonly contextPayloads?: readonly AgentContextPayload[];
}

export interface AgentReferencedMediaProcessor {
  process(filePath: string): Promise<AgentProcessedReferencedMedia>;
}

export interface AgentProcessedReferencedMedia {
  readonly type: string;
  readonly images: readonly {
    readonly media_type: string;
    readonly data: string;
  }[];
  readonly metadata?: unknown;
}

export interface MergeReferencedMediaImageAttachmentsInput {
  readonly message: string;
  readonly existingImages: readonly AgentBase64ImageAttachment[];
  readonly createMediaProcessor?:
    | (() => AgentReferencedMediaProcessor | null | Promise<AgentReferencedMediaProcessor | null>)
    | undefined;
  readonly onProcessed?: (event: {
    filePath: string;
    mediaType: string;
    metadata?: unknown;
  }) => void;
  readonly onError?: (event: { filePath: string; error: unknown }) => void;
}

export type AgentMessageDispatchRoute =
  | {
      readonly kind: 'agent';
    }
  | {
      readonly kind: 'media';
      readonly mediaModel: ModelRef<MediaModelCategory>;
    };

export interface PrepareAgentMessageDispatchInput {
  readonly request: AgentMessageRuntimeRequest;
  readonly inputProcessor?: AgentMessageFileReferenceProcessor | null;
  readonly processAttachments: (
    attachments: readonly MessageAttachment[] | undefined,
  ) => Promise<AgentProcessedAttachments>;
  readonly createReferencedMediaProcessor?:
    | (() => AgentReferencedMediaProcessor | null | Promise<AgentReferencedMediaProcessor | null>)
    | undefined;
  readonly onReferenceError?: (error: { reference: string; error: string }) => void;
  readonly onFileReferenceProcessingError?: (error: unknown) => void;
  readonly onReferencedMediaProcessed?: (event: {
    filePath: string;
    mediaType: string;
    metadata?: unknown;
  }) => void;
  readonly onReferencedMediaError?: (event: { filePath: string; error: unknown }) => void;
  readonly generateMessageId: () => string;
  readonly now?: () => number;
}

export interface PreparedAgentMessageDispatch {
  readonly conversationId: string;
  readonly enhancedMessage: string;
  readonly userMessage: Message;
  readonly mediaImages: AgentBase64ImageAttachment[];
  readonly route: AgentMessageDispatchRoute;
}

export type AgentMessageTurnRuntimeMessage = ErrorMessage | GlobalErrorMessage | ThinkingMessage;

export interface AgentMessageTurnMediaExecutionInput {
  readonly conversationId: string;
  readonly prompt: string;
  readonly mediaModel: ModelRef<MediaModelCategory>;
}

export interface AgentMessageTurnAgentExecutionInput {
  readonly conversationId: string;
  readonly message: string;
  readonly chatModel?: ModelRef<'llm'>;
  readonly imageAttachments?: readonly AgentBase64ImageAttachment[];
  readonly mediaModel?: ModelRef<MediaModelCategory>;
  readonly mediaModels?: AgentMediaModelSelections;
  readonly executionOverrides?: AgentMessageExecutionOverrides;
}

export interface RunAgentMessageTurnRuntimeInput {
  readonly request: AgentMessageRuntimeRequest;
  readonly inputProcessor?: AgentMessageFileReferenceProcessor | null;
  readonly processAttachments: PrepareAgentMessageDispatchInput['processAttachments'];
  readonly createReferencedMediaProcessor?: PrepareAgentMessageDispatchInput['createReferencedMediaProcessor'];
  readonly persistUserMessage: (conversationId: string, message: Message) => void;
  readonly persistErrorMessage?: (conversationId: string, message: Message) => void;
  readonly executeMediaTurn?: (input: AgentMessageTurnMediaExecutionInput) => Promise<void>;
  readonly executeAgentTurn?: (input: AgentMessageTurnAgentExecutionInput) => Promise<void>;
  readonly postMessage: (message: AgentMessageTurnRuntimeMessage) => void;
  readonly onMissingConversationId?: () => void;
  readonly onReferenceError?: PrepareAgentMessageDispatchInput['onReferenceError'];
  readonly onFileReferenceProcessingError?: PrepareAgentMessageDispatchInput['onFileReferenceProcessingError'];
  readonly onReferencedMediaProcessed?: PrepareAgentMessageDispatchInput['onReferencedMediaProcessed'];
  readonly onReferencedMediaError?: PrepareAgentMessageDispatchInput['onReferencedMediaError'];
  readonly generateMessageId: () => string;
  readonly now?: () => number;
}

export type RunAgentMessageTurnRuntimeResult =
  | {
      readonly status: 'rejected-missing-conversation';
    }
  | {
      readonly status: 'media-dispatched';
    }
  | {
      readonly status: 'agent-dispatched';
    }
  | {
      readonly status: 'precondition-unmet';
      readonly reason: 'no-agent-runtime';
    };

export interface AgentAmbientCanvasNode {
  readonly nodeId: string;
  readonly type: string;
  readonly summary: string;
}

export interface AgentProjectFileSearchPlanInput {
  readonly filter?: string;
  readonly limit?: number;
}

export interface AgentProjectFileSearchPlan {
  readonly includePattern: string;
  readonly excludePattern: string;
  readonly limit: number;
}

export interface AgentProjectFileCandidate {
  readonly relativePath: string;
  readonly icon?: string;
  readonly source?: ProjectMentionSource;
  readonly mediaType?: ProjectMentionMediaType;
}

export interface AgentMentionCharacter {
  readonly id: string;
  readonly name: string;
  readonly role?: string;
  readonly thumbnailUri?: string;
}

export interface AgentMentionScene {
  readonly id: string;
  readonly title: string;
  readonly heading?: string;
}

export interface AgentProjectMentionCandidate {
  readonly type: ProjectMentionExtraType;
  readonly id: string;
  readonly label: string;
  readonly summary: string;
  readonly source?: ProjectMentionSource;
  readonly icon?: string;
  readonly filePath?: string;
  readonly mediaType?: ProjectMentionMediaType;
  readonly entityType?: string;
  readonly thumbnailUri?: string;
  readonly navigationData?: Record<string, string>;
}

export interface AgentProjectFilesProjectionInput {
  readonly conversationId: string;
  readonly filter?: string;
  readonly files: readonly AgentProjectFileCandidate[];
  readonly canvasNodes?: readonly AgentAmbientCanvasNode[];
  readonly characters?: readonly AgentMentionCharacter[];
  readonly scenes?: readonly AgentMentionScene[];
  readonly mentionCandidates?: readonly AgentProjectMentionCandidate[];
}

export interface ExecuteAgentProjectFileSearchInput {
  readonly conversationId: string;
  readonly filter?: string;
  readonly searchProjectFiles?: (
    plan: AgentProjectFileSearchPlan,
  ) => Promise<readonly AgentProjectFileCandidate[]>;
  readonly getCanvasNodes?: (conversationId: string) => readonly AgentAmbientCanvasNode[];
  readonly getCharacters?: () => Promise<readonly AgentMentionCharacter[]>;
  readonly getScenes?: () => Promise<readonly AgentMentionScene[]>;
  readonly getMentionCandidates?: (
    plan: AgentProjectFileSearchPlan,
  ) => Promise<readonly AgentProjectMentionCandidate[]>;
  readonly onSearchError?: (error: unknown) => void;
}

export interface AgentStreamPersistenceSnapshot {
  readonly accumulatedResponse: string;
  readonly accumulatedThinking: string;
  readonly hasError: boolean;
  readonly errorMessage?: string;
  readonly collectedToolCalls: readonly {
    readonly id: string;
    readonly name: string;
    readonly arguments: Record<string, unknown>;
    readonly result?: { success: boolean; data: unknown; error?: string };
  }[];
  readonly contentBlocks: readonly ContentBlock[];
}

export interface BuildAgentAssistantMessageInput {
  readonly id: string;
  readonly timestamp: number;
  readonly stream: AgentStreamPersistenceSnapshot;
}

export interface BuildAgentErrorAssistantMessageInput {
  readonly id: string;
  readonly timestamp: number;
  readonly message?: string;
}

export interface AgentTurnContextPatchInput {
  readonly imageAttachments?: readonly AgentBase64ImageAttachment[];
  readonly timelineContextPacket?: unknown;
  readonly canvasNodes?: readonly AgentAmbientCanvasNode[];
  readonly canvasContextPacket?: unknown;
  readonly multimodalContextPacket?: unknown;
  readonly executionMetadata?: Record<string, unknown>;
}

export interface AgentTurnContextPatch {
  readonly imageAttachments?: AgentBase64ImageAttachment[];
  readonly canvasContext?: {
    readonly selectedNodes: AgentAmbientCanvasNode[];
  };
  readonly multimodalContextPacket?: unknown;
  readonly metadata?: Record<string, unknown>;
}

export interface AgentHistoryHydrationPlanInput<TMessage> {
  readonly agentHistoryLength: number;
  readonly conversationMessageCount: number;
  readonly fullHistory: readonly TMessage[];
  readonly agentHistory?: readonly AgentHistoryHydrationCandidateMessage[];
}

export type AgentHistoryHydrationPlan<TMessage> =
  | {
      readonly kind: 'load-history';
      readonly historyToLoad: TMessage[];
    }
  | {
      readonly kind: 'skip';
      readonly reason: 'agent-history-not-empty' | 'conversation-too-short' | 'empty-history';
    };

export interface AgentHistoryHydrationCandidateMessage {
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
}

export interface AgentProviderCandidate {
  readonly id: string;
  readonly isConfigured: boolean;
}

export interface AgentTurnProviderSelectionInput<TProvider extends AgentProviderCandidate> {
  readonly requestedProviderId?: string;
  readonly selectedProviderId?: string;
  readonly getProvider: (providerId: string) => TProvider | undefined;
  readonly getDefaultProvider: () => TProvider | undefined;
}

export type AgentTurnProviderSelection<TProvider extends AgentProviderCandidate> =
  | {
      readonly ok: true;
      readonly provider: TProvider;
      readonly effectiveProviderId?: string;
    }
  | {
      readonly ok: false;
      readonly effectiveProviderId?: string;
      readonly reason: 'no-provider-configured';
    };

export interface AgentTurnRuntimePlanInput {
  readonly executionMode: 'auto' | 'ask' | 'plan';
  readonly executionOverrides?: AgentMessageExecutionOverrides;
  readonly mediaModel?: ModelRef<MediaModelCategory>;
  readonly mediaModels?: AgentMediaModelSelections;
}

export interface AgentTurnRuntimePlan {
  readonly providerExpressionTargets?: ProviderExpressionTargetConfig[];
  readonly runtimeMediaModels?: RuntimeMediaModelSelections;
  readonly executionMetadata?: Record<string, unknown>;
}

export interface AgentTurnConfigurationPlanInput {
  readonly conversationId: string;
  readonly baseSystemPrompt: string;
  readonly ambientCanvas?: readonly AgentAmbientCanvasNode[];
  readonly isPlanMode: boolean;
  readonly executionMode: 'auto' | 'ask' | 'plan';
  readonly chatModel?: ModelRef<'llm'>;
  readonly mediaModel?: ModelRef<MediaModelCategory>;
  readonly mediaModels?: AgentMediaModelSelections;
  readonly executionOverrides?: AgentMessageExecutionOverrides;
  readonly maxIterations?: number;
  readonly autoExecuteTools?: boolean;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly thinkingBudget?: number;
  readonly workspaceRoot?: string;
}

export interface AgentTurnConfigurationPlan {
  readonly systemPrompt: string;
  readonly maxIterations: number;
  readonly autoExecuteTools?: boolean;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly modelId?: string;
  readonly providerExpressionTargets?: ProviderExpressionTargetConfig[];
  readonly executionMode: 'auto' | 'ask' | 'plan';
  readonly thinkingBudget?: number;
  readonly workspaceRoot?: string;
  readonly conversationId: string;
  readonly executionMetadata?: Record<string, unknown>;
}

const MEDIA_GENERATION_CAPABILITIES: readonly ProviderGenerationCapability[] = [
  'image.generate',
  'video.generate',
  'audio.generate',
];

export type AgentMessageTurnPreconditionReason = 'missing-platform' | 'no-provider-configured';
export type AgentMessageTurnFallbackReason = AgentMessageTurnPreconditionReason;

export const AGENT_TURN_PRECONDITION_MESSAGE =
  'No AI provider configured. Please go to Settings and add an AI provider (Claude, OpenAI, etc.) with your API key.';
export const AGENT_TURN_FALLBACK_MESSAGE = AGENT_TURN_PRECONDITION_MESSAGE;

export function getAgentTurnPreconditionMessage(
  _reason: AgentMessageTurnPreconditionReason,
): string {
  return AGENT_TURN_PRECONDITION_MESSAGE;
}

export function getAgentTurnFallbackMessage(reason: AgentMessageTurnFallbackReason): string {
  return getAgentTurnPreconditionMessage(reason);
}

export function createAgentMessageId(options: AgentMessageIdOptions = {}): string {
  const timestamp = options.now?.() ?? Date.now();
  const suffix = options.randomSuffix?.() ?? Math.random().toString(36).slice(2, 11);
  return `${timestamp}-${suffix}`;
}

export async function prepareAgentMessageFileReferences(
  input: PrepareAgentMessageFileReferencesInput,
): Promise<PreparedAgentMessageFileReferences> {
  const inputProcessor = input.inputProcessor;
  if (!inputProcessor) {
    return { message: input.messageText, fileContents: [] };
  }

  try {
    const result = await inputProcessor.process(input.messageText);
    const fileContents = result.fileReferences
      .filter((ref): ref is { path: string; content: string } => typeof ref.content === 'string')
      .map((ref) => ({
        path: ref.path,
        content: ref.content,
      }));

    for (const error of result.errors) {
      input.onReferenceError?.(error);
    }

    return { message: input.messageText, fileContents };
  } catch (error) {
    input.onProcessingError?.(error);
    return { message: input.messageText, fileContents: [] };
  }
}

export async function mergeReferencedMediaImageAttachments(
  input: MergeReferencedMediaImageAttachmentsInput,
): Promise<AgentBase64ImageAttachment[]> {
  const paths = extractFileReferencePaths(input.message);
  const result = [...input.existingImages];

  if (paths.length === 0) {
    return result;
  }

  const mediaProcessor = (await input.createMediaProcessor?.()) ?? null;
  if (!mediaProcessor) {
    return result;
  }

  for (const filePath of paths) {
    try {
      const processed = await mediaProcessor.process(filePath);
      if (processed.type === 'unsupported') {
        continue;
      }

      for (const image of processed.images) {
        result.push({
          type: 'base64',
          media_type: image.media_type,
          data: image.data,
        });
      }

      input.onProcessed?.({
        filePath,
        mediaType: processed.type,
        ...(processed.metadata !== undefined ? { metadata: processed.metadata } : {}),
      });
    } catch (error) {
      input.onError?.({ filePath, error });
    }
  }

  return result;
}

export function projectContextReferences(
  payloads: readonly AgentContextPayload[] | undefined,
): MessageContextReference[] | undefined {
  if (!payloads || payloads.length === 0) return undefined;
  return payloads.map((p) => ({
    type: p.type,
    id: p.id,
    label: p.label,
    navigationData: extractContextNavigationData(p),
  }));
}

function extractContextNavigationData(
  payload: AgentContextPayload,
): Record<string, string> | undefined {
  const data = payload.data as Record<string, unknown> | null | undefined;
  if (!data || typeof data !== 'object') return undefined;
  const nav: Record<string, string> = {};
  if (typeof data['filePath'] === 'string') nav['filePath'] = data['filePath'];
  if (typeof data['path'] === 'string') nav['path'] = data['path'];
  if (payload.type === 'canvas-node') nav['nodeId'] = payload.id;
  return Object.keys(nav).length > 0 ? nav : undefined;
}

export async function prepareAgentMessageDispatch(
  input: PrepareAgentMessageDispatchInput,
): Promise<PreparedAgentMessageDispatch> {
  const startTime = Date.now();
  const request = input.request;
  const logger = getMessageRuntimeLogger();
  logger.debug('neko.agent.message.assembly.request', {
    conversationId: request.conversationId,
    sessionMode: request.sessionMode,
    messageChars: request.messageText.length,
    attachmentCount: request.attachments?.length ?? 0,
    attachmentSummary: summarizeMessageAttachments(request.attachments),
    contextPayloadCount: request.contextPayloads?.length ?? 0,
    contextPayloadSummary: summarizeContextPayloads(request.contextPayloads),
    hasChatModel: request.chatModel !== undefined,
    hasMediaModel: request.mediaModel !== undefined,
    mediaModelCategories: request.mediaModels ? Object.keys(request.mediaModels) : [],
    promptId: request.promptId,
    hasExecutionOverrides: request.executionOverrides !== undefined,
  });
  logger.debug('neko.agent.message.assembly.request.raw', {
    conversationId: request.conversationId,
    sessionMode: request.sessionMode,
    messageText: request.messageText,
    attachments: sanitizeAttachmentsForDebugLog(request.attachments),
    contextPayloads: sanitizeForDebugLog(request.contextPayloads),
    chatModel: request.chatModel,
    mediaModel: request.mediaModel,
    mediaModels: request.mediaModels,
    promptId: request.promptId,
    executionOverrides: sanitizeForDebugLog(request.executionOverrides),
  });

  const { message: parsedMessage, fileContents } = await prepareAgentMessageFileReferences({
    messageText: request.messageText,
    inputProcessor: input.inputProcessor,
    onReferenceError: input.onReferenceError,
    onProcessingError: input.onFileReferenceProcessingError,
  });

  const { textContent: attachmentText, imageAttachments } = await input.processAttachments(
    request.attachments,
  );
  const mediaImages = await mergeReferencedMediaImageAttachments({
    message: parsedMessage,
    existingImages: imageAttachments,
    createMediaProcessor: input.createReferencedMediaProcessor,
    onProcessed: input.onReferencedMediaProcessed,
    onError: input.onReferencedMediaError,
  });

  const enhancedMessage = buildEnhancedAgentMessage({
    message: parsedMessage,
    contextPayloads: request.contextPayloads,
    fileContents,
    attachmentText,
  });
  const route: AgentMessageDispatchRoute =
    request.sessionMode !== 'agent' && request.mediaModel
      ? { kind: 'media', mediaModel: request.mediaModel }
      : { kind: 'agent' };

  logger.debug('neko.agent.message.assembly.result', {
    conversationId: request.conversationId,
    durationMs: Date.now() - startTime,
    routeKind: route.kind,
    inputMessageChars: request.messageText.length,
    parsedMessageChars: parsedMessage.length,
    enhancedMessageChars: enhancedMessage.length,
    referencedFileCount: fileContents.length,
    referencedFiles: fileContents.map((file) => ({
      path: file.path,
      chars: file.content.length,
    })),
    attachmentTextChars: attachmentText.length,
    imageAttachmentCount: imageAttachments.length,
    mediaImageCount: mediaImages.length,
    mediaImageSummary: summarizeBase64Images(mediaImages),
    contextPayloadCount: request.contextPayloads?.length ?? 0,
  });
  logger.debug('neko.agent.message.assembly.result.raw', {
    conversationId: request.conversationId,
    route,
    parsedMessage,
    enhancedMessage,
    referencedFiles: fileContents,
    attachmentText,
    mediaImages: summarizeBase64Images(mediaImages),
    userMessageContent: request.messageText,
  });

  const contextReferences = projectContextReferences(request.contextPayloads);

  return {
    conversationId: request.conversationId,
    enhancedMessage,
    userMessage: {
      id: input.generateMessageId(),
      role: 'user',
      content: request.messageText,
      timestamp: input.now?.() ?? Date.now(),
      ...(request.attachments && request.attachments.length > 0
        ? { attachments: request.attachments }
        : {}),
      ...(contextReferences ? { contextReferences } : {}),
    },
    mediaImages,
    route,
  };
}

export async function runAgentMessageTurnRuntime(
  input: RunAgentMessageTurnRuntimeInput,
): Promise<RunAgentMessageTurnRuntimeResult> {
  const conversationId = input.request.conversationId;
  if (!conversationId) {
    input.onMissingConversationId?.();
    input.postMessage(
      buildGlobalErrorMessage('Cannot send message without an explicit conversationId.'),
    );
    return { status: 'rejected-missing-conversation' };
  }

  const prepared = await prepareAgentMessageDispatch({
    request: input.request,
    inputProcessor: input.inputProcessor,
    processAttachments: input.processAttachments,
    createReferencedMediaProcessor: input.createReferencedMediaProcessor,
    onReferenceError: input.onReferenceError,
    onFileReferenceProcessingError: input.onFileReferenceProcessingError,
    onReferencedMediaProcessed: input.onReferencedMediaProcessed,
    onReferencedMediaError: input.onReferencedMediaError,
    generateMessageId: input.generateMessageId,
    now: input.now,
  });

  input.persistUserMessage(conversationId, prepared.userMessage);
  input.postMessage(buildThinkingMessage(conversationId));

  if (prepared.route.kind === 'media' && input.executeMediaTurn) {
    await input.executeMediaTurn({
      conversationId,
      prompt: prepared.enhancedMessage,
      mediaModel: prepared.route.mediaModel,
    });
    return { status: 'media-dispatched' };
  }

  if (input.executeAgentTurn) {
    await input.executeAgentTurn({
      conversationId,
      message: prepared.enhancedMessage,
      chatModel: input.request.chatModel,
      imageAttachments: prepared.mediaImages,
      mediaModel: input.request.mediaModel,
      mediaModels: input.request.mediaModels,
      executionOverrides: input.request.executionOverrides,
    });
    return { status: 'agent-dispatched' };
  }

  const preconditionMessage = getAgentTurnPreconditionMessage('no-provider-configured');
  input.persistErrorMessage?.(
    conversationId,
    buildAgentErrorAssistantMessage({
      id: input.generateMessageId(),
      timestamp: input.now?.() ?? Date.now(),
      message: preconditionMessage,
    }),
  );
  input.postMessage(
    buildErrorMessage({
      conversationId,
      message: preconditionMessage,
    }),
  );
  return { status: 'precondition-unmet', reason: 'no-agent-runtime' };
}

export function buildEnhancedAgentMessage(input: BuildEnhancedAgentMessageInput): string {
  const fileContents = input.fileContents ?? [];
  const contextPayloads = input.contextPayloads ?? [];
  let enhancedMessage = input.message;

  if (contextPayloads.length > 0) {
    enhancedMessage += '\n\n--- Attached Context ---';
    for (const payload of contextPayloads) {
      enhancedMessage += `\n\n${formatAgentContextPayload(payload)}`;
    }
  }

  if (fileContents.length > 0) {
    enhancedMessage += '\n\n--- Referenced Files ---';
    for (const file of fileContents) {
      enhancedMessage += `\n\n### File: ${file.path}\n\`\`\`\n${file.content}\n\`\`\``;
    }
  }

  if (input.attachmentText) {
    enhancedMessage += `\n\n--- Attached Files ---${input.attachmentText}`;
  }

  return enhancedMessage;
}

export function formatAgentContextPayload(payload: AgentContextPayload): string {
  const documentContext =
    payload.type === 'document-selection' ? extractDocumentContextData(payload.data) : undefined;
  const text = extractAgentContextText(payload.data);
  const imageData = extractAgentContextImageData(payload.data);
  const filePath = extractAgentContextFilePath(payload.data);

  if (documentContext) {
    const lines = [`[Document: ${payload.label}]`];
    const source = documentContext.source;
    lines.push(`Source: ${source?.filePath ?? filePath ?? 'unknown'}`);
    if (source?.format) {
      lines.push(`Format: ${source.format}`);
    }
    const locatorText = formatDocumentLocator(documentContext.locator);
    if (locatorText) {
      lines.push(`Locator: ${locatorText}`);
    }
    const excerptText = documentContext.excerpt?.text ?? text;
    if (excerptText) {
      lines.push(`Excerpt:\n${excerptText}`);
    }
    if (imageData || documentContext.excerpt?.imageData) {
      lines.push('[Image attached]');
    }
    lines.push(
      'Follow-up: use ReadDocument with mode="manifest" or mode="range" and this source/locator when more document context is needed.',
    );
    return lines.join('\n');
  }

  if (text && imageData) {
    return `[Content: ${payload.label}]\n${text}\n[Image attached]`;
  }

  if (text) {
    return `[Content: ${payload.label}]\n${text}`;
  }

  if (imageData) {
    return `[Image: ${payload.label}]\n[Image attached]`;
  }

  if (filePath) {
    return `[File: ${payload.label}]\n${filePath}`;
  }

  return `[Context: ${payload.label}]\n${payload.summary}`;
}

export function buildAgentProjectFileSearchPlan(
  input: AgentProjectFileSearchPlanInput = {},
): AgentProjectFileSearchPlan {
  const filter = normalizeProjectFileFilter(input.filter);
  return {
    includePattern: filter ? `**/*${filter}*` : '**/*',
    excludePattern: DEFAULT_MENTION_EXCLUDE_GLOB,
    limit: input.limit ?? 30,
  };
}

export async function executeAgentProjectFileSearch(
  input: ExecuteAgentProjectFileSearchInput,
): Promise<ProjectFilesWebviewMessage> {
  let files: readonly AgentProjectFileCandidate[] = [];
  let mentionCandidates: readonly AgentProjectMentionCandidate[] = [];
  const plan = buildAgentProjectFileSearchPlan({ filter: input.filter });

  try {
    files = input.searchProjectFiles ? await input.searchProjectFiles(plan) : [];
  } catch (error) {
    input.onSearchError?.(error);
  }

  try {
    mentionCandidates = input.getMentionCandidates ? await input.getMentionCandidates(plan) : [];
  } catch (error) {
    input.onSearchError?.(error);
  }

  const [characters, scenes] = await Promise.all([
    input.getCharacters?.().catch(() => [] as AgentMentionCharacter[]) ?? [],
    input.getScenes?.().catch(() => [] as AgentMentionScene[]) ?? [],
  ]);

  return projectAgentProjectFilesMessage({
    conversationId: input.conversationId,
    filter: input.filter,
    files,
    canvasNodes: input.getCanvasNodes?.(input.conversationId) ?? [],
    characters,
    scenes,
    mentionCandidates,
  });
}

export function projectAgentProjectFilesMessage(
  input: AgentProjectFilesProjectionInput,
): ProjectFilesWebviewMessage {
  return {
    type: 'projectFiles',
    conversationId: input.conversationId,
    filter: input.filter ?? '',
    files: projectAgentFileMentions(input.files),
    mentionExtras: projectAgentMentionExtras(
      input.canvasNodes ?? [],
      input.filter,
      input.characters,
      input.scenes,
      input.mentionCandidates,
    ),
  };
}

export function projectAgentFileMentions(
  files: readonly AgentProjectFileCandidate[],
): ProjectFileMentionInfo[] {
  return files.map((file) => {
    const relativePath = normalizeRelativeProjectPath(file.relativePath);
    return {
      path: relativePath,
      name: getProjectPathBaseName(relativePath),
      type: 'file',
      ...(file.icon ? { icon: file.icon } : {}),
      ...(file.source ? { source: file.source } : {}),
      ...(file.mediaType ? { mediaType: file.mediaType } : {}),
    };
  });
}

export function projectAgentMentionExtras(
  canvasNodes: readonly AgentAmbientCanvasNode[],
  filter?: string,
  characters?: readonly AgentMentionCharacter[],
  scenes?: readonly AgentMentionScene[],
  mentionCandidates?: readonly AgentProjectMentionCandidate[],
): ProjectMentionExtra[] {
  const normalizedFilter = normalizeProjectFileFilter(filter).toLowerCase();
  const extras: ProjectMentionExtra[] = [];

  for (const node of canvasNodes) {
    if (!normalizedFilter || node.summary.toLowerCase().includes(normalizedFilter)) {
      extras.push({
        type: 'canvas-node',
        id: node.nodeId,
        label: node.summary,
        summary: `Canvas: ${node.summary}`,
        source: 'canvas',
      });
    }
  }

  if (characters) {
    for (const c of characters) {
      if (!normalizedFilter || c.name.toLowerCase().includes(normalizedFilter)) {
        extras.push({
          type: 'character',
          id: c.id,
          label: c.name,
          summary: `Character: ${c.name}${c.role ? ` (${c.role})` : ''}`,
          source: 'story',
          ...(c.thumbnailUri ? { thumbnailUri: c.thumbnailUri } : {}),
        });
      }
    }
  }

  if (scenes) {
    for (const s of scenes) {
      const text = `${s.title} ${s.heading ?? ''}`.toLowerCase();
      if (!normalizedFilter || text.includes(normalizedFilter)) {
        extras.push({
          type: 'scene',
          id: s.id,
          label: s.title,
          summary: `Scene: ${s.heading ?? s.title}`,
          source: 'story',
        });
      }
    }
  }

  if (mentionCandidates) {
    for (const candidate of mentionCandidates) {
      const text = `${candidate.label} ${candidate.summary} ${candidate.filePath ?? ''} ${
        candidate.entityType ?? ''
      }`.toLowerCase();
      if (normalizedFilter && !text.includes(normalizedFilter)) {
        continue;
      }

      extras.push({
        type: candidate.type,
        id: candidate.id,
        label: candidate.label,
        summary: candidate.summary,
        ...(candidate.source ? { source: candidate.source } : {}),
        ...(candidate.icon ? { icon: candidate.icon } : {}),
        ...(candidate.filePath
          ? { filePath: normalizeRelativeProjectPath(candidate.filePath) }
          : {}),
        ...(candidate.mediaType ? { mediaType: candidate.mediaType } : {}),
        ...(candidate.entityType ? { entityType: candidate.entityType } : {}),
        ...(candidate.thumbnailUri ? { thumbnailUri: candidate.thumbnailUri } : {}),
        ...(candidate.navigationData ? { navigationData: candidate.navigationData } : {}),
      });
    }
  }

  return extras;
}

export function buildAgentAssistantMessageFromStream(
  input: BuildAgentAssistantMessageInput,
): Message | null {
  const stream = input.stream;
  if (!shouldPersistAgentAssistantStream(stream)) {
    return null;
  }

  return {
    id: input.id,
    role: 'assistant',
    content: buildAgentAssistantStreamContent(stream),
    timestamp: input.timestamp,
    contentBlocks: stream.contentBlocks.length > 0 ? [...stream.contentBlocks] : undefined,
    ...(stream.hasError ? { isError: true } : {}),
  };
}

function buildAgentAssistantStreamContent(stream: AgentStreamPersistenceSnapshot): string {
  if (!stream.errorMessage) {
    return stream.accumulatedResponse;
  }

  if (!stream.accumulatedResponse) {
    return stream.errorMessage;
  }

  return `${stream.accumulatedResponse.trimEnd()}\n\n${stream.errorMessage}`;
}

export function buildAgentErrorAssistantMessage(
  input: BuildAgentErrorAssistantMessageInput,
): Message {
  const content =
    input.message && input.message.trim().length > 0 ? input.message : 'An error occurred';
  return {
    id: input.id,
    role: 'assistant',
    content,
    timestamp: input.timestamp,
    isError: true,
  };
}

export function shouldPersistAgentAssistantStream(stream: AgentStreamPersistenceSnapshot): boolean {
  return Boolean(
    stream.accumulatedResponse ||
    stream.accumulatedThinking ||
    (stream.hasError && stream.errorMessage) ||
    stream.collectedToolCalls.length > 0,
  );
}

export function buildAgentTurnContextPatch(
  input: AgentTurnContextPatchInput,
): AgentTurnContextPatch {
  const patch: AgentTurnContextPatch = {
    ...(input.imageAttachments && input.imageAttachments.length > 0
      ? { imageAttachments: [...input.imageAttachments] }
      : {}),
    ...(input.canvasNodes && input.canvasNodes.length > 0
      ? { canvasContext: { selectedNodes: [...input.canvasNodes] } }
      : {}),
    ...(input.multimodalContextPacket !== undefined && input.multimodalContextPacket !== null
      ? { multimodalContextPacket: input.multimodalContextPacket }
      : input.canvasContextPacket !== undefined && input.canvasContextPacket !== null
        ? { multimodalContextPacket: input.canvasContextPacket }
        : input.timelineContextPacket !== undefined && input.timelineContextPacket !== null
          ? { multimodalContextPacket: input.timelineContextPacket }
          : {}),
    ...(input.executionMetadata ? { metadata: input.executionMetadata } : {}),
  };

  return patch;
}

export function appendAmbientCanvasSystemPrompt(
  systemPrompt: string,
  nodes: readonly AgentAmbientCanvasNode[],
): string {
  if (nodes.length === 0) {
    return systemPrompt;
  }

  const nodeLines = nodes
    .map((node) => `  - [${node.type}] ${node.summary} (id: ${node.nodeId})`)
    .join('\n');
  return (
    systemPrompt +
    `\n\n## Current Canvas Selection\nThe user has selected the following canvas node(s):\n${nodeLines}\n` +
    'Use canvas_get_node / canvas_update_node / canvas_generate_image tools to operate on them.'
  );
}

function normalizeProjectFileFilter(filter?: string): string {
  return (filter ?? '').trim();
}

function normalizeRelativeProjectPath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function getProjectPathBaseName(filePath: string): string {
  return filePath.split('/').pop() || filePath;
}

export function selectAgentTurnProvider<TProvider extends AgentProviderCandidate>(
  input: AgentTurnProviderSelectionInput<TProvider>,
): AgentTurnProviderSelection<TProvider> {
  const effectiveProviderId = input.requestedProviderId || input.selectedProviderId;
  const requestedProvider = effectiveProviderId
    ? input.getProvider(effectiveProviderId)
    : undefined;
  const provider =
    requestedProvider && requestedProvider.isConfigured
      ? requestedProvider
      : input.getDefaultProvider();

  if (!provider?.isConfigured) {
    return {
      ok: false,
      ...(effectiveProviderId ? { effectiveProviderId } : {}),
      reason: 'no-provider-configured',
    };
  }

  return {
    ok: true,
    provider,
    ...(effectiveProviderId ? { effectiveProviderId } : {}),
  };
}

export function shouldHydrateAgentHistory(input: {
  readonly agentHistoryLength: number;
  readonly conversationMessageCount: number;
  readonly agentHistory?: readonly AgentHistoryHydrationCandidateMessage[];
}): boolean {
  const hasOnlySystemPrompt =
    input.agentHistoryLength === 1 &&
    input.agentHistory?.length === 1 &&
    input.agentHistory[0]?.role === 'system';

  return (
    (input.agentHistoryLength === 0 || hasOnlySystemPrompt) && input.conversationMessageCount > 1
  );
}

export function getAgentHistoryToHydrate<TMessage>(fullHistory: readonly TMessage[]): TMessage[] {
  return fullHistory.slice(0, -1);
}

export function buildAgentHistoryHydrationPlan<TMessage>(
  input: AgentHistoryHydrationPlanInput<TMessage>,
): AgentHistoryHydrationPlan<TMessage> {
  if (!shouldHydrateAgentHistory(input)) {
    if (input.conversationMessageCount <= 1) {
      return { kind: 'skip', reason: 'conversation-too-short' };
    }
    return { kind: 'skip', reason: 'agent-history-not-empty' };
  }

  const historyToLoad = getAgentHistoryToHydrate(input.fullHistory);
  if (historyToLoad.length === 0) {
    return { kind: 'skip', reason: 'empty-history' };
  }

  return { kind: 'load-history', historyToLoad };
}

export function buildAgentTurnConfigurationPlan(
  input: AgentTurnConfigurationPlanInput,
): AgentTurnConfigurationPlan {
  const effectiveExecutionMode =
    input.executionOverrides?.executionMode ?? (input.isPlanMode ? 'plan' : input.executionMode);
  const turnRuntime = buildAgentTurnRuntimePlan({
    executionMode: effectiveExecutionMode,
    executionOverrides: input.executionOverrides,
    mediaModel: input.mediaModel,
    mediaModels: input.mediaModels,
  });

  return {
    systemPrompt: appendAmbientCanvasSystemPrompt(
      input.baseSystemPrompt,
      input.ambientCanvas ?? [],
    ),
    maxIterations: input.maxIterations ?? 200,
    autoExecuteTools: input.autoExecuteTools,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    modelId: input.chatModel?.modelId,
    providerExpressionTargets: turnRuntime.providerExpressionTargets,
    executionMode: effectiveExecutionMode,
    thinkingBudget: input.thinkingBudget,
    workspaceRoot: input.workspaceRoot,
    conversationId: input.conversationId,
    executionMetadata: turnRuntime.executionMetadata,
  };
}

export function buildAgentTurnRuntimePlan(input: AgentTurnRuntimePlanInput): AgentTurnRuntimePlan {
  const runtimeMediaModels = buildRuntimeMediaModelSelections(input.mediaModels, input.mediaModel);
  const executionMetadata = buildAgentTurnExecutionMetadata(
    input.executionMode,
    input.executionOverrides?.metadata,
    runtimeMediaModels,
  );

  return {
    providerExpressionTargets: buildProviderExpressionTargets(input.mediaModels, input.mediaModel),
    ...(runtimeMediaModels ? { runtimeMediaModels } : {}),
    ...(executionMetadata ? { executionMetadata } : {}),
  };
}

export function buildProviderExpressionTargets(
  agentMediaModels: AgentMediaModelSelections | undefined,
  mediaModel?: ModelRef<MediaModelCategory>,
): ProviderExpressionTargetConfig[] | undefined {
  if (agentMediaModels && Object.keys(agentMediaModels).length > 0) {
    const targets: ProviderExpressionTargetConfig[] = [];
    if (agentMediaModels.image) {
      targets.push({
        capability: 'image.generate',
        providerId: agentMediaModels.image.providerId,
        modelId: agentMediaModels.image.modelId,
      });
    }
    if (agentMediaModels.video) {
      targets.push({
        capability: 'video.generate',
        providerId: agentMediaModels.video.providerId,
        modelId: agentMediaModels.video.modelId,
      });
    }
    if (agentMediaModels.audio) {
      targets.push({
        capability: 'audio.generate',
        providerId: agentMediaModels.audio.providerId,
        modelId: agentMediaModels.audio.modelId,
      });
    }
    return targets;
  }

  if (!mediaModel) return undefined;

  return MEDIA_GENERATION_CAPABILITIES.map((capability) => ({
    capability,
    providerId: mediaModel.providerId,
    modelId: mediaModel.modelId,
  }));
}

export function buildRuntimeMediaModelSelections(
  agentMediaModels: AgentMediaModelSelections | undefined,
  mediaModel?: ModelRef<MediaModelCategory>,
): RuntimeMediaModelSelections | undefined {
  if (agentMediaModels && Object.keys(agentMediaModels).length > 0) {
    return {
      ...(agentMediaModels.image ? { image: agentMediaModels.image } : {}),
      ...(agentMediaModels.video ? { video: agentMediaModels.video } : {}),
      ...(agentMediaModels.audio
        ? { audio: agentMediaModels.audio, music: agentMediaModels.audio }
        : {}),
    };
  }

  if (!mediaModel) return undefined;

  return {
    image: mediaModel,
    video: mediaModel,
    audio: mediaModel,
    music: mediaModel,
  };
}

export function buildAgentTurnExecutionMetadata(
  executionMode: 'auto' | 'ask' | 'plan',
  overrides?: Record<string, unknown>,
  mediaModels?: RuntimeMediaModelSelections,
): Record<string, unknown> | undefined {
  const base = executionMode === 'plan' ? createPlanModeIdcMetadata() : undefined;
  const merged = mergeIdcExecutionMetadata(base, overrides);
  if (!mediaModels || Object.keys(mediaModels).length === 0) return merged;
  return {
    ...(merged ?? {}),
    mediaModels,
  };
}

export function buildAgentExecutionMetadata(
  input: AgentExecutionMetadataInput,
): Record<string, unknown> | undefined {
  const metadata: Record<string, unknown> = { ...(input.metadata ?? {}) };

  if (input.multimodalContextPacket) {
    metadata['multimodalContextPacket'] = input.multimodalContextPacket;
  }
  if (input.conversationId) {
    metadata['conversationId'] = input.conversationId;
  }
  if (input.parentAgentId) {
    metadata['parentAgentId'] = input.parentAgentId;
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

export function summarizeAgentEventProgress(event: AgentEvent): string | undefined {
  switch (event.type) {
    case 'iteration': {
      if (!event.iteration) {
        return '20% Running iteration';
      }
      const percent = Math.min(90, Math.max(10, event.iteration.current * 10));
      return `${percent}% Iteration ${event.iteration.current}/${event.iteration.max}`;
    }
    case 'tool_call':
      return event.toolCall ? `35% Calling ${event.toolCall.name}` : '35% Calling tool';
    case 'tool_progress':
      return event.toolProgress
        ? `${Math.min(95, Math.max(0, event.toolProgress.percent))}% ${event.toolProgress.stage}`
        : '50% Tool running';
    case 'tool_result':
      return '75% Tool result received';
    case 'done':
      return '95% Finalizing';
    default:
      return undefined;
  }
}

function summarizeMessageAttachments(
  attachments: readonly MessageAttachment[] | undefined,
): readonly Record<string, unknown>[] {
  return (attachments ?? []).map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    type: attachment.type,
    hasPath: typeof attachment.path === 'string' && attachment.path.length > 0,
    path: attachment.path,
    hasPreview: typeof attachment.preview === 'string' && attachment.preview.length > 0,
    previewChars: attachment.preview?.length ?? 0,
  }));
}

function summarizeContextPayloads(
  payloads: readonly AgentContextPayload[] | undefined,
): readonly Record<string, unknown>[] {
  return (payloads ?? []).map((payload) => ({
    id: payload.id,
    type: payload.type,
    label: payload.label,
    summaryChars: payload.summary.length,
    dataKeys: isRecord(payload.data) ? Object.keys(payload.data) : [],
    hasText: extractAgentContextText(payload.data) !== undefined,
    hasImageData: extractAgentContextImageData(payload.data) !== undefined,
    hasFilePath: extractAgentContextFilePath(payload.data) !== undefined,
  }));
}

function summarizeBase64Images(
  images: readonly AgentBase64ImageAttachment[],
): readonly Record<string, unknown>[] {
  return images.map((image, index) => ({
    index,
    type: image.type,
    mediaType: image.media_type,
    dataChars: image.data.length,
  }));
}

function sanitizeAttachmentsForDebugLog(
  attachments: readonly MessageAttachment[] | undefined,
): readonly Record<string, unknown>[] {
  return (attachments ?? []).map((attachment) => ({
    ...attachment,
    ...(attachment.preview ? { preview: sanitizeMediaStringForDebugLog(attachment.preview) } : {}),
  }));
}

function sanitizeForDebugLog(value: unknown): unknown {
  if (typeof value === 'string') {
    return sanitizeMediaStringForDebugLog(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForDebugLog(item));
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (isLikelyMediaDataKey(key) && typeof entry === 'string') {
        return [key, sanitizeMediaStringForDebugLog(entry)];
      }
      return [key, sanitizeForDebugLog(entry)];
    }),
  );
}

function isLikelyMediaDataKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    normalized === 'data' ||
    normalized === 'imagedata' ||
    normalized === 'image' ||
    normalized === 'preview' ||
    normalized === 'thumbnail'
  );
}

function sanitizeMediaStringForDebugLog(value: string): string {
  if (value.startsWith('data:')) {
    const metadataEnd = value.indexOf(',');
    const metadata = metadataEnd >= 0 ? value.slice(0, metadataEnd) : 'data:';
    return `${metadata},<omitted ${value.length} chars>`;
  }

  if (value.length > 4096 && /^[A-Za-z0-9+/=\r\n]+$/.test(value)) {
    return `<base64 omitted ${value.length} chars>`;
  }

  return value;
}

function extractAgentContextText(data: unknown): string | undefined {
  if (!isRecord(data)) return undefined;
  return optionalString(data['text']) ?? optionalString(data['selectedText']);
}

function extractAgentContextImageData(data: unknown): string | undefined {
  if (!isRecord(data)) return undefined;
  return optionalString(data['imageData']);
}

function extractAgentContextFilePath(data: unknown): string | undefined {
  if (!isRecord(data)) return undefined;
  return optionalString(data['filePath']) ?? optionalString(data['path']);
}

function extractDocumentContextData(data: unknown): DocumentContextData | undefined {
  if (!isRecord(data)) return undefined;
  const source = data['source'];
  const locator = data['locator'];
  if (isRecord(source) || isRecord(locator) || isRecord(data['excerpt'])) {
    return data as DocumentContextData;
  }
  return undefined;
}

function formatDocumentLocator(locator: DocumentLocator | undefined): string | undefined {
  if (!locator) return undefined;
  switch (locator.kind) {
    case 'page':
      return `page ${locator.pageNumber}${locator.entryName ? ` (${locator.entryName})` : ''}`;
    case 'chapter':
      return `chapter ${locator.chapterHref}${locator.spineIndex !== undefined ? ` spine ${locator.spineIndex}` : ''}`;
    case 'slide':
      return `slide ${locator.slideNumber}`;
    case 'text-range':
      if (locator.startLine !== undefined || locator.endLine !== undefined) {
        return `lines ${locator.startLine ?? '?'}-${locator.endLine ?? '?'}`;
      }
      return `chars ${locator.startChar ?? '?'}-${locator.endChar ?? '?'}`;
    case 'region':
      return `page ${locator.pageNumber} region x=${locator.region.x} y=${locator.region.y} w=${locator.region.width} h=${locator.region.height}`;
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
