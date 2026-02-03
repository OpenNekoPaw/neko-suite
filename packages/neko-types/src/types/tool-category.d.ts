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
    categorizeTool(toolName: string, category: ToolCategory, layer?: ToolInjectionLayer): void;
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
export declare const DEFAULT_TOOL_CATEGORIES: ToolCategoryInfo[];
/**
 * Core tools that are always injected (L1 layer)
 * - Basic file operations: Read, Write, ListDirectory, Grep
 * - Shell execution: Bash
 * - Tool discovery & skill management: SearchTools, ActivateSkill, DeactivateSkill, GetContext
 */
export declare const CORE_TOOLS: readonly ["Read", "Write", "Bash", "ListDirectory", "Grep", "SearchTools", "ActivateSkill", "DeactivateSkill", "GetContext"];
export type CoreToolName = (typeof CORE_TOOLS)[number];
//# sourceMappingURL=tool-category.d.ts.map