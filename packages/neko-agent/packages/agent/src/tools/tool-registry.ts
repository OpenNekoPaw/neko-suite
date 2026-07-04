/**
 * Tool Registry — Tool execution dispatch (one of four registries in agent)
 *
 * Responsibility: Register tools by name, dispatch execution, produce LLM tool definitions.
 * This is the ONLY registry that actually executes tools.
 *
 * Registry landscape:
 * - ToolRegistry (this)       → execution dispatch (register/execute/toToolDefinitions)
 * - ToolCategoryRegistry      → functional categorization + injection layer assignment
 * - ToolGroupRegistry (skill) → semantic ToolSet grouping for LLM-driven discovery
 * - SkillRegistry (skill)     → Skill + SlashCommand storage and lifecycle
 */

import type {
  Tool,
  ToolCategory,
  ToolResult,
  ToolExecuteOptions,
  ToolExecutionConfig,
  ToolFilterOptions,
  ToolDefinitionProjectionOptions,
  IToolRegistry,
} from '@neko/shared';
import { deriveAgentTraceContext, withAgentTrace } from '@neko/shared';
import { AgentError } from '../errors';
import { getLogger } from '../utils/logger';
import { validateSchema, formatValidationErrors } from './schema-validator';

const logger = getLogger('ToolRegistry');

/**
 * Default tool execution config
 */
const DEFAULT_EXECUTION_CONFIG: ToolExecutionConfig = {
  timeout: 30000,
  retry: {
    maxRetries: 0,
    retryableErrors: [],
  },
};

/**
 * Tool Registry implementation
 */
export class ToolRegistry implements IToolRegistry {
  /** Registered tools by name */
  private tools: Map<string, Tool> = new Map();
  /** Per-tool execution configs */
  private executionConfigs: Map<string, ToolExecutionConfig> = new Map();

  /**
   * Register a tool
   *
   * @param tool Tool to register
   * @throws Error if tool with same name already exists
   */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      logger.warn('Tool already registered, overwriting', { toolName: tool.name });
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Unregister a tool by name
   *
   * @param name Tool name to unregister
   */
  unregister(name: string): void {
    this.tools.delete(name);
    this.executionConfigs.delete(name);
  }

  /**
   * Get tool by name
   *
   * @param name Tool name
   * @returns Tool or undefined if not found
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool exists
   *
   * @param name Tool name
   * @returns true if tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * List all registered tools
   *
   * @returns Array of all tools
   */
  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * List tools by category
   *
   * @param category Tool category to filter by
   * @returns Array of tools in category
   */
  listByCategory(category: ToolCategory): Tool[] {
    return this.list().filter((tool) => tool.category === category);
  }

  /**
   * Execute a tool by name
   *
   * @param name Tool name
   * @param args Tool arguments
   * @returns Tool execution result
   */
  async execute(
    name: string,
    args: Record<string, unknown>,
    options?: ToolExecuteOptions,
  ): Promise<ToolResult> {
    const normalizedArgs = normalizeToolArguments(args);
    const requestId = createToolExecutionRequestId();
    const startedAt = Date.now();
    const logger = getToolRegistryLogger();
    const trace = deriveAgentTraceContext(options?.trace, {
      phase: 'tool',
      toolRequestId: requestId,
    });
    logger.debug('neko.agent.tool.execute.request', {
      ...withAgentTrace(trace, {
        requestId,
        toolName: name,
        argSummary: summarizeRecordShape(normalizedArgs),
        hasOptions: options !== undefined,
        metadataSummary: summarizeRecordShape(options?.metadata),
      }),
    });
    logger.debug('neko.agent.tool.execute.request.raw', {
      ...withAgentTrace(trace, {
        requestId,
        toolName: name,
        args: normalizedArgs,
        options: summarizeToolExecuteOptionsForDebug(options),
      }),
    });

    const tool = this.get(name);

    if (!tool) {
      logger.warn('neko.agent.tool.execute.failed', {
        ...withAgentTrace(trace, {
          requestId,
          toolName: name,
          durationMs: Date.now() - startedAt,
          reason: 'not-found',
        }),
      });
      return {
        success: false,
        error: `Tool not found: ${name}`,
      };
    }

    // Schema validation: catch parameter errors before execution
    if (tool.parameters) {
      const validationErrors = validateSchema(normalizedArgs, tool.parameters);
      if (validationErrors.length > 0) {
        logger.warn('neko.agent.tool.execute.failed', {
          ...withAgentTrace(trace, {
            requestId,
            toolName: name,
            category: tool.category,
            durationMs: Date.now() - startedAt,
            reason: 'validation',
            validationErrorCount: validationErrors.length,
            validationErrors,
          }),
        });
        return {
          success: false,
          error: formatValidationErrors(validationErrors),
          validationErrors,
        };
      }
    }

    try {
      const result = await tool.execute(normalizedArgs, options);
      const duration = Date.now() - startedAt;
      const resultWithDuration = {
        ...result,
        duration,
      };

      logger.debug('neko.agent.tool.execute.result', {
        ...withAgentTrace(trace, {
          requestId,
          toolName: name,
          category: tool.category,
          kind: tool.kind,
          durationMs: duration,
          success: resultWithDuration.success,
          resultSummary: summarizeToolResult(resultWithDuration),
        }),
      });
      logger.debug('neko.agent.tool.execute.result.raw', {
        ...withAgentTrace(trace, {
          requestId,
          toolName: name,
          result: resultWithDuration,
        }),
      });

      return resultWithDuration;
    } catch (error) {
      const duration = Date.now() - startedAt;
      logger.warn('neko.agent.tool.execute.failed', {
        ...withAgentTrace(trace, {
          requestId,
          toolName: name,
          category: tool.category,
          kind: tool.kind,
          durationMs: duration,
          reason: 'exception',
          error: summarizeUnknownError(error),
        }),
      });
      if (error instanceof AgentError) {
        return {
          success: false,
          error: error.message,
        };
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Convert tools to LLM tool definitions
   *
   * Returns tools in the format expected by Claude/OpenAI API.
   * Supports filtering by include/exclude lists and categories.
   *
   * @param filter Optional filter to limit which tools are included
   * @returns Array of tool definitions
   */
  toToolDefinitions(
    filter?: ToolFilterOptions,
    options?: ToolDefinitionProjectionOptions,
  ): ReturnType<IToolRegistry['toToolDefinitions']> {
    let tools = this.list();
    const locale = normalizeToolDefinitionLocale(options?.locale);

    if (filter) {
      if (filter.include && filter.include.length > 0) {
        const includeSet = new Set(filter.include);
        tools = tools.filter((tool) => includeSet.has(tool.name));
      }
      if (filter.exclude && filter.exclude.length > 0) {
        const excludeSet = new Set(filter.exclude);
        tools = tools.filter((tool) => !excludeSet.has(tool.name));
      }
      if (filter.categories && filter.categories.length > 0) {
        tools = tools.filter((tool) => filter.categories!.includes(tool.category));
      }
    }

    return tools.map((tool) => {
      const localization = readToolDefinitionLocalization(tool, locale);
      return {
        type: 'function' as const,
        ...(tool.domain ? { domain: tool.domain } : {}),
        ...(tool.safetyKind || tool.targetRequirements || tool.queryBeforeMutate
          ? {
              planning: {
                ...(tool.safetyKind ? { safetyKind: tool.safetyKind } : {}),
                ...(tool.targetRequirements ? { targetRequirements: tool.targetRequirements } : {}),
                ...(tool.queryBeforeMutate ? { queryBeforeMutate: tool.queryBeforeMutate } : {}),
              },
            }
          : {}),
        function: {
          name: tool.name,
          description: localizeToolDescription(tool, localization, locale),
          parameters: toProviderToolParameters(tool.parameters, {
            toolName: tool.name,
            locale,
            localization,
          }),
        },
      };
    });
  }

  /**
   * Set execution config for a tool
   */
  setExecutionConfig(name: string, config: ToolExecutionConfig): void {
    this.executionConfigs.set(name, config);
  }

  /**
   * Get execution config for a tool
   */
  getExecutionConfig(name: string): ToolExecutionConfig {
    return this.executionConfigs.get(name) ?? DEFAULT_EXECUTION_CONFIG;
  }

  /**
   * Get tool count
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.tools.clear();
    this.executionConfigs.clear();
  }

  /**
   * Register multiple tools at once
   *
   * @param tools Array of tools to register
   */
  registerMany(tools: Tool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }
}

let toolExecutionSequence = 0;

function getToolRegistryLogger() {
  return getLogger('ToolRegistry');
}

function createToolExecutionRequestId(now = Date.now()): string {
  toolExecutionSequence =
    toolExecutionSequence >= Number.MAX_SAFE_INTEGER ? 1 : toolExecutionSequence + 1;
  return `tool-${now.toString(36)}-${toolExecutionSequence.toString(36)}`;
}

function summarizeRecordShape(value: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!value) {
    return {
      keyCount: 0,
      keys: [],
    };
  }

  const keys = Object.keys(value);
  return {
    keyCount: keys.length,
    keys,
    fieldTypes: Object.fromEntries(keys.map((key) => [key, summarizeValueType(value[key])])),
  };
}

function summarizeToolExecuteOptionsForDebug(
  options: ToolExecuteOptions | undefined,
): Record<string, unknown> | undefined {
  if (!options) {
    return undefined;
  }

  return {
    hasOnProgress: options.onProgress !== undefined,
    metadata: options.metadata,
  };
}

function summarizeToolResult(result: ToolResult): Record<string, unknown> {
  return {
    hasData: result.data !== undefined,
    dataType: summarizeValueType(result.data),
    errorChars: result.error?.length ?? 0,
    duration: result.duration,
    validationErrorCount: result.validationErrors?.length ?? 0,
    attachmentCount: result.attachments?.length ?? 0,
    perceptionCardCount: result.perceptionCards?.length ?? 0,
    backfillDiagnosticCount: result.backfillDiagnostics?.length ?? 0,
  };
}

function summarizeValueType(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return `array(${value.length})`;
  }
  return typeof value;
}

function summarizeUnknownError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    name: typeof error,
    message: String(error),
  };
}

function normalizeToolArguments(args: Record<string, unknown>): Record<string, unknown> {
  if (Object.keys(args).length !== 1 || typeof args['_raw'] !== 'string') {
    return args;
  }

  try {
    const parsed = JSON.parse(args['_raw']);
    return isPlainRecord(parsed) ? parsed : args;
  } catch {
    return args;
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Create a tool registry instance
 */
export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry();
}

type ToolDefinitionLocale = 'en' | 'zh';

interface ProviderToolParameterProjectionOptions {
  readonly toolName: string;
  readonly locale: ToolDefinitionLocale;
  readonly localization?: ToolDefinitionLocalization;
}

interface ToolDefinitionLocalization {
  readonly description?: string;
  readonly parameters?: Readonly<Record<string, string>>;
}

const ZH_TOOL_DEFINITION_LOCALIZATIONS: Readonly<Record<string, ToolDefinitionLocalization>> = {
  ReadDocument: {
    description: '读取文档文件，返回文本、结构信息和可供 ReadImage 使用的 imageInfo/resourceRef。',
    parameters: {
      source: '文档来源。读取本地文件时使用 { kind: "file", path }，path 可为 ${VAR}/path。',
      mode: '读取模式，例如 manifest、next 或 text。',
      pageRange: '可选页码范围；需要图片证据时优先使用 ReadDocument 返回的 imageInfo。',
      limit: '最多读取的条目数量。',
    },
  },
  ReadImage: {
    description:
      '读取图片内容。EPUB/PDF/CBZ 图片必须使用 ReadDocument.imageInfo 返回的 resourceRef，不能自行拼接路径。',
    parameters: {
      images: '要读取的图片列表。',
      resourceRef: '稳定资源引用，必须来自 ReadDocument.imageInfo 或统一内容访问结果。',
      mode: '读取模式。vision 会请求视觉理解；metadata 只返回尺寸等元数据。',
      analysis: '希望图片分析回答的问题或分析类型。',
    },
  },
  QuerySemanticCoverage: {
    description: '查询文档或资源的语义覆盖情况，用于判断哪些页面/图片已有可用理解结果。',
    parameters: {
      query: '覆盖查询条件。',
      sourceRef: '文档或资源来源引用。',
    },
  },
  Read: {
    description: '读取文件内容并返回带行号的文本。大文件可使用 offset/limit 分段读取。',
    parameters: {
      file_path: '要读取的文件绝对路径。',
      offset: '起始行号，从 1 开始。',
      limit: '最多读取的行数。',
    },
  },
  Write: {
    description: '写入文件内容；必要时创建父目录。仅在用户明确要求修改文件时使用。',
    parameters: {
      file_path: '要写入的文件路径；相对路径按工作区根目录解析。',
      content: '要写入的文本内容。',
      append: '是否追加到文件末尾，而不是覆盖。',
    },
  },
  ListDirectory: {
    description: '列出目录内容，返回文件名、类型和大小。',
    parameters: {
      path: '要列出的目录绝对路径。',
      recursive: '是否递归列出，默认最多 3 层。',
    },
  },
  Grep: {
    description: '使用正则搜索文件内容，返回匹配行、文件路径和行号。',
    parameters: {
      pattern: '用于搜索的正则表达式。',
      path: '要搜索的目录或文件。',
      include: '用于过滤文件的 glob，例如 *.ts 或 *.{ts,tsx}。',
      context: '匹配行前后附带的上下文行数。',
    },
  },
  GetContext: {
    description: '获取当前 Agent 上下文：已激活技能、已注册技能和可用工具分类。',
    parameters: {
      includeTools: '是否包含按分类分组的完整工具列表。',
    },
  },
  ActivateSkill: {
    description:
      '在普通 Agent 理解并确认当前任务需要领域技能后激活技能。不要只靠关键词匹配；调用前先简要说明激活原因。',
    parameters: {
      skillName: '要激活的技能名称。',
      reason: '基于当前对话和已收集上下文的简短原因，说明为什么现在需要该技能。',
    },
  },
  DeactivateSkill: {
    description: '停用当前激活技能，移除其专用指导。',
    parameters: {
      recordId: '可选的生命周期记录 ID。',
      slot: '可选的生命周期槽位。',
      skillName: '可选的技能名称；仅在不会歧义时使用。',
    },
  },
  GenerateImage: {
    description: '根据提示词生成或编辑图片，并返回生成资源信息。',
    parameters: {
      prompt: '图片生成提示词。',
      image: '用于编辑或参考的输入图片。',
      model: '图片模型 ID。',
      size: '输出图片尺寸。',
    },
  },
  GenerateVideo: {
    description: '根据提示词、参考图或关键帧生成/编辑视频片段。',
    parameters: {
      prompt: '视频生成提示词。',
      referenceImage: '可选参考图或首帧。',
      firstFrame: '首帧图片引用。',
      lastFrame: '尾帧图片引用。',
      duration: '视频时长，单位秒。',
      fps: '帧率。',
      aspectRatio: '画幅比例。',
      model: '视频模型 ID。',
    },
  },
  GenerateMusic: {
    description: '根据场景、情绪或风格提示生成音乐。',
    parameters: {
      prompt: '音乐生成提示词。',
      duration: '音乐时长，单位秒。',
      model: '音频模型 ID。',
    },
  },
  GenerateTTS: {
    description: '根据文本和声音配置生成语音。',
    parameters: {
      text: '要朗读的文本。',
      voice: '声音或说话人配置。',
      model: '语音模型 ID。',
    },
  },
  CreateCanvas: {
    description: '创建新的画布。',
    parameters: {
      name: '画布名称。',
      width: '画布宽度，单位像素。',
      height: '画布高度，单位像素。',
      backgroundColor: '背景颜色，使用十六进制颜色值。',
    },
  },
  AddCanvasShape: {
    description: '向画布添加一个基础形状。',
    parameters: {
      canvasId: '画布 ID。',
      type: '形状类型。',
      x: 'X 坐标。',
      y: 'Y 坐标。',
      width: '宽度。',
      height: '高度。',
      fill: '填充颜色。',
      stroke: '描边颜色。',
    },
  },
  canvas_list_nodes: {
    description: '列出当前画布上的节点，可按类型过滤。',
    parameters: {
      type: '可选节点类型过滤条件。',
    },
  },
  canvas_get_node: {
    description: '按节点 ID 读取单个 Canvas 节点的完整信息。',
    parameters: {
      nodeId: 'Canvas 节点 ID。',
    },
  },
  canvas_update_node: {
    description:
      '更新 Canvas 节点的数据字段。生成图片前先把提示词/参数写回节点，保证会话压缩后仍可恢复。',
    parameters: {
      nodeId: 'Canvas 节点 ID。',
      data: '要合并到 node.data 的部分字段。',
    },
  },
  canvas_create_node: {
    description: '在当前画布创建一个新节点，并返回新节点 ID。',
    parameters: {
      type: '节点类型。',
      preset: '可选的 Canvas 预设；优先使用可组合预设以获得稳定渲染和预览 metadata。',
      x: '画布 X 坐标。',
      y: '画布 Y 坐标。',
      data: '节点初始数据。',
    },
  },
  canvas_derive_node: {
    description: '基于已有节点和注册预设派生后继节点，并创建普通 Canvas 连接。',
    parameters: {
      sourceNodeId: '来源 Canvas 节点 ID。',
      targetPreset: '可选目标预设。',
      targetType: '未提供目标预设时使用的目标节点类型。',
      data: '覆盖默认值的可选数据。',
      connect: '是否连接来源和派生节点，默认 true。',
    },
  },
  canvas_create_composite: {
    description: '按容器策略一次性创建容器和子节点，并执行共享自动布局。',
    parameters: {
      containerPreset: '注册的容器预设。',
      x: '容器 X 坐标。',
      y: '容器 Y 坐标。',
      data: '容器默认数据或覆盖值。',
      children: '子节点规格列表。',
      autoLayout: '是否在容器内自动排列子节点，默认 true。',
    },
  },
  canvas_update_block: {
    description: '通过 block 绑定或 node.data JSON Pointer 路径更新可组合 Canvas block。',
    parameters: {
      nodeId: 'Canvas 节点 ID。',
      blockId: '带绑定的可组合 block ID。',
      path: 'node.data 内的 JSON Pointer 路径，例如 /content。',
      value: '新值；对象应传入 JSON 文本。',
    },
  },
  canvas_extract_structured_content: {
    description:
      '从 Canvas 节点提取 JSON、Markdown 或 prompt 文本，保留层级边界并忽略运行时预览状态。',
    parameters: {
      nodeIds: '可选显式节点 ID；省略时使用选择或全部节点。',
      format: '提取格式。',
      includeChildren: '是否递归包含容器子节点。',
    },
  },
  canvas_get_active_context: {
    description:
      '读取紧凑的当前 Canvas 上下文，包括选区、子系统摘要、插入点、视口、焦点容器和可编辑字段。',
    parameters: {
      includeSelection: '是否包含选中节点 ID 和紧凑摘要。',
      includeFocusedContainer: '是否包含焦点容器摘要和子节点约束。',
      includeNodeDetails: '是否包含更丰富的节点摘要；大型媒体数据仍会省略。',
      includeSubsystemMetadata:
        '是否包含 narrative、behavior、entity、memory 子系统的有界 metadata 摘要。',
    },
  },
  canvas_narrative_traverse: {
    description:
      '遍历混合 Canvas 中的 narrative flow 节点；不会遍历 storyboard、behavior、entity 或 memory 节点。',
    parameters: {
      startNodeId: '可选 narrative 起始节点 ID。',
    },
  },
  canvas_apply_agent_content: {
    description:
      '把 Agent 生成的文本、优化提示词或结构化内容应用到 Canvas 节点、容器、字段路径或视口插入点。',
    parameters: {
      kind: '要应用的内容类型。',
      text: 'kind=text 时的文本内容。',
      prompt: 'kind=prompt 时的提示词内容。',
      contentJson: 'kind=structured 时的 JSON 字符串。',
      title: '可选内容标题。',
      format: '内容格式提示。',
      nodeId: '显式 Canvas 节点目标。',
      containerId: '显式 Canvas 容器目标。',
      slotId: '显式 Canvas 槽位目标。',
      fieldPath: 'node.data 内的 JSON Pointer 路径，例如 /generationPrompt。',
      mode: '变更模式；replace/apply 需要显式目标数据。',
      x: '画布插入 X 坐标。',
      y: '画布插入 Y 坐标。',
    },
  },
  canvas_get_storyboard_execution_summary: {
    description:
      '读取 Story/Agent 工作流可用的只读场景/镜头执行摘要，包含稳定场景 ID、镜头数、生成状态和时间线导入 metadata。',
    parameters: {
      sourceScriptUri: '可选源剧本 URI，用于关联导入的 Story 场景。',
      sceneId: '可选 Story 场景 ID。',
      sceneNodeId: '可选 Canvas SceneGroup 节点 ID。',
      canvasFileUri: '可选 Canvas 文件 URI，用于跟踪绑定。',
    },
  },
  canvas_generate_image: {
    description:
      '触发 ShotNode 或 Gallery 子媒体节点的图片生成。调用前先用 canvas_update_node 写入提示词/参数。',
    parameters: {
      nodeId: 'ShotNode 或 GalleryNode ID。',
      childNodeId: 'GalleryNode 的子媒体节点 ID。',
    },
  },
  canvas_generate_batch: {
    description: '批量触发多个镜头节点的图片生成，适合一次生成一个场景内所有镜头。',
    parameters: {
      nodeIds: '要生成图片的 ShotNode ID 列表。',
    },
  },
  set_project_generation_config: {
    description:
      '保存项目级生成参数和模型配置；它们会作为节点默认值。批量生成前应先调用，避免上下文压缩后丢失参数。',
    parameters: {
      imageRatio: '图片画幅比例。',
      imageResolution: '图片分辨率。',
      videoRatio: '视频画幅比例。',
      videoResolution: '视频分辨率。',
      videoDuration: '视频时长，单位秒。',
      videoFps: '视频帧率。',
      imageModel: '图片生成模型 ID。',
      videoModel: '视频生成模型 ID。',
      audioModel: '音频生成模型 ID。',
    },
  },
  export_storyboard: {
    description: '将分镜导出为 ZIP 图片包，或导入到 neko-cut 时间线。',
    parameters: {
      format: '导出格式：zip 或 neko-cut。',
      projectName: '用于文件名和 manifest 的项目名称。',
    },
  },
  canvas_apply_style_transfer: {
    description: '使用 GalleryNode 作为风格参考，对目标 ShotNode 应用风格迁移并触发批量图片生成。',
    parameters: {
      targetNodeIds: '要应用风格迁移的 ShotNode ID 列表。',
      referenceNodeId: '作为 IP-Adapter 风格参考的 GalleryNode ID。',
    },
  },
  import_script_to_canvas: {
    description: '把 Fountain 剧本导入当前 Canvas，生成分镜骨架或语义分镜计划。',
    parameters: {
      path: 'Fountain 剧本文件的绝对路径。',
      mode: '导入模式：mechanical 为启发式骨架，semantic 使用 ScenePlan/ShotPlan。',
      startX: '第一个 SceneGroupNode 的画布 X 坐标。',
      startY: '第一个 SceneGroupNode 的画布 Y 坐标。',
      scenesLimit: '最多导入的场景数量。',
      scenePlans: 'semantic 模式下可选的 ScenePlan/ShotPlan 数组。',
    },
  },
  canvas_generate_video_with_keyframes: {
    description: '使用首帧和尾帧图片作为关键帧，为 ShotNode 生成视频片段。',
    parameters: {
      nodeId: '保存生成视频的目标 ShotNode ID。',
      firstFrameNodeId: '提供首帧图片的 ShotNode ID。',
      lastFrameNodeId: '提供尾帧图片的 ShotNode ID。',
      duration: '视频时长，单位秒。',
      aspectRatio: '画幅比例，例如 16:9 或 9:16。',
    },
  },
  'canvas.ingestMarkdown': {
    description: '将 Markdown 内容作为可审阅草稿导入 Canvas。',
    parameters: {
      markdown: '要导入的 Markdown 内容。',
      intentHint: '内容意图提示。',
      profileHint: '内容 profile 提示。',
      resources: 'Markdown 中引用的资源列表。',
    },
  },
  'canvas.validateMarkdownStoryboard': {
    description: '只读校验 Markdown 分镜内容是否可被 Canvas 接收。',
    parameters: {
      markdown: '要校验的 Markdown 分镜内容。',
      sourceFormat: '来源格式提示。',
    },
  },
};

function toProviderToolParameters(
  toolParameters: Tool['parameters'],
  options: ProviderToolParameterProjectionOptions,
): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...toolParameters };
  delete rest['anyOf'];
  delete rest['oneOf'];
  delete rest['allOf'];
  delete rest['enum'];
  delete rest['not'];

  const parameters = {
    ...rest,
    type: 'object',
    properties: Object.fromEntries(
      Object.entries(toolParameters.properties).map(([name, property]) => [
        name,
        cloneSchemaValue(property),
      ]),
    ),
    ...(toolParameters.required ? { required: [...toolParameters.required] } : {}),
  };

  return localizeToolParameters(parameters, options);
}

function normalizeToolDefinitionLocale(locale: string | undefined): ToolDefinitionLocale {
  return locale?.trim().toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function localizeToolDescription(
  tool: Tool,
  localization: ToolDefinitionLocalization | undefined,
  locale: ToolDefinitionLocale,
): string {
  if (locale === 'en') return localization?.description ?? tool.description;
  return (
    localization?.description ??
    ZH_TOOL_DEFINITION_LOCALIZATIONS[tool.name]?.description ??
    tool.description
  );
}

function localizeToolParameters(
  parameters: Record<string, unknown>,
  options: ProviderToolParameterProjectionOptions,
): Record<string, unknown> {
  const localizedDescriptions =
    options.localization?.parameters ??
    (options.locale === 'zh'
      ? ZH_TOOL_DEFINITION_LOCALIZATIONS[options.toolName]?.parameters
      : undefined);
  if (!localizedDescriptions) return parameters;
  return localizeSchemaDescriptions(parameters, localizedDescriptions, []);
}

function readToolDefinitionLocalization(
  tool: Tool,
  locale: ToolDefinitionLocale,
): ToolDefinitionLocalization | undefined {
  if (!tool.localization) return undefined;
  const localeKeys = locale === 'zh' ? ['zh', 'zh-cn', 'zh-hans'] : ['en', 'en-us'];
  for (const localeKey of localeKeys) {
    const localized = tool.localization[localeKey];
    if (localized) return localized;
  }
  return undefined;
}

function localizeSchemaDescriptions(
  value: Record<string, unknown>,
  descriptions: Readonly<Record<string, string>>,
  path: readonly string[],
): Record<string, unknown> {
  const localized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === 'properties' && isPlainRecord(child)) {
      localized[key] = Object.fromEntries(
        Object.entries(child).map(([propertyName, propertySchema]) => [
          propertyName,
          localizeSchemaProperty(propertySchema, descriptions, [...path, propertyName]),
        ]),
      );
      continue;
    }

    if (key === 'items' && isPlainRecord(child)) {
      localized[key] = localizeSchemaDescriptions(child, descriptions, [...path, '[]']);
      continue;
    }

    localized[key] = child;
  }
  return localized;
}

function localizeSchemaProperty(
  value: unknown,
  descriptions: Readonly<Record<string, string>>,
  path: readonly string[],
): unknown {
  if (!isPlainRecord(value)) return value;
  const localized = localizeSchemaDescriptions(value, descriptions, path);
  const propertyName = path[path.length - 1];
  const description =
    descriptions[path.join('.')] ?? (propertyName ? descriptions[propertyName] : undefined);
  return description ? { ...localized, description } : localized;
}

function cloneSchemaValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneSchemaValue);
  }
  if (!isPlainRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, cloneSchemaValue(child)]),
  );
}
