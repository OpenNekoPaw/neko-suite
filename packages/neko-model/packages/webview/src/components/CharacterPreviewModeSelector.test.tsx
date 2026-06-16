// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CharacterPreviewModeId } from '@neko/shared';
import type { CharacterPreviewUiState } from '../stores/modelStore';
import { CharacterPreviewModeSelector } from './CharacterPreviewModeSelector';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const messages: Record<string, string> = {
        'characterPreview.aria.modes': '角色预览模式',
        'characterPreview.label.mode': '预览',
        'characterPreview.aria.playback': '预览播放控制',
        'characterPreview.mode.face': '面部',
        'characterPreview.mode.full-body': '全身',
        'characterPreview.mode.motion': '动作',
        'characterPreview.mode.voice-pack': '语音',
        'characterPreview.modeTitle.face': '面部近景预览',
        'characterPreview.modeTitle.full-body': '全身预览',
        'characterPreview.modeTitle.motion': '动作检查预览',
        'characterPreview.modeTitle.voice-pack': '语音表演预览',
        'characterPreview.status.pending': '处理中',
        'characterPreview.playbackStatus.playing': '播放中',
        'characterPreview.play': '播放',
        'characterPreview.pause': '暂停',
        'characterPreview.stop': '停止',
        'characterPreview.reset': '重置',
        'characterPreview.resetTitle': '重置预览相机',
        'characterPreview.playbackTitle.pause': '暂停预览',
        'characterPreview.playbackTitle.stop': '停止预览',
        'controlAvailability.state.disabled': '不可用',
        'controlAvailability.reason.asset-not-character': '当前资产不是兼容角色',
      };
      return messages[key] ?? key;
    },
  }),
}));

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

    expect(tabLabels()).toEqual(['面部', '全身', '动作', '语音']);
    expect(host.querySelector('[aria-label="角色预览模式"]')).not.toBeNull();
    expect(host.querySelector<HTMLButtonElement>('button[aria-selected="true"]')?.textContent).toBe(
      '面部',
    );
    expect(buttonByText('面部').title).toBe('面部近景预览');
  });

  it('renders compact mode as a single preview selector', () => {
    renderSelector({ state: appliedState('face'), compact: true });

    expect(selectByLabel('角色预览模式').value).toBe('face');
    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(0);
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
      buttonByText('动作').click();
      buttonByText('重置').click();
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

    expect(host.textContent).toContain('处理中');
    expect(host.textContent).toContain('No compatible voice pack is bound to this character.');
    expect(buttonByText('重置').disabled).toBe(true);
    expect(host.querySelector('[aria-label="预览播放控制"]')).toBeNull();
  });

  it('surfaces asset compatibility reason for ordinary non-character assets', () => {
    renderSelector({
      state: appliedState('face'),
      availability: { state: 'disabled', reason: 'asset-not-character' },
    });

    expect(buttonByText('面部').disabled).toBe(true);
    expect(buttonByText('面部').dataset.availabilityReason).toBe('asset-not-character');
    expect(buttonByText('面部').title).toBe('面部近景预览 - 不可用: 当前资产不是兼容角色');
    expect(buttonByText('重置').disabled).toBe(true);
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
      buttonByText('暂停').click();
      buttonByText('停止').click();
    });

    expect(onPlaybackControl).toHaveBeenNthCalledWith(1, 'pause');
    expect(onPlaybackControl).toHaveBeenNthCalledWith(2, 'stop');
  });
});

function renderSelector({
  state,
  disabled = false,
  availability,
  compact = false,
  onModeChange = vi.fn(),
  onResetCamera = vi.fn(),
  onPlaybackControl = vi.fn(),
}: {
  state: CharacterPreviewUiState;
  disabled?: boolean;
  availability?: React.ComponentProps<typeof CharacterPreviewModeSelector>['availability'];
  compact?: boolean;
  onModeChange?: (modeId: CharacterPreviewModeId) => void;
  onResetCamera?: () => void;
  onPlaybackControl?: (action: 'play' | 'pause' | 'stop') => void;
}): void {
  act(() => {
    root.render(
      <CharacterPreviewModeSelector
        state={state}
        compact={compact}
        disabled={disabled}
        availability={availability}
        onModeChange={onModeChange}
        onResetCamera={onResetCamera}
        onPlaybackControl={onPlaybackControl}
      />,
    );
  });
}

function appliedState(
  modeId: NonNullable<CharacterPreviewUiState['appliedMode']>,
): CharacterPreviewUiState {
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

function selectByLabel(label: string): HTMLSelectElement {
  const select = host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
  if (!select) {
    throw new Error(`Select not found: ${label}`);
  }
  return select;
}
