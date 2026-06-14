import {
  NarrativeRuntime,
  WhitelistConditionEvaluator,
  createNarrativeProductionBindingContentAccessRequest,
  isNarrativeAssetRef,
  isResourceRef,
  validateNarrativeAssetRef,
  validateNarrativeProductionBinding,
  type ContentAccessRequest,
  type ContentAccessResult,
  type ContentAccessIntent,
  type ContentStableSourceRef,
  type NarrativeAssetRef,
  type NarrativeAssetResolveResult,
  type NarrativeAssetResolver,
  type NarrativeGraphSnapshot,
  type NarrativeNodeSnapshot,
  type NarrativeProductionBinding,
} from '@neko/shared';
import {
  loadFountainPlayScene,
  normalizeNarrativeCharacterBindings,
  type FountainPlayScene,
  type PlayCharacterBinding,
  type PlayDirective,
  type PlayNarrativeAssetRef,
} from '@neko-story/parser';
import {
  HTML5_RENDERER_BUNDLE_PATH,
  HTML5_RUNTIME_BUNDLE_PATH,
  createHtml5RendererBundle,
  createHtml5RuntimeBundle,
} from './html5RuntimeBundle';

export type NarrativeExportArtifactKind = 'html' | 'data' | 'runtime' | 'renderer' | 'asset';

export type NarrativeExportMediaRef = NarrativeAssetRef | ContentStableSourceRef;

export type NarrativeExportMediaResolveResult = NarrativeAssetResolveResult | ContentAccessResult;

export interface NarrativeExportArtifact {
  readonly path: string;
  readonly kind: NarrativeExportArtifactKind;
  readonly content: string | Uint8Array;
  readonly mimeType?: string;
}

export type NarrativeExportDiagnosticSeverity = 'info' | 'warning' | 'error';

export type NarrativeExportDiagnosticCode =
  | 'export-no-entry'
  | 'export-missing-ending'
  | 'export-missing-scene-ref'
  | 'export-scene-unavailable'
  | 'export-invalid-asset-ref'
  | 'export-runtime-asset-ref'
  | 'export-non-portable-absolute-path'
  | 'export-asset-resolver-missing'
  | 'export-missing-source-asset'
  | 'export-asset-package-failed'
  | 'export-unsupported-condition';

export interface NarrativeExportDiagnostic {
  readonly code: NarrativeExportDiagnosticCode;
  readonly severity: NarrativeExportDiagnosticSeverity;
  readonly message: string;
  readonly nodeId?: string;
  readonly connectionId?: string;
  readonly path?: string;
  readonly assetRef?: NarrativeExportMediaRef;
  readonly bindingId?: string;
}

export interface NarrativePackagedAsset {
  readonly id: string;
  readonly ref: NarrativeExportMediaRef;
  readonly outputPath: string;
  readonly finalExportStatus?: NarrativeExportMediaResolveResult['status'];
  readonly packageStatus?: NarrativeExportMediaResolveResult['status'];
  readonly mimeType?: string;
  readonly source?: 'narrative-asset' | 'production-binding';
  readonly productionBindingId?: string;
}

export interface NarrativeExportStoryData {
  readonly version: 1;
  readonly graph: NarrativeGraphSnapshot;
  readonly scenes: Readonly<Record<string, FountainPlayScene>>;
  readonly characterBindings: Readonly<Record<string, PlayCharacterBinding>>;
  readonly assets: readonly NarrativePackagedAsset[];
}

export interface NarrativeExportResult {
  readonly ok: boolean;
  readonly diagnostics: readonly NarrativeExportDiagnostic[];
  readonly artifacts: readonly NarrativeExportArtifact[];
  readonly story: NarrativeExportStoryData;
}

export interface NarrativeExportAssetCopyInput {
  readonly ref: NarrativeExportMediaRef;
  readonly outputPath: string;
  readonly finalExportResult?: NarrativeExportMediaResolveResult;
  readonly packageResult?: NarrativeExportMediaResolveResult;
}

export interface NarrativeExporterOptions {
  readonly assetResolver?: NarrativeAssetResolver;
  readonly contentAccessResolver?: NarrativeExportContentAccessResolver;
  readonly readScene?: (sceneRef: string) => Promise<string | undefined> | string | undefined;
  readonly copyAsset?: (
    input: NarrativeExportAssetCopyInput,
  ) => Promise<string | Uint8Array | undefined> | string | Uint8Array | undefined;
  readonly runtimeBundle?: string;
  readonly rendererBundle?: string;
}

export interface NarrativeExportContentAccessResolver {
  resolve(request: ContentAccessRequest): Promise<ContentAccessResult>;
}

type CollectedAsset = CollectedNarrativeAsset | CollectedProductionBindingAsset;

interface CollectedAssetBase {
  readonly ref: NarrativeExportMediaRef;
  readonly nodeId?: string;
  readonly path?: string;
}

interface CollectedNarrativeAsset extends CollectedAssetBase {
  readonly source: 'narrative-asset';
  readonly ref: NarrativeAssetRef;
}

interface CollectedProductionBindingAsset extends CollectedAssetBase {
  readonly source: 'production-binding';
  readonly ref: NarrativeExportMediaRef;
  readonly binding: NarrativeProductionBinding;
}

interface CollectedProductionBinding {
  readonly binding: NarrativeProductionBinding;
  readonly nodeId?: string;
}

interface AssetResolvePair {
  readonly finalExportResult?: NarrativeExportMediaResolveResult;
  readonly packageResult?: NarrativeExportMediaResolveResult;
}

interface AssetResolvePlan {
  readonly packagedAssets: readonly NarrativePackagedAsset[];
  readonly resolvedByOutputPath: ReadonlyMap<string, AssetResolvePair>;
}

const STORY_DATA_PATH = 'data/story.json';
const INDEX_HTML_PATH = 'index.html';
const SUPPORTED_CONDITION_VARIABLE_PLACEHOLDER = {
  string: '',
  number: 0,
  boolean: false,
  null: null,
} as const;

export class NarrativeExporter {
  constructor(private readonly options: NarrativeExporterOptions = {}) {}

  async export(snapshot: NarrativeGraphSnapshot): Promise<NarrativeExportResult> {
    const diagnostics: NarrativeExportDiagnostic[] = [];
    const scenes = await this.loadScenes(snapshot, diagnostics);
    const assets = collectAssets(snapshot, scenes);
    const productionBindings = collectProductionBindings(snapshot);
    const characterBindings = normalizeNarrativeCharacterBindings(
      snapshot.charactersYaml,
    ).characters;

    diagnostics.push(...validateRuntimeGraph(snapshot));
    diagnostics.push(...validateConditions(snapshot));
    diagnostics.push(...validateAssets(assets));
    diagnostics.push(...validateProductionBindings(productionBindings));

    const hasAssetValidationError = diagnostics.some(isAssetValidationBlockingDiagnostic);
    const assetPlan = hasAssetValidationError
      ? {
          packagedAssets: dedupeAssets(assets).map((asset, index) =>
            toPackagedAsset(asset, index, {}),
          ),
          resolvedByOutputPath: new Map<string, AssetResolvePair>(),
        }
      : await this.resolveAssets(assets, diagnostics);

    const story: NarrativeExportStoryData = {
      version: 1,
      graph: snapshot,
      scenes,
      characterBindings,
      assets: assetPlan.packagedAssets,
    };

    const artifacts = await this.createArtifacts(story, assetPlan, diagnostics);
    return {
      ok: diagnostics.every((diagnostic) => diagnostic.severity !== 'error'),
      diagnostics,
      artifacts,
      story,
    };
  }

  private async loadScenes(
    snapshot: NarrativeGraphSnapshot,
    diagnostics: NarrativeExportDiagnostic[],
  ): Promise<Readonly<Record<string, FountainPlayScene>>> {
    const scenes: Record<string, FountainPlayScene> = {};
    for (const node of snapshot.nodes) {
      if (node.type !== 'narrative-scene') continue;
      const sceneRef = node.scene?.sceneRef;
      if (!sceneRef) {
        diagnostics.push({
          code: 'export-missing-scene-ref',
          severity: 'error',
          message: 'Narrative scene nodes must reference a standard .fountain file.',
          nodeId: node.nodeId,
        });
        continue;
      }
      if (scenes[sceneRef]) continue;

      const scene = await loadFountainPlayScene(sceneRef, {
        charactersYaml: snapshot.charactersYaml,
        readFile: (sourceRef) => this.readSceneContent(snapshot, sourceRef),
      });
      scenes[sceneRef] = scene;
      for (const diagnostic of scene.diagnostics) {
        if (diagnostic.severity !== 'error') continue;
        diagnostics.push({
          code: 'export-scene-unavailable',
          severity: 'error',
          message: diagnostic.message,
          nodeId: node.nodeId,
          path: diagnostic.path ?? sceneRef,
        });
      }
    }
    return scenes;
  }

  private async readSceneContent(
    snapshot: NarrativeGraphSnapshot,
    sceneRef: string,
  ): Promise<string | undefined> {
    const inSnapshot = readSceneContentFromSnapshot(snapshot, sceneRef);
    if (inSnapshot !== undefined) return inSnapshot;
    return this.options.readScene?.(sceneRef);
  }

  private async resolveAssets(
    assets: readonly CollectedAsset[],
    diagnostics: NarrativeExportDiagnostic[],
  ): Promise<AssetResolvePlan> {
    const uniqueAssets = dedupeAssets(assets);
    if (uniqueAssets.length > 0 && uniqueAssets.some((asset) => !this.canResolveAsset(asset))) {
      diagnostics.push({
        code: 'export-asset-resolver-missing',
        severity: 'error',
        message:
          'Narrative export requires an asset resolver or content access resolver for durable media refs.',
      });
      return {
        packagedAssets: uniqueAssets.map((asset, index) => toPackagedAsset(asset, index, {})),
        resolvedByOutputPath: new Map(),
      };
    }

    const packagedAssets: NarrativePackagedAsset[] = [];
    const resolvedByOutputPath = new Map<string, AssetResolvePair>();
    for (let index = 0; index < uniqueAssets.length; index += 1) {
      const asset = uniqueAssets[index];
      if (!asset) continue;
      const resolved = await this.resolveAssetPair(asset);
      const packaged = toPackagedAsset(asset, index, resolved);
      packagedAssets.push(packaged);
      resolvedByOutputPath.set(packaged.outputPath, resolved);

      reportAssetResolveDiagnostics(asset, resolved, diagnostics);
    }
    return { packagedAssets, resolvedByOutputPath };
  }

  private canResolveAsset(asset: CollectedAsset): boolean {
    if (asset.source === 'narrative-asset') return Boolean(this.options.assetResolver);
    return Boolean(
      this.options.contentAccessResolver ||
      (this.options.assetResolver && productionBindingToNarrativeAssetRef(asset.binding)),
    );
  }

  private async resolveAssetPair(asset: CollectedAsset): Promise<AssetResolvePair> {
    if (asset.source === 'production-binding' && this.options.contentAccessResolver) {
      return this.resolveProductionBindingPair(asset.binding);
    }

    const ref =
      asset.source === 'narrative-asset'
        ? asset.ref
        : productionBindingToNarrativeAssetRef(asset.binding);
    if (!ref || !this.options.assetResolver) return {};
    const [finalExportResult, packageResult] = await Promise.all([
      resolveAsset(this.options.assetResolver, ref, 'final-export'),
      resolveAsset(this.options.assetResolver, ref, 'package'),
    ]);
    return { finalExportResult, packageResult };
  }

  private async resolveProductionBindingPair(
    binding: NarrativeProductionBinding,
  ): Promise<AssetResolvePair> {
    const resolver = this.options.contentAccessResolver;
    if (!resolver) return {};
    const [finalExportResult, packageResult] = await Promise.all([
      resolveProductionBinding(resolver, binding, 'final-export'),
      resolveProductionBinding(resolver, binding, 'package'),
    ]);
    return {
      ...(finalExportResult ? { finalExportResult } : {}),
      ...(packageResult ? { packageResult } : {}),
    };
  }

  private async createArtifacts(
    story: NarrativeExportStoryData,
    assetPlan: AssetResolvePlan,
    diagnostics: NarrativeExportDiagnostic[],
  ): Promise<readonly NarrativeExportArtifact[]> {
    const artifacts: NarrativeExportArtifact[] = [
      {
        path: INDEX_HTML_PATH,
        kind: 'html',
        mimeType: 'text/html',
        content: createIndexHtml(),
      },
      {
        path: STORY_DATA_PATH,
        kind: 'data',
        mimeType: 'application/json',
        content: JSON.stringify(story, null, 2),
      },
      {
        path: HTML5_RUNTIME_BUNDLE_PATH,
        kind: 'runtime',
        mimeType: 'application/javascript',
        content: this.options.runtimeBundle ?? createHtml5RuntimeBundle(),
      },
      {
        path: HTML5_RENDERER_BUNDLE_PATH,
        kind: 'renderer',
        mimeType: 'application/javascript',
        content: this.options.rendererBundle ?? createHtml5RendererBundle(),
      },
    ];

    for (const asset of assetPlan.packagedAssets) {
      const pair = assetPlan.resolvedByOutputPath.get(asset.outputPath);
      const copied = await this.options.copyAsset?.({
        ref: asset.ref,
        outputPath: asset.outputPath,
        finalExportResult: pair?.finalExportResult,
        packageResult: pair?.packageResult,
      });
      const content = copied ?? readPackagedBytes(pair?.packageResult);
      if (content !== undefined) {
        artifacts.push({
          path: asset.outputPath,
          kind: 'asset',
          mimeType: asset.mimeType,
          content,
        });
      }
    }

    if (
      assetPlan.packagedAssets.length > 0 &&
      !artifacts.some((artifact) => artifact.kind === 'asset')
    ) {
      diagnostics.push({
        code: 'export-asset-package-failed',
        severity: 'warning',
        message: 'No binary asset artifacts were produced by the export asset adapter.',
      });
    }

    return artifacts;
  }
}

async function resolveAsset(
  resolver: NarrativeAssetResolver,
  ref: NarrativeAssetRef,
  intent: ContentAccessIntent,
): Promise<NarrativeAssetResolveResult> {
  return resolver.resolve(ref, intent, {
    target: 'local-path',
    role: 'source',
    metadata: { caller: 'neko-story:narrative-export' },
  });
}

async function resolveProductionBinding(
  resolver: NarrativeExportContentAccessResolver,
  binding: NarrativeProductionBinding,
  intent: ContentAccessIntent,
): Promise<ContentAccessResult | undefined> {
  const request = createNarrativeProductionBindingContentAccessRequest(binding, {
    intent,
    target: intent === 'package' ? 'bytes' : 'local-path',
    caller: 'neko-story:narrative-export',
  });
  return request ? resolver.resolve(request) : undefined;
}

function validateRuntimeGraph(
  snapshot: NarrativeGraphSnapshot,
): readonly NarrativeExportDiagnostic[] {
  const runtime = new NarrativeRuntime();
  const state = runtime.load(snapshot);
  const started = runtime.start();
  const diagnostics: NarrativeExportDiagnostic[] = [];

  if (state.graph?.nodes.length === 0 || started.status === 'error') {
    diagnostics.push({
      code: 'export-no-entry',
      severity: 'error',
      message: 'Narrative export requires a playable runtime entry node.',
    });
  }

  if (!snapshot.nodes.some((node) => node.type === 'narrative-ending')) {
    diagnostics.push({
      code: 'export-missing-ending',
      severity: 'error',
      message: 'Narrative export requires at least one narrative-ending node.',
    });
  }

  return diagnostics;
}

function validateConditions(
  snapshot: NarrativeGraphSnapshot,
): readonly NarrativeExportDiagnostic[] {
  const evaluator = new WhitelistConditionEvaluator();
  const variables = createValidationVariables(snapshot);
  return snapshot.connections.flatMap((connection) => {
    const result = evaluator.evaluate(connection.condition, variables);
    if (result.status !== 'unsupported') return [];
    return [
      {
        code: 'export-unsupported-condition' as const,
        severity: 'error' as const,
        message: `Unsupported narrative condition: ${connection.condition ?? ''}`,
        connectionId: connection.connectionId,
      },
    ];
  });
}

function validateAssets(assets: readonly CollectedAsset[]): readonly NarrativeExportDiagnostic[] {
  const diagnostics: NarrativeExportDiagnostic[] = [];
  for (const asset of assets) {
    if (asset.source !== 'narrative-asset') continue;
    for (const assetDiagnostic of validateNarrativeAssetRef(asset.ref)) {
      diagnostics.push({
        code:
          assetDiagnostic.code === 'narrative-asset-runtime-ref'
            ? 'export-runtime-asset-ref'
            : assetDiagnostic.code === 'narrative-asset-absolute-path'
              ? 'export-non-portable-absolute-path'
              : 'export-invalid-asset-ref',
        severity: 'error',
        message: assetDiagnostic.message,
        nodeId: asset.nodeId,
        path: assetDiagnostic.path ?? asset.path,
        assetRef: asset.ref,
      });
    }
  }
  return diagnostics;
}

function validateProductionBindings(
  bindings: readonly CollectedProductionBinding[],
): readonly NarrativeExportDiagnostic[] {
  return bindings.flatMap((entry) =>
    validateNarrativeProductionBinding(entry.binding).map((diagnostic) => ({
      code: 'export-runtime-asset-ref' as const,
      severity: 'error' as const,
      message: diagnostic.message,
      nodeId: entry.nodeId,
      bindingId: entry.binding.bindingId,
    })),
  );
}

function collectAssets(
  snapshot: NarrativeGraphSnapshot,
  scenes: Readonly<Record<string, FountainPlayScene>>,
): readonly CollectedAsset[] {
  const assets: CollectedAsset[] = [];
  for (const node of snapshot.nodes) {
    assets.push(...collectNodeAssets(node));
    assets.push(...collectNodeProductionBindingAssets(node));
  }
  for (const scene of Object.values(scenes)) {
    for (const directive of scene.directives) {
      assets.push(...collectDirectiveAssets(directive));
    }
    for (const binding of Object.values(scene.characterBindings)) {
      assets.push(...collectCharacterBindingAssets(binding));
    }
    for (const binding of scene.backgroundBindings) {
      assets.push({ source: 'narrative-asset', ref: binding.ref, path: binding.ref.path });
    }
  }
  return assets;
}

function collectNodeAssets(node: NarrativeNodeSnapshot): readonly CollectedAsset[] {
  const assets: CollectedAsset[] = [];
  if (node.scene?.backgroundRef) {
    assets.push({
      source: 'narrative-asset',
      ref: node.scene.backgroundRef,
      nodeId: node.nodeId,
      path: assetRefPath(node.scene.backgroundRef),
    });
  }
  if (node.scene?.bgm) {
    assets.push({
      source: 'narrative-asset',
      ref: node.scene.bgm,
      nodeId: node.nodeId,
      path: assetRefPath(node.scene.bgm),
    });
  }
  for (const field of ['videoRef', 'posterRef'] as const) {
    const ref = readAssetRefFromUnknown(node.data[field]);
    if (ref) {
      assets.push({ source: 'narrative-asset', ref, nodeId: node.nodeId, path: assetRefPath(ref) });
    }
  }
  return assets;
}

function collectNodeProductionBindingAssets(
  node: NarrativeNodeSnapshot,
): readonly CollectedAsset[] {
  return (node.scene?.productionRefs ?? []).flatMap((binding) => {
    const ref = productionBindingToExportMediaRef(binding);
    return ref
      ? [
          {
            source: 'production-binding' as const,
            ref,
            binding,
            nodeId: node.nodeId,
            path: exportMediaRefPath(ref),
          },
        ]
      : [];
  });
}

function collectProductionBindings(
  snapshot: NarrativeGraphSnapshot,
): readonly CollectedProductionBinding[] {
  return snapshot.nodes.flatMap((node) =>
    (node.scene?.productionRefs ?? []).map((binding) => ({
      binding,
      nodeId: node.nodeId,
    })),
  );
}

function collectDirectiveAssets(directive: PlayDirective): readonly CollectedAsset[] {
  if (directive.type === 'scene-heading' && directive.backgroundRef) {
    return [
      {
        source: 'narrative-asset',
        ref: directive.backgroundRef,
        path: directive.backgroundRef.path,
      },
    ];
  }
  if (directive.type === 'dialogue' && directive.characterRef) {
    return collectCharacterBindingAssets(directive.characterRef);
  }
  return [];
}

function collectCharacterBindingAssets(binding: PlayCharacterBinding): readonly CollectedAsset[] {
  const assets: CollectedAsset[] = [];
  pushPlayAsset(assets, binding.portraitRef);
  pushPlayAsset(assets, binding.expressionRef);
  pushPlayAsset(assets, binding.voiceRef);
  pushPlayAsset(assets, binding.live2dRef);
  for (const ref of Object.values(binding.expressionRefs ?? {})) {
    pushPlayAsset(assets, ref);
  }
  for (const ref of Object.values(binding.motionRefs ?? {})) {
    pushPlayAsset(assets, ref);
  }
  return assets;
}

function pushPlayAsset(assets: CollectedAsset[], ref: PlayNarrativeAssetRef | undefined): void {
  if (ref) {
    assets.push({ source: 'narrative-asset', ref, path: ref.path });
  }
}

function readAssetRefFromUnknown(value: unknown): NarrativeAssetRef | undefined {
  if (isNarrativeAssetRef(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    return { kind: 'relative-path', path: value.trim() };
  }
  return undefined;
}

function dedupeAssets(assets: readonly CollectedAsset[]): readonly CollectedAsset[] {
  const result: CollectedAsset[] = [];
  const seen = new Set<string>();
  for (const asset of assets) {
    const key =
      asset.source === 'production-binding'
        ? `${asset.source}:${asset.binding.bindingId}:${JSON.stringify(asset.ref)}`
        : `${asset.source}:${JSON.stringify(asset.ref)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(asset);
  }
  return result;
}

function toPackagedAsset(
  asset: CollectedAsset,
  index: number,
  resolved: AssetResolvePair,
): NarrativePackagedAsset {
  const outputPath = `assets/media/${String(index + 1).padStart(3, '0')}-${assetOutputName(asset.ref)}`;
  return {
    id: `asset-${index + 1}`,
    ref: asset.ref,
    outputPath,
    finalExportStatus: resolved.finalExportResult?.status,
    packageStatus: resolved.packageResult?.status,
    mimeType: resolved.packageResult?.mimeType ?? resolved.finalExportResult?.mimeType,
    source: asset.source,
    ...(asset.source === 'production-binding'
      ? { productionBindingId: asset.binding.bindingId }
      : {}),
  };
}

function reportAssetResolveDiagnostics(
  asset: CollectedAsset,
  resolved: AssetResolvePair,
  diagnostics: NarrativeExportDiagnostic[],
): void {
  if (resolved.finalExportResult && resolved.finalExportResult.status !== 'ready') {
    diagnostics.push({
      code: 'export-missing-source-asset',
      severity: 'error',
      message: `Narrative asset is not available for final export: ${resolved.finalExportResult.status}`,
      nodeId: asset.nodeId,
      path: asset.path,
      assetRef: asset.ref,
      ...(asset.source === 'production-binding' ? { bindingId: asset.binding.bindingId } : {}),
    });
  }
  if (resolved.packageResult && resolved.packageResult.status !== 'ready') {
    diagnostics.push({
      code: 'export-asset-package-failed',
      severity: 'error',
      message: `Narrative asset could not be packaged: ${resolved.packageResult.status}`,
      nodeId: asset.nodeId,
      path: asset.path,
      assetRef: asset.ref,
      ...(asset.source === 'production-binding' ? { bindingId: asset.binding.bindingId } : {}),
    });
  }
}

function isAssetValidationBlockingDiagnostic(diagnostic: NarrativeExportDiagnostic): boolean {
  return (
    diagnostic.code === 'export-invalid-asset-ref' ||
    diagnostic.code === 'export-runtime-asset-ref' ||
    diagnostic.code === 'export-non-portable-absolute-path'
  );
}

function productionBindingToExportMediaRef(
  binding: NarrativeProductionBinding,
): NarrativeExportMediaRef | undefined {
  const narrativeRef = productionBindingToNarrativeAssetRef(binding);
  if (narrativeRef) return narrativeRef;
  const request = createNarrativeProductionBindingContentAccessRequest(binding, {
    intent: 'package',
    target: 'bytes',
    caller: 'neko-story:narrative-export',
  });
  return request?.ref.kind === 'runtime' ? undefined : request?.ref;
}

function productionBindingToNarrativeAssetRef(
  binding: NarrativeProductionBinding,
): NarrativeAssetRef | undefined {
  const target = binding.target;
  if (target.kind !== 'asset') return undefined;
  const ref = target.ref;
  if (isNarrativeAssetRef(ref)) return ref;
  return undefined;
}

function readPackagedBytes(
  packageResult: NarrativeExportMediaResolveResult | undefined,
): Uint8Array | undefined {
  return isContentAccessResult(packageResult) ? packageResult.bytes : undefined;
}

function isContentAccessResult(
  value: NarrativeExportMediaResolveResult | undefined,
): value is ContentAccessResult {
  return Boolean(value && 'request' in value);
}

function readSceneContentFromSnapshot(
  snapshot: NarrativeGraphSnapshot,
  sceneRef: string,
): string | undefined {
  const sceneContents = snapshot.sceneContents;
  if (!sceneContents) return undefined;
  return (
    sceneContents[sceneRef] ??
    sceneContents[stripDotSlash(sceneRef)] ??
    sceneContents[`./${stripDotSlash(sceneRef)}`]
  );
}

function createValidationVariables(
  snapshot: NarrativeGraphSnapshot,
): Readonly<Record<string, string | number | boolean | null>> {
  const variables: Record<string, string | number | boolean | null> = {};
  for (const variable of snapshot.metadata.variables ?? []) {
    if (typeof variable.value === 'string') {
      variables[variable.name] = SUPPORTED_CONDITION_VARIABLE_PLACEHOLDER.string;
    } else if (typeof variable.value === 'number') {
      variables[variable.name] = SUPPORTED_CONDITION_VARIABLE_PLACEHOLDER.number;
    } else if (typeof variable.value === 'boolean') {
      variables[variable.name] = SUPPORTED_CONDITION_VARIABLE_PLACEHOLDER.boolean;
    } else {
      variables[variable.name] = SUPPORTED_CONDITION_VARIABLE_PLACEHOLDER.null;
    }
  }
  return variables;
}

function createIndexHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Neko Interactive Narrative</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; background: Canvas; color: CanvasText; }
    main { min-height: 100vh; display: grid; place-items: center; padding: 24px; box-sizing: border-box; }
    .neko-narrative-scene { width: min(760px, 100%); display: flex; flex-direction: column; gap: 16px; }
    .neko-narrative-body { display: flex; flex-direction: column; gap: 10px; line-height: 1.6; }
    .heading { font-weight: 700; letter-spacing: 0; }
    .dialogue { padding-left: 16px; border-left: 3px solid currentColor; }
    .neko-narrative-choices { display: flex; flex-direction: column; gap: 8px; }
    button { font: inherit; padding: 10px 12px; text-align: left; border: 1px solid color-mix(in srgb, CanvasText 30%, transparent); background: Canvas; color: CanvasText; border-radius: 6px; }
    button:disabled { opacity: 0.45; }
  </style>
</head>
<body>
  <main id="app">Loading...</main>
  <script src="./${HTML5_RUNTIME_BUNDLE_PATH}"></script>
  <script src="./${HTML5_RENDERER_BUNDLE_PATH}"></script>
  <script>
    fetch('./${STORY_DATA_PATH}')
      .then((response) => response.json())
      .then((story) => {
        const runtime = globalThis.NekoNarrativeRuntime.createRuntime(story.graph);
        runtime.start();
        globalThis.NekoNarrativeRenderer.render(document.getElementById('app'), runtime, story);
      });
  </script>
</body>
</html>`;
}

function assetOutputName(ref: NarrativeExportMediaRef): string {
  const source = exportMediaRefPath(ref) ?? exportMediaRefId(ref) ?? 'asset';
  const base = source.split(/[\\/]/).filter(Boolean).pop() ?? 'asset';
  const sanitized = base.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return sanitized.length > 0 ? sanitized : 'asset';
}

function assetRefPath(ref: NarrativeAssetRef): string | undefined {
  if ('path' in ref) return ref.path;
  if (ref.source.projectRelativePath) return ref.source.projectRelativePath;
  if (ref.source.filePath) return ref.source.filePath;
  return ref.locator?.kind === 'file' ? ref.locator.path : undefined;
}

function exportMediaRefPath(ref: NarrativeExportMediaRef): string | undefined {
  if (isNarrativeAssetRef(ref)) return assetRefPath(ref);
  if (isResourceRef(ref)) return assetRefPath(ref);
  switch (ref.kind) {
    case 'document':
      return ref.entryPath ?? (ref.locator?.kind === 'file' ? ref.locator.path : undefined);
    case 'asset':
      return ref.sourcePath;
    case 'file':
      return ref.path;
    case 'media-library':
      return ref.path ?? ref.assetId;
    case 'generated-asset':
      return ref.path ?? ref.assetId;
  }
}

function exportMediaRefId(ref: NarrativeExportMediaRef): string | undefined {
  if (isResourceRef(ref)) return ref.id;
  if (isNarrativeAssetRef(ref)) return undefined;
  switch (ref.kind) {
    case 'asset':
      return ref.assetId;
    case 'media-library':
      return ref.assetId ?? ref.libraryId;
    case 'generated-asset':
      return ref.assetId;
    case 'document':
    case 'file':
      return undefined;
  }
}

function stripDotSlash(value: string): string {
  return value.replace(/^\.\//, '');
}
