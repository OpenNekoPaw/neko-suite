/**
 * Pipeline Progress Bridge — Forwards WorkflowEvent to WebView via postMessage
 *
 * Subscribes to a WorkflowHandle's event stream and converts each WorkflowEvent
 * into a WebView-consumable message, following the same pattern as
 * AgentStreamProcessor._subscribeToTaskProgress().
 *
 * Also collects a WorkflowRunReport via ReportCollector, passing it to
 * recordCompletedWorkflow for in-memory diagnostics.
 */

import * as vscode from 'vscode';
import { getLogger } from '../base';
import { removePipeline, recordCompletedWorkflow } from '../tools/pipelineTools';
import {
  createReportCollector,
  type FlowId,
  type WorkflowEvent as AgentWorkflowEvent,
} from '@neko/agent/workflow';

// Pipeline event types from @neko/agent pipeline (inline to avoid cross-package import)
interface WorkflowEvent {
  type: string;
  [key: string]: unknown;
}

interface WorkflowHandleFull {
  readonly id: string;
  readonly flowId: string;
  readonly events: AsyncIterable<WorkflowEvent>;
}

interface WorkflowProgressOptions {
  readonly eventCommand?: string;
  readonly eventPayload?: Record<string, unknown>;
}

const logger = getLogger('WorkflowProgressBridge');

// Pipeline event types sent to WebView
interface PipelineWebViewMessage {
  type:
    | 'pipelineStarted'
    | 'pipelineStageStart'
    | 'pipelineStageComplete'
    | 'pipelineStageSkipped'
    | 'pipelineGateWaiting'
    | 'pipelineTaskProgress'
    | 'pipelineComplete'
    | 'pipelineError';
  pipelineId: string;
  data: Record<string, unknown>;
}

/**
 * Subscribe to pipeline progress and forward events to WebView.
 *
 * Call this after StartPipeline tool returns successfully.
 * Automatically cleans up when pipeline completes or errors.
 * Collects a WorkflowRunReport and passes it to recordCompletedWorkflow.
 */
export function subscribeWorkflowProgress(
  webview: vscode.Webview | undefined,
  pipelineId: string,
  handle: WorkflowHandleFull,
  options?: WorkflowProgressOptions,
): void {
  // Send initial started message
  postToWebview(webview, {
    type: 'pipelineStarted',
    pipelineId,
    data: { flowId: handle.flowId, status: 'running' },
  });

  // Create report collector to track per-stage execution
  const collector = createReportCollector(pipelineId, handle.flowId as FlowId);

  // Consume events in background (fire-and-forget)
  void (async () => {
    try {
      for await (const event of handle.events) {
        // Feed event to report collector
        collector.processEvent(event as AgentWorkflowEvent);
        await forwardWorkflowEvent(pipelineId, event, options);

        switch (event.type) {
          case 'pipeline_start':
            postToWebview(webview, {
              type: 'pipelineStarted',
              pipelineId,
              data: { flowId: event['flowId'], stages: event['stages'] },
            });
            break;

          case 'stage_start': {
            const index = event['index'] as number;
            const total = event['total'] as number;
            postToWebview(webview, {
              type: 'pipelineStageStart',
              pipelineId,
              data: {
                stage: event['stage'],
                index,
                total,
                progress: total > 0 ? Math.round((index / total) * 100) : 0,
              },
            });
            break;
          }

          case 'stage_complete':
            postToWebview(webview, {
              type: 'pipelineStageComplete',
              pipelineId,
              data: { stage: event['stage'] },
            });
            break;

          case 'stage_skipped':
            postToWebview(webview, {
              type: 'pipelineStageSkipped',
              pipelineId,
              data: { stage: event['stage'], reason: event['reason'] },
            });
            break;

          case 'gate_waiting': {
            const ctx = event['preview'] as Record<string, unknown> | undefined;
            postToWebview(webview, {
              type: 'pipelineGateWaiting',
              pipelineId,
              data: buildGatePreview(event['stage'] as string, ctx),
            });
            break;
          }

          case 'task_progress':
            postToWebview(webview, {
              type: 'pipelineTaskProgress',
              pipelineId,
              data: {
                stage: event['stage'],
                taskId: event['taskId'],
                progress: event['progress'],
                total: event['total'],
              },
            });
            break;

          case 'pipeline_complete': {
            const result = event['result'] as Record<string, unknown> | undefined;
            postToWebview(webview, {
              type: 'pipelineComplete',
              pipelineId,
              data: {
                elementIds: result?.['elementIds'],
                totalDuration: result?.['totalDuration'],
                failedScenes: result?.['failedScenes'],
              },
            });
            // Record for retry + diagnostics (with run report)
            if (result) {
              const report = collector.finalize();
              recordCompletedWorkflow(
                pipelineId,
                { ...result, flowId: handle.flowId, context: result },
                report,
              );
            }
            removePipeline(pipelineId);
            break;
          }

          case 'pipeline_error': {
            postToWebview(webview, {
              type: 'pipelineError',
              pipelineId,
              data: { error: event['error'], stage: event['stage'] },
            });
            // Record failed report for diagnostics
            const report = collector.finalize();
            recordCompletedWorkflow(pipelineId, { flowId: handle.flowId }, report);
            removePipeline(pipelineId);
            break;
          }
        }
      }
    } catch (error) {
      logger.error('Pipeline event stream error', { pipelineId, error });
      postToWebview(webview, {
        type: 'pipelineError',
        pipelineId,
        data: {
          error: error instanceof Error ? error.message : String(error),
          stage: 'unknown',
        },
      });
      // Record report even on stream error
      const report = collector.finalize();
      recordCompletedWorkflow(pipelineId, { flowId: handle.flowId }, report);
      removePipeline(pipelineId);
    }
  })();
}

/**
 * Build enriched gate preview data from pipeline context.
 * Pairs each scene with its generated media path and flags failures.
 */
function buildGatePreview(
  stageName: string,
  ctx: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!ctx) return { stage: stageName, scenes: [] };

  const scenes = ctx['scenes'] as Array<Record<string, unknown>> | undefined;
  const generatedPaths = ctx['generatedPaths'] as string[] | undefined;
  const failedScenes = ctx['failedScenes'] as number[] | undefined;
  const failedSet = new Set(failedScenes ?? []);

  // Build review cards: pair each scene with its media
  const reviewCards = (scenes ?? []).map((scene, i) => ({
    sceneIndex: i,
    heading: scene['heading'] ?? '',
    description: scene['description'] ?? '',
    mediaPath: generatedPaths?.[i] ?? '',
    mediaType: 'image' as const, // TODO: detect from extension
    failed: failedSet.has(i),
  }));

  return {
    stage: stageName,
    scenes: reviewCards,
    globalStyle: ctx['globalStyle'] ?? '',
    failedIndices: failedScenes ?? [],
    totalScenes: scenes?.length ?? 0,
    generatedCount: generatedPaths?.length ?? 0,
  };
}

async function forwardWorkflowEvent(
  pipelineId: string,
  event: WorkflowEvent,
  options?: WorkflowProgressOptions,
): Promise<void> {
  if (!options?.eventCommand) {
    return;
  }

  try {
    await vscode.commands.executeCommand(options.eventCommand, {
      pipelineId,
      event,
      payload: options.eventPayload ?? {},
    });
  } catch (error) {
    logger.warn('Failed to forward pipeline event to command', {
      pipelineId,
      eventType: event.type,
      error,
    });
  }
}

function postToWebview(webview: vscode.Webview | undefined, message: PipelineWebViewMessage): void {
  if (!webview) {
    return;
  }

  webview.postMessage(message).then(undefined, (err) => {
    logger.warn('Failed to post pipeline message to webview', { error: err });
  });
}
