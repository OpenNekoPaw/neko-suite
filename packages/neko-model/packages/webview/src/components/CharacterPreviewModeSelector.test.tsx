// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CharacterPreviewModeId } from '@neko/shared';
import type { CharacterPreviewUiState } from '../stores/modelStore';
import { CharacterPreviewModeSelector } from './CharacterPreviewModeSelector';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let host: HTMLDivElement;
let root: Root;

describe('CharacterPreviewModeSelector', () => {
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('renders the four AI character preview modes as a compact selector', () => {
    renderSelector({ state: appliedState('face') });

    expect(tabLabels()).toEqual(['Face', 'Body', 'Motion', 'Voice']);
    expect(host.querySelector('[aria-label="AI character preview modes"]')).not.toBeNull();
    expect(host.querySelector<HTMLButtonElement>('button[aria-selected="true"]')?.textContent).toBe(
      'Face',
    );
  });

  it('dispatches mode changes and camera reset from the selector', () => {
    const onModeChange = vi.fn();
    const onResetCamera = vi.fn();
    renderSelector({
      state: appliedState('full-body'),
      onModeChange,
      onResetCamera,
    });

    act(() => {
      buttonByText('Motion').click();
      buttonByText('Reset').click();
    });

    expect(onModeChange).toHaveBeenCalledWith('motion');
    expect(onResetCamera).toHaveBeenCalledTimes(1);
  });

  it('shows pending and diagnostic states without enabling reset for unavailable previews', () => {
    renderSelector({
      state: {
        ...appliedState('voice-pack'),
        requestedMode: 'voice-pack',
        appliedMode: null,
        status: 'pending',
        state: null,
        diagnostics: [
          {
            code: 'missing-voice-pack',
            severity: 'warning',
            message: 'No compatible voice pack is bound to this character.',
          },
        ],
      },
      disabled: true,
    });

    expect(host.textContent).toContain('Pending');
    expect(host.textContent).toContain('No compatible voice pack is bound to this character.');
    expect(buttonByText('Reset').disabled).toBe(true);
    expect(host.querySelector('[aria-label="Preview playback controls"]')).toBeNull();
  });

  it('shows playback controls only when engine reports compatible playback', () => {
    const onPlaybackControl = vi.fn();
    renderSelector({
      state: {
        ...appliedState('motion'),
        state: {
          ...appliedState('motion').state!,
          playback: { state: 'playing', clipId: 'IdleCheck' },
        },
      },
      onPlaybackControl,
    });

    act(() => {
      buttonByText('Pause').click();
      buttonByText('Stop').click();
    });

    expect(onPlaybackControl).toHaveBeenNthCalledWith(1, 'pause');
    expect(onPlaybackControl).toHaveBeenNthCalledWith(2, 'stop');
  });
});

function renderSelector({
  state,
  disabled = false,
  onModeChange = vi.fn(),
  onResetCamera = vi.fn(),
  onPlaybackControl = vi.fn(),
}: {
  state: CharacterPreviewUiState;
  disabled?: boolean;
  onModeChange?: (modeId: CharacterPreviewModeId) => void;
  onResetCamera?: () => void;
  onPlaybackControl?: (action: 'play' | 'pause' | 'stop') => void;
}): void {
  act(() => {
    root.render(
      <CharacterPreviewModeSelector
        state={state}
        disabled={disabled}
        onModeChange={onModeChange}
        onResetCamera={onResetCamera}
        onPlaybackControl={onPlaybackControl}
      />,
    );
  });
}

function appliedState(modeId: NonNullable<CharacterPreviewUiState['appliedMode']>): CharacterPreviewUiState {
  const cameraPreset =
    modeId === 'face'
      ? 'face-closeup'
      : modeId === 'full-body'
        ? 'full-body'
        : modeId === 'motion'
          ? 'motion-review'
          : 'voice-performance';
  const renderPreset =
    modeId === 'face'
      ? 'face-detail'
      : modeId === 'full-body'
        ? 'body-silhouette'
        : modeId === 'motion'
          ? 'motion-diagnostics'
          : 'voice-lipsync';
  return {
    requestedMode: null,
    appliedMode: modeId,
    status: 'applied',
    state: {
      characterId: 'character-a',
      modeId,
      viewportId: 'main',
      status: 'applied',
      sceneRevision: 4,
      appliedSeq: 12,
      cameraPreset,
      renderPreset,
      playback: { state: modeId === 'motion' || modeId === 'voice-pack' ? 'unavailable' : 'idle' },
      diagnostics: [],
      hasCameraOverride: false,
    },
    diagnostics: [],
  };
}

function tabLabels(): string[] {
  return [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].map(
    (button) => button.textContent ?? '',
  );
}

function buttonByText(text: string): HTMLButtonElement {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent === text,
  );
  if (!button) {
    throw new Error(`Button not found: ${text}`);
  }
  return button;
}
