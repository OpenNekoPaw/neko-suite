import { createContentReadCapabilityProvider } from '@neko/content/document';
import type { AgentCapabilityProvider } from '@neko/shared';
import { createNodeAssetsCapabilityProvider } from './node-assets-capability';
import { createNodeContentAccessRuntime } from './node-content-access-runtime';
import { createNodeEntitySearchCapabilityProviders } from './node-entity-search-capability';
import { createNodeWorkspaceContentHostAdapter } from './node-workspace-content-host';

export interface CreateTuiDefaultCapabilityProvidersOptions {
  readonly workDir: string;
}

export function createTuiDefaultCapabilityProviders(
  options: CreateTuiDefaultCapabilityProvidersOptions,
): readonly AgentCapabilityProvider[] {
  const host = createNodeWorkspaceContentHostAdapter({ workDir: options.workDir });
  const contentAccessRuntime = createNodeContentAccessRuntime({ host });
  return [
    createContentReadCapabilityProvider({
      contentAccessRuntime,
    }),
    createNodeAssetsCapabilityProvider({ host }),
    ...createNodeEntitySearchCapabilityProviders({ host }),
  ];
}

export function withTuiDefaultCapabilityProviders(input: {
  readonly workDir: string;
  readonly capabilityProviders?: readonly AgentCapabilityProvider[];
}): readonly AgentCapabilityProvider[] {
  return [
    ...createTuiDefaultCapabilityProviders({ workDir: input.workDir }),
    ...(input.capabilityProviders ?? []),
  ];
}
