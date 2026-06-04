import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { ScriptTableView } from '../components/ScriptTableView';
import { renderWithI18n } from './setup';
import type { StorySceneState } from '../types';
import type { NekoStoryScriptIndex, StorySceneVideoReadiness } from '@neko/shared';

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

const multiSceneIndex: NekoStoryScriptIndex = {
  ...scriptIndex,
  total_lines: 24,
  scenes: [
    scriptIndex.scenes[0]!,
    {
      id: 'scene_def456',
      sceneId: 'scene_def456',
      heading: 'EXT. SCHOOL - DAY',
      sceneTitle: 'EXT. SCHOOL - DAY',
      intExt: 'EXT',
      location: 'SCHOOL',
      timeOfDay: 'DAY',
      time: 'DAY',
      sceneNumber: '2',
      sceneCharacters: ['BOB'],
      actionSummary: 'Bob waits at the school gate.',
      estimatedDuration: 12,
      line_start: 6,
      line_end: 11,
    },
  ],
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

    fireEvent.click(screen.getByRole('button', { name: 'More' }));
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
    expect(screen.getByRole('button', { name: 'Send All to Agent' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send All to Canvas' })).toBeInTheDocument();
    expect(screen.getByText('All scenes')).toBeInTheDocument();
  });

  it('dispatches table-level batch actions instead of per-scene loops', () => {
    const onSceneAction = vi.fn();
    const onTableAction = vi.fn();
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
        onTableAction={onTableAction}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start All' }));
    expect(onTableAction).toHaveBeenCalledWith('startVideoCreationAll', {
      sceneIds: ['scene_abc123'],
    });
    expect(onSceneAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Send All to Agent' }));
    expect(onTableAction).toHaveBeenCalledWith('sendToAgentAll', {
      sceneIds: ['scene_abc123'],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Send All to Canvas' }));
    expect(onTableAction).toHaveBeenCalledWith('sendToCanvasAll', {
      sceneIds: ['scene_abc123'],
    });
  });

  it('supports selecting multiple scenes before table-level handoff', () => {
    const onTableAction = vi.fn();
    const states: Record<string, StorySceneState> = {
      scene_abc123: {
        sceneId: 'scene_abc123',
        agentStatus: 'not-requested',
        canvasStatus: 'not-sent',
      },
      scene_def456: {
        sceneId: 'scene_def456',
        agentStatus: 'sent',
        canvasStatus: 'opened',
      },
    };

    renderWithI18n(
      <ScriptTableView
        scriptIndex={multiSceneIndex}
        sceneStates={states}
        onTableAction={onTableAction}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select #2' }));
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Send Selected to Agent' }));
    expect(onTableAction).toHaveBeenCalledWith('sendToAgentAll', {
      sceneIds: ['scene_def456'],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Send Selected to Canvas' }));
    expect(onTableAction).toHaveBeenCalledWith('sendToCanvasAll', {
      sceneIds: ['scene_def456'],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Start Selected' }));
    expect(onTableAction).not.toHaveBeenCalledWith('startVideoCreationAll', {
      sceneIds: ['scene_def456'],
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select #1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start Selected' }));
    expect(onTableAction).toHaveBeenCalledWith('startVideoCreationAll', {
      sceneIds: ['scene_abc123'],
    });
  });

  it('renders readiness character visual states and missing input indicators', () => {
    const states: Record<string, StorySceneState> = {
      scene_abc123: {
        sceneId: 'scene_abc123',
        agentStatus: 'not-requested',
        canvasStatus: 'not-sent',
      },
    };
    const readinessRows: StorySceneVideoReadiness[] = [
      {
        sceneId: 'scene_abc123',
        sourceScriptUri: scriptIndex.uri,
        sceneTitle: 'INT. OFFICE - DAY',
        estimatedDuration: 18,
        characters: [
          {
            name: 'ALICE',
            characterId: 'char-alice',
            matchSource: 'dialogue-character',
            status: 'bound',
            thumbnailUri: 'vscode-webview://thumb/alice.png',
          },
          {
            name: 'BOB',
            matchSource: 'dialogue-character',
            status: 'missing',
            missingReason: 'No usable character visual is available',
            missingReasonKey: 'table.character.missingReason.missingVisual',
          },
        ],
        missingInputs: [
          {
            kind: 'character-visual',
            label: 'BOB is missing a character visual',
            labelKey: 'table.missingInput.characterVisual',
            labelParams: { name: 'BOB' },
            severity: 'blocking',
            characterName: 'BOB',
          },
        ],
        readinessStatus: 'needs-input',
        creatorStatus: 'attention',
        allowedActions: ['analyze', 'toggleSkip'],
      },
    ];

    renderWithI18n(
      <ScriptTableView
        scriptIndex={scriptIndex}
        sceneStates={states}
        readinessRows={readinessRows}
      />,
    );

    expect(screen.getByText('Needs Attention')).toBeInTheDocument();
    expect(screen.getByText('BOB is missing a character visual')).toBeInTheDocument();
    expect(screen.getByText('Missing visual')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
  });

  it('renders empty character states explicitly', () => {
    const emptyCharacterIndex: NekoStoryScriptIndex = {
      ...scriptIndex,
      scenes: [{ ...scriptIndex.scenes[0]!, sceneCharacters: [] }],
      characters: [],
    };
    const states: Record<string, StorySceneState> = {
      scene_abc123: {
        sceneId: 'scene_abc123',
        agentStatus: 'not-requested',
        canvasStatus: 'not-sent',
      },
    };

    const { container } = renderWithI18n(
      <ScriptTableView scriptIndex={emptyCharacterIndex} sceneStates={states} />,
    );

    expect(container.textContent).toContain('—');
  });

  it('renders Canvas progress summary from readiness rows', () => {
    const states: Record<string, StorySceneState> = {
      scene_abc123: {
        sceneId: 'scene_abc123',
        agentStatus: 'sent',
        canvasStatus: 'opened',
      },
    };
    const readinessRows: StorySceneVideoReadiness[] = [
      {
        sceneId: 'scene_abc123',
        sourceScriptUri: scriptIndex.uri,
        sceneTitle: 'INT. OFFICE - DAY',
        estimatedDuration: 18,
        characters: [],
        missingInputs: [],
        readinessStatus: 'in-progress',
        creatorStatus: 'processing',
        allowedActions: ['openCanvas', 'toggleSkip'],
        canvasSummary: {
          sourceScriptUri: scriptIndex.uri,
          sceneId: 'scene_abc123',
          sceneNodeId: 'scene-node-1',
          shotCount: 2,
          generatedShotCount: 1,
          failedShotCount: 0,
          status: 'partial',
          shots: [],
        },
      },
    ];

    renderWithI18n(
      <ScriptTableView
        scriptIndex={scriptIndex}
        sceneStates={states}
        readinessRows={readinessRows}
      />,
    );

    expect(screen.getByText('Canvas 1/2')).toBeInTheDocument();
  });

  it('keeps skipped readiness rows on restore-only action path', () => {
    const states: Record<string, StorySceneState> = {
      scene_abc123: {
        sceneId: 'scene_abc123',
        agentStatus: 'skipped',
        canvasStatus: 'skipped',
      },
    };
    const readinessRows: StorySceneVideoReadiness[] = [
      {
        sceneId: 'scene_abc123',
        sourceScriptUri: scriptIndex.uri,
        sceneTitle: 'INT. OFFICE - DAY',
        estimatedDuration: 18,
        characters: [],
        missingInputs: [],
        readinessStatus: 'skipped',
        creatorStatus: 'skipped',
        allowedActions: ['toggleSkip'],
      },
    ];

    renderWithI18n(
      <ScriptTableView
        scriptIndex={scriptIndex}
        sceneStates={states}
        readinessRows={readinessRows}
      />,
    );

    expect(screen.getByText('Skipped')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
  });

  it('dispatches character actions with scene and character identifiers when readiness exists', () => {
    const onCharacterSendToAgent = vi.fn();
    const states: Record<string, StorySceneState> = {
      scene_abc123: {
        sceneId: 'scene_abc123',
        agentStatus: 'not-requested',
        canvasStatus: 'not-sent',
      },
    };
    const readinessRows: StorySceneVideoReadiness[] = [
      {
        sceneId: 'scene_abc123',
        sourceScriptUri: scriptIndex.uri,
        sceneTitle: 'INT. OFFICE - DAY',
        estimatedDuration: 18,
        characters: [
          {
            name: 'ALICE',
            characterId: 'char-alice',
            matchSource: 'dialogue-character',
            status: 'bound',
          },
        ],
        missingInputs: [],
        readinessStatus: 'ready',
        creatorStatus: 'pending',
        allowedActions: ['startVideoCreation', 'toggleSkip'],
      },
    ];

    renderWithI18n(
      <ScriptTableView
        scriptIndex={scriptIndex}
        sceneStates={states}
        readinessRows={readinessRows}
        onCharacterSendToAgent={onCharacterSendToAgent}
      />,
    );

    fireEvent.click(screen.getByTitle('Send to Agent'));
    expect(onCharacterSendToAgent).toHaveBeenCalledWith('ALICE', 'scene_abc123', 'char-alice');
  });
});
