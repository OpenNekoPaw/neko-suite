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

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

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
- Single task (use the 'subagent' tool instead)
- Independent parallel tasks without dependencies (use multiple 'subagent' calls)

## Task Dependencies
Use the 'dependencies' field to specify task IDs that must complete first.
Dependency results are automatically passed to dependent tasks as context.`,
    localization: {
      zh: {
        description: `编排多个 SubAgent 并行处理相关任务，并管理任务依赖。

当多个任务适合并行执行且需要协调时使用。
任务可以声明依赖；依赖完成前，对应任务不会启动。
协调器负责完整流程：计划、可选用户确认、执行、完成。

## 何时使用
- 多个互相依赖的创意任务
- 并行生成并带质量验证
- 带依赖链的多步骤流程

## 何时不要使用
- 单个任务，请改用 subagent 工具
- 无依赖的独立并行任务，请使用多个 task 调用`,
        parameters: {
          description: '工作流描述。',
          tasks: '要协调的任务列表。',
          'tasks.[].id': '唯一任务 ID，用于依赖引用。',
          'tasks.[].description': '简短任务描述。',
          'tasks.[].prompt': '给 SubAgent 的详细任务提示。',
          'tasks.[].agent_type':
            'SubAgent 预设类型。内建类型包括 code-search、file-explorer、test-runner、document-writer、general 和 npc-character；宿主可以贡献更多预设类型。',
          'tasks.[].dependencies': '必须先完成的任务 ID 列表。',
          'tasks.[].priority': '优先级，数值越高越早调度，默认 0。',
          'tasks.[].metadata': '任务的宿主自定义元数据。',
          max_concurrency: '最大并发 SubAgent 数，默认 3。',
          require_confirmation: '执行前是否需要用户确认，默认 true。',
          worker_model: 'Worker SubAgent 使用的模型档位，默认 balanced。',
        },
      },
    },

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
                description:
                  'SubAgent preset type. Built-in types include code-search, file-explorer, test-runner, document-writer, general, and npc-character; hosts may contribute additional preset types.',
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
                description: 'Arbitrary host-defined metadata for the task.',
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
      const conversationId = readNonEmptyString(metadata.conversationId);
      const traceConversationId = readNonEmptyString(options?.trace?.conversationId);
      if (!conversationId || (traceConversationId && traceConversationId !== conversationId)) {
        return {
          success: false,
          error: 'Missing or mismatched conversationId for coordinate tool',
        };
      }
      const runId = readNonEmptyString(metadata.runId) ?? readNonEmptyString(options?.trace?.runId);
      if (!runId) return { success: false, error: 'Missing runId for coordinate tool' };
      const parentAgentId = readNonEmptyString(metadata.parentAgentId);
      if (!parentAgentId) {
        return { success: false, error: 'Missing parentAgentId for coordinate tool' };
      }
      const locale = readNonEmptyString(metadata.locale);

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
          ...(locale ? { locale } : {}),
        },
        {
          subAgentManager: deps.subAgentManager,
          contextBridge: deps.contextBridge,
          runScope: { conversationId, runId },
          parentRunId: parentAgentId,
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
