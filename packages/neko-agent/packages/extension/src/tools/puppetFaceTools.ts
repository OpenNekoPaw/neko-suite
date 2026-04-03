/**
 * Puppet Face Tools - AI tools for manipulating puppet face parameters
 *
 * Provides three tools for the AI agent:
 *   1. PuppetGenerateParams  — text description → face parameter values
 *   2. PuppetFromImage       — image path → face parameter values
 *   3. PuppetAdjust          — natural language adjustment of current params
 *
 * All tools communicate with the neko-puppet extension via the NekoPuppetAPI
 * and use the standard 32-parameter face template from @neko/shared.
 */

import * as vscode from 'vscode';
import * as fs from 'node:fs';
import type { NekoPuppetAPI, ToolParameters, PuppetFaceParameter } from '@neko/shared';
import {
  PUPPET_FACE_PARAMETERS,
  PUPPET_FACE_CATEGORIES,
  getDefaultPuppetFaceParams,
} from '@neko/shared';
import { getLogger } from '../base';
import type { Tool } from './extensionTools';

const logger = getLogger('PuppetFaceTools');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a human-readable schema description of all face parameters.
 * Included in the LLM prompt so it knows the valid parameter names and ranges.
 */
function buildParameterSchemaPrompt(): string {
  const lines: string[] = ['Available face parameters (id | label | range | default):'];

  let currentCategory = '';
  for (const p of PUPPET_FACE_PARAMETERS) {
    if (p.category !== currentCategory) {
      currentCategory = p.category;
      const meta = PUPPET_FACE_CATEGORIES[p.category];
      lines.push(`\n## ${meta.en} (${meta.zh})`);
    }
    lines.push(`- ${p.id}: "${p.label_en}" [${p.min}, ${p.max}] default=${p.default}`);
  }

  return lines.join('\n');
}

/**
 * Validate and clamp parameter values against the schema.
 * Returns only valid parameter entries with values clamped to [min, max].
 */
function validateAndClampParams(raw: Record<string, unknown>): Record<string, number> {
  const paramMap = new Map<string, PuppetFaceParameter>();
  for (const p of PUPPET_FACE_PARAMETERS) {
    paramMap.set(p.id, p);
  }

  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    const param = paramMap.get(key);
    if (!param) {
      logger.warn(`Ignoring unknown face parameter: ${key}`);
      continue;
    }
    const num = typeof value === 'number' ? value : Number(value);
    if (Number.isNaN(num)) {
      logger.warn(`Ignoring non-numeric value for ${key}: ${String(value)}`);
      continue;
    }
    result[key] = Math.max(param.min, Math.min(param.max, num));
  }
  return result;
}

/**
 * Parse a JSON object from an LLM response string.
 * Handles markdown code fences and bare JSON.
 */
function parseJsonFromLLMResponse(text: string): Record<string, unknown> | null {
  // Strip markdown code fences if present
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const jsonStr = fenceMatch ? fenceMatch[1]!.trim() : text.trim();

  try {
    const parsed: unknown = JSON.parse(jsonStr);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Try to find a JSON object in the text
    const objectMatch = /\{[\s\S]*\}/.exec(jsonStr);
    if (objectMatch) {
      try {
        const parsed: unknown = JSON.parse(objectMatch[0]);
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // Fall through
      }
    }
  }
  return null;
}

const PARAM_SCHEMA_PROMPT = buildParameterSchemaPrompt();

// ── Tool Factory ─────────────────────────────────────────────────────────────

/**
 * Create tools for puppet face parameter manipulation via AI.
 * Returns empty array if the neko-puppet extension is not installed.
 *
 * These tools use `vscode.commands.executeCommand('neko.agent.llm.generate')`
 * to invoke the LLM for structured parameter inference, then apply the results
 * through the NekoPuppetAPI.
 */
export function createPuppetFaceTools(): Tool[] {
  const ext = vscode.extensions.getExtension<NekoPuppetAPI>('neko.neko-puppet');

  if (!ext) {
    logger.info('NekoPuppet extension not found, skipping puppet face tools');
    return [];
  }

  const getAPI = async (): Promise<NekoPuppetAPI> => {
    if (ext.isActive) {
      return ext.exports;
    }
    return ext.activate() as Promise<NekoPuppetAPI>;
  };

  /**
   * Ask the agent's LLM to produce structured face parameters.
   * Uses the registered agent command so we don't depend on platform internals.
   */
  const generateWithLLM = async (systemPrompt: string, userPrompt: string): Promise<string> => {
    const result = await vscode.commands.executeCommand<string>(
      'neko.agent.llm.generate',
      systemPrompt,
      userPrompt,
    );
    if (typeof result !== 'string' || result.length === 0) {
      throw new Error('LLM returned empty response');
    }
    return result;
  };

  return [
    // ─────────────────────────────────────────────────────────────────────────
    // PuppetGenerateParams — text description → face parameter values
    // ─────────────────────────────────────────────────────────────────────────
    {
      name: 'PuppetGenerateParams',
      description:
        'Generate face parameter values for a 2D puppet model from a text description. ' +
        'Analyzes the description (e.g. "anime girl with big eyes and small mouth") and produces ' +
        'appropriate values for the standard 32 face parameters. The generated parameters are ' +
        'automatically applied to the active puppet model.',
      parameters: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description:
              'Text description of the desired face appearance. Can be in Chinese or English. ' +
              'Example: "圆脸大眼的可爱女孩" or "sharp-jawed warrior with narrow eyes"',
          },
          apply: {
            type: 'boolean',
            description:
              'Whether to apply the generated params to the active puppet (default: true)',
          },
        },
        required: ['description'],
      } satisfies ToolParameters,
      execute: async (args) => {
        const description = args.description as string;
        const shouldApply = (args.apply as boolean | undefined) ?? true;

        const systemPrompt =
          'You are a 2D character face parameter expert. Given a text description of a character face, ' +
          'produce a JSON object mapping parameter IDs to numeric values.\n\n' +
          'Rules:\n' +
          '- Only include parameters whose values differ from defaults.\n' +
          "- Values must be within each parameter's [min, max] range.\n" +
          '- Respond ONLY with a JSON object, no explanation.\n\n' +
          PARAM_SCHEMA_PROMPT;

        const userPrompt = `Generate face parameters for: "${description}"`;

        let llmResponse: string;
        try {
          llmResponse = await generateWithLLM(systemPrompt, userPrompt);
        } catch (err) {
          return { error: `LLM generation failed: ${String(err)}` };
        }

        const parsed = parseJsonFromLLMResponse(llmResponse);
        if (!parsed) {
          return { error: 'Failed to parse LLM response as JSON', rawResponse: llmResponse };
        }

        const params = validateAndClampParams(parsed);
        if (Object.keys(params).length === 0) {
          return { error: 'No valid parameters were generated' };
        }

        // Merge with defaults for a full parameter set
        const fullParams = { ...getDefaultPuppetFaceParams(), ...params };

        if (shouldApply) {
          try {
            const api = await getAPI();
            await api.setFaceParams(fullParams);
          } catch (err) {
            return {
              error: `Failed to apply parameters: ${String(err)}`,
              params: fullParams,
            };
          }
        }

        logger.info(
          `PuppetGenerateParams: generated ${Object.keys(params).length} params for "${description.slice(0, 40)}"`,
        );
        return {
          success: true,
          description,
          params: fullParams,
          modifiedCount: Object.keys(params).length,
          applied: shouldApply,
        };
      },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // PuppetFromImage — image path → face parameter values
    // ─────────────────────────────────────────────────────────────────────────
    {
      name: 'PuppetFromImage',
      description:
        'Analyze a reference image of a face/character and generate matching puppet face parameters. ' +
        'The image is encoded and sent to a vision-capable LLM which infers appropriate parameter ' +
        'values. Supports PNG, JPEG, and WebP. The generated parameters are automatically applied ' +
        'to the active puppet model.',
      parameters: {
        type: 'object',
        properties: {
          imagePath: {
            type: 'string',
            description: 'Absolute path to the reference face image (PNG/JPEG/WebP)',
          },
          apply: {
            type: 'boolean',
            description:
              'Whether to apply the inferred params to the active puppet (default: true)',
          },
        },
        required: ['imagePath'],
      } satisfies ToolParameters,
      execute: async (args) => {
        const imagePath = args.imagePath as string;
        const shouldApply = (args.apply as boolean | undefined) ?? true;

        // Read and encode the image
        let imageBase64: string;
        let mimeType: string;
        try {
          if (!fs.existsSync(imagePath)) {
            return { error: `Image file not found: ${imagePath}` };
          }
          const imageBuffer = fs.readFileSync(imagePath);
          imageBase64 = imageBuffer.toString('base64');

          const ext = imagePath.split('.').pop()?.toLowerCase();
          const mimeMap: Record<string, string> = {
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            webp: 'image/webp',
          };
          mimeType = (ext ? mimeMap[ext] : undefined) ?? 'image/png';
        } catch (err) {
          return { error: `Failed to read image: ${String(err)}` };
        }

        const systemPrompt =
          'You are a 2D character face parameter expert with vision capabilities. ' +
          'Given a reference image of a face or character, analyze the facial features ' +
          'and produce a JSON object mapping parameter IDs to numeric values that best ' +
          'reproduce the appearance.\n\n' +
          'Rules:\n' +
          '- Only include parameters whose values differ from defaults.\n' +
          "- Values must be within each parameter's [min, max] range.\n" +
          '- Focus on the most distinctive features of the reference face.\n' +
          '- Respond ONLY with a JSON object, no explanation.\n\n' +
          PARAM_SCHEMA_PROMPT;

        const userPrompt =
          `Analyze the attached face image and generate matching face parameters.\n` +
          `[Image: data:${mimeType};base64,${imageBase64}]`;

        let llmResponse: string;
        try {
          llmResponse = await generateWithLLM(systemPrompt, userPrompt);
        } catch (err) {
          return { error: `LLM vision analysis failed: ${String(err)}` };
        }

        const parsed = parseJsonFromLLMResponse(llmResponse);
        if (!parsed) {
          return { error: 'Failed to parse LLM response as JSON', rawResponse: llmResponse };
        }

        const params = validateAndClampParams(parsed);
        if (Object.keys(params).length === 0) {
          return { error: 'No valid parameters were inferred from the image' };
        }

        const fullParams = { ...getDefaultPuppetFaceParams(), ...params };

        if (shouldApply) {
          try {
            const api = await getAPI();
            await api.setFaceParams(fullParams);
          } catch (err) {
            return {
              error: `Failed to apply parameters: ${String(err)}`,
              params: fullParams,
            };
          }
        }

        logger.info(
          `PuppetFromImage: inferred ${Object.keys(params).length} params from "${imagePath}"`,
        );
        return {
          success: true,
          imagePath,
          params: fullParams,
          modifiedCount: Object.keys(params).length,
          applied: shouldApply,
        };
      },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // PuppetAdjust — natural language instruction + current params → adjusted
    // ─────────────────────────────────────────────────────────────────────────
    {
      name: 'PuppetAdjust',
      description:
        'Adjust puppet face parameters using a natural language instruction. ' +
        'Reads the current parameter values from the active puppet model, sends them along with ' +
        'the instruction to the LLM, and applies the adjusted values. ' +
        'Example: "make the eyes bigger and raise the eyebrows", "嘴角上扬，增加腮红".',
      parameters: {
        type: 'object',
        properties: {
          instruction: {
            type: 'string',
            description:
              'Natural language instruction describing how to adjust the face. ' +
              'Can be in Chinese or English.',
          },
          apply: {
            type: 'boolean',
            description:
              'Whether to apply the adjusted params to the active puppet (default: true)',
          },
        },
        required: ['instruction'],
      } satisfies ToolParameters,
      execute: async (args) => {
        const instruction = args.instruction as string;
        const shouldApply = (args.apply as boolean | undefined) ?? true;

        // Read current parameters from the puppet extension
        let currentParams: Record<string, number>;
        try {
          const api = await getAPI();
          currentParams = api.getCurrentFaceParams();
        } catch (err) {
          return { error: `Failed to read current face params: ${String(err)}` };
        }

        if (Object.keys(currentParams).length === 0) {
          return {
            error:
              'No puppet editor is active or no face parameters are set. Open a puppet model first.',
          };
        }

        const systemPrompt =
          'You are a 2D character face parameter expert. Given the current parameter values and ' +
          'an adjustment instruction, produce a JSON object with the UPDATED parameter values.\n\n' +
          'Rules:\n' +
          '- Include ALL parameters (not just changed ones) so the result is a complete state.\n' +
          "- Values must be within each parameter's [min, max] range.\n" +
          '- Make proportional, natural-looking adjustments.\n' +
          '- Respond ONLY with a JSON object, no explanation.\n\n' +
          PARAM_SCHEMA_PROMPT;

        const currentParamsStr = JSON.stringify(currentParams, null, 2);
        const userPrompt =
          `Current parameters:\n${currentParamsStr}\n\n` +
          `Adjustment instruction: "${instruction}"`;

        let llmResponse: string;
        try {
          llmResponse = await generateWithLLM(systemPrompt, userPrompt);
        } catch (err) {
          return { error: `LLM adjustment failed: ${String(err)}` };
        }

        const parsed = parseJsonFromLLMResponse(llmResponse);
        if (!parsed) {
          return { error: 'Failed to parse LLM response as JSON', rawResponse: llmResponse };
        }

        const adjustedParams = validateAndClampParams(parsed);
        if (Object.keys(adjustedParams).length === 0) {
          return { error: 'No valid parameters in the adjusted result' };
        }

        // Determine which parameters actually changed
        const changes: Record<string, { from: number; to: number }> = {};
        for (const [key, newVal] of Object.entries(adjustedParams)) {
          const oldVal = currentParams[key];
          if (oldVal !== undefined && Math.abs(oldVal - newVal) > 0.001) {
            changes[key] = { from: oldVal, to: newVal };
          }
        }

        if (shouldApply) {
          try {
            const api = await getAPI();
            await api.setFaceParams(adjustedParams);
          } catch (err) {
            return {
              error: `Failed to apply adjusted parameters: ${String(err)}`,
              params: adjustedParams,
            };
          }
        }

        logger.info(
          `PuppetAdjust: ${Object.keys(changes).length} params changed for "${instruction.slice(0, 40)}"`,
        );
        return {
          success: true,
          instruction,
          params: adjustedParams,
          changes,
          changedCount: Object.keys(changes).length,
          applied: shouldApply,
        };
      },
    },
  ];
}
