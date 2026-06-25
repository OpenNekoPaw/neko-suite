import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AssetManifest } from '@neko/shared';
import {
  EXTERNAL_PROCESSOR_SCHEMA,
  EXTERNAL_PROCESSOR_SCHEMA_VERSION,
  type ExternalProcessorManifest,
} from '@neko-agent/types';
import { ProcessorInstallTarget } from './ProcessorInstallTarget';

describe('ProcessorInstallTarget', () => {
  it('validates processor packages and resolves the market install path', () => {
    const target = new ProcessorInstallTarget('/market/processors');
    const manifest = processorPackageManifest();

    expect(() => target.validateManifest(manifest)).not.toThrow();
    expect(target.getInstallPath(manifest)).toBe('/market/processors/studio/upscale');
  });

  it('rejects package metadata that cannot project to processor registry', () => {
    const target = new ProcessorInstallTarget('/market/processors');

    expect(() =>
      target.validateManifest(
        processorPackageManifest({
          typeMetadata: {
            type: 'processor',
            data: { processorManifestPath: '../escape.neko-processor.json' },
          },
        }),
      ),
    ).toThrow('processorManifestPath must stay inside');

    expect(() =>
      target.validateManifest(
        processorPackageManifest({
          distribution: {
            license: 'MIT',
            author: 'Studio',
            tags: ['processor'],
            checksum: 'sha256-test',
            publisherId: 'studio',
            trustLevel: 'core',
          },
        }),
      ),
    ).toThrow('cannot self-declare core trust');
  });

  it('validates installed processor manifest and refreshes registry after install', async () => {
    const refreshProcessors = vi.fn(async () => undefined);
    const target = new ProcessorInstallTarget('/market/processors', { refreshProcessors });
    const dir = await mkdtemp(join(tmpdir(), 'neko-processor-target-'));

    try {
      await writeFile(
        join(dir, 'processor.neko-processor.json'),
        JSON.stringify(externalProcessorManifest()),
        'utf-8',
      );

      await target.onPostInstall(processorPackageManifest(), dir);

      expect(refreshProcessors).toHaveBeenCalledTimes(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('blocks invalid installed processor manifest before registry refresh', async () => {
    const refreshProcessors = vi.fn(async () => undefined);
    const target = new ProcessorInstallTarget('/market/processors', { refreshProcessors });
    const dir = await mkdtemp(join(tmpdir(), 'neko-processor-target-'));

    try {
      await writeFile(
        join(dir, 'processor.neko-processor.json'),
        JSON.stringify({ ...externalProcessorManifest(), schemaVersion: 99 }),
        'utf-8',
      );

      await expect(target.onPostInstall(processorPackageManifest(), dir)).rejects.toThrow(
        'Invalid processor manifest',
      );
      expect(refreshProcessors).not.toHaveBeenCalled();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('unregisters the market processor package before uninstall', async () => {
    const unregisterProcessorPackage = vi.fn(async () => undefined);
    const target = new ProcessorInstallTarget('/market/processors', {
      unregisterProcessorPackage,
    });

    await target.onPreUninstall?.(processorPackageManifest(), '/market/processors/studio/upscale');

    expect(unregisterProcessorPackage).toHaveBeenCalledWith('@studio/upscale-processor');
  });
});

function processorPackageManifest(overrides: Partial<AssetManifest> = {}): AssetManifest {
  return {
    id: '@studio/upscale-processor',
    name: 'upscale',
    version: '1.0.0',
    type: 'processor',
    source: { kind: 'local', path: '/tmp/upscale' },
    distributionKind: 'archive',
    distribution: {
      license: 'MIT',
      author: 'Studio',
      tags: ['processor'],
      checksum: 'sha256-test',
      publisherId: 'studio',
      trustLevel: 'community',
    },
    typeMetadata: {
      type: 'processor',
      data: {
        processorManifestPath: 'processor.neko-processor.json',
        trustLevel: 'community',
      },
    },
    intent: {
      useCases: ['upscale-image'],
    },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function externalProcessorManifest(): ExternalProcessorManifest {
  return {
    schema: EXTERNAL_PROCESSOR_SCHEMA,
    schemaVersion: EXTERNAL_PROCESSOR_SCHEMA_VERSION,
    id: 'upscale-image',
    kind: 'external-processor',
    displayName: 'Upscale Image',
    version: '1.0.0',
    entry: {
      executable: '${TOOLS}/upscale',
      args: ['-i', '${input.image}', '-o', '${output.image}'],
    },
    inputs: {
      image: { accepts: ['image/*'], required: true },
    },
    outputs: {
      image: { produces: ['image/png'], root: 'resourceCache', pathHint: 'result.png' },
    },
    policy: {
      requiresApproval: true,
      allowNetwork: false,
      allowedInputRoots: ['workspace', 'mediaLibrary', 'resourceCache'],
      allowedOutputRoots: ['resourceCache'],
      timeoutMs: 120_000,
    },
  };
}
