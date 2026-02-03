/**
 * Base Tool Class - Foundation for all tool implementations
 *
 * This base class provides common functionality for implementing tools:
 * - Argument validation
 * - Result helpers
 * - Standard interface implementation
 */
import type { Tool, ToolCategory, ToolResult } from '../types/tool';
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
export declare abstract class BuiltinTool implements Tool {
    abstract readonly name: string;
    abstract readonly description: string;
    abstract readonly parameters: Record<string, unknown>;
    abstract readonly category: ToolCategory;
    readonly requiresConfirmation: boolean;
    abstract execute(args: Record<string, unknown>): Promise<ToolResult>;
    /**
     * Validate arguments against parameters schema
     *
     * Performs basic validation:
     * - Checks required fields are present
     */
    protected validateArgs(args: Record<string, unknown>): {
        valid: boolean;
        error?: string;
    };
    /**
     * Create success result
     */
    protected success(data: unknown): ToolResult;
    /**
     * Create error result
     */
    protected error(message: string): ToolResult;
}
/**
 * Create a simple tool from a function
 */
export declare function createTool(config: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    category: ToolCategory;
    requiresConfirmation?: boolean;
    execute: (args: Record<string, unknown>) => Promise<ToolResult>;
}): Tool;
//# sourceMappingURL=base.d.ts.map