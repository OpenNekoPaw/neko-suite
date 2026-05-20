/**
 * Shared creative-domain routing metadata.
 *
 * These types are serializable orchestration data. They intentionally do not
 * name runtime services, ECS worlds, or concrete engine implementations.
 */

export type CreativeDomainId =
  | 'timeline'
  | 'canvas'
  | 'sketch'
  | 'audio'
  | 'scene'
  | 'puppet'
  | 'project'
  | 'mixed';

export type CreativeDomainSource = 'operation-tool' | 'engine-tool' | 'capability' | 'intent';

export interface CreativeDomainMetadata {
  readonly id: CreativeDomainId;
  readonly source?: CreativeDomainSource;
  readonly operationDomain?: string;
  readonly servicePortId?: string;
}

export interface DomainRouteIntent {
  readonly id: string;
  readonly domain?: CreativeDomainMetadata;
  readonly capabilityIds?: readonly string[];
}

export interface DomainRouteCapability {
  readonly id: string;
  readonly domain?: CreativeDomainMetadata;
  readonly servicePortId: string;
}

export interface DomainRoutePlan {
  readonly intentId: string;
  readonly domain: CreativeDomainMetadata;
  readonly servicePortId: string;
  readonly capabilityId?: string;
}

export class DomainRouter {
  route(
    intent: DomainRouteIntent,
    capabilities: readonly DomainRouteCapability[],
  ): DomainRoutePlan | undefined {
    if (!intent.domain) {
      return undefined;
    }

    const capability = capabilities.find((candidate) => {
      if (intent.capabilityIds && !intent.capabilityIds.includes(candidate.id)) {
        return false;
      }
      return candidate.domain?.id === intent.domain?.id;
    });

    if (!capability) {
      return undefined;
    }

    return {
      intentId: intent.id,
      domain: intent.domain,
      servicePortId: capability.servicePortId,
      capabilityId: capability.id,
    };
  }
}

export function createDomainRouter(): DomainRouter {
  return new DomainRouter();
}
