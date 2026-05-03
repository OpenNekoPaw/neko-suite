/**
 * CoordinateTool — LLM-callable tool for launching Coordinator workflows
 *
 * Wraps Coordinator into a standard Tool interface so the LLM can
 * orchestrate multi-agent workflows through normal tool calling.
 */

import type { Tool, ToolResult, ToolCategory, ToolExecuteOptions } from '@neko/shared';
import type { CoordinateToolDeps, CoordinatorEvent, TaskItem } from './types';
import type { SpecializedAgentType } from '../types';
import { Coordinator } from './coordinator';

// =============================================================================
// ID Generation
// =============================================================================

let coordinatorCounter = 0;

function generateCoordinatorId(): string {
  return `coord-${Date.now()}-${++coordinatorCounter}`;
}

// =============================================================================
// Coordinate Tool Arguments
// =============================================================================

interface CoordinateToolArgs {
  description: string;
  tasks: Array<{
    id: string;
    description: string;
    prompt: string;
    agent_type?: string;
    dependencies?: string[];
    priority?: number;
    metadata?: Record<string, unknown>;
  }>;
  max_concurrency?: number;
  require_confirmation?: boolean;
  worker_model?: string;
}

// =============================================================================
// Tool Factory
// =============================================================================

/**
 * Create the coordinate tool for multi-agent orchestration
 */
export function createCoordinateTool(deps: CoordinateToolDeps): Tool {
  return {
    name: 'coordinate',

    description: `Orchestrate multiple SubAgents to work on related tasks in parallel with dependency management.

Use this when you have multiple tasks that benefit from parallel execution with coordination.
Tasks can have dependencies — a task won't start until its dependencies complete.
The coordinator manages the full workflow: plan → optional user confirmation → execute → done.

## When to Use
- Multiple interdependent creative tasks (e.g., generate scenes then arrange on timeline)
- Parallel generation with quality verification
- Multi-step pipeline with dependency chain

## When NOT to Use
- Single task (use 'task' tool instead)
- Independent parallel tasks without dependencies (use multiple 'task' calls)

## Task Dependencies
Use the 'dependencies' field to specify task IDs that must complete first.
Dependency results are automatically passed to dependent tasks as context.`,

    parameters: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Workflow description',
        },
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Unique task ID (used for dependency references)',
              },
              description: {
                type: 'string',
                description: 'Short task description',
              },
              prompt: {
                type: 'string',
                description: 'Detailed task prompt for the SubAgent',
              },
              agent_type: {
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
                description: 'Agent type (default: general)',
              },
              dependencies: {
                type: 'array',
                items: { type: 'string' },
                description: 'Task IDs that must complete before this task starts',
              },
              priority: {
                type: 'number',
                description: 'Priority (higher = dispatched sooner, default: 0)',
              },
              metadata: {
                type: 'object',
                description: 'Arbitrary metadata (style, quality_tier, etc.)',
              },
            },
            required: ['id', 'description', 'prompt'],
          },
          description: 'Tasks to coordinate',
        },
        max_concurrency: {
          type: 'number',
          description: 'Max concurrent SubAgents (default: 3)',
        },
        require_confirmation: {
          type: 'boolean',
          description: 'Require user confirmation before execution (default: true)',
        },
        worker_model: {
          type: 'string',
          enum: ['fast', 'balanced', 'powerful'],
          description: 'Model tier for worker SubAgents (default: balanced)',
        },
      },
      required: ['description', 'tasks'],
    },

    category: 'system' as ToolCategory,
    requiresConfirmation: false,
    isConcurrencySafe: false,
    isReadOnly: false,

    async execute(
      args: Record<string, unknown>,
      options?: ToolExecuteOptions,
    ): Promise<ToolResult> {
      const typedArgs = args as unknown as CoordinateToolArgs;
      const { description, tasks, max_concurrency, require_confirmation, worker_model } = typedArgs;

      if (!description || !tasks || tasks.length === 0) {
        return {
          success: false,
          error: 'Missing required arguments: description and at least one task',
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
          error: 'Missing conversationId for coordinate tool',
        };
      }
      const parentAgentId =
        typeof metadata.parentAgentId === 'string' && metadata.parentAgentId.length > 0
          ? metadata.parentAgentId
          : `agent-${conversationId}`;

      // Convert tool args to TaskItems
      const taskItems: Omit<TaskItem, 'status'>[] = tasks.map((t) => ({
        id: t.id,
        description: t.description,
        prompt: t.prompt,
        agentType: (t.agent_type ?? 'general') as SpecializedAgentType,
        dependencies: t.dependencies,
        priority: t.priority,
        metadata: t.metadata,
      }));

      const coordinator = new Coordinator(
        {
          id: generateCoordinatorId(),
          description,
          tasks: taskItems,
          maxConcurrency: max_concurrency,
          requireConfirmation: require_confirmation,
          workerModelTier: worker_model as 'fast' | 'balanced' | 'powerful' | undefined,
        },
        {
          subAgentManager: deps.subAgentManager,
          contextBridge: deps.contextBridge,
          parentAgentId,
          conversationId,
        },
      );

      try {
        // Collect all events (foreground execution)
        const events: CoordinatorEvent[] = [];
        for await (const event of coordinator.start()) {
          events.push(event);

          // Auto-confirm for now (confirmation UI handled at session level)
          if (event.type === 'confirmation_required') {
            coordinator.confirm(true);
          }
        }

        const results = coordinator.getResults();
        const progress = coordinator.getProgress();

        return {
          success: progress.failed === 0,
          data: {
            coordinatorId: coordinator.id,
            progress,
            results: results.map((r) => ({
              taskId: r.taskId,
              status: r.status,
              response: r.result?.response,
              error: r.error,
            })),
            events: events
              .filter((e) => e.type === 'phase_changed' || e.type === 'coordinator_done')
              .map((e) => ({ type: e.type, phase: e.phase, summary: e.summary })),
          },
          error: progress.failed > 0 ? `${progress.failed} task(s) failed` : undefined,
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
