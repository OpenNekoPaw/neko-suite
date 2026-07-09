import { describe, expect, it } from 'vitest';
import type { WorkspaceFileTreeSnapshot } from '../shared/contracts';
import { createDesktopWorkspaceResourceProviderFromTree } from './workspace-resource-provider';

describe('desktop workspace resource provider adapter', () => {
  it('wraps the existing workspace tree as a temporary Workbench provider', () => {
    const tree = createWorkspaceTreeFixture({ truncated: false });

    const result = createDesktopWorkspaceResourceProviderFromTree(tree);

    expect(result.workspaceTree).toBe(tree);
    expect(result.providerSnapshot.provider).toEqual(
      expect.objectContaining({
        providerId: 'workspace-files',
        ownerId: 'neko-desktop-bootstrap',
        surfaceId: 'explorer',
        providerKind: 'bootstrap-temporary',
      }),
    );
    expect(result.providerSnapshot.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'workspace:assets',
          stableRef: { kind: 'file', id: 'assets', source: 'workspace-files' },
          children: expect.arrayContaining([
            expect.objectContaining({
              id: 'workspace:assets/image.png',
              stableRef: { kind: 'file', id: 'assets/image.png', source: 'workspace-files' },
              runtimeProjections: [
                {
                  kind: 'thumbnail',
                  uri: 'neko-resource://workspace/assets%2Fimage.png',
                  currentSessionOnly: true,
                },
              ],
            }),
          ]),
        }),
      ]),
    );
    const imageNode = result.providerSnapshot.nodes[0]?.children?.[0];
    expect(imageNode?.stableRef).toEqual({
      kind: 'file',
      id: 'assets/image.png',
      source: 'workspace-files',
    });
    expect(imageNode?.runtimeProjections?.[0]?.uri).toBe(
      'neko-resource://workspace/assets%2Fimage.png',
    );
    expect(JSON.stringify(imageNode?.stableRef)).not.toContain('neko-resource://');
  });

  it('exposes truncation diagnostics instead of hiding provider state', () => {
    const tree = createWorkspaceTreeFixture({ truncated: true });

    const result = createDesktopWorkspaceResourceProviderFromTree(tree);

    expect(result.providerSnapshot.truncated).toBe(true);
    expect(result.providerSnapshot.diagnostics).toEqual([
      expect.objectContaining({
        code: 'workspaceTreeTruncated',
        severity: 'warning',
        contributionId: 'workspace-files',
      }),
    ]);
  });
});

function createWorkspaceTreeFixture(input: {
  readonly truncated: boolean;
}): WorkspaceFileTreeSnapshot {
  return {
    rootName: 'demo',
    rootRef: { kind: 'file', id: '.', source: 'workspace-files' },
    nodes: [
      {
        id: 'workspace:assets',
        name: 'assets',
        relativePath: 'assets',
        kind: 'directory',
        childCount: 1,
        children: [
          {
            id: 'workspace:assets/image.png',
            name: 'image.png',
            relativePath: 'assets/image.png',
            kind: 'image',
            sizeBytes: 1024,
            thumbnail: {
              kind: 'image',
              label: 'IMG',
              url: 'neko-resource://workspace/assets%2Fimage.png',
            },
          },
        ],
      },
    ],
    totalFileCount: 1,
    directoryCount: 1,
    mediaFileCount: 1,
    truncated: input.truncated,
  };
}
