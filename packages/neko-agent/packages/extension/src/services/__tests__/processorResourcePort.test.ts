import { describe, expect, it, vi } from 'vitest';
import { createResourceFingerprint, createResourceRef, type ResourceRef } from '@neko/shared';
import type {
  ResourceCacheOperationResult,
  ResourceCacheService,
  ResourceVariantRequest,
} from '@neko/shared/vscode/extension';
import { createProcessorResourcePort } from '../processorResourcePort';

describe('ProcessorResourcePort extension binding', () => {
  it('routes retention and pin intents through ResourceCacheService lifecycle updates', async () => {
    const ref = createProcessorRef();
    const cache = createResourceCache(ref);
    const port = createProcessorResourcePort({ resourceCache: cache });
    const run = { processorRunId: 'run-1', stageId: 'stage-1', attempt: 1 };

    await port.setRetention({ resourceRef: ref, run, retentionHint: 'debug' });
    await port.pin({ resourceRef: ref, reason: 'approval', ownerId: 'agent' });
    await port.unpin({ resourceRef: ref, reason: 'approval-finished', ownerId: 'agent' });

    expect(cache.updateLifecycle).toHaveBeenNthCalledWith(1, {
      ref,
      variant: { role: 'preview' },
      retentionHint: 'debug',
      processorRunId: 'run-1',
      stageId: 'stage-1',
      attempt: 1,
    });
    expect(cache.updateLifecycle).toHaveBeenNthCalledWith(2, {
      ref,
      variant: { role: 'preview' },
      retentionHint: 'pinned',
      pinned: true,
      sessionActive: true,
      reason: 'approval',
      ownerId: 'agent',
    });
    expect(cache.updateLifecycle).toHaveBeenNthCalledWith(3, {
      ref,
      variant: { role: 'preview' },
      pinned: false,
      sessionActive: false,
      reason: 'approval-finished',
      ownerId: 'agent',
    });
  });

  it('marks promoted outputs through cache lifecycle and create-asset hook', async () => {
    const ref = createProcessorRef();
    const cache = createResourceCache(ref);
    const createAsset = vi.fn(async () => undefined);
    const port = createProcessorResourcePort({ resourceCache: cache, createAsset });
    const run = { processorRunId: 'run-1', stageId: 'stage-1', attempt: 1 };

    const status = await port.markPromoted({ resourceRef: ref, run, target: 'asset' });

    expect(createAsset).toHaveBeenCalledWith({ resourceRef: ref, run, target: 'asset' });
    expect(cache.updateLifecycle).toHaveBeenCalledWith({
      ref,
      variant: { role: 'preview' },
      retentionHint: 'promoted',
      promoted: true,
      promotedTarget: 'asset',
      processorRunId: 'run-1',
      stageId: 'stage-1',
      attempt: 1,
    });
    expect(status).toMatchObject({
      resourceRef: ref,
      retentionHint: 'promoted',
      status: 'ready',
    });
  });

  it('returns durable media-library source refs only from explicit promote hook', async () => {
    const ref = createProcessorRef();
    const cache = createResourceCache(ref);
    const createAsset = vi.fn(async () => ({
      kind: 'mediaLibrary' as const,
      mediaLibraryId: 'team',
      path: '${TEAM_MEDIA}/processed/result.png',
    }));
    const port = createProcessorResourcePort({ resourceCache: cache, createAsset });
    const run = { processorRunId: 'run-1', stageId: 'stage-1', attempt: 1 };

    const status = await port.markPromoted({ resourceRef: ref, run, target: 'mediaLibrary' });

    expect(createAsset).toHaveBeenCalledWith({ resourceRef: ref, run, target: 'mediaLibrary' });
    expect(status.promotedSourceRef).toEqual({
      kind: 'mediaLibrary',
      mediaLibraryId: 'team',
      path: '${TEAM_MEDIA}/processed/result.png',
    });
    expect(cache.updateLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        promoted: true,
        promotedTarget: 'mediaLibrary',
      }),
    );
  });

  it('reports missing resources without touching cache files directly', async () => {
    const ref = createProcessorRef();
    const cache = createResourceCache(ref, {
      resolveStatus: 'missing',
      error: 'Cache variant was evicted.',
    });
    const port = createProcessorResourcePort({ resourceCache: cache });

    await expect(port.getStatus(ref)).resolves.toMatchObject({
      resourceRef: ref,
      status: 'missing',
      diagnostics: [expect.objectContaining({ message: 'Cache variant was evicted.' })],
    });
    expect(cache.resolve).toHaveBeenCalledWith(ref, { role: 'preview' });
  });
});

function createProcessorRef(): ResourceRef {
  return createResourceRef({
    scope: 'project',
    provider: 'external-processor',
    kind: 'generated',
    source: {
      kind: 'file',
      projectRelativePath: 'external-processors/upscale/run-1/stage-1/attempt-1/result.png',
    },
    fingerprint: createResourceFingerprint({
      strategy: 'provider',
      providerId: 'external-processor',
      value: 'run-1:stage-1:image',
    }),
  });
}

function createResourceCache(
  ref: ResourceRef,
  options: {
    readonly resolveStatus?: ResourceCacheOperationResult['status'];
    readonly error?: string;
  } = {},
): ResourceCacheService {
  const variant: ResourceVariantRequest = { role: 'preview' };
  const operationResult: ResourceCacheOperationResult = {
    status: options.resolveStatus ?? 'ready',
    ref,
    variant: { resource: ref, ...variant },
    ...(options.error ? { error: options.error } : {}),
  };
  return {
    registerProvider: vi.fn(),
    findByLocalPath: vi.fn(),
    ensure: vi.fn(),
    resolve: vi.fn(async () => operationResult),
    record: vi.fn(),
    updateLifecycle: vi.fn(async () => operationResult),
    project: vi.fn(),
    invalidate: vi.fn(),
    invalidateManifestCache: vi.fn(),
    stats: vi.fn(),
    gc: vi.fn(),
  } as unknown as ResourceCacheService;
}
