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
import { createServiceId, getLogger } from '../base';

const logger = getLogger('AgentManager');
import type { Platform } from '@neko/platform';
import type { ChatMessage } from '@neko/shared';
import { AgentRunner, IAgentRunner, IAgentConfig } from './agentRunner';

// =============================================================================
// Service Identifier
// =============================================================================

export const IAgentManager = createServiceId<IAgentManager>('agentManager');

// =============================================================================
// Interface
// =============================================================================

/**
 * Agent Manager 接口
 */
export interface IAgentManager extends vscode.Disposable {
  /**
   * 设置 Platform 实例（共享）
   */
  setPlatform(platform: Platform): void;

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
   * 确认工具执行
   */
  confirmTool(conversationId: string, toolCallId: string, approved: boolean): void;

  /**
   * 加载会话历史到指定 Agent
   */
  loadHistory(conversationId: string, messages: ChatMessage[]): void;

  /**
   * 加载完整会话历史（包含工具调用上下文）
   */
  loadHistoryWithContext(
    conversationId: string,
    messages: Array<{
      role: 'user' | 'assistant' | 'system';
      content: string;
      toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
      toolResults?: Array<{ callId: string; success: boolean; data: unknown }>;
    }>,
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
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Agent Manager 实现
 */
export class AgentManager implements IAgentManager {
  /** 会话 ID -> AgentRunner 映射 */
  private _agents = new Map<string, AgentRunner>();

  /** 最近访问顺序（用于 LRU） */
  private _accessOrder: string[] = [];

  /** 最大 Agent 实例数量 */
  private _maxAgents = 10;
  private readonly _defaultMaxAgents = 10;

  /** Platform 实例（共享） */
  private _platform?: Platform;

  /** 事件订阅 */
  private _agentDisposables = new Map<string, vscode.Disposable[]>();

  /** 等待队列：当所有 Agent 都在运行时，新请求排队等待 */
  private _waitingQueue: Array<{
    conversationId: string;
    resolve: (agent: IAgentRunner) => void;
    reject: (error: Error) => void;
  }> = [];

  /** 事件发射器 */
  private readonly _onDidAgentStart = new vscode.EventEmitter<{ conversationId: string }>();
  private readonly _onDidAgentStop = new vscode.EventEmitter<{ conversationId: string }>();

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  get onDidAgentStart(): vscode.Event<{ conversationId: string }> {
    return this._onDidAgentStart.event;
  }

  get onDidAgentStop(): vscode.Event<{ conversationId: string }> {
    return this._onDidAgentStop.event;
  }

  // -------------------------------------------------------------------------
  // Platform
  // -------------------------------------------------------------------------

  setPlatform(platform: Platform): void {
    this._platform = platform;
  }

  // -------------------------------------------------------------------------
  // Agent Management
  // -------------------------------------------------------------------------

  getOrCreate(conversationId: string): IAgentRunner {
    // 更新访问顺序
    this._updateAccessOrder(conversationId);

    let agent = this._agents.get(conversationId);
    if (!agent) {
      // 如果超过限制，移除最久未使用的非运行中 Agent
      this._evictIfNeeded();

      // 创建新 Agent
      agent = new AgentRunner();
      this._agents.set(conversationId, agent);

      // 监听 Agent 事件
      const disposables: vscode.Disposable[] = [];
      disposables.push(
        agent.onDidStart(() => {
          this._onDidAgentStart.fire({ conversationId });
        }),
        agent.onDidStop(() => {
          this._onDidAgentStop.fire({ conversationId });
          // 当 Agent 停止时，尝试处理等待队列中的请求
          this._processWaitingQueue();
        }),
      );
      this._agentDisposables.set(conversationId, disposables);
    }

    return agent;
  }

  get(conversationId: string): IAgentRunner | undefined {
    const agent = this._agents.get(conversationId);
    if (agent) {
      this._updateAccessOrder(conversationId);
    }
    return agent;
  }

  isRunning(conversationId: string): boolean {
    const agent = this._agents.get(conversationId);
    return agent?.isRunning() ?? false;
  }

  hasRunningAgents(): boolean {
    for (const agent of this._agents.values()) {
      if (agent.isRunning()) return true;
    }
    return false;
  }

  getRunningConversations(): string[] {
    const running: string[] = [];
    for (const [id, agent] of this._agents) {
      if (agent.isRunning()) {
        running.push(id);
      }
    }
    return running;
  }

  getAllConversations(): string[] {
    return Array.from(this._agents.keys());
  }

  remove(conversationId: string): void {
    const agent = this._agents.get(conversationId);
    if (agent) {
      // 取消执行
      agent.cancel();

      // 清理事件订阅
      const disposables = this._agentDisposables.get(conversationId);
      if (disposables) {
        for (const d of disposables) {
          d.dispose();
        }
        this._agentDisposables.delete(conversationId);
      }

      // 释放 Agent
      agent.dispose();
      this._agents.delete(conversationId);

      // 从访问顺序中移除
      const index = this._accessOrder.indexOf(conversationId);
      if (index !== -1) {
        this._accessOrder.splice(index, 1);
      }

      // 清理会话级别的熔断器状态
      if (this._platform) {
        this._platform.providers.cleanupSession(conversationId);
      }
    }
  }

  cancel(conversationId: string): void {
    const agent = this._agents.get(conversationId);
    agent?.cancel();
  }

  cancelAll(): void {
    for (const agent of this._agents.values()) {
      agent.cancel();
    }
  }

  // -------------------------------------------------------------------------
  // Tool Confirmation
  // -------------------------------------------------------------------------

  confirmTool(conversationId: string, toolCallId: string, approved: boolean): void {
    const agent = this._agents.get(conversationId);
    agent?.confirmTool(toolCallId, approved);
  }

  // -------------------------------------------------------------------------
  // History Management
  // -------------------------------------------------------------------------

  loadHistory(conversationId: string, messages: ChatMessage[]): void {
    const agent = this.getOrCreate(conversationId);
    agent.clearHistory();
    for (const msg of messages) {
      agent.addMessage(msg);
    }
  }

  loadHistoryWithContext(
    conversationId: string,
    messages: Array<{
      role: 'user' | 'assistant' | 'system';
      content: string;
      toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
      toolResults?: Array<{ callId: string; success: boolean; data: unknown }>;
    }>,
  ): void {
    const agent = this.getOrCreate(conversationId);
    agent.clearHistory();

    for (const msg of messages) {
      // Add basic message
      agent.addMessage({
        role: msg.role,
        content: msg.content,
      });

      // For assistant messages with tool calls, we need to add tool results as separate messages
      // This ensures the agent has the full context for proper resume
      if (msg.role === 'assistant' && msg.toolResults && msg.toolResults.length > 0) {
        for (const result of msg.toolResults) {
          // Add tool result as a separate message for context
          // This format is compatible with Claude's tool_result content block
          agent.addMessage({
            role: 'user', // Tool results are typically sent as user messages
            content: `[Tool Result for ${result.callId}]: ${result.success ? 'Success' : 'Failed'}\n${JSON.stringify(result.data, null, 2)}`,
          });
        }
      }
    }

    logger.info(`Loaded ${messages.length} messages with context for: ${conversationId}`);
  }

  clearHistory(conversationId: string): void {
    const agent = this._agents.get(conversationId);
    agent?.clearHistory();
  }

  clearPendingMessages(conversationId: string): void {
    const agent = this._agents.get(conversationId);
    agent?.clearPendingMessages();
  }

  getContextTokenCount(conversationId: string): number {
    const agent = this._agents.get(conversationId);
    return agent?.getContextTokenCount() ?? 0;
  }

  async compressContext(conversationId: string): Promise<{
    originalTokens: number;
    compressedTokens: number;
    ratio: number;
  }> {
    const agent = this._agents.get(conversationId);
    if (!agent) {
      return { originalTokens: 0, compressedTokens: 0, ratio: 1 };
    }
    return agent.compressContext();
  }

  // -------------------------------------------------------------------------
  // LRU Cache Management
  // -------------------------------------------------------------------------

  private _updateAccessOrder(conversationId: string): void {
    const index = this._accessOrder.indexOf(conversationId);
    if (index !== -1) {
      this._accessOrder.splice(index, 1);
    }
    this._accessOrder.push(conversationId);
  }

  private _evictIfNeeded(): void {
    while (this._agents.size >= this._maxAgents) {
      // 找到最久未使用且未运行的 Agent
      let evictId: string | null = null;
      for (const id of this._accessOrder) {
        const agent = this._agents.get(id);
        if (agent && !agent.isRunning()) {
          evictId = id;
          break;
        }
      }

      if (evictId) {
        logger.info(`Evicting agent (LRU): ${evictId}`);
        this.remove(evictId);
      } else {
        // 所有 Agent 都在运行，无法驱逐
        // 增加最大 Agent 数量临时容纳新请求，但设置上限防止无限增长
        const absoluteMax = 20;
        if (this._maxAgents < absoluteMax) {
          this._maxAgents++;
          logger.warn(`All agents running, temporarily increased maxAgents to ${this._maxAgents}`);
        } else {
          logger.error(`Cannot evict: reached absolute max (${absoluteMax}) agents, all running`);
        }
        break;
      }
    }
  }

  /**
   * 处理等待队列：当 Agent 停止时尝试处理等待的请求
   */
  private _processWaitingQueue(): void {
    // Shrink _maxAgents back toward default when pressure is relieved
    if (this._maxAgents > this._defaultMaxAgents && this._agents.size <= this._defaultMaxAgents) {
      this._maxAgents = this._defaultMaxAgents;
    }

    if (this._waitingQueue.length === 0) return;

    // 检查是否有可用容量
    const availableSlots = this._maxAgents - this._agents.size;
    const nonRunningAgents = Array.from(this._agents.values()).filter((a) => !a.isRunning()).length;

    if (availableSlots > 0 || nonRunningAgents > 0) {
      const waiting = this._waitingQueue.shift();
      if (waiting) {
        try {
          const agent = this.getOrCreate(waiting.conversationId);
          waiting.resolve(agent);
          logger.info(`Processed waiting request for: ${waiting.conversationId}`);
        } catch (error) {
          waiting.reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  dispose(): void {
    // 取消所有执行
    this.cancelAll();

    // 拒绝所有等待中的请求
    for (const waiting of this._waitingQueue) {
      waiting.reject(new Error('AgentManager disposed'));
    }
    this._waitingQueue = [];

    // 清理所有事件订阅
    for (const disposables of this._agentDisposables.values()) {
      for (const d of disposables) {
        d.dispose();
      }
    }
    this._agentDisposables.clear();

    // 释放所有 Agent
    for (const agent of this._agents.values()) {
      agent.dispose();
    }
    this._agents.clear();
    this._accessOrder = [];

    // 释放事件发射器
    this._onDidAgentStart.dispose();
    this._onDidAgentStop.dispose();
  }
}
