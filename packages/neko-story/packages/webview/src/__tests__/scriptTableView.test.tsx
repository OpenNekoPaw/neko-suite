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

describe('ScriptTableView', () => {
  it('renders 3-column layout with scene info and characters inline', () => {
    const states: Record<string, StorySceneState> = {
      scene_abc123: {
        sceneId: 'scene_abc123',
        agentStatus: 'ready',
        canvasStatus: 'sent',
      },
    };

    renderWithI18n(<ScriptTableView scriptIndex={scriptIndex} sceneStates={states} />);

    // 3 column headers: #, Scene, Status
    expect(screen.getByText('Scene')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();

    // Characters rendered inline within scene column
    expect(screen.getByText('ALICE')).toBeInTheDocument();
    expect(screen.getByText('BOB')).toBeInTheDocument();

    // Unified status: ready + sent → 'Processing'
    expect(screen.getByText('Processing')).toBeInTheDocument();
  });

  it('shows "Start" button for pending scenes', () => {
    const states: Record<string, StorySceneState> = {
      scene_abc123: {
        sceneId: 'scene_abc123',
        agentStatus: 'not-requested',
        canvasStatus: 'not-sent',
      },
    };

    renderWithI18n(<ScriptTableView scriptIndex={scriptIndex} sceneStates={states} />);

    // Unified status: pending
    expect(screen.getByText('Pending')).toBeInTheDocument();
    // Single context-driven primary action
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  it('shows "Retry" button for failed scenes', () => {
    const states: Record<string, StorySceneState> = {
      scene_abc123: {
        sceneId: 'scene_abc123',
        agentStatus: 'failed',
        canvasStatus: 'not-sent',
      },
    };

    renderWithI18n(<ScriptTableView scriptIndex={scriptIndex} sceneStates={states} />);

    expect(screen.getByText('Needs Attention')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('shows "View" button for completed scenes', () => {
    const states: Record<string, StorySceneState> = {
      scene_abc123: {
        sceneId: 'scene_abc123',
        agentStatus: 'sent',
        canvasStatus: 'opened',
      },
    };

    renderWithI18n(<ScriptTableView scriptIndex={scriptIndex} sceneStates={states} />);

    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View' })).toBeInTheDocument();
  });

  it('dispatches actions from dropdown menu', () => {
    const onSceneAction = vi.fn();
    const states: Record<string, StorySceneState> = {
      scene_abc123: {
        sceneId: 'scene_abc123',
        agentStatus: 'ready',
        canvasStatus: 'sent',
      },
    };

    renderWithI18n(
      <ScriptTableView
        scriptIndex={scriptIndex}
        sceneStates={states}
        onSceneAction={onSceneAction}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '···' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Storyboard' }));
    expect(onSceneAction).toHaveBeenCalledWith('scene_abc123', 'generateStoryboard');
  });

  it('dispatches start action for pending scenes', () => {
    const onSceneAction = vi.fn();
    const states: Record<string, StorySceneState> = {
      scene_abc123: {
        sceneId: 'scene_abc123',
        agentStatus: 'not-requested',
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

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(onSceneAction).toHaveBeenCalledWith('scene_abc123', 'startVideoCreation');
  });

  it('shows progress in summary bar', () => {
    const states: Record<string, StorySceneState> = {
      scene_abc123: {
        sceneId: 'scene_abc123',
        agentStatus: 'not-requested',
        canvasStatus: 'not-sent',
      },
    };

    renderWithI18n(<ScriptTableView scriptIndex={scriptIndex} sceneStates={states} />);

    expect(screen.getByText('0/1 done')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start All' })).toBeInTheDocument();
  });
});
