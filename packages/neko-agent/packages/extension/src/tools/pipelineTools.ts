/**
 * Pipeline Tools — Agent tools for starting and controlling creative pipelines
 *
 * Tools:
 * - StartPipeline: Start a creative workflow pipeline
 * - ConfirmPipelineGate: Confirm or cancel a pipeline gate
 */

import type { Tool } from './extensionTools';
// Pipeline types are defined in the agent package
// Using inline types to avoid cross-package import issues at build time
type FlowId = 'flowA' | 'flowB' | 'flowC' | 'flowD' | 'flowE' | 'flowF';

interface PipelineContext {
  source?: string;
  sourceFormat?: 'fountain' | 'freeform' | 'document';
  globalStyle?: string;
  [key: string]: unknown;
}

interface PipelineHandle {
  readonly id: string;
  readonly flowId: FlowId;
  confirmGate(modifications?: Partial<PipelineContext>): void;
  cancelGate(): void;
  cancel(): void;
}
import { getLogger } from '../base';

const logger = getLogger('PipelineTools');

/** Active pipeline handles keyed by pipeline ID */
const activePipelines = new Map<string, PipelineHandle>();

export interface PipelineToolsDeps {
  startPipeline: (
    flowId: FlowId,
    ctx: PipelineContext,
    overrides?: { skipStages?: string[]; globalStyle?: string },
  ) => PipelineHandle;
}

/**
 * Create pipeline control tools
 */
export function createPipelineTools(deps: PipelineToolsDeps): Tool[] {
  return [
    {
      name: 'StartPipeline',
      description:
        'Start a creative workflow pipeline to convert scripts/documents into video. ' +
        'Available flows: flowA (document→script→storyboard→video), ' +
        'flowB (quick generate→video), flowC (document→storyboard→video), ' +
        'flowD (script→video), flowE (comic→storyboard→video), ' +
        'flowF (script→storyboard→video, most common)',
      parameters: {
        flowId: {
          type: 'string',
          required: true,
          enum: ['flowA', 'flowB', 'flowC', 'flowD', 'flowE', 'flowF'],
          description: 'Which flow to execute',
        },
        source: {
          type: 'string',
          required: true,
          description: 'Input source: file path (.fountain, .md, .pdf, .docx) or inline text',
        },
        sourceFormat: {
          type: 'string',
          enum: ['fountain', 'freeform', 'document'],
          description: 'Source format hint (auto-detected from extension if omitted)',
        },
        style: {
          type: 'string',
          description: 'Global visual style (e.g., "anime", "cinematic", "corporate")',
        },
        skipStages: {
          type: 'string',
          description: 'Comma-separated stage names to skip (e.g., "generateMusic,addSubtitles")',
        },
      },
      async execute(args: Record<string, unknown>): Promise<unknown> {
        const flowId = args['flowId'] as FlowId;
        const source = args['source'] as string;
        const sourceFormat = args['sourceFormat'] as PipelineContext['sourceFormat'];
        const style = args['style'] as string | undefined;
        const skipStagesStr = args['skipStages'] as string | undefined;

        const skipStages = skipStagesStr
          ? skipStagesStr
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined;

        const ctx: PipelineContext = {
          source,
          sourceFormat,
          globalStyle: style,
        };

        const handle = deps.startPipeline(flowId, ctx, { skipStages, globalStyle: style });
        activePipelines.set(handle.id, handle);

        logger.info('Pipeline started', { id: handle.id, flow: flowId });

        return {
          pipelineId: handle.id,
          flowId,
          status: 'started',
          message: `Pipeline ${flowId} started. It will pause at confirmation gates for your review.`,
        };
      },
    },
    {
      name: 'ConfirmPipelineGate',
      description:
        'Confirm or cancel a pipeline gate. Pipelines pause at confirmation gates ' +
        '(e.g., after generating prompts) to let you review before proceeding.',
      parameters: {
        pipelineId: {
          type: 'string',
          required: true,
          description: 'Pipeline ID (returned by StartPipeline)',
        },
        action: {
          type: 'string',
          required: true,
          enum: ['confirm', 'cancel'],
          description: 'Whether to confirm and proceed or cancel the pipeline',
        },
      },
      async execute(args: Record<string, unknown>): Promise<unknown> {
        const pipelineId = args['pipelineId'] as string;
        const action = args['action'] as 'confirm' | 'cancel';

        const handle = activePipelines.get(pipelineId);
        if (!handle) {
          return { error: `No active pipeline found with ID: ${pipelineId}` };
        }

        if (action === 'confirm') {
          handle.confirmGate();
          return { status: 'confirmed', message: 'Pipeline gate confirmed, continuing execution.' };
        } else {
          handle.cancelGate();
          activePipelines.delete(pipelineId);
          return { status: 'cancelled', message: 'Pipeline cancelled.' };
        }
      },
    },
    {
      name: 'RetryPipelineScenes',
      description:
        'Retry failed scenes from a completed pipeline. Use when some scenes failed ' +
        'generation and the user wants to regenerate them without restarting the entire pipeline.',
      parameters: {
        pipelineId: {
          type: 'string',
          required: true,
          description: 'Pipeline ID of the completed pipeline with failed scenes',
        },
        sceneIndices: {
          type: 'string',
          description:
            'Comma-separated scene indices to retry (e.g., "2,5,7"). If omitted, retries all failed scenes.',
        },
      },
      async execute(args: Record<string, unknown>): Promise<unknown> {
        const pipelineId = args['pipelineId'] as string;
        const sceneIndicesStr = args['sceneIndices'] as string | undefined;

        // Look up completed pipeline result in history
        const handle = completedPipelines.get(pipelineId);
        if (!handle) {
          return {
            error:
              `No completed pipeline found with ID: ${pipelineId}. ` +
              'The pipeline may have been cleaned up. Start a new pipeline instead.',
          };
        }

        const failedScenes = (handle.failedScenes as number[]) ?? [];
        if (failedScenes.length === 0) {
          return { status: 'no_failures', message: 'No failed scenes to retry.' };
        }

        const toRetry = sceneIndicesStr
          ? sceneIndicesStr
              .split(',')
              .map((s) => parseInt(s.trim(), 10))
              .filter((n) => !isNaN(n))
          : failedScenes;

        // Start a new pipeline with only the failed scenes
        const ctx = {
          ...(handle.context as Record<string, unknown>),
          retrySceneIndices: toRetry,
        };

        const newHandle = deps.startPipeline(
          (handle.flowId as FlowId) ?? 'flowF',
          ctx as PipelineContext,
          { skipStages: ['readDocument', 'parseStoryboard'] },
        );
        activePipelines.set(newHandle.id, newHandle);

        return {
          pipelineId: newHandle.id,
          retryingScenes: toRetry,
          status: 'retrying',
          message: `Retrying ${toRetry.length} failed scene(s). Pipeline ID: ${newHandle.id}`,
        };
      },
    },
  ];
}

/** Store completed pipeline results for retry support */
const completedPipelines = new Map<string, Record<string, unknown>>();

/**
 * Record a completed pipeline result (called from progress bridge)
 */
export function recordCompletedPipeline(pipelineId: string, result: Record<string, unknown>): void {
  completedPipelines.set(pipelineId, result);
  // Auto-cleanup after 1 hour
  setTimeout(() => completedPipelines.delete(pipelineId), 60 * 60 * 1000);
}

/**
 * Get an active pipeline handle (for event consumption)
 */
export function getActivePipeline(pipelineId: string): PipelineHandle | undefined {
  return activePipelines.get(pipelineId);
}

/**
 * Clean up completed pipeline
 */
export function removePipeline(pipelineId: string): void {
  activePipelines.delete(pipelineId);
}
