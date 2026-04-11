import * as vscode from 'vscode';
import type {
  CanvasChangeEvent,
  CreatedCanvasStoryboardScene,
  NekoStoryScriptIndex,
} from '@neko/shared';

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

interface StorySceneStatePersistence {
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: unknown): Thenable<void>;
}

export interface StoryPipelineEventPayload {
  readonly scriptPath: string;
  readonly sceneId: string;
}

export class StorySceneStateStore implements vscode.Disposable {
  private static readonly storageKey = 'neko.story.sceneStateStore';
  private readonly statesByDocument = new Map<string, Record<string, StorySceneWorkflowRecord>>();
  private readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  private readonly persistence?: StorySceneStatePersistence;

  readonly onDidChange = this.onDidChangeEmitter.event;

  constructor(persistence?: StorySceneStatePersistence) {
    this.persistence = persistence;
    this.restoreFromPersistence();
  }

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
    this.persist();
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
    this.persist();
    this.onDidChangeEmitter.fire(documentUri);
  }

  /**
   * Returns the canvas binding for a given sceneId, searching across all tracked documents.
   * Used by SceneWorkspaceIndexService to resolve scene-canvas relationships.
   */
  getCanvasBinding(
    sceneId: string,
    documentUri?: vscode.Uri,
  ): { canvasSceneNodeId: string; shotIds: readonly string[] } | undefined {
    const searchEntries = documentUri
      ? [[documentUri.toString(), this.statesByDocument.get(documentUri.toString())] as const]
      : this.statesByDocument.entries();

    for (const [, records] of searchEntries) {
      if (!records) continue;
      const record = records[sceneId];
      if (record?.canvasSceneNodeId) {
        return {
          canvasSceneNodeId: record.canvasSceneNodeId,
          shotIds: record.shotIds ?? [],
        };
      }
    }
    return undefined;
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
        if (importedScene) {
          this.recordCanvasImport(documentUri, scriptIndex, importedScene, {
            pipelineId,
            agentStatus: 'sent',
          });
          return;
        }

        this.updateSceneState(documentUri, scriptIndex, sceneId, {
          pipelineId,
          agentStatus: 'sent',
          canvasStatus: 'queued',
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

  recordCanvasImport(
    documentUri: vscode.Uri,
    scriptIndex: NekoStoryScriptIndex,
    importedScene: CreatedCanvasStoryboardScene,
    nextState: Partial<StorySceneWorkflowRecord> = {},
  ): void {
    const current = this.getSceneStates(documentUri, scriptIndex)[importedScene.sourceSceneId];
    if (!current) {
      return;
    }

    this.updateSceneState(documentUri, scriptIndex, importedScene.sourceSceneId, {
      ...nextState,
      canvasStatus: current.canvasStatus === 'opened' ? 'opened' : 'sent',
      canvasSceneNodeId: importedScene.sceneNodeId,
      shotIds: importedScene.shotIds,
    });
  }

  handleCanvasEvent(event: CanvasChangeEvent): void {
    const changedDocumentKeys = new Set<string>();

    if (event.storyboardImport && event.sourceScriptUri) {
      const documentKey = normalizeDocumentKey(event.sourceScriptUri);
      const current = this.statesByDocument.get(documentKey);
      if (current) {
        const next = { ...current };
        let changed = false;

        for (const scene of event.storyboardImport.scenes) {
          const existing = next[scene.sourceSceneId];
          if (!existing || existing.canvasStatus === 'skipped') {
            continue;
          }

          next[scene.sourceSceneId] = {
            ...existing,
            canvasStatus: 'opened',
            canvasSceneNodeId: scene.sceneNodeId,
            shotIds: scene.shotIds,
          };
          changed = true;
        }

        if (changed) {
          this.statesByDocument.set(documentKey, next);
          changedDocumentKeys.add(documentKey);
        }
      }
    }

    const nodeIds = collectCanvasEventNodeIds(event);
    if (nodeIds.size > 0) {
      for (const [documentKey, sceneStates] of this.statesByDocument.entries()) {
        const next = { ...sceneStates };
        let changed = false;

        for (const [sceneId, state] of Object.entries(sceneStates)) {
          if (state.canvasStatus === 'skipped' || state.canvasStatus === 'opened') {
            continue;
          }

          if (!matchesCanvasNodes(state, nodeIds)) {
            continue;
          }

          next[sceneId] = {
            ...state,
            canvasStatus: 'opened',
          };
          changed = true;
        }

        if (changed) {
          this.statesByDocument.set(documentKey, next);
          changedDocumentKeys.add(documentKey);
        }
      }
    }

    if (changedDocumentKeys.size === 0) {
      return;
    }

    this.persist();
    for (const documentKey of changedDocumentKeys) {
      this.onDidChangeEmitter.fire(vscode.Uri.parse(documentKey));
    }
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
  }

  private restoreFromPersistence(): void {
    const stored = this.persistence?.get<Record<string, Record<string, StorySceneWorkflowRecord>>>(
      StorySceneStateStore.storageKey,
      {},
    );
    if (!stored) {
      return;
    }

    for (const [documentUri, sceneStates] of Object.entries(stored)) {
      this.statesByDocument.set(documentUri, sceneStates);
    }
  }

  private persist(): void {
    if (!this.persistence) {
      return;
    }

    const serialized = Object.fromEntries(this.statesByDocument.entries());
    void this.persistence.update(StorySceneStateStore.storageKey, serialized);
  }
}

function normalizeDocumentKey(uriOrPath: string): string {
  return uriOrPath.includes('://')
    ? vscode.Uri.parse(uriOrPath).toString()
    : vscode.Uri.file(uriOrPath).toString();
}

function collectCanvasEventNodeIds(event: CanvasChangeEvent): ReadonlySet<string> {
  return new Set(
    [event.nodeId, ...(event.nodeIds ?? [])].filter(
      (nodeId): nodeId is string => typeof nodeId === 'string' && nodeId.length > 0,
    ),
  );
}

function matchesCanvasNodes(
  state: StorySceneWorkflowRecord,
  nodeIds: ReadonlySet<string>,
): boolean {
  if (state.canvasSceneNodeId && nodeIds.has(state.canvasSceneNodeId)) {
    return true;
  }

  return (state.shotIds ?? []).some((shotId) => nodeIds.has(shotId));
}
