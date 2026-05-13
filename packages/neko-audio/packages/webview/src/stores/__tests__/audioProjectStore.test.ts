import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioProjectData, TimelineTrack } from '@neko/shared';
import { useAudioProjectStore } from '../audioProjectStore';

vi.mock('../../shared/useVscodeMessage', () => ({
  postMessage: vi.fn(),
}));

function createTrack(overrides: Partial<TimelineTrack> = {}): TimelineTrack {
  return {
    id: 'track-1',
    name: 'Track 1',
    type: 'audio',
    elements: [],
    muted: false,
    locked: false,
    hidden: false,
    isMain: true,
    ...overrides,
  };
}

function createAudioElement() {
  return {
    id: 'clip-1',
    type: 'audio' as const,
    name: 'Clip 1',
    src: '/tmp/clip.wav',
    duration: 10,
    startTime: 0,
    trimStart: 0,
    trimEnd: 0,
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0, anchorY: 0 },
    opacity: 1,
    blendMode: 'normal' as const,
    effects: [],
    muted: false,
    hidden: false,
    locked: false,
  };
}

function createProject(overrides: Partial<AudioProjectData> = {}): AudioProjectData {
  return {
    version: '2.1',
    name: 'Project',
    sampleRate: 48000,
    channels: 2,
    tracks: [createTrack()],
    masterEffectsChain: [],
    markers: [],
    ...overrides,
  };
}

function getState() {
  return useAudioProjectStore.getState();
}

describe('audioProjectStore track mix state', () => {
  beforeEach(() => {
    getState().reset();
  });

  it('persists track volume, pan, solo, and effects in AudioProjectData.trackMix', () => {
    getState().initProject(createProject());

    getState().setTrackVolume('track-1', 0.45);
    getState().setTrackPan('track-1', -0.25);
    getState().toggleSolo('track-1');
    getState().addTrackEffect('track-1', {
      id: 'fx-1',
      effectType: 'gain',
      enabled: true,
      params: { gainDb: 3 },
    });

    const mix = getState().audioProjectData?.trackMix?.['track-1'];
    expect(mix).toMatchObject({ volume: 0.45, pan: -0.25, solo: true });
    expect(mix?.effectChain).toEqual([
      { id: 'fx-1', effectType: 'gain', enabled: true, params: { gainDb: 3 } },
    ]);
  });

  it('undo restores persisted track mix edits', () => {
    getState().initProject(
      createProject({
        trackMix: {
          'track-1': { volume: 1, pan: 0, solo: false, effectChain: [] },
        },
      }),
    );

    getState().setTrackVolume('track-1', 0.25);
    expect(getState().audioProjectData?.trackMix?.['track-1']?.volume).toBe(0.25);

    getState().opUndo();
    expect(getState().audioProjectData?.trackMix?.['track-1']?.volume).toBe(1);
  });

  it('keeps color and height as local-only view state', () => {
    getState().initProject(createProject());

    getState().setTrackColor('track-1', '#ffffff');
    getState().setTrackHeight('track-1', 123);

    expect(getState().getTrackUIState('track-1')).toMatchObject({
      color: '#ffffff',
      height: 123,
    });
    expect(getState().audioProjectData?.trackMix?.['track-1']).toBeUndefined();
  });

  it('syncs Extension project state while preserving local view state', () => {
    getState().initProject(createProject());
    getState().setTrackColor('track-1', '#ffffff');
    getState().setTrackHeight('track-1', 123);

    getState().syncProject(
      createProject({
        trackMix: {
          'track-1': { volume: 0.42, pan: 0.1, solo: true, effectChain: [] },
        },
      }),
      {
        type: 'track.mix.setVolume',
        meta: { id: 'op-1', timestamp: 1, source: 'ai' },
        payload: { trackId: 'track-1', volume: 0.42 },
        before: { volume: 1 },
      },
    );

    expect(getState().getTrackUIState('track-1')).toMatchObject({
      color: '#ffffff',
      height: 123,
      volume: 0.42,
      pan: 0.1,
      solo: true,
    });
    expect(getState().opUndoStack.map((operation) => operation.meta.id)).toContain('op-1');
  });

  it('drops stale local view state for tracks removed by sync', () => {
    getState().initProject(createProject());
    getState().setTrackColor('track-1', '#ffffff');

    getState().syncProject(createProject({ tracks: [] }));

    expect(getState().trackViewState).toEqual({});
  });

  it('builds mix config from persisted track mix state', () => {
    getState().initProject(
      createProject({
        trackMix: {
          'track-1': {
            volume: 0.6,
            pan: 0.2,
            solo: true,
            effectChain: [
              {
                id: 'fx-1',
                effectType: 'compressor',
                enabled: true,
                params: { threshold: -18 },
              },
            ],
          },
        },
      }),
    );

    const config = getState().buildMixStreamConfig();

    expect(config?.tracks[0]).toMatchObject({
      id: 'track-1',
      volume: 0.6,
      pan: 0.2,
      solo: true,
      effectChain: [
        {
          id: 'fx-1',
          effectType: 'compressor',
          enabled: true,
          params: { threshold: -18 },
        },
      ],
    });
  });

  it('lets TrackHeader and MixerPanel actions reflect the same persisted mix values', () => {
    getState().initProject(createProject());

    getState().setTrackVolume('track-1', 0.72);
    const mixerVisibleState = getState().getTrackUIState('track-1');

    expect(mixerVisibleState.volume).toBe(0.72);
    expect(getState().audioProjectData?.trackMix?.['track-1']?.volume).toBe(0.72);

    getState().setTrackPan('track-1', -0.4);
    getState().toggleSolo('track-1');
    const headerVisibleState = getState().getTrackUIState('track-1');

    expect(headerVisibleState).toMatchObject({
      volume: 0.72,
      pan: -0.4,
      solo: true,
    });
    expect(getState().audioProjectData?.trackMix?.['track-1']).toMatchObject({
      volume: 0.72,
      pan: -0.4,
      solo: true,
    });
  });

  it('supports undo across TrackHeader and MixerPanel persisted edits', () => {
    getState().initProject(
      createProject({
        trackMix: {
          'track-1': { volume: 1, pan: 0, solo: false, effectChain: [] },
        },
      }),
    );

    getState().setTrackVolume('track-1', 0.5);
    getState().setTrackPan('track-1', 0.35);

    expect(getState().getTrackUIState('track-1')).toMatchObject({
      volume: 0.5,
      pan: 0.35,
    });

    getState().opUndo();
    expect(getState().getTrackUIState('track-1')).toMatchObject({
      volume: 0.5,
      pan: 0,
    });

    getState().opUndo();
    expect(getState().getTrackUIState('track-1')).toMatchObject({
      volume: 1,
      pan: 0,
    });
  });

  it('updates BPM through dispatch so it can undo and sync', () => {
    getState().initProject(createProject({ bpm: 120 }));

    getState().setBpm(142);

    expect(getState().audioProjectData?.bpm).toBe(142);
    expect(getState().opUndoStack.at(-1)).toMatchObject({
      type: 'audio.setBpm',
      payload: { bpm: 142 },
    });

    getState().opUndo();
    expect(getState().audioProjectData?.bpm).toBe(120);
  });

  it('splits clips as one undoable batch operation', () => {
    getState().initProject(
      createProject({
        tracks: [createTrack({ elements: [createAudioElement()] })],
      }),
    );

    getState().splitElementAt('track-1', 'clip-1', 4);

    const elements = getState().audioProjectData?.tracks[0]?.elements ?? [];
    expect(elements).toHaveLength(2);
    expect(elements[0]).toMatchObject({ id: 'clip-1', duration: 4 });
    expect(elements[1]).toMatchObject({ startTime: 4, duration: 6, trimStart: 4 });
    expect(getState().opUndoStack).toHaveLength(1);
    expect(getState().opUndoStack[0]?.type).toBe('batch');

    getState().opUndo();
    expect(getState().audioProjectData?.tracks[0]?.elements).toEqual([createAudioElement()]);
  });

  it('stores a cloned batch operation for undo history', () => {
    getState().initProject(
      createProject({
        tracks: [createTrack({ elements: [createAudioElement()] })],
      }),
    );
    const op = {
      type: 'element.update' as const,
      meta: { id: 'op-1', timestamp: 1, source: 'user' as const },
      payload: { trackId: 'track-1', elementId: 'clip-1', updates: { duration: 4 } },
      before: { updates: { duration: 10 } },
    };

    getState().dispatchBatch([op]);
    op.before.updates.duration = 99;

    getState().opUndo();
    expect(getState().audioProjectData?.tracks[0]?.elements[0]?.duration).toBe(10);
  });
});
