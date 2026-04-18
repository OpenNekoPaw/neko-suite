/**
 * Pipeline Tools — Agent tools for starting and controlling creative pipelines
 *
 * Tools:
 * - StartPipeline: Start a creative workflow pipeline
 * - ConfirmPipelineGate: Confirm or cancel a pipeline gate
 */

import type { Tool } from './extensionTools';
import type { PipelineRunReport } from '@neko/agent/pipeline';
// Pipeline types are defined in the agent package
// Using inline types to avoid cross-package import issues at build time
type FlowId = 'flowA' | 'flowB' | 'flowC' | 'flowD' | 'flowE' | 'flowF';

interface PipelineContext {
  source?: string;
  sourceFormat?: 'fountain' | 'freeform' | 'document';
  globalStyle?: string;
  stageParams?: Record<string, Record<string, unknown>>;
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
        type: 'object',
        properties: {
          flowId: {
            type: 'string',
            enum: ['flowA', 'flowB', 'flowC', 'flowD', 'flowE', 'flowF'],
            description: 'Which flow to execute',
          },
          source: {
            type: 'string',
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
          importToCanvas: {
            type: 'boolean',
            description:
              'When true and the source is a Fountain screenplay, import semantic ScenePlan/ShotPlan results into the active canvas before media generation.',
          },
          canvasStartX: {
            type: 'number',
            description: 'Optional initial canvas X position for storyboard import',
          },
          canvasStartY: {
            type: 'number',
            description: 'Optional initial canvas Y position for storyboard import',
          },
        },
        required: ['flowId', 'source'],
      },
      async execute(args: Record<string, unknown>): Promise<unknown> {
        const flowId = args['flowId'] as FlowId;
        const source = args['source'] as string;
        const sourceFormat = args['sourceFormat'] as PipelineContext['sourceFormat'];
        const style = args['style'] as string | undefined;
        const skipStagesStr = args['skipStages'] as string | undefined;
        const importToCanvas = args['importToCanvas'] === true;

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
          stageParams: importToCanvas
            ? {
                importStoryboardToCanvas: {
                  enabled: true,
                  startX: args['canvasStartX'] as number | undefined,
                  startY: args['canvasStartY'] as number | undefined,
                },
              }
            : undefined,
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
        type: 'object',
        properties: {
          pipelineId: {
            type: 'string',
            description: 'Pipeline ID (returned by StartPipeline)',
          },
          action: {
            type: 'string',
            enum: ['confirm', 'cancel'],
            description: 'Whether to confirm and proceed or cancel the pipeline',
          },
        },
        required: ['pipelineId', 'action'],
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
        type: 'object',
        properties: {
          pipelineId: {
            type: 'string',
            description: 'Pipeline ID of the completed pipeline with failed scenes',
          },
          sceneIndices: {
            type: 'string',
            description:
              'Comma-separated scene indices to retry (e.g., "2,5,7"). If omitted, retries all failed scenes.',
          },
        },
        required: ['pipelineId'],
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

        const { result } = handle;
        const failedScenes = (result['failedScenes'] as number[] | undefined) ?? [];
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
          ...(result['context'] as Record<string, unknown>),
          retrySceneIndices: toRetry,
        };

        const newHandle = deps.startPipeline(
          (result['flowId'] as FlowId) ?? 'flowF',
          ctx as PipelineContext,
          { skipStages: ['readDocument', 'parseStoryboard', 'importStoryboardToCanvas'] },
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

/** Store completed pipeline results + run reports for retry/diagnostics */
const completedPipelines = new Map<string, CompletedPipelineRecord>();

/** Internal record combining retry data and run report */
export interface CompletedPipelineRecord {
  /** Original pipeline result for retry support */
  result: Record<string, unknown>;
  /** Structured run report (populated by progress bridge) */
  report?: PipelineRunReport;
}

/**
 * Record a completed pipeline result (called from progress bridge)
 */
export function recordCompletedPipeline(
  pipelineId: string,
  result: Record<string, unknown>,
  report?: PipelineRunReport,
): void {
  completedPipelines.set(pipelineId, { result, report });
  // Auto-cleanup after 1 hour
  setTimeout(() => completedPipelines.delete(pipelineId), 60 * 60 * 1000);
}

/**
 * Get a run report by pipeline ID (for report query tools)
 */
export function getPipelineReport(pipelineId: string): PipelineRunReport | undefined {
  return completedPipelines.get(pipelineId)?.report;
}

/**
 * List all available run reports (newest first, limited)
 */
export function listPipelineReports(limit: number = 10): PipelineRunReport[] {
  const reports: PipelineRunReport[] = [];
  completedPipelines.forEach((record) => {
    if (record.report) {
      reports.push(record.report);
    }
  });
  // Sort by completedAt descending
  reports.sort((a, b) => {
    const timeA = new Date(a.completedAt).getTime();
    const timeB = new Date(b.completedAt).getTime();
    return timeB - timeA;
  });
  return reports.slice(0, limit);
}

/**
 * Get an active pipeline handle (for event consumption)
 */
export function getActivePipeline(pipelineId: string): PipelineHandle | undefined {
  return activePipelines.get(pipelineId);
}

/**
 * Register a pipeline handle produced outside the `StartPipeline` tool
 * (e.g. by the Workflow Orchestrator's routed pipeline).  Needed so that
 * later webview messages like `pipelineGateConfirm` can look it up.
 */
export function registerActivePipeline(pipelineId: string, handle: PipelineHandle): void {
  activePipelines.set(pipelineId, handle);
}

/**
 * Confirm the currently-pending gate on an active pipeline.
 * No-op when the id is unknown.
 */
export function confirmPipelineGate(
  pipelineId: string,
  modifications?: Partial<PipelineContext>,
): boolean {
  const handle = activePipelines.get(pipelineId);
  if (!handle) return false;
  handle.confirmGate(modifications);
  return true;
}

/**
 * Cancel the currently-pending gate on an active pipeline. Removes it
 * from the registry.
 */
export function cancelPipelineGate(pipelineId: string): boolean {
  const handle = activePipelines.get(pipelineId);
  if (!handle) return false;
  handle.cancelGate();
  activePipelines.delete(pipelineId);
  return true;
}

/**
 * Clean up completed pipeline
 */
export function removePipeline(pipelineId: string): void {
  activePipelines.delete(pipelineId);
}
