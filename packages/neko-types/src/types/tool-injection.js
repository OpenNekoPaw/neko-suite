/**
 * Tool Injection Types - Three-layer tool injection mechanism
 */
/**
 * Default injection configuration
 */
export const DEFAULT_INJECTION_CONFIG = {
    maxToolsPerLayer: {
        core: 10, // Core tools: Read, Write, Bash, ListDirectory, Grep, SearchTools, etc.
        skill: 20,
        ondemand: 10,
    },
    tokenBudgetPerLayer: {
        core: 3000, // Increased for SearchTools
        skill: 8000,
        ondemand: 4000,
    },
    autoActivateThreshold: 0.15,
    enableOnDemand: true,
};
//# sourceMappingURL=tool-injection.js.map