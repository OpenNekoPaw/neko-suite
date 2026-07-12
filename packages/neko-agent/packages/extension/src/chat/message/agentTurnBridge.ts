/**
 * Webview bridge for agent turns.
 *
 * @neko/agent owns turn planning, context patching, history hydration, and
 * stream projection. This bridge wires those runtime contracts to VSCode host
 * services and webview messages.
 */

import * as vscode from 'vscode';
import type { AssistantRuntimeSettingsSnapshot, Platform } from '@neko/platform';
import { buildAgentSessionDiagnosticMessage } from '@neko-agent/types';
import type {
  AgentLlmConfig,
  AgentMediaModelSelections,
  MediaUnderstandingModelSelections,
  AgentModelSlots,
  AgentPhase,
  MediaModelCategory,
  ModelRef,
} from '@neko-agent/types';
import {
  buildAgentTurnRuntimeInput,
  createTimelineContextRuntime,
  runAgentTurnRuntime,
  type AgentPendingMessageSource,
  type AgentLlmRuntimeOptions,
  type AgentMessageExecutionOverrides,
  type AgentTurnAgentManager,
  type RunAgentTurnRuntimeResult,
  type TimelineContextRuntime,
} from '@neko/agent/runtime';
import type {
  ActiveSkillState,
  AgentHistoryWithToolContextMessage,
  IRuntimeTaskManager,
} from '@neko/agent';
import type { SkillLifecycleProjection } from '@neko/shared';
import { getHostContentAuthorizedReadRoots } from '@neko/shared/vscode/extension';
import type { IAgentManager } from '../../ai/agentManager';
import type { IAgentRunner } from '../../ai/agentRunner';
import type { IAgentContext } from '../../ai/agentContext';
import type { IEditorRegistry } from '../../editor/common/editorRegistry';
import { getCanvasSelection } from '../../services/canvasAmbientContext';
import type {
  ConversationBridge,
  ConversationTerminalPersistenceResult,
} from '../conversationBridge';
import type { ProviderManager } from '../providerManager';
import type { AgentStreamProcessor, StreamProcessingResult } from './agentStreamProcessor';
import type { AccountAiCatalogCache } from '../../services/accountAiCatalogCache';
import { loadWorkspaceFileIgnoreRules } from '../../services/workspaceIgnoreFilter';

export interface AgentTurnBridgeDeps {
  providers: ProviderManager;
  conversations: ConversationBridge;
  agentManager?: IAgentManager;
  editorRegistry?: IEditorRegistry;
  getSystemPrompt: (conversationId: string) => string;
  isPlanMode: (conversationId: string) => boolean;
  platform?: Platform;
  taskManager?: IRuntimeTaskManager;
  getActiveSkillState?: (conversationId: string) => ActiveSkillState | undefined;
  getSkillLifecycleProjection?: (conversationId: string) => SkillLifecycleProjection | undefined;
  accountAiCatalog?: AccountAiCatalogCache;
  streamProcessor: AgentStreamProcessor;
  onPhaseChange: (event: {
    conversationId: string;
    phase: AgentPhase;
    toolName?: string;
    timestamp: number;
  }) => void;
  ensureSubAgentEventSubscription: (
    webview: vscode.Webview,
    conversationId: string,
    agentRunner: IAgentRunner,
  ) => void;
  generateMessageId: () => string;
}

export type AgentTurnDurabilityOutcome =
  | { readonly status: 'durable'; readonly result: ConversationTerminalPersistenceResult }
  | { readonly status: 'failed'; readonly result: ConversationTerminalPersistenceResult }
  | { readonly status: 'skipped'; readonly reason: 'model-not-completed' };

export type AgentTurnModelOutcome =
  | { readonly status: 'completed' | 'cancelled'; readonly streamCount: number }
  | { readonly status: 'failed'; readonly streamCount: number; readonly error?: unknown }
  | { readonly status: 'precondition-unmet'; readonly streamCount: 0 }
  | { readonly status: 'queued'; readonly streamCount: 0 };

export interface AgentTurnLifecycleResult {
  readonly model: AgentTurnModelOutcome;
  readonly terminalConversationDurability: AgentTurnDurabilityOutcome;
}

export type AgentTurnBridgeExecutionResult = RunAgentTurnRuntimeResult & {
  readonly lifecycle: AgentTurnLifecycleResult;
  readonly conversationDurability?: ConversationTerminalPersistenceResult;
};

export interface ExecuteAgentTurnForWebviewInput {
  webview: vscode.Webview;
  conversationId: string;
  message: string;
  pendingMessageSource?: AgentPendingMessageSource;
  chatModel?: ModelRef<'llm'>;
  agentModels?: AgentModelSlots;
  llmConfig?: AgentLlmConfig;
  llmRuntimeOptions?: AgentLlmRuntimeOptions;
  imageAttachments?: readonly { type: 'base64'; media_type: string; data: string }[];
  mediaModel?: ModelRef<MediaModelCategory>;
  mediaModels?: AgentMediaModelSelections;
  understandingModels?: MediaUnderstandingModelSelections;
  executionOverrides?: AgentMessageExecutionOverrides;
  locale?: string;
  settings: AssistantRuntimeSettingsSnapshot;
}

export class AgentTurnBridge {
  private readonly timelineContextRuntime: TimelineContextRuntime;

  constructor(private readonly deps: AgentTurnBridgeDeps) {
    this.timelineContextRuntime = createTimelineContextRuntime();
  }

  async execute(input: ExecuteAgentTurnForWebviewInput): Promise<AgentTurnBridgeExecutionResult> {
    const turnSettings = input.settings;
    await this.refreshAccountCatalogForTurn(input.chatModel?.providerId);
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const workspaceIgnoreRules = workspaceRoot
      ? await loadWorkspaceFileIgnoreRules(workspaceRoot)
      : undefined;
    const authorizedReadRoots = await getHostContentAuthorizedReadRoots({
      workspaceRoot,
      getExtension: vscode.extensions.getExtension,
    });
    const agentManagerBridge:
      | AgentTurnAgentManager<
          Platform,
          IAgentContext,
          AgentHistoryWithToolContextMessage,
          IAgentRunner
        >
      | undefined = this.deps.agentManager
      ? {
          getOrCreate: (id) => this.deps.agentManager!.getOrCreate(id),
          loadHistoryWithContext: (id, history) =>
            this.deps.agentManager!.loadHistoryWithContext(id, history),
          nextMessageQueueSnapshotVersion: (id) =>
            this.deps.agentManager!.nextMessageQueueSnapshotVersion(id),
        }
      : undefined;

    const streamResults: StreamProcessingResult[] = [];
    const result = await runAgentTurnRuntime(
      buildAgentTurnRuntimeInput({
        conversationId: input.conversationId,
        message: input.message,
        ...(input.pendingMessageSource ? { pendingMessageSource: input.pendingMessageSource } : {}),
        platform: this.deps.platform,
        locale: input.locale,
        chatModel: input.chatModel,
        agentModels: input.agentModels,
        llmConfig: input.llmConfig,
        llmRuntimeOptions: input.llmRuntimeOptions,
        modelTokenMetadata: resolveSelectedModelTokenMetadata(this.deps.providers, input.chatModel),
        modelCapabilities: resolveSelectedModelCapabilities(this.deps.providers, input.chatModel),
        mediaModel: input.mediaModel,
        mediaModels: input.mediaModels,
        understandingModels: input.understandingModels,
        imageAttachments: input.imageAttachments,
        executionOverrides: input.executionOverrides,
        settings: {
          customSystemPrompt: turnSettings.customSystemPrompt,
          executionMode: turnSettings.executionMode,
          autoExecuteTools: turnSettings.autoExecuteTools,
          temperature: turnSettings.temperature,
          maxTokens: turnSettings.maxTokens,
          thinkingBudget: turnSettings.thinkingBudget,
        },
        providers: {
          getProvider: (providerId) => this.deps.providers.getProvider(providerId),
        },
        runtime: {
          conversations: {
            getMessageCount: (id) => this.deps.conversations.get(id)?.messages.length ?? 0,
            getFullHistory: (id) => this.deps.conversations.toAgentHistory(id),
            addUserMessage: (id, userMessage) =>
              this.deps.conversations.upsertMessageToConversation(id, userMessage),
            addAssistantMessage: (id, assistantMessage) =>
              this.deps.conversations.upsertMessageToConversation(id, assistantMessage),
          },
          getBaseSystemPrompt: this.deps.getSystemPrompt,
          isPlanMode: this.deps.isPlanMode,
          getActiveSkillState: this.deps.getActiveSkillState,
          getSkillLifecycleProjection: this.deps.getSkillLifecycleProjection,
          ...(this.deps.taskManager ? { taskManager: this.deps.taskManager } : {}),
        },
        host: {
          agentManager: agentManagerBridge,
          getWorkspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
          ...(authorizedReadRoots.length > 0
            ? { getAuthorizedReadRoots: () => authorizedReadRoots }
            : {}),
          ...(workspaceIgnoreRules ? { getWorkspaceIgnoreRules: () => workspaceIgnoreRules } : {}),
          getActiveEditor: () => this.deps.editorRegistry?.getActiveEditor(),
          getAmbientCanvas: (id) => getCanvasSelection(id),
          timelineContextRuntime: this.timelineContextRuntime,
          processStream: async ({ conversationId, messageId, events, onPhaseChange }) => {
            const streamResult = await this.deps.streamProcessor.processStream(
              input.webview,
              conversationId,
              events,
              { messageId, onPhaseChange },
            );
            streamResults.push(streamResult);
            return streamResult;
          },
          ensureSubAgentEventSubscription: ({ conversationId, agentRunner }) =>
            this.deps.ensureSubAgentEventSubscription(input.webview, conversationId, agentRunner),
          postMessage: (message) => {
            void input.webview.postMessage(message);
          },
          onPhaseChange: this.deps.onPhaseChange,
          onErrorMessage: (conversationId, message) => {
            this.deps.conversations.addMessageToConversation(conversationId, message);
          },
          generateMessageId: this.deps.generateMessageId,
          now: () => Date.now(),
        },
      }),
    );
    const model = summarizeModelOutcome(result, streamResults);
    if (result.status !== 'completed') {
      return {
        ...result,
        lifecycle: {
          model,
          terminalConversationDurability: { status: 'skipped', reason: 'model-not-completed' },
        },
      };
    }

    const conversationDurability = await this.deps.conversations.persistConversationTerminal(
      input.conversationId,
    );
    const lifecycle: AgentTurnLifecycleResult = {
      model,
      terminalConversationDurability: isDurableConversationResult(conversationDurability)
        ? { status: 'durable', result: conversationDurability }
        : { status: 'failed', result: conversationDurability },
    };
    if (!isDurableConversationResult(conversationDurability)) {
      await postLifecycleDiagnostic(
        input.webview,
        buildAgentSessionDiagnosticMessage({
          code: 'conversation-durability-failed',
          severity: 'warning',
          action: 'persistConversationTerminal',
          conversationId: input.conversationId,
          message: describeConversationDurabilityFailure(conversationDurability),
        }),
      );
    }
    return { ...result, conversationDurability, lifecycle };
  }

  private async refreshAccountCatalogForTurn(providerId?: string): Promise<void> {
    if (!this.deps.accountAiCatalog) return;
    const cached = this.deps.accountAiCatalog.getCachedSnapshot();
    if (cached && (!providerId || cached.provider.id === providerId)) return;
    try {
      await this.deps.accountAiCatalog.getSnapshot();
    } catch (error) {
      this.deps.accountAiCatalog.invalidateForAuthFailure(error);
    }
  }
}

function summarizeModelOutcome(
  result: RunAgentTurnRuntimeResult,
  streams: readonly StreamProcessingResult[],
): AgentTurnModelOutcome {
  if (result.status === 'failed') {
    return { status: 'failed', streamCount: streams.length, error: result.error };
  }
  if (result.status === 'precondition-unmet') {
    return { status: 'precondition-unmet', streamCount: 0 };
  }
  if (result.status === 'queued') {
    return { status: 'queued', streamCount: 0 };
  }
  if (streams.some((stream) => stream.terminalStatus === 'failed')) {
    return { status: 'failed', streamCount: streams.length };
  }
  if (streams.some((stream) => stream.terminalStatus === 'cancelled')) {
    return { status: 'cancelled', streamCount: streams.length };
  }
  return { status: 'completed', streamCount: streams.length };
}

async function postLifecycleDiagnostic(
  webview: vscode.Webview,
  message: ReturnType<typeof buildAgentSessionDiagnosticMessage>,
): Promise<boolean> {
  try {
    return await webview.postMessage(message);
  } catch {
    return false;
  }
}

function resolveSelectedModelCapabilities(
  providers: ProviderManager,
  chatModel: ModelRef<'llm'> | undefined,
): readonly string[] | undefined {
  if (!chatModel?.providerId || !chatModel.modelId) {
    return undefined;
  }

  const provider = providers.getProvider(chatModel.providerId);
  const providerCapabilities = provider?.modelCapabilities?.[chatModel.modelId];
  if (providerCapabilities) {
    return [...providerCapabilities];
  }

  const model = providers.getModel(chatModel.modelId);
  if (!model || model.providerId !== chatModel.providerId) {
    return undefined;
  }
  return [...model.capabilities];
}

function resolveSelectedModelTokenMetadata(
  providers: ProviderManager,
  chatModel: ModelRef<'llm'> | undefined,
): { contextWindow?: number; maxOutputTokens?: number } | undefined {
  if (!chatModel?.providerId || !chatModel.modelId) {
    return undefined;
  }

  const model = providers.getModel(chatModel.modelId);
  if (!model || model.providerId !== chatModel.providerId) {
    return undefined;
  }

  return {
    ...(isPositiveInteger(model.contextWindow) ? { contextWindow: model.contextWindow } : {}),
    ...(isPositiveInteger(model.maxOutputTokens) ? { maxOutputTokens: model.maxOutputTokens } : {}),
  };
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isDurableConversationResult(result: ConversationTerminalPersistenceResult): boolean {
  return result.kind === 'saved' || result.kind === 'deleted';
}

function describeConversationDurabilityFailure(
  result: ConversationTerminalPersistenceResult,
): string {
  if (result.kind === 'failed' || result.kind === 'rejected') {
    return `The model run completed, but the conversation was not durably saved (${result.diagnostic.code}).`;
  }
  if (result.kind === 'skip') {
    return `The model run completed, but terminal conversation persistence was skipped (${result.reason}).`;
  }
  return 'The model run completed, but terminal conversation persistence is unavailable.';
}
