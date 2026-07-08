import { describe, expect, it } from 'vitest';
import { createDesktopAppHostSnapshot } from './desktop-fixtures';
import { createDesktopWorkbenchBootstrapSnapshot } from './desktop-workbench-adapter';
import type { WorkspaceFileTreeSnapshot } from './contracts';

describe('desktop workbench adapter', () => {
  it('maps current desktop snapshot into Workbench Core bootstrap contributions', () => {
    const snapshot = createDesktopAppHostSnapshot({
      workspaceRoot: '/workspace/demo',
      workspaceName: 'demo',
      version: '0.0.1',
      locale: 'en',
    });

    const workbench = createDesktopWorkbenchBootstrapSnapshot(snapshot);

    expect(workbench.contributions.some((contribution) => contribution.kind === 'view-container')).toBe(
      true,
    );
    expect(workbench.contributions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'neko.desktop.bootstrap.workspace-files',
          kind: 'resource-source',
          providerKind: 'bootstrap-temporary',
        }),
        expect.objectContaining({
          id: snapshot.viewport.id,
          kind: 'viewport-session',
          owner: expect.objectContaining({
            id: 'neko-engine',
          }),
          ownerRuntime: 'neko-engine',
          authoritative: true,
          capabilities: snapshot.viewport.session.capabilities,
          nonAuthoritativeWebSurfaces: snapshot.viewport.session.nonAuthoritativeProjections.map(
            (projection) => projection.id,
          ),
        }),
        expect.objectContaining({
          id: 'neko.agent.right-panel',
          kind: 'agent-surface',
          owner: expect.objectContaining({
            id: '@neko-agent/webview',
          }),
          placement: 'right-panel',
        }),
        expect.objectContaining({
          id: 'neko.canvas.editor.canvas-workbench',
          kind: 'custom-editor',
          owner: expect.objectContaining({
            id: '@neko-canvas/webview',
          }),
          viewType: 'canvas-workbench',
        }),
      ]),
    );
    expect(workbench.temporaryBootstrapContributionIds).toContain(
      'neko.desktop.bootstrap.workspace-files',
    );
  });

  it('keeps temporary bootstrap providers visible instead of pretending they are canonical', () => {
    const snapshot = createDesktopAppHostSnapshot({
      workspaceRoot: '/workspace/demo',
      workspaceName: 'demo',
      version: '0.0.1',
      locale: 'zh-cn',
    });

    const workbench = createDesktopWorkbenchBootstrapSnapshot(snapshot);
    const temporaryProviders = workbench.contributions.filter(
      (contribution) =>
        contribution.kind === 'resource-source' &&
        contribution.providerKind === 'bootstrap-temporary',
    );

    expect(temporaryProviders.length).toBeGreaterThan(0);
    expect(temporaryProviders.map((provider) => provider.owner.id)).toEqual(
      expect.arrayContaining(['neko-desktop-bootstrap']),
    );
  });

  it('registers resource sources from provider snapshots with package owners', () => {
    const snapshot = createDesktopAppHostSnapshot({
      workspaceRoot: '/workspace/demo',
      workspaceName: 'demo',
      version: '0.0.1',
      locale: 'en',
      workbench: {
        contributionSnapshot: {
          contributions: [],
          diagnostics: [],
          temporaryBootstrapContributionIds: [],
        },
        resourceProviders: [
          {
            provider: {
              providerId: 'workspace-files',
              ownerId: 'neko-desktop-bootstrap',
              surfaceId: 'explorer',
              providerKind: 'bootstrap-temporary',
              label: 'demo',
            },
            nodes: [],
            diagnostics: [],
            truncated: false,
          },
          {
            provider: {
              providerId: 'assets',
              ownerId: 'neko-assets',
              owner: {
                id: 'neko-assets',
                kind: 'core-package',
                displayName: 'Neko Assets',
                trust: 'core',
              },
              surfaceId: 'assets',
              providerKind: 'domain-provider',
              label: 'Asset Library',
            },
            nodes: [],
            resourceNodes: [
              {
                id: 'asset:hero',
                sourceId: 'assets',
                label: 'Hero',
                stableRef: { kind: 'asset', id: 'hero', source: 'assets' },
              },
            ],
            diagnostics: [],
            truncated: false,
          },
        ],
        diagnostics: [],
      },
    });

    const workbench = createDesktopWorkbenchBootstrapSnapshot(snapshot);
    const resourceSources = workbench.contributions.filter(
      (contribution) => contribution.kind === 'resource-source',
    );

    expect(resourceSources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'neko.desktop.bootstrap.workspace-files',
          owner: expect.objectContaining({ id: 'neko-desktop-bootstrap' }),
          providerKind: 'bootstrap-temporary',
        }),
        expect.objectContaining({
          id: 'neko.resource.assets.assets',
          owner: expect.objectContaining({ id: 'neko-assets' }),
          providerKind: 'domain-provider',
        }),
      ]),
    );
    expect(
      resourceSources.some(
        (source) =>
          source.providerKind === 'bootstrap-temporary' &&
          source.sourceId !== 'workspace-files',
      ),
    ).toBe(false);
  });

  it('rejects non-workspace bootstrap resource providers', () => {
    const snapshot = createDesktopAppHostSnapshot({
      workspaceRoot: '/workspace/demo',
      workspaceName: 'demo',
      version: '0.0.1',
      locale: 'en',
      workbench: {
        contributionSnapshot: {
          contributions: [],
          diagnostics: [],
          temporaryBootstrapContributionIds: [],
        },
        resourceProviders: [
          {
            provider: {
              providerId: 'assets',
              ownerId: 'neko-desktop-bootstrap',
              surfaceId: 'assets',
              providerKind: 'bootstrap-temporary',
              label: 'Assets',
            },
            nodes: [],
            diagnostics: [],
            truncated: false,
          },
        ],
        diagnostics: [],
      },
    });

    expect(() => createDesktopWorkbenchBootstrapSnapshot(snapshot)).toThrow(
      'Unsupported desktop bootstrap resource provider: assets',
    );
  });

  it('keeps Agent workbench surfaces owned by the Agent package', () => {
    const snapshot = createDesktopAppHostSnapshot({
      workspaceRoot: '/workspace/demo',
      workspaceName: 'demo',
      version: '0.0.1',
      locale: 'en',
    });

    const workbench = createDesktopWorkbenchBootstrapSnapshot(snapshot);
    const agentSurfaces = workbench.contributions.filter(
      (contribution) => contribution.kind === 'agent-surface',
    );

    expect(agentSurfaces).toHaveLength(3);
    expect(agentSurfaces.map((surface) => surface.id)).toEqual([
      'neko.agent.right-panel',
      'neko.agent.main-panel',
      'neko.agent.floating-composer',
    ]);
    expect(agentSurfaces.map((surface) => surface.owner.id)).toEqual([
      '@neko-agent/webview',
      '@neko-agent/webview',
      '@neko-agent/webview',
    ]);
    expect(agentSurfaces.map((surface) => surface.owner.id)).not.toContain(
      'neko-desktop-bootstrap',
    );
  });

  it('uses package-owned feature Webview adapters and keeps desktop-native code temporary', () => {
    const snapshot = createDesktopAppHostSnapshot({
      workspaceRoot: '/workspace/demo',
      workspaceName: 'demo',
      version: '0.0.1',
      locale: 'en',
      workspaceTree: createWorkspaceTreeWithCanvasAndCode(),
    });

    const workbench = createDesktopWorkbenchBootstrapSnapshot(snapshot);
    const customEditors = workbench.contributions.filter(
      (contribution) => contribution.kind === 'custom-editor',
    );

    expect(customEditors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'neko.canvas.editor.canvas-workbench',
          owner: expect.objectContaining({ id: '@neko-canvas/webview' }),
          viewType: 'canvas-workbench',
          runtime: 'package-host-adapter',
        }),
        expect.objectContaining({
          id: 'neko.cut.editor.timeline',
          owner: expect.objectContaining({ id: '@neko/webview' }),
          viewType: 'cut-timeline',
        }),
        expect.objectContaining({
          id: 'neko.desktop.editor.code-editor',
          owner: expect.objectContaining({ id: 'neko-desktop-bootstrap' }),
          viewType: 'code-editor',
          runtime: 'desktop-native',
        }),
      ]),
    );
    expect(
      customEditors
        .filter((editor) => editor.id !== 'neko.desktop.editor.code-editor')
        .map((editor) => editor.owner.id),
    ).not.toContain('neko-desktop-bootstrap');
  });
});

function createWorkspaceTreeWithCanvasAndCode(): WorkspaceFileTreeSnapshot {
  return {
    rootName: 'demo',
    rootRef: { kind: 'file', id: '.', source: 'workspace-files' },
    nodes: [
      {
        id: 'workspace:board.nkc',
        name: 'board.nkc',
        relativePath: 'board.nkc',
        kind: 'canvas',
        editor: {
          kind: 'canvas',
          panelKind: 'canvas-workbench',
          label: 'Canvas',
          packageName: '@neko-canvas/webview',
          implementedInVsCodeWebview: true,
          desktopRuntime: 'host-adapter-projection',
        },
      },
      {
        id: 'workspace:notes.md',
        name: 'notes.md',
        relativePath: 'notes.md',
        kind: 'story',
        editor: {
          kind: 'code',
          panelKind: 'code-editor',
          label: 'Text',
          packageName: 'neko-desktop',
          implementedInVsCodeWebview: false,
          desktopRuntime: 'desktop-native',
        },
      },
    ],
    totalFileCount: 2,
    directoryCount: 0,
    mediaFileCount: 0,
    truncated: false,
  };
}
