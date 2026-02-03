/**
 * Tool Category Registry - Manages tool categorization and layer assignment
 *
 * Provides central management for tool categories and their injection layers.
 * Works with ToolInjectionManager to implement three-layer tool injection.
 */

import type {
  ToolCategory,
  ToolCategoryInfo,
  CategorizedTool,
  ToolInjectionLayer,
  IToolCategoryRegistry,
} from '@neko/shared';
import { DEFAULT_TOOL_CATEGORIES, CORE_TOOLS } from '@neko/shared';

/**
 * Tool Category Registry implementation
 */
export class ToolCategoryRegistry implements IToolCategoryRegistry {
  /** Category metadata by ID */
  private categories: Map<ToolCategory, ToolCategoryInfo> = new Map();

  /** Tool categorization info by name */
  private tools: Map<string, CategorizedTool> = new Map();

  constructor() {
    this.registerDefaultCategories();
  }

  /**
   * Register default category configurations
   */
  private registerDefaultCategories(): void {
    for (const category of DEFAULT_TOOL_CATEGORIES) {
      this.categories.set(category.id, category);
    }
  }

  /**
   * Register category metadata
   */
  registerCategory(info: ToolCategoryInfo): void {
    this.categories.set(info.id, info);
  }

  /**
   * Get category metadata by ID
   */
  getCategory(id: ToolCategory): ToolCategoryInfo | undefined {
    return this.categories.get(id);
  }

  /**
   * List all registered categories
   */
  listCategories(): ToolCategoryInfo[] {
    return Array.from(this.categories.values()).sort(
      (a, b) => b.priority - a.priority
    );
  }

  /**
   * Get all tools in a category
   */
  getToolsByCategory(category: ToolCategory): CategorizedTool[] {
    return Array.from(this.tools.values()).filter(
      (tool) => tool.category === category
    );
  }

  /**
   * Get all tools in a layer
   */
  getToolsByLayer(layer: ToolInjectionLayer): CategorizedTool[] {
    return Array.from(this.tools.values()).filter(
      (tool) => tool.layer === layer
    );
  }

  /**
   * Register a tool with category and optional layer override
   */
  categorizeTool(
    toolName: string,
    category: ToolCategory,
    layer?: ToolInjectionLayer
  ): void {
    const categoryInfo = this.categories.get(category);
    const defaultLayer = categoryInfo?.defaultLayer ?? 'skill';

    // Core tools are always in 'core' layer
    const isCoreToolName = (CORE_TOOLS as readonly string[]).includes(toolName);
    const finalLayer = isCoreToolName ? 'core' : (layer ?? defaultLayer);

    const existing = this.tools.get(toolName);

    this.tools.set(toolName, {
      name: toolName,
      category,
      layer: finalLayer,
      tokenCost: existing?.tokenCost ?? 0,
      active: existing?.active ?? false,
    });
  }

  /**
   * Get tool's category and layer info
   */
  getToolInfo(toolName: string): CategorizedTool | undefined {
    return this.tools.get(toolName);
  }

  /**
   * Calculate total token cost for a set of tools
   */
  calculateTokenCost(toolNames: string[]): number {
    let total = 0;
    for (const name of toolNames) {
      const tool = this.tools.get(name);
      if (tool) {
        total += tool.tokenCost;
      }
    }
    return total;
  }

  /**
   * Set token cost for a tool
   */
  setToolTokenCost(toolName: string, tokenCost: number): void {
    const tool = this.tools.get(toolName);
    if (tool) {
      tool.tokenCost = tokenCost;
    }
  }

  /**
   * Set tool active state
   */
  setToolActive(toolName: string, active: boolean): void {
    const tool = this.tools.get(toolName);
    if (tool) {
      tool.active = active;
    }
  }

  /**
   * Get all core tools
   */
  getCoreTools(): CategorizedTool[] {
    return this.getToolsByLayer('core');
  }

  /**
   * Get all skill-layer tools
   */
  getSkillTools(): CategorizedTool[] {
    return this.getToolsByLayer('skill');
  }

  /**
   * Get all on-demand tools
   */
  getOnDemandTools(): CategorizedTool[] {
    return this.getToolsByLayer('ondemand');
  }

  /**
   * Check if a tool is a core tool
   */
  isCoreToolName(toolName: string): boolean {
    const tool = this.tools.get(toolName);
    return tool?.layer === 'core';
  }

  /**
   * Get tool count by layer
   */
  getToolCountByLayer(): Record<ToolInjectionLayer, number> {
    const counts: Record<ToolInjectionLayer, number> = {
      core: 0,
      skill: 0,
      ondemand: 0,
    };

    for (const tool of this.tools.values()) {
      counts[tool.layer]++;
    }

    return counts;
  }

  /**
   * Get total tool count
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * Clear all tools (keeps categories)
   */
  clearTools(): void {
    this.tools.clear();
  }

  /**
   * Get all tool names
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get all active tools
   */
  getActiveTools(): CategorizedTool[] {
    return Array.from(this.tools.values()).filter((tool) => tool.active);
  }
}

/**
 * Create a tool category registry instance
 */
export function createToolCategoryRegistry(): ToolCategoryRegistry {
  return new ToolCategoryRegistry();
}
