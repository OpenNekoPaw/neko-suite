import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type * as vscode from 'vscode';
import {
  createResourceVariantKey,
  getResourcePathCategory,
  isResourceCacheManifest,
  isManagedCachePathCategory,
  type ResourceCacheEntry,
  type ResourceCacheManifest,
  type ResourceCacheQuotaPolicy,
  type ResourceCacheSettings,
  type ResourceCacheStats,
  type ResourceCacheStatus,
  type ResourceCacheVariantEntry,
  type ResourceFingerprint,
  type ResourceRef,
  type ResourceVariantRef,
  type ResourceVariantRequest,
} from '../../types/resource-cache';
import type {
  LocalResourceAccessService,
  LocalResourceProjectionOptions,
  LocalResourceProjectionResult,
} from './local-resource-access';

export interface ResourceCacheLogger {
  warn(message: string, meta?: Record<string, unknown>): void;
  error?(message: string, meta?: Record<string, unknown>): void;
}

export interface ResourceCacheFsOps {
  readFile(filePath: string, encoding: 'utf-8'): Promise<string>;
  writeFile(filePath: string, content: string, encoding: 'utf-8'): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  mkdir(filePath: string, options: { recursive: boolean }): Promise<void>;
  stat(filePath: string): Promise<{ readonly size: number; readonly mtimeMs?: number }>;
  rm(filePath: string, options: { force: boolean }): Promise<void>;
}

export interface ResourceCacheManifestStore {
  load(options?: ResourceCacheManifestLoadOptions): Promise<ResourceCacheManifest>;
  save(manifest: ResourceCacheManifest): Promise<void>;
  update(
    operation: (
      manifest: ResourceCacheManifest,
    ) => ResourceCacheManifest | Promise<ResourceCacheManifest>,
  ): Promise<ResourceCacheManifest>;
  invalidateCache(): void;
}

export interface ResourceCacheManifestLoadOptions {
  readonly refresh?: boolean;
}

export interface ResourceEnsureInput {
  readonly ref: ResourceRef;
  readonly variant: ResourceVariantRequest;
  readonly cacheRoot: string;
  readonly signal?: AbortSignal;
}

export interface ResourceEnsureResult {
  readonly status: ResourceCacheStatus;
  readonly ref: ResourceRef;
  readonly variant: ResourceVariantRequest;
  readonly absolutePath?: string;
  readonly relativePath?: string;
  readonly mimeType?: string;
  readonly width?: number;
  readonly height?: number;
  readonly sizeBytes?: number;
  readonly rebuildable?: boolean;
  readonly error?: string;
}

export interface ResourceProbeResult {
  readonly status: ResourceCacheStatus;
  readonly absolutePath?: string;
  readonly relativePath?: string;
  readonly sizeBytes?: number;
  readonly error?: string;
}

export interface ResourceCacheProvider {
  readonly id: string;
  supports(ref: ResourceRef, variant: ResourceVariantRequest): boolean;
  ensure(input: ResourceEnsureInput): Promise<ResourceEnsureResult>;
  probe?(ref: ResourceRef): Promise<ResourceProbeResult>;
  invalidate?(ref: ResourceRef): Promise<void>;
}

export interface ResourceCacheService {
  registerProvider(provider: ResourceCacheProvider): void;
  ensure(
    ref: ResourceRef,
    variant: ResourceVariantRequest,
    options?: ResourceCacheOperationOptions,
  ): Promise<ResourceCacheOperationResult>;
  resolve(
    ref: ResourceRef,
    variant: ResourceVariantRequest,
    options?: ResourceCacheOperationOptions,
  ): Promise<ResourceCacheOperationResult>;
  project(
    webview: vscode.Webview,
    ref: ResourceRef,
    variant: ResourceVariantRequest,
    options?: ResourceCacheProjectOptions,
  ): Promise<ResourceCacheProjectResult>;
  invalidate(ref: ResourceRef): Promise<void>;
  invalidateManifestCache(): void;
  stats(): Promise<ResourceCacheStats>;
  gc(policy: ResourceCacheQuotaPolicy): Promise<ResourceCacheGcResult>;
}

export interface ResourceCacheOperationOptions {
  readonly materializeIfMissing?: boolean;
  readonly signal?: AbortSignal;
}

export interface ResourceCacheProjectOptions extends ResourceCacheOperationOptions {
  readonly projection?: LocalResourceProjectionOptions;
}

export interface ResourceCacheOperationResult {
  readonly status: ResourceCacheStatus;
  readonly ref: ResourceRef;
  readonly variant: ResourceVariantRef;
  readonly absolutePath?: string;
  readonly relativePath?: string;
  readonly entry?: ResourceCacheEntry;
  readonly variantEntry?: ResourceCacheVariantEntry;
  readonly error?: string;
}

export interface ResourceCacheProjectResult extends ResourceCacheOperationResult {
  readonly uri?: string;
  readonly projection?: LocalResourceProjectionResult;
}

export interface ResourceCacheGcResult {
  readonly removedCount: number;
  readonly removedBytes: number;
  readonly skippedCount: number;
  readonly skippedReasons: Record<string, number>;
}

export interface JsonResourceCacheManifestStoreOptions {
  readonly manifestPath: string;
  readonly projectRoot?: string;
  readonly fsOps?: ResourceCacheFsOps;
  readonly now?: () => string;
}

export interface VSCodeResourceCacheServiceOptions {
  readonly cacheRoot: string;
  readonly manifestPath: string;
  readonly projectRoot?: string;
  readonly globalRoot?: string;
  readonly extensionPrivateRoot?: string;
  readonly localResourceAccess: LocalResourceAccessService;
  readonly providers?: readonly ResourceCacheProvider[];
  readonly fsOps?: ResourceCacheFsOps;
  readonly now?: () => string;
  readonly logger?: ResourceCacheLogger;
  readonly maxConcurrentEnsures?: number;
  readonly touchFlushIntervalMs?: number;
  readonly clockMs?: () => number;
}

const DEFAULT_MAX_CONCURRENT_ENSURES = 4;
const DEFAULT_TOUCH_FLUSH_INTERVAL_MS = 60_000;

export class JsonResourceCacheManifestStore implements ResourceCacheManifestStore {
  private readonly manifestPath: string;
  private readonly projectRoot?: string;
  private readonly fsOps: ResourceCacheFsOps;
  private readonly now: () => string;
  private writeChain: Promise<void> = Promise.resolve();
  private cachedManifest: ResourceCacheManifest | undefined;
  private cachedManifestMtimeMs: number | undefined;

  constructor(options: JsonResourceCacheManifestStoreOptions) {
    this.manifestPath = options.manifestPath;
    this.projectRoot = options.projectRoot;
    this.fsOps = options.fsOps ?? nodeFsOps;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async load(options: ResourceCacheManifestLoadOptions = {}): Promise<ResourceCacheManifest> {
    if (options.refresh) {
      this.invalidateCache();
    }

    if (this.cachedManifest && (await this.isCachedManifestCurrent())) {
      return this.cachedManifest;
    }

    try {
      const raw = await this.fsOps.readFile(this.manifestPath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      if (isResourceCacheManifest(parsed)) {
        this.cachedManifest = parsed;
        this.cachedManifestMtimeMs = await this.readManifestMtimeMs();
        return parsed;
      }
    } catch {
      // Missing or invalid manifests are rebuildable cache misses.
    }

    const manifest = createEmptyManifest(this.now(), this.projectRoot);
    this.cachedManifest = manifest;
    return manifest;
  }

  async save(manifest: ResourceCacheManifest): Promise<void> {
    const next = this.writeChain.catch(() => undefined).then(() => this.saveUnlocked(manifest));
    this.writeChain = next.then(
      () => undefined,
      () => undefined,
    );
    await next;
  }

  async update(
    operation: (
      manifest: ResourceCacheManifest,
    ) => ResourceCacheManifest | Promise<ResourceCacheManifest>,
  ): Promise<ResourceCacheManifest> {
    let updated: ResourceCacheManifest | undefined;
    const updateOperation = async () => {
      const current = await this.load();
      const next = await operation(current);
      if (next === current) {
        updated = current;
        return;
      }
      await this.saveUnlocked(next);
      updated = next;
    };

    const next = this.writeChain.catch(() => undefined).then(updateOperation);
    this.writeChain = next.then(
      () => undefined,
      () => undefined,
    );
    await next;
    return updated ?? this.load();
  }

  invalidateCache(): void {
    this.cachedManifest = undefined;
    this.cachedManifestMtimeMs = undefined;
  }

  private async saveUnlocked(manifest: ResourceCacheManifest): Promise<void> {
    await this.fsOps.mkdir(path.dirname(this.manifestPath), { recursive: true });
    const tmpPath = `${this.manifestPath}.tmp`;
    await this.fsOps.writeFile(tmpPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
    await this.fsOps.rename(tmpPath, this.manifestPath);
    this.cachedManifest = manifest;
    this.cachedManifestMtimeMs = await this.readManifestMtimeMs();
  }

  private async isCachedManifestCurrent(): Promise<boolean> {
    if (this.cachedManifestMtimeMs === undefined) {
      return false;
    }
    return (await this.readManifestMtimeMs()) === this.cachedManifestMtimeMs;
  }

  private async readManifestMtimeMs(): Promise<number | undefined> {
    try {
      return (await this.fsOps.stat(this.manifestPath)).mtimeMs;
    } catch {
      return undefined;
    }
  }
}

export class VSCodeResourceCacheService implements ResourceCacheService {
  private readonly cacheRoot: string;
  private readonly projectRoot?: string;
  private readonly globalRoot?: string;
  private readonly extensionPrivateRoot?: string;
  private readonly localResourceAccess: LocalResourceAccessService;
  private readonly store: ResourceCacheManifestStore;
  private readonly providers = new Map<string, ResourceCacheProvider>();
  private readonly providerOrder: ResourceCacheProvider[] = [];
  private readonly fsOps: ResourceCacheFsOps;
  private readonly now: () => string;
  private readonly logger?: ResourceCacheLogger;
  private readonly maxConcurrentEnsures: number;
  private readonly touchFlushIntervalMs: number;
  private readonly clockMs: () => number;
  private readonly inFlightEnsures = new Map<string, Promise<ResourceCacheOperationResult>>();
  private readonly pendingTouches = new Map<
    string,
    { readonly resourceId: string; readonly variantKey: string }
  >();
  private readonly ensureQueue: Array<() => void> = [];
  private lastTouchFlushMs: number;
  private activeEnsures = 0;

  constructor(options: VSCodeResourceCacheServiceOptions) {
    this.cacheRoot = options.cacheRoot;
    this.projectRoot = options.projectRoot;
    this.globalRoot = options.globalRoot;
    this.extensionPrivateRoot = options.extensionPrivateRoot;
    this.localResourceAccess = options.localResourceAccess;
    this.fsOps = options.fsOps ?? nodeFsOps;
    this.now = options.now ?? (() => new Date().toISOString());
    this.logger = options.logger;
    this.maxConcurrentEnsures = options.maxConcurrentEnsures ?? DEFAULT_MAX_CONCURRENT_ENSURES;
    this.touchFlushIntervalMs = options.touchFlushIntervalMs ?? DEFAULT_TOUCH_FLUSH_INTERVAL_MS;
    this.clockMs = options.clockMs ?? (() => Date.now());
    this.lastTouchFlushMs = this.clockMs();
    this.store = new JsonResourceCacheManifestStore({
      manifestPath: options.manifestPath,
      projectRoot: options.projectRoot,
      fsOps: this.fsOps,
      now: this.now,
    });

    for (const provider of options.providers ?? []) {
      this.registerProvider(provider);
    }
  }

  registerProvider(provider: ResourceCacheProvider): void {
    const existingIndex = this.providerOrder.findIndex((candidate) => candidate.id === provider.id);
    if (existingIndex >= 0) {
      this.providerOrder[existingIndex] = provider;
    } else {
      this.providerOrder.push(provider);
    }
    this.providers.set(provider.id, provider);
  }

  async ensure(
    ref: ResourceRef,
    variant: ResourceVariantRequest,
    options: ResourceCacheOperationOptions = {},
  ): Promise<ResourceCacheOperationResult> {
    if (ref.scope === 'extension-private') {
      return this.createResult(ref, variant, 'non-portable', {
        error:
          'Resource is extension-private and must be displayed through its owning extension or re-materialized into project cache.',
      });
    }

    if (options.signal?.aborted) {
      return this.createResult(ref, variant, 'failed', { error: 'Operation aborted.' });
    }

    const key = createEnsureKey(ref, variant);
    const existing = this.inFlightEnsures.get(key);
    if (existing) {
      return existing;
    }

    const promise = this.withEnsureSlot(() => this.ensureUnlocked(ref, variant, options));
    this.inFlightEnsures.set(key, promise);
    try {
      return await promise;
    } finally {
      this.inFlightEnsures.delete(key);
    }
  }

  async resolve(
    ref: ResourceRef,
    variant: ResourceVariantRequest,
    options: ResourceCacheOperationOptions = {},
  ): Promise<ResourceCacheOperationResult> {
    if (ref.scope === 'extension-private') {
      return this.createResult(ref, variant, 'non-portable', {
        error:
          'Resource is extension-private and must be displayed through its owning extension or re-materialized into project cache.',
      });
    }

    const manifest = await this.store.load();
    const entry = manifest.entries[ref.id];
    const variantKey = createResourceVariantKey({ resource: ref, ...variant });
    const variantEntry = entry?.variants.find((candidate) => candidate.key === variantKey);
    const resolvedPath = variantEntry ? this.resolveVariantPath(variantEntry) : undefined;

    if (variantEntry?.status === 'ready' && resolvedPath) {
      if (!matchesSourceFingerprint(variantEntry.sourceFingerprint, ref.fingerprint)) {
        await this.markVariantStatus(
          ref,
          variant,
          'stale',
          'Cached artifact source fingerprint is stale.',
        );
        if (options.materializeIfMissing) {
          return this.ensure(ref, variant, options);
        }
        return this.createResult(ref, variant, 'stale', {
          entry,
          variantEntry,
          error: 'Cached artifact source fingerprint is stale.',
        });
      }

      if (await this.exists(resolvedPath)) {
        await this.touch(ref.id, variantKey);
        return this.createResult(ref, variant, 'ready', {
          entry,
          variantEntry,
          absolutePath: resolvedPath,
          relativePath: variantEntry.relativePath,
        });
      }

      await this.markVariantStatus(ref, variant, 'missing', 'Cached artifact is missing on disk.');
      if (options.materializeIfMissing) {
        return this.ensure(ref, variant, options);
      }
      return this.createResult(ref, variant, 'missing', {
        entry,
        variantEntry,
        error: 'Cached artifact is missing on disk.',
      });
    }

    if (options.materializeIfMissing) {
      return this.ensure(ref, variant, options);
    }

    return this.createResult(ref, variant, variantEntry?.status ?? 'missing', {
      entry,
      variantEntry,
      error: variantEntry?.error,
    });
  }

  async project(
    webview: vscode.Webview,
    ref: ResourceRef,
    variant: ResourceVariantRequest,
    options: ResourceCacheProjectOptions = {},
  ): Promise<ResourceCacheProjectResult> {
    if (ref.scope === 'extension-private') {
      return this.createResult(ref, variant, 'non-portable', {
        error:
          'Resource is extension-private and cannot be projected as a portable cross-package cache artifact.',
      });
    }

    const resolved = await this.resolve(ref, variant, {
      ...options,
      materializeIfMissing: options.materializeIfMissing ?? true,
    });

    if (resolved.status !== 'ready' || !resolved.absolutePath) {
      return { ...resolved };
    }

    const projection = await this.localResourceAccess.toWebviewUri(
      webview,
      resolved.absolutePath,
      options.projection,
    );
    if (!projection.ok) {
      return {
        ...resolved,
        status: projection.reason === 'unauthorized' ? 'unauthorized' : 'failed',
        projection,
        error: projection.message,
      };
    }

    return {
      ...resolved,
      uri: projection.uri,
      projection,
    };
  }

  async invalidate(ref: ResourceRef): Promise<void> {
    const provider = this.providers.get(ref.provider);
    await provider?.invalidate?.(ref);
    await this.flushTouches();

    await this.store.update((manifest) => {
      const entry = manifest.entries[ref.id];
      if (!entry) return manifest;
      const now = this.now();
      return {
        ...manifest,
        updatedAt: now,
        entries: {
          ...manifest.entries,
          [ref.id]: {
            ...entry,
            status: 'stale',
            updatedAt: now,
            variants: entry.variants.map((variant) => ({
              ...variant,
              status: variant.status === 'ready' ? 'stale' : variant.status,
              updatedAt: now,
            })),
          },
        },
      };
    });
  }

  invalidateManifestCache(): void {
    this.store.invalidateCache();
  }

  async stats(): Promise<ResourceCacheStats> {
    await this.flushTouches();
    return computeStats(await this.store.load());
  }

  async gc(policy: ResourceCacheQuotaPolicy): Promise<ResourceCacheGcResult> {
    await this.flushTouches();
    const manifest = await this.store.load();
    const maxBytes = policy.projectMaxBytes ?? policy.globalMaxBytes;
    if (maxBytes === undefined) {
      return { removedCount: 0, removedBytes: 0, skippedCount: 0, skippedReasons: {} };
    }

    let totalBytes = computeStats(manifest).totalSizeBytes;
    if (totalBytes <= maxBytes) {
      return { removedCount: 0, removedBytes: 0, skippedCount: 0, skippedReasons: {} };
    }

    const activeVariantKeys = new Set(policy.activeVariantKeys ?? []);
    const skippedReasons: Record<string, number> = {};
    const candidates = Object.values(manifest.entries)
      .flatMap((entry) =>
        entry.variants.map((variant) => ({
          entry,
          variant,
          path: this.resolveVariantPath(variant),
          sizeBytes: variant.sizeBytes ?? 0,
          lastAccessedAt: variant.lastAccessedAt ?? variant.updatedAt,
          cacheKey: `${entry.resource.id}:${variant.key}`,
        })),
      )
      .filter((candidate) => {
        const skipReason = this.gcSkipReason(candidate, {
          preservePinned: policy.preservePinned !== false,
          preserveSessionActive: policy.preserveSessionActive !== false,
          activeVariantKeys,
        });
        if (skipReason) {
          skippedReasons[skipReason] = (skippedReasons[skipReason] ?? 0) + 1;
          return false;
        }
        return true;
      })
      .sort((a, b) => a.lastAccessedAt.localeCompare(b.lastAccessedAt));

    let removedCount = 0;
    let removedBytes = 0;
    const removedKeys = new Set<string>();

    for (const candidate of candidates) {
      if (totalBytes <= maxBytes) break;
      await this.fsOps.rm(candidate.path!, { force: true });
      removedCount += 1;
      removedBytes += candidate.sizeBytes;
      totalBytes -= candidate.sizeBytes;
      removedKeys.add(`${candidate.entry.resource.id}:${candidate.variant.key}`);
    }

    if (removedKeys.size > 0) {
      await this.store.update((current) => {
        const now = this.now();
        const entries = Object.fromEntries(
          Object.entries(current.entries).map(([id, entry]) => [
            id,
            {
              ...entry,
              updatedAt: now,
              variants: entry.variants.map((variant) =>
                removedKeys.has(`${id}:${variant.key}`)
                  ? {
                      ...variant,
                      status: 'missing' as const,
                      updatedAt: now,
                      error: 'Evicted by resource cache garbage collection.',
                    }
                  : variant,
              ),
            },
          ]),
        );
        return {
          ...current,
          updatedAt: now,
          entries,
          stats: computeStats({ ...current, entries }),
        };
      });
    }

    const skippedCount = Object.values(skippedReasons).reduce((sum, count) => sum + count, 0);
    return { removedCount, removedBytes, skippedCount, skippedReasons };
  }

  private async ensureUnlocked(
    ref: ResourceRef,
    variant: ResourceVariantRequest,
    options: ResourceCacheOperationOptions,
  ): Promise<ResourceCacheOperationResult> {
    await this.markMaterializing(ref, variant);
    if (options.signal?.aborted) {
      return this.createResult(ref, variant, 'failed', { error: 'Operation aborted.' });
    }

    const provider = this.selectProvider(ref, variant);
    if (!provider) {
      await this.markVariantStatus(
        ref,
        variant,
        'unsupported',
        'No provider supports this variant.',
      );
      return this.createResult(ref, variant, 'unsupported', {
        error: 'No provider supports this variant.',
      });
    }

    try {
      const ensured = await provider.ensure({
        ref,
        variant,
        cacheRoot: this.cacheRoot,
        signal: options.signal,
      });
      await this.recordEnsureResult(ensured);
      return this.createResult(ref, variant, ensured.status, {
        absolutePath: ensured.absolutePath,
        relativePath: ensured.relativePath,
        error: ensured.error,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger?.warn('Resource cache provider failed', {
        provider: provider.id,
        error: message,
      });
      await this.markVariantStatus(ref, variant, 'failed', message);
      return this.createResult(ref, variant, 'failed', { error: message });
    }
  }

  private selectProvider(
    ref: ResourceRef,
    variant: ResourceVariantRequest,
  ): ResourceCacheProvider | undefined {
    return this.providerOrder.find((provider) => provider.supports(ref, variant));
  }

  private async recordEnsureResult(result: ResourceEnsureResult): Promise<void> {
    const variantKey = createResourceVariantKey({ resource: result.ref, ...result.variant });
    const now = this.now();
    const relativePath =
      result.relativePath ??
      (result.absolutePath ? path.relative(this.cacheRoot, result.absolutePath) : undefined);
    const absolutePath =
      result.absolutePath ?? (relativePath ? path.join(this.cacheRoot, relativePath) : undefined);
    const sizeBytes =
      result.sizeBytes ??
      (absolutePath && result.status === 'ready' ? await this.readSize(absolutePath) : undefined);

    await this.store.update((manifest) => {
      const previous = manifest.entries[result.ref.id];
      const previousVariants =
        previous?.variants.filter((variant) => variant.key !== variantKey) ?? [];
      const nextVariant: ResourceCacheVariantEntry = {
        key: variantKey,
        role: result.variant.role,
        status: result.status,
        ...(relativePath ? { relativePath } : {}),
        ...(absolutePath ? { absolutePath } : {}),
        ...(result.variant.format ? { format: result.variant.format } : {}),
        ...((result.mimeType ?? result.variant.mimeType)
          ? { mimeType: result.mimeType ?? result.variant.mimeType }
          : {}),
        ...((result.width ?? result.variant.width)
          ? { width: result.width ?? result.variant.width }
          : {}),
        ...((result.height ?? result.variant.height)
          ? { height: result.height ?? result.variant.height }
          : {}),
        ...(sizeBytes !== undefined ? { sizeBytes } : {}),
        sourceFingerprint: result.ref.fingerprint,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
        lastAccessedAt: result.status === 'ready' ? now : undefined,
        rebuildable: result.rebuildable ?? true,
        ...(result.error ? { error: result.error } : {}),
      };
      const nextEntry: ResourceCacheEntry = {
        resource: result.ref,
        status: result.status,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
        lastAccessedAt: result.status === 'ready' ? now : previous?.lastAccessedAt,
        variants: [...previousVariants, nextVariant],
        providerMetadata: previous?.providerMetadata,
      };
      const entries = { ...manifest.entries, [result.ref.id]: nextEntry };
      const nextManifest = { ...manifest, updatedAt: now, entries };
      return { ...nextManifest, stats: computeStats(nextManifest) };
    });
  }

  private async markMaterializing(
    ref: ResourceRef,
    variant: ResourceVariantRequest,
  ): Promise<void> {
    await this.markVariantStatus(ref, variant, 'materializing');
  }

  private async markVariantStatus(
    ref: ResourceRef,
    variant: ResourceVariantRequest,
    status: ResourceCacheStatus,
    error?: string,
  ): Promise<void> {
    const variantKey = createResourceVariantKey({ resource: ref, ...variant });
    const now = this.now();
    await this.store.update((manifest) => {
      const previous = manifest.entries[ref.id];
      const previousVariants =
        previous?.variants.filter((candidate) => candidate.key !== variantKey) ?? [];
      const nextVariant: ResourceCacheVariantEntry = {
        key: variantKey,
        role: variant.role,
        status,
        ...(variant.format ? { format: variant.format } : {}),
        ...(variant.mimeType ? { mimeType: variant.mimeType } : {}),
        ...(variant.width !== undefined ? { width: variant.width } : {}),
        ...(variant.height !== undefined ? { height: variant.height } : {}),
        createdAt: now,
        updatedAt: now,
        rebuildable: true,
        ...(error ? { error } : {}),
      };
      const nextEntry: ResourceCacheEntry = {
        resource: ref,
        status,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
        lastAccessedAt: previous?.lastAccessedAt,
        variants: [...previousVariants, nextVariant],
        providerMetadata: previous?.providerMetadata,
      };
      const entries = { ...manifest.entries, [ref.id]: nextEntry };
      const nextManifest = { ...manifest, updatedAt: now, entries };
      return { ...nextManifest, stats: computeStats(nextManifest) };
    });
  }

  private async touch(resourceId: string, variantKey: string): Promise<void> {
    this.pendingTouches.set(`${resourceId}:${variantKey}`, { resourceId, variantKey });
    const nowMs = this.clockMs();
    if (
      this.touchFlushIntervalMs <= 0 ||
      nowMs - this.lastTouchFlushMs >= this.touchFlushIntervalMs
    ) {
      await this.flushTouches();
    }
  }

  private async flushTouches(): Promise<void> {
    if (this.pendingTouches.size === 0) {
      return;
    }

    const touches = [...this.pendingTouches.values()];
    this.pendingTouches.clear();
    this.lastTouchFlushMs = this.clockMs();
    const now = this.now();
    try {
      await this.store.update((manifest) => {
        let changed = false;
        const entries = { ...manifest.entries };
        for (const touch of touches) {
          const entry = entries[touch.resourceId];
          if (!entry) continue;
          let entryChanged = false;
          const variants = entry.variants.map((variant) => {
            if (variant.key !== touch.variantKey) {
              return variant;
            }
            entryChanged = true;
            return { ...variant, lastAccessedAt: now };
          });
          if (!entryChanged) continue;
          changed = true;
          entries[touch.resourceId] = {
            ...entry,
            lastAccessedAt: now,
            variants,
          };
        }
        if (!changed) return manifest;
        return {
          ...manifest,
          updatedAt: now,
          entries,
          stats: computeStats({ ...manifest, entries }),
        };
      });
    } catch (error) {
      for (const touch of touches) {
        this.pendingTouches.set(`${touch.resourceId}:${touch.variantKey}`, touch);
      }
      throw error;
    }
  }

  private resolveVariantPath(variant: ResourceCacheVariantEntry): string | undefined {
    if (variant.absolutePath) return variant.absolutePath;
    if (variant.relativePath) return path.join(this.cacheRoot, variant.relativePath);
    return undefined;
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await this.fsOps.stat(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async readSize(filePath: string): Promise<number | undefined> {
    try {
      return (await this.fsOps.stat(filePath)).size;
    } catch {
      return undefined;
    }
  }

  private gcSkipReason(
    candidate: {
      readonly entry: ResourceCacheEntry;
      readonly variant: ResourceCacheVariantEntry;
      readonly path?: string;
      readonly cacheKey: string;
    },
    policy: {
      readonly preservePinned: boolean;
      readonly preserveSessionActive: boolean;
      readonly activeVariantKeys: ReadonlySet<string>;
    },
  ): string | undefined {
    if (!candidate.path) return 'missing-path';
    if (candidate.variant.rebuildable === false) return 'non-rebuildable';
    if (policy.preservePinned && candidate.variant.pinned) return 'pinned';
    if (policy.preserveSessionActive && policy.activeVariantKeys.has(candidate.cacheKey)) {
      return 'session-active';
    }

    const category = getResourcePathCategory(candidate.path, {
      projectRoot: this.projectRoot,
      globalRoot: this.globalRoot,
      extensionPrivateRoot: this.extensionPrivateRoot,
    });
    if (!isManagedCachePathCategory(category)) return `unsafe-${category}`;

    const normalizedPath = path.resolve(candidate.path);
    const normalizedCacheRoot = path.resolve(this.cacheRoot);
    if (!isPathInsideOrEqual(normalizedPath, normalizedCacheRoot)) {
      return 'outside-cache-root';
    }

    if (candidate.entry.resource.scope === 'project' && category !== 'project-cache') {
      return `scope-category-${category}`;
    }
    if (candidate.entry.resource.scope === 'global' && category !== 'global-cache') {
      return `scope-category-${category}`;
    }
    if (
      candidate.entry.resource.scope === 'extension-private' &&
      category !== 'extension-private-cache'
    ) {
      return `scope-category-${category}`;
    }

    return undefined;
  }

  private createResult(
    ref: ResourceRef,
    variant: ResourceVariantRequest,
    status: ResourceCacheStatus,
    extra: Partial<Omit<ResourceCacheOperationResult, 'ref' | 'variant' | 'status'>> = {},
  ): ResourceCacheOperationResult {
    return {
      status,
      ref,
      variant: {
        resource: ref,
        ...variant,
      },
      ...extra,
    };
  }

  private async withEnsureSlot<T>(operation: () => Promise<T>): Promise<T> {
    if (this.activeEnsures >= this.maxConcurrentEnsures) {
      await new Promise<void>((resolve) => {
        this.ensureQueue.push(resolve);
      });
    }

    this.activeEnsures += 1;
    try {
      return await operation();
    } finally {
      this.activeEnsures -= 1;
      this.ensureQueue.shift()?.();
    }
  }
}

export function computeStats(manifest: ResourceCacheManifest): ResourceCacheStats {
  let totalSizeBytes = 0;
  let variantCount = 0;
  let staleCount = 0;
  let missingCount = 0;
  let lastAccessedAt: string | undefined;
  const scopeBytes: Partial<Record<ResourceRef['scope'], number>> = {};
  const providerBytes: Record<string, number> = {};
  const statusCounts: Partial<Record<ResourceCacheStatus, number>> = {};
  const roleCounts: Partial<Record<ResourceVariantRequest['role'], number>> = {};
  const scopeEntryCounts: Partial<Record<ResourceRef['scope'], number>> = {};
  const providerEntryCounts: Record<string, number> = {};

  for (const entry of Object.values(manifest.entries)) {
    scopeEntryCounts[entry.resource.scope] = (scopeEntryCounts[entry.resource.scope] ?? 0) + 1;
    providerEntryCounts[entry.resource.provider] =
      (providerEntryCounts[entry.resource.provider] ?? 0) + 1;
    for (const variant of entry.variants) {
      variantCount += 1;
      const size = variant.sizeBytes ?? 0;
      totalSizeBytes += size;
      scopeBytes[entry.resource.scope] = (scopeBytes[entry.resource.scope] ?? 0) + size;
      providerBytes[entry.resource.provider] = (providerBytes[entry.resource.provider] ?? 0) + size;
      statusCounts[variant.status] = (statusCounts[variant.status] ?? 0) + 1;
      roleCounts[variant.role] = (roleCounts[variant.role] ?? 0) + 1;
      if (variant.status === 'stale') staleCount += 1;
      if (variant.status === 'missing') missingCount += 1;
      if (variant.lastAccessedAt && (!lastAccessedAt || variant.lastAccessedAt > lastAccessedAt)) {
        lastAccessedAt = variant.lastAccessedAt;
      }
    }
  }

  return {
    totalSizeBytes,
    entryCount: Object.keys(manifest.entries).length,
    variantCount,
    staleCount,
    missingCount,
    scopeBytes,
    providerBytes,
    statusCounts,
    roleCounts,
    scopeEntryCounts,
    providerEntryCounts,
    ...(lastAccessedAt ? { lastAccessedAt } : {}),
  };
}

export function resolveResourceCacheQuotaPolicy(
  settings: ResourceCacheSettings = {},
  activeVariantKeys: readonly string[] = [],
): ResourceCacheQuotaPolicy {
  return {
    ...(settings.projectMaxBytes !== undefined
      ? { projectMaxBytes: settings.projectMaxBytes }
      : {}),
    ...(settings.globalMaxBytes !== undefined ? { globalMaxBytes: settings.globalMaxBytes } : {}),
    ...(settings.minFreeDiskBytes !== undefined
      ? { minFreeDiskBytes: settings.minFreeDiskBytes }
      : {}),
    preservePinned: settings.preservePinned ?? true,
    preserveSessionActive: settings.preserveSessionActive ?? true,
    ...(activeVariantKeys.length > 0 ? { activeVariantKeys } : {}),
  };
}

function createEmptyManifest(now: string, projectRoot: string | undefined): ResourceCacheManifest {
  return {
    version: 1,
    ...(projectRoot ? { projectRoot } : {}),
    createdAt: now,
    updatedAt: now,
    entries: {},
  };
}

function createEnsureKey(ref: ResourceRef, variant: ResourceVariantRequest): string {
  return `${ref.id}:${createResourceVariantKey({ resource: ref, ...variant })}`;
}

function matchesSourceFingerprint(
  cached: ResourceFingerprint | undefined,
  current: ResourceFingerprint,
): boolean {
  if (!cached) return false;
  return (
    cached.strategy === current.strategy &&
    cached.value === current.value &&
    cached.providerId === current.providerId
  );
}

function isPathInsideOrEqual(filePath: string, rootPath: string): boolean {
  const relativePath = path.relative(rootPath, filePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

const nodeFsOps: ResourceCacheFsOps = {
  readFile: (filePath, encoding) => fs.readFile(filePath, encoding),
  writeFile: (filePath, content, encoding) => fs.writeFile(filePath, content, encoding),
  rename: (oldPath, newPath) => fs.rename(oldPath, newPath),
  mkdir: (filePath, options) => fs.mkdir(filePath, options).then(() => undefined),
  stat: async (filePath) => {
    const stat = await fs.stat(filePath);
    return { size: stat.size, mtimeMs: stat.mtimeMs };
  },
  rm: (filePath, options) => fs.rm(filePath, options),
};
