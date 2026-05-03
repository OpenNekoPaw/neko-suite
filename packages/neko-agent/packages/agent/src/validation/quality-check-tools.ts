import { createTool, type Tool, type ToolResult } from '@neko/shared';
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
  audioAnalyzer?: IAudioAnalyzer;
  frameExtractor?: IFrameExtractor;
  logger?: MediaQualityLogger;
}

export interface ConsistencyCheckToolsDeps extends ConsistencyEvaluatorDeps {
  logger?: MediaQualityLogger;
}

export function createQualityCheckTools(deps: QualityCheckToolsDeps): Tool[] {
  const runtime = createMediaQualityRuntime(deps);

  return [
    createTool({
      name: 'QualityCheck',
      description:
        'Evaluate AI-generated media quality using multimodal LLM vision analysis. ' +
        'Returns structured issues with categories (artifact, prompt-mismatch, style-drift, etc.) ' +
        'and remediation actions mapped to existing tools (AddEffect, SetColorCorrection, etc.). ' +
        'Automatically retries low-scoring scenes with optimized prompts. ' +
        'IMPORTANT: Only use when the user explicitly requests quality checking - ' +
        'each evaluation costs a vision LLM call. Do NOT call automatically after generation.',
      category: 'analysis',
      isReadOnly: true,
      isConcurrencySafe: false,
      parameters: {
        type: 'object',
        properties: {
          scenes: {
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
              },
              required: ['index', 'mediaPath', 'prompt'],
            },
          },
          maxRetries: {
            type: 'number',
            description: 'Maximum retries per failed scene (default: 2)',
          },
          minScore: {
            type: 'number',
            description: 'Minimum passing score 0-100 (default: 60)',
          },
          style: {
            type: 'string',
            description:
              'Global visual style for regeneration and consistency context (e.g., "anime", "cinematic")',
          },
          sceneDialogue: {
            type: 'array',
            items: { type: 'string' },
            description: 'Scene dialogue lines for script adherence evaluation',
          },
        },
        required: ['scenes'],
      },
      execute: async (args) => {
        const scenes = readQualityScenes(args['scenes']);

        const data = await runtime.evaluate({
          scenes,
          maxRetries: typeof args['maxRetries'] === 'number' ? args['maxRetries'] : undefined,
          minScore: typeof args['minScore'] === 'number' ? args['minScore'] : undefined,
          style: typeof args['style'] === 'string' ? args['style'] : undefined,
          sceneDialogue: readStringArray(args['sceneDialogue']),
        });

        return { success: true, data };
      },
    }),
  ];
}

export function createConsistencyCheckTools(deps: ConsistencyCheckToolsDeps): Tool[] {
  return [
    createTool({
      name: 'QualityCheckConsistency',
      description:
        'Evaluate cross-scene visual consistency for AI-generated media. ' +
        'Detects style drift between adjacent scenes and tracks character appearance consistency. ' +
        'Uses two-layer evaluation: CLIP fast-screening (when available) + Vision LLM pairwise comparison.',
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
