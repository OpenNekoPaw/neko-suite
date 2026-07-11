import { dirname, extname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AudioProjectData,
  ProjectExportReadiness,
  ProjectFileOps,
  ProjectQualityFacade,
  ProjectQualityOperation,
  ProjectQualityPreview,
  ProjectQualityProbe,
  ProjectQualityRequest,
  ProjectQualityResult,
  ProjectQualitySnapshot,
  ProjectSourceDescriptor,
  QualityDiagnostic,
  QualityProjectRef,
  QualityTarget,
  ResourceRef,
} from '@neko/shared';
import {
  PROJECT_QUALITY_CONTRACT_VERSION,
  createResourceRef,
  detectRuntimeOrCacheSourceHandle,
  hashStableValue,
  nkaSourcePathPolicy,
  validateProjectQualityPreview,
  validateQualityTarget,
} from '@neko/shared';
import { loadNka } from '@neko/shared/nka';

export type AudioProjectSnapshotResult =
  | { readonly status: 'available'; readonly document: AudioProjectData }
  | { readonly status: 'not-open' }
  | { readonly status: 'unavailable'; readonly diagnostic: QualityDiagnostic };

export interface AudioProjectSnapshotSource {
  getSnapshot(input: { readonly documentUri: string }): Promise<AudioProjectSnapshotResult>;
}

export interface AudioProjectFinalMixRenderer {
  renderFinalMix(input: {
    readonly project: QualityProjectRef;
    readonly document: AudioProjectData;
    readonly revision: string;
    readonly mediaRange: QualityTarget['mediaRange'];
  }): Promise<{
    readonly previewRef: ResourceRef;
    readonly sessionRenderUri?: string;
  }>;
}

export interface AudioProjectRuntimeProbe {
  probe(input: {
    readonly project: QualityProjectRef;
    readonly document: AudioProjectData;
  }): Promise<{
    readonly available: boolean;
    readonly profileId?: string;
    readonly diagnostics?: readonly QualityDiagnostic[];
  }>;
}

export interface AudioProjectExportReadinessProbe {
  check(input: {
    readonly project: QualityProjectRef;
    readonly document: AudioProjectData;
    readonly target: QualityTarget;
    readonly durationSeconds: number;
  }): Promise<{
    readonly ready: boolean;
    readonly requiredEvidenceIds?: readonly string[];
    readonly diagnostics?: readonly QualityDiagnostic[];
  }>;
}

export interface AudioProjectQualityFacadeOptions {
  readonly fileOps: ProjectFileOps;
  readonly snapshotSource?: AudioProjectSnapshotSource;
  readonly finalMixRenderer?: AudioProjectFinalMixRenderer;
  readonly runtimeProbe?: AudioProjectRuntimeProbe;
  readonly exportReadinessProbe?: AudioProjectExportReadinessProbe;
  readonly resolveSourcePath?: (sourcePath: string, projectFilePath: string) => string | undefined;
  readonly now?: () => Date;
}

interface LoadedAudioProject {
  readonly document: AudioProjectData;
  readonly project: QualityProjectRef;
  readonly revision: string;
  readonly contentDigest: string;
  readonly snapshotRef: ResourceRef;
  readonly diagnostics: readonly QualityDiagnostic[];
}

export class AudioProjectQualityFacade implements ProjectQualityFacade {
  private readonly now: () => Date;

  constructor(private readonly options: AudioProjectQualityFacadeOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async validateProject(
    request: ProjectQualityRequest,
  ): Promise<ProjectQualityResult<QualityTarget>> {
    const loaded = await this.loadCurrentProject(request, 'validate-project');
    if (!loaded.ok) return loaded.result;
    return successResult(
      request,
      'validate-project',
      {
        ...request.target,
        revision: loaded.value.revision,
        contentDigest: loaded.value.contentDigest,
        projectRef: loaded.value.project,
      },
      loaded.value.diagnostics,
    );
  }

  async getProjectSnapshot(
    request: ProjectQualityRequest,
  ): Promise<ProjectQualityResult<ProjectQualitySnapshot>> {
    const loaded = await this.loadCurrentProject(request, 'get-project-snapshot');
    if (!loaded.ok) return loaded.result;
    return successResult(
      request,
      'get-project-snapshot',
      {
        project: loaded.value.project,
        snapshotRef: loaded.value.snapshotRef,
        createdAt: this.now().toISOString(),
      },
      loaded.value.diagnostics,
    );
  }

  async renderPreview(
    request: ProjectQualityRequest,
  ): Promise<ProjectQualityResult<ProjectQualityPreview>> {
    const loaded = await this.loadCurrentProject(request, 'render-preview');
    if (!loaded.ok) return loaded.result;
    if (!this.options.finalMixRenderer) {
      return failedResult(
        request,
        'render-preview',
        diagnostic(
          'quality-evaluator-failed',
          'Audio final-mix review rendering is unavailable because no target-bound review renderer is registered.',
        ),
      );
    }

    const rendered = await this.options.finalMixRenderer.renderFinalMix({
      project: loaded.value.project,
      document: loaded.value.document,
      revision: loaded.value.revision,
      mediaRange: request.target.mediaRange,
    });
    const preview: ProjectQualityPreview = {
      project: loaded.value.project,
      previewRef: rendered.previewRef,
      ...(rendered.sessionRenderUri ? { sessionRenderUri: rendered.sessionRenderUri } : {}),
      createdAt: this.now().toISOString(),
    };
    const validation = validateProjectQualityPreview(preview);
    if (!validation.ok) {
      return failedResult(request, 'render-preview', ...validation.diagnostics);
    }
    return successResult(request, 'render-preview', preview, loaded.value.diagnostics);
  }

  async probeRuntime(
    request: ProjectQualityRequest,
  ): Promise<ProjectQualityResult<ProjectQualityProbe>> {
    const loaded = await this.loadCurrentProject(request, 'probe-runtime');
    if (!loaded.ok) return loaded.result;
    if (!this.options.runtimeProbe) {
      const diagnostics = [
        diagnostic(
          'quality-evaluator-failed',
          'Audio runtime is unavailable because no target-bound runtime probe is registered.',
          'warning',
        ),
      ];
      return successResult(
        request,
        'probe-runtime',
        { project: loaded.value.project, available: false, diagnostics },
        loaded.value.diagnostics,
      );
    }

    const probe = await this.options.runtimeProbe.probe({
      project: loaded.value.project,
      document: loaded.value.document,
    });
    return successResult(
      request,
      'probe-runtime',
      {
        project: loaded.value.project,
        available: probe.available,
        ...(probe.profileId ? { profileId: probe.profileId } : {}),
        diagnostics: probe.diagnostics ?? [],
      },
      loaded.value.diagnostics,
    );
  }

  async checkExportReadiness(
    request: ProjectQualityRequest,
  ): Promise<ProjectQualityResult<ProjectExportReadiness>> {
    const loaded = await this.loadCurrentProject(request, 'check-export-readiness');
    if (!loaded.ok) return loaded.result;

    const diagnostics = [
      ...loaded.value.diagnostics,
      ...validateExportRouting(loaded.value.document),
    ];
    diagnostics.push(
      diagnostic(
        'partial-quality-coverage',
        '.nka persists routing and track mix, while output container, codec, bitrate, loudness target, and output path remain export-adapter settings.',
        'warning',
      ),
    );
    if (!this.options.exportReadinessProbe) {
      diagnostics.push(
        diagnostic(
          'quality-evaluator-failed',
          'Audio export readiness is unavailable because final-mix loudness and true-peak evidence cannot be produced without a target-bound export adapter.',
        ),
      );
      return successResult(request, 'check-export-readiness', {
        project: loaded.value.project,
        ready: false,
        requiredEvidenceIds: [],
        diagnostics,
      });
    }

    const probe = await this.options.exportReadinessProbe.check({
      project: loaded.value.project,
      document: loaded.value.document,
      target: request.target,
      durationSeconds: getProjectDuration(loaded.value.document),
    });
    diagnostics.push(...(probe.diagnostics ?? []));
    return successResult(request, 'check-export-readiness', {
      project: loaded.value.project,
      ready: probe.ready && !hasErrors(diagnostics),
      requiredEvidenceIds: probe.requiredEvidenceIds ?? [],
      diagnostics,
    });
  }

  private async loadCurrentProject(
    request: ProjectQualityRequest,
    operation: ProjectQualityOperation,
  ): Promise<
    | { readonly ok: true; readonly value: LoadedAudioProject }
    | { readonly ok: false; readonly result: ProjectQualityResult<never> }
  > {
    const requestDiagnostics = validateAudioProjectRequest(request);
    if (hasErrors(requestDiagnostics)) {
      return { ok: false, result: failedResult(request, operation, ...requestDiagnostics) };
    }

    const projectFilePath = tryDocumentUriToFilePath(request.project.documentUri);
    if (!projectFilePath) {
      return {
        ok: false,
        result: failedResult(
          request,
          operation,
          diagnostic(
            'invalid-quality-target',
            'Audio project documentUri must be a valid file URI or local path.',
            'error',
            ['project', 'documentUri'],
          ),
        ),
      };
    }

    const source = await this.readTargetBoundDocument(request.project.documentUri, projectFilePath);
    if (!source.ok) {
      return { ok: false, result: failedResult(request, operation, ...source.diagnostics) };
    }
    const loaded = loadNka(JSON.stringify(source.document));
    const diagnostics: QualityDiagnostic[] = [
      ...requestDiagnostics,
      ...loaded.validation.errors.map(mapNkaDiagnostic),
      ...loaded.validation.warnings.map(mapNkaDiagnostic),
    ];
    if (!loaded.validation.valid) {
      return { ok: false, result: failedResult(request, operation, ...diagnostics) };
    }
    if (loaded.compatibility.mode === 'future' || loaded.compatibility.readOnly) {
      return {
        ok: false,
        result: failedResult(
          request,
          operation,
          ...diagnostics,
          diagnostic(
            'invalid-quality-target',
            `NKA schema ${loaded.compatibility.loadedVersion} is newer than supported schema ${loaded.compatibility.currentVersion}; ProjectQuality cannot validate it authoritatively.`,
            'error',
            ['version'],
          ),
        ),
      };
    }

    diagnostics.push(...validateAudioStructure(loaded.data));
    diagnostics.push(...validateTargetRange(request.target, loaded.data));
    diagnostics.push(...(await this.validateResources(loaded.data, projectFilePath)));
    if (hasErrors(diagnostics)) {
      return { ok: false, result: failedResult(request, operation, ...diagnostics) };
    }

    const contentDigest = hashStableValue(loaded.data);
    const revision = `nka:${contentDigest}`;
    if (
      request.project.projectRevision !== revision ||
      (request.project.contentDigest !== undefined &&
        request.project.contentDigest !== contentDigest)
    ) {
      return {
        ok: false,
        result: failedResult(
          request,
          operation,
          diagnostic(
            'stale-quality-evidence',
            'The requested Audio project revision does not match the target-bound .nka snapshot.',
            'error',
            ['project', 'projectRevision'],
          ),
        ),
      };
    }

    const project: QualityProjectRef = {
      domain: 'audio',
      documentUri: request.project.documentUri,
      projectRevision: revision,
      contentDigest,
    };
    return {
      ok: true,
      value: {
        document: loaded.data,
        project,
        revision,
        contentDigest,
        diagnostics,
        snapshotRef: createNkaSnapshotRef(project, contentDigest),
      },
    };
  }

  private async readTargetBoundDocument(
    documentUri: string,
    projectFilePath: string,
  ): Promise<
    | { readonly ok: true; readonly document: AudioProjectData }
    | { readonly ok: false; readonly diagnostics: readonly QualityDiagnostic[] }
  > {
    if (this.options.snapshotSource) {
      const snapshot = await this.options.snapshotSource.getSnapshot({ documentUri });
      if (snapshot.status === 'available') return { ok: true, document: snapshot.document };
      if (snapshot.status === 'unavailable') {
        return { ok: false, diagnostics: [snapshot.diagnostic] };
      }
    }

    try {
      const bytes = await this.options.fileOps.readFile(projectFilePath);
      const loaded = loadNka(new TextDecoder().decode(bytes));
      if (!loaded.validation.valid) {
        return {
          ok: false,
          diagnostics: [
            ...loaded.validation.errors.map(mapNkaDiagnostic),
            ...loaded.validation.warnings.map(mapNkaDiagnostic),
          ],
        };
      }
      return { ok: true, document: loaded.data };
    } catch (error) {
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            'quality-evaluator-failed',
            `Failed to read Audio project: ${formatError(error)}`,
          ),
        ],
      };
    }
  }

  private async validateResources(
    document: AudioProjectData,
    projectFilePath: string,
  ): Promise<readonly QualityDiagnostic[]> {
    const diagnostics: QualityDiagnostic[] = [];
    for (const descriptor of nkaSourcePathPolicy.listSources(document)) {
      const identityDiagnostic = detectRuntimeOrCacheSourceHandle(descriptor);
      if (identityDiagnostic) {
        diagnostics.push(projectFileDiagnostic(identityDiagnostic));
        continue;
      }
      if (descriptor.allowRemote && /^https?:\/\//i.test(descriptor.path)) continue;
      const sourcePath = this.resolveSourcePath(descriptor, projectFilePath);
      if (!sourcePath) {
        diagnostics.push(
          diagnostic(
            'invalid-quality-target',
            `Audio source ${descriptor.id} cannot be resolved from its durable project path.`,
            'error',
            descriptor.fieldPath,
          ),
        );
        continue;
      }
      try {
        await this.options.fileOps.readFile(sourcePath);
      } catch {
        diagnostics.push(
          diagnostic(
            'invalid-quality-target',
            `Audio source ${descriptor.id} is missing: ${descriptor.path}`,
            'error',
            descriptor.fieldPath,
          ),
        );
      }
    }
    return diagnostics;
  }

  private resolveSourcePath(
    descriptor: ProjectSourceDescriptor,
    projectFilePath: string,
  ): string | undefined {
    if (this.options.resolveSourcePath) {
      return this.options.resolveSourcePath(descriptor.path, projectFilePath);
    }
    if (!descriptor.path.trim() || descriptor.path.includes('${')) return undefined;
    if (/^[a-z][a-z0-9+.-]*:/i.test(descriptor.path) || isAbsolute(descriptor.path)) {
      return undefined;
    }
    return resolve(dirname(projectFilePath), descriptor.path);
  }
}

export function createNkaProjectRef(
  documentUri: string,
  document: AudioProjectData,
): QualityProjectRef {
  const loaded = loadNka(JSON.stringify(document));
  if (!loaded.validation.valid || loaded.compatibility.mode === 'future') {
    throw new Error('Cannot create an NKA project reference from an invalid or future schema.');
  }
  const contentDigest = hashStableValue(loaded.data);
  return {
    domain: 'audio',
    documentUri,
    projectRevision: `nka:${contentDigest}`,
    contentDigest,
  };
}

function validateAudioProjectRequest(request: ProjectQualityRequest): readonly QualityDiagnostic[] {
  const diagnostics: QualityDiagnostic[] = [];
  if (request.version !== PROJECT_QUALITY_CONTRACT_VERSION || !request.requestId.trim()) {
    diagnostics.push(
      diagnostic(
        'invalid-quality-target',
        'Audio ProjectQuality requests require the current contract version and a request id.',
      ),
    );
  }
  diagnostics.push(...validateQualityTarget(request.target).diagnostics);
  if (request.project.domain !== 'audio' || request.target.projectRef?.domain !== 'audio') {
    diagnostics.push(
      diagnostic(
        'invalid-quality-target',
        'The Audio ProjectQuality facade only accepts audio project targets.',
        'error',
        ['project', 'domain'],
      ),
    );
  }
  if (
    request.target.projectRef?.documentUri !== request.project.documentUri ||
    request.target.projectRef?.projectRevision !== request.project.projectRevision
  ) {
    diagnostics.push(
      diagnostic(
        'invalid-quality-target',
        'QualityTarget.projectRef must match the ProjectQuality request project.',
        'error',
        ['target', 'projectRef'],
      ),
    );
  }
  const documentPath = tryDocumentUriToFilePath(request.project.documentUri);
  if (!documentPath || extname(documentPath).toLowerCase() !== '.nka') {
    diagnostics.push(
      diagnostic(
        'invalid-quality-target',
        'The Audio ProjectQuality facade requires a valid .nka file URI or local path.',
        'error',
        ['project', 'documentUri'],
      ),
    );
  }
  return diagnostics;
}

function validateAudioStructure(document: AudioProjectData): readonly QualityDiagnostic[] {
  const diagnostics: QualityDiagnostic[] = [];
  const trackIds = new Set<string>();
  const elementIds = new Set<string>();

  document.tracks.forEach((track, trackIndex) => {
    const trackPath = ['tracks', trackIndex] as const;
    if (!track.id.trim() || trackIds.has(track.id)) {
      diagnostics.push(
        diagnostic(
          'invalid-quality-target',
          `Audio track ids must be non-empty and unique: ${track.id || '<empty>'}.`,
          'error',
          [...trackPath, 'id'],
        ),
      );
    }
    trackIds.add(track.id);
    if (track.type !== 'audio') {
      diagnostics.push(
        diagnostic(
          'invalid-quality-target',
          `Audio project track ${track.id || '<empty>'} must use the audio track type.`,
          'error',
          [...trackPath, 'type'],
        ),
      );
    }

    track.elements.forEach((element, elementIndex) => {
      const path = [...trackPath, 'elements', elementIndex];
      if (!element.id.trim() || elementIds.has(element.id)) {
        diagnostics.push(
          diagnostic(
            'invalid-quality-target',
            `Audio element ids must be non-empty and unique across the project: ${element.id || '<empty>'}.`,
            'error',
            [...path, 'id'],
          ),
        );
      }
      elementIds.add(element.id);
      if (element.type !== 'audio') {
        diagnostics.push(
          diagnostic(
            'invalid-quality-target',
            `Audio project element ${element.id || '<empty>'} must use the audio element type.`,
            'error',
            [...path, 'type'],
          ),
        );
      }
      if (
        !Number.isFinite(element.startTime) ||
        element.startTime < 0 ||
        !Number.isFinite(element.duration) ||
        element.duration <= 0 ||
        !Number.isFinite(element.trimStart) ||
        element.trimStart < 0 ||
        !Number.isFinite(element.trimEnd) ||
        element.trimEnd < 0 ||
        element.trimStart + element.trimEnd >= element.duration
      ) {
        diagnostics.push(
          diagnostic(
            'invalid-quality-target',
            `Audio element ${element.id || '<empty>'} has an invalid timeline range or trims.`,
            'error',
            path,
          ),
        );
      }
    });
  });

  for (const trackId of Object.keys(document.trackMix ?? {})) {
    if (!trackIds.has(trackId)) {
      diagnostics.push(
        diagnostic(
          'invalid-quality-target',
          `Audio trackMix references unknown track ${trackId}.`,
          'error',
          ['trackMix', trackId],
        ),
      );
    }
  }
  return diagnostics;
}

function validateExportRouting(document: AudioProjectData): readonly QualityDiagnostic[] {
  const diagnostics: QualityDiagnostic[] = [];
  if (document.masterVolume === 0) {
    diagnostics.push(
      diagnostic(
        'invalid-quality-target',
        'Audio final mix is silent because masterVolume is zero.',
        'error',
        ['masterVolume'],
      ),
    );
  }

  const hasSolo = document.tracks.some((track) => document.trackMix?.[track.id]?.solo === true);
  const audibleTrack = document.tracks.some((track) => {
    const mix = document.trackMix?.[track.id];
    if (track.muted || mix?.volume === 0) return false;
    if (hasSolo && mix?.solo !== true) return false;
    return track.elements.some((element) => element.type === 'audio' && !element.muted);
  });
  if (!audibleTrack) {
    diagnostics.push(
      diagnostic(
        'invalid-quality-target',
        'Audio export requires at least one routed, unmuted audio element with non-zero track gain.',
        'error',
        ['tracks'],
      ),
    );
  }
  return diagnostics;
}

function validateTargetRange(
  target: QualityTarget,
  document: AudioProjectData,
): readonly QualityDiagnostic[] {
  if (!target.mediaRange) return [];
  const duration = getProjectDuration(document);
  if (target.mediaRange.endSeconds <= duration) return [];
  return [
    diagnostic(
      'invalid-quality-target',
      `Requested review range ends at ${target.mediaRange.endSeconds}s, beyond the ${duration}s timeline.`,
      'error',
      ['target', 'mediaRange'],
    ),
  ];
}

function getProjectDuration(document: AudioProjectData): number {
  return document.tracks.reduce(
    (projectEnd, track) =>
      track.elements.reduce(
        (trackEnd, element) =>
          Math.max(
            trackEnd,
            element.startTime + element.duration - element.trimStart - element.trimEnd,
          ),
        projectEnd,
      ),
    0,
  );
}

function createNkaSnapshotRef(project: QualityProjectRef, contentDigest: string): ResourceRef {
  return createResourceRef({
    scope: 'project',
    provider: 'neko-audio',
    kind: 'document',
    source: {
      kind: 'document',
      uri: project.documentUri,
      identity: { hash: contentDigest },
      metadata: { domain: 'audio', projectRevision: project.projectRevision },
    },
    locator: { kind: 'file', uri: project.documentUri },
    fingerprint: { strategy: 'hash', value: contentDigest },
  });
}

function mapNkaDiagnostic(input: {
  readonly field: string;
  readonly message: string;
  readonly severity: 'error' | 'warning';
}): QualityDiagnostic {
  return diagnostic(
    'invalid-quality-target',
    `NKA ${input.message}`,
    input.severity,
    input.field ? input.field.split('.').filter(Boolean) : undefined,
  );
}

function projectFileDiagnostic(input: {
  readonly severity: 'info' | 'warning' | 'error';
  readonly message: string;
  readonly path?: readonly (string | number)[];
}): QualityDiagnostic {
  return diagnostic('invalid-quality-target', input.message, input.severity, input.path);
}

function successResult<TData>(
  request: ProjectQualityRequest,
  operation: ProjectQualityResult<TData>['operation'],
  data: TData,
  diagnostics: readonly QualityDiagnostic[] = [],
): ProjectQualityResult<TData> {
  return {
    version: PROJECT_QUALITY_CONTRACT_VERSION,
    requestId: request.requestId,
    operation,
    ok: true,
    data,
    diagnostics,
  };
}

function failedResult(
  request: ProjectQualityRequest,
  operation: ProjectQualityResult<never>['operation'],
  ...diagnostics: readonly QualityDiagnostic[]
): ProjectQualityResult<never> {
  return {
    version: PROJECT_QUALITY_CONTRACT_VERSION,
    requestId: request.requestId,
    operation,
    ok: false,
    diagnostics:
      diagnostics.length > 0
        ? diagnostics
        : [diagnostic('quality-evaluator-failed', 'Audio project quality operation failed.')],
  };
}

function diagnostic(
  code: QualityDiagnostic['code'],
  message: string,
  severity: QualityDiagnostic['severity'] = 'error',
  path?: readonly (string | number)[],
): QualityDiagnostic {
  return { code, severity, message, ...(path ? { path } : {}) };
}

function tryDocumentUriToFilePath(documentUri: string): string | undefined {
  if (!documentUri.trim()) return undefined;
  try {
    return documentUri.startsWith('file://') ? fileURLToPath(documentUri) : documentUri;
  } catch {
    return undefined;
  }
}

function hasErrors(diagnostics: readonly QualityDiagnostic[]): boolean {
  return diagnostics.some((item) => item.severity === 'error');
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
