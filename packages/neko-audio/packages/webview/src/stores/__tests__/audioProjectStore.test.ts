import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioProjectData, TimelineTrack } from '@neko/shared';
import { useAudioProjectStore } from '../audioProjectStore';
import { postMessage } from '../../shared/useVscodeMessage';

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

function getState() {
  return useAudioProjectStore.getState();
}

describe('audioProjectStore track mix state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getState().reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('records transient AI highlights from project sync operations', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    getState().initProject(
      createProject({
        tracks: [createTrack({ elements: [createAudioElement()] })],
        trackMix: {
          'track-1': {
            volume: 1,
            pan: 0,
            solo: false,
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

    getState().syncProject(
      createProject({
        tracks: [
          createTrack({
            elements: [{ ...createAudioElement(), startTime: 2 }],
          }),
        ],
        trackMix: {
          'track-1': {
            volume: 1,
            pan: 0,
            solo: false,
            effectChain: [
              {
                id: 'fx-1',
                effectType: 'compressor',
                enabled: false,
                params: { threshold: -18 },
              },
            ],
          },
        },
      }),
      {
        type: 'batch',
        meta: { id: 'ai-op-1', timestamp: 1, source: 'ai', description: 'AI edit' },
        payload: {
          operations: [
            {
              type: 'element.update',
              meta: { id: 'child-1', timestamp: 1, source: 'ai' },
              payload: { trackId: 'track-1', elementId: 'clip-1', updates: { startTime: 2 } },
              before: { updates: { startTime: 0 } },
            },
            {
              type: 'track.mix.effect.update',
              meta: { id: 'child-2', timestamp: 1, source: 'ai' },
              payload: { trackId: 'track-1', effectId: 'fx-1', updates: { enabled: false } },
              before: { updates: { enabled: true } },
            },
          ],
        },
      },
    );

    expect(getState().aiOperationHighlights['ai-op-1']).toMatchObject({
      operationId: 'ai-op-1',
      trackIds: ['track-1'],
      elementIds: ['clip-1'],
      effectIds: ['fx-1'],
      expiresAt: 5000,
    });
    expect(getState().hasAiTrackHighlight('track-1')).toBe(true);
    expect(getState().hasAiElementHighlight('clip-1')).toBe(true);
    expect(getState().hasAiEffectHighlight('fx-1')).toBe(true);
    expect(postMessage).not.toHaveBeenCalled();

    getState().expireAiOperationHighlights(5000);
    expect(getState().aiOperationHighlights).toEqual({});
  });

  it('does not create AI highlights for user sync operations', () => {
    getState().initProject(createProject());

    getState().syncProject(createProject(), {
      type: 'track.mix.setVolume',
      meta: { id: 'user-op-1', timestamp: 1, source: 'user' },
      payload: { trackId: 'track-1', volume: 0.5 },
      before: { volume: 1 },
    });

    expect(getState().aiOperationHighlights).toEqual({});
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

  it('persists master volume for the master mixer strip', () => {
    getState().initProject(createProject({ masterVolume: 0.9 }));

    getState().setMasterVolume(1.35);

    expect(getState().audioProjectData?.masterVolume).toBe(1.35);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'operationApplied',
        operation: expect.objectContaining({
          type: 'audio.setMasterVolume',
          payload: { masterVolume: 1.35 },
          before: { masterVolume: 0.9 },
        }),
      }),
    );
  });

  it('undo restores an omitted master volume field for legacy projects', () => {
    getState().initProject(createProject());

    getState().setMasterVolume(1.2);
    expect(getState().audioProjectData?.masterVolume).toBe(1.2);

    getState().opUndo();
    expect(getState().audioProjectData).not.toHaveProperty('masterVolume');
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

  it('updates BPM from tempoMap and undo restores first tempo event', () => {
    getState().initProject(
      createProject({
        bpm: 90,
        tempoMap: {
          ppq: 480,
          tempoEvents: [{ ticks: 0, bpm: 120 }],
          timeSignatureEvents: [{ ticks: 0, numerator: 4, denominator: 4 }],
        },
      }),
    );

    getState().setBpm(142);

    expect(getState().audioProjectData?.bpm).toBe(142);
    expect(getState().audioProjectData?.tempoMap?.tempoEvents[0]?.bpm).toBe(142);
    expect(getState().opUndoStack.at(-1)).toMatchObject({
      type: 'audio.setBpm',
      before: { bpm: 120 },
    });

    getState().opUndo();
    expect(getState().audioProjectData?.tempoMap?.tempoEvents[0]?.bpm).toBe(120);
  });

  it('updates first time signature event through audio operation', () => {
    getState().initProject(
      createProject({
        tempoMap: {
          ppq: 480,
          tempoEvents: [{ ticks: 0, bpm: 120 }],
          timeSignatureEvents: [{ ticks: 0, numerator: 4, denominator: 4 }],
        },
      }),
    );

    getState().setTimeSignature(6, 8);

    expect(getState().audioProjectData?.tempoMap?.timeSignatureEvents[0]).toEqual({
      ticks: 0,
      numerator: 6,
      denominator: 8,
    });
    expect(getState().opUndoStack.at(-1)).toMatchObject({
      type: 'audio.setTimeSignature',
      before: { numerator: 4, denominator: 4 },
    });
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

  it('adds and edits automation lanes through undoable track mix operations', () => {
    getState().initProject(
      createProject({
        trackMix: {
          'track-1': { volume: 1, pan: 0, solo: false, effectChain: [] },
        },
      }),
    );

    getState().addAutomationLane('track-1', { kind: 'track-volume' });
    const lane = getState().audioProjectData?.trackMix?.['track-1']?.automation?.[0];

    expect(lane).toMatchObject({
      enabled: true,
      target: { kind: 'track-volume' },
      points: [{ ticks: 0, value: 1, curve: 'linear' }],
    });
    expect(getState().opUndoStack.at(-1)?.type).toBe('track.mix.setAutomation');

    getState().addAutomationPoint('track-1', lane!.id, 480, 0.5);
    expect(getState().audioProjectData?.trackMix?.['track-1']?.automation?.[0]?.points).toEqual([
      { ticks: 0, value: 1, curve: 'linear' },
      { ticks: 480, value: 0.5, curve: 'linear' },
    ]);

    getState().updateAutomationPoint('track-1', lane!.id, 1, { value: 3 });
    expect(getState().audioProjectData?.trackMix?.['track-1']?.automation?.[0]?.points[1]).toEqual({
      ticks: 480,
      value: 2,
      curve: 'linear',
    });

    getState().opUndo();
    expect(getState().audioProjectData?.trackMix?.['track-1']?.automation?.[0]?.points[1]).toEqual({
      ticks: 480,
      value: 0.5,
      curve: 'linear',
    });
  });

  it('adds effect-parameter automation only for shared automatable metadata', () => {
    getState().initProject(
      createProject({
        trackMix: {
          'track-1': {
            volume: 1,
            pan: 0,
            solo: false,
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

    getState().addAutomationLane('track-1', {
      kind: 'effect-param',
      effectId: 'fx-1',
      param: 'threshold',
    });
    getState().addAutomationLane('track-1', {
      kind: 'effect-param',
      effectId: 'fx-1',
      param: 'missing',
    });

    expect(getState().audioProjectData?.trackMix?.['track-1']?.automation).toHaveLength(1);
    expect(getState().audioProjectData?.trackMix?.['track-1']?.automation?.[0]?.target).toEqual({
      kind: 'effect-param',
      effectId: 'fx-1',
      param: 'threshold',
    });
  });

  it('syncProject replaces persisted automation from extension state', () => {
    getState().initProject(
      createProject({
        trackMix: {
          'track-1': {
            volume: 1,
            pan: 0,
            solo: false,
            effectChain: [],
            automation: [
              {
                id: 'lane-old',
                enabled: true,
                target: { kind: 'track-volume' },
                points: [{ ticks: 0, value: 1, curve: 'linear' }],
              },
            ],
          },
        },
      }),
    );

    getState().syncProject(
      createProject({
        trackMix: {
          'track-1': {
            volume: 1,
            pan: 0,
            solo: false,
            effectChain: [],
            automation: [
              {
                id: 'lane-new',
                enabled: false,
                target: { kind: 'track-pan' },
                points: [{ ticks: 0, value: 0, curve: 'hold' }],
              },
            ],
          },
        },
      }),
    );

    expect(getState().audioProjectData?.trackMix?.['track-1']?.automation).toEqual([
      {
        id: 'lane-new',
        enabled: false,
        target: { kind: 'track-pan' },
        points: [{ ticks: 0, value: 0, curve: 'hold' }],
      },
    ]);
  });

  it('undo after AI sync uses the existing operation path exactly once', () => {
    getState().initProject(
      createProject({
        trackMix: {
          'track-1': { volume: 1, pan: 0, solo: false, effectChain: [] },
        },
      }),
    );
    getState().syncProject(
      createProject({
        trackMix: {
          'track-1': { volume: 0.4, pan: 0, solo: false, effectChain: [] },
        },
      }),
      {
        type: 'track.mix.setVolume',
        meta: { id: 'ai-op-undo', timestamp: 1, source: 'ai' },
        payload: { trackId: 'track-1', volume: 0.4 },
        before: { volume: 1 },
      },
    );
    expect(postMessage).not.toHaveBeenCalled();

    getState().opUndo();

    expect(getState().audioProjectData?.trackMix?.['track-1']?.volume).toBe(1);
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'operationApplied',
        operation: expect.objectContaining({
          type: 'track.mix.setVolume',
          meta: expect.objectContaining({ source: 'undo' }),
          payload: { trackId: 'track-1', volume: 1 },
        }),
      }),
    );
  });
});
