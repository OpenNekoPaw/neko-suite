import type {
  WorkbenchResourceProviderSnapshot,
  WorkbenchResourceRuntimeProjection,
  WorkbenchWorkspaceTreeResourceNode,
} from '@neko/workbench-core';
import {
  createWorkspaceStableResourceRef,
  createWorkspaceTreeResourceNode,
  validateWorkbenchResourceProviderSnapshot,
} from '@neko/workbench-core';
import type { WorkspaceFileNode, WorkspaceFileTreeSnapshot } from '../shared/contracts';
import { createWorkspaceFileTreeSnapshot, type WorkspaceTreeScanOptions } from './workspace-scan';

const DESKTOP_BOOTSTRAP_OWNER_ID = 'neko-desktop-bootstrap';
const WORKSPACE_FILES_PROVIDER_ID = 'workspace-files';

export interface DesktopWorkspaceResourceProviderSnapshot {
  readonly providerSnapshot: WorkbenchResourceProviderSnapshot;
  readonly workspaceTree: WorkspaceFileTreeSnapshot;
}

export async function createDesktopWorkspaceResourceProviderSnapshot(
  workspaceRoot: string,
  options: WorkspaceTreeScanOptions = {},
): Promise<DesktopWorkspaceResourceProviderSnapshot> {
  const workspaceTree = await createWorkspaceFileTreeSnapshot(workspaceRoot, options);
  return createDesktopWorkspaceResourceProviderFromTree(workspaceTree);
}

export function createDesktopWorkspaceResourceProviderFromTree(
  workspaceTree: WorkspaceFileTreeSnapshot,
): DesktopWorkspaceResourceProviderSnapshot {
  const providerSnapshot: WorkbenchResourceProviderSnapshot = {
    provider: {
      providerId: WORKSPACE_FILES_PROVIDER_ID,
      ownerId: DESKTOP_BOOTSTRAP_OWNER_ID,
      surfaceId: 'explorer',
      providerKind: 'bootstrap-temporary',
      label: workspaceTree.rootName,
    },
    nodes: workspaceTree.nodes.map((node) => toWorkbenchWorkspaceResourceNode(node)),
    diagnostics: workspaceTree.truncated
      ? [
          {
            code: 'workspaceTreeTruncated',
            severity: 'warning',
            message: `Workspace file tree was truncated after ${workspaceTree.totalFileCount} files.`,
            ownerId: DESKTOP_BOOTSTRAP_OWNER_ID,
            contributionId: WORKSPACE_FILES_PROVIDER_ID,
            contributionKind: 'resource-source',
          },
        ]
      : [],
    truncated: workspaceTree.truncated,
  };
  validateWorkbenchResourceProviderSnapshot(providerSnapshot);
  return { providerSnapshot, workspaceTree };
}

function toWorkbenchWorkspaceResourceNode(
  node: WorkspaceFileNode,
): WorkbenchWorkspaceTreeResourceNode {
  return createWorkspaceTreeResourceNode({
    id: node.id,
    name: node.name,
    relativePath: node.relativePath,
    kind: node.kind,
    stableRef: createWorkspaceStableResourceRef(node.relativePath),
    runtimeProjections: createRuntimeProjections(node),
    ...(node.children ? { children: node.children.map((child) => toNodeInput(child)) } : {}),
  });
}

function toNodeInput(node: WorkspaceFileNode): Parameters<typeof createWorkspaceTreeResourceNode>[0] {
  return {
    id: node.id,
    name: node.name,
    relativePath: node.relativePath,
    kind: node.kind,
    stableRef: createWorkspaceStableResourceRef(node.relativePath),
    runtimeProjections: createRuntimeProjections(node),
    ...(node.children ? { children: node.children.map((child) => toNodeInput(child)) } : {}),
  };
}

function createRuntimeProjections(
  node: WorkspaceFileNode,
): readonly WorkbenchResourceRuntimeProjection[] | undefined {
  if (!node.thumbnail?.url) {
    return undefined;
  }
  return [
    {
      kind: 'thumbnail',
      uri: node.thumbnail.url,
      currentSessionOnly: true,
    },
  ];
}
