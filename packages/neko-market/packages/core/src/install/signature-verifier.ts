import type { AssetManifest } from '@neko/shared';

export interface ManifestSignatureVerifier {
  verify(manifest: AssetManifest): Promise<void> | void;
}

export class PresenceSignatureVerifier implements ManifestSignatureVerifier {
  verify(manifest: AssetManifest): void {
    if (manifest.source.kind !== 'registry') return;
    if (!manifest.distribution?.signature) {
      throw new Error('Registry manifests must include distribution.signature');
    }
  }
}
