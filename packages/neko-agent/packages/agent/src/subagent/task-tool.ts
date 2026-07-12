/**
 * Task Tools - Tools for spawning and managing SubAgents
 *
 * Provides:
 * - task: Spawn a SubAgent for complex tasks
 * - task_output: Get results from background SubAgents
 */

import {
  deriveAgentTraceContext,
  requireToolExecutionRunScope,
  withAgentTrace,
  type Tool,
  type ToolResult,
  type ToolCategory,
  type ToolExecuteOptions,
} from '@neko/shared';
import type { ChildRunScope } from '@neko-agent/types';
import type {
  ISubAgentManager,
  SubAgentConfig,
  SpecializedAgentType,
  ModelTier,
  TaskToolArgs,
  TaskOutputToolArgs,
} from './types';
import { getLogger } from '../utils/logger';

const logger = getLogger('SubAgentTaskTool');

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

interface SubAgentOwnerScope {
  readonly conversationId: string;
  readonly runId: string;
  readonly parentRunId: string;
}

function requireSubAgentOwnerScope(options: ToolExecuteOptions | undefined): SubAgentOwnerScope {
  const runScope = requireToolExecutionRunScope(options);
  const parentRunId = readNonEmptyString(options?.metadata?.parentAgentId);
  if (!parentRunId) throw new Error('Missing parentAgentId for SubAgent task');
  return { ...runScope, parentRunId };
}

function createSubAgentScope(owner: SubAgentOwnerScope, childRunId: string): ChildRunScope {
  return { ...owner, childRunId, childKind: 'subagent' };
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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
    localization: {
      zh: {
        description: `启动一个 SubAgent，自主处理复杂的多步骤任务。

每个 SubAgent 都会在隔离上下文中运行自己的 ReAct 循环，中间过程不会污染主对话。

## 何时使用 SubAgent
- 任务需要跨大量文件搜索/阅读
- 多个独立子任务可以并行执行
- 任务需要多步推理
- 主对话上下文很长，需要将工作拆出去

## 何时不要使用 SubAgent
- 单步操作
- 与当前对话上下文高度耦合的任务
- 对成本敏感的简单查询

## 类型选择
- code-search：查找实现、追踪依赖、分析模式
- file-explorer：导航目录结构
- test-runner：执行并分析测试
- document-writer：创建或更新文档
- general：需要所有工具的复杂任务`,
        parameters: {
          description: '简短任务描述，通常 3 到 5 个词。',
          prompt: '给 SubAgent 的详细任务说明。',
          subagent_type:
            'SubAgent 预设类型。内建类型包括 code-search、file-explorer、test-runner、document-writer、general 和 npc-character；宿主可以贡献更多预设类型。',
          preset_options: '传递给宿主贡献预设的自定义选项。',
          run_in_background: '是否在后台运行且不阻塞主 Agent，默认 false。',
          model: '由运行时或平台配置解析的模型档位：fast、balanced 或 powerful。',
          resume: '要恢复或查询状态的 SubAgent ID。',
          skills: '要注入 SubAgent 的技能名称列表。',
          inherit_parent_skills: '是否继承父 Agent 的当前激活技能，默认 false。',
          tool_skills: '要为 SubAgent 激活的 ToolSkill 名称列表。',
          inherit_parent_tool_skills: '是否继承父 Agent 的当前激活 ToolSkills，默认 false。',
        },
      },
    },

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
          description:
            'SubAgent preset type. Built-in types include code-search, file-explorer, test-runner, document-writer, general, and npc-character; hosts may contribute additional preset types.',
        },
        preset_options: {
          type: 'object',
          description: 'Host-defined options passed through to contributed SubAgent presets.',
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
      const trace = deriveAgentTraceContext(options?.trace, { phase: 'subagent' });
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
        preset_options,
      } = typedArgs;

      let owner: SubAgentOwnerScope;
      try {
        owner = requireSubAgentOwnerScope(options);
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }

      // Handle resume case
      if (resume) {
        logger.debug(
          'neko.agent.subagent.resume.request',
          withAgentTrace(trace, { subAgentId: resume }),
        );
        const resumeScope = createSubAgentScope(owner, resume);
        const status = subAgentManager.getStatus(resumeScope);
        if (!status) {
          return {
            success: false,
            error: `SubAgent not found: ${resume}`,
          };
        }

        if (status === 'running') {
          // Wait for result
          try {
            const result = await subAgentManager.getResult(resumeScope);
            return {
              success: result.status === 'completed',
              data: { ...result, scope: resumeScope, subAgentId: resume },
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
          data: { scope: resumeScope, status, id: resume, subAgentId: resume },
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
      const locale = readNonEmptyString(metadata.locale);
      const parentId = owner.parentRunId;
      const parentMessageId = readNonEmptyString(metadata.parentMessageId);
      const parentToolCallId = readNonEmptyString(metadata.parentToolCallId);

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
        ...(locale ? { locale } : {}),
        // Skill & ToolSkill injection
        skills,
        inheritParentSkills: inherit_parent_skills,
        toolSkills: tool_skills,
        inheritParentToolSkills: inherit_parent_tool_skills,
        presetOptions: preset_options,
      };

      try {
        logger.debug(
          'neko.agent.subagent.spawn.request',
          withAgentTrace(trace, {
            parentAgentId: parentId,
            subagentType: config.type,
            runMode: config.runMode,
            modelTier: config.modelTier,
            inheritContext: config.inheritContext === true,
          }),
        );
        const scope = createSubAgentScope(owner, config.id);
        await subAgentManager.spawn(scope, config);
        const subAgentId = scope.childRunId;
        const resultMetadata = buildSubAgentToolResultMetadata(parentId, config);
        logger.debug(
          'neko.agent.subagent.spawned',
          withAgentTrace(trace, {
            parentAgentId: parentId,
            subAgentId,
            subagentType: config.type,
            runMode: config.runMode,
          }),
        );

        if (run_in_background) {
          return {
            success: true,
            data: {
              scope,
              subAgentId,
              ...resultMetadata,
              status: 'running',
              message: 'SubAgent started in background. Use task_output to get results.',
            },
          };
        }

        // Foreground mode: wait for result
        const result = await subAgentManager.getResult(scope);
        logger.debug(
          'neko.agent.subagent.completed',
          withAgentTrace(trace, {
            parentAgentId: parentId,
            subAgentId,
            status: result.status,
            duration: result.duration,
            iterations: result.iterations,
          }),
        );
        return {
          success: result.status === 'completed',
          data: {
            ...resultMetadata,
            ...result,
            scope,
            subAgentId,
            continuation: buildSubAgentResultContinuationSummary(subAgentId, result),
          },
          error: result.error,
        };
      } catch (error) {
        logger.debug(
          'neko.agent.subagent.failed',
          withAgentTrace(trace, {
            error: error instanceof Error ? error.message : String(error),
          }),
        );
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
    localization: {
      zh: {
        description: `获取后台 SubAgent 任务的输出。

- block=true（默认）：等待 SubAgent 完成并返回完整结果
- block=false：非阻塞查询，只返回当前状态
- 在使用 run_in_background: true 启动 SubAgent 后调用`,
        parameters: {
          task_id: 'SubAgent 任务 ID。',
          block: '是否等待任务完成，默认 true。',
          timeout: '最大等待时间，单位毫秒，默认 30000。',
        },
      },
    },

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

    async execute(
      args: Record<string, unknown>,
      options?: ToolExecuteOptions,
    ): Promise<ToolResult> {
      const trace = deriveAgentTraceContext(options?.trace, { phase: 'subagent' });
      const typedArgs = args as unknown as TaskOutputToolArgs;
      const { task_id, block = true, timeout = 30000 } = typedArgs;

      if (!task_id) {
        return {
          success: false,
          error: 'Missing required argument: task_id',
        };
      }

      let scope: ChildRunScope;
      try {
        scope = createSubAgentScope(requireSubAgentOwnerScope(options), task_id);
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }

      const status = subAgentManager.getStatus(scope);
      if (!status) {
        logger.debug(
          'neko.agent.subagent.output.missing',
          withAgentTrace(trace, { subAgentId: task_id }),
        );
        return {
          success: false,
          error: `SubAgent not found: ${task_id}`,
        };
      }

      // Non-blocking mode
      if (!block && status === 'running') {
        logger.debug(
          'neko.agent.subagent.output.pending',
          withAgentTrace(trace, {
            subAgentId: task_id,
            status,
            block,
          }),
        );
        return {
          success: true,
          data: {
            scope,
            status: 'running',
            taskId: task_id,
            subAgentId: task_id,
            message: 'Task is still running',
          },
        };
      }

      // Blocking mode or task already complete
      try {
        const result = await subAgentManager.getResult(scope, timeout);
        logger.debug(
          'neko.agent.subagent.output.result',
          withAgentTrace(trace, {
            subAgentId: task_id,
            status: result.status,
            block,
            duration: result.duration,
            iterations: result.iterations,
          }),
        );
        return {
          success: result.status === 'completed',
          data: {
            ...result,
            scope,
            subAgentId: task_id,
            continuation: buildSubAgentResultContinuationSummary(task_id, result),
          },
          error: result.error,
        };
      } catch (error) {
        logger.debug(
          'neko.agent.subagent.output.failed',
          withAgentTrace(trace, {
            subAgentId: task_id,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

function buildSubAgentResultContinuationSummary(
  subAgentId: string,
  result: import('./types').SubAgentResult,
): Record<string, unknown> {
  return {
    source: 'subagent-result-continuation',
    subagentId: subAgentId,
    status: result.status,
    ...(result.response ? { summary: result.response } : {}),
    ...(result.error ? { issues: [result.error] } : {}),
    ...(result.duration !== undefined ? { duration: result.duration } : {}),
    ...(result.iterations !== undefined ? { iterations: result.iterations } : {}),
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
