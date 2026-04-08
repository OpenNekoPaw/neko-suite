import * as vscode from 'vscode';
import type { NekoStoryScriptIndex } from '@neko/shared';

export type StoryAgentStatus = 'not-requested' | 'ready' | 'review' | 'sent' | 'skipped';
export type StoryCanvasStatus = 'not-sent' | 'queued' | 'sent' | 'opened' | 'skipped';

export interface StorySceneState {
  readonly sceneId: string;
  readonly agentStatus: StoryAgentStatus;
  readonly canvasStatus: StoryCanvasStatus;
}

interface StorySceneWorkflowRecord extends StorySceneState {
  readonly pipelineId?: string;
  readonly canvasSceneNodeId?: string;
  readonly shotIds?: readonly string[];
}

export interface StoryPipelineEventPayload {
  readonly scriptPath: string;
  readonly sceneId: string;
}

export class StorySceneStateStore implements vscode.Disposable {
  private readonly statesByDocument = new Map<string, Record<string, StorySceneWorkflowRecord>>();
  private readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();

  readonly onDidChange = this.onDidChangeEmitter.event;

  syncDocument(
    documentUri: vscode.Uri,
    scriptIndex: NekoStoryScriptIndex,
  ): Record<string, StorySceneState> {
    const key = documentUri.toString();
    const current = this.statesByDocument.get(key) ?? {};
    const next: Record<string, StorySceneWorkflowRecord> = {};

    for (const scene of scriptIndex.scenes) {
      next[scene.sceneId] = current[scene.sceneId] ?? {
        sceneId: scene.sceneId,
        agentStatus: 'not-requested',
        canvasStatus: 'not-sent',
      };
    }

    this.statesByDocument.set(key, next);
    return next;
  }

  getSceneStates(
    documentUri: vscode.Uri,
    scriptIndex: NekoStoryScriptIndex,
  ): Record<string, StorySceneState> {
    return this.syncDocument(documentUri, scriptIndex);
  }

  updateSceneState(
    documentUri: vscode.Uri,
    scriptIndex: NekoStoryScriptIndex,
    sceneId: string,
    nextState: Partial<StorySceneWorkflowRecord>,
  ): void {
    const current = this.syncDocument(documentUri, scriptIndex);
    const existing = current[sceneId];
    if (!existing) {
      return;
    }

    const next = {
      ...(this.statesByDocument.get(documentUri.toString()) ?? {}),
      [sceneId]: {
        ...existing,
        ...nextState,
        sceneId,
      },
    };

    this.statesByDocument.set(documentUri.toString(), next);
    this.onDidChangeEmitter.fire(documentUri);
  }

  handlePipelineEvent(
    scriptIndex: NekoStoryScriptIndex,
    payload: StoryPipelineEventPayload,
    pipelineId: string,
    event: { type: string; [key: string]: unknown },
  ): void {
    const documentUri = vscode.Uri.parse(scriptIndex.uri);
    const sceneId = payload.sceneId;

    switch (event.type) {
      case 'pipeline_start':
        this.updateSceneState(documentUri, scriptIndex, sceneId, {
          pipelineId,
          agentStatus: 'review',
          canvasStatus: 'queued',
        });
        return;
      case 'stage_complete':
        if (event['stage'] === 'importStoryboardToCanvas') {
          this.updateSceneState(documentUri, scriptIndex, sceneId, {
            pipelineId,
            canvasStatus: 'sent',
          });
        }
        return;
      case 'pipeline_complete': {
        const result = event['result'] as
          | {
              canvasStoryboard?: {
                scenes?: Array<{
                  sourceSceneId: string;
                  sceneNodeId: string;
                  shotIds: string[];
                }>;
              };
            }
          | undefined;
        const importedScene = result?.canvasStoryboard?.scenes?.find(
          (scene) => scene.sourceSceneId === sceneId,
        );
        this.updateSceneState(documentUri, scriptIndex, sceneId, {
          pipelineId,
          agentStatus: 'sent',
          canvasStatus: importedScene ? 'sent' : 'queued',
          canvasSceneNodeId: importedScene?.sceneNodeId,
          shotIds: importedScene?.shotIds,
        });
        return;
      }
      case 'pipeline_error':
        this.updateSceneState(documentUri, scriptIndex, sceneId, {
          pipelineId,
          agentStatus: 'ready',
          canvasStatus: 'not-sent',
        });
        return;
      default:
        return;
    }
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
  }
}
