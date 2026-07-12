import { describe, expect, it, vi } from 'vitest';
import { CURRENT_NKA_VERSION, type AudioProjectData } from '@neko/shared';
import { AudioProjectAuthoringService } from './AudioProjectAuthoringService';
import type {
  AudioProjectEditOperation,
  AudioProjectSessionGateway,
  ProjectSession,
} from './audioProjectSessionGateway';

function createProject(): AudioProjectData {
  return {
    version: CURRENT_NKA_VERSION,
    name: 'Headless Mix',
    sampleRate: 48_000,
    channels: 2,
    tracks: [],
    masterEffectsChain: [],
    markers: [],
  };
}

describe('AudioProjectAuthoringService', () => {
  it('imports approved audio into an unopened explicit target and returns its durable revision', async () => {
    let stored = createProject();
    const gateway: AudioProjectSessionGateway = {
      resolveSession: vi.fn(async (documentUri) => ({
        documentUri: documentUri!,
        projectData: stored,
      })),
      linkAudioSource: vi.fn(async () => 'audio/approved.wav'),
      applyOperation: vi.fn(async (session, operation: AudioProjectEditOperation) => {
        if (operation.type !== 'track.add') {
          throw new Error(`Unexpected operation: ${operation.type}`);
        }
        stored = {
          ...session.projectData,
          tracks: [...session.projectData.tracks, operation.payload.track],
        };
        return { documentUri: session.documentUri, projectData: stored } satisfies ProjectSession;
      }),
      buildMixConfig: vi.fn(),
    };
    const service = new AudioProjectAuthoringService(gateway, {
      probeAudio: vi.fn(async () => ({ duration: 3.25 })),
      createId: (() => {
        let index = 0;
        return () => `audio-id-${++index}`;
      })(),
      now: () => 100,
    });

    const result = await service.importSource({
      target: { kind: 'file', documentUri: 'file:///project/mix.nka' },
      sourcePath: '/project/source/approved.wav',
      name: 'Approved VO',
    });

    expect(result).toMatchObject({
      ok: true,
      documentUri: 'file:///project/mix.nka',
      projectRef: {
        domain: 'audio',
        documentUri: 'file:///project/mix.nka',
        projectRevision: expect.stringMatching(/^nka:/),
        contentDigest: expect.any(String),
      },
      data: {
        sourcePath: 'audio/approved.wav',
        trackId: 'audio-id-1',
        elementId: 'audio-id-2',
      },
    });
    expect(gateway.resolveSession).toHaveBeenCalledWith('file:///project/mix.nka');
    expect(gateway.applyOperation).toHaveBeenCalledWith(
      expect.objectContaining({ documentUri: 'file:///project/mix.nka' }),
      expect.objectContaining({ type: 'track.add' }),
    );
    expect(stored.tracks[0]?.elements[0]).toMatchObject({
      src: 'audio/approved.wav',
      duration: 3.25,
    });
  });

  it('fails visibly when a durable explicit target is missing and never resolves active state', async () => {
    const resolveSession = vi.fn();
    const service = new AudioProjectAuthoringService(
      {
        resolveSession,
        linkAudioSource: vi.fn(),
        applyOperation: vi.fn(),
        buildMixConfig: vi.fn(),
      },
      { probeAudio: vi.fn() },
    );

    const result = await service.importSource({
      target: { kind: 'active' },
      sourcePath: '/project/source/approved.wav',
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'missing-authoring-target' }),
    ]);
    expect(resolveSession).not.toHaveBeenCalled();
  });
});
