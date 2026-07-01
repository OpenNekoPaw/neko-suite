import { describe, expect, it } from 'vitest';
import type { AudioProjectData, TimelineElement, TimelineTrack } from '@neko/shared';
import {
  isAudioTimelineToolMode,
  rejectRuntimeAudioReference,
  resolveAudioSelection,
  resolveInspectorScope,
  resolveMasterReadiness,
} from './audioWorkbench';

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
    markers: [{ id: 'marker-1', label: 'Noise', time: 4 }],
    ...overrides,
  };
}

describe('audio workbench selectors', () => {
  it('validates known timeline tools', () => {
    expect(isAudioTimelineToolMode('select')).toBe(true);
    expect(isAudioTimelineToolMode('automation')).toBe(true);
    expect(isAudioTimelineToolMode('unknown')).toBe(false);
  });

  it('resolves clip, track, marker, region, and master targets', () => {
    const project = createProject();

    expect(
      resolveAudioSelection(
        project,
        { kind: 'clip', trackId: 'track-1', elementId: 'clip-1' },
        null,
      ).element?.id,
    ).toBe('clip-1');
    expect(
      resolveAudioSelection(project, { kind: 'track', trackId: 'track-1' }, null).track?.id,
    ).toBe('track-1');
    expect(
      resolveAudioSelection(project, { kind: 'marker', markerId: 'marker-1' }, null).marker?.id,
    ).toBe('marker-1');
    expect(
      resolveAudioSelection(project, { kind: 'region', start: 1, end: 2 }, null).region,
    ).toEqual({ start: 1, end: 2 });
    expect(resolveAudioSelection(project, { kind: 'master' }, null).master).toBe(true);
  });

  it('reports stale target diagnostics without fallback success', () => {
    const resolved = resolveAudioSelection(
      createProject(),
      { kind: 'clip', trackId: 'track-1', elementId: 'missing' },
      null,
    );

    expect(resolved.element).toBeNull();
    expect(resolved.diagnostic).toBe('audio.workbench.selection.staleClip');
  });

  it('uses region selection when no explicit workbench target exists', () => {
    const resolved = resolveAudioSelection(createProject(), null, { start: 3, end: 5 });

    expect(resolved.target).toEqual({ kind: 'region', start: 3, end: 5 });
    expect(resolveInspectorScope('selection', resolved)).toBe('master');
  });

  it('resolves inspector scope from selected target', () => {
    const clip = resolveAudioSelection(
      createProject(),
      { kind: 'clip', trackId: 'track-1', elementId: 'clip-1' },
      null,
    );
    const track = resolveAudioSelection(
      createProject(),
      { kind: 'track', trackId: 'track-1' },
      null,
    );
    const marker = resolveAudioSelection(
      createProject(),
      { kind: 'marker', markerId: 'marker-1' },
      null,
    );

    expect(resolveInspectorScope('selection', clip)).toBe('clip');
    expect(resolveInspectorScope('selection', track)).toBe('track');
    expect(resolveInspectorScope('selection', marker)).toBe('marker');
    expect(resolveInspectorScope('master', clip)).toBe('master');
  });

  it('derives master readiness from loudness state', () => {
    expect(resolveMasterReadiness(null)).toMatchObject({
      state: 'needs-analysis',
      diagnosticKey: 'audio.masterReadiness.needsAnalysis',
    });
    expect(
      resolveMasterReadiness({ integratedLoudness: -14, truePeak: -0.2, loudnessRange: 7 }),
    ).toMatchObject({ state: 'clipping' });
    expect(
      resolveMasterReadiness({ integratedLoudness: -14, truePeak: -1.2, loudnessRange: 7 }),
    ).toMatchObject({ state: 'ready' });
  });

  it('rejects runtime-only and cache references for AI review identity', () => {
    expect(rejectRuntimeAudioReference('blob:http://localhost/id')).toBe(true);
    expect(rejectRuntimeAudioReference('vscode-webview://panel/audio.wav')).toBe(true);
    expect(rejectRuntimeAudioReference('/workspace/.neko/.cache/audio.wav')).toBe(true);
    expect(rejectRuntimeAudioReference('/var/folders/xx/audio.wav')).toBe(true);
    expect(rejectRuntimeAudioReference('${PROJECT}/audio/voice.wav')).toBe(false);
  });
});
