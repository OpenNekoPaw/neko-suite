/**
 * Agent Manager - 管理多个会话的 Agent 实例
 *
 * 每个会话拥有独立的 AgentRunner 实例，支持：
 * - 多会话并发执行
 * - 会话级别的状态隔离
 * - 独立的工具确认队列
 * - LRU 缓存策略控制内存
 */

import * as vscode from 'vscode';
import { getLogger } from '../base';

const logger = getLogger('AgentManager');
import type { ChatMessage } from '@neko/shared';
import { createAgentRuntimeManager, type AgentRuntimeManager } from '@neko/agent/runtime';
import { type AgentHistoryWithToolContextMessage, type SkillInjection } from '@neko/agent';
import { AgentRunner, IAgentRunner } from './agentRunner';

/**
 * Agent Manager 接口
 */
export interface IAgentManager extends vscode.Disposable {
  /**
   * 获取或创建指定会话的 Agent
   */
  getOrCreate(conversationId: string): IAgentRunner;

  /**
   * 获取指定会话的 Agent（不创建）
   */
  get(conversationId: string): IAgentRunner | undefined;

  /**
   * 检查指定会话是否有 Agent 在运行
   */
  isRunning(conversationId: string): boolean;

  /**
   * 检查是否有任何 Agent 在运行
   */
  hasRunningAgents(): boolean;

  /**
   * 获取所有运行中的会话 ID
   */
  getRunningConversations(): string[];

  /**
   * 获取所有会话 ID
   */
  getAllConversations(): string[];

  /**
   * 移除指定会话的 Agent
   */
  remove(conversationId: string): void;

  /**
   * 取消指定会话的执行
   */
  cancel(conversationId: string): void;

  /**
   * 取消所有执行
   */
  cancelAll(): void;

  /**
   * Agent 会话中断事件。只暴露 conversation id 和原因，由 bridge 层决定如何协调任务。
   */
  readonly onDidConversationInterrupted: vscode.Event<AgentConversationInterruptedEvent>;

  /**
   * 确认工具执行
   */
  confirmTool(conversationId: string, toolCallId: string, approved: boolean): void;

  /**
   * 加载会话历史到指定 Agent
   */
  loadHistory(
    conversationId: string,
    messages: ChatMessage[],
    messageEventIds?: readonly (readonly string[])[],
  ): void;

  /**
   * 加载完整会话历史（包含工具调用上下文）
   */
  loadHistoryWithContext(
    conversationId: string,
    messages: readonly AgentHistoryWithToolContextMessage[],
  ): void;

  /**
   * 清空指定会话的历史
   */
  clearHistory(conversationId: string): void;

  /**
   * 清空指定会话的待处理消息队列
   */
  clearPendingMessages(conversationId: string): void;

  /**
   * 获取指定会话的上下文 token 数量
   */
  getContextTokenCount(conversationId: string): number;

  /**
   * 手动触发指定会话的上下文压缩
   */
  compressContext(conversationId: string): Promise<{
    originalTokens: number;
    compressedTokens: number;
    ratio: number;
  }>;

  /**
   * Agent 开始执行事件
   */
  readonly onDidAgentStart: vscode.Event<{ conversationId: string }>;

  /**
   * Agent 停止执行事件
   */
  readonly onDidAgentStop: vscode.Event<{ conversationId: string }>;

  /**
   * Apply a skill injection to the specified conversation's agent session.
   * Updates the session system prompt and permission rules.
   */
  applySkillInjection(
    conversationId: string,
    injection: SkillInjection,
    skill?: import('@neko/shared').Skill,
  ): void;

  /**
   * Get the currently active skill for the specified conversation.
   * Delegates to AgentRunner → AgentSession → SkillInjectionCoordinator.
   */
  getActiveSkill(conversationId: string): import('@neko/shared').Skill | undefined;

  /**
   * Clear the active skill for the specified conversation.
   * Reverses all injection tracks via SkillInjectionCoordinator.
   */
  clearActiveSkill(conversationId: string): void;

  /**
   * Set the per-conversation skill provider factory for meta tools.
   * Applied to all existing and future AgentRunners.
   */
  setSkillProviderFactory(factory: import('@neko/agent').SkillProviderFactory): void;

  /**
   * Re-sync capability-derived runtime overlays into all existing sessions.
   * Shared registries update by reference; prompt fragments need an explicit push.
   */
  refreshCapabilityRuntime(): void;
}

export type AgentConversationInterruptionReason = 'user-stop' | 'remove' | 'cancel-all';

export interface AgentConversationInterruptedEvent {
  readonly conversationId: string;
  readonly reason: AgentConversationInterruptionReason;
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Agent Manager 实现
 */
export class AgentManager implements IAgentManager {
  /** 事件发射器 */
  private readonly _onDidAgentStart = new vscode.EventEmitter<{ conversationId: string }>();
  private readonly _onDidAgentStop = new vscode.EventEmitter<{ conversationId: string }>();
  private readonly _onDidConversationInterrupted =
    new vscode.EventEmitter<AgentConversationInterruptedEvent>();
  private readonly _runtime: AgentRuntimeManager<AgentRunner>;

  constructor() {
    this._runtime = createAgentRuntimeManager<AgentRunner>({
      createAgent: ({ subAgentRuntime }) => new AgentRunner({ subAgentRuntime }),
      onAgentStart: (event) => this._onDidAgentStart.fire(event),
      onAgentStop: (event) => this._onDidAgentStop.fire(event),
      logger,
    });
  }

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  get onDidAgentStart(): vscode.Event<{ conversationId: string }> {
    return this._onDidAgentStart.event;
  }

  get onDidAgentStop(): vscode.Event<{ conversationId: string }> {
    return this._onDidAgentStop.event;
  }

  get onDidConversationInterrupted(): vscode.Event<AgentConversationInterruptedEvent> {
    return this._onDidConversationInterrupted.event;
  }

  // -------------------------------------------------------------------------
  // Agent Management
  // -------------------------------------------------------------------------

  getOrCreate(conversationId: string): IAgentRunner {
    return this._runtime.getOrCreate(conversationId);
  }

  get(conversationId: string): IAgentRunner | undefined {
    return this._runtime.get(conversationId);
  }

  isRunning(conversationId: string): boolean {
    return this._runtime.isRunning(conversationId);
  }

  hasRunningAgents(): boolean {
    return this._runtime.hasRunningAgents();
  }

  getRunningConversations(): string[] {
    return this._runtime.getRunningConversations();
  }

  getAllConversations(): string[] {
    return this._runtime.getAllConversations();
  }

  remove(conversationId: string): void {
    this._runtime.remove(conversationId);
    this._onDidConversationInterrupted.fire({ conversationId, reason: 'remove' });
  }

  cancel(conversationId: string): void {
    this._runtime.cancel(conversationId);
    this._onDidConversationInterrupted.fire({ conversationId, reason: 'user-stop' });
  }

  cancelAll(): void {
    const conversationIds = this._runtime.getRunningConversations();
    this._runtime.cancelAll();
    for (const conversationId of conversationIds) {
      this._onDidConversationInterrupted.fire({ conversationId, reason: 'cancel-all' });
    }
  }

  // -------------------------------------------------------------------------
  // Tool Confirmation
  // -------------------------------------------------------------------------

  confirmTool(conversationId: string, toolCallId: string, approved: boolean): void {
    this._runtime.confirmTool(conversationId, toolCallId, approved);
  }

  // -------------------------------------------------------------------------
  // History Management
  // -------------------------------------------------------------------------

  loadHistory(
    conversationId: string,
    messages: ChatMessage[],
    messageEventIds?: readonly (readonly string[])[],
  ): void {
    this._runtime.loadHistory(conversationId, messages, messageEventIds);
  }

  loadHistoryWithContext(
    conversationId: string,
    messages: readonly AgentHistoryWithToolContextMessage[],
  ): void {
    this._runtime.loadHistoryWithContext(conversationId, messages);
  }

  clearHistory(conversationId: string): void {
    this._runtime.clearHistory(conversationId);
  }

  clearPendingMessages(conversationId: string): void {
    this._runtime.clearPendingMessages(conversationId);
  }

  getContextTokenCount(conversationId: string): number {
    return this._runtime.getContextTokenCount(conversationId);
  }

  async compressContext(conversationId: string): Promise<{
    originalTokens: number;
    compressedTokens: number;
    ratio: number;
  }> {
    return this._runtime.compressContext(conversationId);
  }

  applySkillInjection(
    conversationId: string,
    injection: SkillInjection,
    skill?: import('@neko/shared').Skill,
  ): void {
    this._runtime.applySkillInjection(conversationId, injection, skill);
  }

  getActiveSkill(conversationId: string): import('@neko/shared').Skill | undefined {
    return this._runtime.getActiveSkill(conversationId);
  }

  clearActiveSkill(conversationId: string): void {
    this._runtime.clearActiveSkill(conversationId);
  }

  setSkillProviderFactory(factory: import('@neko/agent').SkillProviderFactory): void {
    this._runtime.setSkillProviderFactory(factory);
  }

  refreshCapabilityRuntime(): void {
    this._runtime.refreshCapabilityRuntime();
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  dispose(): void {
    this._runtime.dispose();

    // 释放事件发射器
    this._onDidAgentStart.dispose();
    this._onDidAgentStop.dispose();
    this._onDidConversationInterrupted.dispose();
  }
}
