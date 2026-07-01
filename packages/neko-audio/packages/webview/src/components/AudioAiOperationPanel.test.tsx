// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioProjectData, TimelineElement, TimelineTrack } from '@neko/shared';
import { AudioAiOperationPanel } from './AudioAiOperationPanel';
import { AiResultCompare } from './AiResultCompare';
import { useAudioProjectStore } from '../stores/audioProjectStore';
import { useAudioStore } from '../stores/audioStore';
import { rejectRuntimeAudioReference } from '../utils/audioWorkbench';
import { postMessage } from '../shared/useVscodeMessage';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('../i18n', () => ({
  t: (key: string) => key,
}));

vi.mock('../shared/useVscodeMessage', () => ({
  postMessage: vi.fn(),
}));

function createElement(
  overrides: Partial<Extract<TimelineElement, { type: 'audio' }>> = {},
): TimelineElement {
  return {
    id: 'clip-1',
    type: 'audio',
    name: 'Clip 1',
    src: 'audio/clip.wav',
    duration: 10,
    startTime: 2,
    trimStart: 0,
    trimEnd: 0,
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0, anchorY: 0 },
    opacity: 1,
    blendMode: 'normal',
    effects: [],
    muted: false,
    hidden: false,
    locked: false,
    ...overrides,
  };
}

function createTrack(overrides: Partial<TimelineTrack> = {}): TimelineTrack {
  return {
    id: 'track-1',
    name: 'Voice',
    type: 'audio',
    elements: [createElement()],
    muted: false,
    locked: false,
    hidden: false,
    isMain: true,
    ...overrides,
  };
}

function createProject(overrides: Partial<AudioProjectData> = {}): AudioProjectData {
  return {
    version: '2.2',
    name: 'Project',
    sampleRate: 48000,
    channels: 2,
    tracks: [createTrack()],
    masterEffectsChain: [],
    markers: [],
    ...overrides,
  };
}

describe('Audio AI operation panel', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    useAudioStore.getState().reset();
    useAudioProjectStore.getState().reset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('runs quick actions into visible operation rows with apply-only review state', () => {
    useAudioProjectStore.getState().initProject(createProject());
    useAudioStore
      .getState()
      .setSelectedWorkbenchTarget({ kind: 'clip', trackId: 'track-1', elementId: 'clip-1' });

    act(() => {
      root.render(<AudioAiOperationPanel />);
    });

    const denoise = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes('audio.workbench.actions.denoise'),
    );
    act(() => {
      denoise?.click();
    });

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'audio:effects',
        effects: [expect.objectContaining({ effectType: 'noise-gate' })],
      }),
    );
    expect(useAudioStore.getState().aiOperations[0]).toMatchObject({
      actionId: 'denoise',
      status: 'completed',
      affectedElementIds: ['clip-1'],
      reviewState: 'apply-only',
    });
    expect(host.textContent).toContain('audio.aiReview.apply-only');
  });

  it('disables target-scoped quick actions when target is missing', () => {
    useAudioProjectStore.getState().initProject(createProject());

    act(() => {
      root.render(<AudioAiOperationPanel />);
    });

    const denoise = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes('audio.workbench.actions.denoise'),
    );

    expect(denoise?.disabled).toBe(true);
    expect(denoise?.getAttribute('title')).toBe('audio.workbench.selection.clipOrRegionRequired');
    expect(useAudioStore.getState().aiOperations).toHaveLength(0);
  });

  it('labels prompt requests as unsupported until an executable AI path exists', () => {
    act(() => {
      root.render(<AudioAiOperationPanel />);
    });

    const textarea = host.querySelector<HTMLTextAreaElement>('textarea');
    act(() => {
      setTextAreaValue(textarea, 'clean this voice');
      textarea?.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const run = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes('audio.aiPanel.run'),
    );
    act(() => {
      run?.click();
    });

    expect(useAudioStore.getState().aiOperations[0]).toMatchObject({
      actionId: 'prompt',
      status: 'unsupported',
      reviewState: 'unsupported',
    });
  });

  it('renders previewable and apply-only compare states without fake A/B for apply-only', () => {
    const operation = {
      id: 'op-1',
      actionId: 'test',
      label: 'Test',
      target: null,
      status: 'completed' as const,
      createdAt: 1,
      affectedTrackIds: [],
      affectedElementIds: [],
      affectedEffectIds: [],
      affectedMarkerIds: [],
      reviewState: 'previewable' as const,
    };

    act(() => {
      root.render(<AiResultCompare operation={operation} />);
    });
    expect(host.textContent).toContain('audio.aiReview.original');
    expect(host.textContent).toContain('audio.aiReview.processed');

    act(() => {
      root.render(<AiResultCompare operation={{ ...operation, reviewState: 'apply-only' }} />);
    });
    expect(host.textContent).toContain('audio.aiReview.description.apply-only');
    expect(host.textContent).not.toContain('audio.aiReview.original');
  });

  it('rejects runtime refs as durable AI review identities', () => {
    expect(rejectRuntimeAudioReference('blob:http://localhost/audio')).toBe(true);
    expect(rejectRuntimeAudioReference('/workspace/.neko/.cache/audio.wav')).toBe(true);
    expect(rejectRuntimeAudioReference('${PROJECT}/audio/voice.wav')).toBe(false);
  });
});

function setTextAreaValue(textarea: HTMLTextAreaElement | null, value: string): void {
  if (!textarea) return;
  Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set?.call(
    textarea,
    value,
  );
}
