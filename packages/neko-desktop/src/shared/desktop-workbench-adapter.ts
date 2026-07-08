import { createAgentWorkbenchSurfaceContributions } from '@neko-agent/webview/workbench-surfaces';
import type {
  NekoWorkbenchHostCapability,
  WorkbenchContributionDescriptor,
  WorkbenchContributionSnapshot,
  WorkbenchContributionOwner,
  WorkbenchResourceProviderSnapshot,
} from '@neko/workbench-core';
import {
  createWorkbenchContributionRegistry,
  createWorkbenchViewportSessionContributionFromContract,
} from '@neko/workbench-core';
import type { DesktopSnapshot, WorkbenchSurfaceId } from './contracts';
import { createDesktopFeatureWebviewAdapterRegistry } from './feature-webview-adapters';

export const DESKTOP_BOOTSTRAP_OWNER: WorkbenchContributionOwner = {
  id: 'neko-desktop-bootstrap',
  kind: 'core-package',
  displayName: 'Neko Desktop Bootstrap',
  trust: 'core',
};

export const DESKTOP_WORKBENCH_HOST_CAPABILITIES: readonly NekoWorkbenchHostCapability[] = [
  'command.execute',
  'workbench.menus',
  'workbench.keybindings',
  'workbench.views',
  'workbench.customEditors',
  'workbench.webviews',
  'workbench.resourceSources',
  'workbench.agentSurfaces',
  'workspace.files',
  'resource.read',
  'agent.tool',
  'agent.skill',
  'engine.viewport',
];

export function createDesktopWorkbenchBootstrapSnapshot(
  snapshot: DesktopSnapshot,
): WorkbenchContributionSnapshot {
  const registry = createWorkbenchContributionRegistry({
    hostCapabilities: DESKTOP_WORKBENCH_HOST_CAPABILITIES,
  });
  registry.registerMany([
    ...createSurfaceContributions(snapshot),
    ...createResourceSourceContributions(snapshot),
    ...createEditorContributions(snapshot),
    ...createAgentWorkbenchSurfaceContributions(),
    createEngineViewportContribution(snapshot),
  ]);
  return registry.snapshot();
}

function createSurfaceContributions(
  snapshot: DesktopSnapshot,
): readonly WorkbenchContributionDescriptor[] {
  return snapshot.surfaces.map((surface): WorkbenchContributionDescriptor => ({
    id: `neko.desktop.surface.${surface.id}`,
    kind: 'view-container',
    owner: DESKTOP_BOOTSTRAP_OWNER,
    label: surface.label,
    location: readSurfaceLocation(surface.id),
    requiredHostCapabilities: ['workbench.views'],
    supportedHosts: ['electron'],
  }));
}

function createResourceSourceContributions(
  snapshot: DesktopSnapshot,
): readonly WorkbenchContributionDescriptor[] {
  if (snapshot.workbench.resourceProviders.length > 0) {
    return snapshot.workbench.resourceProviders.map((providerSnapshot) =>
      createResourceSourceContributionFromProvider(providerSnapshot),
    );
  }

  return [
    {
      id: 'neko.desktop.bootstrap.workspace-files',
      kind: 'resource-source',
      owner: DESKTOP_BOOTSTRAP_OWNER,
      label: snapshot.workspaceTree.rootName,
      sourceId: 'workspace-files',
      surfaceId: 'explorer',
      providerKind: 'bootstrap-temporary',
      requiredHostCapabilities: ['workbench.resourceSources', 'workspace.files'],
      supportedHosts: ['electron'],
    },
  ];
}

function createResourceSourceContributionFromProvider(
  providerSnapshot: WorkbenchResourceProviderSnapshot,
): WorkbenchContributionDescriptor {
  const provider = providerSnapshot.provider;
  return {
    id: readResourceSourceContributionId(providerSnapshot),
    kind: 'resource-source',
    owner: provider.owner ?? createProviderOwnerFallback(provider.ownerId),
    label: provider.label ?? provider.providerId,
    sourceId: provider.providerId,
    surfaceId: provider.surfaceId,
    providerKind: provider.providerKind,
    requiredHostCapabilities:
      provider.surfaceId === 'explorer'
        ? ['workbench.resourceSources', 'workspace.files']
        : ['workbench.resourceSources', 'resource.read'],
    supportedHosts: ['electron'],
  };
}

function readResourceSourceContributionId(
  providerSnapshot: WorkbenchResourceProviderSnapshot,
): string {
  const provider = providerSnapshot.provider;
  if (provider.providerKind === 'bootstrap-temporary') {
    if (provider.providerId === 'workspace-files') {
      return 'neko.desktop.bootstrap.workspace-files';
    }
    throw new Error(`Unsupported desktop bootstrap resource provider: ${provider.providerId}`);
  }
  return `neko.resource.${provider.surfaceId}.${provider.providerId}`;
}

function createProviderOwnerFallback(ownerId: string): WorkbenchContributionOwner {
  if (ownerId === DESKTOP_BOOTSTRAP_OWNER.id) {
    return DESKTOP_BOOTSTRAP_OWNER;
  }
  return {
    id: ownerId,
    kind: 'core-package',
    displayName: ownerId,
    trust: 'core',
  };
}

function createEditorContributions(
  snapshot: DesktopSnapshot,
): readonly WorkbenchContributionDescriptor[] {
  const featureAdapterRegistry = createDesktopFeatureWebviewAdapterRegistry(
    DESKTOP_WORKBENCH_HOST_CAPABILITIES,
  );
  const packageOwnedEditorContributions = featureAdapterRegistry
    .getAll()
    .filter((adapter) => adapter.surface === 'custom-editor')
    .map((adapter) => featureAdapterRegistry.toCustomEditorContribution(adapter.id));

  return [
    ...packageOwnedEditorContributions,
    ...createTemporaryDesktopEditorContributions(snapshot),
  ];
}

function createTemporaryDesktopEditorContributions(
  snapshot: DesktopSnapshot,
): readonly WorkbenchContributionDescriptor[] {
  const descriptorsByPanelKind = new Map<string, WorkbenchContributionDescriptor>();

  for (const node of flattenWorkspaceNodes(snapshot.workspaceTree.nodes)) {
    if (!node.editor || node.editor.desktopRuntime !== 'desktop-native') {
      continue;
    }
    if (descriptorsByPanelKind.has(node.editor.panelKind)) {
      continue;
    }
    descriptorsByPanelKind.set(node.editor.panelKind, {
      id: `neko.desktop.editor.${node.editor.panelKind}`,
      kind: 'custom-editor',
      owner: DESKTOP_BOOTSTRAP_OWNER,
      label: node.editor.label,
      viewType: node.editor.panelKind,
      selectors: [{ extension: readNodeExtension(node.name) }],
      runtime: 'desktop-native',
      priority: 'default',
      requiredHostCapabilities: ['workbench.customEditors'],
      supportedHosts: ['electron'],
    });
  }

  return [...descriptorsByPanelKind.values()];
}

function createEngineViewportContribution(
  snapshot: DesktopSnapshot,
): WorkbenchContributionDescriptor {
  return createWorkbenchViewportSessionContributionFromContract(snapshot.viewport.session);
}

function readSurfaceLocation(
  surfaceId: WorkbenchSurfaceId,
): 'primary-sidebar' | 'secondary-sidebar' | 'panel' {
  if (surfaceId === 'search') {
    return 'panel';
  }
  return surfaceId === 'skills' || surfaceId === 'market' ? 'secondary-sidebar' : 'primary-sidebar';
}

function flattenWorkspaceNodes(
  nodes: DesktopSnapshot['workspaceTree']['nodes'],
): readonly DesktopSnapshot['workspaceTree']['nodes'][number][] {
  const flattened: DesktopSnapshot['workspaceTree']['nodes'][number][] = [];
  for (const node of nodes) {
    flattened.push(node);
    if (node.children) {
      flattened.push(...flattenWorkspaceNodes(node.children));
    }
  }
  return flattened;
}

function readNodeExtension(name: string): string {
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index) : name;
}
