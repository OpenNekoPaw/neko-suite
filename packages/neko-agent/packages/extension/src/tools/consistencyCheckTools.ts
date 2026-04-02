/**
 * Consistency Check Tools — Cross-scene visual consistency evaluation
 *
 * Factory creates the QualityCheckConsistency tool that wraps ConsistencyEvaluator.
 * Follows the same deps-injection + factory pattern as qualityCheckTools.
 */

import {
  createConsistencyEvaluator,
  type ConsistencyInput,
  type CharacterRef,
  type ConsistencyContext,
  type IClipScorer,
} from '@neko/agent/validation';
import type { Tool } from './extensionTools';
import { getLogger } from '../base';

const logger = getLogger('ConsistencyCheckTools');

// =============================================================================
// Interfaces (same shapes as qualityCheckTools for consistency)
// =============================================================================

interface ILLMService {
  chat(
    messages: unknown[],
    options?: { maxTokens?: number },
  ): Promise<{ message: { content: string | unknown[] } }>;
}

/** Frame extractor for video scene support */
export interface IFrameExtractor {
  extractFrame(source: string, time: number): Promise<string | null>;
  probe(source: string): Promise<{ duration: number; fps: number; width: number; height: number }>;
}

// =============================================================================
// Dependencies
// =============================================================================

export interface ConsistencyCheckToolsDeps {
  /** Creates an LLM service instance for multimodal chat */
  createService: () => ILLMService;
  /** Optional CLIP scorer for fast-screen layer */
  clipScorer?: IClipScorer;
  /** Optional frame extractor for video scene support */
  frameExtractor?: IFrameExtractor;
}

// =============================================================================
// Tool Factory
// =============================================================================

export function createConsistencyCheckTools(deps: ConsistencyCheckToolsDeps): Tool[] {
  return [
    {
      name: 'QualityCheckConsistency',
      description:
        'Evaluate cross-scene visual consistency for AI-generated media. ' +
        'Detects style drift between adjacent scenes and tracks character appearance consistency. ' +
        'Uses two-layer evaluation: CLIP fast-screening (when available) + Vision LLM pairwise comparison.',
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

      async execute(args: Record<string, unknown>): Promise<unknown> {
        const scenes = args['scenes'] as Array<{
          sceneIndex: number;
          mediaPath: string;
          prompt: string;
        }>;
        const globalStyle = args['globalStyle'] as string | undefined;
        const characters = args['characters'] as CharacterRef[] | undefined;

        if (!scenes || scenes.length === 0) {
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

        logger.info('QualityCheckConsistency: evaluating', {
          sceneCount: scenes.length,
          hasGlobalStyle: !!globalStyle,
          characterCount: characters?.length ?? 0,
        });

        const evaluator = createConsistencyEvaluator({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cross-package type boundary
          createService: deps.createService as any,
          clipScorer: deps.clipScorer,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cross-package type boundary
          frameExtractor: deps.frameExtractor as any,
        });

        const inputs: ConsistencyInput[] = scenes.map((s) => ({
          sceneIndex: s.sceneIndex,
          mediaPath: s.mediaPath,
          prompt: s.prompt,
        }));

        const context: ConsistencyContext = {
          globalStyle,
          characters,
        };

        const report = await evaluator.evaluate(inputs, context);

        logger.info('QualityCheckConsistency: completed', {
          overallConsistency: report.overallConsistency,
          styleDriftCount: report.styleDrift.length,
          characterCount: report.characterConsistency.length,
          recommendations: report.recommendations.length,
        });

        return { success: true, data: report };
      },
    },
  ];
}
