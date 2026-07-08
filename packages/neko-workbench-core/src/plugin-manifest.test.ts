import { describe, expect, it } from 'vitest';
import {
  NEKO_PLUGIN_MANIFEST_SCHEMA_VERSION,
  NekoPluginManifestValidationError,
  describeVscodeSubsetCompatibility,
  projectNekoPluginManifest,
} from './plugin-manifest';

describe('Neko plugin manifest projection', () => {
  it('projects a valid manifest into contribution descriptors with provenance', () => {
    const descriptor = projectNekoPluginManifest(
      {
        schemaVersion: NEKO_PLUGIN_MANIFEST_SCHEMA_VERSION,
        id: 'demo.plugin',
        displayName: 'Demo Plugin',
        version: '0.1.0',
        trust: 'trusted',
        activationEvents: ['onCommand:demo.open'],
        supportedHosts: ['electron', 'vscode'],
        permissions: ['command.execute', 'ui.view', 'resource.read'],
        contributes: {
          commands: [{ id: 'demo.open', label: 'Open Demo' }],
          views: [
            {
              id: 'demo.resources',
              label: 'Demo Resources',
              containerId: 'neko.explorer',
              runtime: 'sandboxed-webview',
            },
          ],
          resourceSources: [
            {
              id: 'demo.assets',
              label: 'Demo Assets',
              sourceId: 'demo-assets',
              surfaceId: 'assets',
            },
          ],
        },
      },
      {
        hostCapabilities: [
          'command.execute',
          'workbench.views',
          'workbench.resourceSources',
          'resource.read',
        ],
      },
    );

    expect(descriptor.owner).toEqual(
      expect.objectContaining({
        id: 'demo.plugin',
        kind: 'plugin',
        trust: 'trusted',
      }),
    );
    expect(descriptor.contributions.map((contribution) => contribution.id)).toEqual([
      'demo.open',
      'demo.resources',
      'demo.assets',
    ]);
    expect(descriptor.contributions[0]?.owner.id).toBe('demo.plugin');
  });

  it('fails closed for unsupported manifest versions', () => {
    expect(() =>
      projectNekoPluginManifest({
        schemaVersion: '99.0.0',
        id: 'demo.plugin',
        displayName: 'Demo Plugin',
        version: '0.1.0',
        trust: 'trusted',
      }),
    ).toThrow(NekoPluginManifestValidationError);
  });

  it('rejects unknown contribution groups', () => {
    expect(() =>
      projectNekoPluginManifest({
        schemaVersion: NEKO_PLUGIN_MANIFEST_SCHEMA_VERSION,
        id: 'demo.plugin',
        displayName: 'Demo Plugin',
        version: '0.1.0',
        trust: 'trusted',
        contributes: {
          rawDomPatch: [{ id: 'demo.patch' }],
        },
      }),
    ).toThrow(/Unsupported Neko plugin contribution group/);
  });

  it('rejects missing permissions for privileged contribution groups', () => {
    expect(() =>
      projectNekoPluginManifest({
        schemaVersion: NEKO_PLUGIN_MANIFEST_SCHEMA_VERSION,
        id: 'demo.plugin',
        displayName: 'Demo Plugin',
        version: '0.1.0',
        trust: 'community',
        permissions: ['command.execute'],
        contributes: {
          agentTools: [{ id: 'demo.tool', label: 'Tool', toolId: 'demo.tool' }],
        },
      }),
    ).toThrow(/does not declare permission 'agent.tool'/);
  });

  it('disables untrusted Agent tool default injection', () => {
    const descriptor = projectNekoPluginManifest({
      schemaVersion: NEKO_PLUGIN_MANIFEST_SCHEMA_VERSION,
      id: 'demo.untrusted',
      displayName: 'Demo Untrusted',
      version: '0.1.0',
      trust: 'untrusted',
      permissions: ['agent.tool'],
      contributes: {
        agentTools: [
          {
            id: 'demo.tool',
            label: 'Tool',
            toolId: 'demo.tool',
            defaultInjection: 'enabled',
          },
        ],
      },
    });

    expect(descriptor.contributions[0]).toEqual(
      expect.objectContaining({
        kind: 'agent-tool',
        defaultInjection: 'disabled',
      }),
    );
  });

  it('uses registry validation for duplicate contribution ids', () => {
    expect(() =>
      projectNekoPluginManifest({
        schemaVersion: NEKO_PLUGIN_MANIFEST_SCHEMA_VERSION,
        id: 'demo.plugin',
        displayName: 'Demo Plugin',
        version: '0.1.0',
        trust: 'trusted',
        permissions: ['command.execute'],
        contributes: {
          commands: [
            { id: 'demo.open', label: 'Open Demo' },
            { id: 'demo.open', label: 'Open Demo Again' },
          ],
        },
      }),
    ).toThrow(/Duplicate workbench contribution id/);
  });

  it('describes VSCode subset compatibility without pretending unsupported groups exist', () => {
    expect(describeVscodeSubsetCompatibility(['commands', 'views', 'debuggers'])).toEqual({
      source: 'vscode-manifest-subset',
      supportedContributionGroups: ['commands', 'views'],
      unsupportedContributionGroups: ['debuggers'],
    });
  });
});
