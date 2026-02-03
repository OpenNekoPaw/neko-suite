/**
 * Configuration Adapter Interface
 *
 * Defines a unified interface for converting between UnifiedConfig
 * and environment-specific configuration formats (CLI, Assistant settings, etc.).
 *
 * This enables:
 * 1. Type-safe configuration conversion
 * 2. Consistent validation across environments
 * 3. Bidirectional transformation (for config editing UIs)
 */
// =============================================================================
// Abstract Base Adapter
// =============================================================================
/**
 * Abstract base class for configuration adapters
 *
 * Provides default implementations for common operations.
 */
export class BaseConfigAdapter {
    /**
     * Validate target configuration
     * Default implementation returns valid result.
     * Override for custom validation.
     */
    validate(config) {
        // Default: no validation
        void config;
        return { valid: true, errors: [], warnings: [] };
    }
    /**
     * Merge configurations
     * Default implementation uses shallow merge.
     * Override for custom merge logic.
     */
    merge(base, override) {
        return { ...base, ...override };
    }
    /**
     * Helper: Create validation error
     */
    error(field, message) {
        return { field, message, severity: 'error' };
    }
    /**
     * Helper: Create validation warning
     */
    warning(field, message) {
        return { field, message, severity: 'warning' };
    }
    /**
     * Helper: Create validation result
     */
    result(errors, warnings = []) {
        return {
            valid: errors.length === 0,
            errors: errors.filter((e) => e.severity === 'error'),
            warnings: [...warnings, ...errors.filter((e) => e.severity === 'warning')],
        };
    }
}
//# sourceMappingURL=config-adapter.js.map