/**
 * Pipeline Progress Bridge — Forwards PipelineEvent to WebView via postMessage
 *
 * Subscribes to a PipelineHandle's event stream and converts each PipelineEvent
 * into a WebView-consumable message, following the same pattern as
 * AgentStreamProcessor._subscribeToTaskProgress().
 *
 * Also collects a PipelineRunReport via ReportCollector, passing it to
 * recordCompletedPipeline for in-memory diagnostics.
 */

import * as vscode from 'vscode';
import { getLogger } from '../base';
import { removePipeline, recordCompletedPipeline } from '../tools/pipelineTools';
import {
  createReportCollector,
  type FlowId,
  type PipelineEvent as AgentPipelineEvent,
} from '@neko/agent/pipeline';

// Pipeline event types from @neko/agent pipeline (inline to avoid cross-package import)
interface PipelineEvent {
  type: string;
  [key: string]: unknown;
}

interface PipelineHandleFull {
  readonly id: string;
  readonly flowId: string;
  readonly events: AsyncIterable<PipelineEvent>;
}

const logger = getLogger('PipelineProgressBridge');

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
 * Collects a PipelineRunReport and passes it to recordCompletedPipeline.
 */
export function subscribePipelineProgress(
  webview: vscode.Webview,
  pipelineId: string,
  handle: PipelineHandleFull,
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
        collector.processEvent(event as AgentPipelineEvent);

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
              recordCompletedPipeline(
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
            recordCompletedPipeline(pipelineId, { flowId: handle.flowId }, report);
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
      recordCompletedPipeline(pipelineId, { flowId: handle.flowId }, report);
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

function postToWebview(webview: vscode.Webview, message: PipelineWebViewMessage): void {
  webview.postMessage(message).then(undefined, (err) => {
    logger.warn('Failed to post pipeline message to webview', { error: err });
  });
}
