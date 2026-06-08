import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { normalizeNarrativePreviewFeatureToggles } from '@neko/shared';
import { renderWithI18n } from '../../__tests__/setup';
import { NarrativePlayer } from '../NarrativePlayer';
import type { NarrativePreviewController, NarrativeRuntimeState } from '../types';

describe('NarrativePlayer', () => {
  it('renders current node, choices, variables, and playback controls', () => {
    const controller = createController({
      variablesPanelOpen: true,
      state: createState({
        status: 'waiting-choice',
        currentNode: {
          nodeId: 'scene-a',
          type: 'narrative-scene',
          label: 'Cafe',
          data: {},
          scene: { sceneRef: 'scenes/cafe.fountain' },
        },
        choices: [
          {
            connection: {
              connectionId: 'choice-a',
              sourceNodeId: 'scene-a',
              targetNodeId: 'scene-b',
              priority: 0,
              choiceText: 'Ask why',
            },
            label: 'Ask why',
            targetNodeId: 'scene-b',
            conditionMet: true,
            disabled: false,
            diagnostics: [],
          },
        ],
      }),
    });

    renderWithI18n(<NarrativePlayer controller={controller} />);

    expect(screen.getByTestId('narrative-player')).toHaveAttribute('data-status', 'waiting-choice');
    expect(screen.getAllByText('Cafe')).toHaveLength(2);
    expect(screen.getByText('scenes/cafe.fountain')).toBeInTheDocument();
    expect(screen.getByText('Ask why')).toBeInTheDocument();
    expect(screen.getAllByText('Variables')).toHaveLength(2);
    expect(screen.getByText('closeness')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Ask why'));
    expect(controller.advance).toHaveBeenCalledWith(0);

    fireEvent.click(screen.getByText('Back'));
    expect(controller.stepBack).toHaveBeenCalled();

    fireEvent.click(screen.getByText('Reset'));
    expect(controller.reset).toHaveBeenCalled();
  });

  it('renders ending statistics and handles genre changes', () => {
    const controller = createController({
      state: createState({
        status: 'ended',
        currentNode: {
          nodeId: 'ending',
          type: 'narrative-ending',
          label: 'Ending',
          data: {},
          ending: { endingLabel: 'True Ending' },
        },
        endingStats: {
          endingNodeId: 'ending',
          endingLabel: 'True Ending',
          visitedCount: 3,
          totalNodes: 4,
          pathTaken: ['start', 'scene-a', 'ending'],
          variableSnapshot: { closeness: 3 },
        },
      }),
    });

    renderWithI18n(<NarrativePlayer controller={controller} />);

    expect(screen.getByText('True Ending')).toBeInTheDocument();
    expect(screen.getByText('3/4')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Genre'), { target: { value: 'visual-novel' } });
    expect(controller.setGenre).toHaveBeenCalledWith('visual-novel');
  });
});

function createState(overrides: Partial<NarrativeRuntimeState> = {}): NarrativeRuntimeState {
  return {
    status: 'idle',
    revision: 1,
    variables: { closeness: 3 },
    history: [],
    path: ['start'],
    choices: [],
    diagnostics: [],
    graph: {
      revision: 1,
      metadata: { variables: [], genre: 'illustrated-text' },
      nodes: [],
      connections: [],
    },
    ...overrides,
  };
}

function createController(
  overrides: Partial<NarrativePreviewController> = {},
): NarrativePreviewController {
  return {
    state: createState(),
    genre: 'illustrated-text',
    featureToggles: normalizeNarrativePreviewFeatureToggles(undefined),
    fullscreen: false,
    variablesPanelOpen: false,
    historyPanelOpen: false,
    handleMessage: vi.fn(),
    start: vi.fn(),
    reset: vi.fn(),
    advance: vi.fn(),
    stepBack: vi.fn(),
    jumpTo: vi.fn(),
    setGenre: vi.fn(),
    setFeatureToggles: vi.fn(),
    setVariables: vi.fn(),
    toggleFullscreen: vi.fn(),
    toggleVariablesPanel: vi.fn(),
    toggleHistoryPanel: vi.fn(),
    ...overrides,
  };
}
