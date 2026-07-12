import { dirname, extname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  NkpProjectData,
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
  isNkpNativeProjectData,
  nkpProjectFormatCodec,
  nkpSourcePathPolicy,
  validateProjectQualityPreview,
  validateQualityTarget,
} from '@neko/shared';

const CURRENT_NKP_VERSION = '2.0';

export interface PuppetProjectPreviewRenderer {
  renderPreview(input: {
    readonly project: QualityProjectRef;
    readonly document: NkpProjectData;
    readonly revision: string;
  }): Promise<{ readonly previewRef: ResourceRef; readonly sessionRenderUri?: string }>;
}

export interface PuppetProjectRuntimeProbe {
  probe(input: {
    readonly project: QualityProjectRef;
    readonly document: NkpProjectData;
  }): Promise<{
    readonly available: boolean;
    readonly profileId?: string;
    readonly diagnostics?: readonly QualityDiagnostic[];
  }>;
}

export interface PuppetProjectExportReadinessProbe {
  check(input: {
    readonly project: QualityProjectRef;
    readonly document: NkpProjectData;
    readonly target: QualityTarget;
  }): Promise<{
    readonly ready: boolean;
    readonly requiredEvidenceIds?: readonly string[];
    readonly diagnostics?: readonly QualityDiagnostic[];
  }>;
}

export interface PuppetProjectQualityFacadeOptions {
  readonly fileOps: ProjectFileOps;
  readonly previewRenderer?: PuppetProjectPreviewRenderer;
  readonly runtimeProbe?: PuppetProjectRuntimeProbe;
  readonly exportReadinessProbe?: PuppetProjectExportReadinessProbe;
  readonly resolveSourcePath?: (sourcePath: string, projectFilePath: string) => string | undefined;
  readonly now?: () => Date;
}

interface LoadedPuppetProject {
  readonly document: NkpProjectData;
  readonly project: QualityProjectRef;
  readonly revision: string;
  readonly contentDigest: string;
  readonly snapshotRef: ResourceRef;
  readonly diagnostics: readonly QualityDiagnostic[];
}

export class PuppetProjectQualityFacade implements ProjectQualityFacade {
  private readonly now: () => Date;

  constructor(private readonly options: PuppetProjectQualityFacadeOptions) {
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
          'Puppet preview rendering is unavailable because no owning headless preview adapter is registered.',
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
          'Puppet runtime is unavailable because no owning runtime adapter probe is registered.',
          'warning',
        ),
      ];
      return successResult(
        request,
        'probe-runtime',
        {
          project: loaded.value.project,
          available: false,
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
    if (!this.options.exportReadinessProbe) {
      diagnostics.push(
        diagnostic(
          'quality-evaluator-failed',
          'Puppet export readiness is unavailable because no owning export adapter is registered.',
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
    | { readonly ok: true; readonly value: LoadedPuppetProject }
    | { readonly ok: false; readonly result: ProjectQualityResult<never> }
  > {
    const requestDiagnostics = validatePuppetProjectRequest(request);
    if (requestDiagnostics.length > 0) {
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
            'Puppet project documentUri must be a valid file URI or local path.',
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
            `Failed to read Puppet project: ${formatError(error)}`,
          ),
        ),
      };
    }
    const decoded = nkpProjectFormatCodec.load(new TextDecoder().decode(bytes), {
      filePath: projectFilePath,
      formatId: 'nkp',
    });
    const codecDiagnostics = decoded.diagnostics.map(projectFileDiagnostic);
    const versionDiagnostics =
      decoded.document.version === CURRENT_NKP_VERSION
        ? []
        : [
            diagnostic(
              'invalid-quality-target',
              `Unsupported .nkp schema version ${decoded.document.version}; expected ${CURRENT_NKP_VERSION}.`,
              'error',
              ['version'],
            ),
          ];
    const structureDiagnostics = validatePuppetStructure(decoded.document);
    const resourceDiagnostics = await this.validateResources(decoded.document, projectFilePath);
    const diagnostics = [
      ...codecDiagnostics,
      ...versionDiagnostics,
      ...structureDiagnostics,
      ...resourceDiagnostics,
    ];
    if (hasErrors(diagnostics)) {
      return { ok: false, result: failedResult(request, operation, ...diagnostics) };
    }
    const contentDigest = hashStableValue(decoded.document);
    const revision = `nkp:${contentDigest}`;
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
            'The requested Puppet project revision does not match the current .nkp content.',
            'error',
            ['project', 'projectRevision'],
          ),
        ),
      };
    }
    const project: QualityProjectRef = {
      domain: 'puppet',
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
    document: NkpProjectData,
    projectFilePath: string,
  ): Promise<readonly QualityDiagnostic[]> {
    const diagnostics: QualityDiagnostic[] = [];
    for (const descriptor of nkpSourcePathPolicy.listSources(document)) {
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
            `Puppet source ${descriptor.id} cannot be resolved from its durable project path.`,
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
            `Puppet source ${descriptor.id} is missing: ${descriptor.path}`,
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

export function createNkpProjectRef(
  documentUri: string,
  document: NkpProjectData,
): QualityProjectRef {
  const contentDigest = hashStableValue(document);
  return {
    domain: 'puppet',
    documentUri,
    projectRevision: `nkp:${contentDigest}`,
    contentDigest,
  };
}

function validatePuppetProjectRequest(
  request: ProjectQualityRequest,
): readonly QualityDiagnostic[] {
  const diagnostics: QualityDiagnostic[] = [];
  if (request.version !== PROJECT_QUALITY_CONTRACT_VERSION || !request.requestId.trim()) {
    diagnostics.push(
      diagnostic(
        'invalid-quality-target',
        'Puppet ProjectQuality requests require the current contract version and a request id.',
      ),
    );
  }
  diagnostics.push(...validateQualityTarget(request.target).diagnostics);
  if (request.project.domain !== 'puppet' || request.target.projectRef?.domain !== 'puppet') {
    diagnostics.push(
      diagnostic(
        'invalid-quality-target',
        'The Puppet ProjectQuality facade only accepts puppet project targets.',
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
  if (!documentPath || extname(documentPath).toLowerCase() !== '.nkp') {
    diagnostics.push(
      diagnostic(
        'invalid-quality-target',
        'The Puppet ProjectQuality facade requires a valid .nkp file URI or local path.',
        'error',
        ['project', 'documentUri'],
      ),
    );
  }
  return diagnostics;
}

function validatePuppetStructure(document: NkpProjectData): readonly QualityDiagnostic[] {
  const diagnostics: QualityDiagnostic[] = [];
  if (
    !document.name.trim() ||
    !Number.isFinite(document.viewport.zoom) ||
    document.viewport.zoom <= 0
  ) {
    diagnostics.push(
      diagnostic(
        'invalid-quality-target',
        'Puppet project name and viewport zoom must be valid.',
        'error',
        ['viewport'],
      ),
    );
  }
  const layers = document.layers ?? [];
  const layerIds = uniqueIds(
    layers.map((layer) => layer.id),
    diagnostics,
    ['layers'],
    'Puppet layer',
  );
  const meshIds = uniqueIds(
    layers.map((layer) => layer.mesh.id),
    diagnostics,
    ['layers'],
    'Puppet mesh',
  );
  layers.forEach((layer, index) => {
    const path = ['layers', index] as const;
    if (!layer.textureRef.trim() || layer.mesh.vertices.length === 0) {
      diagnostics.push(
        diagnostic(
          'invalid-quality-target',
          `Puppet layer ${layer.id} requires a texture and mesh vertices.`,
          'error',
          path,
        ),
      );
    }
    layer.mesh.triangles?.forEach((triangle, triangleIndex) => {
      if (
        triangle.some((vertexIndex) => vertexIndex < 0 || vertexIndex >= layer.mesh.vertices.length)
      ) {
        diagnostics.push(
          diagnostic(
            'invalid-quality-target',
            `Puppet layer ${layer.id} has an out-of-range triangle index.`,
            'error',
            [...path, 'mesh', 'triangles', triangleIndex],
          ),
        );
      }
    });
    if (
      layer.skinWeights &&
      (layer.skinWeights.meshId !== layer.mesh.id ||
        layer.skinWeights.jointIndices.length !== layer.mesh.vertices.length ||
        layer.skinWeights.jointWeights.length !== layer.mesh.vertices.length)
    ) {
      diagnostics.push(
        diagnostic(
          'invalid-quality-target',
          `Puppet layer ${layer.id} has inconsistent skin weights.`,
          'error',
          [...path, 'skinWeights'],
        ),
      );
    }
  });

  const bones = document.skeleton?.bones ?? [];
  const boneIds = uniqueIds(
    bones.map((bone) => bone.id),
    diagnostics,
    ['skeleton', 'bones'],
    'Puppet bone',
  );
  bones.forEach((bone, index) => {
    if (bone.parent && (!boneIds.has(bone.parent) || bone.parent === bone.id)) {
      diagnostics.push(
        diagnostic(
          'invalid-quality-target',
          `Puppet bone ${bone.id} has an invalid parent.`,
          'error',
          ['skeleton', 'bones', index, 'parent'],
        ),
      );
    }
  });
  for (const bone of bones) {
    const visited = new Set<string>([bone.id]);
    let parent = bone.parent ?? null;
    while (parent) {
      if (visited.has(parent)) {
        diagnostics.push(
          diagnostic(
            'invalid-quality-target',
            `Puppet skeleton contains a parent cycle at ${bone.id}.`,
            'error',
            ['skeleton', 'bones'],
          ),
        );
        break;
      }
      visited.add(parent);
      parent = bones.find((candidate) => candidate.id === parent)?.parent ?? null;
    }
  }
  document.skeleton?.ikConstraints?.forEach((constraint, index) => {
    if (!boneIds.has(constraint.targetBone) || !boneIds.has(constraint.endBone)) {
      diagnostics.push(
        diagnostic(
          'invalid-quality-target',
          `Puppet IK constraint ${constraint.id} references a missing bone.`,
          'error',
          ['skeleton', 'ikConstraints', index],
        ),
      );
    }
  });
  document.skeleton?.pathConstraints?.forEach((constraint, index) => {
    if (!boneIds.has(constraint.bone))
      diagnostics.push(
        diagnostic(
          'invalid-quality-target',
          `Puppet path constraint ${constraint.id} references a missing bone.`,
          'error',
          ['skeleton', 'pathConstraints', index],
        ),
      );
  });
  document.skeleton?.springBones?.forEach((spring, index) => {
    if (!boneIds.has(spring.bone))
      diagnostics.push(
        diagnostic(
          'invalid-quality-target',
          `Puppet spring ${spring.id} references a missing bone.`,
          'error',
          ['skeleton', 'springBones', index],
        ),
      );
  });

  const shapes = [...(document.blendShapes?.shapes ?? []), ...(document.blendShapes?.custom ?? [])];
  const shapeNames = uniqueIds(
    shapes.map((shape) => shape.name),
    diagnostics,
    ['blendShapes'],
    'Puppet blendshape',
  );
  shapes.forEach((shape, index) => {
    const layer = layers.find((candidate) => candidate.mesh.id === shape.meshId);
    if (
      !meshIds.has(shape.meshId) ||
      (layer && shape.vertexDeltas.length !== layer.mesh.vertices.length)
    ) {
      diagnostics.push(
        diagnostic(
          'invalid-quality-target',
          `Puppet blendshape ${shape.name} does not match a persisted mesh.`,
          'error',
          ['blendShapes', 'shapes', index],
        ),
      );
    }
  });
  document.controlDrivers?.forEach((driver, index) => {
    const targetValid =
      driver.target.type === 'blendshapeWeight'
        ? shapeNames.has(driver.target.name)
        : boneIds.has(driver.target.bone);
    if (!targetValid)
      diagnostics.push(
        diagnostic(
          'invalid-quality-target',
          `Puppet control driver ${driver.id} references a missing target.`,
          'error',
          ['controlDrivers', index, 'target'],
        ),
      );
    if (driver.source.type === 'expression' && !document.expressions?.[driver.source.preset]) {
      diagnostics.push(
        diagnostic(
          'invalid-quality-target',
          `Puppet control driver ${driver.id} references a missing expression.`,
          'error',
          ['controlDrivers', index, 'source'],
        ),
      );
    }
  });
  document.animations?.forEach((clip, clipIndex) => {
    clip.boneTracks?.forEach((track, trackIndex) => {
      if (!boneIds.has(track.bone))
        diagnostics.push(
          diagnostic(
            'invalid-quality-target',
            `Puppet animation ${clip.name} references a missing bone.`,
            'error',
            ['animations', clipIndex, 'boneTracks', trackIndex],
          ),
        );
    });
    clip.blendshapeTracks?.forEach((track, trackIndex) => {
      if (!shapeNames.has(track.blendshape))
        diagnostics.push(
          diagnostic(
            'invalid-quality-target',
            `Puppet animation ${clip.name} references a missing blendshape.`,
            'error',
            ['animations', clipIndex, 'blendshapeTracks', trackIndex],
          ),
        );
    });
  });
  if (isNkpNativeProjectData(document) && !document.puppet.runtimeAdapter) {
    diagnostics.push(
      diagnostic(
        'quality-evaluator-failed',
        'Native Puppet projects require an explicit runtime adapter.',
        'error',
        ['puppet', 'runtimeAdapter'],
      ),
    );
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
    provider: 'neko-puppet',
    kind: 'document',
    source: {
      kind: 'document',
      uri: project.documentUri,
      identity: { hash: contentDigest },
      metadata: { domain: 'puppet', projectRevision: project.projectRevision },
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
        : [diagnostic('quality-evaluator-failed', 'Puppet project quality operation failed.')],
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
