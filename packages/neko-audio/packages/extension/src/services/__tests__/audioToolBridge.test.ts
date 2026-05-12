import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioProjectData } from '@neko/shared';
import { applyOperation } from '@neko/shared';
import { AudioToolBridge } from '../audioToolBridge';
import type {
  AudioProjectEditOperation,
  AudioProjectSessionGateway,
  ProjectSession,
} from '../audioProjectSessionGateway';
import type { AudioService } from '../AudioService';

vi.mock('../../utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

function createProject(): AudioProjectData {
  return {
    version: '2.1',
    name: 'Test Project',
    sampleRate: 48000,
    channels: 2,
    bpm: 120,
    masterVolume: 1,
    masterEffectsChain: [],
    markers: [],
    tracks: [
      {
        id: 'track-1',
        name: 'Voice',
        type: 'audio',
        elements: [],
        muted: false,
        locked: false,
        hidden: false,
        isMain: true,
      },
    ],
    trackMix: {
      'track-1': {
        volume: 1,
        pan: 0,
        solo: false,
        effectChain: [],
      },
    },
  };
}

function createGateway(initialProject = createProject()) {
  const state = {
    session: {
      documentUri: 'file:///project/test.nka',
      projectData: initialProject,
    } satisfies ProjectSession,
    synced: [] as Array<{ operation: AudioProjectEditOperation; projectData: AudioProjectData }>,
  };

  const gateway: AudioProjectSessionGateway = {
    async resolveSession(documentUri?: string) {
      if (documentUri && documentUri !== state.session.documentUri) return null;
      return state.session;
    },
    async applyOperation(session, operation) {
      const projectData = applyOperation(session.projectData, operation);
      state.session = { documentUri: session.documentUri, projectData };
      state.synced.push({ operation, projectData });
      return state.session;
    },
    async buildMixConfig() {
      return {
        config: { tracks: [], masterEffects: [], masterVolume: 1, sampleRate: 48000, channels: 2 },
        warnings: [
          {
            code: 'planned-effect',
            message: 'Planned effect skipped',
            effectId: 'fx-planned',
            effectType: 'noise-reduction',
          },
        ],
      };
    },
  };

  return { gateway, state };
}

function createAudioService() {
  return {
    probeAudio: vi.fn().mockResolvedValue({
      duration: 10,
      codec: 'wav',
      sampleRate: 48000,
      channels: 2,
      format: 'wav',
    }),
    mixExport: vi.fn().mockResolvedValue({
      output: '/tmp/mix.wav',
      warnings: ['Limiter ceiling adjusted'],
    }),
    analyzeLoudness: vi.fn(),
    transcode: vi.fn().mockResolvedValue('/tmp/clean.wav'),
  } as unknown as AudioService;
}

describe('AudioToolBridge', () => {
  let audioService: AudioService;

  beforeEach(() => {
    vi.clearAllMocks();
    audioService = createAudioService();
  });

  it('returns documentUri in read-tool responses', async () => {
    const { gateway } = createGateway();
    const bridge = new AudioToolBridge(gateway, audioService);

    const result = await bridge.executeAgentTool('GetAudioProjectInfo', {});

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      documentUri: 'file:///project/test.nka',
      name: 'Test Project',
      trackCount: 1,
    });
  });

  it('applies track volume edits through the gateway and syncs the operation', async () => {
    const { gateway, state } = createGateway();
    const bridge = new AudioToolBridge(gateway, audioService);

    const result = await bridge.executeAgentTool('SetTrackVolume', {
      documentUri: 'file:///project/test.nka',
      trackId: 'track-1',
      volume: 0.5,
    });

    expect(result.success).toBe(true);
    expect(state.session.projectData.trackMix?.['track-1']?.volume).toBe(0.5);
    expect(state.synced).toHaveLength(1);
    expect(state.synced[0]?.operation.type).toBe('track.mix.setVolume');
  });

  it('fails honestly for invalid track IDs', async () => {
    const { gateway, state } = createGateway();
    const bridge = new AudioToolBridge(gateway, audioService);

    const result = await bridge.executeAgentTool('SetTrackVolume', {
      trackId: 'missing-track',
      volume: 0.5,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('missing-track');
    expect(state.synced).toHaveLength(0);
  });

  it('fails when documentUri resolves to no open project', async () => {
    const { gateway } = createGateway();
    const bridge = new AudioToolBridge(gateway, audioService);

    const result = await bridge.executeAgentTool('ListAudioTracks', {
      documentUri: 'file:///project/other.nka',
    });

    expect(result).toEqual({ success: false, error: 'No audio project open' });
  });

  it('rejects planned-only effects before editing project data', async () => {
    const { gateway, state } = createGateway();
    const bridge = new AudioToolBridge(gateway, audioService);

    const result = await bridge.executeAgentTool('ApplyTrackEffect', {
      trackId: 'track-1',
      effectType: 'noise-reduction',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('planned');
    expect(state.synced).toHaveLength(0);
  });

  it('imports audio with engine-aligned default element fields', async () => {
    const { gateway, state } = createGateway();
    const bridge = new AudioToolBridge(gateway, audioService);

    const result = await bridge.executeAgentTool('ImportAudio', {
      filePath: '/tmp/voice.wav',
      name: 'Imported Voice',
    });

    expect(result.success).toBe(true);
    const importedTrack = state.session.projectData.tracks.at(-1);
    const element = importedTrack?.elements[0];
    expect(element).toMatchObject({
      type: 'audio',
      src: '/tmp/voice.wav',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0, anchorY: 0 },
      speed: { speed: 1, preservePitch: true, reverse: false },
    });
  });

  it('returns Extension-built mix export warnings with engine warnings', async () => {
    const { gateway } = createGateway();
    const bridge = new AudioToolBridge(gateway, audioService);

    const result = await bridge.executeAgentTool('MixExport', {
      outputPath: '/tmp/mix.wav',
      format: 'wav',
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      output: '/tmp/mix.wav',
      documentUri: 'file:///project/test.nka',
      warnings: ['Planned effect skipped', 'Limiter ceiling adjusted'],
    });
  });

  it('fails project tools when no project is open', async () => {
    const { gateway } = createGateway();
    vi.spyOn(gateway, 'resolveSession').mockResolvedValue(null);
    const bridge = new AudioToolBridge(gateway, audioService);

    const result = await bridge.executeAgentTool('SetTrackPan', {
      trackId: 'track-1',
      pan: 0.2,
    });

    expect(result).toEqual({ success: false, error: 'No audio project open' });
  });
});
