// Re-export MessageAttachment from shared (Single Source of Truth)
export type { MessageAttachment, AttachmentType } from '@neko/shared';

// Import for local use
import type { MessageAttachment } from '@neko/shared';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
  isStreaming?: boolean;
  attachments?: MessageAttachment[];
  // 关联的后台任务 ID (用于显示内联任务卡片)
  backgroundTaskIds?: string[];
  // P1: AI thinking process (legacy, for backward compatibility)
  thinking?: string;
  isThinkingComplete?: boolean;
  // P2: Message operations
  feedback?: 'positive' | 'negative';
  editedAt?: number;
  originalContent?: string;
  // P2: Message cancelled by user (ESC key)
  isCancelled?: boolean;
  // Message was queued while agent is running
  isQueued?: boolean;
  // Sequential content blocks for chronological rendering (assistant messages only)
  // When present, render these instead of the legacy fields
  contentBlocks?: ContentBlock[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: {
    success: boolean;
    data: unknown;
    error?: string;
    duration?: number; // Execution time in milliseconds
  };
  // For tool confirmation (ask mode)
  pendingConfirmation?: boolean;
  confirmation?: {
    action: string;
    description: string;
    details: Record<string, unknown>;
  };
}

/**
 * Content block types for sequential rendering of AI responses
 * This allows thinking, tool calls, text, and code diffs to be rendered in chronological order
 */
export type ContentBlockType = 'thinking' | 'text' | 'tool_call' | 'code_diff' | 'plan';

/**
 * Code diff information for file edits
 */
export interface CodeDiff {
  filePath: string;
  oldContent: string;
  newContent: string;
  language?: string;
  // Diff status
  status: 'pending' | 'accepted' | 'rejected';
}

/**
 * Plan step for review mode
 */
export interface PlanStep {
  id: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected' | 'modified';
  // For modified steps, store the original description
  originalDescription?: string;
}

/**
 * Plan for AI execution review
 */
export interface Plan {
  id: string;
  title?: string;
  steps: PlanStep[];
  // Overall plan status
  status: 'pending' | 'approved' | 'rejected' | 'partial';
}

export interface ContentBlock {
  id: string;
  type: ContentBlockType;
  timestamp: number;
  // For thinking blocks
  thinking?: string;
  isThinkingComplete?: boolean;
  // For text blocks
  content?: string;
  isStreaming?: boolean;
  // For tool_call blocks
  toolCall?: ToolCall;
  // For code_diff blocks
  codeDiff?: CodeDiff;
  // For plan blocks
  plan?: Plan;
}

export interface ConversationSummary {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: number;
}

// 打开的标签页
export interface OpenTab {
  id: string;
  title: string;
  conversationId: string;
}

export type TabType = 'chat' | 'settings' | 'tasks' | 'agents';

export type SettingsSubTab = 'provider' | 'mcp' | 'workflow' | 'models' | 'skills';

// Shell execution mode for tool confirmation
export type ShellExecutionMode = 'plan' | 'ask' | 'auto';

// Prompt mode for system prompt selection
export type PromptMode = 'default' | 'plan';

/**
 * Agent execution phase for status indicator
 * - idle: Agent is not running
 * - thinking: Agent is processing/thinking (Claude extended thinking)
 * - acting: Agent is executing a tool
 * - streaming: Agent is streaming text response
 */
export type AgentPhase = 'idle' | 'thinking' | 'acting' | 'streaming';

/**
 * Agent state for UI display
 */
export interface AgentState {
  phase: AgentPhase;
  /** Current tool being executed (when phase is 'acting') */
  toolName?: string;
  /** Timestamp when phase started */
  startedAt: number;
}

// Re-export shared config types for convenience
export type {
  MCPServerConfig as ConfiguredMCPServer,
  WorkflowConfig as ConfiguredWorkflow,
  PromptPresetConfig as ConfiguredPrompt,
  PromptPresetType,
  ChatModelOption,
} from '@neko/shared';

// Settings state interface
export interface SettingsState {
  providers: Array<{
    id: string;
    name: string;
    isConfigured: boolean;
    models: Array<{
      id: string;
      name: string;
      description: string;
    }>;
  }>;
  // 已配置的 Provider 列表 (从 Platform ConfigManager 获取)
  configuredProviders: Array<ConfiguredProvider>;
  // Provider 模板列表 (用于添加 Provider 的下拉框)
  providerTemplates: Array<ProviderTemplateInfo>;
  // 已配置的 Model 列表 (从 Platform ConfigManager 获取)
  configuredModels: Array<import('@neko/shared').ModelConfig>;
  // 已配置的 Prompt 列表 (alias: configuredAgents for backward compatibility)
  configuredPrompts: Array<import('@neko/shared').PromptPresetConfig>;
  /** @deprecated Use configuredPrompts instead */
  configuredAgents: Array<import('@neko/shared').PromptPresetConfig>;
  // 当前选中的 Prompt ID (alias: selectedAgentId for backward compatibility)
  selectedPromptId: string | null;
  /** @deprecated Use selectedPromptId instead */
  selectedAgentId: string | null;
  // 已配置的 MCP 服务器列表
  configuredMCPServers: Array<import('@neko/shared').MCPServerConfig>;
  // 已配置的工作流列表
  configuredWorkflows: Array<import('@neko/shared').WorkflowConfig>;
  // 已配置的 Skills 列表
  configuredSkills: Array<import('@neko/shared').ConfiguredSkill>;
  // 已配置的 Slash Commands 列表
  configuredCommands: Array<import('@neko/shared').ConfiguredSlashCommand>;
  // 已配置的 Hooks 列表
  configuredHooks: Array<import('@neko/shared').ConfiguredHook>;
  // 已配置的 ToolSkills 列表 (动态工具注入)
  configuredToolSkills: Array<import('@neko/shared').ConfiguredToolSkill>;
  selectedProviderId: string | null;
  selectedModelId: string | null;
  systemPrompt: string;
  autoExecuteTools: boolean;
  streamResponses: boolean;
  showToolCalls: boolean;
  temperature: number;
  maxTokens: number;
  // Shell execution mode: plan (dry-run), ask (confirm), auto (whitelist only)
  executionMode: ShellExecutionMode;
  // Prompt mode: default or plan (research/planning mode)
  promptMode: PromptMode;
  // Chat model options for UI model selector (from Platform ConfigManager)
  chatModelOptions: Array<import('@neko/shared').ChatModelOption>;
}

export interface ConfiguredProvider {
  id: string; // Unique identifier
  type: string; // Provider type (e.g., 'openai', 'anthropic')
  name: string;
  apiKey?: string;
  baseUrl?: string;
  enabled?: boolean;
  builtin?: boolean;
  /** Additional auth fields (e.g., secretKey, accessKey) */
  authOptions?: Record<string, string>;
}

/**
 * Provider template info for dropdown selection
 * Templates are predefined provider configurations that users can add
 */
export interface ProviderTemplateInfo {
  id: string;
  name: string;
  displayName: string;
  type: string;
  apiUrl: string;
}

// Re-export VSCodeAPI from shared (Single Source of Truth)
export type { VSCodeAPI } from '@neko/shared';

/**
 * Model option for UI model selector
 * @deprecated Use ChatModelOption from @neko/shared instead
 */
export type ModelOption = import('@neko/shared').ChatModelOption;

// Legacy type aliases for backward compatibility during migration
// TODO: Remove these after migration is complete
/** @deprecated Use ConfiguredPrompt from shared package */
export type ConfiguredAgent = import('@neko/shared').PromptPresetConfig;
/** @deprecated Use PromptPresetType from shared package */
export type AgentType = import('@neko/shared').PromptPresetType;
