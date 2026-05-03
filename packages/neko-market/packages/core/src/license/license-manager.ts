/**
 * LicenseManager — Asset license verification.
 *
 * Phase 1 stub: Passes all free/shared assets.
 * Phase 6.5.4: Full JWT + online verification.
 */

import type { AssetManifest, ILicenseManager } from '@neko/shared';

// =============================================================================
// Implementation (Phase 1 — stub)
// =============================================================================

export class LicenseManager implements ILicenseManager {
  async verify(manifest: AssetManifest): Promise<{ allowed: boolean; reason?: string }> {
    const visibility = manifest.distribution?.visibility;

    // Paid assets require license verification (not implemented yet)
    if (visibility === 'paid') {
      return {
        allowed: false,
        reason: 'Paid asset verification is not yet available',
      };
    }

    // Private assets require authentication (not implemented yet)
    if (visibility === 'private') {
      return {
        allowed: false,
        reason: 'Private asset access is not yet available',
      };
    }

    // Free, shared, public, and unspecified assets are allowed
    return { allowed: true };
  }
}
