/**
 * Run Report Collector — Pure functions for building PipelineRunReport
 *
 * Agent layer, zero vscode dependency.
 *
 * Two usage patterns:
 * 1. `createReportCollector()` — stateful collector that processes events one-by-one
 * 2. `buildRunReport()` — builds a report from pre-collected stage records
 */

import type {
  FlowId,
  PipelineContext,
  PipelineEvent,
  PipelineRunReport,
  SceneSummary,
  StageRecord,
} from './types';

// =============================================================================
// Stateful Collector (processes events incrementally)
// =============================================================================

export interface ReportCollector {
  /** Feed a pipeline event into the collector */
  processEvent(event: PipelineEvent): void;
  /** Build the final report. Call after the event stream ends. */
  finalize(): PipelineRunReport;
}

/**
 * Create a stateful report collector that processes PipelineEvents one-by-one.
 * Useful when you're already iterating the event stream (e.g., in progress-bridge).
 */
export function createReportCollector(pipelineId: string, flowId: FlowId): ReportCollector {
  const startedAt = new Date().toISOString();
  const stages: StageRecord[] = [];
  let activeStage: { name: string; startedAt: number } | undefined;
  let finalContext: PipelineContext = {};
  let status: PipelineRunReport['status'] = 'completed';
  let failedStageIndex: number | undefined;

  return {
    processEvent(event: PipelineEvent): void {
      switch (event.type) {
        case 'stage_start': {
          const stageName = event['stage'] as string;
          activeStage = { name: stageName, startedAt: Date.now() };
          break;
        }

        case 'stage_complete': {
          const stageName = event['stage'] as string;
          if (activeStage && activeStage.name === stageName) {
            stages.push({
              name: stageName,
              status: 'success',
              durationMs: Date.now() - activeStage.startedAt,
            });
            activeStage = undefined;
          }
          break;
        }

        case 'stage_skipped': {
          const stageName = event['stage'] as string;
          const reason = event['reason'] as string | undefined;
          if (activeStage && activeStage.name === stageName) {
            activeStage = undefined;
          }
          stages.push({
            name: stageName,
            status: 'skipped',
            durationMs: 0,
            skipReason: reason,
          });
          break;
        }

        case 'pipeline_complete': {
          finalContext = (event['result'] as PipelineContext) ?? {};
          status = 'completed';
          break;
        }

        case 'pipeline_error': {
          const stageName = event['stage'] as string;
          const error = event['error'] as string;
          status = 'failed';
          if (activeStage && activeStage.name === stageName) {
            stages.push({
              name: stageName,
              status: 'failed',
              durationMs: Date.now() - activeStage.startedAt,
              error,
            });
            activeStage = undefined;
          } else {
            stages.push({
              name: stageName,
              status: 'failed',
              durationMs: 0,
              error,
            });
          }
          failedStageIndex = stages.length - 1;
          break;
        }

        case 'gate_cancelled': {
          const stageName = event['stage'] as string;
          status = 'cancelled';
          if (activeStage && activeStage.name === stageName) {
            stages.push({
              name: stageName,
              status: 'failed',
              durationMs: Date.now() - activeStage.startedAt,
              error: 'Cancelled by user at gate',
            });
            activeStage = undefined;
            failedStageIndex = stages.length - 1;
          }
          break;
        }

        default:
          break;
      }
    },

    finalize(): PipelineRunReport {
      const completedAt = new Date().toISOString();
      return {
        id: pipelineId,
        flowId,
        startedAt,
        completedAt,
        status,
        stages,
        finalContext,
        failedStageIndex,
        sceneSummary: buildSceneSummary(finalContext),
      };
    },
  };
}

// =============================================================================
// Standalone builder (from event stream — for independent consumption)
// =============================================================================

/**
 * Collect a PipelineRunReport by consuming the full event stream.
 * Returns after the stream ends (pipeline completes, fails, or is cancelled).
 */
export async function collectRunReport(
  events: AsyncIterable<PipelineEvent>,
  pipelineId: string,
  flowId: FlowId,
): Promise<PipelineRunReport> {
  const collector = createReportCollector(pipelineId, flowId);

  for await (const event of events) {
    collector.processEvent(event);
  }

  return collector.finalize();
}

// =============================================================================
// Helpers
// =============================================================================

function buildSceneSummary(ctx: PipelineContext): SceneSummary | undefined {
  const scenes = ctx.scenes;
  if (!scenes || scenes.length === 0) return undefined;

  const total = scenes.length;
  const failedIndices = ctx.failedScenes ?? [];
  const generated = ctx.generatedPaths?.length ?? 0;
  const failed = failedIndices.length;

  return { total, generated, failed, failedIndices };
}
