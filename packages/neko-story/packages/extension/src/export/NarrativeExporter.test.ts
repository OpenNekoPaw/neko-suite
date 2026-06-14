import { Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import {
  NarrativeRuntime,
  type ContentAccessRequest,
  type ContentAccessResult,
  type ContentAccessIntent,
  type NarrativeAssetRef,
  type NarrativeAssetResolveResult,
  type NarrativeAssetResolver,
  type NarrativeGraphSnapshot,
} from '@neko/shared';
import { NarrativeExporter } from './NarrativeExporter';
import { createHtml5RuntimeBundle } from './html5RuntimeBundle';

describe('NarrativeExporter', () => {
  it('packages graph, parsed Fountain scenes, character bindings, runtime, renderer, and assets', async () => {
    const calls: ContentAccessIntent[] = [];
    const resolver: NarrativeAssetResolver = {
      resolve: vi.fn(
        async (
          ref: NarrativeAssetRef,
          intent: ContentAccessIntent,
        ): Promise<NarrativeAssetResolveResult> => {
          calls.push(intent);
          return {
            status: 'ready',
            ref,
            intent,
            path: intent === 'package' ? '/tmp/pkg/source.png' : '/tmp/final/source.png',
            mimeType: 'image/png',
          };
        },
      ),
    };
    const copyAsset = vi.fn(() => new Uint8Array([1, 2, 3]));
    const exporter = new NarrativeExporter({ assetResolver: resolver, copyAsset });

    const result = await exporter.export(createGraph());

    expect(result.ok).toBe(true);
    expect(result.artifacts.map((artifact) => artifact.path)).toEqual(
      expect.arrayContaining([
        'index.html',
        'data/story.json',
        'assets/neko-narrative-runtime.js',
        'assets/neko-narrative-renderer.js',
        expect.stringMatching(/^assets\/media\/001-cafe.png$/),
      ]),
    );
    expect(result.story.scenes['scenes/cafe.fountain']?.directives).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'scene-heading', location: 'CAFE' }),
        expect.objectContaining({ type: 'dialogue', character: 'HERO', text: 'Hello.' }),
      ]),
    );
    expect(result.story.characterBindings.HERO?.portraitRef).toEqual({
      kind: 'relative-path',
      path: 'assets/hero.png',
    });
    expect(calls).toEqual(expect.arrayContaining(['final-export', 'package']));

    const storyJson = result.artifacts.find((artifact) => artifact.path === 'data/story.json');
    expect(typeof storyJson?.content).toBe('string');
    expect(storyJson?.content).not.toContain('/tmp/pkg/source.png');
    expect(storyJson?.content).not.toContain('/tmp/final/source.png');
    expect(copyAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        outputPath: expect.stringMatching(/^assets\/media\/001-cafe.png$/),
        finalExportResult: expect.objectContaining({ intent: 'final-export' }),
        packageResult: expect.objectContaining({ intent: 'package' }),
      }),
    );
  });

  it('validates unsupported conditions, missing endings, and non-portable runtime assets', async () => {
    const resolver: NarrativeAssetResolver = {
      resolve: vi.fn(
        async (
          ref: NarrativeAssetRef,
          intent: ContentAccessIntent,
        ): Promise<NarrativeAssetResolveResult> => ({ status: 'ready', ref, intent }),
      ),
    };
    const exporter = new NarrativeExporter({ assetResolver: resolver });
    const graph = createGraph({
      nodes: createGraph()
        .nodes.filter((node) => node.type !== 'narrative-ending')
        .map((node) =>
          node.nodeId === 'scene-a'
            ? {
                ...node,
                scene: {
                  ...node.scene,
                  backgroundRef: {
                    kind: 'relative-path',
                    path: 'vscode-webview-resource://panel/cafe.png',
                  },
                },
              }
            : node,
        ),
      connections: [
        {
          connectionId: 'start-to-a',
          sourceNodeId: 'start',
          targetNodeId: 'scene-a',
          priority: 0,
        },
        {
          connectionId: 'unsupported',
          sourceNodeId: 'scene-a',
          targetNodeId: 'scene-b',
          condition: 'closeness + 1 > 3',
          priority: 0,
        },
      ],
    });

    const result = await exporter.export(graph);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        'export-missing-ending',
        'export-unsupported-condition',
        'export-runtime-asset-ref',
      ]),
    );
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it('packages generated-video production bindings through content access export intents', async () => {
    const requests: ContentAccessRequest[] = [];
    const contentAccessResolver = {
      resolve: vi.fn(async (request: ContentAccessRequest): Promise<ContentAccessResult> => {
        requests.push(request);
        return {
          status: 'ready',
          request,
          source: request.ref.kind === 'runtime' ? undefined : request.ref,
          localPath: request.intent === 'final-export' ? '/tmp/final/generated.mp4' : undefined,
          bytes: request.intent === 'package' ? new Uint8Array([4, 5, 6]) : undefined,
          mimeType: 'video/mp4',
        };
      }),
    };
    const assetResolver: NarrativeAssetResolver = {
      resolve: vi.fn(
        async (
          ref: NarrativeAssetRef,
          intent: ContentAccessIntent,
        ): Promise<NarrativeAssetResolveResult> => ({ status: 'ready', ref, intent }),
      ),
    };
    const exporter = new NarrativeExporter({ assetResolver, contentAccessResolver });
    const graph = createGraph({
      metadata: { ...createGraph().metadata, genre: 'interactive-film' },
      nodes: createGraph().nodes.map((node) =>
        node.nodeId === 'scene-a'
          ? {
              ...node,
              scene: {
                ...node.scene,
                productionRefs: [
                  {
                    bindingId: 'bind-video-1',
                    role: 'primary',
                    target: {
                      kind: 'generated-video',
                      ref: {
                        kind: 'generated-asset',
                        assetId: 'generated-video-1',
                        resourceRef: createGeneratedVideoResource(),
                      },
                    },
                  },
                ],
              },
            }
          : node,
      ),
    });

    const result = await exporter.export(graph);

    expect(result.ok).toBe(true);
    expect(requests.map((request) => request.intent)).toEqual(
      expect.arrayContaining(['final-export', 'package']),
    );
    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          intent: 'final-export',
          target: 'local-path',
          metadata: expect.objectContaining({ bindingId: 'bind-video-1' }),
        }),
        expect.objectContaining({
          intent: 'package',
          target: 'bytes',
          metadata: expect.objectContaining({ productionTargetKind: 'generated-video' }),
        }),
      ]),
    );
    expect(result.story.assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'production-binding',
          productionBindingId: 'bind-video-1',
          finalExportStatus: 'ready',
          packageStatus: 'ready',
          mimeType: 'video/mp4',
        }),
      ]),
    );
    expect(result.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'asset',
          path: expect.stringMatching(/^assets\/media\/\d+-generated-video-1$/),
          content: new Uint8Array([4, 5, 6]),
        }),
      ]),
    );
  });

  it('rejects runtime-only production bindings during export packaging', async () => {
    const contentAccessResolver = {
      resolve: vi.fn(
        async (request: ContentAccessRequest): Promise<ContentAccessResult> => ({
          status: 'ready',
          request,
        }),
      ),
    };
    const exporter = new NarrativeExporter({ contentAccessResolver });
    const graph = createGraph({
      nodes: createGraph().nodes.map((node) =>
        node.nodeId === 'scene-a'
          ? {
              ...node,
              scene: {
                ...node.scene,
                productionRefs: [
                  {
                    bindingId: 'bind-runtime-video',
                    role: 'primary',
                    target: {
                      kind: 'generated-video',
                      ref: {
                        kind: 'generated-asset',
                        assetId: 'generated-video-1',
                        resourceRef: {
                          ...createGeneratedVideoResource(),
                          id: 'blob:runtime-video',
                        },
                      },
                    },
                  },
                ],
              },
            }
          : node,
      ),
    });

    const result = await exporter.export(graph);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'export-runtime-asset-ref',
          bindingId: 'bind-runtime-video',
          nodeId: 'scene-a',
        }),
      ]),
    );
    expect(contentAccessResolver.resolve).not.toHaveBeenCalled();
  });

  it('keeps exported HTML5 runtime semantics aligned with the shared Preview runtime', () => {
    const graph = createGraph();
    const previewRuntime = new NarrativeRuntime();
    previewRuntime.load(graph);
    previewRuntime.start();
    previewRuntime.advance();
    previewRuntime.advance(0);
    previewRuntime.advance();

    const exportedRuntime = createExportRuntime(graph);
    exportedRuntime.start();
    exportedRuntime.advance();
    exportedRuntime.advance(0);
    exportedRuntime.advance();

    expect(exportedRuntime.state()).toMatchObject({
      status: previewRuntime.state.status,
      currentNode: { nodeId: previewRuntime.state.currentNode?.nodeId },
      variables: previewRuntime.state.variables,
      endingStats: {
        endingNodeId: previewRuntime.state.endingStats?.endingNodeId,
        endingLabel: previewRuntime.state.endingStats?.endingLabel,
        visitedCount: previewRuntime.state.endingStats?.visitedCount,
      },
    });
  });
});

interface ExportRuntime {
  start(): unknown;
  advance(choiceIndex?: number): unknown;
  state(): unknown;
}

function createExportRuntime(snapshot: NarrativeGraphSnapshot): ExportRuntime {
  const context: {
    globalThis: {
      globalThis?: unknown;
      NekoNarrativeRuntime?: {
        createRuntime(snapshot: NarrativeGraphSnapshot): ExportRuntime;
      };
    };
  } = { globalThis: {} };
  context.globalThis.globalThis = context.globalThis;
  new Script(createHtml5RuntimeBundle()).runInNewContext(context);
  const factory = context.globalThis.NekoNarrativeRuntime;
  if (!factory) {
    throw new Error('Export runtime bundle did not register NekoNarrativeRuntime.');
  }
  return factory.createRuntime(snapshot);
}

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
    charactersYaml: [
      'characters:',
      '  HERO:',
      '    portrait: assets/hero.png',
      'backgrounds:',
      '  CAFE:',
      '    default: assets/backgrounds/cafe.png',
    ].join('\n'),
    sceneContents: {
      'scenes/cafe.fountain': [
        'INT. CAFE - DAY',
        '',
        'The room is quiet.',
        '',
        'HERO',
        'Hello.',
      ].join('\n'),
      'scenes/answer.fountain': ['INT. CAFE - NIGHT', '', 'The answer arrives.'].join('\n'),
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
          backgroundRef: { kind: 'relative-path', path: 'assets/backgrounds/cafe.png' },
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

function createGeneratedVideoResource() {
  return {
    id: 'generated-video-1',
    scope: 'project' as const,
    provider: 'generated',
    kind: 'generated' as const,
    source: {
      kind: 'generated-asset' as const,
      generatedAssetId: 'generated-video-1',
    },
    fingerprint: { strategy: 'provider' as const, value: 'generated-video-1' },
  };
}
