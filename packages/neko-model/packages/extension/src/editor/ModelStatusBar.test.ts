import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { createModelStatusItemSpecs, ModelStatusBar } from './ModelStatusBar';
import {
  formatModelEngineStatus,
  formatModelObjectCountStatus,
  formatModelSelectedNodeStatus,
} from './modelStatusProjection';

type MockStatusBarItem = {
  id: string;
  text: string;
  tooltip?: unknown;
  show: ReturnType<typeof vi.fn>;
  hide: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
};

const mocks = vi.hoisted(() => ({
  statusItems: new Map<string, MockStatusBarItem>(),
}));

vi.mock('vscode', () => ({
  StatusBarAlignment: { Left: 1, Right: 2 },
  window: {
    createStatusBarItem: vi.fn((id: string) => {
      const item = {
        id,
        text: '',
        show: vi.fn(),
        hide: vi.fn(),
        dispose: vi.fn(),
      };
      mocks.statusItems.set(id, item);
      return item;
    }),
    onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
    tabGroups: {
      activeTabGroup: { activeTab: { input: { viewType: 'neko.modelEditor' } } },
      onDidChangeTabs: vi.fn(() => ({ dispose: vi.fn() })),
      onDidChangeTabGroups: vi.fn(() => ({ dispose: vi.fn() })),
    },
  },
}));

describe('ModelStatusBar', () => {
  it('declares three model-only status specs with active custom editor metadata', () => {
    expect(createModelStatusItemSpecs().map((spec) => spec.id)).toEqual([
      'neko.model.selectedNode',
      'neko.model.objectCount',
      'neko.model.engineStatus',
    ]);
    expect(createModelStatusItemSpecs()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          activeCustomEditorId: 'neko.modelEditor',
          visibilityCondition: 'activeCustomEditorId == neko.modelEditor',
        }),
      ]),
    );
  });

  it('formats selected node, object count, and engine status text', () => {
    const snapshot = {
      selectedNodeName: 'Head',
      objectCount: 4,
      sceneControlStatus: 'ready' as const,
      sceneControlError: null,
      hasPendingPrediction: false,
      enginePort: 4999,
      sceneRevision: 12,
    };

    expect(formatModelSelectedNodeStatus(snapshot)).toBe('$(symbol-method) Head');
    expect(formatModelObjectCountStatus(snapshot)).toBe('$(symbol-array) 4 objects');
    expect(formatModelEngineStatus(snapshot)).toBe('$(check) Engine :4999 rev 12');
    expect(formatModelEngineStatus({ ...snapshot, hasPendingPrediction: true })).toBe(
      '$(sync~spin) Syncing rev 12',
    );
    expect(formatModelEngineStatus({ ...snapshot, sceneControlStatus: 'error' })).toBe(
      '$(error) Engine error',
    );
  });

  it('updates native status items without relying on Webview chrome', () => {
    const statusBar = new ModelStatusBar();

    statusBar.update({
      selectedNodeName: 'Armature',
      objectCount: 8,
      sceneControlStatus: 'ready',
      sceneControlError: null,
      hasPendingPrediction: false,
      enginePort: 3001,
      sceneRevision: 9,
    });

    expect(mocks.statusItems.get('neko.model.selectedNode')?.text).toBe(
      '$(symbol-method) Armature',
    );
    expect(mocks.statusItems.get('neko.model.objectCount')?.text).toBe('$(symbol-array) 8 objects');
    expect(mocks.statusItems.get('neko.model.engineStatus')?.text).toBe(
      '$(check) Engine :3001 rev 9',
    );

    statusBar.dispose();
  });

  it('uses VSCode status bar alignment metadata', () => {
    expect(createModelStatusItemSpecs()[0]?.alignment).toBe(vscode.StatusBarAlignment.Left);
  });
});
