import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ResourceRef, ResourceVariantRequest } from '../../types/resource-cache';
import type {
  ResourceCacheProvider,
  ResourceEnsureInput,
  ResourceEnsureResult,
} from './resource-cache-service';

export const LEGACY_RESOURCE_CACHE_PROVIDER_ID = 'legacy-cache-path';

export interface LegacyResourceCacheProviderOptions {
  readonly fsOps?: LegacyResourceCacheFsOps;
}

export interface LegacyResourceCacheFsOps {
  copyFile(source: string, target: string): Promise<void>;
  mkdir(filePath: string, options: { recursive: boolean }): Promise<void>;
  stat(filePath: string): Promise<{ readonly size: number }>;
}

export class LegacyResourceCacheProvider implements ResourceCacheProvider {
  readonly id = LEGACY_RESOURCE_CACHE_PROVIDER_ID;

  private readonly fsOps: LegacyResourceCacheFsOps;

  constructor(options: LegacyResourceCacheProviderOptions = {}) {
    this.fsOps = options.fsOps ?? nodeFsOps;
  }

  supports(ref: ResourceRef, variant: ResourceVariantRequest): boolean {
    return (
      ref.scope === 'project' &&
      typeof readLegacyCachePath(ref) === 'string' &&
      (variant.role === 'document-entry' ||
        variant.role === 'thumbnail' ||
        variant.role === 'page-image' ||
        variant.role === 'preview')
    );
  }

  async ensure(input: ResourceEnsureInput): Promise<ResourceEnsureResult> {
    const legacyPath = readLegacyCachePath(input.ref);
    if (!legacyPath) {
      return {
        status: 'unsupported',
        ref: input.ref,
        variant: input.variant,
        error: 'Legacy cache path is not available for this resource.',
      };
    }

    try {
      const sourceStat = await this.fsOps.stat(legacyPath);
      const relativePath = createLegacyRelativePath(input.ref, input.variant, legacyPath);
      const targetPath = path.join(input.cacheRoot, relativePath);
      await this.fsOps.mkdir(path.dirname(targetPath), { recursive: true });
      await this.fsOps.copyFile(legacyPath, targetPath);
      const targetStat = await this.fsOps.stat(targetPath);
      return {
        status: 'ready',
        ref: input.ref,
        variant: input.variant,
        absolutePath: targetPath,
        relativePath,
        mimeType: input.variant.mimeType,
        width: input.variant.width,
        height: input.variant.height,
        sizeBytes: targetStat.size || sourceStat.size,
        rebuildable: true,
      };
    } catch (error) {
      return {
        status: 'missing',
        ref: input.ref,
        variant: input.variant,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export function readLegacyCachePath(ref: ResourceRef): string | undefined {
  const value = ref.source.metadata?.['legacyCachePath'];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function createLegacyRelativePath(
  ref: ResourceRef,
  variant: ResourceVariantRequest,
  sourcePath: string,
): string {
  const ext = path.extname(sourcePath) || (variant.mimeType === 'image/png' ? '.png' : '.bin');
  const basename = sanitizePathPart(path.basename(sourcePath, path.extname(sourcePath)) || ref.id);
  return path.join('legacy', ref.provider, ref.id, `${basename}${ext}`);
}

function sanitizePathPart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'resource';
}

const nodeFsOps: LegacyResourceCacheFsOps = {
  copyFile: (source, target) => fs.copyFile(source, target),
  mkdir: (filePath, options) => fs.mkdir(filePath, options).then(() => undefined),
  stat: async (filePath) => {
    const stat = await fs.stat(filePath);
    return { size: stat.size };
  },
};
