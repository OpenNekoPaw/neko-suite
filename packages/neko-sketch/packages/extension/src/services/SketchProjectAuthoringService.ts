import { fileURLToPath } from 'url';
import type {
  NekoProjectAuthoringResult,
  NekoProjectAuthoringTarget,
  NksDocument,
  NksLayerData,
  NksLayerSourceRole,
  ProjectFileDiagnostic,
  ProjectFileOps,
  ProjectFileSaveReason,
  ProjectSourceAddRequest,
  ProjectSourceAddResult,
  PsdImportIssue,
  PsdImportPayloadWire,
  PsdLayerNodeWire,
} from '@neko/shared';
import {
  NEKO_PROJECT_AUTHORING_CONTRACT_VERSION,
  createDefaultNksDocument,
  createDefaultProjectFormatCodecRegistry,
  createNekoProjectAuthoringDiagnostic,
  createNekoProjectAuthoringResult,
  mapPsdBlendMode,
  nksSourcePathPolicy,
  ProjectFileStore,
  validateNekoProjectAuthoringTarget,
} from '@neko/shared';
import { getLogger } from '../utils/logger';

export interface SketchProjectAuthoringCreateOptions {
  readonly width?: number;
  readonly height?: number;
  readonly dpi?: number;
  readonly backgroundColor?: string;
  readonly palette?: readonly string[];
  readonly layers?: readonly NksLayerData[];
}

export interface SketchProjectAuthoringLoadRequest {
  readonly target: NekoProjectAuthoringTarget;
}

export interface SketchProjectAuthoringCreateRequest {
  readonly target: NekoProjectAuthoringTarget;
  readonly options?: SketchProjectAuthoringCreateOptions;
}

export interface SketchProjectAuthoringUpdateRequest {
  readonly target: NekoProjectAuthoringTarget;
  readonly document: NksDocument;
  readonly saveReason?: ProjectFileSaveReason;
}

export interface SketchProjectAuthoringImportImageSourceRequest {
  readonly target: NekoProjectAuthoringTarget;
  readonly sourcePath?: string;
  readonly bytes?: Uint8Array;
  readonly name?: string;
  readonly mimeType?: string;
  readonly width?: number;
  readonly height?: number;
  readonly role?: Extract<NksLayerSourceRole, 'image' | 'generated-image' | 'reference'>;
  readonly requestId?: string;
  readonly createProjectOptions?: SketchProjectAuthoringCreateOptions;
}

export interface SketchProjectAuthoringImportPsdPayloadRequest {
  readonly target: NekoProjectAuthoringTarget;
  readonly payload: PsdImportPayloadWire;
  readonly sourcePath?: string;
  readonly createProjectOptions?: SketchProjectAuthoringCreateOptions;
}

export interface SketchProjectAuthoringImportPsdSourceRequest {
  readonly target: NekoProjectAuthoringTarget;
  readonly payload: PsdImportPayloadWire;
  readonly sourcePath?: string;
  readonly bytes?: Uint8Array;
  readonly name?: string;
  readonly requestId?: string;
  readonly createProjectOptions?: SketchProjectAuthoringCreateOptions;
}

export type SketchProjectAuthoringDocumentEdit =
  | {
      readonly kind: 'replace-document';
      readonly document: NksDocument;
    }
  | {
      readonly kind: 'set-canvas';
      readonly canvas: Partial<NksDocument['canvas']>;
    }
  | {
      readonly kind: 'replace-layers';
      readonly layers: readonly NksLayerData[];
    }
  | {
      readonly kind: 'append-layer';
      readonly layer: NksLayerData;
      readonly index?: number;
    };

export interface SketchProjectAuthoringApplyEditsRequest {
  readonly target: NekoProjectAuthoringTarget;
  readonly edits: readonly SketchProjectAuthoringDocumentEdit[];
  readonly createProjectOptions?: SketchProjectAuthoringCreateOptions;
  readonly saveReason?: ProjectFileSaveReason;
}

export interface SketchProjectAuthoringEditedDocument {
  readonly document: NksDocument;
  readonly layerIds: readonly string[];
}

export interface SketchProjectAuthoringImportedLayer {
  readonly layerId: string;
  readonly layer: NksLayerData;
  readonly sourcePath: string;
  readonly sourceIngest: ProjectSourceAddResult;
}

export interface SketchProjectAuthoringImportedPsd {
  readonly layerIds: readonly string[];
  readonly document: NksDocument;
  readonly issues: readonly PsdImportIssue[];
  readonly sourcePath?: string;
  readonly sourceIngest?: ProjectSourceAddResult;
}

export type SketchProjectSourceIngest = (
  documentUri: string,
  request: ProjectSourceAddRequest,
) => Promise<ProjectSourceAddResult>;

export interface SketchProjectAuthoringServiceOptions {
  readonly fileOps: ProjectFileOps;
  readonly ingestSource?: SketchProjectSourceIngest;
  readonly createId?: () => string;
}

export interface ISketchProjectAuthoringService {
  loadProject(
    request: SketchProjectAuthoringLoadRequest,
  ): Promise<NekoProjectAuthoringResult<NksDocument>>;
  createProject(
    request: SketchProjectAuthoringCreateRequest,
  ): Promise<NekoProjectAuthoringResult<NksDocument>>;
  updateProjectData(
    request: SketchProjectAuthoringUpdateRequest,
  ): Promise<NekoProjectAuthoringResult<NksDocument>>;
  applyDocumentEdits(
    request: SketchProjectAuthoringApplyEditsRequest,
  ): Promise<NekoProjectAuthoringResult<SketchProjectAuthoringEditedDocument>>;
  importImageSource(
    request: SketchProjectAuthoringImportImageSourceRequest,
  ): Promise<NekoProjectAuthoringResult<SketchProjectAuthoringImportedLayer>>;
  importPsdPayload(
    request: SketchProjectAuthoringImportPsdPayloadRequest,
  ): Promise<NekoProjectAuthoringResult<SketchProjectAuthoringImportedPsd>>;
  importPsdSource(
    request: SketchProjectAuthoringImportPsdSourceRequest,
  ): Promise<NekoProjectAuthoringResult<SketchProjectAuthoringImportedPsd>>;
}

export class SketchProjectAuthoringService implements ISketchProjectAuthoringService {
  private readonly projectFileStore: ProjectFileStore;

  constructor(private readonly options: SketchProjectAuthoringServiceOptions) {
    this.projectFileStore = new ProjectFileStore({
      registry: createDefaultProjectFormatCodecRegistry(),
      fileOps: options.fileOps,
      logger: getLogger('SketchProjectAuthoringService'),
    });
  }

  async loadProject(
    request: SketchProjectAuthoringLoadRequest,
  ): Promise<NekoProjectAuthoringResult<NksDocument>> {
    const target = resolveFileBackedTarget(request.target, {
      createNewAllowed: false,
      defaultKind: 'file',
      missingDocumentMessage: 'Sketch authoring requires documentUri.',
    });
    if (!target.ok) return target.result;

    const loaded = await this.projectFileStore.load<NksDocument>({
      filePath: target.filePath,
      formatId: 'nks',
      sourcePolicy: nksSourcePathPolicy,
    });
    if (!loaded.ok || !loaded.document) {
      return failedFromProjectDiagnostics({
        target: request.target,
        diagnostics: loaded.diagnostics,
        fallbackMessage: 'Failed to load Sketch project.',
      });
    }

    return createNekoProjectAuthoringResult({
      ok: true,
      documentUri: target.documentUri,
      target: createResolvedTarget(request.target, target, false),
      created: false,
      revealed: false,
      diagnostics: [],
      data: loaded.document,
    });
  }

  async createProject(
    request: SketchProjectAuthoringCreateRequest,
  ): Promise<NekoProjectAuthoringResult<NksDocument>> {
    const target = resolveFileBackedTarget(request.target, {
      createNewAllowed: true,
      defaultKind: 'new',
      missingDocumentMessage:
        'Sketch create-new authoring requires an adapter-resolved documentUri.',
    });
    if (!target.ok) return target.result;

    const document = createSketchDocument(request.options);
    const saved = await this.projectFileStore.save<NksDocument>({
      filePath: target.filePath,
      formatId: 'nks',
      document,
      sourcePolicy: nksSourcePathPolicy,
      saveReason: 'import',
    });
    if (!saved.ok) {
      return failedFromProjectDiagnostics({
        target: request.target,
        diagnostics: saved.diagnostics,
        fallbackMessage: 'Failed to create Sketch project.',
      });
    }

    return createNekoProjectAuthoringResult({
      ok: true,
      documentUri: target.documentUri,
      target: createResolvedTarget(request.target, target, true),
      created: true,
      revealed: false,
      diagnostics: [],
      data: saved.document ?? document,
    });
  }

  async updateProjectData(
    request: SketchProjectAuthoringUpdateRequest,
  ): Promise<NekoProjectAuthoringResult<NksDocument>> {
    const target = resolveFileBackedTarget(request.target, {
      createNewAllowed: false,
      defaultKind: 'file',
      missingDocumentMessage: 'Sketch authoring requires documentUri.',
    });
    if (!target.ok) return target.result;

    const saved = await this.projectFileStore.save<NksDocument>({
      filePath: target.filePath,
      formatId: 'nks',
      document: request.document,
      sourcePolicy: nksSourcePathPolicy,
      saveReason: request.saveReason ?? 'agent-edit',
    });
    if (!saved.ok) {
      return failedFromProjectDiagnostics({
        target: request.target,
        diagnostics: saved.diagnostics,
        fallbackMessage: 'Failed to update Sketch project.',
      });
    }

    return createNekoProjectAuthoringResult({
      ok: true,
      documentUri: target.documentUri,
      target: createResolvedTarget(request.target, target, false),
      created: false,
      revealed: false,
      diagnostics: [],
      data: saved.document ?? request.document,
    });
  }

  async applyDocumentEdits(
    request: SketchProjectAuthoringApplyEditsRequest,
  ): Promise<NekoProjectAuthoringResult<SketchProjectAuthoringEditedDocument>> {
    const target = resolveFileBackedTarget(request.target, {
      createNewAllowed: true,
      defaultKind: 'file',
      missingDocumentMessage: 'Sketch authoring requires documentUri.',
    });
    if (!target.ok) return target.result;

    const created = target.targetKind === 'new';
    const baseDocument = created
      ? createSketchDocument(request.createProjectOptions)
      : await this.loadDocumentForEdit(target.filePath, request.target);
    if (!baseDocument.ok) return baseDocument.result;

    const edited = applySketchDocumentEdits(baseDocument.document, request.edits);
    const saved = await this.projectFileStore.save<NksDocument>({
      filePath: target.filePath,
      formatId: 'nks',
      document: edited.document,
      sourcePolicy: nksSourcePathPolicy,
      saveReason: request.saveReason ?? 'agent-edit',
    });
    if (!saved.ok) {
      return failedFromProjectDiagnostics({
        target: request.target,
        diagnostics: saved.diagnostics,
        fallbackMessage: 'Failed to apply Sketch document edits.',
      });
    }

    return createNekoProjectAuthoringResult({
      ok: true,
      documentUri: target.documentUri,
      target: createResolvedTarget(request.target, target, created),
      created,
      revealed: false,
      diagnostics: [],
      data: {
        document: saved.document ?? edited.document,
        layerIds: edited.layerIds,
      },
    });
  }

  async importImageSource(
    request: SketchProjectAuthoringImportImageSourceRequest,
  ): Promise<NekoProjectAuthoringResult<SketchProjectAuthoringImportedLayer>> {
    const target = resolveFileBackedTarget(request.target, {
      createNewAllowed: true,
      defaultKind: 'file',
      missingDocumentMessage: 'Sketch image import authoring requires documentUri.',
    });
    if (!target.ok) return target.result;
    if (!this.options.ingestSource) {
      return failedResult(
        request.target,
        'authoring-capability-unavailable',
        'Sketch image import requires a source ingest port.',
      );
    }

    const created = target.targetKind === 'new';
    const baseDocument = created
      ? createSketchDocument(request.createProjectOptions)
      : await this.loadDocumentForEdit(target.filePath, request.target);
    if (!baseDocument.ok) return baseDocument.result;

    const sourceRequest = createImageSourceAddRequest(request, target.documentUri);
    const sourceIngest = await this.options.ingestSource(target.documentUri, sourceRequest);
    if (!sourceIngest.ok || !sourceIngest.durablePath) {
      return createNekoProjectAuthoringResult<SketchProjectAuthoringImportedLayer>({
        ok: false,
        documentUri: target.documentUri,
        target: createResolvedTarget(request.target, target, created),
        created,
        revealed: false,
        diagnostics: sourceDiagnosticsToAuthoringDiagnostics(sourceIngest.diagnostics),
      });
    }

    const layer = createImageSourceLayer({
      request,
      sourcePath: sourceIngest.durablePath,
      document: baseDocument.document,
      createId: this.options.createId,
    });
    const edited = applySketchDocumentEdits(baseDocument.document, [
      { kind: 'append-layer', layer },
    ]);
    const saved = await this.projectFileStore.save<NksDocument>({
      filePath: target.filePath,
      formatId: 'nks',
      document: edited.document,
      sourcePolicy: nksSourcePathPolicy,
      saveReason: 'import',
    });
    if (!saved.ok) {
      return failedFromProjectDiagnostics({
        target: request.target,
        diagnostics: saved.diagnostics,
        fallbackMessage: 'Failed to import image into Sketch project.',
      });
    }

    return createNekoProjectAuthoringResult({
      ok: true,
      documentUri: target.documentUri,
      target: createResolvedTarget(request.target, target, created),
      created,
      revealed: false,
      diagnostics: [],
      data: {
        layerId: layer.id,
        layer,
        sourcePath: sourceIngest.durablePath,
        sourceIngest,
      },
    });
  }

  async importPsdPayload(
    request: SketchProjectAuthoringImportPsdPayloadRequest,
  ): Promise<NekoProjectAuthoringResult<SketchProjectAuthoringImportedPsd>> {
    const target = resolveFileBackedTarget(request.target, {
      createNewAllowed: true,
      defaultKind: 'file',
      missingDocumentMessage: 'Sketch PSD import authoring requires documentUri.',
    });
    if (!target.ok) return target.result;

    const created = target.targetKind === 'new';
    const baseDocument = created
      ? createSketchDocument({
          width: request.payload.tree.canvas.width,
          height: request.payload.tree.canvas.height,
          dpi: request.payload.tree.canvas.dpi,
          backgroundColor: request.payload.tree.canvas.backgroundColor,
          ...request.createProjectOptions,
        })
      : await this.loadDocumentForEdit(target.filePath, request.target);
    if (!baseDocument.ok) return baseDocument.result;

    const mapped = mapPsdPayloadToNksLayers({
      payload: request.payload,
      sourcePath: request.sourcePath,
      createId: this.options.createId,
    });
    const shouldAdoptCanvas = baseDocument.document.layers.length === 0;
    const edited = applySketchDocumentEdits(baseDocument.document, [
      ...(shouldAdoptCanvas
        ? [
            {
              kind: 'set-canvas' as const,
              canvas: request.payload.tree.canvas,
            },
          ]
        : []),
      { kind: 'replace-layers', layers: [...baseDocument.document.layers, ...mapped.layers] },
    ]);
    const saved = await this.projectFileStore.save<NksDocument>({
      filePath: target.filePath,
      formatId: 'nks',
      document: edited.document,
      sourcePolicy: nksSourcePathPolicy,
      saveReason: 'import',
    });
    if (!saved.ok) {
      return failedFromProjectDiagnostics({
        target: request.target,
        diagnostics: saved.diagnostics,
        fallbackMessage: 'Failed to import PSD into Sketch project.',
      });
    }

    return createNekoProjectAuthoringResult({
      ok: true,
      documentUri: target.documentUri,
      target: createResolvedTarget(request.target, target, created),
      created,
      revealed: false,
      diagnostics: [],
      data: {
        layerIds: mapped.layerIds,
        document: saved.document ?? edited.document,
        issues: mapped.issues,
        ...(request.sourcePath ? { sourcePath: request.sourcePath } : {}),
      },
    });
  }

  async importPsdSource(
    request: SketchProjectAuthoringImportPsdSourceRequest,
  ): Promise<NekoProjectAuthoringResult<SketchProjectAuthoringImportedPsd>> {
    const target = resolveFileBackedTarget(request.target, {
      createNewAllowed: true,
      defaultKind: 'file',
      missingDocumentMessage: 'Sketch PSD import authoring requires documentUri.',
    });
    if (!target.ok) return target.result;
    if (!this.options.ingestSource) {
      return failedResult(
        request.target,
        'authoring-capability-unavailable',
        'Sketch PSD import requires a source ingest port.',
      );
    }

    const sourceRequest = createPsdSourceAddRequest(request, target.documentUri);
    const sourceIngest = await this.options.ingestSource(target.documentUri, sourceRequest);
    if (!sourceIngest.ok || !sourceIngest.durablePath) {
      return createNekoProjectAuthoringResult<SketchProjectAuthoringImportedPsd>({
        ok: false,
        documentUri: target.documentUri,
        target: createResolvedTarget(
          request.target,
          target,
          target.targetKind === 'new',
        ),
        created: target.targetKind === 'new',
        revealed: false,
        diagnostics: sourceDiagnosticsToAuthoringDiagnostics(sourceIngest.diagnostics),
      });
    }

    const imported = await this.importPsdPayload({
      target: request.target,
      payload: request.payload,
      sourcePath: sourceIngest.durablePath,
      createProjectOptions: request.createProjectOptions,
    });
    if (!imported.ok || !imported.data) return imported;
    return createNekoProjectAuthoringResult({
      ok: true,
      documentUri: imported.documentUri,
      target: imported.target,
      created: imported.created,
      revealed: imported.revealed,
      diagnostics: imported.diagnostics,
      data: {
        ...imported.data,
        sourcePath: sourceIngest.durablePath,
        sourceIngest,
      },
    });
  }

  private async loadDocumentForEdit(
    filePath: string,
    requestTarget: NekoProjectAuthoringTarget,
  ): Promise<
    | { readonly ok: true; readonly document: NksDocument }
    | { readonly ok: false; readonly result: NekoProjectAuthoringResult<never> }
  > {
    const loaded = await this.projectFileStore.load<NksDocument>({
      filePath,
      formatId: 'nks',
      sourcePolicy: nksSourcePathPolicy,
    });
    if (!loaded.ok || !loaded.document) {
      return {
        ok: false,
        result: failedFromProjectDiagnostics({
          target: requestTarget,
          diagnostics: loaded.diagnostics,
          fallbackMessage: 'Failed to load Sketch project for editing.',
        }),
      };
    }
    return { ok: true, document: loaded.document };
  }
}

type ResolvedSketchAuthoringTarget =
  | {
      readonly ok: true;
      readonly filePath: string;
      readonly documentUri: string;
      readonly targetKind: 'active' | 'file' | 'new';
    }
  | {
      readonly ok: false;
      readonly result: NekoProjectAuthoringResult<never>;
    };

function resolveFileBackedTarget(
  target: NekoProjectAuthoringTarget,
  options: {
    readonly createNewAllowed: boolean;
    readonly defaultKind: 'file' | 'new';
    readonly missingDocumentMessage: string;
  },
): ResolvedSketchAuthoringTarget {
  const validation = validateNekoProjectAuthoringTarget(target, {
    createNewAllowed: options.createNewAllowed,
  });
  if (!validation.ok) {
    return {
      ok: false,
      result: createNekoProjectAuthoringResult({
        ok: false,
        diagnostics: validation.diagnostics,
      }),
    };
  }

  if (!target.documentUri) {
    return {
      ok: false,
      result: failedResult(
        target,
        target.kind === 'new' ? 'workspace-required' : 'missing-authoring-target',
        options.missingDocumentMessage,
      ),
    };
  }

  return {
    ok: true,
    filePath: documentUriToFilePath(target.documentUri),
    documentUri: target.documentUri,
    targetKind: target.kind ?? options.defaultKind,
  };
}

function createResolvedTarget(
  requestTarget: NekoProjectAuthoringTarget,
  target: Extract<ResolvedSketchAuthoringTarget, { readonly ok: true }>,
  created: boolean,
): NonNullable<NekoProjectAuthoringResult['target']> {
  return {
    kind: target.targetKind,
    documentUri: target.documentUri,
    ...(requestTarget.title ? { title: requestTarget.title } : {}),
    created,
    reveal: requestTarget.reveal ?? false,
  };
}

function createSketchDocument(options: SketchProjectAuthoringCreateOptions = {}): NksDocument {
  const base = createDefaultNksDocument();
  return {
    ...base,
    canvas: {
      ...base.canvas,
      ...(options.width !== undefined ? { width: options.width } : {}),
      ...(options.height !== undefined ? { height: options.height } : {}),
      ...(options.dpi !== undefined ? { dpi: options.dpi } : {}),
      ...(options.backgroundColor ? { backgroundColor: options.backgroundColor } : {}),
    },
    layers: options.layers ? options.layers.map(cloneLayer) : base.layers.map(cloneLayer),
    palette: options.palette ? [...options.palette] : [...base.palette],
  };
}

function applySketchDocumentEdits(
  document: NksDocument,
  edits: readonly SketchProjectAuthoringDocumentEdit[],
): SketchProjectAuthoringEditedDocument {
  let next = cloneDocument(document);
  const layerIds: string[] = [];
  for (const edit of edits) {
    switch (edit.kind) {
      case 'replace-document': {
        next = cloneDocument(edit.document);
        layerIds.splice(0, layerIds.length, ...collectLayerIds(next.layers));
        break;
      }
      case 'set-canvas': {
        next = {
          ...next,
          canvas: {
            ...next.canvas,
            ...edit.canvas,
          },
        };
        break;
      }
      case 'replace-layers': {
        const layers = edit.layers.map(cloneLayer);
        next = { ...next, layers };
        layerIds.splice(0, layerIds.length, ...collectLayerIds(layers));
        break;
      }
      case 'append-layer': {
        const layer = cloneLayer(edit.layer);
        const layers = [...next.layers];
        const index =
          edit.index === undefined ? layers.length : Math.max(0, Math.min(edit.index, layers.length));
        layers.splice(index, 0, layer);
        next = { ...next, layers };
        layerIds.push(layer.id);
        break;
      }
    }
  }
  return { document: next, layerIds };
}

function cloneDocument(document: NksDocument): NksDocument {
  return {
    ...document,
    canvas: { ...document.canvas },
    layers: document.layers.map(cloneLayer),
    brushPresets: document.brushPresets.map((preset) => ({ ...preset })),
    palette: [...document.palette],
    viewport: { ...document.viewport },
  };
}

function cloneLayer(layer: NksLayerData): NksLayerData {
  return {
    ...layer,
    children: layer.children.map(cloneLayer),
  };
}

function collectLayerIds(layers: readonly NksLayerData[]): readonly string[] {
  return layers.flatMap((layer) => [layer.id, ...collectLayerIds(layer.children)]);
}

function createImageSourceAddRequest(
  request: SketchProjectAuthoringImportImageSourceRequest,
  documentUri: string,
): ProjectSourceAddRequest {
  const fileName = ensureImageFileName(request.name ?? basenamePath(request.sourcePath));
  return {
    requestId: request.requestId ?? `sketch-authoring-import-${Date.now()}`,
    kind: request.bytes ? 'generated-output' : 'programmatic',
    formatId: 'nks',
    documentUri,
    ...(request.sourcePath ? { sourcePath: request.sourcePath } : {}),
    ...(request.bytes ? { bytes: request.bytes } : {}),
    browserFile: {
      name: fileName,
      ...(request.mimeType ? { type: request.mimeType } : {}),
      ...(request.bytes ? { size: request.bytes.byteLength } : {}),
    },
    target: { role: request.role === 'generated-image' ? 'generated' : 'image' },
    destination: {
      kind: 'project',
      directory: 'imports',
      copyMode: request.bytes ? 'copy' : 'link',
    },
    ingestMode: request.bytes ? 'create-asset' : 'link',
    ...(request.mimeType ? { mimeType: request.mimeType } : {}),
    metadata: {
      sketchImport: true,
      name: fileName,
      sourceCommand: 'neko.sketch.authoring.importImageSource',
    },
  };
}

function createPsdSourceAddRequest(
  request: SketchProjectAuthoringImportPsdSourceRequest,
  documentUri: string,
): ProjectSourceAddRequest {
  const fileName = ensurePsdFileName(request.name ?? basenamePath(request.sourcePath));
  return {
    requestId: request.requestId ?? `sketch-authoring-import-psd-${Date.now()}`,
    kind: request.bytes ? 'generated-output' : 'programmatic',
    formatId: 'nks',
    documentUri,
    ...(request.sourcePath ? { sourcePath: request.sourcePath } : {}),
    ...(request.bytes ? { bytes: request.bytes } : {}),
    browserFile: {
      name: fileName,
      type: 'image/vnd.adobe.photoshop',
      ...(request.bytes ? { size: request.bytes.byteLength } : {}),
    },
    target: { role: 'document' },
    destination: {
      kind: 'project',
      directory: 'imports',
      copyMode: request.bytes ? 'copy' : 'link',
    },
    ingestMode: request.bytes ? 'create-asset' : 'link',
    mimeType: 'image/vnd.adobe.photoshop',
    metadata: {
      sketchImport: true,
      name: fileName,
      sourceCommand: 'neko.sketch.authoring.importPsdSource',
    },
  };
}

function createImageSourceLayer(input: {
  readonly request: SketchProjectAuthoringImportImageSourceRequest;
  readonly sourcePath: string;
  readonly document: NksDocument;
  readonly createId?: () => string;
}): NksLayerData {
  const bytes = input.request.bytes;
  const pngSize = bytes ? readPngSize(bytes) : undefined;
  const name = stripExtension(input.request.name ?? basenamePath(input.sourcePath) ?? 'Imported Image');
  return {
    id: input.createId?.() ?? createStableLayerId('image'),
    name,
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: input.request.width ?? pngSize?.width ?? input.document.canvas.width,
    height: input.request.height ?? pngSize?.height ?? input.document.canvas.height,
    offsetX: 0,
    offsetY: 0,
    clippingMask: false,
    maskLayerId: null,
    children: [],
    ...(bytes && isPngSource(input.request, input.sourcePath)
      ? { data: bytesToBase64(bytes) }
      : {}),
    source: {
      kind: 'file',
      path: input.sourcePath,
      role: input.request.role ?? 'image',
      ...(input.request.mimeType ? { mimeType: input.request.mimeType } : {}),
      ...(input.request.name ? { originalName: input.request.name } : {}),
    },
  };
}

function mapPsdPayloadToNksLayers(input: {
  readonly payload: PsdImportPayloadWire;
  readonly sourcePath?: string;
  readonly createId?: () => string;
}): {
  readonly layers: readonly NksLayerData[];
  readonly layerIds: readonly string[];
  readonly issues: readonly PsdImportIssue[];
} {
  const issues = [...input.payload.issues];
  const layers = input.payload.tree.layers.map((layer) =>
    mapPsdLayerNode(layer, {
      sourceName: input.payload.name,
      sourcePath: input.sourcePath,
      createId: input.createId,
      parentPath: [],
      issues,
    }),
  );
  return {
    layers,
    layerIds: collectLayerIds(layers),
    issues,
  };
}

function mapPsdLayerNode(
  node: PsdLayerNodeWire,
  context: {
    readonly sourceName: string;
    readonly sourcePath?: string;
    readonly createId?: () => string;
    readonly parentPath: readonly string[];
    readonly issues: PsdImportIssue[];
  },
): NksLayerData {
  const layerPath = [...context.parentPath, node.name];
  if (node.kind === 'group') {
    return {
      id: node.id ?? context.createId?.() ?? createStableLayerId('psd-group'),
      name: node.name,
      type: 'group',
      visible: node.visible,
      locked: false,
      opacity: clampOpacity(node.opacity),
      blendMode: 'normal',
      width: node.width,
      height: node.height,
      offsetX: node.left,
      offsetY: node.top,
      clippingMask: node.clippingMask,
      maskLayerId: null,
      children: (node.children ?? []).map((child) =>
        mapPsdLayerNode(child, { ...context, parentPath: layerPath }),
      ),
      ...(context.sourcePath
        ? {
            source: {
              kind: 'file' as const,
              path: context.sourcePath,
              role: 'psd' as const,
              originalName: context.sourceName,
            },
          }
        : {}),
    };
  }

  const blend = mapPsdBlendMode(node.blendMode, layerPath);
  if (blend.issue && !hasPsdIssue(context.issues, blend.issue)) {
    context.issues.push(blend.issue);
  }

  return {
    id: node.id ?? context.createId?.() ?? createStableLayerId('psd-raster'),
    name: node.name,
    type: 'raster',
    visible: node.visible,
    locked: false,
    opacity: clampOpacity(node.opacity),
    blendMode: blend.blendMode,
    width: node.width,
    height: node.height,
    offsetX: node.left,
    offsetY: node.top,
    clippingMask: node.clippingMask,
    maskLayerId: null,
    children: [],
    ...(node.pixels ? { data: node.pixels.dataBase64 } : {}),
    ...(context.sourcePath
      ? {
          source: {
            kind: 'file' as const,
            path: context.sourcePath,
            role: 'psd' as const,
            originalName: context.sourceName,
          },
        }
      : {}),
  };
}

function sourceDiagnosticsToAuthoringDiagnostics(
  diagnostics: readonly ProjectFileDiagnostic[],
): ReturnType<typeof createNekoProjectAuthoringDiagnostic>[] {
  return diagnostics.map(projectFileDiagnosticToAuthoringDiagnostic);
}

function readPngSize(
  bytes: Uint8Array,
): { readonly width: number; readonly height: number } | undefined {
  if (bytes.byteLength < 24) return undefined;
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((value, index) => bytes[index] === value)) return undefined;
  return {
    width: readUInt32BE(bytes, 16),
    height: readUInt32BE(bytes, 20),
  };
}

function readUInt32BE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) * 0x1000000 +
    ((bytes[offset + 1] ?? 0) << 16) +
    ((bytes[offset + 2] ?? 0) << 8) +
    (bytes[offset + 3] ?? 0)
  );
}

function isPngSource(
  request: Pick<SketchProjectAuthoringImportImageSourceRequest, 'mimeType' | 'name'>,
  sourcePath: string,
): boolean {
  return (
    request.mimeType === 'image/png' ||
    extnamePath(request.name ?? sourcePath).toLowerCase() === '.png'
  );
}

function ensureImageFileName(name: string | undefined): string {
  if (!name) return 'imported.png';
  return extnamePath(name) ? name : `${name}.png`;
}

function ensurePsdFileName(name: string | undefined): string {
  if (!name) return 'imported.psd';
  return extnamePath(name) ? name : `${name}.psd`;
}

function stripExtension(name: string): string {
  const ext = extnamePath(name);
  return ext ? name.slice(0, -ext.length) : name;
}

function basenamePath(filePath: string | undefined): string | undefined {
  if (!filePath) return undefined;
  const normalized = filePath.split(/[?#]/, 1)[0]?.replace(/\\/g, '/') ?? filePath;
  return normalized.split('/').pop() || normalized;
}

function extnamePath(filePath: string): string {
  const basename = basenamePath(filePath) ?? filePath;
  const index = basename.lastIndexOf('.');
  return index > 0 ? basename.slice(index) : '';
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function createStableLayerId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function clampOpacity(opacity: number): number {
  if (!Number.isFinite(opacity)) return 1;
  return Math.max(0, Math.min(1, opacity));
}

function hasPsdIssue(issues: readonly PsdImportIssue[], issue: PsdImportIssue): boolean {
  return issues.some(
    (item) =>
      item.code === issue.code && sameStringArray(item.layerPath ?? [], issue.layerPath ?? []),
  );
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function failedResult<TData = never>(
  target: NekoProjectAuthoringTarget | undefined,
  code: Parameters<typeof createNekoProjectAuthoringDiagnostic>[0]['code'],
  message: string,
): NekoProjectAuthoringResult<TData> {
  return {
    version: NEKO_PROJECT_AUTHORING_CONTRACT_VERSION,
    ok: false,
    diagnostics: [
      createNekoProjectAuthoringDiagnostic({
        code,
        message,
      }),
    ],
    ...(target?.documentUri ? { documentUri: target.documentUri } : {}),
  };
}

function failedFromProjectDiagnostics<TData = never>(input: {
  readonly target: NekoProjectAuthoringTarget | undefined;
  readonly diagnostics: readonly ProjectFileDiagnostic[];
  readonly fallbackMessage: string;
}): NekoProjectAuthoringResult<TData> {
  return createNekoProjectAuthoringResult({
    ok: false,
    ...(input.target?.documentUri ? { documentUri: input.target.documentUri } : {}),
    diagnostics:
      input.diagnostics.length > 0
        ? input.diagnostics.map(projectFileDiagnosticToAuthoringDiagnostic)
        : [
            createNekoProjectAuthoringDiagnostic({
              code: 'write-failed',
              message: input.fallbackMessage,
            }),
          ],
  });
}

function projectFileDiagnosticToAuthoringDiagnostic(diagnostic: ProjectFileDiagnostic) {
  return createNekoProjectAuthoringDiagnostic({
    code: mapProjectFileDiagnosticCode(diagnostic.code),
    severity: diagnostic.severity,
    message: diagnostic.message,
    path: diagnostic.path,
    sourceId: diagnostic.sourceId,
    context: diagnostic.context,
    projectFileDiagnostic: diagnostic,
  });
}

function mapProjectFileDiagnosticCode(
  code: ProjectFileDiagnostic['code'],
): Parameters<typeof createNekoProjectAuthoringDiagnostic>[0]['code'] {
  if (code === 'runtime-handle-persisted') return 'runtime-handle-persisted';
  if (code === 'cache-source-persisted') return 'cache-source-persisted';
  if (code === 'write-failed' || code === 'codec-save-failed') return 'write-failed';
  return 'source-resolution-failed';
}

function documentUriToFilePath(documentUri: string): string {
  if (documentUri.startsWith('file://')) {
    return fileURLToPath(documentUri);
  }
  return documentUri;
}
