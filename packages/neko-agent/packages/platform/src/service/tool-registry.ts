/**
 * Tool Registry - Tool management and execution
 */

import type { Tool, ToolCategory, ToolResult, ToolExecutionConfig, ToolRegistry as IToolRegistry, ToolFilterOptions } from '../types/tool';
import { executeWithRetry } from '../provider/retry-executor';
import { PlatformError } from '../provider/platform-error';

/**
 * Default tool execution config
 */
const DEFAULT_EXECUTION_CONFIG: ToolExecutionConfig = {
  timeout: 30000,
  retry: {
    maxRetries: 2,
    retryableErrors: ['TIMEOUT', 'NETWORK_ERROR'],
  },
};

/**
 * Tool registry implementation
 */
export class ToolRegistry implements IToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private executionConfigs: Map<string, ToolExecutionConfig> = new Map();

  /**
   * Register a tool
   */
  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Unregister a tool
   */
  unregister(name: string): void {
    this.tools.delete(name);
    this.executionConfigs.delete(name);
  }

  /**
   * Get tool by name
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * List all tools
   */
  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * List tools by category
   */
  listByCategory(category: ToolCategory): Tool[] {
    return this.list().filter((t) => t.category === category);
  }

  /**
   * Set execution config for a tool
   */
  setExecutionConfig(name: string, config: ToolExecutionConfig): void {
    this.executionConfigs.set(name, config);
  }

  /**
   * Get execution config for a tool
   */
  getExecutionConfig(name: string): ToolExecutionConfig {
    return this.executionConfigs.get(name) || DEFAULT_EXECUTION_CONFIG;
  }

  /**
   * Execute a tool
   */
  async execute(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        error: `Tool '${name}' not found`,
      };
    }

    // Debug: log tool execution
    console.log('[ToolRegistry] Executing tool:', {
      name,
      args: JSON.stringify(args).substring(0, 200),
      toolFound: !!tool,
    });

    const config = this.getExecutionConfig(name);
    const startTime = Date.now();

    try {
      const result = await executeWithRetry(
        async () => tool.execute(args),
        {
          retryPolicy: {
            maxRetries: config.retry.maxRetries,
            backoffStrategy: {
              type: 'fixed',
              delayMs: 1000,
            },
            retryableCategories: ['timeout', 'network'],
          },
          timeoutPolicy: {
            requestTimeout: config.timeout,
          },
        }
      );

      // Debug: log tool result
      console.log('[ToolRegistry] Tool result:', {
        name,
        success: result.success,
        hasData: !!result.data,
        dataPreview: result.data ? JSON.stringify(result.data).substring(0, 200) : null,
        error: result.error,
      });

      return {
        ...result,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const platformError = PlatformError.fromError(error as Error);
      console.log('[ToolRegistry] Tool error:', {
        name,
        error: platformError.message,
      });
      return {
        success: false,
        error: platformError.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Convert tools to LLM tool definitions with optional filtering
   * @param filter Optional filter to limit which tools are included
   */
  toToolDefinitions(filter?: ToolFilterOptions): Array<{
    type: 'function';
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }> {
    let tools = this.list();

    if (filter) {
      // Filter by include list
      if (filter.include && filter.include.length > 0) {
        tools = tools.filter((t) => filter.include!.includes(t.name));
      }

      // Filter by exclude list
      if (filter.exclude && filter.exclude.length > 0) {
        tools = tools.filter((t) => !filter.exclude!.includes(t.name));
      }

      // Filter by categories
      if (filter.categories && filter.categories.length > 0) {
        tools = tools.filter((t) => filter.categories!.includes(t.category));
      }
    }

    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  // ==================== IToolRegistry optional methods ====================

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get tool count
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.tools.clear();
    this.executionConfigs.clear();
  }

  /**
   * Register multiple tools at once
   */
  registerMany(tools: Tool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }
}
