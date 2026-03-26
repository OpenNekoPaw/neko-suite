/**
 * Base Tool Class - Foundation for all tool implementations
 *
 * This base class provides common functionality for implementing tools:
 * - Argument validation
 * - Result helpers
 * - Standard interface implementation
 */

import type { Tool, ToolCategory, ToolParameters, ToolResult } from '../types/tool';

/**
 * Base class for builtin tools
 *
 * Extend this class to create custom tools. Subclasses must implement:
 * - name: Unique tool identifier
 * - description: Description for LLM
 * - parameters: JSON Schema for arguments
 * - category: Tool category
 * - execute: Execution handler
 */
export abstract class BuiltinTool implements Tool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly parameters: ToolParameters;
  abstract readonly category: ToolCategory;
  readonly requiresConfirmation: boolean = false;

  abstract execute(args: Record<string, unknown>): Promise<ToolResult>;

  /**
   * Validate arguments against parameters schema
   *
   * Performs basic validation:
   * - Checks required fields are present
   */
  protected validateArgs(args: Record<string, unknown>): { valid: boolean; error?: string } {
    const required = this.parameters.required ?? [];
    for (const field of required) {
      if (args[field] === undefined) {
        return { valid: false, error: `Missing required field: ${field}` };
      }
    }

    return { valid: true };
  }

  /**
   * Create success result
   */
  protected success(data: unknown): ToolResult {
    return { success: true, data };
  }

  /**
   * Create error result
   */
  protected error(message: string): ToolResult {
    return { success: false, error: message };
  }
}

/**
 * Create a simple tool from a function
 */
export function createTool(config: {
  name: string;
  description: string;
  parameters: ToolParameters;
  category: ToolCategory;
  requiresConfirmation?: boolean;
  execute: (args: Record<string, unknown>) => Promise<ToolResult>;
}): Tool {
  return {
    name: config.name,
    description: config.description,
    parameters: config.parameters,
    category: config.category,
    requiresConfirmation: config.requiresConfirmation ?? false,
    execute: config.execute,
  };
}
