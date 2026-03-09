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
  IToolSkillRegistry,
  IToolInjectionManager,
} from '@neko/shared';
import { BuiltinTool } from '@neko/shared';

/**
 * SearchTools - Meta tool for discovering available tools
 *
 * Allows the LLM to search for tools by keyword or category,
 * enabling on-demand tool discovery and activation.
 */
export class SearchToolsTool extends BuiltinTool {
  readonly name = 'SearchTools';
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
  private skillRegistry?: IToolSkillRegistry;

  constructor(categoryRegistry: IToolCategoryRegistry, skillRegistry?: IToolSkillRegistry) {
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
          for (const keyword of skill.triggerKeywords) {
            if (keyword.toLowerCase().includes(word)) {
              relevance += 2;
            }
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
      suggestion = `Found ${matchedSkills.length} matching skill(s). Best match: "${topSkill.name}" - ${topSkill.description}`;
      nextAction = `To use these tools, call: ActivateSkill({ skillName: "${topSkill.name}" })`;
    } else if (matchedCategories.length > 0) {
      const topCategory = matchedCategories[0];
      suggestion = `Found ${matchedCategories.length} relevant categories. Top match: "${topCategory.name}" (${topCategory.toolCount} tools)`;
      nextAction = 'Check the tools list above and activate the appropriate skill.';
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
 * ActivateSkill - Meta tool for activating a skill
 *
 * Allows the LLM to dynamically activate a skill to gain access
 * to its associated tools and capabilities.
 */
export class ActivateSkillTool extends BuiltinTool {
  readonly name = 'ActivateSkill';
  readonly description =
    'Activate a skill to gain access to its tools and capabilities. Use searchTools first to find available skills.';
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
  private skillRegistry?: IToolSkillRegistry;

  constructor(injectionManager: IToolInjectionManager, skillRegistry?: IToolSkillRegistry) {
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

    // Check if skill exists
    if (this.skillRegistry) {
      const skill = this.skillRegistry.get(skillName);
      if (!skill) {
        // Try to find similar skills
        const allSkills = this.skillRegistry.list();
        const similar = allSkills
          .filter((s) => s.name.toLowerCase().includes(skillName.toLowerCase()))
          .map((s) => s.name);

        return this.error(
          `Skill "${skillName}" not found.${similar.length > 0 ? ` Did you mean: ${similar.join(', ')}?` : ' Use searchTools to find available skills.'}`,
        );
      }

      if (!skill.enabled) {
        return this.error(`Skill "${skillName}" is disabled.`);
      }
    }

    // Activate the skill
    try {
      this.injectionManager.activateSkill(skillName);

      // Get the tools that are now available
      const state = this.injectionManager.getState();
      const activeSkills = state.activeSkills;

      let activatedTools: string[] = [];
      if (this.skillRegistry) {
        activatedTools = this.skillRegistry.getActiveTools([skillName]);
      }

      return this.success({
        activated: true,
        skillName,
        reason: reason ?? 'User requested',
        activeSkills,
        newTools: activatedTools,
        message: `Skill "${skillName}" activated. ${activatedTools.length} tools are now available.`,
      });
    } catch (error) {
      return this.error(
        `Failed to activate skill: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/**
 * DeactivateSkill - Meta tool for deactivating a skill
 */
export class DeactivateSkillTool extends BuiltinTool {
  readonly name = 'DeactivateSkill';
  readonly description =
    'Deactivate a skill to free up context space. Use when a skill is no longer needed.';
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

    // Check if skill is active
    const state = this.injectionManager.getState();
    if (!state.activeSkills.includes(skillName)) {
      return this.error(`Skill "${skillName}" is not currently active.`);
    }

    // Deactivate the skill
    this.injectionManager.deactivateSkill(skillName);

    const newState = this.injectionManager.getState();

    return this.success({
      deactivated: true,
      skillName,
      activeSkills: newState.activeSkills,
      message: `Skill "${skillName}" deactivated.`,
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
      activeSkills: state.activeSkills,
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
  skillRegistry?: IToolSkillRegistry,
): Tool[] {
  return [
    new SearchToolsTool(categoryRegistry, skillRegistry),
    new ActivateSkillTool(injectionManager, skillRegistry),
    new DeactivateSkillTool(injectionManager),
    new GetContextTool(injectionManager, categoryRegistry),
  ];
}
