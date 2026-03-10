/**
 * Core Meta Tools
 *
 * These are the core tools that are always injected (L1 layer).
 * They allow the LLM to discover and activate additional capabilities.
 */

import type {
  Tool,
  ToolResult,
  ToolCategory,
  IToolCategoryRegistry,
  IToolGroupRegistry,
  IToolInjectionManager,
} from '@neko/shared';
import { BuiltinTool } from '@neko/shared';

/**
 * SearchToolSets - Meta tool for discovering available tool sets
 *
 * Allows the LLM to search for tool sets by keyword or category,
 * enabling on-demand tool discovery and activation.
 */
export class SearchToolsTool extends BuiltinTool {
  readonly name = 'SearchToolSets';
  readonly description =
    'Search for available tools by keyword or category. Use this when you need a capability that is not currently available.';
  readonly parameters = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query (keywords to match against tool names and descriptions)',
      },
      category: {
        type: 'string',
        description: 'Optional: Filter by tool category (e.g., "timeline", "audio", "effects")',
      },
    },
    required: ['query'],
  };
  readonly category: ToolCategory = 'system';

  private categoryRegistry: IToolCategoryRegistry;
  private skillRegistry?: IToolGroupRegistry;

  constructor(categoryRegistry: IToolCategoryRegistry, skillRegistry?: IToolGroupRegistry) {
    super();
    this.categoryRegistry = categoryRegistry;
    this.skillRegistry = skillRegistry;
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(validation.error ?? 'Invalid arguments');
    }

    const query = (args.query as string).toLowerCase();
    const categoryFilter = args.category as string | undefined;

    // Search through categories
    const categories = this.categoryRegistry.listCategories();
    const matchedCategories: Array<{
      id: string;
      name: string;
      description: string;
      toolCount: number;
      tools: Array<{ name: string; description: string }>;
      relevance: number;
    }> = [];

    for (const category of categories) {
      // Skip if category filter doesn't match
      if (categoryFilter && category.id !== categoryFilter) {
        continue;
      }

      // Get tools in this category
      const categoryTools = this.categoryRegistry.getToolsByCategory(category.id);

      // Calculate relevance based on keyword matching
      let relevance = 0;
      const queryWords = query.split(/\s+/);

      // Match against category name and description
      for (const word of queryWords) {
        if (category.displayName.toLowerCase().includes(word)) {
          relevance += 2;
        }
        if (category.description.toLowerCase().includes(word)) {
          relevance += 1;
        }
      }

      // Match against tool names
      const matchedTools: Array<{ name: string; description: string }> = [];
      for (const tool of categoryTools) {
        let toolRelevance = 0;
        for (const word of queryWords) {
          if (tool.name.toLowerCase().includes(word)) {
            toolRelevance += 3;
          }
        }
        if (toolRelevance > 0) {
          relevance += toolRelevance;
          matchedTools.push({
            name: tool.name,
            description: `[${tool.layer}] ${tool.category}`,
          });
        }
      }

      if (relevance > 0 || categoryFilter) {
        matchedCategories.push({
          id: category.id,
          name: category.displayName,
          description: category.description,
          toolCount: categoryTools.length,
          tools:
            matchedTools.length > 0
              ? matchedTools
              : categoryTools.slice(0, 3).map((t) => ({
                  name: t.name,
                  description: `[${t.layer}] ${t.category}`,
                })),
          relevance,
        });
      }
    }

    // Sort by relevance
    matchedCategories.sort((a, b) => b.relevance - a.relevance);

    // Also search skills if available
    const matchedSkills: Array<{
      name: string;
      description: string;
      tools: string[];
      relevance: number;
    }> = [];

    if (this.skillRegistry) {
      const skills = this.skillRegistry.list();
      for (const skill of skills) {
        let relevance = 0;
        const queryWords = query.split(/\s+/);

        for (const word of queryWords) {
          if (skill.name.toLowerCase().includes(word)) {
            relevance += 3;
          }
          if (skill.description.toLowerCase().includes(word)) {
            relevance += 2;
          }
        }

        if (relevance > 0) {
          matchedSkills.push({
            name: skill.name,
            description: skill.description,
            tools: skill.tools.slice(0, 5),
            relevance,
          });
        }
      }

      matchedSkills.sort((a, b) => b.relevance - a.relevance);
    }

    // Generate actionable suggestion
    let suggestion = '';
    let nextAction = '';

    if (matchedSkills.length > 0) {
      const topSkill = matchedSkills[0];
      suggestion = `Found ${matchedSkills.length} matching tool set(s). Best match: "${topSkill.name}" - ${topSkill.description}`;
      nextAction = `To use these tools, call: ActivateToolSet({ skillName: "${topSkill.name}" })`;
    } else if (matchedCategories.length > 0) {
      const topCategory = matchedCategories[0];
      suggestion = `Found ${matchedCategories.length} relevant categories. Top match: "${topCategory.name}" (${topCategory.toolCount} tools)`;
      nextAction = 'Check the tools list above and activate the appropriate tool set.';
    } else {
      suggestion = 'No matching tools found.';
      nextAction = 'Try different keywords or use GetContext to see all available skills.';
    }

    return this.success({
      skills: matchedSkills.slice(0, 5),
      categories: matchedCategories.slice(0, 3),
      suggestion,
      nextAction,
      totalSkills: matchedSkills.length,
      totalCategories: matchedCategories.length,
    });
  }
}

/**
 * ActivateToolSet - Meta tool for activating a tool set
 *
 * Allows the LLM to dynamically activate a tool set to gain access
 * to its associated tools and capabilities.
 */
export class ActivateSkillTool extends BuiltinTool {
  readonly name = 'ActivateToolSet';
  readonly description =
    'Activate a tool set to gain access to its tools and capabilities. Use SearchToolSets first to find available tool sets.';
  readonly parameters = {
    type: 'object',
    properties: {
      skillName: {
        type: 'string',
        description: 'Name of the skill to activate',
      },
      reason: {
        type: 'string',
        description: 'Brief explanation of why this skill is needed',
      },
    },
    required: ['skillName'],
  };
  readonly category: ToolCategory = 'system';

  private injectionManager: IToolInjectionManager;
  private skillRegistry?: IToolGroupRegistry;

  constructor(injectionManager: IToolInjectionManager, skillRegistry?: IToolGroupRegistry) {
    super();
    this.injectionManager = injectionManager;
    this.skillRegistry = skillRegistry;
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(validation.error ?? 'Invalid arguments');
    }

    const skillName = args.skillName as string;
    const reason = args.reason as string | undefined;

    // Check if tool set exists
    if (this.skillRegistry) {
      const skill = this.skillRegistry.get(skillName);
      if (!skill) {
        // Try to find similar tool sets
        const allSkills = this.skillRegistry.list();
        const similar = allSkills
          .filter((s) => s.name.toLowerCase().includes(skillName.toLowerCase()))
          .map((s) => s.name);

        return this.error(
          `Tool set "${skillName}" not found.${similar.length > 0 ? ` Did you mean: ${similar.join(', ')}?` : ' Use SearchToolSets to find available tool sets.'}`,
        );
      }

      if (!skill.enabled) {
        return this.error(`Tool set "${skillName}" is disabled.`);
      }
    }

    // Activate the tool set
    try {
      this.injectionManager.activateToolSet(skillName);

      // Get the tools that are now available
      const state = this.injectionManager.getState();
      const activeToolSets = state.activeToolSets;

      let activatedTools: string[] = [];
      if (this.skillRegistry) {
        activatedTools = this.skillRegistry.getActiveTools([skillName]);
      }

      return this.success({
        activated: true,
        skillName,
        reason: reason ?? 'User requested',
        activeToolSets,
        newTools: activatedTools,
        message: `Tool set "${skillName}" activated. ${activatedTools.length} tools are now available.`,
      });
    } catch (error) {
      return this.error(
        `Failed to activate tool set: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/**
 * DeactivateToolSet - Meta tool for deactivating a tool set
 */
export class DeactivateSkillTool extends BuiltinTool {
  readonly name = 'DeactivateToolSet';
  readonly description =
    'Deactivate a tool set to free up context space. Use when a tool set is no longer needed.';
  readonly parameters = {
    type: 'object',
    properties: {
      skillName: {
        type: 'string',
        description: 'Name of the skill to deactivate',
      },
    },
    required: ['skillName'],
  };
  readonly category: ToolCategory = 'system';

  private injectionManager: IToolInjectionManager;

  constructor(injectionManager: IToolInjectionManager) {
    super();
    this.injectionManager = injectionManager;
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(validation.error ?? 'Invalid arguments');
    }

    const skillName = args.skillName as string;

    // Check if tool set is active
    const state = this.injectionManager.getState();
    if (!state.activeToolSets.includes(skillName)) {
      return this.error(`Tool set "${skillName}" is not currently active.`);
    }

    // Deactivate the tool set
    this.injectionManager.deactivateToolSet(skillName);

    const newState = this.injectionManager.getState();

    return this.success({
      deactivated: true,
      skillName,
      activeToolSets: newState.activeToolSets,
      message: `Tool set "${skillName}" deactivated.`,
    });
  }
}

/**
 * GetContext - Meta tool for getting current context information
 */
export class GetContextTool extends BuiltinTool {
  readonly name = 'GetContext';
  readonly description =
    'Get information about the current context, including active skills, available tools, and token usage.';
  readonly parameters = {
    type: 'object',
    properties: {
      includeTools: {
        type: 'boolean',
        description: 'Include list of currently available tools',
      },
    },
  };
  readonly category: ToolCategory = 'system';

  private injectionManager: IToolInjectionManager;
  private categoryRegistry: IToolCategoryRegistry;

  constructor(injectionManager: IToolInjectionManager, categoryRegistry: IToolCategoryRegistry) {
    super();
    this.injectionManager = injectionManager;
    this.categoryRegistry = categoryRegistry;
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const includeTools = args.includeTools as boolean | undefined;

    const state = this.injectionManager.getState();
    const tokenUsage = this.injectionManager.getTokenUsage();

    // Calculate total tools from all categories
    const allCategories = this.categoryRegistry.listCategories();
    const totalTools = allCategories.reduce((sum, cat) => {
      return sum + this.categoryRegistry.getToolsByCategory(cat.id).length;
    }, 0);

    const result: Record<string, unknown> = {
      activeToolSets: state.activeToolSets,
      tokenUsage: tokenUsage.map((u) => ({
        layer: u.layer,
        used: u.used,
        budget: u.budget,
        percentage: u.budget > 0 ? Math.round((u.used / u.budget) * 100) : 0,
      })),
      totalTools,
    };

    if (includeTools) {
      const injectedTools = state.injectedTools;
      result.tools = {
        core: injectedTools.get('core') ?? [],
        skill: injectedTools.get('skill') ?? [],
        ondemand: injectedTools.get('ondemand') ?? [],
      };
    }

    return this.success(result);
  }
}

/**
 * Factory function to create all core meta tools
 */
export function createCoreMetaTools(
  categoryRegistry: IToolCategoryRegistry,
  injectionManager: IToolInjectionManager,
  skillRegistry?: IToolGroupRegistry,
): Tool[] {
  return [
    new SearchToolsTool(categoryRegistry, skillRegistry),
    new ActivateSkillTool(injectionManager, skillRegistry),
    new DeactivateSkillTool(injectionManager),
    new GetContextTool(injectionManager, categoryRegistry),
  ];
}
