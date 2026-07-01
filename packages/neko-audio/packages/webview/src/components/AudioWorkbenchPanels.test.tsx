// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioProjectData, TimelineElement, TimelineTrack } from '@neko/shared';
import { AudioInspectorPanel } from './AudioInspectorPanel';
import { EffectsMiniRack } from './EffectsMiniRack';
import { MarkersRegionsPanel } from './MarkersRegionsPanel';
import { useAudioProjectStore } from '../stores/audioProjectStore';
import { useAudioStore } from '../stores/audioStore';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

class TestResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

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
    markers: [{ id: 'marker-1', label: 'Intro', time: 1 }],
    ...overrides,
  };
}

describe('audio workbench panels', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.ResizeObserver = TestResizeObserver;
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

  it('projects selected clip into the Inspector', () => {
    useAudioProjectStore.getState().initProject(createProject());
    useAudioStore
      .getState()
      .setSelectedWorkbenchTarget({ kind: 'clip', trackId: 'track-1', elementId: 'clip-1' });

    act(() => {
      root.render(<AudioInspectorPanel />);
    });

    expect(host.textContent).toContain('audio.inspector.clip');
    expect(host.textContent).toContain('Clip 1');
    expect(host.querySelector('[data-property-id="audio.inspector.clip.volume"]')).not.toBeNull();
  });

  it('projects selected track and routes quick effect add', () => {
    useAudioProjectStore.getState().initProject(createProject());
    useAudioStore.getState().setSelectedWorkbenchTarget({ kind: 'track', trackId: 'track-1' });

    act(() => {
      root.render(<AudioInspectorPanel />);
    });

    expect(host.textContent).toContain('audio.inspector.track');
    const gainButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('gain'),
    );
    act(() => {
      gainButton?.click();
    });

    expect(
      useAudioProjectStore.getState().audioProjectData?.trackMix?.['track-1']?.effectChain[0]
        ?.effectType,
    ).toBe('gain');
  });

  it('shows unsupported state for planned-only master effect snapshots', () => {
    useAudioProjectStore.getState().initProject(
      createProject({
        masterEffectsChain: [
          {
            id: 'fx-planned',
            type: 'noise-reduction',
            name: 'Noise Reduction',
            enabled: true,
            params: {},
          },
        ],
      }),
    );

    act(() => {
      root.render(<EffectsMiniRack target={{ kind: 'master' }} />);
    });

    expect(host.textContent).toContain('audio.effects.unsupported');
  });

  it('lists, selects, and creates markers', () => {
    useAudioProjectStore.getState().initProject(createProject());
    useAudioStore.getState().setCurrentTime(4);

    act(() => {
      root.render(<MarkersRegionsPanel />);
    });

    expect(host.textContent).toContain('Intro');
    const introButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('Intro'),
    );
    act(() => {
      introButton?.click();
    });
    expect(useAudioStore.getState().currentTime).toBe(1);
    expect(useAudioStore.getState().selectedWorkbenchTarget).toEqual({
      kind: 'marker',
      markerId: 'marker-1',
    });

    const addButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('audio.markers.add'),
    );
    act(() => {
      addButton?.click();
    });
    expect(useAudioProjectStore.getState().audioProjectData?.markers).toHaveLength(2);
  });
});
