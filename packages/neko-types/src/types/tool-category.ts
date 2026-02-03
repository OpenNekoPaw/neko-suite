/**
 * Tool Category Types - Tool categorization and layer management
 */

import type { ToolCategory } from './tool';

/**
 * Tool injection layer
 * - core: Always injected (~5 tools)
 * - skill: Injected when skill is active (~20 tools)
 * - ondemand: Injected on LLM request (~10 tools)
 */
export type ToolInjectionLayer = 'core' | 'skill' | 'ondemand';

/**
 * Tool category metadata
 */
export interface ToolCategoryInfo {
  /** Category identifier */
  id: ToolCategory;
  /** Display name for UI */
  displayName: string;
  /** Description of the category */
  description: string;
  /** Icon for UI (emoji) */
  icon: string;
  /** Default injection layer for tools in this category */
  defaultLayer: ToolInjectionLayer;
  /** Priority within layer (higher = more important) */
  priority: number;
}

/**
 * Tool with category and layer information
 */
export interface CategorizedTool {
  /** Tool name */
  name: string;
  /** Tool category */
  category: ToolCategory;
  /** Injection layer */
  layer: ToolInjectionLayer;
  /** Estimated token cost (description + parameters) */
  tokenCost: number;
  /** Whether tool is currently active */
  active: boolean;
}

/**
 * Tool category registry interface
 */
export interface IToolCategoryRegistry {
  /**
   * Register category metadata
   */
  registerCategory(info: ToolCategoryInfo): void;

  /**
   * Get category metadata by ID
   */
  getCategory(id: ToolCategory): ToolCategoryInfo | undefined;

  /**
   * List all registered categories
   */
  listCategories(): ToolCategoryInfo[];

  /**
   * Get all tools in a category
   */
  getToolsByCategory(category: ToolCategory): CategorizedTool[];

  /**
   * Get all tools in a layer
   */
  getToolsByLayer(layer: ToolInjectionLayer): CategorizedTool[];

  /**
   * Register a tool with category and optional layer override
   */
  categorizeTool(
    toolName: string,
    category: ToolCategory,
    layer?: ToolInjectionLayer
  ): void;

  /**
   * Get tool's category and layer info
   */
  getToolInfo(toolName: string): CategorizedTool | undefined;

  /**
   * Calculate total token cost for a set of tools
   */
  calculateTokenCost(toolNames: string[]): number;

  /**
   * Set token cost for a tool
   */
  setToolTokenCost(toolName: string, tokenCost: number): void;

  /**
   * Set tool active state
   */
  setToolActive(toolName: string, active: boolean): void;
}

/**
 * Default category configurations
 */
export const DEFAULT_TOOL_CATEGORIES: ToolCategoryInfo[] = [
  {
    id: 'system',
    displayName: 'System',
    description: 'Core system operations (shell, process)',
    icon: '⚙️',
    defaultLayer: 'core',
    priority: 100,
  },
  {
    id: 'file',
    displayName: 'File',
    description: 'File system operations (read, write, search)',
    icon: '📁',
    defaultLayer: 'core',
    priority: 90,
  },
  {
    id: 'project',
    displayName: 'Project',
    description: 'Project management operations',
    icon: '📦',
    defaultLayer: 'skill',
    priority: 85,
  },
  {
    id: 'timeline',
    displayName: 'Timeline',
    description: 'Video timeline operations',
    icon: '🎬',
    defaultLayer: 'skill',
    priority: 80,
  },
  {
    id: 'media',
    displayName: 'Media',
    description: 'Media processing operations',
    icon: '🎥',
    defaultLayer: 'skill',
    priority: 70,
  },
  {
    id: 'document',
    displayName: 'Document',
    description: 'Document processing operations',
    icon: '📄',
    defaultLayer: 'skill',
    priority: 65,
  },
  {
    id: 'generation',
    displayName: 'Generation',
    description: 'AI content generation',
    icon: '🤖',
    defaultLayer: 'ondemand',
    priority: 60,
  },
  {
    id: 'analysis',
    displayName: 'Analysis',
    description: 'Content analysis operations',
    icon: '📊',
    defaultLayer: 'ondemand',
    priority: 50,
  },
  {
    id: 'mcp',
    displayName: 'MCP',
    description: 'MCP server tools',
    icon: '🔌',
    defaultLayer: 'ondemand',
    priority: 40,
  },
  {
    id: 'workflow',
    displayName: 'Workflow',
    description: 'Workflow engine tools',
    icon: '⚡',
    defaultLayer: 'ondemand',
    priority: 30,
  },
];

/**
 * Core tools that are always injected (L1 layer)
 * - Basic file operations: Read, Write, ListDirectory, Grep
 * - Shell execution: Bash
 * - Tool discovery & skill management: SearchTools, ActivateSkill, DeactivateSkill, GetContext
 */
export const CORE_TOOLS = [
  'Read',
  'Write',
  'Bash',
  'ListDirectory',
  'Grep',
  'SearchTools',
  'ActivateSkill',
  'DeactivateSkill',
  'GetContext',
] as const;

export type CoreToolName = (typeof CORE_TOOLS)[number];
