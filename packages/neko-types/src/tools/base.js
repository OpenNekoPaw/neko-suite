/**
 * Base Tool Class - Foundation for all tool implementations
 *
 * This base class provides common functionality for implementing tools:
 * - Argument validation
 * - Result helpers
 * - Standard interface implementation
 */
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
export class BuiltinTool {
    requiresConfirmation = false;
    /**
     * Validate arguments against parameters schema
     *
     * Performs basic validation:
     * - Checks required fields are present
     */
    validateArgs(args) {
        const params = this.parameters;
        if (params.type !== 'object') {
            return { valid: true };
        }
        // Check required fields
        const required = params.required || [];
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
    success(data) {
        return { success: true, data };
    }
    /**
     * Create error result
     */
    error(message) {
        return { success: false, error: message };
    }
}
/**
 * Create a simple tool from a function
 */
export function createTool(config) {
    return {
        name: config.name,
        description: config.description,
        parameters: config.parameters,
        category: config.category,
        requiresConfirmation: config.requiresConfirmation ?? false,
        execute: config.execute,
    };
}
//# sourceMappingURL=base.js.map