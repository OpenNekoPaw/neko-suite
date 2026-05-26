import { describe, expect, it, vi } from 'vitest';
import type { EngineSceneSnapshot } from '@neko/shared';
import {
  isEngineSceneSnapshot,
  mapEngineSceneSnapshotToModelGraph,
  ModelEditorProvider,
} from './ModelEditorProvider';

vi.mock('vscode', () => ({
  commands: {
    executeCommand: vi.fn(),
  },
  Uri: {
    file: (fsPath: string) => ({ fsPath, scheme: 'file' }),
    joinPath: (base: { fsPath?: string }, ...parts: string[]) => ({
      fsPath: [base.fsPath, ...parts].filter(Boolean).join('/'),
      scheme: 'file',
    }),
  },
  workspace: {
    workspaceFolders: [],
    fs: {
      stat: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      createDirectory: vi.fn(),
      copy: vi.fn(),
    },
  },
  window: {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      dispose: vi.fn(),
    })),
    registerCustomEditorProvider: vi.fn(() => ({ dispose: vi.fn() })),
  },
  l10n: {
    t: (key: string) => key,
  },
}));

vi.mock('@neko/neko-client', () => ({
  EngineClient: vi.fn(),
}));

describe('ModelEditorProvider model API mapping', () => {
  it('projects engine scene nodes with bounds and materials into compact model graph data', () => {
    const graph = mapEngineSceneSnapshotToModelGraph(createSceneSnapshot(), './hero.glb');

    expect(graph).toMatchObject({
      sceneId: 'scene-main',
      activeModelPath: './hero.glb',
      materials: [{ id: 'mat-body', name: './body.png' }],
      animations: [{ name: 'Idle', index: 0, duration: 2.5 }],
    });
    expect(graph.nodes[0]).toMatchObject({
      id: 'node-body',
      name: 'Body',
      parentId: null,
      visible: true,
      kind: 'mesh',
      materialIds: ['mat-body'],
      bounds: {
        min: { x: -1, y: 0, z: -1 },
        max: { x: 1, y: 2, z: 1 },
      },
      worldBounds: {
        min: { x: -1, y: 0, z: -1 },
        max: { x: 1, y: 2, z: 1 },
      },
    });
  });

  it('rejects malformed engine scene snapshots at the extension boundary', () => {
    expect(isEngineSceneSnapshot(createSceneSnapshot())).toBe(true);
    expect(isEngineSceneSnapshot({ sceneId: 'scene-main', revision: 7 })).toBe(false);
    expect(
      isEngineSceneSnapshot({
        ...createSceneSnapshot(),
        nodes: [{ id: 'legacy-node', name: 'Legacy', visible: true, children: [] }],
      }),
    ).toBe(false);
    expect(
      isEngineSceneSnapshot({
        ...createSceneSnapshot(),
        animations: [{ name: 'Broken', duration: Number.NaN }],
      }),
    ).toBe(false);
  });

  it('returns safe diagnostics when no model editor is active', async () => {
    const provider = new ModelEditorProvider(createExtensionContext());
    const api = provider.getModelApi();

    await expect(api.getSceneGraph()).resolves.toBeUndefined();
    await expect(api.listAnimations()).resolves.toEqual([]);
    expect(api.getActiveModelPath()).toBeUndefined();
    await expect(
      api.setNodeTransform('node-body', { position: { x: 1, y: 2, z: 3 } }),
    ).resolves.toEqual({
      ok: false,
      message: 'No active model editor is available.',
    });
    await expect(
      api.updateViewportCamera?.({
        position: [0, 1, 2],
        target: [0, 0, 0],
      }),
    ).resolves.toEqual({
      ok: false,
      message: 'No active model editor is available.',
    });
  });

  it('projects webview model status updates to the model status bar', async () => {
    const statusProjection = { update: vi.fn(), reset: vi.fn() };
    const provider = new ModelEditorProvider(createExtensionContext(), statusProjection);
    const internals = provider as unknown as ModelEditorProviderInternals;
    const panel = createWebviewPanel();
    const document = { uri: { fsPath: '/workspace/hero.nkm', scheme: 'file' } };
    internals.activeWebviewPanel = panel;
    internals.activeDocument = document;
    internals.panelGeneration = 1;

    await internals.handleWebviewMessage(
      {
        type: 'modelStatus',
        selectedNodeName: 'Head',
        objectCount: 4,
        sceneControlStatus: 'ready',
        sceneControlError: null,
        hasPendingPrediction: false,
        enginePort: 3001,
        sceneRevision: 17,
      },
      panel,
      document,
      1,
    );

    expect(statusProjection.update).toHaveBeenCalledWith({
      selectedNodeName: 'Head',
      objectCount: 4,
      sceneControlStatus: 'ready',
      sceneControlError: null,
      hasPendingPrediction: false,
      enginePort: 3001,
      sceneRevision: 17,
    });
  });

  it('reports viewport camera acknowledgement and rejection through model API results', async () => {
    const provider = new ModelEditorProvider(createExtensionContext());
    const internals = provider as unknown as ModelEditorProviderInternals;
    const updateEditorCamera = vi.fn(async () => undefined);
    internals.activeWebviewPanel = {};
    internals.activeDocument = {};
    internals.lastSceneSnapshot = createSceneSnapshot();
    internals.engineClient = { updateEditorCamera };

    const api = provider.getModelApi();
    await expect(
      api.updateViewportCamera?.({
        viewportId: 'main',
        position: [1, 2, 3],
        target: [0, 1, 0],
        fovY: 45,
      }),
    ).resolves.toEqual({ ok: true, revision: 7 });
    expect(updateEditorCamera).toHaveBeenCalledWith([1, 2, 3], [0, 1, 0], 45, 'main');

    updateEditorCamera.mockRejectedValueOnce(new Error('camera rejected'));
    await expect(
      api.updateViewportCamera?.({
        position: [2, 3, 4],
        target: [0, 0, 0],
      }),
    ).resolves.toEqual({ ok: false, message: 'camera rejected' });
  });

  it('keeps the last valid scene snapshot when refresh returns malformed engine data', async () => {
    const provider = new ModelEditorProvider(createExtensionContext());
    const internals = provider as unknown as ModelEditorProviderInternals;
    internals.activeWebviewPanel = {};
    internals.activeDocument = {};
    internals.activeModelPath = './hero.glb';
    internals.lastSceneSnapshot = createSceneSnapshot();
    internals.engineClient = {
      updateEditorCamera: vi.fn(async () => undefined),
      getSceneSnapshot: vi.fn(async () => ({
        sceneId: 'broken',
        revision: 8,
        nodes: [{ id: 'legacy-node', name: 'Legacy', visible: true, children: [] }],
        animations: [],
      })),
    };

    const graph = await provider.getModelApi().getSceneGraph();

    expect(graph?.sceneId).toBe('scene-main');
    expect(graph?.engineSnapshot?.revision).toBe(7);
    expect(graph?.nodes[0]?.id).toBe('node-body');
    expect(internals.lastSceneSnapshot?.sceneId).toBe('scene-main');
  });
});

interface ModelEditorProviderInternals {
  activeWebviewPanel: unknown;
  activeDocument: unknown;
  panelGeneration: number;
  lastSceneSnapshot: EngineSceneSnapshot | undefined;
  activeModelPath: string | undefined;
  engineClient:
    | {
        updateEditorCamera(
          position: [number, number, number],
          target: [number, number, number],
          fovY?: number,
          viewportId?: string,
        ): Promise<void>;
        getSceneSnapshot?: () => Promise<unknown>;
      }
    | undefined;
  handleWebviewMessage(
    message: Record<string, unknown>,
    panel: unknown,
    document: unknown,
    generation: number,
  ): Promise<void>;
}

function createSceneSnapshot(): EngineSceneSnapshot {
  return {
    sceneId: 'scene-main',
    revision: 7,
    nodes: [
      {
        nodeId: 'node-body',
        name: 'Body',
        children: [],
        visible: true,
        kind: 'mesh',
        material: { id: 'mat-body', uri: './body.png' },
        transform: {
          position: { x: 0, y: 1, z: 2 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          scale: { x: 1, y: 1, z: 1 },
        },
        bounds: {
          min: { x: -1, y: 0, z: -1 },
          max: { x: 1, y: 2, z: 1 },
        },
        worldBounds: {
          min: { x: -1, y: 0, z: -1 },
          max: { x: 1, y: 2, z: 1 },
        },
      },
    ],
    animations: [{ name: 'Idle', duration: 2.5 }],
  };
}

function createExtensionContext(): ConstructorParameters<typeof ModelEditorProvider>[0] {
  return {
    subscriptions: [],
    extensionUri: { fsPath: '/ext', scheme: 'file' },
    extensionMode: 3,
  } as unknown as ConstructorParameters<typeof ModelEditorProvider>[0];
}

function createWebviewPanel() {
  return {
    webview: {
      postMessage: vi.fn(async () => true),
    },
    visible: true,
  };
}
