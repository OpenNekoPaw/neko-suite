import {
  BuiltinTool,
  TOOL_NAMES_PERCEPTION,
  type PerceiveToolInput,
  type ToolParameters,
  type ToolResult,
} from '@neko/shared';
import type { IPerceptionPipeline } from './contracts';

export const PERCEIVE_TOOL_NAME = TOOL_NAMES_PERCEPTION.PERCEIVE;

export interface PerceiveToolConfig {
  readonly pipeline: IPerceptionPipeline;
  readonly now?: () => number;
}

export class PerceiveTool extends BuiltinTool {
  readonly name = PERCEIVE_TOOL_NAME;
  readonly description =
    'Aggregate on-demand perception tool. It analyzes a generated or referenced media asset through the runtime perception pipeline and returns an updated PerceptionCard.';
  readonly parameters: ToolParameters = {
    type: 'object',
    properties: {
      assetId: {
        type: 'string',
        description: 'Stable asset id to perceive.',
      },
      depth: {
        type: 'integer',
        description: 'Perception depth: 1 for semantic evidence, 2 for derived perceptual refs.',
      },
      focus: {
        type: 'string',
        enum: ['transcript', 'visual', 'audio', 'shots', 'composition'],
        description: 'Optional analysis focus.',
      },
      options: {
        type: 'object',
        description: 'Optional analysis options such as language, time range, or frame density.',
      },
    },
    required: ['assetId', 'depth'],
  };
  readonly category = 'analysis' as const;
  readonly kind = 'perception' as const;
  override readonly isConcurrencySafe = true;
  override readonly isReadOnly = true;

  private readonly pipeline: IPerceptionPipeline;
  private readonly now: () => number;

  constructor(config: PerceiveToolConfig) {
    super();
    this.pipeline = config.pipeline;
    this.now = config.now ?? (() => Date.now());
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(validation.error ?? 'Invalid arguments');
    }

    const input = readPerceiveToolInput(args);
    if (!input) {
      return this.error('`assetId` must be a non-empty string and `depth` must be 1 or 2');
    }

    const result = await this.pipeline.perceive({
      asset: { assetId: input.assetId },
      focus: input.focus,
      options: input.options,
      policy: {
        timing: 'on-demand',
        layers: input.depth === 2 ? [0, 1, 2] : [0, 1],
        reason: 'aggregate PerceiveTool request',
      },
    });

    return {
      success: true,
      data: {
        perceptionCard: result.card,
        perceivedAt: this.now(),
      },
      perceptionCards: [result.card],
    };
  }
}

function readPerceiveToolInput(args: Record<string, unknown>): PerceiveToolInput | undefined {
  const assetId = readNonEmptyString(args['assetId']);
  const depth = args['depth'];
  if (!assetId || (depth !== 1 && depth !== 2)) {
    return undefined;
  }

  const focus = readFocus(args['focus']);
  return {
    assetId,
    depth,
    ...(focus ? { focus } : {}),
    ...(isRecord(args['options'])
      ? { options: args['options'] as PerceiveToolInput['options'] }
      : {}),
  };
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readFocus(value: unknown): PerceiveToolInput['focus'] | undefined {
  if (
    value === 'transcript' ||
    value === 'visual' ||
    value === 'audio' ||
    value === 'shots' ||
    value === 'composition'
  ) {
    return value;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
