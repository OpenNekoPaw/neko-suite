import * as vscode from 'vscode';
import {
  StatusBarProjectionManager,
  type StatusBarItemSpec,
} from '@neko/shared/vscode/extension';
import {
  MODEL_EDITOR_VIEW_TYPE,
  formatModelEngineStatus,
  formatModelObjectCountStatus,
  formatModelSelectedNodeStatus,
  getDefaultModelStatusSnapshot,
  type ModelStatusProjection,
  type ModelStatusSnapshot,
} from './modelStatusProjection';

const MODEL_STATUS_VISIBILITY = `activeCustomEditorId == ${MODEL_EDITOR_VIEW_TYPE}`;

export class ModelStatusBar implements vscode.Disposable, ModelStatusProjection {
  private readonly manager: StatusBarProjectionManager;
  private snapshot: ModelStatusSnapshot = getDefaultModelStatusSnapshot();

  constructor() {
    this.manager = new StatusBarProjectionManager(createModelStatusItemSpecs(this.snapshot));
  }

  update(status: ModelStatusSnapshot): void {
    this.snapshot = status;
    this.manager.update('neko.model.selectedNode', formatModelSelectedNodeStatus(status));
    this.manager.update('neko.model.objectCount', formatModelObjectCountStatus(status));
    this.manager.update(
      'neko.model.engineStatus',
      formatModelEngineStatus(status),
      status.sceneControlError ?? undefined,
    );
    this.manager.refresh();
  }

  reset(): void {
    this.update(getDefaultModelStatusSnapshot());
  }

  dispose(): void {
    this.manager.dispose();
  }
}

export function createModelStatusItemSpecs(
  status: ModelStatusSnapshot = getDefaultModelStatusSnapshot(),
): StatusBarItemSpec[] {
  return [
    {
      id: 'neko.model.selectedNode',
      alignment: vscode.StatusBarAlignment.Left,
      priority: 82,
      name: 'Neko Model Selected Node',
      text: formatModelSelectedNodeStatus(status),
      activeCustomEditorId: MODEL_EDITOR_VIEW_TYPE,
      visibilityCondition: MODEL_STATUS_VISIBILITY,
    },
    {
      id: 'neko.model.objectCount',
      alignment: vscode.StatusBarAlignment.Left,
      priority: 81,
      name: 'Neko Model Object Count',
      text: formatModelObjectCountStatus(status),
      activeCustomEditorId: MODEL_EDITOR_VIEW_TYPE,
      visibilityCondition: MODEL_STATUS_VISIBILITY,
    },
    {
      id: 'neko.model.engineStatus',
      alignment: vscode.StatusBarAlignment.Left,
      priority: 80,
      name: 'Neko Model Engine Status',
      text: formatModelEngineStatus(status),
      activeCustomEditorId: MODEL_EDITOR_VIEW_TYPE,
      visibilityCondition: MODEL_STATUS_VISIBILITY,
    },
  ];
}
