import { describe, expect, it, vi } from 'vitest';
import type {
  AudioProjectData,
  ProjectFileOps,
  ProjectQualityRequest,
  QualityProjectRef,
  ResourceRef,
  TimelineTrack,
} from '@neko/shared';
import {
  MEDIA_QUALITY_CONTRACT_VERSION,
  PROJECT_QUALITY_CONTRACT_VERSION,
  createResourceRef,
} from '@neko/shared';
import { AudioProjectQualityFacade, createNkaProjectRef } from './AudioProjectQualityFacade';

describe('AudioProjectQualityFacade', () => {
  it('validates the current disk revision and returns a stable snapshot', async () => {
    const document = createProject('media/voice.wav');
    const project = createNkaProjectRef('file:///project/mix.nka', document);
    const facade = new AudioProjectQualityFacade({
      fileOps: createMemoryFileOps({
        '/project/mix.nka': JSON.stringify(document),
        '/project/media/voice.wav': 'audio',
      }),
      now: () => new Date('2026-07-12T00:00:00.000Z'),
    });

    const validated = await facade.validateProject(createRequest(project));
    const snapshot = await facade.getProjectSnapshot(createRequest(project));

    expect(validated).toMatchObject({
      ok: true,
      data: {
        revision: project.projectRevision,
        contentDigest: project.contentDigest,
        projectRef: project,
      },
    });
    expect(snapshot).toMatchObject({
      ok: true,
      data: {
        project,
        createdAt: '2026-07-12T00:00:00.000Z',
        snapshotRef: {
          provider: 'neko-audio',
          kind: 'document',
          fingerprint: { strategy: 'hash', value: project.contentDigest },
        },
      },
    });
  });

  it('prefers the target-bound live snapshot over stale disk state', async () => {
    const disk = createProject('media/disk.wav', { name: 'Disk' });
    const live = createProject('media/live.wav', { name: 'Live' });
    const project = createNkaProjectRef('file:///project/live.nka', live);
    const snapshotSource = {
      getSnapshot: vi.fn(async () => ({ status: 'available' as const, document: live })),
    };
    const facade = new AudioProjectQualityFacade({
      fileOps: createMemoryFileOps({
        '/project/live.nka': JSON.stringify(disk),
        '/project/media/live.wav': 'audio',
      }),
      snapshotSource,
    });

    expect((await facade.validateProject(createRequest(project))).ok).toBe(true);
    expect(snapshotSource.getSnapshot).toHaveBeenCalledWith({
      documentUri: 'file:///project/live.nka',
    });
  });

  it('rejects stale revisions before final-mix or readiness adapters run', async () => {
    const document = createProject('media/voice.wav');
    const current = createNkaProjectRef('file:///project/stale.nka', document);
    const stale = { ...current, projectRevision: 'nka:stale', contentDigest: 'stale' };
    const finalMixRenderer = { renderFinalMix: vi.fn() };
    const exportReadinessProbe = { check: vi.fn() };
    const facade = new AudioProjectQualityFacade({
      fileOps: createMemoryFileOps({
        '/project/stale.nka': JSON.stringify(document),
        '/project/media/voice.wav': 'audio',
      }),
      finalMixRenderer,
      exportReadinessProbe,
    });

    const preview = await facade.renderPreview(createRequest(stale));
    const readiness = await facade.checkExportReadiness(createRequest(stale));

    expect(preview).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'stale-quality-evidence' })],
    });
    expect(readiness.ok).toBe(false);
    expect(finalMixRenderer.renderFinalMix).not.toHaveBeenCalled();
    expect(exportReadinessProbe.check).not.toHaveBeenCalled();
  });

  it.each([
    [
      'duplicate track',
      createProject(undefined, { tracks: [createTrack('same'), createTrack('same')] }),
      'track ids must be non-empty and unique',
    ],
    [
      'orphan mix',
      createProject(undefined, { trackMix: { missing: createMixState() } }),
      'trackMix references unknown track',
    ],
    ['runtime source', createProject('blob:preview'), 'runtime-only handle'],
    ['missing source', createProject('media/missing.wav'), 'is missing'],
  ])('fails visible for %s', async (_name, document, message) => {
    const project = createNkaProjectRef('file:///project/invalid.nka', document);
    const facade = new AudioProjectQualityFacade({
      fileOps: createMemoryFileOps({ '/project/invalid.nka': JSON.stringify(document) }),
    });

    const result = await facade.validateProject(createRequest(project));

    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((item) => item.message.includes(message))).toBe(true);
  });

  it('rejects invalid trims and review ranges beyond the audible duration', async () => {
    const invalid = createProject('media/voice.wav');
    const element = invalid.tracks[0]?.elements[0];
    if (!element) throw new Error('fixture element missing');
    element.trimEnd = element.duration;
    const invalidProject = createNkaProjectRef('file:///project/trim.nka', invalid);
    const invalidFacade = new AudioProjectQualityFacade({
      fileOps: createMemoryFileOps({
        '/project/trim.nka': JSON.stringify(invalid),
        '/project/media/voice.wav': 'audio',
      }),
    });
    expect((await invalidFacade.validateProject(createRequest(invalidProject))).ok).toBe(false);

    const valid = createProject('media/voice.wav');
    const project = createNkaProjectRef('file:///project/range.nka', valid);
    const facade = new AudioProjectQualityFacade({
      fileOps: createMemoryFileOps({
        '/project/range.nka': JSON.stringify(valid),
        '/project/media/voice.wav': 'audio',
      }),
    });
    const result = await facade.validateProject(
      createRequest(project, { startSeconds: 0, endSeconds: 11 }),
    );
    expect(result).toMatchObject({ ok: false });
    expect(
      result.diagnostics.some((item) => item.message.includes('beyond the 10s timeline')),
    ).toBe(true);
  });

  it('passes exact revision and range to final-mix rendering', async () => {
    const document = createProject('media/voice.wav');
    const project = createNkaProjectRef('file:///project/preview.nka', document);
    const finalMixRenderer = {
      renderFinalMix: vi.fn(async () => ({ previewRef: createPreviewRef(project.contentDigest!) })),
    };
    const facade = new AudioProjectQualityFacade({
      fileOps: createMemoryFileOps({
        '/project/preview.nka': JSON.stringify(document),
        '/project/media/voice.wav': 'audio',
      }),
      finalMixRenderer,
    });
    const mediaRange = { startSeconds: 1, endSeconds: 4 };

    expect((await facade.renderPreview(createRequest(project, mediaRange))).ok).toBe(true);
    expect(finalMixRenderer.renderFinalMix).toHaveBeenCalledWith({
      project,
      document: expect.objectContaining({ name: document.name, tracks: document.tracks }),
      revision: project.projectRevision,
      mediaRange,
    });
  });

  it('requires final-mix loudness and true-peak evidence for export readiness', async () => {
    const document = createProject('media/voice.wav');
    const project = createNkaProjectRef('file:///project/readiness.nka', document);
    const facade = new AudioProjectQualityFacade({
      fileOps: createMemoryFileOps({
        '/project/readiness.nka': JSON.stringify(document),
        '/project/media/voice.wav': 'audio',
      }),
    });

    const unavailable = await facade.checkExportReadiness(createRequest(project));

    expect(unavailable).toMatchObject({ ok: true, data: { ready: false } });
    expect(
      unavailable.data?.diagnostics.some(
        (item) => item.severity === 'error' && item.message.includes('loudness and true-peak'),
      ),
    ).toBe(true);

    const probe = { check: vi.fn(async () => ({ ready: true, requiredEvidenceIds: ['mix-1'] })) };
    const readyFacade = new AudioProjectQualityFacade({
      fileOps: createMemoryFileOps({
        '/project/readiness.nka': JSON.stringify(document),
        '/project/media/voice.wav': 'audio',
      }),
      exportReadinessProbe: probe,
    });
    const ready = await readyFacade.checkExportReadiness(createRequest(project));

    expect(ready).toMatchObject({
      ok: true,
      data: { ready: true, requiredEvidenceIds: ['mix-1'] },
    });
    expect(probe.check).toHaveBeenCalledWith(
      expect.objectContaining({ project, durationSeconds: 10 }),
    );
  });

  it('does not declare silent routing ready even when an export adapter is registered', async () => {
    const document = createProject('media/voice.wav', { masterVolume: 0 });
    const project = createNkaProjectRef('file:///project/silent.nka', document);
    const probe = { check: vi.fn(async () => ({ ready: true })) };
    const facade = new AudioProjectQualityFacade({
      fileOps: createMemoryFileOps({
        '/project/silent.nka': JSON.stringify(document),
        '/project/media/voice.wav': 'audio',
      }),
      exportReadinessProbe: probe,
    });

    const result = await facade.checkExportReadiness(createRequest(project));

    expect(result).toMatchObject({ ok: true, data: { ready: false } });
    expect(
      result.data?.diagnostics.some((item) => item.message.includes('masterVolume is zero')),
    ).toBe(true);
  });

  it('fails closed for future schemas and unavailable target-bound snapshots', async () => {
    const future = createProject(undefined, { version: '9.0' });
    const futureProject: QualityProjectRef = {
      domain: 'audio',
      documentUri: 'file:///project/future.nka',
      projectRevision: 'nka:future',
    };
    const futureFacade = new AudioProjectQualityFacade({
      fileOps: createMemoryFileOps({ '/project/future.nka': JSON.stringify(future) }),
    });
    const futureResult = await futureFacade.validateProject(createRequest(futureProject));
    expect(futureResult.ok).toBe(false);
    expect(
      futureResult.diagnostics.some((item) => item.message.includes('newer than supported')),
    ).toBe(true);

    const current = createProject();
    const project = createNkaProjectRef('file:///project/unavailable.nka', current);
    const unavailableFacade = new AudioProjectQualityFacade({
      fileOps: createMemoryFileOps({}),
      snapshotSource: {
        async getSnapshot() {
          return {
            status: 'unavailable' as const,
            diagnostic: {
              code: 'quality-evaluator-failed' as const,
              severity: 'error' as const,
              message: 'Target-bound live snapshot unavailable.',
            },
          };
        },
      },
    });
    expect(await unavailableFacade.validateProject(createRequest(project))).toMatchObject({
      ok: false,
      diagnostics: [
        expect.objectContaining({ message: 'Target-bound live snapshot unavailable.' }),
      ],
    });
  });
});

function createRequest(
  project: QualityProjectRef,
  mediaRange?: { readonly startSeconds: number; readonly endSeconds: number },
): ProjectQualityRequest {
  return {
    version: PROJECT_QUALITY_CONTRACT_VERSION,
    requestId: 'request-1',
    project,
    target: {
      version: MEDIA_QUALITY_CONTRACT_VERSION,
      targetId: 'audio-project',
      kind: 'project-artifact',
      projectRef: project,
      revision: project.projectRevision,
      ...(mediaRange ? { mediaRange } : {}),
    },
  };
}

function createProject(src?: string, overrides: Partial<AudioProjectData> = {}): AudioProjectData {
  return {
    version: '2.2',
    name: 'Audio project',
    sampleRate: 48000,
    channels: 2,
    tracks: [createTrack('track-1', src ? [createAudioElement('clip-1', src)] : [])],
    masterEffectsChain: [],
    markers: [],
    trackMix: { 'track-1': createMixState() },
    masterVolume: 1,
    ...overrides,
  };
}

function createTrack(id: string, elements: TimelineTrack['elements'] = []): TimelineTrack {
  return {
    id,
    name: 'Audio',
    type: 'audio',
    elements,
    muted: false,
    locked: false,
    hidden: false,
    isMain: true,
  };
}

function createAudioElement(
  id: string,
  src: string,
): Extract<TimelineTrack['elements'][number], { type: 'audio' }> {
  return {
    id,
    name: 'Clip',
    type: 'audio',
    src,
    startTime: 0,
    duration: 10,
    trimStart: 0,
    trimEnd: 0,
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5 },
    opacity: 1,
    blendMode: 'normal',
    effects: [],
    muted: false,
    hidden: false,
    locked: false,
  };
}

function createMixState() {
  return { volume: 1, pan: 0, solo: false, effectChain: [] };
}

function createPreviewRef(digest: string): ResourceRef {
  return createResourceRef({
    scope: 'project',
    provider: 'neko-audio-review',
    kind: 'preview',
    source: { kind: 'preview-asset', previewAssetId: `audio-review-${digest}` },
    fingerprint: { strategy: 'hash', value: digest },
  });
}

function createMemoryFileOps(initial: Readonly<Record<string, string>>): ProjectFileOps {
  const files = new Map(Object.entries(initial));
  const encoder = new TextEncoder();
  return {
    readFile: vi.fn(async (filePath: string) => {
      const content = files.get(filePath);
      if (content === undefined) throw new Error(`ENOENT: ${filePath}`);
      return encoder.encode(content);
    }),
    writeFile: vi.fn(async (filePath: string, content: Uint8Array) => {
      files.set(filePath, new TextDecoder().decode(content));
    }),
  };
}
