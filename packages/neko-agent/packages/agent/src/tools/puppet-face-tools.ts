import { createTool, type Tool, type ToolParameters, type ToolResult } from '@neko/shared';
import {
  createPuppetFaceRuntime,
  type PuppetFaceErrorResult,
  type PuppetFaceImageInput,
  type PuppetFaceParams,
  type PuppetFaceRuntimeDeps,
} from './puppet-face-runtime';

export interface PuppetFaceToolsLogger {
  info(message: string, metadata?: Record<string, unknown>): void;
  warn?(message: string, metadata?: Record<string, unknown>): void;
}

export interface PuppetFaceToolsDeps extends PuppetFaceRuntimeDeps {
  readImagePayload(imagePath: string): Promise<PuppetFaceImageInput>;
  getCurrentFaceParams(): Promise<PuppetFaceParams>;
  applyFaceParams(params: PuppetFaceParams): Promise<void>;
  logger?: PuppetFaceToolsLogger;
}

const generateParamsParameters = {
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
      description: 'Whether to apply the generated params to the active puppet (default: true)',
    },
  },
  required: ['description'],
} satisfies ToolParameters;

const fromImageParameters = {
  type: 'object',
  properties: {
    imagePath: {
      type: 'string',
      description: 'Absolute path to the reference face image (PNG/JPEG/WebP)',
    },
    apply: {
      type: 'boolean',
      description: 'Whether to apply the inferred params to the active puppet (default: true)',
    },
  },
  required: ['imagePath'],
} satisfies ToolParameters;

const adjustParameters = {
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
      description: 'Whether to apply the adjusted params to the active puppet (default: true)',
    },
  },
  required: ['instruction'],
} satisfies ToolParameters;

export function createPuppetFaceTools(deps: PuppetFaceToolsDeps): Tool[] {
  const runtime = createPuppetFaceRuntime({
    generateWithLLM: deps.generateWithLLM,
  });

  return [
    createTool({
      name: 'PuppetGenerateParams',
      description:
        'Generate face parameter values for a 2D puppet model from a text description. ' +
        'Analyzes the description (e.g. "anime girl with big eyes and small mouth") and produces ' +
        'appropriate values for the standard 32 face parameters. The generated parameters are ' +
        'automatically applied to the active puppet model.',
      category: 'generation',
      isConcurrencySafe: false,
      isReadOnly: false,
      parameters: generateParamsParameters,
      execute: async (args) => executeGenerateParams(deps, runtime, args),
    }),
    createTool({
      name: 'PuppetFromImage',
      description:
        'Analyze a reference image of a face/character and generate matching puppet face parameters. ' +
        'The image is encoded and sent to a vision-capable LLM which infers appropriate parameter ' +
        'values. Supports PNG, JPEG, and WebP. The generated parameters are automatically applied ' +
        'to the active puppet model.',
      category: 'generation',
      isConcurrencySafe: false,
      isReadOnly: false,
      parameters: fromImageParameters,
      execute: async (args) => executeFromImage(deps, runtime, args),
    }),
    createTool({
      name: 'PuppetAdjust',
      description:
        'Adjust puppet face parameters using a natural language instruction. ' +
        'Reads the current parameter values from the active puppet model, sends them along with ' +
        'the instruction to the LLM, and applies the adjusted values. ' +
        'Example: "make the eyes bigger and raise the eyebrows", "嘴角上扬，增加腮红".',
      category: 'generation',
      isConcurrencySafe: false,
      isReadOnly: false,
      parameters: adjustParameters,
      execute: async (args) => executeAdjust(deps, runtime, args),
    }),
  ];
}

async function executeGenerateParams(
  deps: PuppetFaceToolsDeps,
  runtime: ReturnType<typeof createPuppetFaceRuntime>,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const description = readStringArg(args, 'description');
  if (!description) return toolError('Missing required string argument: description');

  const shouldApply = readApplyArg(args);
  const result = await runtime.generateParams({ description });
  if (result.success === false) return runtimeError(result);

  const applyError = await applyIfRequested(
    deps,
    result.params,
    shouldApply,
    'Failed to apply parameters',
  );
  if (applyError) return applyError;

  deps.logger?.info(`PuppetGenerateParams: generated ${result.modifiedCount} params`, {
    description: description.slice(0, 80),
    applied: shouldApply,
  });

  return toolSuccess({
    description,
    params: result.params,
    modifiedCount: result.modifiedCount,
    applied: shouldApply,
  });
}

async function executeFromImage(
  deps: PuppetFaceToolsDeps,
  runtime: ReturnType<typeof createPuppetFaceRuntime>,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const imagePath = readStringArg(args, 'imagePath');
  if (!imagePath) return toolError('Missing required string argument: imagePath');

  let image: PuppetFaceImageInput;
  try {
    image = await deps.readImagePayload(imagePath);
  } catch (error) {
    return toolError(`Failed to read image: ${String(error)}`);
  }

  const shouldApply = readApplyArg(args);
  const result = await runtime.inferParamsFromImage(image);
  if (result.success === false) return runtimeError(result);

  const applyError = await applyIfRequested(
    deps,
    result.params,
    shouldApply,
    'Failed to apply parameters',
  );
  if (applyError) return applyError;

  deps.logger?.info(`PuppetFromImage: inferred ${result.modifiedCount} params`, {
    imagePath,
    applied: shouldApply,
  });

  return toolSuccess({
    imagePath,
    params: result.params,
    modifiedCount: result.modifiedCount,
    applied: shouldApply,
  });
}

async function executeAdjust(
  deps: PuppetFaceToolsDeps,
  runtime: ReturnType<typeof createPuppetFaceRuntime>,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const instruction = readStringArg(args, 'instruction');
  if (!instruction) return toolError('Missing required string argument: instruction');

  let currentParams: PuppetFaceParams;
  try {
    currentParams = await deps.getCurrentFaceParams();
  } catch (error) {
    return toolError(`Failed to read current face params: ${String(error)}`);
  }

  const shouldApply = readApplyArg(args);
  const result = await runtime.adjustParams({ instruction, currentParams });
  if (result.success === false) return runtimeError(result);

  const applyError = await applyIfRequested(
    deps,
    result.params,
    shouldApply,
    'Failed to apply adjusted parameters',
  );
  if (applyError) return applyError;

  deps.logger?.info(`PuppetAdjust: ${result.changedCount} params changed`, {
    instruction: instruction.slice(0, 80),
    applied: shouldApply,
  });

  return toolSuccess({
    instruction,
    params: result.params,
    changes: result.changes,
    changedCount: result.changedCount,
    applied: shouldApply,
  });
}

async function applyIfRequested(
  deps: PuppetFaceToolsDeps,
  params: PuppetFaceParams,
  shouldApply: boolean,
  errorPrefix: string,
): Promise<ToolResult | undefined> {
  if (!shouldApply) return undefined;

  try {
    await deps.applyFaceParams(params);
    return undefined;
  } catch (error) {
    return toolError(`${errorPrefix}: ${String(error)}`, { params });
  }
}

function readStringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readApplyArg(args: Record<string, unknown>): boolean {
  return typeof args['apply'] === 'boolean' ? args['apply'] : true;
}

function runtimeError(result: PuppetFaceErrorResult): ToolResult {
  return toolError(
    result.error,
    result.rawResponse ? { rawResponse: result.rawResponse } : undefined,
  );
}

function toolSuccess(data: Record<string, unknown>): ToolResult {
  return { success: true, data };
}

function toolError(error: string, data?: Record<string, unknown>): ToolResult {
  return {
    success: false,
    error,
    ...(data ? { data } : {}),
  };
}
