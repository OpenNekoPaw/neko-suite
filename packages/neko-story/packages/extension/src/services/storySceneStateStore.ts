import * as vscode from 'vscode';
import type {
  CanvasChangeEvent,
  CreatedCanvasStoryboardScene,
  NekoStoryScriptIndex,
} from '@neko/shared';

export type StoryAgentStatus =
  | 'not-requested'
  | 'ready'
  | 'review'
  | 'parsing'
  | 'prompt-review'
  | 'pilot-review'
  | 'generating'
  | 'timeline-arranged'
  | 'sent'
  | 'skipped'
  | 'failed';
export type StoryCanvasStatus = 'not-sent' | 'queued' | 'sent' | 'opened' | 'skipped';

export interface StorySceneState {
  readonly sceneId: string;
  readonly agentStatus: StoryAgentStatus;
  readonly canvasStatus: StoryCanvasStatus;
  readonly generationStatus?: 'idle' | 'generating' | 'done' | 'partial-fail';
  readonly timelineStatus?: 'not-arranged' | 'arranged';
  readonly lastError?: string;
}

interface StorySceneWorkflowRecord extends StorySceneState {
  readonly pipelineId?: string;
  readonly canvasSceneNodeId?: string;
  readonly shotIds?: readonly string[];
  readonly canvasFileUri?: string;
}

interface StorySceneStatePersistence {
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: unknown): Thenable<void>;
}

export interface StoryPipelineEventPayload {
  readonly scriptPath: string;
  /** Single scene (backward-compatible) */
  readonly sceneId?: string;
  /** Multiple scenes (batch mode) */
  readonly sceneIds?: readonly string[];
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
  ): { canvasSceneNodeId: string; shotIds: readonly string[]; canvasFileUri?: string } | undefined {
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
          canvasFileUri: record.canvasFileUri,
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
    // Resolve affected scene IDs — supports both single and batch mode
    const sceneIds = resolveSceneIds(payload);
    if (sceneIds.length === 0) return;

    const stage = event['stage'] as string | undefined;

    switch (event.type) {
      case 'pipeline_start':
        for (const sid of sceneIds) {
          this.updateSceneState(documentUri, scriptIndex, sid, {
            pipelineId,
            agentStatus: 'parsing',
            canvasStatus: 'queued',
            generationStatus: 'idle',
            timelineStatus: 'not-arranged',
            lastError: undefined,
          });
        }
        return;

      case 'stage_start':
        if (stage === 'parseStoryboard') {
          for (const sid of sceneIds) {
            this.updateSceneState(documentUri, scriptIndex, sid, {
              pipelineId,
              agentStatus: 'parsing',
            });
          }
        }
        return;

      case 'gate_waiting':
        if (stage === 'generatePrompts') {
          for (const sid of sceneIds) {
            this.updateSceneState(documentUri, scriptIndex, sid, {
              pipelineId,
              agentStatus: 'prompt-review',
            });
          }
        } else if (stage === 'generatePilot') {
          for (const sid of sceneIds) {
            this.updateSceneState(documentUri, scriptIndex, sid, {
              pipelineId,
              agentStatus: 'pilot-review',
            });
          }
        }
        return;

      case 'gate_confirmed':
        if (stage === 'generatePilot') {
          for (const sid of sceneIds) {
            this.updateSceneState(documentUri, scriptIndex, sid, {
              pipelineId,
              agentStatus: 'generating',
              generationStatus: 'generating',
            });
          }
        }
        return;

      case 'stage_complete':
        if (stage === 'importStoryboardToCanvas') {
          for (const sid of sceneIds) {
            this.updateSceneState(documentUri, scriptIndex, sid, {
              pipelineId,
              canvasStatus: 'sent',
            });
          }
        } else if (stage === 'parseStoryboard') {
          for (const sid of sceneIds) {
            this.updateSceneState(documentUri, scriptIndex, sid, {
              pipelineId,
              agentStatus: 'prompt-review',
            });
          }
        } else if (stage === 'batchGenerate') {
          for (const sid of sceneIds) {
            this.updateSceneState(documentUri, scriptIndex, sid, {
              pipelineId,
              generationStatus: 'generating',
            });
          }
        } else if (stage === 'arrangeOnTimeline') {
          for (const sid of sceneIds) {
            this.updateSceneState(documentUri, scriptIndex, sid, {
              pipelineId,
              agentStatus: 'timeline-arranged',
              timelineStatus: 'arranged',
            });
          }
        }
        return;

      case 'pipeline_complete': {
        const result = event['result'] as
          | {
              failedScenes?: number[];
              scenes?: Array<{ sceneId?: string; index: number }>;
              canvasStoryboard?: {
                scenes?: Array<{
                  sourceSceneId: string;
                  sceneNodeId: string;
                  shotIds: string[];
                }>;
              };
            }
          | undefined;

        // Determine which scene indices failed
        const failedSet = new Set(result?.failedScenes ?? []);
        const hasPartialFail = failedSet.size > 0;

        // Canvas import handling
        const canvasScenes = result?.canvasStoryboard?.scenes;

        for (const sid of sceneIds) {
          // Check canvas import for this scene
          const importedScene = canvasScenes?.find((s) => s.sourceSceneId === sid);
          if (importedScene) {
            this.recordCanvasImport(documentUri, scriptIndex, importedScene, {
              pipelineId,
              agentStatus: 'sent',
              generationStatus: hasPartialFail ? 'partial-fail' : 'done',
            });
            continue;
          }

          // Determine generation status for this specific scene
          const sceneEntry = result?.scenes?.find((s) => s.sceneId === sid);
          const sceneIdx = sceneEntry?.index;
          const sceneFailed = sceneIdx !== undefined && failedSet.has(sceneIdx);

          this.updateSceneState(documentUri, scriptIndex, sid, {
            pipelineId,
            agentStatus: sceneFailed ? 'failed' : 'sent',
            canvasStatus: 'queued',
            generationStatus: sceneFailed ? 'partial-fail' : 'done',
            lastError: sceneFailed ? 'Scene generation failed' : undefined,
          });
        }
        return;
      }

      case 'pipeline_error':
        for (const sid of sceneIds) {
          this.updateSceneState(documentUri, scriptIndex, sid, {
            pipelineId,
            agentStatus: 'failed',
            canvasStatus: 'not-sent',
            lastError: (event['error'] as string) ?? 'Unknown pipeline error',
          });
        }
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
    canvasFileUri?: string,
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
      ...(canvasFileUri ? { canvasFileUri } : {}),
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

/** Resolve the set of scene IDs affected by a pipeline event */
function resolveSceneIds(payload: StoryPipelineEventPayload): string[] {
  if (payload.sceneIds && payload.sceneIds.length > 0) {
    return [...payload.sceneIds];
  }
  if (payload.sceneId) {
    return [payload.sceneId];
  }
  return [];
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
