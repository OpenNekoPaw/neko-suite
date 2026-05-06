import { describe, expect, it } from 'vitest';
import type { AssetManifest, MarketPackageEvent } from '@neko/shared';
import {
  applyAgentMarketEventProjection,
  projectAgentMarketEvent,
} from '../market-event-projector';

describe('market-event-projector', () => {
  it('projects usable skill, provider, and endpoint install events', () => {
    const projection = projectAgentMarketEvent({
      kind: 'install',
      packageId: '@agent/storyboard',
      type: 'skill',
      manifest: manifest('@agent/storyboard', 'skill'),
      installedPath: '/market/storyboard',
      enabled: true,
      status: 'active',
    });

    expect(projection).toMatchObject({
      packageId: '@agent/storyboard',
      kind: 'skill',
      installedPath: '/market/storyboard',
      enabled: true,
      status: 'active',
    });
  });

  it('removes disabled, uninstalled, expired, and incompatible packages from projections', () => {
    let projections = [
      projectAgentMarketEvent(event('@agent/storyboard', 'skill'))!,
      projectAgentMarketEvent(event('@agent/provider', 'provider'))!,
    ];

    projections = applyAgentMarketEventProjection(projections, {
      ...event('@agent/storyboard', 'skill'),
      kind: 'disable',
      enabled: false,
    });
    projections = applyAgentMarketEventProjection(projections, {
      ...event('@agent/provider', 'provider'),
      kind: 'status-change',
      status: 'expired',
    });

    expect(projections).toEqual([]);
  });

  it('ignores non-agent market asset types so owned-not-installed packages never appear', () => {
    expect(
      projectAgentMarketEvent({
        kind: 'install',
        packageId: '@market/media',
        type: 'media',
        manifest: manifest('@market/media', 'media'),
        installedPath: '/market/media',
      }),
    ).toBeUndefined();
    expect(
      projectAgentMarketEvent({
        kind: 'status-change',
        packageId: '@agent/owned-skill',
        type: 'skill',
        status: 'active',
      }),
    ).toBeUndefined();
  });
});

function event(packageId: string, type: AssetManifest['type']): MarketPackageEvent {
  return {
    kind: 'install',
    packageId,
    type,
    manifest: manifest(packageId, type),
    installedPath: `/market/${packageId.replace(/[^\w-]/g, '_')}`,
    enabled: true,
    status: 'active',
  };
}

function manifest(id: string, type: AssetManifest['type']): AssetManifest {
  return {
    id,
    name: id,
    version: '1.0.0',
    type,
    source: { kind: 'local', path: `/tmp/${id}` },
    distributionKind: type === 'endpoint' ? 'registration' : 'archive',
    createdAt: 1,
    updatedAt: 1,
  };
}
