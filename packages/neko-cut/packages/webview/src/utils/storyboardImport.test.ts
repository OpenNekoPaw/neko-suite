import { describe, expect, it } from 'vitest';
import {
  buildStoryboardMetadataCues,
  buildStoryboardImageClips,
  normalizeCutStoryboardImportPayload,
} from './storyboardImport';

describe('storyboard import utilities', () => {
  it('normalizes storyboard import payloads with image paths', () => {
    expect(
      normalizeCutStoryboardImportPayload({
        projectName: 'Opening',
        shots: [
          {
            id: 'shot-1',
            shotNumber: 1,
            duration: 2.5,
            imagePath: '/repo/shot-1.png',
            label: '#001 LS',
          },
        ],
      }),
    ).toEqual({
      projectName: 'Opening',
      shots: [
        {
          id: 'shot-1',
          shotNumber: 1,
          duration: 2.5,
          imagePath: '/repo/shot-1.png',
          label: '#001 LS',
        },
      ],
    });
  });

  it('builds sequential image clips and falls back to valid durations', () => {
    const payload = normalizeCutStoryboardImportPayload({
      projectName: 'Opening',
      shots: [
        { id: 'shot-1', shotNumber: 1, duration: 2, imagePath: '/repo/1.png', label: 'One' },
        { id: 'shot-2', shotNumber: 2, duration: 0, imagePath: '/repo/2.png', label: 'Two' },
        { id: 'shot-3', shotNumber: 3, duration: 5, label: 'No image' },
      ],
    });

    expect(payload).not.toBeNull();
    expect(buildStoryboardImageClips(payload!, 10)).toEqual([
      { id: 'shot-1', path: '/repo/1.png', name: 'One', duration: 2, startTime: 10 },
      { id: 'shot-2', path: '/repo/2.png', name: 'Two', duration: 3, startTime: 12 },
    ]);
  });

  it('keeps storyboard timing stable when a shot has no image', () => {
    const payload = normalizeCutStoryboardImportPayload({
      projectName: 'Opening',
      shots: [
        { id: 'shot-1', shotNumber: 1, duration: 2, imagePath: '/repo/1.png', label: 'One' },
        { id: 'shot-2', shotNumber: 2, duration: 4, label: 'No image' },
        { id: 'shot-3', shotNumber: 3, duration: 1, imagePath: '/repo/3.png', label: 'Three' },
      ],
    });

    expect(payload).not.toBeNull();
    expect(buildStoryboardImageClips(payload!, 10)).toEqual([
      { id: 'shot-1', path: '/repo/1.png', name: 'One', duration: 2, startTime: 10 },
      { id: 'shot-3', path: '/repo/3.png', name: 'Three', duration: 1, startTime: 16 },
    ]);
  });

  it('builds timeline metadata cues for dialogue, voice-over, and sound cues', () => {
    const payload = normalizeCutStoryboardImportPayload({
      projectName: 'Opening',
      shots: [
        {
          id: 'shot-1',
          shotNumber: 1,
          duration: 2,
          imagePath: '/repo/1.png',
          label: 'One',
          dialogue: 'We are close.',
          voiceOver: 'A quiet narrator line.',
        },
        {
          id: 'shot-2',
          shotNumber: 2,
          duration: 0,
          imagePath: '/repo/2.png',
          label: 'Two',
          soundCue: 'Distant thunder.',
        },
      ],
    });

    expect(payload).not.toBeNull();
    expect(buildStoryboardMetadataCues(payload!, 10)).toEqual([
      {
        id: 'shot-1-dialogue',
        kind: 'dialogue',
        text: 'We are close.',
        name: 'Dialogue 1: One',
        duration: 2,
        startTime: 10,
      },
      {
        id: 'shot-1-voice-over',
        kind: 'voiceOver',
        text: 'A quiet narrator line.',
        name: 'Voice Over 1: One',
        duration: 2,
        startTime: 10,
      },
      {
        id: 'shot-2-sound-cue',
        kind: 'soundCue',
        text: 'Distant thunder.',
        name: 'Sound Cue 2: Two',
        duration: 3,
        startTime: 12,
      },
    ]);
  });

  it('rejects empty storyboard imports', () => {
    expect(normalizeCutStoryboardImportPayload({ projectName: 'Empty', shots: [] })).toBeNull();
    expect(normalizeCutStoryboardImportPayload({ projectName: 'Broken' })).toBeNull();
  });
});
