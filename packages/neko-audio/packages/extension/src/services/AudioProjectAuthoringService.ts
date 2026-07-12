import * as path from 'node:path';
import type {
  NekoProjectAuthoringResult,
  NekoProjectAuthoringTarget,
  TimelineTrack,
} from '@neko/shared';
import {
  createNekoProjectAuthoringDiagnostic,
  createNekoProjectAuthoringResult,
  validateNekoProjectAuthoringTarget,
} from '@neko/shared';
import type {
  AudioProjectAuthoringImportedSource,
  AudioProjectAuthoringImportSourceRequest,
} from '../types/api';
import { createDefaultAudioElement } from '../utils/audioElementFactory';
import { createNkaProjectRef } from './AudioProjectQualityFacade';
import type { AudioProjectSessionGateway } from './audioProjectSessionGateway';

export interface AudioProjectAuthoringProbe {
  probeAudio(filePath: string): Promise<{ readonly duration: number }>;
}

export interface AudioProjectAuthoringServiceOptions extends AudioProjectAuthoringProbe {
  readonly createId?: () => string;
  readonly now?: () => number;
}

export class AudioProjectAuthoringService {
  private readonly createId: () => string;
  private readonly now: () => number;

  constructor(
    private readonly gateway: AudioProjectSessionGateway,
    private readonly options: AudioProjectAuthoringServiceOptions,
  ) {
    this.createId = options.createId ?? createAuthoringId;
    this.now = options.now ?? Date.now;
  }

  async importSource(
    request: AudioProjectAuthoringImportSourceRequest,
  ): Promise<NekoProjectAuthoringResult<AudioProjectAuthoringImportedSource>> {
    const target = this.resolveExplicitTarget(request.target);
    if (!target.ok) return target.result;
    if (!request.sourcePath.trim()) {
      return failedResult(
        request.target,
        'source-resolution-failed',
        'Audio source import requires a non-empty sourcePath.',
      );
    }

    try {
      const session = await this.gateway.resolveSession(target.documentUri);
      if (!session) {
        return failedResult(
          request.target,
          'write-failed',
          `Audio project could not be loaded: ${target.documentUri}`,
        );
      }
      const audioInfo = await this.options.probeAudio(request.sourcePath);
      if (!Number.isFinite(audioInfo.duration) || audioInfo.duration <= 0) {
        return failedResult(
          request.target,
          'source-resolution-failed',
          'Audio source probe must return a positive finite duration.',
        );
      }
      const sourcePath = await this.gateway.linkAudioSource(session, request.sourcePath);
      const trackId = request.trackId ?? this.createId();
      const element = createDefaultAudioElement({
        id: this.createId(),
        filePath: sourcePath,
        duration: audioInfo.duration,
      });
      const existingTrack = session.projectData.tracks.find((track) => track.id === trackId);
      const operation = existingTrack
        ? {
            type: 'element.add' as const,
            meta: this.createOperationMeta('Import approved audio source'),
            payload: { trackId, element },
          }
        : {
            type: 'track.add' as const,
            meta: this.createOperationMeta('Import approved audio source'),
            payload: {
              track: {
                id: trackId,
                name: request.name?.trim() || sourceDisplayName(request.sourcePath),
                type: 'audio',
                elements: [element],
                muted: false,
                locked: false,
                hidden: false,
                isMain: session.projectData.tracks.length === 0,
              } satisfies TimelineTrack,
            },
          };
      const updated = await this.gateway.applyOperation(session, operation);

      return createNekoProjectAuthoringResult({
        ok: true,
        documentUri: target.documentUri,
        target: {
          kind: 'file',
          documentUri: target.documentUri,
          title: request.target.title,
          created: false,
          reveal: request.target.reveal ?? false,
        },
        created: false,
        revealed: false,
        projectRef: createNkaProjectRef(target.documentUri, updated.projectData),
        diagnostics: [],
        data: {
          sourcePath,
          trackId,
          elementId: element.id,
          duration: audioInfo.duration,
          createdTrack: !existingTrack,
        },
      });
    } catch (error) {
      return failedResult(
        request.target,
        'write-failed',
        error instanceof Error
          ? `Failed to import audio source. ${error.message}`
          : 'Failed to import audio source.',
      );
    }
  }

  private resolveExplicitTarget(
    target: NekoProjectAuthoringTarget,
  ):
    | { readonly ok: true; readonly documentUri: string }
    | { readonly ok: false; readonly result: NekoProjectAuthoringResult<never> } {
    if (target.kind !== 'file' || !target.documentUri) {
      return {
        ok: false,
        result: failedResult(
          target,
          'missing-authoring-target',
          'Audio headless authoring requires an explicit file target with documentUri.',
        ),
      };
    }
    const validation = validateNekoProjectAuthoringTarget(target, { createNewAllowed: false });
    if (!validation.ok) {
      return {
        ok: false,
        result: createNekoProjectAuthoringResult({
          ok: false,
          documentUri: target.documentUri,
          diagnostics: validation.diagnostics,
        }),
      };
    }
    return { ok: true, documentUri: target.documentUri };
  }

  private createOperationMeta(description: string) {
    return {
      id: this.createId(),
      timestamp: this.now(),
      source: 'ai' as const,
      description,
    };
  }
}

function failedResult<TData = never>(
  target: NekoProjectAuthoringTarget,
  code: Parameters<typeof createNekoProjectAuthoringDiagnostic>[0]['code'],
  message: string,
): NekoProjectAuthoringResult<TData> {
  return createNekoProjectAuthoringResult({
    ok: false,
    ...(target.documentUri ? { documentUri: target.documentUri } : {}),
    diagnostics: [createNekoProjectAuthoringDiagnostic({ code, message })],
  });
}

function sourceDisplayName(sourcePath: string): string {
  return path.basename(sourcePath, path.extname(sourcePath)) || 'Approved Audio';
}

function createAuthoringId(): string {
  return `audio-authoring-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
