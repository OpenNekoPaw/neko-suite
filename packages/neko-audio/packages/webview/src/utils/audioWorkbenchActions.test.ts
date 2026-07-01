import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioProjectData, TimelineElement, TimelineTrack } from '@neko/shared';
import { resolveAudioSelection } from './audioWorkbench';
import {
  getAudioWorkbenchAction,
  AUDIO_WORKBENCH_ACTIONS,
  describeAudioSelectionTarget,
  type AudioWorkbenchActionInput,
} from './audioWorkbenchActions';
import { postMessage } from '../shared/useVscodeMessage';

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

function createInput(
  project: AudioProjectData,
  target = { kind: 'clip' as const, trackId: 'track-1', elementId: 'clip-1' },
): AudioWorkbenchActionInput {
  return {
    project,
    selection: resolveAudioSelection(project, target, null),
    currentTime: 5,
    updateElement: vi.fn(),
    splitElementAt: vi.fn(),
  };
}

describe('audio workbench action descriptors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('contains unique action ids and fails visibly for unknown ids', () => {
    const ids = new Set(AUDIO_WORKBENCH_ACTIONS.map((action) => action.id));
    expect(ids.size).toBe(AUDIO_WORKBENCH_ACTIONS.length);
    expect(() => getAudioWorkbenchAction('missing' as never)).toThrow(
      'Unknown audio workbench action',
    );
  });

  it('enables split only when playhead is inside the selected clip', () => {
    const project = createProject();
    const action = getAudioWorkbenchAction('split');
    const input = createInput(project);

    expect(action.evaluate(input).enabled).toBe(true);
    expect(action.run(input)).toEqual({ ok: true, reviewState: 'apply-only' });
    expect(input.splitElementAt).toHaveBeenCalledWith('track-1', 'clip-1', 5);

    const outside = { ...input, currentTime: 20 };
    expect(action.evaluate(outside)).toMatchObject({
      enabled: false,
      reasonKey: 'audio.workbench.actions.split.playheadOutsideClip',
    });
  });

  it('disables clip actions when the selected clip is stale', () => {
    const project = createProject();
    const action = getAudioWorkbenchAction('fadeIn');
    const input: AudioWorkbenchActionInput = {
      ...createInput(project),
      selection: resolveAudioSelection(
        project,
        { kind: 'clip', trackId: 'track-1', elementId: 'missing' },
        null,
      ),
    };

    expect(action.evaluate(input)).toMatchObject({
      enabled: false,
      reasonKey: 'audio.workbench.selection.staleClip',
    });
    expect(action.run(input)).toMatchObject({
      ok: false,
      reasonKey: 'audio.workbench.selection.clipRequired',
    });
  });

  it('routes fade and gain actions through element updates with complete audio properties', () => {
    const project = createProject();
    const fadeInput = createInput(project);
    const gainInput = createInput(project);

    expect(getAudioWorkbenchAction('fadeIn').run(fadeInput)).toMatchObject({ ok: true });
    expect(fadeInput.updateElement).toHaveBeenCalledWith(
      'track-1',
      'clip-1',
      expect.objectContaining({
        audio: expect.objectContaining({ fadeIn: 1, volume: 1, pan: 0, muted: false }),
      }),
    );

    expect(getAudioWorkbenchAction('gain').run(gainInput)).toMatchObject({ ok: true });
    expect(gainInput.updateElement).toHaveBeenCalledWith(
      'track-1',
      'clip-1',
      expect.objectContaining({
        audio: expect.objectContaining({ gain: 0, volume: 1, pan: 0 }),
      }),
    );
  });

  it('routes AI cleanup actions through existing audio messages', () => {
    const project = createProject();
    const input = createInput(project);

    expect(getAudioWorkbenchAction('denoise').run(input)).toMatchObject({
      ok: true,
      reviewState: 'apply-only',
    });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'audio:effects',
        effects: [expect.objectContaining({ effectType: 'noise-gate' })],
      }),
    );

    getAudioWorkbenchAction('silenceCleanup').run(input);
    expect(postMessage).toHaveBeenCalledWith({ type: 'audio:analyze', kind: 'silence' });
  });

  it('describes selection targets for operation rows', () => {
    expect(
      describeAudioSelectionTarget({ kind: 'clip', trackId: 'track-1', elementId: 'clip-1' }),
    ).toBe('track-1:clip-1');
    expect(describeAudioSelectionTarget({ kind: 'region', start: 1, end: 2 })).toBe('1.00-2.00');
    expect(describeAudioSelectionTarget(null)).toBe('none');
  });
});
