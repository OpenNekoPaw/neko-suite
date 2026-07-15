import { createHash } from 'node:crypto';
import * as path from 'node:path';
import {
  CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION,
  validateCanvasGeneratedDraftPromotionRequest,
  validateCanvasGeneratedDraftPromotionResult,
  type CanvasGeneratedDraftGroupDiagnostic,
  type CanvasGeneratedDraftMediaKind,
  type CanvasGeneratedDraftPromotionItemResult,
  type CanvasGeneratedDraftPromotionResult,
  type CanvasPromotedAssetIdentity,
  type NekoAssetsGeneratedCandidatePromotionInput,
  type NekoAssetsGeneratedCandidateSource,
} from '@neko/shared';

export interface GeneratedCandidatePromotionFileSystem {
  readonly readFile: (filePath: string) => Promise<Uint8Array>;
  readonly writeFile: (filePath: string, data: Uint8Array) => Promise<void>;
  readonly createDirectory: (dirPath: string) => Promise<void>;
  readonly exists: (filePath: string) => Promise<boolean>;
}

export interface GeneratedCandidateAssetRegistration {
  readonly filePath: string;
  readonly source: NekoAssetsGeneratedCandidateSource;
  readonly projectionId: string;
}

export interface GeneratedCandidatePromotionServiceOptions {
  readonly assetFilesRoot: string;
  readonly fs: GeneratedCandidatePromotionFileSystem;
  readonly registerAsset: (
    input: GeneratedCandidateAssetRegistration,
  ) => Promise<CanvasPromotedAssetIdentity>;
}

export class GeneratedCandidatePromotionService {
  private readonly assetFilesRoot: string;
  private readonly fs: GeneratedCandidatePromotionFileSystem;
  private readonly registerAsset: GeneratedCandidatePromotionServiceOptions['registerAsset'];
  private readonly inFlight = new Map<string, Promise<CanvasPromotedAssetIdentity>>();
  private readonly completed = new Map<string, CanvasPromotedAssetIdentity>();

  constructor(options: GeneratedCandidatePromotionServiceOptions) {
    if (!path.isAbsolute(options.assetFilesRoot)) {
      throw new Error('Generated candidate Asset files root must be absolute.');
    }
    this.assetFilesRoot = path.resolve(options.assetFilesRoot);
    this.fs = options.fs;
    this.registerAsset = options.registerAsset;
  }

  async promote(
    input: NekoAssetsGeneratedCandidatePromotionInput,
  ): Promise<CanvasGeneratedDraftPromotionResult> {
    const requestDiagnostics = validateCanvasGeneratedDraftPromotionRequest(input.request);
    if (requestDiagnostics.length > 0) {
      throw new Error(
        formatContractDiagnostics(
          'Invalid generated candidate promotion request',
          requestDiagnostics,
        ),
      );
    }

    const sources = indexSources(input.sources);
    const items = await Promise.all(
      input.request.selections.map(
        async (selection): Promise<CanvasGeneratedDraftPromotionItemResult> => {
          const source = sources.get(selection.candidateId);
          if (!source) {
            return failedItem(
              selection.candidateId,
              'source-unavailable',
              'The selected generated candidate source is unavailable.',
            );
          }
          const sourceDiagnostic = validateSource(source, input.request.target.taskId);
          if (sourceDiagnostic) {
            return {
              candidateId: selection.candidateId,
              status: 'failed',
              diagnostic: sourceDiagnostic,
            };
          }
          if (
            source.revision !== selection.revision ||
            source.contentDigest !== selection.contentDigest
          ) {
            return failedItem(
              selection.candidateId,
              'content-changed',
              'The generated candidate changed after this Save to Assets request was created.',
            );
          }

          try {
            const asset = await this.promoteIdempotently(source, input.request.projectionId);
            return { candidateId: selection.candidateId, status: 'saved', asset };
          } catch (error) {
            const diagnostic = toPromotionDiagnostic(error);
            return { candidateId: selection.candidateId, status: 'failed', diagnostic };
          }
        },
      ),
    );

    const savedCount = items.filter((item) => item.status === 'saved').length;
    const result: CanvasGeneratedDraftPromotionResult = {
      version: CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION,
      requestId: input.request.requestId,
      projectionId: input.request.projectionId,
      status: savedCount === items.length ? 'saved' : savedCount === 0 ? 'failed' : 'partial',
      items,
    };
    const resultDiagnostics = validateCanvasGeneratedDraftPromotionResult(result);
    if (resultDiagnostics.length > 0) {
      throw new Error(
        formatContractDiagnostics(
          'Invalid generated candidate promotion result',
          resultDiagnostics,
        ),
      );
    }
    return result;
  }

  private async promoteIdempotently(
    source: NekoAssetsGeneratedCandidateSource,
    projectionId: string,
  ): Promise<CanvasPromotedAssetIdentity> {
    const key = `${source.candidateId}\u0000${source.revision}\u0000${source.contentDigest}`;
    const completed = this.completed.get(key);
    if (completed) return completed;
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const operation = this.promoteOne(source, projectionId)
      .then((asset) => {
        this.completed.set(key, asset);
        return asset;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });
    this.inFlight.set(key, operation);
    return operation;
  }

  private async promoteOne(
    source: NekoAssetsGeneratedCandidateSource,
    projectionId: string,
  ): Promise<CanvasPromotedAssetIdentity> {
    if (!path.isAbsolute(source.sourcePath)) {
      throw new CandidatePromotionError(
        'source-unavailable',
        'The generated candidate source is not a Host-resolved file.',
      );
    }

    let bytes: Uint8Array;
    try {
      bytes = await this.fs.readFile(source.sourcePath);
    } catch {
      throw new CandidatePromotionError(
        'source-unavailable',
        'The generated candidate bytes are no longer available.',
      );
    }
    const actualDigest = hashBytes(bytes);
    if (actualDigest !== source.contentDigest) {
      throw new CandidatePromotionError(
        'content-changed',
        'The generated candidate content no longer matches its recorded digest.',
      );
    }

    const destinationPath = this.destinationPath(source);
    await this.fs.createDirectory(path.dirname(destinationPath));
    if (await this.fs.exists(destinationPath)) {
      const existingDigest = hashBytes(await this.fs.readFile(destinationPath));
      if (existingDigest !== source.contentDigest) {
        throw new CandidatePromotionError(
          'asset-storage-failed',
          'The Asset destination already contains different content.',
        );
      }
    } else {
      await this.fs.writeFile(destinationPath, bytes);
    }

    return this.registerAsset({ filePath: destinationPath, source, projectionId });
  }

  private destinationPath(source: NekoAssetsGeneratedCandidateSource): string {
    const extension = resolveExtension(source.sourcePath, source.mimeType, source.mediaKind);
    const digestToken = source.contentDigest.replace(/^sha256:/, '').slice(0, 16);
    const baseName = sanitizeFileName(source.title) || 'generated-asset';
    const destination = path.resolve(
      this.assetFilesRoot,
      source.mediaKind,
      `${baseName}-${digestToken}${extension}`,
    );
    const relative = path.relative(this.assetFilesRoot, destination);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new CandidatePromotionError(
        'asset-storage-failed',
        'The generated Asset destination escaped the AssetLibrary root.',
      );
    }
    return destination;
  }
}

class CandidatePromotionError extends Error {
  constructor(
    readonly code: CanvasGeneratedDraftGroupDiagnostic['code'],
    message: string,
  ) {
    super(message);
    this.name = 'CandidatePromotionError';
  }
}

function indexSources(
  sources: readonly NekoAssetsGeneratedCandidateSource[],
): ReadonlyMap<string, NekoAssetsGeneratedCandidateSource> {
  const indexed = new Map<string, NekoAssetsGeneratedCandidateSource>();
  for (const source of sources) {
    if (indexed.has(source.candidateId)) {
      throw new Error(`Duplicate generated candidate source: ${source.candidateId}`);
    }
    indexed.set(source.candidateId, source);
  }
  return indexed;
}

function validateSource(
  source: NekoAssetsGeneratedCandidateSource,
  expectedTaskId: string | undefined,
): CanvasGeneratedDraftGroupDiagnostic | undefined {
  if (
    !source.title.trim() ||
    !source.mimeType.trim() ||
    !source.revision.trim() ||
    !source.taskId.trim()
  ) {
    return {
      code: 'source-unavailable',
      severity: 'error',
      message: 'Generated candidate source metadata is incomplete.',
    };
  }
  if (
    source.mediaKind !== 'image' &&
    source.mediaKind !== 'audio' &&
    source.mediaKind !== 'video'
  ) {
    return {
      code: 'source-unavailable',
      severity: 'error',
      message: 'Generated candidate media kind is unsupported.',
    };
  }
  if (!/^sha256:[a-f0-9]{64}$/i.test(source.contentDigest)) {
    return {
      code: 'content-changed',
      severity: 'error',
      message: 'Generated candidate content digest is invalid.',
    };
  }
  if (expectedTaskId && source.taskId !== expectedTaskId) {
    return {
      code: 'source-unavailable',
      severity: 'error',
      message: 'Generated candidate provenance does not match the frozen Board task.',
    };
  }
  return undefined;
}

function failedItem(
  candidateId: string,
  code: CanvasGeneratedDraftGroupDiagnostic['code'],
  message: string,
): CanvasGeneratedDraftPromotionItemResult {
  return {
    candidateId,
    status: 'failed',
    diagnostic: { code, severity: 'error', message },
  };
}

function toPromotionDiagnostic(error: unknown): CanvasGeneratedDraftGroupDiagnostic {
  if (error instanceof CandidatePromotionError) {
    return { code: error.code, severity: 'error', message: error.message };
  }
  return {
    code: 'asset-storage-failed',
    severity: 'error',
    message: 'AssetLibrary could not retain the generated candidate.',
  };
}

function hashBytes(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function sanitizeFileName(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80);
}

function resolveExtension(
  sourcePath: string,
  mimeType: string,
  mediaKind: CanvasGeneratedDraftMediaKind,
): string {
  const sourceExtension = path.extname(sourcePath).toLowerCase();
  if (/^\.[a-z0-9]{1,10}$/.test(sourceExtension)) return sourceExtension;
  const mimeExtension: Readonly<Record<string, string>> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'audio/wav': '.wav',
    'audio/mpeg': '.mp3',
    'audio/ogg': '.ogg',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
  };
  return mimeExtension[mimeType.toLowerCase()] ?? defaultExtension(mediaKind);
}

function defaultExtension(mediaKind: CanvasGeneratedDraftMediaKind): string {
  switch (mediaKind) {
    case 'image':
      return '.png';
    case 'audio':
      return '.wav';
    case 'video':
      return '.mp4';
  }
}

function formatContractDiagnostics(
  label: string,
  diagnostics: readonly CanvasGeneratedDraftGroupDiagnostic[],
): string {
  return `${label}: ${diagnostics.map((diagnostic) => diagnostic.code).join(', ')}`;
}
