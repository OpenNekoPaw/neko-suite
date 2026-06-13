import type { MessageContextReference } from '@neko-agent/types';
import type { AgentContextPayload } from '@neko/shared';

export function projectContextReferencesFromPayloads(
  payloads: AgentContextPayload[] | undefined,
): MessageContextReference[] | undefined {
  if (!payloads || payloads.length === 0) return undefined;
  return payloads.map((payload) => {
    const navigationData = projectContextNavigationData(payload);
    return {
      type: payload.type,
      id: payload.id,
      label: payload.label,
      ...(Object.keys(navigationData).length > 0 ? { navigationData } : {}),
    };
  });
}

function projectContextNavigationData(payload: AgentContextPayload): Record<string, string> {
  const data = payload.data as Record<string, unknown> | null | undefined;
  const nav: Record<string, string> = {};

  if (data && typeof data === 'object') {
    copyStringField(nav, 'filePath', data.filePath);
    copyStringField(nav, 'path', data.path);
    if (typeof data.resolvedPath === 'string') nav.filePath = data.resolvedPath;
    copyStringField(nav, 'assetId', data.assetId);

    const embeddedNavigation = data.navigationData;
    if (embeddedNavigation && typeof embeddedNavigation === 'object') {
      for (const [key, value] of Object.entries(embeddedNavigation)) {
        if (typeof value === 'string') nav[key] = value;
      }
    }
  }

  if (payload.type === 'canvas-node') nav.nodeId = payload.id;
  if (payload.type === 'asset' && !nav.assetId) nav.assetId = payload.id;

  return nav;
}

function copyStringField(target: Record<string, string>, key: string, value: unknown): void {
  if (typeof value === 'string') target[key] = value;
}
