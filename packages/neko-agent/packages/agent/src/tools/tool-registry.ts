/**
 * Tool Registry - Manages tool registration and execution
 *
 * Implements IToolRegistry interface from @uniedit/shared.
 * Provides central management for all tools available to the agent.
 */

import type {
  Tool,
  ToolCategory,
  ToolResult,
  IToolRegistry,
} from '@uniedit/shared';
import { AgentError } from '../errors';

/**
 * Tool Registry implementation
 */
export class ToolRegistry implements IToolRegistry {
  /** Registered tools by name */
  private tools: Map<string, Tool> = new Map();

  /**
   * Register a tool
   *
   * @param tool Tool to register
   * @throws Error if tool with same name already exists
   */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] Tool '${tool.name}' already registered, overwriting`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Unregister a tool by name
   *
   * @param name Tool name to unregister
   */
  unregister(name: string): void {
    this.tools.delete(name);
  }

  /**
   * Get tool by name
   *
   * @param name Tool name
   * @returns Tool or undefined if not found
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool exists
   *
   * @param name Tool name
   * @returns true if tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * List all registered tools
   *
   * @returns Array of all tools
   */
  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * List tools by category
   *
   * @param category Tool category to filter by
   * @returns Array of tools in category
   */
  listByCategory(category: ToolCategory): Tool[] {
    return this.list().filter((tool) => tool.category === category);
  }

  /**
   * Execute a tool by name
   *
   * @param name Tool name
   * @param args Tool arguments
   * @returns Tool execution result
   */
  async execute(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.get(name);

    if (!tool) {
      return {
        success: false,
        error: `Tool not found: ${name}`,
      };
    }

    try {
      const startTime = Date.now();
      const result = await tool.execute(args);
      const duration = Date.now() - startTime;

      return {
        ...result,
        duration,
      };
    } catch (error) {
      if (error instanceof AgentError) {
        return {
          success: false,
          error: error.message,
        };
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Convert tools to LLM tool definitions
   *
   * Returns tools in the format expected by Claude/OpenAI API.
   *
   * @returns Array of tool definitions
   */
  toToolDefinitions(): Array<{
    type: 'function';
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }> {
    return this.list().map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
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
  }

  /**
   * Register multiple tools at once
   *
   * @param tools Array of tools to register
   */
  registerMany(tools: Tool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }
}

/**
 * Create a tool registry instance
 */
export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry();
}
