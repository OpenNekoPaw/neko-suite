import { createTool, type Tool, type ToolParameterProperty, type ToolResult } from '@neko/shared';
import {
  createConsistencyEvaluator,
  type CharacterRef,
  type ConsistencyContext,
  type ConsistencyInput,
  type ConsistencyEvaluatorDeps,
  type IClipScorer,
} from './consistency-evaluator';
import {
  createMediaQualityRuntime,
  type IAudioAnalyzer,
  type IFrameExtractor,
  type MediaQualityChatModelRef,
  type MediaQualityGenerator,
  type MediaQualityLLMService,
  type MediaQualityLogger,
  type MediaQualitySceneInput,
} from './media-quality-runtime';

export type {
  CharacterRef,
  ConsistencyContext,
  ConsistencyInput,
  IAudioAnalyzer,
  IClipScorer,
  IFrameExtractor,
  MediaQualityGenerator,
  MediaQualityLLMService,
};

export interface QualityCheckToolsDeps {
  createService: () => MediaQualityLLMService;
  mediaGenerator: MediaQualityGenerator;
  readFileAsBase64(filePath: string): Promise<string>;
  chatModel?: MediaQualityChatModelRef;
  locale?: string;
  audioAnalyzer?: IAudioAnalyzer;
  frameExtractor?: IFrameExtractor;
  logger?: MediaQualityLogger;
}

export interface ConsistencyCheckToolsDeps extends ConsistencyEvaluatorDeps {
  logger?: MediaQualityLogger;
}

const QUALITY_TOOL_LOCALIZATION: Record<
  'QualityCheck' | 'QualityRepairCheck' | 'QualityCheckConsistency',
  NonNullable<Tool['localization']>
> = {
  QualityCheck: {
    zh: {
      description:
        '使用多模态视觉 LLM 评估 AI 生成媒体质量，返回结构化问题、问题类别和可执行修复建议。该只读工具不会重新生成媒体；重试和修复由 QualityRepairCheck 处理。仅在用户明确要求质量检查时使用。',
      parameters: {
        scenes: '要评估的场景数组。每个场景包含 index、mediaPath、prompt 和可选 description。',
        'scenes.[].index': '场景索引。',
        'scenes.[].mediaPath': '生成媒体文件路径。',
        'scenes.[].prompt': '生成该媒体时使用的提示词。',
        'scenes.[].description': '可选场景描述，用于评估上下文。',
        'scenes.[].timeRange': '可选时间线范围，单位秒，用于定位质量证据。',
        'scenes.[].timeRange.start': '范围开始时间，单位秒。',
        'scenes.[].timeRange.end': '范围结束时间，单位秒。',
        'scenes.[].start': '未提供 timeRange 时使用的可选开始时间，单位秒。',
        'scenes.[].end': '未提供 timeRange 时使用的可选结束时间，单位秒。',
        'scenes.[].duration': '可选资源本地时长，单位秒。',
        minScore: '最低通过分数，范围 0-100，默认 60。',
        style: '全局视觉风格，用作评估上下文。',
        sceneDialogue: '场景对白，用于剧本一致性评估。',
      },
    },
  },
  QualityRepairCheck: {
    zh: {
      description:
        '评估 AI 生成媒体质量并显式尝试修复失败的图像或视频场景。仅在用户或 Agent 策略批准修复后使用；生成结果会作为修复尝试报告。',
      parameters: {
        scenes: '要评估并可能修复的场景数组。',
        'scenes.[].index': '场景索引。',
        'scenes.[].mediaPath': '生成媒体文件路径。',
        'scenes.[].prompt': '生成该媒体时使用的提示词。',
        'scenes.[].description': '可选场景描述，用于评估上下文。',
        'scenes.[].timeRange': '可选时间线范围，单位秒，用于定位质量证据。',
        'scenes.[].timeRange.start': '范围开始时间，单位秒。',
        'scenes.[].timeRange.end': '范围结束时间，单位秒。',
        'scenes.[].start': '未提供 timeRange 时使用的可选开始时间，单位秒。',
        'scenes.[].end': '未提供 timeRange 时使用的可选结束时间，单位秒。',
        'scenes.[].duration': '可选资源本地时长，单位秒。',
        minScore: '最低通过分数，范围 0-100，默认 60。',
        style: '全局视觉风格，用作评估上下文。',
        sceneDialogue: '场景对白，用于剧本一致性评估。',
        maxRetries: '失败图像或视频场景的显式修复重试次数，默认 1。音频不会重新生成。',
      },
    },
  },
  QualityCheckConsistency: {
    zh: {
      description:
        '评估 AI 生成媒体的跨场景视觉一致性，检测相邻场景的风格漂移，并跟踪角色外观一致性。可使用 CLIP 快速筛查和视觉 LLM 成对比较。',
      parameters: {
        scenes: '要评估一致性的场景列表，至少 2 个。',
        'scenes.[].sceneIndex': '场景在序列中的索引。',
        'scenes.[].mediaPath': '媒体文件路径，可以是图像或视频。',
        'scenes.[].prompt': '该场景使用的生成提示词。',
        globalStyle: '作品的全局风格描述，用于 CLIP 对齐。',
        characters: '要跟踪外观一致性的角色。',
        'characters.[].name': '角色名称或标识。',
        'characters.[].description': '角色外观描述。',
        'characters.[].referenceImagePath': '可选角色参考图路径。',
      },
    },
  },
};

export function createQualityCheckTools(deps: QualityCheckToolsDeps): Tool[] {
  const runtime = createMediaQualityRuntime(deps);
  const sharedParameters = createQualityCheckParameterSchema();

  return [
    createTool({
      name: 'QualityCheck',
      description:
        'Evaluate AI-generated media quality using multimodal LLM vision analysis. ' +
        'Returns structured issues with categories (artifact, prompt-mismatch, style-drift, etc.) ' +
        'and remediation actions mapped to existing tools (AddEffect, SetColorCorrection, etc.). ' +
        'This read-only tool never regenerates media; retry and repair are handled by QualityRepairCheck. ' +
        'IMPORTANT: Only use when the user explicitly requests quality checking - ' +
        'each evaluation costs a vision LLM call. Do NOT call automatically after generation.',
      localization: QUALITY_TOOL_LOCALIZATION.QualityCheck,
      category: 'analysis',
      isReadOnly: true,
      isConcurrencySafe: false,
      parameters: sharedParameters.analysis,
      execute: async (args) => {
        const scenes = readQualityScenes(args['scenes']);

        const data = await runtime.evaluate({
          scenes,
          maxRetries: 0,
          minScore: typeof args['minScore'] === 'number' ? args['minScore'] : undefined,
          style: typeof args['style'] === 'string' ? args['style'] : undefined,
          sceneDialogue: readStringArray(args['sceneDialogue']),
        });

        return { success: true, data };
      },
    }),
    createTool({
      name: 'QualityRepairCheck',
      description:
        'Evaluate AI-generated media quality and explicitly attempt repair by regenerating failed image/video scenes. ' +
        'Use only after the user or Agent policy approves repair; generated media is reported as a repair attempt, not read-only analysis.',
      localization: QUALITY_TOOL_LOCALIZATION.QualityRepairCheck,
      category: 'generation',
      requiresConfirmation: true,
      isReadOnly: false,
      isConcurrencySafe: false,
      parameters: sharedParameters.repair,
      execute: async (args) => {
        const scenes = readQualityScenes(args['scenes']);
        const maxRetries = readNonNegativeInteger(args['maxRetries']) ?? 1;

        const data = await runtime.evaluate({
          scenes,
          maxRetries,
          minScore: typeof args['minScore'] === 'number' ? args['minScore'] : undefined,
          style: typeof args['style'] === 'string' ? args['style'] : undefined,
          sceneDialogue: readStringArray(args['sceneDialogue']),
        });

        return { success: true, data };
      },
    }),
  ];
}

function createQualityCheckParameterSchema(): {
  readonly analysis: Tool['parameters'];
  readonly repair: Tool['parameters'];
} {
  const sceneArray: ToolParameterProperty = {
    type: 'array',
    description:
      'Array of scenes to evaluate. Each scene has: index (number), ' +
      'mediaPath (file path), prompt (generation prompt), description (optional scene description)',
    items: {
      type: 'object',
      properties: {
        index: { type: 'number', description: 'Scene index' },
        mediaPath: { type: 'string', description: 'Path to generated media file' },
        prompt: { type: 'string', description: 'Prompt used for generation' },
        description: { type: 'string', description: 'Scene description for context' },
        timeRange: {
          type: 'object',
          description: 'Optional timeline range in seconds used to localize quality evidence.',
          properties: {
            start: { type: 'number', description: 'Range start in seconds' },
            end: { type: 'number', description: 'Range end in seconds' },
          },
          required: ['start', 'end'],
        },
        start: {
          type: 'number',
          description: 'Optional timeline start in seconds when timeRange is not provided.',
        },
        end: {
          type: 'number',
          description: 'Optional timeline end in seconds when timeRange is not provided.',
        },
        duration: {
          type: 'number',
          description:
            'Optional asset-local duration in seconds. Without start/end, evidence uses a 0-based asset range.',
        },
      },
      required: ['index', 'mediaPath', 'prompt'],
    },
  };
  const common: Record<string, ToolParameterProperty> = {
    scenes: sceneArray,
    minScore: {
      type: 'number',
      description: 'Minimum passing score 0-100 (default: 60)',
    },
    style: {
      type: 'string',
      description: 'Global visual style for evaluation context (e.g., "anime", "cinematic")',
    },
    sceneDialogue: {
      type: 'array',
      items: { type: 'string' },
      description: 'Scene dialogue lines for script adherence evaluation',
    },
  };

  return {
    analysis: {
      type: 'object',
      properties: {
        ...common,
      },
      required: ['scenes'],
    },
    repair: {
      type: 'object',
      properties: {
        ...common,
        maxRetries: {
          type: 'number',
          description:
            'Explicit repair retry count for failed image/video scenes (default: 1). Audio never regenerates.',
        },
      },
      required: ['scenes'],
    },
  };
}

export function createConsistencyCheckTools(deps: ConsistencyCheckToolsDeps): Tool[] {
  return [
    createTool({
      name: 'QualityCheckConsistency',
      description:
        'Evaluate cross-scene visual consistency for AI-generated media. ' +
        'Detects style drift between adjacent scenes and tracks character appearance consistency. ' +
        'Uses two-layer evaluation: CLIP fast-screening (when available) + Vision LLM pairwise comparison.',
      localization: QUALITY_TOOL_LOCALIZATION.QualityCheckConsistency,
      category: 'analysis',
      isReadOnly: true,
      isConcurrencySafe: false,
      parameters: {
        type: 'object',
        properties: {
          scenes: {
            type: 'array',
            description: 'Scenes to evaluate for consistency (minimum 2)',
            items: {
              type: 'object',
              properties: {
                sceneIndex: { type: 'number', description: 'Scene index in the sequence' },
                mediaPath: {
                  type: 'string',
                  description: 'Path to the media file (image or video)',
                },
                prompt: { type: 'string', description: 'Generation prompt used for this scene' },
              },
              required: ['sceneIndex', 'mediaPath', 'prompt'],
            },
          },
          globalStyle: {
            type: 'string',
            description: 'Global style description for the production (used for CLIP alignment)',
          },
          characters: {
            type: 'array',
            description: 'Characters to track for appearance consistency',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Character name or identifier' },
                description: { type: 'string', description: 'Character appearance description' },
                referenceImagePath: {
                  type: 'string',
                  description: 'Optional reference image path for the character',
                },
              },
              required: ['name', 'description'],
            },
          },
        },
        required: ['scenes'],
      },
      execute: async (args) => executeConsistencyCheck(deps, args),
    }),
  ];
}

async function executeConsistencyCheck(
  deps: ConsistencyCheckToolsDeps,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const scenes = readConsistencyScenes(args['scenes']);
  const globalStyle = typeof args['globalStyle'] === 'string' ? args['globalStyle'] : undefined;
  const characters = readCharacters(args['characters']);

  if (scenes.length === 0) {
    return {
      success: true,
      data: {
        overallConsistency: 100,
        styleDrift: [],
        characterConsistency: [],
        aestheticScore: 100,
        recommendations: [],
      },
    };
  }

  deps.logger?.info('QualityCheckConsistency: evaluating', {
    sceneCount: scenes.length,
    hasGlobalStyle: Boolean(globalStyle),
    characterCount: characters.length,
  });

  const evaluator = createConsistencyEvaluator({
    createService: deps.createService,
    ...(deps.chatModel ? { chatModel: deps.chatModel } : {}),
    ...(deps.locale ? { locale: deps.locale } : {}),
    ...(deps.clipScorer ? { clipScorer: deps.clipScorer } : {}),
    ...(deps.frameExtractor ? { frameExtractor: deps.frameExtractor } : {}),
  });

  const context: ConsistencyContext = {
    ...(globalStyle !== undefined ? { globalStyle } : {}),
    ...(characters.length > 0 ? { characters } : {}),
  };
  const report = await evaluator.evaluate(scenes, context);

  deps.logger?.info('QualityCheckConsistency: completed', {
    overallConsistency: report.overallConsistency,
    styleDriftCount: report.styleDrift.length,
    characterCount: report.characterConsistency.length,
    recommendations: report.recommendations.length,
  });

  return { success: true, data: report };
}

function readQualityScenes(value: unknown): MediaQualitySceneInput[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isMediaQualitySceneInput);
}

function readConsistencyScenes(value: unknown): ConsistencyInput[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isConsistencyInput);
}

function readCharacters(value: unknown): CharacterRef[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isCharacterRef);
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === 'string');
  return strings.length > 0 ? strings : undefined;
}

function readNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.floor(value));
}

function isMediaQualitySceneInput(value: unknown): value is MediaQualitySceneInput {
  if (!isRecord(value)) return false;
  return (
    typeof value['index'] === 'number' &&
    Number.isFinite(value['index']) &&
    typeof value['mediaPath'] === 'string' &&
    typeof value['prompt'] === 'string' &&
    (value['description'] === undefined || typeof value['description'] === 'string')
  );
}

function isConsistencyInput(value: unknown): value is ConsistencyInput {
  if (!isRecord(value)) return false;
  return (
    typeof value['sceneIndex'] === 'number' &&
    Number.isFinite(value['sceneIndex']) &&
    typeof value['mediaPath'] === 'string' &&
    typeof value['prompt'] === 'string'
  );
}

function isCharacterRef(value: unknown): value is CharacterRef {
  if (!isRecord(value)) return false;
  return (
    typeof value['name'] === 'string' &&
    typeof value['description'] === 'string' &&
    (value['referenceImagePath'] === undefined || typeof value['referenceImagePath'] === 'string')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
