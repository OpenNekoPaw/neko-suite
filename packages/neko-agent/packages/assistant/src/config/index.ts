/**
 * Configuration Index
 *
 * Re-exports all configuration modules for easy importing.
 * Configuration data is loaded from platform via Extension-Webview messaging.
 */

// Provider UI metadata (display info for UI)
export * from './ui-metadata';

// MCP server configuration (types and utilities)
export * from './mcp-servers';

// Workflow engine configuration (types and utilities)
export * from './workflow-engines';

// Prompt preset configuration (types and utilities)
export * from './prompts';

// Legacy re-exports for backward compatibility
// TODO: Remove after migration complete
export { getAgentTypeName } from './prompts';
