import { dirname, extname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  NksDocument,
  NksLayerData,
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
  nksSourcePathPolicy,
  validateProjectQualityPreview,
  validateQualityTarget,
} from '@neko/shared';
import { CURRENT_NKS_VERSION, migrateNks } from '@neko/shared/nks';

export interface SketchProjectPreviewRenderer {
  renderPreview(input: {
    readonly project: QualityProjectRef;
    readonly document: NksDocument;
    readonly revision: string;
  }): Promise<{
    readonly previewRef: ResourceRef;
    readonly sessionRenderUri?: string;
  }>;
}

export interface SketchProjectRuntimeProbe {
  probe(input: { readonly project: QualityProjectRef; readonly document: NksDocument }): Promise<{
    readonly available: boolean;
    readonly profileId?: string;
    readonly diagnostics?: readonly QualityDiagnostic[];
  }>;
}

export interface SketchProjectExportReadinessProbe {
  check(input: {
    readonly project: QualityProjectRef;
    readonly document: NksDocument;
    readonly target: QualityTarget;
  }): Promise<{
    readonly ready: boolean;
    readonly requiredEvidenceIds?: readonly string[];
    readonly diagnostics?: readonly QualityDiagnostic[];
  }>;
}

export interface SketchProjectQualityFacadeOptions {
  readonly fileOps: ProjectFileOps;
  readonly previewRenderer?: SketchProjectPreviewRenderer;
  readonly runtimeProbe?: SketchProjectRuntimeProbe;
  readonly exportReadinessProbe?: SketchProjectExportReadinessProbe;
  readonly resolveSourcePath?: (sourcePath: string, projectFilePath: string) => string | undefined;
  readonly now?: () => Date;
}

interface LoadedSketchProject {
  readonly document: NksDocument;
  readonly project: QualityProjectRef;
  readonly revision: string;
  readonly contentDigest: string;
  readonly snapshotRef: ResourceRef;
  readonly diagnostics: readonly QualityDiagnostic[];
}

export class SketchProjectQualityFacade implements ProjectQualityFacade {
  private readonly now: () => Date;

  constructor(private readonly options: SketchProjectQualityFacadeOptions) {
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
          'Sketch preview rendering is unavailable because no owning preview adapter is registered.',
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
          'Sketch runtime is unavailable because no owning runtime probe is registered.',
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
    if (requiresFrameAnimation(request.target)) {
      diagnostics.push(
        diagnostic(
          'quality-evaluator-failed',
          'The current .nks schema does not persist frame-animation state; animated export cannot be declared ready.',
        ),
      );
    }
    if (!this.options.exportReadinessProbe) {
      diagnostics.push(
        diagnostic(
          'quality-evaluator-failed',
          'Sketch export readiness is unavailable because no owning export adapter is registered.',
        ),
      );
    } else {
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

    return successResult(request, 'check-export-readiness', {
      project: loaded.value.project,
      ready: false,
      requiredEvidenceIds: [],
      diagnostics,
    });
  }

  private async loadCurrentProject(
    request: ProjectQualityRequest,
    operation: ProjectQualityOperation,
  ): Promise<
    | { readonly ok: true; readonly value: LoadedSketchProject }
    | { readonly ok: false; readonly result: ProjectQualityResult<never> }
  > {
    const requestDiagnostics = validateSketchProjectRequest(request);
    if (requestDiagnostics.length > 0) {
      return {
        ok: false,
        result: failedResult(request, operation, ...requestDiagnostics),
      };
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
            'Sketch project documentUri must be a valid file URI or local path.',
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
            `Failed to read Sketch project: ${formatError(error)}`,
          ),
        ),
      };
    }

    const parsed = parseNksDocument(bytes);
    if (!parsed.ok) {
      return {
        ok: false,
        result: failedResult(request, operation, ...parsed.diagnostics),
      };
    }

    const migrated = migrateNks(parsed.value);
    const structureDiagnostics = validateNksStructure(migrated.data);
    const resourceDiagnostics = await this.validateResources(migrated.data, projectFilePath);
    const diagnostics = [
      ...migrated.warnings.map((message) =>
        diagnostic('quality-evaluator-failed', `Sketch migration warning: ${message}`, 'warning'),
      ),
      ...structureDiagnostics,
      ...resourceDiagnostics,
    ];
    if (hasErrors(diagnostics)) {
      return {
        ok: false,
        result: failedResult(request, operation, ...diagnostics),
      };
    }

    const contentDigest = hashStableValue(migrated.data);
    const revision = `nks:${contentDigest}`;
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
            'The requested Sketch project revision does not match the current .nks content.',
            'error',
            ['project', 'projectRevision'],
          ),
        ),
      };
    }

    const project: QualityProjectRef = {
      domain: 'sketch',
      documentUri: request.project.documentUri,
      projectRevision: revision,
      contentDigest,
    };
    return {
      ok: true,
      value: {
        document: migrated.data,
        project,
        revision,
        contentDigest,
        diagnostics,
        snapshotRef: createSketchSnapshotRef(project, contentDigest),
      },
    };
  }

  private async validateResources(
    document: NksDocument,
    projectFilePath: string,
  ): Promise<readonly QualityDiagnostic[]> {
    const diagnostics: QualityDiagnostic[] = [];
    for (const descriptor of nksSourcePathPolicy.listSources(document)) {
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
            `Sketch source ${descriptor.id} cannot be resolved from its durable project path.`,
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
            `Sketch source ${descriptor.id} is missing: ${descriptor.path}`,
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
    if (/^[a-z][a-z0-9+.-]*:/i.test(descriptor.path)) return undefined;
    return isAbsolute(descriptor.path)
      ? undefined
      : resolve(dirname(projectFilePath), descriptor.path);
  }
}

export function createNksProjectRef(documentUri: string, document: NksDocument): QualityProjectRef {
  const contentDigest = hashStableValue(migrateNks(document).data);
  return {
    domain: 'sketch',
    documentUri,
    projectRevision: `nks:${contentDigest}`,
    contentDigest,
  };
}

function validateSketchProjectRequest(
  request: ProjectQualityRequest,
): readonly QualityDiagnostic[] {
  const diagnostics: QualityDiagnostic[] = [];
  if (request.version !== PROJECT_QUALITY_CONTRACT_VERSION || !request.requestId.trim()) {
    diagnostics.push(
      diagnostic(
        'invalid-quality-target',
        'Sketch ProjectQuality requests require the current contract version and a request id.',
      ),
    );
  }
  diagnostics.push(...validateQualityTarget(request.target).diagnostics);
  if (request.project.domain !== 'sketch' || request.target.projectRef?.domain !== 'sketch') {
    diagnostics.push(
      diagnostic(
        'invalid-quality-target',
        'The Sketch ProjectQuality facade only accepts sketch project targets.',
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
  if (!documentPath || extname(documentPath).toLowerCase() !== '.nks') {
    diagnostics.push(
      diagnostic(
        'invalid-quality-target',
        'The Sketch ProjectQuality facade requires a valid .nks file URI or local path.',
        'error',
        ['project', 'documentUri'],
      ),
    );
  }
  return diagnostics;
}

function parseNksDocument(
  bytes: Uint8Array,
):
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly diagnostics: readonly QualityDiagnostic[] } {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch (error) {
    return {
      ok: false,
      diagnostics: [
        diagnostic('invalid-quality-target', `Invalid .nks JSON: ${formatError(error)}`),
      ],
    };
  }
  if (!isRecord(value)) {
    return {
      ok: false,
      diagnostics: [diagnostic('invalid-quality-target', '.nks root must be an object.')],
    };
  }
  const version = value['version'];
  if (
    version !== undefined &&
    version !== '1.0' &&
    version !== '1.1' &&
    version !== CURRENT_NKS_VERSION
  ) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'invalid-quality-target',
          `Unsupported .nks schema version: ${String(version)}.`,
          'error',
          ['version'],
        ),
      ],
    };
  }
  if ('frameLayers' in value || 'animation' in value) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'invalid-quality-target',
          'Frame-animation data is not part of the current .nks persistence contract and cannot be silently ignored.',
          'error',
          ['frameLayers'],
        ),
      ],
    };
  }

  const diagnostics = validateRawNksDocument(value);
  return hasErrors(diagnostics) ? { ok: false, diagnostics } : { ok: true, value };
}

function validateRawNksDocument(value: Record<string, unknown>): readonly QualityDiagnostic[] {
  const diagnostics: QualityDiagnostic[] = [];
  const canvas = value['canvas'];
  if (
    !isRecord(canvas) ||
    !isFiniteNumber(canvas['width']) ||
    !isFiniteNumber(canvas['height']) ||
    !isFiniteNumber(canvas['dpi']) ||
    typeof canvas['backgroundColor'] !== 'string'
  ) {
    diagnostics.push(
      diagnostic(
        'invalid-quality-target',
        'Sketch canvas must persist numeric width, height, dpi, and a background color.',
        'error',
        ['canvas'],
      ),
    );
  }

  const layers = value['layers'];
  if (!Array.isArray(layers)) {
    diagnostics.push(
      diagnostic('invalid-quality-target', 'Sketch layers must be an array.', 'error', ['layers']),
    );
  } else {
    validateRawLayers(layers, [], diagnostics);
  }

  if (!Array.isArray(value['brushPresets'])) {
    diagnostics.push(
      diagnostic('invalid-quality-target', 'Sketch brushPresets must be an array.', 'error', [
        'brushPresets',
      ]),
    );
  }
  if (
    !Array.isArray(value['palette']) ||
    !value['palette'].every((item) => typeof item === 'string')
  ) {
    diagnostics.push(
      diagnostic('invalid-quality-target', 'Sketch palette must be an array of colors.', 'error', [
        'palette',
      ]),
    );
  }
  const viewport = value['viewport'];
  if (
    !isRecord(viewport) ||
    !isFiniteNumber(viewport['panX']) ||
    !isFiniteNumber(viewport['panY']) ||
    !isFiniteNumber(viewport['zoom']) ||
    (viewport['rotation'] !== undefined && !isFiniteNumber(viewport['rotation']))
  ) {
    diagnostics.push(
      diagnostic(
        'invalid-quality-target',
        'Sketch viewport must persist finite pan and zoom values.',
        'error',
        ['viewport'],
      ),
    );
  }
  return diagnostics;
}

function validateRawLayers(
  layers: readonly unknown[],
  parentPath: readonly (string | number)[],
  diagnostics: QualityDiagnostic[],
): void {
  layers.forEach((candidate, index) => {
    const path = [...parentPath, 'layers', index];
    if (!isRecord(candidate)) {
      diagnostics.push(
        diagnostic('invalid-quality-target', 'Sketch layers must be objects.', 'error', path),
      );
      return;
    }
    const children = candidate['children'];
    const source = candidate['source'];
    const validSource =
      source === undefined ||
      (isRecord(source) &&
        source['kind'] === 'file' &&
        typeof source['path'] === 'string' &&
        isNksSourceRole(source['role']));
    const validMask =
      candidate['maskLayerId'] === null || typeof candidate['maskLayerId'] === 'string';
    if (
      typeof candidate['id'] !== 'string' ||
      typeof candidate['name'] !== 'string' ||
      !isLayerType(candidate['type']) ||
      typeof candidate['visible'] !== 'boolean' ||
      typeof candidate['locked'] !== 'boolean' ||
      !isFiniteNumber(candidate['opacity']) ||
      !isSketchBlendMode(candidate['blendMode']) ||
      !isFiniteNumber(candidate['width']) ||
      !isFiniteNumber(candidate['height']) ||
      !isFiniteNumber(candidate['offsetX']) ||
      !isFiniteNumber(candidate['offsetY']) ||
      typeof candidate['clippingMask'] !== 'boolean' ||
      !validMask ||
      !Array.isArray(children) ||
      !validSource
    ) {
      diagnostics.push(
        diagnostic(
          'invalid-quality-target',
          'Sketch layer fields do not match the persisted layer contract.',
          'error',
          path,
        ),
      );
      return;
    }
    validateRawLayers(children, path, diagnostics);
  });
}

function validateNksStructure(document: NksDocument): readonly QualityDiagnostic[] {
  const diagnostics: QualityDiagnostic[] = [];
  if (
    document.version !== CURRENT_NKS_VERSION ||
    !isPositiveFinite(document.canvas.width) ||
    !isPositiveFinite(document.canvas.height) ||
    !isPositiveFinite(document.canvas.dpi) ||
    !document.canvas.backgroundColor.trim()
  ) {
    diagnostics.push(
      diagnostic(
        'invalid-quality-target',
        'Sketch canvas schema, version, dimensions, dpi, and background must be valid.',
        'error',
        ['canvas'],
      ),
    );
  }

  const layerIds = new Set<string>();
  const layersById = new Map<string, NksLayerData>();
  visitLayers(document.layers, [], (layer, path) => {
    if (!layer.id.trim() || layerIds.has(layer.id)) {
      diagnostics.push(
        diagnostic(
          'invalid-quality-target',
          `Sketch layer ids must be non-empty and unique: ${layer.id || '<empty>'}.`,
          'error',
          [...path, 'id'],
        ),
      );
    }
    layerIds.add(layer.id);
    layersById.set(layer.id, layer);
    if (
      !layer.name.trim() ||
      !isPositiveFinite(layer.width) ||
      !isPositiveFinite(layer.height) ||
      !Number.isFinite(layer.offsetX) ||
      !Number.isFinite(layer.offsetY) ||
      !Number.isFinite(layer.opacity) ||
      layer.opacity < 0 ||
      layer.opacity > 1 ||
      !isLayerType(layer.type) ||
      !isSketchBlendMode(layer.blendMode) ||
      typeof layer.visible !== 'boolean' ||
      typeof layer.locked !== 'boolean' ||
      typeof layer.clippingMask !== 'boolean' ||
      (layer.maskLayerId !== null && typeof layer.maskLayerId !== 'string') ||
      !Array.isArray(layer.children)
    ) {
      diagnostics.push(
        diagnostic(
          'invalid-quality-target',
          `Sketch layer ${layer.id || '<empty>'} has invalid geometry, opacity, name, or children.`,
          'error',
          path,
        ),
      );
    }
    if (layer.type !== 'group' && layer.children.length > 0) {
      diagnostics.push(
        diagnostic(
          'invalid-quality-target',
          `Only group layers may contain child layers (${layer.id}).`,
          'error',
          [...path, 'children'],
        ),
      );
    }
  });

  visitLayers(document.layers, [], (layer, path) => {
    if (
      layer.maskLayerId &&
      (!layersById.has(layer.maskLayerId) || layer.maskLayerId === layer.id)
    ) {
      diagnostics.push(
        diagnostic(
          'invalid-quality-target',
          `Sketch layer ${layer.id} references an invalid mask layer.`,
          'error',
          [...path, 'maskLayerId'],
        ),
      );
    }
  });
  return diagnostics;
}

function visitLayers(
  layers: readonly NksLayerData[],
  parentPath: readonly (string | number)[],
  visit: (layer: NksLayerData, path: readonly (string | number)[]) => void,
): void {
  layers.forEach((layer, index) => {
    const path = [...parentPath, 'layers', index];
    visit(layer, path);
    visitLayers(layer.children, path, visit);
  });
}

function createSketchSnapshotRef(project: QualityProjectRef, contentDigest: string): ResourceRef {
  return createResourceRef({
    scope: 'project',
    provider: 'neko-sketch',
    kind: 'document',
    source: {
      kind: 'document',
      uri: project.documentUri,
      identity: { hash: contentDigest },
      metadata: { domain: 'sketch', projectRevision: project.projectRevision },
    },
    locator: { kind: 'file', uri: project.documentUri },
    fingerprint: { strategy: 'hash', value: contentDigest },
  });
}

function projectFileDiagnostic(input: {
  readonly code: string;
  readonly severity: 'info' | 'warning' | 'error';
  readonly message: string;
  readonly path?: readonly (string | number)[];
}): QualityDiagnostic {
  return diagnostic('invalid-quality-target', input.message, input.severity, input.path);
}

function requiresFrameAnimation(target: QualityTarget): boolean {
  return target.expectedIntent?.['requiresFrameAnimation'] === true;
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
        : [diagnostic('quality-evaluator-failed', 'Sketch project quality operation failed.')],
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

const LAYER_TYPES = new Set(['raster', 'group', 'vector', 'text', 'fill', 'adjustment']);
const SKETCH_BLEND_MODES = new Set([
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
]);
const NKS_SOURCE_ROLES = new Set(['image', 'psd', 'generated-image', 'reference']);

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isLayerType(value: unknown): boolean {
  return typeof value === 'string' && LAYER_TYPES.has(value);
}

function isSketchBlendMode(value: unknown): boolean {
  return typeof value === 'string' && SKETCH_BLEND_MODES.has(value);
}

function isNksSourceRole(value: unknown): boolean {
  return typeof value === 'string' && NKS_SOURCE_ROLES.has(value);
}

function hasErrors(diagnostics: readonly QualityDiagnostic[]): boolean {
  return diagnostics.some((item) => item.severity === 'error');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
