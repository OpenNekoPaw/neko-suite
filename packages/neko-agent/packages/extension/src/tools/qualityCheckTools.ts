/**
 * Quality Check Tools — Multimodal LLM-based quality evaluation for AI-generated media
 *
 * Uses the Agent's ReAct loop (Path B) instead of a Pipeline ReactiveStage.
 * The tool internally handles the evaluate → optimize prompt → regenerate → re-evaluate
 * loop, returning a structured summary to keep the main Agent context clean.
 *
 * P0: Image evaluation via vision-capable LLM
 * TODO(P1): Video evaluation via frame extraction (neko-engine RenderFrame)
 */

import * as vscode from 'vscode';
import type { Tool } from './extensionTools';
import { getLogger } from '../base';

const logger = getLogger('QualityCheckTools');

// =============================================================================
// Types (inline to avoid cross-package import issues)
// =============================================================================

/** LLM service abstraction — uses `unknown` to avoid cross-package type coupling */
interface ILLMService {
  chat(
    messages: unknown[],
    options?: { maxTokens?: number },
  ): Promise<{ message: { content: string | unknown[] } }>;
}

/** Extract text from LLM response content (string or ContentPart[]) */
function extractTextFromContent(content: string | unknown[]): string {
  if (typeof content === 'string') return content;
  for (const part of content) {
    if (
      typeof part === 'object' &&
      part !== null &&
      'type' in part &&
      (part as { type: string }).type === 'text' &&
      'text' in part
    ) {
      return (part as { text: string }).text;
    }
  }
  return '';
}

/** Media generator (mirrors pipeline IMediaGenerator) */
interface IMediaGenerator {
  generate(
    prompt: string,
    options: MediaGenerateOptions,
  ): Promise<{ path: string; duration?: number }>;
}

interface MediaGenerateOptions {
  type?: 'image' | 'video';
  duration?: number;
  resolution?: string;
  style?: string;
  aspectRatio?: string;
}

// =============================================================================
// Quality Evaluation Types
// =============================================================================

/** Input scene for quality check */
interface SceneInput {
  index: number;
  mediaPath: string;
  prompt: string;
  description?: string;
}

/** Single scene evaluation result */
interface SceneEvaluation {
  index: number;
  score: number;
  passed: boolean;
  issues: string[];
  suggestion: string;
}

/** Final result returned to Agent */
interface QualityCheckResult {
  totalScenes: number;
  passed: number;
  failed: number;
  evaluations: Array<{
    index: number;
    finalScore: number;
    passed: boolean;
    attempts: number;
    issues: string[];
    finalPath: string;
  }>;
}

// =============================================================================
// Dependencies
// =============================================================================

export interface QualityCheckToolsDeps {
  /** Creates an LLM service instance for multimodal chat */
  createService: () => ILLMService;
  /** Media generator for retry regeneration */
  mediaGenerator: IMediaGenerator;
}

// =============================================================================
// Vision Evaluator — Internal multimodal LLM evaluator
// =============================================================================

const EVALUATION_SYSTEM_PROMPT = `You are a visual quality evaluator for AI-generated media.
Evaluate the image against the original generation prompt.

Score 0-100 based on:
- Visual quality (clarity, artifacts, coherence): 40%
- Prompt adherence (matches description): 40%
- Composition and aesthetics: 20%

Return ONLY valid JSON (no markdown fences):
{"score": <number>, "issues": [<string>...], "suggestion": "<improved prompt if score < 60>"}`;

const PROMPT_OPTIMIZATION_SYSTEM_PROMPT = `You are an AI image/video generation prompt engineer.
Given the original prompt and quality issues found, produce an improved prompt.
Focus on fixing the specific issues while preserving the original intent.
Return ONLY the improved prompt text, nothing else. Max 200 words.`;

class VisionEvaluator {
  constructor(private readonly createService: () => ILLMService) {}

  async evaluate(
    mediaPath: string,
    originalPrompt: string,
    description?: string,
  ): Promise<SceneEvaluation & { index: number }> {
    try {
      const base64 = await this.readFileAsBase64(mediaPath);
      const mimeType = this.detectMimeType(mediaPath);

      const service = this.createService();
      const response = await service.chat(
        [
          { role: 'system', content: EVALUATION_SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Original prompt: "${originalPrompt}"${description ? `\nScene description: "${description}"` : ''}`,
              },
              {
                type: 'image',
                imageUrl: `data:${mimeType};base64,${base64}`,
                detail: 'low',
              },
            ],
          },
        ],
        { maxTokens: 500 },
      );

      const text = extractTextFromContent(response.message.content);

      return this.parseEvaluation(text);
    } catch (error) {
      logger.warn('Vision evaluation failed', { mediaPath, error });
      return {
        index: 0,
        score: 0,
        passed: false,
        issues: [`Evaluation failed: ${error instanceof Error ? error.message : String(error)}`],
        suggestion: originalPrompt,
      };
    }
  }

  async optimizePrompt(originalPrompt: string, issues: string[]): Promise<string> {
    try {
      const service = this.createService();
      const response = await service.chat(
        [
          { role: 'system', content: PROMPT_OPTIMIZATION_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Original prompt: "${originalPrompt}"\n\nIssues found:\n${issues.map((i) => `- ${i}`).join('\n')}\n\nProvide an improved prompt:`,
          },
        ],
        { maxTokens: 500 },
      );

      const text = extractTextFromContent(response.message.content);

      return text.trim() || originalPrompt;
    } catch {
      return originalPrompt;
    }
  }

  private parseEvaluation(text: string): SceneEvaluation & { index: number } {
    try {
      const cleaned = text
        .replace(/```json?\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();
      const parsed = JSON.parse(cleaned) as {
        score?: number;
        issues?: string[];
        suggestion?: string;
      };
      return {
        index: 0,
        score: typeof parsed.score === 'number' ? Math.max(0, Math.min(100, parsed.score)) : 0,
        passed: false, // caller sets this based on minScore
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        suggestion: typeof parsed.suggestion === 'string' ? parsed.suggestion : '',
      };
    } catch {
      return {
        index: 0,
        score: 0,
        passed: false,
        issues: ['Failed to parse LLM evaluation response'],
        suggestion: '',
      };
    }
  }

  private async readFileAsBase64(filePath: string): Promise<string> {
    const uri = vscode.Uri.file(filePath);
    const content = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(content).toString('base64');
  }

  private detectMimeType(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    const mimeMap: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      gif: 'image/gif',
    };
    return mimeMap[ext] ?? 'image/png';
  }
}

// =============================================================================
// QualityCheck Tool
// =============================================================================

/**
 * Create quality check tools for AI-generated media evaluation
 */
export function createQualityCheckTools(deps: QualityCheckToolsDeps): Tool[] {
  const evaluator = new VisionEvaluator(deps.createService);

  return [
    {
      name: 'QualityCheck',
      description:
        'Evaluate AI-generated media quality using multimodal LLM vision analysis. ' +
        'Automatically retries low-scoring scenes with optimized prompts. ' +
        'Returns a structured summary of pass/fail results per scene. ' +
        'IMPORTANT: Only use when the user explicitly requests quality checking — ' +
        'each evaluation costs a vision LLM call. Do NOT call automatically after generation.',
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
            description: 'Global visual style for regeneration (e.g., "anime", "cinematic")',
          },
        },
        required: ['scenes'],
      },

      async execute(args: Record<string, unknown>): Promise<unknown> {
        const scenes = args['scenes'] as SceneInput[];
        const maxRetries = (args['maxRetries'] as number | undefined) ?? 2;
        const minScore = (args['minScore'] as number | undefined) ?? 60;
        const style = args['style'] as string | undefined;

        if (!scenes || scenes.length === 0) {
          return {
            success: true,
            data: { totalScenes: 0, passed: 0, failed: 0, evaluations: [] },
          };
        }

        logger.info('Starting quality check', {
          sceneCount: scenes.length,
          maxRetries,
          minScore,
        });

        // Phase 1: Concurrent initial evaluation
        const initialResults = await Promise.allSettled(
          scenes.map(async (scene) => {
            const result = await evaluator.evaluate(
              scene.mediaPath,
              scene.prompt,
              scene.description,
            );
            return { ...result, index: scene.index };
          }),
        );

        // Collect results and identify failures
        const evaluations: QualityCheckResult['evaluations'] = [];
        const needsRetry: Array<{ scene: SceneInput; evaluation: SceneEvaluation }> = [];

        for (let i = 0; i < initialResults.length; i++) {
          const settled = initialResults[i];
          const scene = scenes[i];
          if (!scene) continue;

          if (settled?.status === 'fulfilled') {
            const evalResult = settled.value;
            if (evalResult.score >= minScore) {
              evaluations.push({
                index: scene.index,
                finalScore: evalResult.score,
                passed: true,
                attempts: 1,
                issues: evalResult.issues,
                finalPath: scene.mediaPath,
              });
            } else {
              needsRetry.push({ scene, evaluation: evalResult });
            }
          } else {
            // Evaluation itself failed
            needsRetry.push({
              scene,
              evaluation: {
                index: scene.index,
                score: 0,
                passed: false,
                issues: ['Evaluation failed'],
                suggestion: scene.prompt,
              },
            });
          }
        }

        // Phase 2: Sequential retry for failed scenes
        for (const { scene, evaluation } of needsRetry) {
          let currentPath = scene.mediaPath;
          let currentPrompt = scene.prompt;
          let bestScore = evaluation.score;
          let bestPath = currentPath;
          let bestIssues = evaluation.issues;
          let attempts = 1;

          for (let retry = 0; retry < maxRetries; retry++) {
            try {
              // Optimize prompt based on evaluation feedback
              const optimizedPrompt = await evaluator.optimizePrompt(
                currentPrompt,
                evaluation.issues,
              );

              // Regenerate media
              const result = await deps.mediaGenerator.generate(optimizedPrompt, {
                type: 'image', // TODO(P1): support video
                style,
              });

              currentPath = result.path;
              currentPrompt = optimizedPrompt;

              // Re-evaluate
              const reEval = await evaluator.evaluate(
                currentPath,
                optimizedPrompt,
                scene.description,
              );

              attempts++;

              if (reEval.score > bestScore) {
                bestScore = reEval.score;
                bestPath = currentPath;
                bestIssues = reEval.issues;
              }

              if (reEval.score >= minScore) {
                break; // Passed!
              }
            } catch (error) {
              logger.warn('Retry failed for scene', {
                sceneIndex: scene.index,
                retry,
                error,
              });
              attempts++;
            }
          }

          evaluations.push({
            index: scene.index,
            finalScore: bestScore,
            passed: bestScore >= minScore,
            attempts,
            issues: bestIssues,
            finalPath: bestPath,
          });
        }

        // Sort by scene index
        evaluations.sort((a, b) => a.index - b.index);

        const result: QualityCheckResult = {
          totalScenes: scenes.length,
          passed: evaluations.filter((e) => e.passed).length,
          failed: evaluations.filter((e) => !e.passed).length,
          evaluations,
        };

        logger.info('Quality check complete', {
          total: result.totalScenes,
          passed: result.passed,
          failed: result.failed,
        });

        return {
          success: true,
          data: result,
        };
      },
    },
  ];
}
