/**
 * EndpointInstallTarget — contributed target for registration-only endpoint packages.
 */

import * as os from 'node:os';
import * as path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import type { AssetManifest, IInstallTarget } from '@neko/shared';

const MARKET_ENDPOINTS_BASE = path.join(os.homedir(), '.neko', 'endpoints');

export class EndpointInstallTarget implements IInstallTarget<'endpoint'> {
  readonly type = 'endpoint' as const;

  validateManifest(manifest: AssetManifest): void {
    if (manifest.type !== 'endpoint') {
      throw new Error(`EndpointInstallTarget cannot install asset type: ${manifest.type}`);
    }
    if (manifest.distributionKind !== 'registration') {
      throw new Error('endpoint packages must use registration distribution');
    }
    if (manifest.typeMetadata?.type !== 'endpoint') {
      throw new Error('endpoint packages must include endpoint typeMetadata');
    }
  }

  getInstallPath(manifest: AssetManifest): string {
    const metadata = manifest.typeMetadata;
    const provider = metadata?.type === 'endpoint' ? metadata.data.provider : 'custom';
    return path.join(MARKET_ENDPOINTS_BASE, provider, manifest.name);
  }

  async writeRegistration(manifest: AssetManifest, installedPath: string): Promise<void> {
    if (manifest.typeMetadata?.type !== 'endpoint') return;
    const metadata = manifest.typeMetadata.data;
    await mkdir(installedPath, { recursive: true });
    await writeFile(
      path.join(installedPath, 'endpoint.json'),
      JSON.stringify(
        {
          id: manifest.id,
          version: manifest.version,
          provider: metadata.provider,
          capabilities: metadata.capabilities,
          endpointTemplate: metadata.endpointTemplate,
          credentialSchema: metadata.credentialSchema,
          modelIds: metadata.modelIds,
        },
        null,
        2,
      ),
      'utf-8',
    );
  }
}
