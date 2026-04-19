/**
 * NekoPuppet Agent Capability Provider
 *
 * Provides AI-powered face parameter manipulation tools to neko-agent.
 * Tools use LLM inference via `neko.agent.llm.generate` command (no direct platform dependency).
 *
 * Migrated from neko-agent/extension/src/tools/puppetFaceTools.ts
 */

import { promises as fsp } from 'node:fs';
import type {
  AgentCapabilityProvider,
  AgentCapabilityContext,
  Tool,
  ToolParameters,
  NekoPuppetAPI,
  PuppetFaceParameter,
} from '@neko/shared';
import {
  PUPPET_FACE_PARAMETERS,
  PUPPET_FACE_CATEGORIES,
  getDefaultPuppetFaceParams,
} from '@neko/shared';
import * as vscode from 'vscode';

// =============================================================================
// Helpers (migrated from puppetFaceTools.ts)
// =============================================================================

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

/** @internal Exported for testing */
export function validateAndClampParams(raw: Record<string, unknown>): Record<string, number> {
  const paramMap = new Map<string, PuppetFaceParameter>();
  for (const p of PUPPET_FACE_PARAMETERS) {
    paramMap.set(p.id, p);
  }
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    const param = paramMap.get(key);
    if (!param) continue;
    // Only accept number or numeric string — reject boolean, null, empty string, objects
    let num: number;
    if (typeof value === 'number') {
      num = value;
    } else if (typeof value === 'string' && value.trim() !== '') {
      num = Number(value);
    } else {
      continue;
    }
    if (!Number.isFinite(num)) continue;
    result[key] = Math.max(param.min, Math.min(param.max, num));
  }
  return result;
}

/**
 * Try to extract a JSON object from text by scanning each '{' start and each '}'
 * end position. For each '{', try closing at progressively earlier '}' positions
 * so trailing noise braces don't break parsing.
 */
function extractJsonObject(text: string): Record<string, unknown> | null {
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const braceIdx = text.indexOf('{', searchFrom);
    if (braceIdx === -1) break;

    // Try every '}' from the last one backwards until we find valid JSON
    let endPos = text.lastIndexOf('}');
    while (endPos > braceIdx) {
      const candidate = text.slice(braceIdx, endPos + 1);
      try {
        const parsed: unknown = JSON.parse(candidate);
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // Shrink: try the next '}' to the left
      }
      endPos = text.lastIndexOf('}', endPos - 1);
    }

    searchFrom = braceIdx + 1;
  }
  return null;
}

/** @internal Exported for testing */
export function parseJsonFromLLMResponse(text: string): Record<string, unknown> | null {
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const jsonStr = fenceMatch ? fenceMatch[1]!.trim() : text.trim();
  try {
    const parsed: unknown = JSON.parse(jsonStr);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fence content failed — fall back to extracting {...} from the FULL original text,
    // not just the fence content. LLMs often emit a broken fence then a corrected object later.
    const result = extractJsonObject(fenceMatch ? text : jsonStr);
    if (result) return result;
  }
  return null;
}

const PARAM_SCHEMA_PROMPT = buildParameterSchemaPrompt();

async function generateWithLLM(systemPrompt: string, userPrompt: string): Promise<string> {
  const result = await vscode.commands.executeCommand<string>(
    'neko.agent.llm.generate',
    systemPrompt,
    userPrompt,
  );
  if (typeof result !== 'string' || result.length === 0) {
    throw new Error('LLM returned empty response');
  }
  return result;
}

// =============================================================================
// Provider
// =============================================================================

export function createNekoPuppetCapabilityProvider(api: NekoPuppetAPI): AgentCapabilityProvider {
  return new NekoPuppetCapabilityProviderImpl(api);
}

class NekoPuppetCapabilityProviderImpl implements AgentCapabilityProvider {
  readonly id = 'neko-puppet';
  readonly version = '1.0.0';

  constructor(private readonly _api: NekoPuppetAPI) {}

  getTools(_context: AgentCapabilityContext): Tool[] {
    const api = this._api;

    return [
      {
        name: 'PuppetGenerateParams',
        description:
          'Generate face parameter values for a 2D puppet model from a text description. ' +
          'Analyzes the description and produces appropriate values for the standard 32 face parameters. ' +
          'The generated parameters are automatically applied to the active puppet model.',
        category: 'generation',
        parameters: {
          type: 'object',
          properties: {
            description: {
              type: 'string',
              description: 'Text description of the desired face appearance (Chinese or English)',
            },
            apply: {
              type: 'boolean',
              description:
                'Whether to apply the generated params to the active puppet (default: true)',
            },
          },
          required: ['description'],
        } satisfies ToolParameters,
        async execute(args) {
          const description = args.description as string;
          const shouldApply = (args.apply as boolean | undefined) ?? true;

          const systemPrompt =
            'You are a 2D character face parameter expert. Given a text description of a character face, ' +
            'produce a JSON object mapping parameter IDs to numeric values.\n\n' +
            'Rules:\n- Only include parameters whose values differ from defaults.\n' +
            "- Values must be within each parameter's [min, max] range.\n" +
            '- Respond ONLY with a JSON object, no explanation.\n\n' +
            PARAM_SCHEMA_PROMPT;

          let llmResponse: string;
          try {
            llmResponse = await generateWithLLM(
              systemPrompt,
              `Generate face parameters for: "${description}"`,
            );
          } catch (err) {
            return { success: false, error: `LLM generation failed: ${String(err)}` };
          }

          const parsed = parseJsonFromLLMResponse(llmResponse);
          if (!parsed) {
            return { success: false, error: 'Failed to parse LLM response as JSON' };
          }

          const params = validateAndClampParams(parsed);
          if (Object.keys(params).length === 0) {
            return { success: false, error: 'No valid parameters were generated' };
          }

          const fullParams = { ...getDefaultPuppetFaceParams(), ...params };

          if (shouldApply) {
            try {
              await api.setFaceParams(fullParams);
            } catch (err) {
              return {
                success: false,
                error: `Failed to apply parameters: ${String(err)}`,
                data: { params: fullParams },
              };
            }
          }

          return {
            success: true,
            data: {
              params: fullParams,
              modifiedCount: Object.keys(params).length,
              applied: shouldApply,
            },
          };
        },
      },
      {
        name: 'PuppetFromImage',
        description:
          'Analyze a reference image of a face/character and generate matching puppet face parameters. ' +
          'Supports PNG, JPEG, and WebP. The generated parameters are automatically applied.',
        category: 'generation',
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
        async execute(args) {
          const imagePath = args.imagePath as string;
          const shouldApply = (args.apply as boolean | undefined) ?? true;

          let imageBase64: string;
          let mimeType: string;
          try {
            await fsp.access(imagePath);
            const imageBuffer = await fsp.readFile(imagePath);
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
            return { success: false, error: `Failed to read image: ${String(err)}` };
          }

          const systemPrompt =
            'You are a 2D character face parameter expert with vision capabilities. ' +
            'Analyze the reference face image and produce a JSON object mapping parameter IDs to numeric values.\n\n' +
            'Rules:\n- Only include parameters whose values differ from defaults.\n' +
            "- Values must be within each parameter's [min, max] range.\n" +
            '- Respond ONLY with a JSON object, no explanation.\n\n' +
            PARAM_SCHEMA_PROMPT;

          let llmResponse: string;
          try {
            llmResponse = await generateWithLLM(
              systemPrompt,
              `Analyze the attached face image and generate matching face parameters.\n[Image: data:${mimeType};base64,${imageBase64}]`,
            );
          } catch (err) {
            return { success: false, error: `LLM vision analysis failed: ${String(err)}` };
          }

          const parsed = parseJsonFromLLMResponse(llmResponse);
          if (!parsed) {
            return { success: false, error: 'Failed to parse LLM response as JSON' };
          }

          const params = validateAndClampParams(parsed);
          if (Object.keys(params).length === 0) {
            return { success: false, error: 'No valid parameters were inferred from the image' };
          }

          const fullParams = { ...getDefaultPuppetFaceParams(), ...params };

          if (shouldApply) {
            try {
              await api.setFaceParams(fullParams);
            } catch (err) {
              return {
                success: false,
                error: `Failed to apply parameters: ${String(err)}`,
                data: { params: fullParams },
              };
            }
          }

          return {
            success: true,
            data: {
              params: fullParams,
              modifiedCount: Object.keys(params).length,
              applied: shouldApply,
            },
          };
        },
      },
      {
        name: 'PuppetAdjust',
        description:
          'Adjust puppet face parameters using a natural language instruction. ' +
          'Reads current parameter values from the active puppet model, adjusts via LLM, and applies.',
        category: 'generation',
        parameters: {
          type: 'object',
          properties: {
            instruction: {
              type: 'string',
              description: 'Natural language instruction for face adjustment (Chinese or English)',
            },
            apply: {
              type: 'boolean',
              description: 'Whether to apply the adjusted params (default: true)',
            },
          },
          required: ['instruction'],
        } satisfies ToolParameters,
        async execute(args) {
          const instruction = args.instruction as string;
          const shouldApply = (args.apply as boolean | undefined) ?? true;

          const currentParams = api.getCurrentFaceParams();
          if (Object.keys(currentParams).length === 0) {
            return {
              success: false,
              error: 'No puppet editor is active or no face parameters are set',
            };
          }

          const systemPrompt =
            'You are a 2D character face parameter expert. Given current parameter values and ' +
            'an adjustment instruction, produce a JSON object with the UPDATED parameter values.\n\n' +
            'Rules:\n- Include ALL parameters (not just changed ones).\n' +
            "- Values must be within each parameter's [min, max] range.\n" +
            '- Respond ONLY with a JSON object, no explanation.\n\n' +
            PARAM_SCHEMA_PROMPT;

          let llmResponse: string;
          try {
            llmResponse = await generateWithLLM(
              systemPrompt,
              `Current parameters:\n${JSON.stringify(currentParams, null, 2)}\n\nAdjustment: "${instruction}"`,
            );
          } catch (err) {
            return { success: false, error: `LLM adjustment failed: ${String(err)}` };
          }

          const parsed = parseJsonFromLLMResponse(llmResponse);
          if (!parsed) {
            return { success: false, error: 'Failed to parse LLM response as JSON' };
          }

          const adjustedParams = validateAndClampParams(parsed);
          if (Object.keys(adjustedParams).length === 0) {
            return { success: false, error: 'No valid parameters in the adjusted result' };
          }

          const changes: Record<string, { from: number; to: number }> = {};
          for (const [key, newVal] of Object.entries(adjustedParams)) {
            const oldVal = currentParams[key];
            if (oldVal !== undefined && Math.abs(oldVal - newVal) > 0.001) {
              changes[key] = { from: oldVal, to: newVal };
            }
          }

          if (shouldApply) {
            try {
              await api.setFaceParams(adjustedParams);
            } catch (err) {
              return {
                success: false,
                error: `Failed to apply adjusted parameters: ${String(err)}`,
                data: { params: adjustedParams },
              };
            }
          }

          return {
            success: true,
            data: {
              params: adjustedParams,
              changes,
              changedCount: Object.keys(changes).length,
              applied: shouldApply,
            },
          };
        },
      },
    ];
  }
}
