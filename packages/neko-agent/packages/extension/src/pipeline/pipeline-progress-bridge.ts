/**
 * Pipeline Progress Bridge — Forwards PipelineEvent to WebView via postMessage
 *
 * Subscribes to a PipelineHandle's event stream and converts each PipelineEvent
 * into a WebView-consumable message, following the same pattern as
 * AgentStreamProcessor._subscribeToTaskProgress().
 */

import * as vscode from 'vscode';
import { getLogger } from '../base';
import { removePipeline, recordCompletedPipeline } from '../tools/pipelineTools';

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
 */
/**
 * Subscribe to pipeline progress and forward events to WebView.
 *
 * @param webview - Target webview for postMessage
 * @param pipelineId - Pipeline execution ID
 * @param handle - Pipeline handle with events stream
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

  // Consume events in background (fire-and-forget)
  void (async () => {
    try {
      for await (const event of handle.events) {
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
            const preview = event['preview'] as Record<string, unknown> | undefined;
            postToWebview(webview, {
              type: 'pipelineGateWaiting',
              pipelineId,
              data: {
                stage: event['stage'],
                scenes: preview?.['scenes'],
              },
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
            // Record for retry support
            if (result) {
              recordCompletedPipeline(pipelineId, {
                ...result,
                flowId: handle.flowId,
                context: result,
              });
            }
            removePipeline(pipelineId);
            break;
          }

          case 'pipeline_error':
            postToWebview(webview, {
              type: 'pipelineError',
              pipelineId,
              data: { error: event['error'], stage: event['stage'] },
            });
            removePipeline(pipelineId);
            break;
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
      removePipeline(pipelineId);
    }
  })();
}

function postToWebview(webview: vscode.Webview, message: PipelineWebViewMessage): void {
  webview.postMessage(message).then(undefined, (err) => {
    logger.warn('Failed to post pipeline message to webview', { error: err });
  });
}
