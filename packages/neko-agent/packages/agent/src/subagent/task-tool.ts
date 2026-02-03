/**
 * Task Tools - Tools for spawning and managing SubAgents
 *
 * Provides:
 * - task: Spawn a SubAgent for complex tasks
 * - task_output: Get results from background SubAgents
 */

import type { Tool, ToolResult, ToolCategory } from '@neko/shared';
import type {
  ISubAgentManager,
  SubAgentConfig,
  SpecializedAgentType,
  ModelTier,
  TaskToolArgs,
  TaskOutputToolArgs,
} from './types';

// =============================================================================
// ID Generation
// =============================================================================

/**
 * Generate a unique SubAgent ID
 */
function generateSubAgentId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 7);
  return `subagent-${timestamp}-${random}`;
}

// =============================================================================
// Task Tool
// =============================================================================

/**
 * Create the Task tool for spawning SubAgents
 */
export function createTaskTool(subAgentManager: ISubAgentManager): Tool {
  return {
    name: 'task',
    description: `Launch a SubAgent to handle complex, multi-step tasks autonomously.

Available agent types:
- code-search: Search and analyze code in the codebase
- file-explorer: Explore and navigate file system
- test-runner: Run and analyze tests
- document-writer: Write and update documentation
- general: General purpose agent (all tools available)

Use this tool when:
- Task requires multiple search/read operations
- Task can run independently
- Task benefits from parallel execution

Skill & ToolSkill injection:
- skills: Inject skill content into SubAgent's system prompt
- tool_skills: Activate ToolSkills to add related tools

Examples:
- Search for all API endpoints
- Find files matching a pattern
- Run tests and analyze results
- Write documentation for a module`,

    parameters: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Short task description (3-5 words)',
        },
        prompt: {
          type: 'string',
          description: 'Detailed task instructions for the SubAgent',
        },
        subagent_type: {
          type: 'string',
          enum: ['code-search', 'file-explorer', 'test-runner', 'document-writer', 'general'],
          description: 'Type of specialized agent to use (default: general)',
        },
        run_in_background: {
          type: 'boolean',
          description: 'Run in background without blocking (default: false)',
        },
        model: {
          type: 'string',
          enum: ['fast', 'balanced', 'powerful'],
          description: 'Model tier: fast (haiku), balanced (sonnet), powerful (opus). Default: balanced',
        },
        resume: {
          type: 'string',
          description: 'SubAgent ID to resume or check status',
        },
        // Skill & ToolSkill injection parameters
        skills: {
          type: 'array',
          items: { type: 'string' },
          description: 'Skills to inject into SubAgent (skill names)',
        },
        inherit_parent_skills: {
          type: 'boolean',
          description: 'Whether to inherit parent agent\'s active skills (default: false)',
        },
        tool_skills: {
          type: 'array',
          items: { type: 'string' },
          description: 'ToolSkills to activate for SubAgent (toolskill names)',
        },
        inherit_parent_tool_skills: {
          type: 'boolean',
          description: 'Whether to inherit parent agent\'s active ToolSkills (default: false)',
        },
      },
      required: ['description', 'prompt'],
    },

    category: 'system' as ToolCategory,
    requiresConfirmation: false,

    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      const typedArgs = args as unknown as TaskToolArgs;
      const {
        description,
        prompt,
        subagent_type = 'general',
        run_in_background = false,
        model = 'balanced',
        resume,
        // Skill & ToolSkill injection
        skills,
        inherit_parent_skills = false,
        tool_skills,
        inherit_parent_tool_skills = false,
      } = typedArgs;

      // Handle resume case
      if (resume) {
        const status = subAgentManager.getStatus(resume);
        if (!status) {
          return {
            success: false,
            error: `SubAgent not found: ${resume}`,
          };
        }

        if (status === 'running') {
          // Wait for result
          try {
            const result = await subAgentManager.getResult(resume);
            return {
              success: result.status === 'completed',
              data: result,
              error: result.error,
            };
          } catch (error) {
            return {
              success: false,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        }

        // Return current status for non-running states
        return {
          success: true,
          data: { status, id: resume },
        };
      }

      // Validate required args
      if (!description || !prompt) {
        return {
          success: false,
          error: 'Missing required arguments: description and prompt',
        };
      }

      // Extract metadata from args (injected by executor)
      const metadata = (args._metadata as Record<string, unknown>) || {};
      const parentId = (metadata.parentAgentId as string) || 'unknown';
      const conversationId = (metadata.conversationId as string) || 'unknown';

      // Create SubAgent config
      const config: SubAgentConfig = {
        id: generateSubAgentId(),
        type: subagent_type as SpecializedAgentType,
        description,
        prompt,
        runMode: run_in_background ? 'background' : 'foreground',
        modelTier: model as ModelTier,
        timeout: 5 * 60 * 1000, // 5 minutes
        // Skill & ToolSkill injection
        skills,
        inheritParentSkills: inherit_parent_skills,
        toolSkills: tool_skills,
        inheritParentToolSkills: inherit_parent_tool_skills,
      };

      try {
        const subAgentId = await subAgentManager.spawn(parentId, conversationId, config);

        if (run_in_background) {
          return {
            success: true,
            data: {
              subAgentId,
              status: 'running',
              message: 'SubAgent started in background. Use task_output to get results.',
            },
          };
        }

        // Foreground mode: wait for result
        const result = await subAgentManager.getResult(subAgentId);
        return {
          success: result.status === 'completed',
          data: result,
          error: result.error,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

// =============================================================================
// TaskOutput Tool
// =============================================================================

/**
 * Create the TaskOutput tool for getting SubAgent results
 */
export function createTaskOutputTool(subAgentManager: ISubAgentManager): Tool {
  return {
    name: 'task_output',
    description: `Get output from a background SubAgent task.

Use this tool to:
- Check if a background task is complete
- Get the final result of a completed task
- Wait for a task to complete (blocking mode)`,

    parameters: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'The SubAgent task ID',
        },
        block: {
          type: 'boolean',
          description: 'Wait for completion (default: true)',
        },
        timeout: {
          type: 'number',
          description: 'Max wait time in ms (default: 30000)',
        },
      },
      required: ['task_id'],
    },

    category: 'system' as ToolCategory,
    requiresConfirmation: false,

    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      const typedArgs = args as unknown as TaskOutputToolArgs;
      const { task_id, block = true, timeout = 30000 } = typedArgs;

      if (!task_id) {
        return {
          success: false,
          error: 'Missing required argument: task_id',
        };
      }

      const status = subAgentManager.getStatus(task_id);
      if (!status) {
        return {
          success: false,
          error: `SubAgent not found: ${task_id}`,
        };
      }

      // Non-blocking mode
      if (!block && status === 'running') {
        return {
          success: true,
          data: {
            status: 'running',
            taskId: task_id,
            message: 'Task is still running',
          },
        };
      }

      // Blocking mode or task already complete
      try {
        const result = await subAgentManager.getResult(task_id, timeout);
        return {
          success: result.status === 'completed',
          data: result,
          error: result.error,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Register SubAgent tools to a tool registry
 */
export function registerSubAgentTools(
  registry: { register: (tool: Tool) => void },
  subAgentManager: ISubAgentManager
): void {
  registry.register(createTaskTool(subAgentManager));
  registry.register(createTaskOutputTool(subAgentManager));
}
