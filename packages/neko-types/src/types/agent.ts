/**
 * Agent Runtime Interface - Abstraction for agent capabilities
 *
 * This interface defines the contract for agent runtime.
 * Agent can run standalone (without platform) or integrated with platform.
 */

import type { IMCPManager } from './mcp';
import type { MCPServerConfig } from './config';
import type { IToolRegistry, ToolResult } from './tool';
import type { ISkillService } from './skill';
import type {
  IPlatform,
  IService,
  ChatMessage,
  LLMProviderConfig,
  ToolDefinition,
  ServiceOptions,
} from './platform';

/**
 * Agent state in ReAct loop
 */
export type AgentState = 'init' | 'think' | 'act' | 'observe' | 'respond' | 'error' | 'done';

/**
 * Agent configuration
 */
export interface AgentConfig {
  /** Agent name */
  name: string;
  /** System prompt */
  systemPrompt: string;
  /** Available tools (as definitions) */
  tools: ToolDefinition[];
  /** Maximum iterations before stopping */
  maxIterations: number;
  /** Primary model for main reasoning */
  primaryModel?: string;
  /** Purpose-specific models */
  purposeModels?: Record<string, string>;
  /** Service options for LLM calls */
  serviceOptions?: ServiceOptions;
}

/**
 * Agent execution context
 */
export interface AgentContext {
  /** Conversation history */
  messages: ChatMessage[];
  /** Current state */
  state: AgentState;
  /** Current iteration */
  iteration: number;
  /** Tool results from current iteration */
  toolResults: ToolResult[];
  /** Accumulated metadata */
  metadata: Record<string, unknown>;
  /**
   * When true, executor should skip adding user message to context.messages
   * because the caller (e.g. AgentSession) already included it in the snapshot.
   */
  skipUserMessage?: boolean;
}

/**
 * Agent execution step
 */
export interface AgentStep {
  /** Step type ('content_delta' for streaming text chunks) */
  type: 'think' | 'act' | 'observe' | 'respond' | 'content_delta';
  /** Step content */
  content: string;
  /** Extended thinking content (Claude only) */
  thinking?: string;
  /** Tool calls if any */
  toolCalls?: Array<{
    /** Tool call ID from API (required for tool result matching) */
    id?: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
  /** Tool results if any */
  toolResults?: ToolResult[];
  /** Tool progress events collected during act phase */
  toolProgress?: Array<{
    toolCallId: string;
    toolName: string;
    percent: number;
    stage: string;
    preview?: string;
  }>;
  /** Timestamp */
  timestamp: number;
  /** Token usage for this step (from LLM API response) */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Agent execution result
 */
export interface AgentResult {
  /** Whether execution succeeded */
  success: boolean;
  /** Final response */
  response: string;
  /** Execution steps */
  steps: AgentStep[];
  /** Total iterations */
  iterations: number;
  /** Error if failed */
  error?: Error;
  /** Execution timing */
  timing: {
    startTime: number;
    endTime: number;
    duration: number;
  };
  /** Accumulated token usage across all steps */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Agent checkpoint for resume
 */
export interface AgentCheckpoint {
  /** Checkpoint ID */
  id: string;
  /** Agent name */
  agentName: string;
  /** Context at checkpoint */
  context: AgentContext;
  /** Timestamp */
  timestamp: number;
}

/**
 * Tool call info for hooks
 */
export interface ToolCallInfo {
  /** Tool call ID */
  id: string;
  /** Tool name */
  name: string;
  /** Tool arguments */
  arguments: Record<string, unknown>;
  /** Index in batch */
  index: number;
}

/**
 * Tool result with metadata
 */
export interface ToolResultWithMeta extends ToolResult {
  /** Tool call ID */
  callId: string;
  /** Tool name */
  name: string;
  /** Retry count (if retried) */
  retryCount?: number;
}

/**
 * Think context for hooks
 */
export interface ThinkContext {
  messages: ChatMessage[];
  iteration: number;
}

/**
 * Agent executor hooks
 */
export interface ExecutorHooks {
  /** Hook name for identification */
  name?: string;

  // Lifecycle hooks
  /** Called when execution starts */
  onExecuteStart?(input: string, context: AgentContext): Promise<void>;
  /** Called when execution ends (success or error) */
  onExecuteEnd?(result: AgentResult): Promise<void>;
  /** Called on each iteration completion */
  onIterationComplete?(iteration: number, context: AgentContext): Promise<void>;
  /** Called on error */
  onError?(error: Error, context: AgentContext): Promise<void>;

  // Think hooks
  /** Called before think step, can modify context */
  beforeThink?(context: AgentContext): Promise<AgentContext | void>;
  /** Called after think step */
  afterThink?(step: AgentStep, context: AgentContext): Promise<void>;

  // Act hooks
  /** Called before act step */
  beforeAct?(toolCalls: ToolCallInfo[]): Promise<void>;
  /** Called after act step */
  afterAct?(results: ToolResultWithMeta[]): Promise<void>;
  /** Called for each tool call - can intercept and handle */
  onToolCall?(
    info: ToolCallInfo,
    execute: () => Promise<ToolResult>,
  ): Promise<ToolResultWithMeta | null>;
}

/**
 * Agent executor interface
 */
export interface IAgentExecutor {
  /**
   * Execute agent with user input
   */
  execute(input: string, context?: Partial<AgentContext>): Promise<AgentResult>;

  /**
   * Execute with streaming - yields steps as they complete
   */
  executeStream(input: string, context?: Partial<AgentContext>): AsyncIterable<AgentStep>;

  /**
   * Abort current execution
   */
  abort(): void;

  /**
   * Get current state
   */
  getState(): AgentState;
}

// Note: Skill types (Skill, SlashCommand, SkillMatch, etc.) are now in ./skill.ts
// They follow Claude-compatible skill definitions with support for both:
// - Skills: Semantic discovery with description matching
// - Slash Commands: Explicit /command triggers with argument interpolation

/**
 * SubAgent configuration
 */
export interface SubAgentConfig extends AgentConfig {
  /** Parent agent context */
  parentContext?: AgentContext;
  /** Inherited tools from parent */
  inheritTools?: boolean;
  /** Context isolation level */
  isolation?: 'full' | 'shared' | 'inherit';
}

/**
 * SubAgent manager interface
 */
export interface ISubAgentManager {
  /**
   * Spawn a sub-agent
   */
  spawn(config: SubAgentConfig): IAgentExecutor;

  /**
   * Get active sub-agents
   */
  list(): IAgentExecutor[];

  /**
   * Terminate a sub-agent
   */
  terminate(agentId: string): void;

  /**
   * Terminate all sub-agents
   */
  terminateAll(): void;
}

/**
 * Agent runtime configuration
 */
export interface AgentRuntimeConfig {
  /**
   * Platform instance (optional - for integrated mode)
   * When provided, agent uses platform's LLM routing and media services
   */
  platform?: IPlatform;

  /**
   * LLM provider config (for standalone mode)
   * Required when platform is not provided
   */
  llmProvider?: LLMProviderConfig;

  /**
   * Skills directory path
   */
  skillsPath?: string;

  /**
   * MCP server configurations
   */
  mcpServers?: MCPServerConfig[];

  /**
   * Default agent configuration
   */
  defaultAgentConfig?: Partial<AgentConfig>;
}

/**
 * Agent runtime interface - main entry point for agent package
 *
 * Can run in two modes:
 * 1. Standalone: Uses built-in LLM client, no platform dependency
 * 2. Integrated: Uses platform's services for LLM, media, workflows
 */
export interface IAgentRuntime {
  /**
   * MCP manager (always available)
   */
  readonly mcp: IMCPManager;

  /**
   * Skill service (always available)
   */
  readonly skills: ISkillService;

  /**
   * Tool registry (always available)
   */
  readonly tools: IToolRegistry;

  /**
   * SubAgent manager (always available)
   */
  readonly subAgents: ISubAgentManager;

  /**
   * Platform instance (optional - only in integrated mode)
   */
  readonly platform?: IPlatform;

  /**
   * Check if running in standalone mode
   */
  readonly isStandalone: boolean;

  /**
   * Create an agent executor
   */
  createAgent(config: AgentConfig, hooks?: ExecutorHooks[]): IAgentExecutor;

  /**
   * Create a service for direct LLM access
   * In standalone mode, uses built-in client
   * In integrated mode, uses platform service
   */
  createService(): IService;

  /**
   * Dispose runtime resources
   */
  dispose(): Promise<void>;
}

/**
 * Factory function type for creating agent runtime
 */
export type CreateAgentRuntime = (config: AgentRuntimeConfig) => IAgentRuntime;
