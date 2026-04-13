import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { ScriptTableView } from '../components/ScriptTableView';
import { renderWithI18n } from './setup';
import type { StorySceneState } from '../types';
import type { NekoStoryScriptIndex } from '@neko/shared';

const scriptIndex: NekoStoryScriptIndex = {
  uri: 'file:///project/demo.fountain',
  total_lines: 12,
  scenes: [
    {
      id: 'scene_abc123',
      sceneId: 'scene_abc123',
      heading: 'INT. OFFICE - DAY',
      sceneTitle: 'INT. OFFICE - DAY',
      intExt: 'INT',
      location: 'OFFICE',
      timeOfDay: 'DAY',
      time: 'DAY',
      sceneNumber: '1',
      sceneCharacters: ['ALICE', 'BOB'],
      actionSummary: 'Alice studies a wall of monitors.',
      estimatedDuration: 18,
      line_start: 0,
      line_end: 5,
    },
  ],
  characters: [{ name: 'ALICE', first_line: 3, scene_ids: ['scene_abc123'] }],
};

const sceneStates: Record<string, StorySceneState> = {
  scene_abc123: {
    sceneId: 'scene_abc123',
    agentStatus: 'ready',
    canvasStatus: 'sent',
  },
};

describe('ScriptTableView', () => {
  it('renders scene-level columns and status badges', () => {
    renderWithI18n(<ScriptTableView scriptIndex={scriptIndex} sceneStates={sceneStates} />);

    // Column headers
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Characters')).toBeInTheDocument();

    // Character badges rendered separately
    expect(screen.getByText('ALICE')).toBeInTheDocument();
    expect(screen.getByText('BOB')).toBeInTheDocument();

    // Agent status badge ('ready' → 'Analysed')
    expect(screen.getByText('Analysed')).toBeInTheDocument();
  });

  it('renders video creation buttons for not-requested scenes', () => {
    const states: Record<string, StorySceneState> = {
      scene_abc123: {
        sceneId: 'scene_abc123',
        agentStatus: 'not-requested',
        canvasStatus: 'not-sent',
      },
    };

    renderWithI18n(<ScriptTableView scriptIndex={scriptIndex} sceneStates={states} />);

    expect(screen.getByRole('button', { name: 'Start Video' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate Scene' })).toBeInTheDocument();
  });

  it('renders retry button for failed scenes', () => {
    const states: Record<string, StorySceneState> = {
      scene_abc123: {
        sceneId: 'scene_abc123',
        agentStatus: 'failed',
        canvasStatus: 'not-sent',
      },
    };

    renderWithI18n(<ScriptTableView scriptIndex={scriptIndex} sceneStates={states} />);

    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('dispatches scene actions from action buttons', () => {
    const onSceneAction = vi.fn();

    renderWithI18n(
      <ScriptTableView
        scriptIndex={scriptIndex}
        sceneStates={sceneStates}
        onSceneAction={onSceneAction}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Storyboard' }));
    expect(onSceneAction).toHaveBeenCalledWith('scene_abc123', 'generateStoryboard');
  });

  it('dispatches startVideoCreation action', () => {
    const onSceneAction = vi.fn();
    const states: Record<string, StorySceneState> = {
      scene_abc123: {
        sceneId: 'scene_abc123',
        agentStatus: 'ready',
        canvasStatus: 'not-sent',
      },
    };

    renderWithI18n(
      <ScriptTableView
        scriptIndex={scriptIndex}
        sceneStates={states}
        onSceneAction={onSceneAction}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start Video' }));
    expect(onSceneAction).toHaveBeenCalledWith('scene_abc123', 'startVideoCreation');
  });
});
