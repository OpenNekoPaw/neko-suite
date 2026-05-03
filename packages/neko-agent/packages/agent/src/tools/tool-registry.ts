/**
 * Tool Registry — Tool execution dispatch (one of four registries in agent)
 *
 * Responsibility: Register tools by name, dispatch execution, produce LLM tool definitions.
 * This is the ONLY registry that actually executes tools.
 *
 * Registry landscape:
 * - ToolRegistry (this)       → execution dispatch (register/execute/toToolDefinitions)
 * - ToolCategoryRegistry      → functional categorization + injection layer assignment
 * - ToolGroupRegistry (skill) → semantic ToolSet grouping for LLM-driven discovery
 * - SkillRegistry (skill)     → Skill + SlashCommand storage and lifecycle
 */

import type {
  Tool,
  ToolCategory,
  ToolResult,
  ToolExecuteOptions,
  ToolExecutionConfig,
  ToolFilterOptions,
  IToolRegistry,
} from '@neko/shared';
import { AgentError } from '../errors';
import { getLogger } from '../utils/logger';
import { validateSchema, formatValidationErrors } from './schema-validator';

const logger = getLogger('ToolRegistry');

/**
 * Default tool execution config
 */
const DEFAULT_EXECUTION_CONFIG: ToolExecutionConfig = {
  timeout: 30000,
  retry: {
    maxRetries: 0,
    retryableErrors: [],
  },
};

/**
 * Tool Registry implementation
 */
export class ToolRegistry implements IToolRegistry {
  /** Registered tools by name */
  private tools: Map<string, Tool> = new Map();
  /** Per-tool execution configs */
  private executionConfigs: Map<string, ToolExecutionConfig> = new Map();

  /**
   * Register a tool
   *
   * @param tool Tool to register
   * @throws Error if tool with same name already exists
   */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      logger.warn('Tool already registered, overwriting', { toolName: tool.name });
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
    this.executionConfigs.delete(name);
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
  async execute(
    name: string,
    args: Record<string, unknown>,
    options?: ToolExecuteOptions,
  ): Promise<ToolResult> {
    const tool = this.get(name);

    if (!tool) {
      return {
        success: false,
        error: `Tool not found: ${name}`,
      };
    }

    // Schema validation: catch parameter errors before execution
    if (tool.parameters) {
      const validationErrors = validateSchema(args, tool.parameters);
      if (validationErrors.length > 0) {
        return {
          success: false,
          error: formatValidationErrors(validationErrors),
          validationErrors,
        };
      }
    }

    try {
      const startTime = Date.now();
      const result = await tool.execute(args, options);
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
   * Supports filtering by include/exclude lists and categories.
   *
   * @param filter Optional filter to limit which tools are included
   * @returns Array of tool definitions
   */
  toToolDefinitions(filter?: ToolFilterOptions): ReturnType<IToolRegistry['toToolDefinitions']> {
    let tools = this.list();

    if (filter) {
      if (filter.include && filter.include.length > 0) {
        const includeSet = new Set(filter.include);
        tools = tools.filter((tool) => includeSet.has(tool.name));
      }
      if (filter.exclude && filter.exclude.length > 0) {
        const excludeSet = new Set(filter.exclude);
        tools = tools.filter((tool) => !excludeSet.has(tool.name));
      }
      if (filter.categories && filter.categories.length > 0) {
        tools = tools.filter((tool) => filter.categories!.includes(tool.category));
      }
    }

    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: toProviderToolParameters(tool.parameters),
      },
    }));
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
    return this.executionConfigs.get(name) ?? DEFAULT_EXECUTION_CONFIG;
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

function toProviderToolParameters(toolParameters: Tool['parameters']): Record<string, unknown> {
  return {
    ...toolParameters,
    properties: { ...toolParameters.properties },
    ...(toolParameters.required ? { required: [...toolParameters.required] } : {}),
  };
}
