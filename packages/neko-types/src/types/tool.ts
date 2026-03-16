/**
 * Tool Types - Tool definition and execution (shared)
 */

/**
 * Tool category
 */
export type ToolCategory =
  | 'timeline'
  | 'media'
  | 'project'
  | 'file'
  | 'mcp'
  | 'workflow'
  | 'system'
  | 'generation'
  | 'analysis'
  | 'document';

/**
 * Tool filter options for toToolDefinitions()
 */
export interface ToolFilterOptions {
  /** Include only these tool names */
  include?: string[];

  /** Exclude these tool names */
  exclude?: string[];

  /** Include only tools from these categories */
  categories?: ToolCategory[];
}

/**
 * Tool execution result
 */
export interface ToolResult {
  /** Whether execution succeeded */
  success: boolean;
  /** Result data */
  data?: unknown;
  /** Error message if failed */
  error?: string;
  /** Execution time in ms */
  duration?: number;
}

/**
 * Tool definition
 */
export interface Tool {
  /** Tool name (unique identifier) */
  name: string;
  /** Tool description for LLM */
  description: string;
  /** Parameter schema (JSON Schema) */
  parameters: Record<string, unknown>;
  /** Tool category */
  category: ToolCategory;
  /** Whether tool requires confirmation */
  requiresConfirmation?: boolean;
  /** Tool execution handler */
  execute(args: Record<string, unknown>): Promise<ToolResult>;
}

/**
 * Tool execution configuration
 */
export interface ToolExecutionConfig {
  /** Timeout in milliseconds */
  timeout: number;
  /** Retry policy */
  retry: {
    maxRetries: number;
    retryableErrors: string[];
  };
}

/**
 * Tool call from model
 */
export interface ToolCallRequest {
  /** Tool name */
  name: string;
  /** Tool arguments */
  arguments: Record<string, unknown>;
  /** Call ID for tracking */
  callId: string;
}

/**
 * Tool registry interface
 */
export interface IToolRegistry {
  /** Register a tool */
  register(tool: Tool): void;

  /** Unregister a tool */
  unregister(name: string): void;

  /** Get tool by name */
  get(name: string): Tool | undefined;

  /** Check if a tool exists */
  has?(name: string): boolean;

  /** List all tools */
  list(): Tool[];

  /** List tools by category */
  listByCategory(category: ToolCategory): Tool[];

  /** Execute a tool */
  execute(name: string, args: Record<string, unknown>): Promise<ToolResult>;

  /**
   * Convert tools to LLM tool definitions
   * @param filter Optional filter to limit which tools are included
   */
  toToolDefinitions(filter?: ToolFilterOptions): Array<{
    type: 'function';
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }>;

  /** Get tool count (optional) */
  readonly size?: number;

  /** Clear all tools (optional) */
  clear?(): void;

  /** Register multiple tools at once (optional) */
  registerMany?(tools: Tool[]): void;
}
