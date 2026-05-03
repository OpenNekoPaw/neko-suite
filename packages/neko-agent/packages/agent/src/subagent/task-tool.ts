/**
 * Task Tools - Tools for spawning and managing SubAgents
 *
 * Provides:
 * - task: Spawn a SubAgent for complex tasks
 * - task_output: Get results from background SubAgents
 */

import type { Tool, ToolResult, ToolCategory, ToolExecuteOptions } from '@neko/shared';
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

function buildSubAgentToolResultMetadata(
  parentAgentId: string,
  config: SubAgentConfig,
): Record<string, unknown> {
  return {
    parentAgentId,
    description: config.description,
    subagentType: config.type,
    runMode: config.runMode,
    modelTier: config.modelTier,
    ...(config.parentMessageId ? { parentMessageId: config.parentMessageId } : {}),
    ...(config.parentToolCallId ? { parentToolCallId: config.parentToolCallId } : {}),
  };
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

Each SubAgent runs its own ReAct loop with an isolated context — intermediate work does NOT pollute the main conversation.

## When to Use SubAgent
- Task requires extensive searching/reading across many files (context isolation)
- Multiple independent subtasks can run in parallel (use run_in_background: true, then task_output to collect)
- Task needs multi-step reasoning (explore → analyze → synthesize)
- Main conversation context is already long and needs "offloading"

## When NOT to Use SubAgent
- Single-step operations (directly call tools — faster and cheaper)
- Tasks tightly coupled to current conversation context (shared state needed)
- Cost-sensitive simple lookups (SubAgent adds ~40% token overhead from full ReAct loop)

## Type Selection Guide
- code-search: Find implementations, trace dependencies, analyze patterns (fast model, Grep/Glob/Read tools)
- file-explorer: Navigate directory structure, discover file organization (fast model, Glob/Read tools)
- test-runner: Execute tests and analyze results (balanced model, Bash/Read/Glob tools)
- document-writer: Create or update documentation (balanced model, Read/Write/Edit tools)
- general: Complex tasks needing all tools (balanced model, all tools)

## Parallel Execution
Launch multiple SubAgents in a single turn for independent tasks:
- Use run_in_background: true for each
- Then call task_output for each to collect results
- Max 5 concurrent SubAgents

## Skill & ToolSkill Injection
- skills: Inject domain knowledge into SubAgent's system prompt
- tool_skills: Activate ToolSkills to give SubAgent additional tools`,

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
          enum: [
            'code-search',
            'file-explorer',
            'test-runner',
            'document-writer',
            'general',
            'creative-director',
            'cinematographer',
            'composer',
            'editor',
            'vfx-artist',
          ],
          description:
            'Type of specialized agent. Creative types: creative-director, cinematographer, composer, editor, vfx-artist',
        },
        quality_tier: {
          type: 'string',
          enum: ['draft', 'standard', 'premium'],
          description:
            'Quality tier for creative generation tasks (default: standard). Affects model selection.',
        },
        run_in_background: {
          type: 'boolean',
          description: 'Run in background without blocking (default: false)',
        },
        model: {
          type: 'string',
          enum: ['fast', 'balanced', 'powerful'],
          description:
            'Model tier resolved by runtime/platform config: fast, balanced, or powerful. Default: balanced',
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
          description: "Whether to inherit parent agent's active skills (default: false)",
        },
        tool_skills: {
          type: 'array',
          items: { type: 'string' },
          description: 'ToolSkills to activate for SubAgent (toolskill names)',
        },
        inherit_parent_tool_skills: {
          type: 'boolean',
          description: "Whether to inherit parent agent's active ToolSkills (default: false)",
        },
      },
      required: ['description', 'prompt'],
    },

    category: 'system' as ToolCategory,
    requiresConfirmation: false,

    async execute(
      args: Record<string, unknown>,
      options?: ToolExecuteOptions,
    ): Promise<ToolResult> {
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
        // Creative
        quality_tier,
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

      const metadata = options?.metadata ?? {};
      const conversationId =
        typeof metadata.conversationId === 'string' && metadata.conversationId.length > 0
          ? metadata.conversationId
          : undefined;
      if (!conversationId) {
        return {
          success: false,
          error: 'Missing conversationId for SubAgent task',
        };
      }
      const parentId =
        typeof metadata.parentAgentId === 'string' && metadata.parentAgentId.length > 0
          ? metadata.parentAgentId
          : `agent-${conversationId}`;
      const parentMessageId =
        typeof metadata.parentMessageId === 'string' ? metadata.parentMessageId : undefined;
      const parentToolCallId =
        typeof metadata.parentToolCallId === 'string' ? metadata.parentToolCallId : undefined;

      // Create SubAgent config
      const config: SubAgentConfig = {
        id: generateSubAgentId(),
        type: subagent_type as SpecializedAgentType,
        description,
        prompt,
        runMode: run_in_background ? 'background' : 'foreground',
        modelTier: model as ModelTier,
        timeout: 5 * 60 * 1000, // 5 minutes
        parentMessageId,
        parentToolCallId,
        // Skill & ToolSkill injection
        skills,
        inheritParentSkills: inherit_parent_skills,
        toolSkills: tool_skills,
        inheritParentToolSkills: inherit_parent_tool_skills,
        // Creative
        qualityTier: quality_tier,
      };

      try {
        const subAgentId = await subAgentManager.spawn(parentId, conversationId, config);
        const resultMetadata = buildSubAgentToolResultMetadata(parentId, config);

        if (run_in_background) {
          return {
            success: true,
            data: {
              subAgentId,
              ...resultMetadata,
              status: 'running',
              message: 'SubAgent started in background. Use task_output to get results.',
            },
          };
        }

        // Foreground mode: wait for result
        const result = await subAgentManager.getResult(subAgentId);
        return {
          success: result.status === 'completed',
          data: {
            ...resultMetadata,
            ...result,
            subAgentId,
          },
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

- block=true (default): Wait for the SubAgent to complete, then return its full result
- block=false: Non-blocking check — returns current status without waiting
- Use after launching SubAgents with run_in_background: true`,

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
            subAgentId: task_id,
            message: 'Task is still running',
          },
        };
      }

      // Blocking mode or task already complete
      try {
        const result = await subAgentManager.getResult(task_id, timeout);
        return {
          success: result.status === 'completed',
          data: {
            ...result,
            subAgentId: task_id,
          },
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
  subAgentManager: ISubAgentManager,
): void {
  registry.register(createTaskTool(subAgentManager));
  registry.register(createTaskOutputTool(subAgentManager));
}
