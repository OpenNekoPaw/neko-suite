import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  ViewColumn: { Beside: 2 },
  window: {
    createWebviewPanel: vi.fn(),
  },
}));

import {
  createNarrativeGraphSnapshotFromCanvasData,
  NarrativePreviewBridge,
  parsePreviewToCanvasMessage,
  type NarrativePreviewPanelFactory,
} from './narrativePreviewBridge';
import type { CanvasData, NarrativeGraphSnapshot, PreviewToCanvasMessage } from '@neko/shared';

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
    expect(panelFactory.createdPanels[0]?.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'preview:loadGraph',
        requestId: 'canvas-narrative:load:1000:1',
        revision: 1,
      }),
    );

    expect(bridge.open()).toBe(true);
    expect(panelFactory.createdPanels).toHaveLength(1);
    expect(panelFactory.createdPanels[0]?.reveal).toHaveBeenCalledTimes(1);

    panelFactory.createdPanels[0]?.dispose();
    expect(bridge.open()).toBe(true);
    expect(panelFactory.createdPanels).toHaveLength(2);

    bridge.dispose();
    expect(panelFactory.createdPanels[1]?.dispose).toHaveBeenCalledTimes(1);
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
        requestId: 'canvas-narrative:variables:2000:4',
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

function createHost(snapshot: NarrativeGraphSnapshot | (() => NarrativeGraphSnapshot)) {
  return {
    extractNarrativeGraphSnapshot: vi.fn(() =>
      typeof snapshot === 'function' ? snapshot() : snapshot,
    ),
    postNarrativePreviewCanvasMessage: vi.fn(() => true),
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
  const panel = {
    webview: {
      html: '',
      cspSource: 'vscode-webview:',
      postMessage: vi.fn(() => Promise.resolve(true)),
      onDidReceiveMessage: vi.fn((handler: () => void) => {
        return { dispose: vi.fn() };
      }),
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
