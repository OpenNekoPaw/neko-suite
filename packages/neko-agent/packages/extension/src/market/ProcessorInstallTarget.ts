/**
 * ProcessorInstallTarget — contributed install target for Agent external processors.
 */

import * as os from 'node:os';
import * as path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { AssetManifest, IInstallTarget } from '@neko/shared';
import { resolveGlobalStorageLayout } from '@neko/shared';
import {
  parseExternalProcessorManifestJson,
  validateExternalProcessorManifest,
  type ExternalProcessorDiagnostic,
} from '@neko-agent/types';

const MARKET_PROCESSORS_BASE = resolveGlobalStorageLayout(os.homedir()).processors;

export interface ProcessorInstallTargetHost {
  refreshProcessors?(): Promise<void>;
  unregisterProcessorPackage?(packageId: string): Promise<void>;
}

export class ProcessorInstallTarget implements IInstallTarget<'processor'> {
  readonly type = 'processor' as const;

  constructor(
    private readonly processorsBaseDir: string = MARKET_PROCESSORS_BASE,
    private readonly host?: ProcessorInstallTargetHost,
  ) {}

  validateManifest(manifest: AssetManifest): void {
    if (manifest.type !== 'processor') {
      throw new Error(`ProcessorInstallTarget cannot install asset type: ${manifest.type}`);
    }
    if (manifest.typeMetadata?.type !== 'processor') {
      throw new Error('processor packages must include processor typeMetadata');
    }

    const metadata = manifest.typeMetadata.data;
    assertPackageRelativePath(metadata.processorManifestPath);
    if (manifest.distribution?.trustLevel === 'core') {
      throw new Error('Market processor packages cannot self-declare core trust');
    }
    if (metadata.revoked === true) {
      throw new Error(`Market processor package is revoked: ${manifest.id}`);
    }
  }

  getInstallPath(manifest: AssetManifest): string {
    const publisherId = manifest.distribution?.publisherId ?? 'unknown';
    return path.join(this.processorsBaseDir, publisherId, manifest.name);
  }

  async onPostInstall(manifest: AssetManifest, installedPath: string): Promise<void> {
    if (manifest.typeMetadata?.type !== 'processor') return;

    const manifestPath = path.join(installedPath, manifest.typeMetadata.data.processorManifestPath);
    const diagnostics = await validateInstalledProcessorManifest(manifestPath);
    const error = diagnostics.find((diagnostic) => diagnostic.severity === 'error');
    if (error) {
      throw new Error(`Invalid processor manifest in ${manifest.id}: ${error.message}`);
    }
    await this.host?.refreshProcessors?.();
  }

  async onPreUninstall(manifest: AssetManifest, _installedPath: string): Promise<void> {
    await this.host?.unregisterProcessorPackage?.(manifest.id);
  }
}

async function validateInstalledProcessorManifest(
  manifestPath: string,
): Promise<readonly ExternalProcessorDiagnostic[]> {
  const contents = await readFile(manifestPath, 'utf-8');
  const parsed = parseExternalProcessorManifestJson(contents, manifestPath);
  if (!parsed.value) return parsed.diagnostics;

  return validateExternalProcessorManifest(parsed.value).diagnostics;
}

function assertPackageRelativePath(value: string): void {
  if (!value || path.isAbsolute(value)) {
    throw new Error('processorManifestPath must be a package-relative path');
  }
  const normalized = path.normalize(value);
  if (normalized === '..' || normalized.startsWith(`..${path.sep}`)) {
    throw new Error('processorManifestPath must stay inside the installed package');
  }
}
