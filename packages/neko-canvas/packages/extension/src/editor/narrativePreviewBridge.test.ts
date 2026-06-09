import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  ViewColumn: { Beside: 2 },
  window: {
    createWebviewPanel: vi.fn(),
  },
}));

import {
  createCanvasPlaybackPlanFromCanvasData,
  createNarrativeGraphSnapshotFromCanvasData,
  NarrativePreviewBridge,
  parsePreviewToCanvasMessage,
  type NarrativePreviewPanelFactory,
} from './narrativePreviewBridge';
import type {
  CanvasData,
  CanvasPlaybackPlan,
  NarrativeGraphSnapshot,
  PreviewToCanvasMessage,
} from '@neko/shared';

describe('createNarrativeGraphSnapshotFromCanvasData', () => {
  it('extracts runtime nodes, edges, metadata, variables, scene refs, and character bindings', () => {
    const canvas = createCanvasData();
    const snapshot = createNarrativeGraphSnapshotFromCanvasData(canvas, {
      revision: 7,
      sourceCanvasUri: 'file:///story/branch.nkc',
    });

    expect(snapshot.revision).toBe(7);
    expect(snapshot.sourceCanvasUri).toBe('file:///story/branch.nkc');
    expect(snapshot.metadata).toEqual({
      entryNodeId: 'start',
      genre: 'visual-novel',
      defaultLocale: 'zh-cn',
      variables: [{ id: 'affection', name: 'Affection', value: 2 }],
    });
    expect(snapshot.nodes.map((node) => node.nodeId)).toEqual([
      'start',
      'scene-a',
      'choice-a',
      'ending-a',
    ]);
    expect(snapshot.nodes.some((node) => node.nodeId === 'note-a')).toBe(false);
    expect(snapshot.nodes.find((node) => node.nodeId === 'scene-a')?.scene).toMatchObject({
      sceneRef: 'scenes/cafe.fountain',
      backgroundRef: { kind: 'relative-path', path: 'assets/bg/cafe.png' },
      characters: ['characters/hero.yaml'],
      variableEffects: [{ variableId: 'affection', operation: 'add', value: 1 }],
    });
    expect(snapshot.nodes.find((node) => node.nodeId === 'ending-a')?.ending).toEqual({
      endingType: 'good',
      endingLabel: 'Good Ending',
      statisticsSummary: true,
    });
    expect(snapshot.connections).toEqual([
      {
        connectionId: 'c-start-scene',
        sourceNodeId: 'start',
        targetNodeId: 'scene-a',
        type: 'default',
        choiceText: undefined,
        condition: undefined,
        priority: 0,
      },
      {
        connectionId: 'c-scene-choice',
        sourceNodeId: 'scene-a',
        targetNodeId: 'choice-a',
        type: 'choice',
        choiceText: 'Stay',
        condition: 'affection >= 1',
        priority: 2,
      },
      {
        connectionId: 'c-choice-ending',
        sourceNodeId: 'choice-a',
        targetNodeId: 'ending-a',
        type: 'choice',
        choiceText: 'Leave',
        condition: undefined,
        priority: 0,
      },
    ]);
  });
});

describe('NarrativePreviewBridge', () => {
  it('opens, reveals, closes, and reopens a Preview panel without retaining disposed panels', () => {
    const host = createHost(createSnapshot(1));
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(host, {
      panelFactory,
      now: () => 1000,
    });

    expect(bridge.open()).toBe(true);
    expect(panelFactory.createdPanels).toHaveLength(1);
    expect(panelFactory.createdPanels[0]?.webview.postMessage).not.toHaveBeenCalled();
    expect(readBootstrapMessages(panelFactory.createdPanels[0]?.webview.html ?? '')).toEqual([
      expect.objectContaining({
        type: 'preview:setFeatureToggles',
        requestId: 'canvas-narrative:toggles:1000:1',
        revision: 1,
        toggles: expect.objectContaining({ preview: true }),
      }),
      expect.objectContaining({
        type: 'preview:loadGraph',
        requestId: 'canvas-narrative:load:1000:2',
        revision: 1,
      }),
    ]);

    expect(bridge.open()).toBe(true);
    expect(panelFactory.createdPanels).toHaveLength(1);
    expect(panelFactory.createdPanels[0]?.reveal).toHaveBeenCalledTimes(1);
    expect(panelFactory.createdPanels[0]?.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'preview:loadGraph',
        requestId: 'canvas-narrative:load:1000:4',
        revision: 1,
      }),
    );

    panelFactory.createdPanels[0]?.dispose();
    expect(bridge.open()).toBe(true);
    expect(panelFactory.createdPanels).toHaveLength(2);

    bridge.dispose();
    expect(panelFactory.createdPanels[1]?.dispose).toHaveBeenCalledTimes(1);
  });

  it('posts Canvas playback plan messages alongside narrative graph messages', () => {
    const plan = createCanvasPlaybackPlanFromCanvasData(createStoryboardCanvasData());
    const host = createHost(createSnapshot(4), () => plan);
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(host, {
      panelFactory,
      now: () => 3000,
    });

    expect(bridge.open()).toBe(true);
    const bootstrapMessages = readBootstrapMessages(
      panelFactory.createdPanels[0]?.webview.html ?? '',
    );
    expect(bootstrapMessages).toEqual([
      expect.objectContaining({ type: 'preview:setFeatureToggles', revision: 4 }),
      expect.objectContaining({
        type: 'preview:loadGraph',
        requestId: 'canvas-narrative:load:3000:2',
        revision: 4,
      }),
      expect.objectContaining({
        type: 'preview:loadPlaybackPlan',
        requestId: 'canvas-narrative:load-plan:3000:3',
        revision: 4,
        plan: expect.objectContaining({
          adapterId: 'storyboard',
          units: expect.arrayContaining([
            expect.objectContaining({
              id: 'shot-a1',
              kind: 'shot',
              durationMs: 2000,
              metadata: expect.objectContaining({ visualDescription: 'Opening' }),
            }),
          ]),
        }),
      }),
    ]);

    expect(bridge.refresh()).toBe(true);
    expect(panelFactory.createdPanels[0]?.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'preview:refreshPlaybackPlan',
        requestId: 'canvas-narrative:refresh-plan:3000:6',
        revision: 4,
      }),
    );
  });

  it('embeds initial preview messages into first-open HTML before Webview readiness', () => {
    const plan = createCanvasPlaybackPlanFromCanvasData(createStoryboardCanvasData());
    const host = createHost(createSnapshot(6), () => plan);
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(host, {
      panelFactory,
      now: () => 3200,
    });

    expect(bridge.open()).toBe(true);
    const panel = panelFactory.createdPanels[0];
    expect(panel?.webview.postMessage).not.toHaveBeenCalled();
    expect(readBootstrapMessages(panel?.webview.html ?? '')).toEqual([
      expect.objectContaining({ type: 'preview:setFeatureToggles', revision: 6 }),
      expect.objectContaining({ type: 'preview:loadGraph', revision: 6 }),
      expect.objectContaining({ type: 'preview:loadPlaybackPlan', revision: 6 }),
    ]);

    panel?.webview.receiveMessage({
      type: 'preview:webviewReady',
      requestId: 'ready',
    });

    expect(panel?.webview.postMessage).not.toHaveBeenCalled();
  });

  it('renders the Canvas playback preview shell instead of a status-only placeholder', () => {
    const host = createHost(createSnapshot(4), () =>
      createCanvasPlaybackPlanFromCanvasData(createStoryboardCanvasData()),
    );
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(host, {
      panelFactory,
      now: () => 3100,
    });

    expect(bridge.open()).toBe(true);
    const html = panelFactory.createdPanels[0]?.webview.html ?? '';

    expect(html).toContain('id="playback-preview"');
    expect(html).toContain('id="unit-timeline"');
    expect(html).toContain('id="stage-progress"');
    expect(html).toContain('id="playback-clock"');
    expect(html).toContain('id="current-stage-progress-fill"');
    expect(html).toContain('id="unit-meta"');
    expect(html).toContain('formatUnitBody');
    expect(html).toContain('formatClockTime');
    expect(html).toContain('img-src vscode-webview: data: blob: https:');
    expect(html).toContain('media-src vscode-webview: data: blob: https:');
    expect(html).toContain('canvas:highlightNode');
    expect(html).toContain('Storyboard Preview');
  });

  it('keeps storyboard Canvas playback available when narrative snapshot has zero runtime nodes', () => {
    const canvas = createStoryboardCanvasData();
    const snapshot = createNarrativeGraphSnapshotFromCanvasData(canvas, { revision: 5 });
    const plan = createCanvasPlaybackPlanFromCanvasData(canvas);

    expect(snapshot.nodes).toHaveLength(0);
    expect(plan).toMatchObject({
      adapterId: 'storyboard',
      behaviorMode: 'linear',
      units: [
        expect.objectContaining({ id: 'shot-a1', kind: 'shot' }),
        expect.objectContaining({ id: 'shot-a2', kind: 'shot' }),
      ],
    });
    expect(plan?.diagnostics.some((item) => item.code === 'playback-narrative-runtime-only')).toBe(
      false,
    );
  });

  it('drops stale Preview-to-Canvas messages after newer revisions are posted', () => {
    let revision = 2;
    const host = createHost(() => createSnapshot(revision));
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(host, {
      panelFactory,
      now: () => 2000,
    });

    bridge.open();
    revision = 3;
    expect(bridge.refresh()).toBe(true);
    expect(bridge.jumpTo('scene-a')).toBe(true);
    expect(bridge.setVariables({ affection: 4 })).toBe(true);
    expect(panelFactory.createdPanels[0]?.webview.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'preview:setVariables',
        requestId: 'canvas-narrative:variables:2000:8',
        revision: 3,
        variables: { affection: 4 },
      }),
    );

    expect(
      bridge.handlePreviewMessage({
        type: 'canvas:highlightNode',
        requestId: 'old',
        nodeId: 'scene-a',
        revision: 2,
      } as PreviewToCanvasMessage),
    ).toBe(false);
    expect(host.postNarrativePreviewCanvasMessage).not.toHaveBeenCalled();

    expect(
      bridge.handlePreviewMessage({
        type: 'canvas:highlightNode',
        requestId: 'current',
        nodeId: 'scene-a',
        revision: 3,
      } as PreviewToCanvasMessage),
    ).toBe(true);
    expect(host.postNarrativePreviewCanvasMessage).toHaveBeenCalledWith(
      expect.objectContaining({ nodeId: 'scene-a' }),
    );
  });

  it('hard gates panel creation when Narrative Preview is disabled', () => {
    const host = createHost(createSnapshot(1));
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(host, {
      panelFactory,
      getFeatureToggles: () => ({
        preview: false,
        typewriterEffect: true,
        autoExpressionMatch: true,
        showLockedChoices: true,
        previewAutoSync: true,
        live2dPerformance: false,
      }),
    });

    expect(bridge.open()).toBe(false);
    expect(panelFactory.createdPanels).toHaveLength(0);
    expect(host.extractNarrativeGraphSnapshot).not.toHaveBeenCalled();
  });

  it('parses typed Preview-to-Canvas messages and rejects malformed payloads', () => {
    expect(
      parsePreviewToCanvasMessage({
        type: 'canvas:choiceMade',
        requestId: 'choice-1',
        fromNodeId: 'choice-a',
        toNodeId: 'ending-a',
      }),
    ).toEqual({
      type: 'canvas:choiceMade',
      requestId: 'choice-1',
      fromNodeId: 'choice-a',
      toNodeId: 'ending-a',
    });
    expect(parsePreviewToCanvasMessage({ type: 'canvas:highlightNode' })).toBeUndefined();
    expect(
      parsePreviewToCanvasMessage({ type: 'preview:loadGraph', requestId: 'x' }),
    ).toBeUndefined();
  });
});

function createCanvasData(): CanvasData {
  return {
    version: '2.1',
    name: 'Branching Story',
    viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
    narrative: {
      entryNodeId: 'start',
      genre: 'visual-novel',
      defaultLocale: 'zh-cn',
      variables: [{ id: 'affection', name: 'Affection', value: 2 }],
    },
    nodes: [
      createNode('start', 'narrative-start', { label: 'Start' }),
      createNode('scene-a', 'narrative-scene', {
        title: 'Cafe',
        sceneRef: 'scenes/cafe.fountain',
        backgroundRef: 'assets/bg/cafe.png',
        characters: ['characters/hero.yaml'],
        variableEffects: [{ variableId: 'affection', operation: 'add', value: 1 }],
      }),
      createNode('choice-a', 'choice', { label: 'Choice' }),
      createNode('ending-a', 'narrative-ending', {
        endingType: 'good',
        endingLabel: 'Good Ending',
        statisticsSummary: true,
      }),
      createNode('note-a', 'narrative-note', { content: 'Editor only' }),
    ],
    connections: [
      createConnection('c-start-scene', 'start', 'scene-a', 'default'),
      createConnection('c-scene-choice', 'scene-a', 'choice-a', 'choice', {
        choiceText: 'Stay',
        condition: 'affection >= 1',
        priority: 2,
      }),
      createConnection('c-choice-ending', 'choice-a', 'ending-a', 'choice', {
        label: 'Leave',
      }),
      createConnection('c-note-scene', 'note-a', 'scene-a', 'default'),
    ],
  };
}

function createNode(
  id: string,
  type: CanvasData['nodes'][number]['type'],
  data: Record<string, unknown>,
): CanvasData['nodes'][number] {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    size: { width: 200, height: 120 },
    zIndex: 1,
    data,
  } as CanvasData['nodes'][number];
}

function createConnection(
  id: string,
  sourceId: string,
  targetId: string,
  type: CanvasData['connections'][number]['type'],
  extra: Partial<CanvasData['connections'][number]> = {},
): CanvasData['connections'][number] {
  return {
    id,
    sourceId,
    sourceAnchor: 'right',
    targetId,
    targetAnchor: 'left',
    type,
    ...extra,
  };
}

function createSnapshot(revision: number): NarrativeGraphSnapshot {
  return createNarrativeGraphSnapshotFromCanvasData(createCanvasData(), {
    revision,
    sourceCanvasUri: 'file:///story/branch.nkc',
  });
}

function createHost(
  snapshot: NarrativeGraphSnapshot | (() => NarrativeGraphSnapshot),
  plan?: CanvasPlaybackPlan | (() => CanvasPlaybackPlan | undefined) | undefined,
) {
  return {
    extractNarrativeGraphSnapshot: vi.fn(() =>
      typeof snapshot === 'function' ? snapshot() : snapshot,
    ),
    extractCanvasPlaybackPlan: vi.fn(() => (typeof plan === 'function' ? plan() : plan)),
    postNarrativePreviewCanvasMessage: vi.fn(() => true),
  };
}

function createStoryboardCanvasData(): CanvasData {
  return {
    version: '2.1',
    name: 'Scene Only',
    nodes: [
      {
        id: 'scene-a',
        type: 'scene',
        position: { x: 0, y: 0 },
        size: { width: 480, height: 280 },
        zIndex: 0,
        container: {
          policy: 'scene',
          childIds: ['shot-a1', 'shot-a2'],
          layout: { mode: 'sequence' },
        },
        data: { sceneTitle: 'Scene A', sceneNumber: 1 },
      },
      createNode('shot-a1', 'shot', {
        shotNumber: 1,
        duration: 2,
        visualDescription: 'Opening',
        characters: [{ characterName: 'Hero' }],
        shotScale: 'MS',
        characterAction: 'Looks around',
        emotion: [],
        sceneTags: [],
        generationStatus: 'idle',
        generationHistory: [],
      }),
      createNode('shot-a2', 'shot', {
        shotNumber: 2,
        duration: 3,
        visualDescription: 'Close up',
        characters: [],
        shotScale: 'CU',
        characterAction: 'Speaks',
        emotion: [],
        sceneTags: [],
        generationStatus: 'idle',
        generationHistory: [],
      }),
    ].map((node) =>
      node.id === 'shot-a1' || node.id === 'shot-a2' ? { ...node, parentId: 'scene-a' } : node,
    ) as CanvasData['nodes'],
    connections: [],
  };
}

function createPanelFactory(): NarrativePreviewPanelFactory & {
  readonly createdPanels: ReturnType<typeof createPanel>[];
} {
  const createdPanels: ReturnType<typeof createPanel>[] = [];
  return {
    createdPanels,
    createWebviewPanel: vi.fn(() => {
      const panel = createPanel();
      createdPanels.push(panel);
      return panel as never;
    }),
  };
}

function createPanel() {
  const disposeHandlers: Array<() => void> = [];
  let messageHandler: ((message: unknown) => void) | undefined;
  const panel = {
    webview: {
      html: '',
      cspSource: 'vscode-webview:',
      postMessage: vi.fn(() => Promise.resolve(true)),
      onDidReceiveMessage: vi.fn((handler: (message: unknown) => void) => {
        messageHandler = handler;
        return { dispose: vi.fn() };
      }),
      receiveMessage: (message: unknown) => messageHandler?.(message),
    },
    reveal: vi.fn(),
    dispose: vi.fn(() => {
      for (const handler of disposeHandlers) {
        handler();
      }
    }),
    onDidDispose: vi.fn((handler: () => void) => {
      disposeHandlers.push(handler);
      return { dispose: vi.fn() };
    }),
  };
  return panel;
}

function readBootstrapMessages(html: string): unknown[] {
  const match = html.match(/const BOOTSTRAP_MESSAGES = (.*?);/);
  if (!match?.[1]) {
    return [];
  }
  return JSON.parse(match[1]) as unknown[];
}
