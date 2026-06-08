import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { NarrativeAssetRef, NarrativeAssetResolver } from '@neko/shared';
import {
  createDefaultPlayRenderers,
  createPlayRendererRegistry,
  renderWithPlayRenderer,
  resolveRendererAsset,
} from '../index';
import type { NarrativeRuntimeState, PlayRendererProps } from '../types';

describe('PlayRenderer registry and renderers', () => {
  it('dispatches by genre and falls back explicitly for unsupported renderers', () => {
    const registry = createPlayRendererRegistry(createDefaultPlayRenderers());

    expect(registry.get('illustrated-text').genre).toBe('illustrated-text');

    const fallback = registry.get('hybrid');
    expect(fallback.genre).toBe('hybrid');
    render(<>{fallback.renderScene(createProps())}</>);
    expect(screen.getByTestId('unsupported-renderer')).toHaveTextContent('hybrid');
  });

  it('renders illustrated-text scene refs and disabled inline choices', () => {
    const renderer = createPlayRendererRegistry(createDefaultPlayRenderers()).get(
      'illustrated-text',
    );
    const onChoice = vi.fn();

    render(
      <>
        {renderWithPlayRenderer(
          renderer,
          createProps({
            onChoice,
            state: createState({
              status: 'waiting-choice',
              currentNode: {
                nodeId: 'scene-a',
                type: 'narrative-scene',
                label: 'Cafe',
                data: {},
                scene: {
                  sceneRef: 'scenes/cafe.fountain',
                  backgroundRef: { kind: 'relative-path', path: 'assets/bg/cafe.png' },
                },
              },
            }),
            choices: [
              createChoice({ label: 'Ask why', disabled: false }),
              createChoice({ connectionId: 'locked', label: 'Locked', disabled: true }),
            ],
            context: {
              variables: {},
              resolvedAssets: {
                [JSON.stringify({ kind: 'relative-path', path: 'assets/bg/cafe.png' })]: {
                  status: 'ready',
                  intent: 'interactive-preview',
                  ref: { kind: 'relative-path', path: 'assets/bg/cafe.png' },
                },
              },
            },
          }),
        )}
      </>,
    );

    expect(screen.getByTestId('illustrated-text-renderer')).toHaveTextContent(
      'scenes/cafe.fountain',
    );
    expect(screen.getByTestId('backgroundRef-state')).toHaveTextContent('ready');
    expect(screen.getByRole('button', { name: 'Locked' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Ask why' }));
    expect(onChoice).toHaveBeenCalledWith(0);
  });

  it('hides disabled choices when the narrative toggle is off', () => {
    const renderer = createPlayRendererRegistry(createDefaultPlayRenderers()).get(
      'illustrated-text',
    );

    render(
      <>
        {renderWithPlayRenderer(
          renderer,
          createProps({
            state: createState({ status: 'waiting-choice' }),
            choices: [
              createChoice({ label: 'Available', disabled: false }),
              createChoice({ connectionId: 'locked', label: 'Locked', disabled: true }),
            ],
            context: {
              variables: {},
              featureToggles: {
                preview: true,
                typewriterEffect: false,
                autoExpressionMatch: false,
                showLockedChoices: false,
                previewAutoSync: true,
                live2dPerformance: false,
              },
            },
          }),
        )}
      </>,
    );

    expect(screen.getByRole('button', { name: 'Available' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Locked' })).toBeNull();
    expect(screen.getByText('scenes/cafe.fountain')).toHaveAttribute('data-typewriter', 'disabled');
  });

  it('renders visual-novel and interactive-film fallback states', () => {
    const registry = createPlayRendererRegistry(createDefaultPlayRenderers());

    render(
      <>
        {renderWithPlayRenderer(
          registry.get('visual-novel'),
          createProps({
            state: createState({
              currentNode: {
                nodeId: 'scene-vn',
                type: 'narrative-scene',
                label: 'VN Scene',
                data: {},
                scene: {
                  sceneRef: 'scenes/vn.fountain',
                  characters: ['Alice'],
                },
              },
            }),
            context: {
              variables: {},
              featureToggles: {
                preview: true,
                typewriterEffect: true,
                autoExpressionMatch: false,
                showLockedChoices: true,
                previewAutoSync: true,
                live2dPerformance: true,
              },
            },
          }),
        )}
        {renderWithPlayRenderer(
          registry.get('interactive-film'),
          createProps({
            state: createState({
              currentNode: {
                nodeId: 'film',
                type: 'narrative-scene',
                label: 'Film Scene',
                data: {},
                scene: { sceneRef: 'scenes/film.fountain' },
              },
            }),
          }),
        )}
      </>,
    );

    expect(screen.getByTestId('visual-novel-renderer')).toHaveTextContent('Alice');
    const characterLayer = screen.getByText('Alice').parentElement;
    expect(characterLayer).toHaveAttribute('data-expression-match', 'disabled');
    expect(characterLayer).toHaveAttribute('data-performance', 'live2d');
    expect(screen.getByTestId('interactive-film-renderer')).toHaveTextContent('Film Scene');
    expect(screen.getByTestId('video-missing')).toHaveTextContent('Video unavailable');
  });

  it('uses injected NarrativeAssetResolver for interactive-preview without persisting URLs', async () => {
    const ref: NarrativeAssetRef = { kind: 'relative-path', path: 'assets/bg/cafe.png' };
    const resolver: NarrativeAssetResolver = {
      resolve: vi.fn(async (assetRef, intent, options) => ({
        status: 'ready',
        ref: assetRef,
        intent,
        role: options?.role,
        url: 'vscode-webview-resource://runtime-only/cafe.png',
      })),
    };

    const result = await resolveRendererAsset(resolver, ref, 'background');

    expect(resolver.resolve).toHaveBeenCalledWith(ref, 'interactive-preview', {
      role: 'thumbnail',
    });
    expect(result).toMatchObject({
      status: 'ready',
      intent: 'interactive-preview',
      url: 'vscode-webview-resource://runtime-only/cafe.png',
    });
    expect(ref).toEqual({ kind: 'relative-path', path: 'assets/bg/cafe.png' });
  });
});

function createProps(overrides: Partial<PlayRendererProps> = {}): PlayRendererProps {
  return {
    state: createState(),
    choices: [],
    context: { variables: {} },
    onChoice: vi.fn(),
    ...overrides,
  };
}

function createState(overrides: Partial<NarrativeRuntimeState> = {}): NarrativeRuntimeState {
  return {
    status: 'playing',
    revision: 1,
    variables: {},
    history: [],
    path: ['scene-a'],
    choices: [],
    diagnostics: [],
    graph: {
      revision: 1,
      metadata: { variables: [], genre: 'illustrated-text' },
      nodes: [],
      connections: [],
    },
    currentNode: {
      nodeId: 'scene-a',
      type: 'narrative-scene',
      label: 'Cafe',
      data: {},
      scene: { sceneRef: 'scenes/cafe.fountain' },
    },
    ...overrides,
  };
}

function createChoice(
  overrides: {
    readonly connectionId?: string;
    readonly label?: string;
    readonly disabled?: boolean;
  } = {},
) {
  const connectionId = overrides.connectionId ?? 'choice-a';
  return {
    connection: {
      connectionId,
      sourceNodeId: 'scene-a',
      targetNodeId: 'scene-b',
      priority: 0,
      choiceText: overrides.label ?? 'Ask why',
    },
    label: overrides.label ?? 'Ask why',
    targetNodeId: 'scene-b',
    conditionMet: !overrides.disabled,
    disabled: Boolean(overrides.disabled),
    diagnostics: [],
  };
}
