/**
 * Tools Module - Tool base classes, registry, and injection management
 *
 * This module provides:
 * - BuiltinTool: Base class for implementing tools
 * - ToolRegistry: Registry for managing and executing tools
 * - ToolCategoryRegistry: Registry for tool categorization and layer management
 * - ToolInjectionManager: Three-layer tool injection mechanism
 * - createTool: Factory function for creating simple tools
 *
 * Note: Platform-specific tools (generation, analysis, document) remain in @neko/platform.
 * This module only contains core infrastructure that agent can use standalone.
 */

// Base class and factory - import from shared
export { BuiltinTool, createTool } from '@neko/shared';

// Registry
export { ToolRegistry, createToolRegistry } from './tool-registry';

// Category registry
export { ToolCategoryRegistry, createToolCategoryRegistry } from './tool-category-registry';

// Injection manager
export { ToolInjectionManager, createToolInjectionManager } from './tool-injection-manager';

// Core meta tools
export {
  ActivateSkillTool,
  DeactivateSkillTool,
  GetContextTool,
  createCoreMetaTools,
  type ISkillProvider,
  // Core file/system tools
  ReadTool,
  WriteTool,
  BashTool,
  type BashToolOptions,
  ListDirectoryTool,
  GrepTool,
  type GrepToolOptions,
  createCoreTools,
  type CoreToolsOptions,
} from './core';

// Re-export types and constants from shared for convenience
export type {
  Tool,
  ToolCategory,
  ToolResult,
  ToolCallRequest,
  ToolExecutionConfig,
  IToolRegistry,
  // Category types
  ToolInjectionLayer,
  ToolCategoryInfo,
  CategorizedTool,
  IToolCategoryRegistry,
  // Injection types
  ToolInjectionConfig,
  ToolInjectionState,
  LayerTokenUsage,
  IToolInjectionManager,
  InjectionEvent,
  InjectionEventListener,
} from '@neko/shared';

// Pattern matching utilities (shared by permission and skill modules)
export {
  normalizeToolCall,
  matchesPattern,
  isInPatternList,
  type ToolCallLike,
} from './tool-pattern-matcher';

// Re-export injection constants
export { DEFAULT_INJECTION_CONFIG, CORE_TOOLS } from '@neko/shared';
