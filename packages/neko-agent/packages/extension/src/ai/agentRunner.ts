/**
 * AgentRunner is the VSCode-facing compatibility adapter for an
 * AgentRunnerPort implementation.
 *
 * Extension code owns host resources and VSCode event projection. Core agent
 * execution state lives in @neko/agent runtime and the host-agnostic
 * AgentRunnerRuntimeAdapter.
 */

import * as vscode from 'vscode';
import { createServiceId, getLogger } from '../base';
import type { ChatMessage, ConfiguredToolGroup } from '@neko/shared';
import type {
  AgentRunnerConfirmationRequest,
  AgentPendingMessageItem,
  AgentRunnerPort,
  AgentRunnerPortEvent,
  AgentRuntimeSessionController,
  AgentRuntimeSessionControllerTarget,
  SubAgentRuntimeCoordinator,
} from '@neko/agent/runtime';
import type { AgentEvent, SubAgentEvent } from '@neko/agent';
import {
  getEngineClientProvider,
  type IEngineClientProvider,
} from '../services/engineClientProvider';
import { createLocalPerceptionAssetLoader } from '../services/perceptionAssetLoader';
import type { IAgentContext } from './agentContext';
import { type IAgentConfig, type ExecutionMode } from './agentRunnerContracts';
import { AgentRunnerRuntimeAdapter } from './agentRunnerRuntimeAdapter';
import { AgentRunnerVscodeEventBridge } from './agentRunnerVscodeEventBridge';
import { loadWorkspaceFileIgnoreRules } from '../services/workspaceIgnoreFilter';
import {
  getCapabilityRuntimeBindings,
  setCapabilityRuntimeContentAccessRuntime,
} from '../bootstrap/capabilityBootstrap';
import { createExtensionAgentContentAccessRuntime } from '../services/agentContentAccessRuntime';
import { createWorkspaceContentPathResolver } from '@neko/shared/vscode/extension';

const logger = getLogger('AgentRunner');

export const IAgentRunner = createServiceId<IAgentRunner>('agentRunner');

export type { ExecutionMode, AgentEvent, AgentEventType } from './agentRunnerContracts';
export type { IAgentConfig } from './agentRunnerContracts';

/**
 * VSCode-facing runner interface.
 *
 * The unified `onDidRunnerEvent` stream is the preferred internal extension
 * contract. Individual VSCode events are kept for compatibility consumers and
 * are emitted by AgentRunnerVscodeEventBridge.
 */
export interface IAgentRunner extends AgentRunnerPort<IAgentConfig, IAgentContext> {
  readonly onDidStart: vscode.Event<void>;
  readonly onDidStop: vscode.Event<void>;
  readonly onDidRequestConfirmation: vscode.Event<AgentRunnerConfirmationRequest>;
  readonly onDidSubAgentEvent: vscode.Event<SubAgentEvent>;
  readonly onDidRunnerEvent: vscode.Event<AgentRunnerPortEvent>;
}

export interface AgentRunnerDeps {
  engineClientProvider?: IEngineClientProvider;
  subAgentRuntime: SubAgentRuntimeCoordinator;
  extensionContext?: vscode.ExtensionContext;
  createRuntimeController?: (
    target: AgentRuntimeSessionControllerTarget,
  ) => AgentRuntimeSessionController;
}

export class AgentRunner implements IAgentRunner {
  private readonly port: AgentRunnerRuntimeAdapter;
  private readonly eventBridge: AgentRunnerVscodeEventBridge;

  constructor(deps: AgentRunnerDeps) {
    const engineClientProvider = deps.engineClientProvider ?? getEngineClientProvider();
    const agentContentAccess =
      getCapabilityRuntimeBindings().contentAccessRuntime ??
      (deps.extensionContext
        ? createExtensionAgentContentAccessRuntime({
            context: deps.extensionContext,
            engineClientProvider,
            pathResolver: createWorkspaceContentPathResolver({
              workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
            }),
          }).runtime
        : undefined);
    if (agentContentAccess && !getCapabilityRuntimeBindings().contentAccessRuntime) {
      setCapabilityRuntimeContentAccessRuntime(agentContentAccess);
    }
    this.port = new AgentRunnerRuntimeAdapter({
      engineClientProvider,
      subAgentRuntime: deps.subAgentRuntime,
      createRuntimeController: deps.createRuntimeController,
      perceptionAssetLoader: createLocalPerceptionAssetLoader(agentContentAccess),
      logger,
    });
    this.eventBridge = new AgentRunnerVscodeEventBridge(this.port.onDidRunnerEvent);
  }

  get onDidStart(): vscode.Event<void> {
    return this.eventBridge.onDidStart;
  }

  get onDidStop(): vscode.Event<void> {
    return this.eventBridge.onDidStop;
  }

  get onDidRequestConfirmation(): vscode.Event<AgentRunnerConfirmationRequest> {
    return this.eventBridge.onDidRequestConfirmation;
  }

  get onDidSubAgentEvent(): vscode.Event<SubAgentEvent> {
    return this.eventBridge.onDidSubAgentEvent;
  }

  get onDidRunnerEvent(): vscode.Event<AgentRunnerPortEvent> {
    return this.port.onDidRunnerEvent;
  }

  async configure(config: IAgentConfig): Promise<void> {
    return this.port.configure(await projectHostFileAccessPolicy(config));
  }

  getConfig(): IAgentConfig | undefined {
    return this.port.getConfig();
  }

  execute(input: string, context: IAgentContext): AsyncIterable<AgentEvent> {
    return this.port.execute(input, context);
  }

  cancel(): void {
    this.port.cancel();
  }

  isRunning(): boolean {
    return this.port.isRunning();
  }

  enqueuePendingMessage(input: {
    readonly conversationId: string;
    readonly content: string;
    readonly now?: number;
    readonly source?: AgentPendingMessageItem['source'];
  }): AgentPendingMessageItem | null {
    return this.port.enqueuePendingMessage(input);
  }

  getPendingMessageQueue(): readonly AgentPendingMessageItem[] {
    return this.port.getPendingMessageQueue();
  }

  removePendingMessage(queueItemId: string): AgentPendingMessageItem {
    return this.port.removePendingMessage(queueItemId);
  }

  updatePendingMessage(
    queueItemId: string,
    content: string,
    now?: number,
  ): AgentPendingMessageItem {
    return this.port.updatePendingMessage(queueItemId, content, now);
  }

  promotePendingMessage(queueItemId: string): AgentPendingMessageItem {
    return this.port.promotePendingMessage(queueItemId);
  }

  dequeuePendingMessage(): AgentPendingMessageItem | null {
    return this.port.dequeuePendingMessage();
  }

  drainPendingMessageQueue(): readonly AgentPendingMessageItem[] {
    return this.port.drainPendingMessageQueue();
  }

  getPendingMessagesCount(): number {
    return this.port.getPendingMessagesCount();
  }

  clearPendingMessages(): void {
    this.port.clearPendingMessages();
  }

  getContextTokenCount(): number {
    return this.port.getContextTokenCount();
  }

  compressContext(): Promise<{
    originalTokens: number;
    compressedTokens: number;
    ratio: number;
  }> {
    return this.port.compressContext();
  }

  confirmTool(toolCallId: string, approved: boolean): void {
    this.port.confirmTool(toolCallId, approved);
  }

  getPendingConfirmations(): AgentRunnerConfirmationRequest[] {
    return this.port.getPendingConfirmations();
  }

  getHistory(): ChatMessage[] {
    return this.port.getHistory();
  }

  clearHistory(): void {
    this.port.clearHistory();
  }

  addMessage(message: ChatMessage, sourceEventIds?: readonly string[]): void {
    this.port.addMessage(message, sourceEventIds);
  }

  recordTaskResultObservation(
    input: import('@neko/agent').RecordSessionTaskResultObservationInput,
  ): Promise<import('@neko/agent').RecordAgentTaskResultObservationResult> {
    return this.port.recordTaskResultObservation(input);
  }

  loadHistory(messages: ChatMessage[], messageEventIds?: readonly (readonly string[])[]): void {
    this.port.loadHistory(messages, messageEventIds);
  }

  getToolSkills(): ConfiguredToolGroup[] {
    return this.port.getToolSkills();
  }

  setSkillProvider(provider: import('@neko/agent').ISkillProvider): void {
    this.port.setSkillProvider(provider);
  }

  refreshCapabilityRuntime(): void {
    this.port.refreshCapabilityRuntime();
  }

  applySkillInjection(
    injection: import('@neko/agent').SkillInjection,
    skill?: import('@neko/agent').Skill,
  ): void {
    this.port.applySkillInjection(injection, skill);
  }

  applySkillLifecycleProjection(projection: import('@neko/shared').SkillLifecycleProjection): void {
    this.port.applySkillLifecycleProjection(projection);
  }

  activateToolSetsForTools(toolNames: readonly string[]): readonly string[] {
    return this.port.activateToolSetsForTools(toolNames);
  }

  deactivateToolSet(toolSetName: string): void {
    this.port.deactivateToolSet(toolSetName);
  }

  getActiveSkill(): import('@neko/shared').Skill | undefined {
    return this.port.getActiveSkill();
  }

  clearActiveSkill(): void {
    this.port.clearActiveSkill();
  }

  isToolAllowed(toolName: string): boolean {
    return this.port.isToolAllowed(toolName);
  }

  dispose(): void {
    this.eventBridge.dispose();
    this.port.dispose();
  }
}

async function projectHostFileAccessPolicy(config: IAgentConfig): Promise<IAgentConfig> {
  const authorizedReadRoots = dedupePaths(config.authorizedReadRoots ?? []);
  const workspaceIgnoreRules =
    config.workspaceIgnoreRules ??
    (config.workspaceRoot ? await loadWorkspaceFileIgnoreRules(config.workspaceRoot) : undefined);

  if (authorizedReadRoots.length === 0 && workspaceIgnoreRules === config.workspaceIgnoreRules) {
    return config;
  }

  return {
    ...config,
    ...(authorizedReadRoots.length > 0 ? { authorizedReadRoots } : {}),
    ...(workspaceIgnoreRules ? { workspaceIgnoreRules } : {}),
  };
}

function dedupePaths(paths: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of paths) {
    if (seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
}
