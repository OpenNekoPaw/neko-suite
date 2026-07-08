import { describe, expect, it } from 'vitest';
import type {
  WorkbenchContributionDescriptor,
  WorkbenchContributionOwner,
  WorkbenchResourceNodeProjection,
} from './types';
import {
  WorkbenchContributionRegistrationError,
  assertPortableResourceNode,
  createWorkbenchContributionRegistry,
} from './registry';

const owner: WorkbenchContributionOwner = {
  id: '@neko/test-owner',
  kind: 'core-package',
  trust: 'core',
};

describe('Workbench contribution registry', () => {
  it('projects host-neutral contribution snapshots', () => {
    const registry = createWorkbenchContributionRegistry({
      hostCapabilities: ['command.execute', 'workbench.views'],
    });
    registry.registerMany([
      {
        id: 'neko.test.open',
        kind: 'command',
        label: 'Open',
        owner,
        requiredHostCapabilities: ['command.execute'],
      },
      {
        id: 'neko.test.view',
        kind: 'view',
        label: 'Test View',
        owner,
        containerId: 'neko.test.container',
        runtime: 'host-adapter',
        requiredHostCapabilities: ['workbench.views'],
      },
    ]);

    const snapshot = registry.snapshot();

    expect(snapshot.contributions.map((contribution) => contribution.id)).toEqual([
      'neko.test.open',
      'neko.test.view',
    ]);
    expect(snapshot.temporaryBootstrapContributionIds).toEqual([]);
    expect(registry.getByKind('view')).toHaveLength(1);
  });

  it('fails visibly for duplicate contribution ids in the same namespace', () => {
    const registry = createWorkbenchContributionRegistry();
    const contribution: WorkbenchContributionDescriptor = {
      id: 'neko.test.open',
      kind: 'command',
      label: 'Open',
      owner,
    };
    registry.register(contribution);

    expect(() => registry.register(contribution)).toThrow(WorkbenchContributionRegistrationError);
    try {
      registry.register(contribution);
    } catch (error) {
      expect(error).toBeInstanceOf(WorkbenchContributionRegistrationError);
      expect((error as WorkbenchContributionRegistrationError).diagnostic.code).toBe(
        'duplicateContributionId',
      );
    }
  });

  it('fails visibly for unsupported host capabilities', () => {
    const registry = createWorkbenchContributionRegistry({
      hostCapabilities: ['command.execute'],
    });

    expect(() =>
      registry.register({
        id: 'neko.test.view',
        kind: 'view',
        label: 'Test View',
        owner,
        containerId: 'neko.test.container',
        runtime: 'host-adapter',
        requiredHostCapabilities: ['workbench.views'],
      }),
    ).toThrow(/requires unsupported host capabilities/);
  });

  it('marks temporary desktop bootstrap providers explicitly', () => {
    const registry = createWorkbenchContributionRegistry();
    registry.register({
      id: 'neko.desktop.bootstrap.workspace-files',
      kind: 'resource-source',
      label: 'Workspace Files',
      owner,
      sourceId: 'workspace-files',
      surfaceId: 'explorer',
      providerKind: 'bootstrap-temporary',
    });

    expect(registry.snapshot().temporaryBootstrapContributionIds).toEqual([
      'neko.desktop.bootstrap.workspace-files',
    ]);
  });

  it('rejects non-portable resource identities', () => {
    const unsafeNode: WorkbenchResourceNodeProjection = {
      id: 'cache-image',
      sourceId: 'cache',
      label: 'Cache Image',
      stableRef: {
        kind: 'asset',
        id: '.neko/.cache/thumb.png',
        source: 'cache',
      },
    };

    expect(() => assertPortableResourceNode(unsafeNode)).toThrow(
      WorkbenchContributionRegistrationError,
    );
  });
});
