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

  it('prefers approved prepared keyframe refs over raw comic image paths', () => {
    const payload = normalizeCutStoryboardImportPayload({
      projectName: 'Opening',
      shots: [
        {
          id: 'shot-1',
          shotNumber: 1,
          duration: 2,
          imagePath: '/repo/raw-comic-panel.png',
          preparedKeyframeRef: {
            refId: 'prepared-shot-1',
            role: 'derived',
            locator: {
              type: 'tool-result',
              toolCallId: 'transform-shot-1',
              assetIndex: 0,
            },
            label: 'Prepared keyframe',
          },
          referenceDescriptors: [
            {
              schemaVersion: 1,
              kind: 'reference-descriptor',
              referenceId: 'shot-1:keyframeRefs:0:prepared-shot-1',
              sourceKind: 'canvas-node',
              sourceId: 'shot-1',
              referenceKind: 'custom',
              role: 'keyframe',
              modality: 'image',
              payload: {
                type: 'custom',
                data: {
                  locatorType: 'tool-result',
                  toolCallId: 'transform-shot-1',
                  assetIndex: 0,
                },
              },
            },
            {
              schemaVersion: 1,
              kind: 'reference-descriptor',
              referenceId: 'unsafe',
              sourceKind: 'canvas-node',
              sourceId: 'shot-1',
              referenceKind: 'custom',
              role: 'keyframe',
              modality: 'image',
              payload: { type: 'path', path: 'blob:runtime-preview' },
            },
          ],
          label: 'One',
        },
      ],
    });

    expect(payload?.shots[0]?.preparedKeyframeRef).toEqual({
      refId: 'prepared-shot-1',
      role: 'derived',
      locator: {
        type: 'tool-result',
        toolCallId: 'transform-shot-1',
        assetIndex: 0,
      },
      label: 'Prepared keyframe',
    });
    expect(payload?.shots[0]?.referenceDescriptors).toEqual([
      {
        schemaVersion: 1,
        kind: 'reference-descriptor',
        referenceId: 'shot-1:keyframeRefs:0:prepared-shot-1',
        sourceKind: 'canvas-node',
        sourceId: 'shot-1',
        referenceKind: 'custom',
        role: 'keyframe',
        modality: 'image',
        payload: {
          type: 'custom',
          data: {
            locatorType: 'tool-result',
            toolCallId: 'transform-shot-1',
            assetIndex: 0,
          },
        },
      },
    ]);
    expect(payload).not.toBeNull();
    expect(buildStoryboardImageClips(payload!)).toEqual([
      {
        id: 'shot-1',
        path: 'tool-result:transform-shot-1:0',
        name: 'One',
        duration: 2,
        startTime: 0,
      },
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

  it('preserves structured voice cue speaker and voice lineage metadata', () => {
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
          voiceCues: [
            {
              cueId: 'shot-1-dialogue-1',
              kind: 'dialogue',
              text: 'We are close.',
              speakerName: 'Rin',
              speakerCharacterId: 'char-rin',
              speakerEntityRef: {
                entityId: 'char-rin',
                entityKind: 'character',
              },
              voiceAssetId: 'voice-rin',
              emotion: 'urgent',
              delivery: 'whispered',
            },
          ],
        },
      ],
    });

    expect(payload).not.toBeNull();
    expect(buildStoryboardMetadataCues(payload!, 0)).toEqual([
      {
        id: 'shot-1-dialogue-1',
        kind: 'dialogue',
        text: 'We are close.',
        name: 'Dialogue 1: One',
        duration: 2,
        startTime: 0,
        speakerName: 'Rin',
        speakerCharacterId: 'char-rin',
        speakerEntityId: 'char-rin',
        voiceAssetId: 'voice-rin',
        sourceCueId: 'shot-1-dialogue-1',
        emotion: 'urgent',
        delivery: 'whispered',
      },
    ]);
  });

  it('keeps additional structured cues when summary dialogue is present', () => {
    const payload = normalizeCutStoryboardImportPayload({
      projectName: 'Opening',
      shots: [
        {
          id: 'shot-1',
          shotNumber: 1,
          duration: 2,
          imagePath: '/repo/1.png',
          label: 'One',
          dialogue: 'First line.',
          voiceCues: [
            {
              cueId: 'shot-1-dialogue-1',
              kind: 'dialogue',
              text: 'First line.',
              speakerCharacterId: 'char-stale',
              speakerEntityRef: {
                entityId: 'char-rin',
                entityKind: 'character',
              },
            },
            {
              cueId: 'shot-1-dialogue-2',
              kind: 'dialogue',
              text: 'Second line.',
              speakerName: 'Rin',
            },
          ],
        },
      ],
    });

    expect(payload?.shots[0]?.voiceCues?.[0]).toMatchObject({
      speakerCharacterId: 'char-rin',
    });
    expect(buildStoryboardMetadataCues(payload!, 0)).toEqual([
      expect.objectContaining({
        id: 'shot-1-dialogue-1',
        text: 'First line.',
        speakerCharacterId: 'char-rin',
        speakerEntityId: 'char-rin',
      }),
      expect.objectContaining({
        id: 'shot-1-dialogue-2',
        text: 'Second line.',
        speakerName: 'Rin',
      }),
    ]);
  });

  it('merges summary dialogue with the structured cue whose text matches first', () => {
    const payload = normalizeCutStoryboardImportPayload({
      projectName: 'Opening',
      shots: [
        {
          id: 'shot-1',
          shotNumber: 1,
          duration: 2,
          imagePath: '/repo/1.png',
          label: 'One',
          dialogue: 'Second line.',
          voiceCues: [
            {
              cueId: 'shot-1-dialogue-1',
              kind: 'dialogue',
              text: 'First line.',
              speakerName: 'Aki',
            },
            {
              cueId: 'shot-1-dialogue-2',
              kind: 'dialogue',
              text: 'Second line.',
              speakerName: 'Rin',
            },
          ],
        },
      ],
    });

    expect(payload).not.toBeNull();
    expect(buildStoryboardMetadataCues(payload!, 0)).toEqual([
      expect.objectContaining({
        id: 'shot-1-dialogue-2',
        text: 'Second line.',
        speakerName: 'Rin',
      }),
      expect.objectContaining({
        id: 'shot-1-dialogue-1',
        text: 'First line.',
        speakerName: 'Aki',
      }),
    ]);
  });

  it('filters invalid structured voice cues during normalization', () => {
    const payload = normalizeCutStoryboardImportPayload({
      projectName: 'Opening',
      shots: [
        {
          id: 'shot-1',
          shotNumber: 1,
          duration: 2,
          imagePath: '/repo/1.png',
          label: 'One',
          voiceCues: [
            { cueId: 'bad-kind', kind: 'soundCue', text: 'Nope.' },
            { kind: 'dialogue', text: 'Missing cue id.' },
            { cueId: 'missing-text', kind: 'dialogue' },
            { cueId: 'valid', kind: 'voiceOver', text: 'Keep me.' },
          ],
        },
      ],
    });

    expect(payload?.shots[0]?.voiceCues).toEqual([
      {
        cueId: 'valid',
        kind: 'voiceOver',
        text: 'Keep me.',
      },
    ]);
  });

  it('preserves classified text cues without turning non-dialogue OCR into timeline cues', () => {
    const payload = normalizeCutStoryboardImportPayload({
      projectName: 'Opening',
      shots: [
        {
          id: 'shot-1',
          shotNumber: 1,
          duration: 2,
          imagePath: '/repo/1.png',
          label: 'One',
          textCues: [
            {
              cueId: 'text-dialogue',
              kind: 'dialogue',
              text: 'Wait!',
              speakerName: 'Rin',
              speakerCharacterId: 'char-rin',
              speakerEntityRef: { entityId: 'char-rin', entityKind: 'character' },
              confidence: 0.9,
            },
            {
              cueId: 'text-sign',
              kind: 'backgroundText',
              text: 'KEEP OUT',
            },
            {
              cueId: 'bad-kind',
              kind: 'subtitle',
              text: 'drop me',
            },
          ],
        },
      ],
    });

    expect(payload?.shots[0]?.textCues).toEqual([
      {
        cueId: 'text-dialogue',
        kind: 'dialogue',
        text: 'Wait!',
        speakerName: 'Rin',
        speakerCharacterId: 'char-rin',
        speakerEntityRef: { entityId: 'char-rin', entityKind: 'character' },
        confidence: 0.9,
      },
      {
        cueId: 'text-sign',
        kind: 'backgroundText',
        text: 'KEEP OUT',
      },
    ]);
    expect(payload ? buildStoryboardMetadataCues(payload) : []).toEqual([]);
  });

  it('rejects empty storyboard imports', () => {
    expect(normalizeCutStoryboardImportPayload({ projectName: 'Empty', shots: [] })).toBeNull();
    expect(normalizeCutStoryboardImportPayload({ projectName: 'Broken' })).toBeNull();
  });
});
