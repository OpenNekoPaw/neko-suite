import type {
  AssetManifest,
  AssetType,
  InstalledPackageStatus,
  MarketPackageEvent,
} from '@neko/shared';

export type AgentMarketProjectionKind = 'skill' | 'provider' | 'endpoint';

export interface AgentMarketProjection {
  packageId: string;
  kind: AgentMarketProjectionKind;
  manifest: AssetManifest;
  installedPath: string;
  enabled: boolean;
  status: InstalledPackageStatus;
}

const AGENT_MARKET_TYPES = new Set<AssetType>(['skill', 'provider', 'endpoint']);
const BLOCKING_STATUSES = new Set<InstalledPackageStatus>(['expired', 'incompatible']);

export function projectAgentMarketEvent(
  event: MarketPackageEvent,
): AgentMarketProjection | undefined {
  if (!event.type || !AGENT_MARKET_TYPES.has(event.type)) return undefined;
  if (!event.manifest || !event.installedPath) return undefined;
  const status = event.status ?? 'active';

  if (event.kind === 'uninstall' || event.kind === 'disable') return undefined;
  if (event.enabled === false) return undefined;
  if (BLOCKING_STATUSES.has(status)) return undefined;

  return {
    packageId: event.packageId,
    kind: event.type as AgentMarketProjectionKind,
    manifest: event.manifest,
    installedPath: event.installedPath,
    enabled: event.enabled ?? true,
    status,
  };
}

export function applyAgentMarketEventProjection(
  projections: readonly AgentMarketProjection[],
  event: MarketPackageEvent,
): AgentMarketProjection[] {
  const withoutCurrent = projections.filter((item) => item.packageId !== event.packageId);
  const next = projectAgentMarketEvent(event);
  return next ? [...withoutCurrent, next] : withoutCurrent;
}
