export const MODEL_EDITOR_VIEW_TYPE = 'neko.modelEditor';

export type ModelSceneControlStatusView = 'disconnected' | 'connecting' | 'ready' | 'error';

export interface ModelStatusSnapshot {
  readonly selectedNodeName: string | null;
  readonly objectCount: number;
  readonly sceneControlStatus: ModelSceneControlStatusView;
  readonly sceneControlError?: string | null;
  readonly hasPendingPrediction: boolean;
  readonly enginePort: number | null;
}

export interface ModelStatusProjection {
  update(status: ModelStatusSnapshot): void;
  reset(): void;
}

export function getDefaultModelStatusSnapshot(): ModelStatusSnapshot {
  return {
    selectedNodeName: null,
    objectCount: 0,
    sceneControlStatus: 'disconnected',
    sceneControlError: null,
    hasPendingPrediction: false,
    enginePort: null,
  };
}

export function formatModelSelectedNodeStatus(status: ModelStatusSnapshot): string {
  return status.selectedNodeName
    ? `$(symbol-method) ${status.selectedNodeName}`
    : '$(circle-slash) No selection';
}

export function formatModelObjectCountStatus(status: ModelStatusSnapshot): string {
  return `$(symbol-array) ${status.objectCount} objects`;
}

export function formatModelEngineStatus(status: ModelStatusSnapshot): string {
  if (status.hasPendingPrediction) {
    return '$(sync~spin) Syncing';
  }

  switch (status.sceneControlStatus) {
    case 'ready':
      return status.enginePort === null
        ? '$(check) Engine ready'
        : `$(check) Engine :${status.enginePort}`;
    case 'connecting':
      return '$(sync~spin) Engine connecting';
    case 'error':
      return '$(error) Engine error';
    case 'disconnected':
      return '$(circle-slash) Engine offline';
  }
}
