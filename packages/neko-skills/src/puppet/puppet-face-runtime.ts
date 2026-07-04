import type { PuppetFaceParameter } from '@neko/shared';
import {
  PUPPET_FACE_CATEGORIES,
  PUPPET_FACE_PARAMETERS,
  getDefaultPuppetFaceParams,
} from '@neko/shared';

export type PuppetFaceParams = Record<string, number>;
export type PuppetFaceParamChanges = Record<string, { from: number; to: number }>;

export interface PuppetFaceRuntimeDeps {
  generateWithLLM(systemPrompt: string, userPrompt: string): Promise<string>;
}

export interface PuppetFaceGenerateInput {
  description: string;
}

export interface PuppetFaceImageInput {
  imageBase64: string;
  mimeType?: string;
}

export interface PuppetFaceAdjustInput {
  instruction: string;
  currentParams: PuppetFaceParams;
}

export interface PuppetFaceErrorResult {
  success: false;
  error: string;
  rawResponse?: string;
}

export interface PuppetFaceGenerateSuccess {
  success: true;
  description: string;
  params: PuppetFaceParams;
  modifiedCount: number;
}

export interface PuppetFaceImageSuccess {
  success: true;
  params: PuppetFaceParams;
  modifiedCount: number;
}

export interface PuppetFaceAdjustSuccess {
  success: true;
  instruction: string;
  params: PuppetFaceParams;
  changes: PuppetFaceParamChanges;
  changedCount: number;
}

export type PuppetFaceGenerateResult = PuppetFaceGenerateSuccess | PuppetFaceErrorResult;
export type PuppetFaceImageResult = PuppetFaceImageSuccess | PuppetFaceErrorResult;
export type PuppetFaceAdjustResult = PuppetFaceAdjustSuccess | PuppetFaceErrorResult;

const PARAM_SCHEMA_PROMPT = buildPuppetFaceParameterSchemaPrompt();
const DEFAULT_IMAGE_MIME_TYPE = 'image/png';

export function buildPuppetFaceParameterSchemaPrompt(): string {
  const lines: string[] = ['Available face parameters (id | label | range | default):'];
  let currentCategory = '';

  for (const parameter of PUPPET_FACE_PARAMETERS) {
    if (parameter.category !== currentCategory) {
      currentCategory = parameter.category;
      const meta = PUPPET_FACE_CATEGORIES[parameter.category];
      lines.push(`\n## ${meta.en} (${meta.zh})`);
    }
    lines.push(
      `- ${parameter.id}: "${parameter.label_en}" [${parameter.min}, ${parameter.max}] default=${parameter.default}`,
    );
  }

  return lines.join('\n');
}

export function detectPuppetFaceImageMimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
  };
  return (ext ? mimeMap[ext] : undefined) ?? DEFAULT_IMAGE_MIME_TYPE;
}

export function validateAndClampPuppetFaceParams(raw: Record<string, unknown>): PuppetFaceParams {
  const paramMap = new Map<string, PuppetFaceParameter>();
  for (const parameter of PUPPET_FACE_PARAMETERS) {
    paramMap.set(parameter.id, parameter);
  }

  const result: PuppetFaceParams = {};
  for (const [key, value] of Object.entries(raw)) {
    const parameter = paramMap.get(key);
    if (!parameter) continue;

    let numericValue: number;
    if (typeof value === 'number') {
      numericValue = value;
    } else if (typeof value === 'string' && value.trim() !== '') {
      numericValue = Number(value);
    } else {
      continue;
    }

    if (!Number.isFinite(numericValue)) continue;
    result[key] = Math.max(parameter.min, Math.min(parameter.max, numericValue));
  }

  return result;
}

export function parsePuppetFaceJsonResponse(text: string): Record<string, unknown> | null {
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const jsonText = fenceMatch ? fenceMatch[1]!.trim() : text.trim();

  try {
    return asJsonRecord(JSON.parse(jsonText));
  } catch {
    return extractJsonObject(fenceMatch ? text : jsonText);
  }
}

export function diffPuppetFaceParams(
  currentParams: PuppetFaceParams,
  nextParams: PuppetFaceParams,
): PuppetFaceParamChanges {
  const changes: PuppetFaceParamChanges = {};
  for (const [key, nextValue] of Object.entries(nextParams)) {
    const currentValue = currentParams[key];
    if (currentValue !== undefined && Math.abs(currentValue - nextValue) > 0.001) {
      changes[key] = { from: currentValue, to: nextValue };
    }
  }
  return changes;
}

export class PuppetFaceRuntime {
  constructor(private readonly deps: PuppetFaceRuntimeDeps) {}

  async generateParams(input: PuppetFaceGenerateInput): Promise<PuppetFaceGenerateResult> {
    const systemPrompt =
      'You are a 2D character face parameter expert. Given a text description of a character face, ' +
      'produce a JSON object mapping parameter IDs to numeric values.\n\n' +
      'Rules:\n' +
      '- Only include parameters whose values differ from defaults.\n' +
      "- Values must be within each parameter's [min, max] range.\n" +
      '- Respond ONLY with a JSON object, no explanation.\n\n' +
      PARAM_SCHEMA_PROMPT;
    const userPrompt = `Generate face parameters for: "${input.description}"`;

    const parsed = await this.generateAndParse(systemPrompt, userPrompt, 'LLM generation failed');
    if (parsed.success === false) return parsed;

    const params = validateAndClampPuppetFaceParams(parsed.data);
    if (Object.keys(params).length === 0) {
      return { success: false, error: 'No valid parameters were generated' };
    }

    return {
      success: true,
      description: input.description,
      params: { ...getDefaultPuppetFaceParams(), ...params },
      modifiedCount: Object.keys(params).length,
    };
  }

  async inferParamsFromImage(input: PuppetFaceImageInput): Promise<PuppetFaceImageResult> {
    const mimeType = input.mimeType ?? DEFAULT_IMAGE_MIME_TYPE;
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
      'Analyze the attached face image and generate matching face parameters.\n' +
      `[Image: data:${mimeType};base64,${input.imageBase64}]`;

    const parsed = await this.generateAndParse(
      systemPrompt,
      userPrompt,
      'LLM vision analysis failed',
    );
    if (parsed.success === false) return parsed;

    const params = validateAndClampPuppetFaceParams(parsed.data);
    if (Object.keys(params).length === 0) {
      return { success: false, error: 'No valid parameters were inferred from the image' };
    }

    return {
      success: true,
      params: { ...getDefaultPuppetFaceParams(), ...params },
      modifiedCount: Object.keys(params).length,
    };
  }

  async adjustParams(input: PuppetFaceAdjustInput): Promise<PuppetFaceAdjustResult> {
    if (Object.keys(input.currentParams).length === 0) {
      return {
        success: false,
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
    const userPrompt =
      `Current parameters:\n${JSON.stringify(input.currentParams, null, 2)}\n\n` +
      `Adjustment instruction: "${input.instruction}"`;

    const parsed = await this.generateAndParse(systemPrompt, userPrompt, 'LLM adjustment failed');
    if (parsed.success === false) return parsed;

    const adjustedParams = validateAndClampPuppetFaceParams(parsed.data);
    if (Object.keys(adjustedParams).length === 0) {
      return { success: false, error: 'No valid parameters in the adjusted result' };
    }

    const changes = diffPuppetFaceParams(input.currentParams, adjustedParams);
    return {
      success: true,
      instruction: input.instruction,
      params: adjustedParams,
      changes,
      changedCount: Object.keys(changes).length,
    };
  }

  private async generateAndParse(
    systemPrompt: string,
    userPrompt: string,
    errorPrefix: string,
  ): Promise<{ success: true; data: Record<string, unknown> } | PuppetFaceErrorResult> {
    let llmResponse: string;
    try {
      llmResponse = await this.deps.generateWithLLM(systemPrompt, userPrompt);
    } catch (error) {
      return { success: false, error: `${errorPrefix}: ${String(error)}` };
    }

    const parsed = parsePuppetFaceJsonResponse(llmResponse);
    if (!parsed) {
      return {
        success: false,
        error: 'Failed to parse LLM response as JSON',
        rawResponse: llmResponse,
      };
    }

    return { success: true, data: parsed };
  }
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const braceIndex = text.indexOf('{', searchFrom);
    if (braceIndex === -1) break;

    let endIndex = text.lastIndexOf('}');
    while (endIndex > braceIndex) {
      const candidate = text.slice(braceIndex, endIndex + 1);
      try {
        return asJsonRecord(JSON.parse(candidate));
      } catch {
        endIndex = text.lastIndexOf('}', endIndex - 1);
      }
    }

    searchFrom = braceIndex + 1;
  }
  return null;
}

function asJsonRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error('JSON value is not an object');
}

export function createPuppetFaceRuntime(deps: PuppetFaceRuntimeDeps): PuppetFaceRuntime {
  return new PuppetFaceRuntime(deps);
}
