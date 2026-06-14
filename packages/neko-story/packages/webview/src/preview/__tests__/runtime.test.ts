import { describe, expect, it, vi } from 'vitest';
import type { CanvasPlaybackPlan, NarrativeGraphSnapshot } from '@neko/shared';
import { WhitelistConditionEvaluator } from '../conditionEvaluator';
import { NarrativeRuntime } from '../NarrativeRuntime';
import { DefaultNarrativePreviewController } from '../NarrativePreviewController';

describe('WhitelistConditionEvaluator', () => {
  it('evaluates simple comparisons without dynamic code execution', () => {
    const evaluator = new WhitelistConditionEvaluator();

    expect(evaluator.evaluate('closeness >= 3', { closeness: 4 }).result).toBe(true);
    expect(evaluator.evaluate('closeness >= 3', { closeness: 2 }).result).toBe(false);
    expect(evaluator.evaluate('flag', { flag: true }).result).toBe(true);
    expect(evaluator.evaluate('!flag', { flag: false }).result).toBe(true);
  });

  it('reports unsupported and missing-variable conditions explicitly', () => {
    const evaluator = new WhitelistConditionEvaluator();

    expect(evaluator.evaluate('closeness + 1 > 3', { closeness: 4 })).toMatchObject({
      status: 'unsupported',
      result: false,
      diagnostics: [{ code: 'condition-unsupported' }],
    });
    expect(evaluator.evaluate('missing >= 1', {})).toMatchObject({
      status: 'missing-variable',
      result: false,
      diagnostics: [{ code: 'condition-missing-variable', variableName: 'missing' }],
    });
  });
});

describe('NarrativeRuntime', () => {
  it('loads graph, starts at narrative-start, advances through enabled choices, and ends', () => {
    const runtime = new NarrativeRuntime();
    runtime.load(createGraph());

    expect(runtime.start()).toMatchObject({
      status: 'waiting-choice',
      currentNode: { nodeId: 'start' },
      variables: { closeness: 1, flag: false },
    });

    runtime.advance();
    expect(runtime.state).toMatchObject({
      status: 'waiting-choice',
      currentNode: { nodeId: 'scene-a' },
      variables: { closeness: 3, flag: false },
      choices: [
        { label: 'Ask why', disabled: false },
        { label: 'Stay silent', disabled: true },
      ],
    });

    runtime.advance(0);
    expect(runtime.state.currentNode?.nodeId).toBe('scene-b');
    runtime.advance();
    expect(runtime.state).toMatchObject({
      status: 'ended',
      currentNode: { nodeId: 'ending' },
      endingStats: {
        endingNodeId: 'ending',
        endingLabel: 'True Ending',
        visitedCount: 4,
        totalNodes: 4,
      },
    });
  });

  it('restores previous node and variables when stepping back', () => {
    const runtime = new NarrativeRuntime();
    runtime.load(createGraph());
    runtime.start();
    runtime.advance();
    runtime.advance(0);

    expect(runtime.state.currentNode?.nodeId).toBe('scene-b');
    expect(runtime.stepBack()).toMatchObject({
      status: 'waiting-choice',
      currentNode: { nodeId: 'scene-a' },
      variables: { closeness: 3, flag: false },
    });
  });

  it('supports jumpTo and reports missing nodes', () => {
    const runtime = new NarrativeRuntime();
    runtime.load(createGraph());

    expect(runtime.jumpTo('scene-b')).toMatchObject({
      status: 'waiting-choice',
      currentNode: { nodeId: 'scene-b' },
    });
    expect(runtime.jumpTo('missing')).toMatchObject({
      status: 'error',
      diagnostics: [expect.objectContaining({ code: 'runtime-node-missing' })],
    });
  });
});

describe('DefaultNarrativePreviewController', () => {
  it('drops stale revision messages and emits Canvas highlight messages', () => {
    const postMessage = vi.fn();
    const controller = new DefaultNarrativePreviewController({ postMessage });

    expect(
      controller.handleMessage({
        type: 'preview:loadGraph',
        requestId: 'load-2',
        revision: 2,
        snapshot: createGraph({ revision: 2 }),
      }),
    ).toBe(true);

    expect(controller.state.revision).toBe(2);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'canvas:highlightNode', nodeId: 'start' }),
    );

    expect(
      controller.handleMessage({
        type: 'preview:refresh',
        requestId: 'refresh-1',
        revision: 1,
        snapshot: createGraph({ revision: 1 }),
      }),
    ).toBe(false);
    expect(controller.state.revision).toBe(2);
  });

  it('handles jump, variables, genre, and choice messages', () => {
    const postMessage = vi.fn();
    const controller = new DefaultNarrativePreviewController({ postMessage });
    controller.handleMessage({
      type: 'preview:loadGraph',
      requestId: 'load',
      revision: 1,
      snapshot: createGraph({ revision: 1 }),
    });

    expect(
      controller.handleMessage({
        type: 'preview:setVariables',
        requestId: 'vars',
        revision: 1,
        variables: { closeness: 10 },
      }),
    ).toBe(true);
    expect(controller.state.variables.closeness).toBe(10);

    expect(
      controller.handleMessage({
        type: 'preview:setGenre',
        requestId: 'genre',
        genre: 'visual-novel',
      }),
    ).toBe(true);
    expect(controller.genre).toBe('visual-novel');

    expect(
      controller.handleMessage({
        type: 'preview:setFeatureToggles',
        requestId: 'toggles',
        revision: 1,
        toggles: { typewriterEffect: false, previewAutoSync: false },
      }),
    ).toBe(true);
    expect(controller.featureToggles.typewriterEffect).toBe(false);

    controller.setFeatureToggles({ previewAutoSync: false });
    expect(controller.featureToggles.previewAutoSync).toBe(false);

    controller.handleMessage({
      type: 'preview:jumpTo',
      requestId: 'jump',
      revision: 1,
      nodeId: 'scene-a',
    });
    expect(controller.state.currentNode?.nodeId).toBe('start');

    controller.jumpTo('scene-a');
    controller.advance(0);

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'canvas:choiceMade',
        fromNodeId: 'scene-a',
        toNodeId: 'scene-b',
      }),
    );
  });

  it('can disable Canvas highlight auto-sync', () => {
    const postMessage = vi.fn();
    const controller = new DefaultNarrativePreviewController({ postMessage });
    controller.setFeatureToggles({ previewAutoSync: false });

    controller.handleMessage({
      type: 'preview:loadGraph',
      requestId: 'load',
      revision: 1,
      snapshot: createGraph({ revision: 1 }),
    });

    expect(postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'canvas:highlightNode' }),
    );
  });

  it('loads Canvas playback plans and emits route highlights for storyboard previews', () => {
    const postMessage = vi.fn();
    const controller = new DefaultNarrativePreviewController({ postMessage });
    const plan = createPlaybackPlan({
      adapterId: 'storyboard',
      units: [
        { id: 'shot-a', sourceNodeId: 'shot-a', kind: 'shot', renderMode: 'story-preview' },
        { id: 'shot-b', sourceNodeId: 'shot-b', kind: 'shot', renderMode: 'story-preview' },
      ],
      transitions: [
        {
          id: 'shot-a-shot-b',
          sourceUnitId: 'shot-a',
          targetUnitId: 'shot-b',
          type: 'sequence',
          priority: 0,
        },
      ],
      entryUnitIds: ['shot-a'],
    });

    expect(
      controller.handleMessage({
        type: 'preview:loadPlaybackPlan',
        requestId: 'load-plan',
        revision: 3,
        plan,
      }),
    ).toBe(true);

    expect(controller.playbackPlan).toBe(plan);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'canvas:highlightPath',
        nodeIds: ['shot-a', 'shot-b'],
      }),
    );
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'canvas:highlightNode', nodeId: 'shot-a' }),
    );
  });

  it('keeps media playback plans on durable sources instead of runtime URLs', () => {
    const controller = new DefaultNarrativePreviewController();
    const plan = createPlaybackPlan({
      adapterId: 'media-sequence',
      advancePolicy: 'media-ended',
      units: [
        {
          id: 'media-a',
          sourceNodeId: 'media-a',
          kind: 'media',
          renderMode: 'media-playback',
          assetPath: 'assets/clip.mp4',
        },
      ],
      entryUnitIds: ['media-a'],
    });

    expect(
      controller.handleMessage({
        type: 'preview:refreshPlaybackPlan',
        requestId: 'refresh-plan',
        revision: 4,
        plan,
      }),
    ).toBe(true);

    expect(JSON.stringify(controller.playbackPlan)).not.toContain('blob:');
    expect(JSON.stringify(controller.playbackPlan)).not.toContain('vscode-webview-resource');
    expect(controller.playbackPlan?.units[0]).toMatchObject({
      kind: 'media',
      assetPath: 'assets/clip.mp4',
    });
  });
});

function createGraph(overrides: Partial<NarrativeGraphSnapshot> = {}): NarrativeGraphSnapshot {
  return {
    revision: 1,
    metadata: {
      variables: [
        { id: 'closeness', name: 'closeness', value: 1 },
        { id: 'flag', name: 'flag', value: false },
      ],
      genre: 'illustrated-text',
    },
    nodes: [
      {
        nodeId: 'start',
        type: 'narrative-start',
        label: 'Start',
        data: {},
      },
      {
        nodeId: 'scene-a',
        type: 'narrative-scene',
        label: 'Cafe',
        data: {},
        scene: {
          sceneRef: 'scenes/cafe.fountain',
          variableEffects: [{ variableId: 'closeness', operation: 'add', value: 2 }],
        },
      },
      {
        nodeId: 'scene-b',
        type: 'narrative-scene',
        label: 'Answer',
        data: {},
        scene: { sceneRef: 'scenes/answer.fountain' },
      },
      {
        nodeId: 'ending',
        type: 'narrative-ending',
        label: 'Ending',
        data: {},
        ending: { endingType: 'good', endingLabel: 'True Ending' },
      },
    ],
    connections: [
      {
        connectionId: 'start-to-a',
        sourceNodeId: 'start',
        targetNodeId: 'scene-a',
        priority: 0,
      },
      {
        connectionId: 'ask',
        sourceNodeId: 'scene-a',
        targetNodeId: 'scene-b',
        type: 'choice',
        choiceText: 'Ask why',
        condition: 'closeness >= 3',
        priority: 0,
      },
      {
        connectionId: 'silent',
        sourceNodeId: 'scene-a',
        targetNodeId: 'ending',
        type: 'choice',
        choiceText: 'Stay silent',
        condition: 'flag',
        priority: 1,
      },
      {
        connectionId: 'b-to-ending',
        sourceNodeId: 'scene-b',
        targetNodeId: 'ending',
        priority: 0,
      },
    ],
    ...overrides,
  };
}

function createPlaybackPlan(overrides: Partial<CanvasPlaybackPlan>): CanvasPlaybackPlan {
  const units = overrides.units ?? [];

  return {
    adapterId: 'generic',
    requestedAdapterId: 'generic',
    behaviorMode: 'linear',
    advancePolicy: 'timer',
    entryUnitIds: [],
    units,
    transitions: [],
    routeCandidates: units.map((unit, index) => ({
      id: `test-route:${unit.id}`,
      title: unit.id,
      entryUnitId: unit.id,
      unitIds: index === 0 && units.length > 1 ? units.map((routeUnit) => routeUnit.id) : [unit.id],
      sourceKind: 'entry',
      sourceNodeId: unit.sourceNodeId,
    })),
    diagnostics: [],
    metadata: {},
    ...overrides,
  };
}
