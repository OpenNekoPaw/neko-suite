import { dirname, extname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  NkmProjectData,
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
  NKM_VERSION,
  PROJECT_QUALITY_CONTRACT_VERSION,
  createResourceRef,
  detectRuntimeOrCacheSourceHandle,
  hashStableValue,
  nkmProjectFormatCodec,
  nkmSourcePathPolicy,
  validateProjectQualityPreview,
  validateQualityTarget,
} from '@neko/shared';

export interface ModelProjectPreviewRenderer {
  renderPreview(input: {
    readonly project: QualityProjectRef;
    readonly document: NkmProjectData;
    readonly revision: string;
  }): Promise<{ readonly previewRef: ResourceRef; readonly sessionRenderUri?: string }>;
}

export interface ModelProjectRuntimeProbe {
  probe(input: {
    readonly project: QualityProjectRef;
    readonly document: NkmProjectData;
  }): Promise<{
    readonly available: boolean;
    readonly profileId?: string;
    readonly diagnostics?: readonly QualityDiagnostic[];
  }>;
}

export interface ModelProjectExportReadinessProbe {
  check(input: {
    readonly project: QualityProjectRef;
    readonly document: NkmProjectData;
    readonly target: QualityTarget;
  }): Promise<{
    readonly ready: boolean;
    readonly requiredEvidenceIds?: readonly string[];
    readonly diagnostics?: readonly QualityDiagnostic[];
  }>;
}

export interface ModelProjectQualityFacadeOptions {
  readonly fileOps: ProjectFileOps;
  readonly previewRenderer?: ModelProjectPreviewRenderer;
  readonly runtimeProbe?: ModelProjectRuntimeProbe;
  readonly exportReadinessProbe?: ModelProjectExportReadinessProbe;
  readonly resolveSourcePath?: (sourcePath: string, projectFilePath: string) => string | undefined;
  readonly now?: () => Date;
}

interface LoadedModelProject {
  readonly document: NkmProjectData;
  readonly project: QualityProjectRef;
  readonly revision: string;
  readonly contentDigest: string;
  readonly snapshotRef: ResourceRef;
  readonly diagnostics: readonly QualityDiagnostic[];
}

export class ModelProjectQualityFacade implements ProjectQualityFacade {
  private readonly now: () => Date;

  constructor(private readonly options: ModelProjectQualityFacadeOptions) {
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
    if (!this.options.previewRenderer) {
      return failedResult(
        request,
        'render-preview',
        diagnostic(
          'quality-evaluator-failed',
          'Model render preview is unavailable because no owning headless renderer is registered.',
        ),
      );
    }
    const rendered = await this.options.previewRenderer.renderPreview({
      project: loaded.value.project,
      document: loaded.value.document,
      revision: loaded.value.revision,
    });
    const preview: ProjectQualityPreview = {
      project: loaded.value.project,
      previewRef: rendered.previewRef,
      ...(rendered.sessionRenderUri ? { sessionRenderUri: rendered.sessionRenderUri } : {}),
      createdAt: this.now().toISOString(),
    };
    const validation = validateProjectQualityPreview(preview);
    if (!validation.ok) return failedResult(request, 'render-preview', ...validation.diagnostics);
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
          'Model runtime is unavailable because no owning profile/runtime adapter probe is registered.',
          'warning',
        ),
      ];
      return successResult(
        request,
        'probe-runtime',
        {
          project: loaded.value.project,
          available: false,
          profileId: loaded.value.document.profile ?? '3d',
          diagnostics,
        },
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
    const diagnostics = [...loaded.value.diagnostics];
    const profile = loaded.value.document.profile ?? '3d';
    if (profile === '3d' && !loaded.value.document.model.src) {
      diagnostics.push(
        diagnostic(
          'invalid-quality-target',
          '3D Model export requires a persisted model source.',
          'error',
          ['model', 'src'],
        ),
      );
    }
    if (!this.options.exportReadinessProbe) {
      diagnostics.push(
        diagnostic(
          'quality-evaluator-failed',
          'Model export readiness is unavailable because no owning profile export adapter is registered.',
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
    | { readonly ok: true; readonly value: LoadedModelProject }
    | { readonly ok: false; readonly result: ProjectQualityResult<never> }
  > {
    const requestDiagnostics = validateModelProjectRequest(request);
    if (requestDiagnostics.length > 0)
      return { ok: false, result: failedResult(request, operation, ...requestDiagnostics) };
    const projectFilePath = tryDocumentUriToFilePath(request.project.documentUri);
    if (!projectFilePath) {
      return {
        ok: false,
        result: failedResult(
          request,
          operation,
          diagnostic(
            'invalid-quality-target',
            'Model project documentUri must be a valid file URI or local path.',
            'error',
            ['project', 'documentUri'],
          ),
        ),
      };
    }
    let bytes: Uint8Array;
    try {
      bytes = await this.options.fileOps.readFile(projectFilePath);
    } catch (error) {
      return {
        ok: false,
        result: failedResult(
          request,
          operation,
          diagnostic(
            'quality-evaluator-failed',
            `Failed to read Model project: ${formatError(error)}`,
          ),
        ),
      };
    }
    const decoded = nkmProjectFormatCodec.load(new TextDecoder().decode(bytes), {
      filePath: projectFilePath,
      formatId: 'nkm',
    });
    const codecDiagnostics = decoded.diagnostics.map(projectFileDiagnostic);
    const structureDiagnostics = validateModelStructure(decoded.document);
    const resourceDiagnostics = await this.validateResources(decoded.document, projectFilePath);
    const diagnostics = [...codecDiagnostics, ...structureDiagnostics, ...resourceDiagnostics];
    if (hasErrors(diagnostics))
      return { ok: false, result: failedResult(request, operation, ...diagnostics) };
    const contentDigest = hashStableValue(decoded.document);
    const revision = `nkm:${contentDigest}`;
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
            'The requested Model project revision does not match the current .nkm content.',
            'error',
            ['project', 'projectRevision'],
          ),
        ),
      };
    }
    const project: QualityProjectRef = {
      domain: 'model',
      documentUri: request.project.documentUri,
      projectRevision: revision,
      contentDigest,
    };
    return {
      ok: true,
      value: {
        document: decoded.document,
        project,
        revision,
        contentDigest,
        diagnostics,
        snapshotRef: createSnapshotRef(project, contentDigest),
      },
    };
  }

  private async validateResources(
    document: NkmProjectData,
    projectFilePath: string,
  ): Promise<readonly QualityDiagnostic[]> {
    const diagnostics: QualityDiagnostic[] = [];
    for (const descriptor of nkmSourcePathPolicy.listSources(document)) {
      const identityDiagnostic = detectRuntimeOrCacheSourceHandle(descriptor);
      if (identityDiagnostic) {
        diagnostics.push(projectFileDiagnostic(identityDiagnostic));
        continue;
      }
      const sourcePath = this.resolveSourcePath(descriptor, projectFilePath);
      if (!sourcePath) {
        diagnostics.push(
          diagnostic(
            'invalid-quality-target',
            `Model source ${descriptor.id} cannot be resolved from its durable project path.`,
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
            `Model source ${descriptor.id} is missing: ${descriptor.path}`,
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
    if (this.options.resolveSourcePath)
      return this.options.resolveSourcePath(descriptor.path, projectFilePath);
    if (!descriptor.path.trim() || descriptor.path.includes('${')) return undefined;
    if (/^[a-z][a-z0-9+.-]*:/i.test(descriptor.path)) return undefined;
    return isAbsolute(descriptor.path)
      ? undefined
      : resolve(dirname(projectFilePath), descriptor.path);
  }
}

export function createNkmProjectRef(
  documentUri: string,
  document: NkmProjectData,
): QualityProjectRef {
  const contentDigest = hashStableValue(document);
  return { domain: 'model', documentUri, projectRevision: `nkm:${contentDigest}`, contentDigest };
}

function validateModelProjectRequest(request: ProjectQualityRequest): readonly QualityDiagnostic[] {
  const diagnostics: QualityDiagnostic[] = [];
  if (request.version !== PROJECT_QUALITY_CONTRACT_VERSION || !request.requestId.trim()) {
    diagnostics.push(
      diagnostic(
        'invalid-quality-target',
        'Model ProjectQuality requests require the current contract version and a request id.',
      ),
    );
  }
  diagnostics.push(...validateQualityTarget(request.target).diagnostics);
  if (request.project.domain !== 'model' || request.target.projectRef?.domain !== 'model') {
    diagnostics.push(
      diagnostic(
        'invalid-quality-target',
        'The Model ProjectQuality facade only accepts model project targets.',
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
  if (!documentPath || extname(documentPath).toLowerCase() !== '.nkm') {
    diagnostics.push(
      diagnostic(
        'invalid-quality-target',
        'The Model ProjectQuality facade requires a valid .nkm file URI or local path.',
        'error',
        ['project', 'documentUri'],
      ),
    );
  }
  return diagnostics;
}

function validateModelStructure(document: NkmProjectData): readonly QualityDiagnostic[] {
  const diagnostics: QualityDiagnostic[] = [];
  const profile = document.profile ?? '3d';
  if (document.version !== NKM_VERSION) {
    diagnostics.push(
      diagnostic(
        'invalid-quality-target',
        `Unsupported .nkm schema version ${document.version}; expected ${NKM_VERSION}.`,
        'error',
        ['version'],
      ),
    );
  }
  if (
    !document.name.trim() ||
    !Number.isFinite(document.viewport.zoom) ||
    document.viewport.zoom <= 0
  ) {
    diagnostics.push(
      diagnostic(
        'invalid-quality-target',
        'Model project name and viewport zoom must be valid.',
        'error',
        ['viewport'],
      ),
    );
  }
  if (
    (profile === '2d' && document.live) ||
    (profile === 'live' && document.scene2d) ||
    (profile === '3d' && (document.scene2d || document.live))
  ) {
    diagnostics.push(
      diagnostic(
        'invalid-quality-target',
        `Model profile ${profile} contains state owned by another scene profile.`,
        'error',
        ['profile'],
      ),
    );
  }
  if (profile === '2d' && !document.scene2d) {
    diagnostics.push(
      diagnostic(
        'invalid-quality-target',
        '2D Model profile requires persisted scene2d state.',
        'error',
        ['scene2d'],
      ),
    );
  }
  if (profile === 'live' && !document.live) {
    diagnostics.push(
      diagnostic(
        'invalid-quality-target',
        'Live Model profile requires persisted live stage state.',
        'error',
        ['live'],
      ),
    );
  }

  const sceneNodes = [
    ...(document.scene2d?.sprites ?? []),
    ...(document.scene2d?.tilemaps ?? []),
    ...(document.scene2d?.lights ?? []),
    ...(document.scene2d?.parallaxLayers ?? []),
    ...(document.scene2d?.particles ?? []),
  ];
  uniqueIds(
    sceneNodes.map((node) => node.id),
    diagnostics,
    ['scene2d'],
    '2D scene node',
  );
  document.scene2d?.tilemaps?.forEach((tilemap, index) => {
    if (
      [tilemap.width, tilemap.height, tilemap.tileWidth, tilemap.tileHeight].some(
        (value) => !Number.isFinite(value) || value <= 0,
      )
    ) {
      diagnostics.push(
        diagnostic(
          'invalid-quality-target',
          `2D tilemap ${tilemap.id} has invalid dimensions.`,
          'error',
          ['scene2d', 'tilemaps', index],
        ),
      );
    }
  });
  if (
    document.scene2d?.camera &&
    (!Number.isFinite(document.scene2d.camera.zoom) || document.scene2d.camera.zoom <= 0)
  ) {
    diagnostics.push(
      diagnostic('invalid-quality-target', '2D scene camera zoom must be positive.', 'error', [
        'scene2d',
        'camera',
        'zoom',
      ]),
    );
  }

  const actorIds = uniqueIds(
    (document.live?.actors ?? []).map((actor) => actor.id),
    diagnostics,
    ['live', 'actors'],
    'Live actor',
  );
  uniqueIds(
    (document.live?.routes ?? []).map((route) => route.id),
    diagnostics,
    ['live', 'routes'],
    'Live route',
  );
  document.live?.routes?.forEach((route, index) => {
    if (
      !actorIds.has(route.source) ||
      !actorIds.has(route.target) ||
      route.source === route.target
    ) {
      diagnostics.push(
        diagnostic(
          'invalid-quality-target',
          `Live route ${route.id} has an invalid actor mapping.`,
          'error',
          ['live', 'routes', index],
        ),
      );
    }
  });

  uniqueIds(
    document.customClips.map((clip) => clip.name),
    diagnostics,
    ['customClips'],
    'Animation clip',
  );
  document.customClips.forEach((clip, clipIndex) => {
    if (!Number.isFinite(clip.duration) || clip.duration <= 0) {
      diagnostics.push(
        diagnostic(
          'invalid-quality-target',
          `Animation clip ${clip.name} has invalid duration.`,
          'error',
          ['customClips', clipIndex, 'duration'],
        ),
      );
    }
    clip.channels.forEach((channel, channelIndex) => {
      if (!channel.targetNode.trim())
        diagnostics.push(
          diagnostic(
            'invalid-quality-target',
            `Animation clip ${clip.name} has an empty target node.`,
            'error',
            ['customClips', clipIndex, 'channels', channelIndex, 'targetNode'],
          ),
        );
      const keyIds = new Set<string>();
      let previous = -Infinity;
      channel.keyframes.forEach((keyframe, keyIndex) => {
        const expectedValues =
          channel.property === 'rotation'
            ? 4
            : channel.property === 'morph_weights'
              ? undefined
              : 3;
        if (
          !keyframe.id.trim() ||
          keyIds.has(keyframe.id) ||
          !Number.isFinite(keyframe.timestamp) ||
          keyframe.timestamp < 0 ||
          keyframe.timestamp > clip.duration ||
          keyframe.timestamp < previous ||
          keyframe.values.length === 0 ||
          (expectedValues !== undefined && keyframe.values.length !== expectedValues) ||
          keyframe.values.some((value) => !Number.isFinite(value))
        ) {
          diagnostics.push(
            diagnostic(
              'invalid-quality-target',
              `Animation clip ${clip.name} has an invalid keyframe sequence.`,
              'error',
              ['customClips', clipIndex, 'channels', channelIndex, 'keyframes', keyIndex],
            ),
          );
        }
        keyIds.add(keyframe.id);
        previous = keyframe.timestamp;
      });
    });
  });

  if (document.camera) {
    const values = [
      ...document.camera.position,
      ...document.camera.target,
      ...document.camera.up,
      document.camera.fov,
    ];
    if (
      values.some((value) => !Number.isFinite(value)) ||
      document.camera.fov <= 0 ||
      document.camera.fov >= 180
    ) {
      diagnostics.push(
        diagnostic(
          'invalid-quality-target',
          'Model camera has invalid transform or field of view.',
          'error',
          ['camera'],
        ),
      );
    }
  }
  return diagnostics;
}

function uniqueIds(
  ids: readonly string[],
  diagnostics: QualityDiagnostic[],
  path: readonly (string | number)[],
  label: string,
): Set<string> {
  const result = new Set<string>();
  ids.forEach((id, index) => {
    if (!id.trim() || result.has(id))
      diagnostics.push(
        diagnostic(
          'invalid-quality-target',
          `${label} ids must be non-empty and unique: ${id || '<empty>'}.`,
          'error',
          [...path, index, 'id'],
        ),
      );
    result.add(id);
  });
  return result;
}

function createSnapshotRef(project: QualityProjectRef, contentDigest: string): ResourceRef {
  return createResourceRef({
    scope: 'project',
    provider: 'neko-model',
    kind: 'document',
    source: {
      kind: 'document',
      uri: project.documentUri,
      identity: { hash: contentDigest },
      metadata: { domain: 'model', projectRevision: project.projectRevision },
    },
    locator: { kind: 'file', uri: project.documentUri },
    fingerprint: { strategy: 'hash', value: contentDigest },
  });
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
  operation: ProjectQualityOperation,
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
  operation: ProjectQualityOperation,
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
        : [diagnostic('quality-evaluator-failed', 'Model project quality operation failed.')],
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

function hasErrors(diagnostics: readonly QualityDiagnostic[]): boolean {
  return diagnostics.some((item) => item.severity === 'error');
}

function tryDocumentUriToFilePath(value: string): string | undefined {
  try {
    if (value.startsWith('file:')) return fileURLToPath(value);
    if (isAbsolute(value)) return value;
  } catch {
    return undefined;
  }
  return undefined;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
