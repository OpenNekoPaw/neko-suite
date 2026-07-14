import { describe, expect, it } from 'vitest';
import { WorkbenchContributionRegistrationError } from './registry';
import {
  classifyWorkspaceResourceName,
  createWorkbenchThumbnailRuntimeProjection,
  createWorkspaceStableResourceRef,
  createWorkspaceTreeResourceNode,
  isWorkbenchWorkspaceMediaFileKind,
  readWorkspaceResourceThumbnailLabel,
  validateWorkbenchResourceProviderSnapshot,
} from './resource-provider';

describe('workspace resource provider helpers', () => {
  it('classifies Neko project files and common media files', () => {
    expect(classifyWorkspaceResourceName('board.nkc')).toBe('canvas');
    expect(classifyWorkspaceResourceName('edit.nkv')).toBe('timeline');
    expect(classifyWorkspaceResourceName('mix.nka')).toBe('audio-project');
    expect(classifyWorkspaceResourceName('paint.nks')).toBe('sketch');
    expect(classifyWorkspaceResourceName('actor.model3.json')).toBe('puppet');
    expect(classifyWorkspaceResourceName('scene.glb')).toBe('model');
    expect(classifyWorkspaceResourceName('shot.mp4')).toBe('video');
    expect(classifyWorkspaceResourceName('voice.wav')).toBe('audio');
    expect(classifyWorkspaceResourceName('notes.md')).toBe('story');
    expect(classifyWorkspaceResourceName('config.toml')).toBe('config');
    expect(classifyWorkspaceResourceName('unknown.bin')).toBe('unknown');
  });

  it('detects media kinds and thumbnail labels', () => {
    expect(isWorkbenchWorkspaceMediaFileKind('image')).toBe(true);
    expect(isWorkbenchWorkspaceMediaFileKind('model')).toBe(true);
    expect(isWorkbenchWorkspaceMediaFileKind('story')).toBe(false);
    expect(readWorkspaceResourceThumbnailLabel('audio-project')).toBe('NKA');
  });

  it('creates portable workspace stable refs', () => {
    expect(createWorkspaceStableResourceRef('assets/image.png')).toEqual({
      kind: 'file',
      id: 'assets/image.png',
      source: 'workspace-files',
    });
  });

  it('keeps thumbnail projections runtime-only while stable refs stay portable', () => {
    expect(
      createWorkbenchThumbnailRuntimeProjection('neko-resource://workspace/assets%2Fimage.png'),
    ).toEqual({
      kind: 'thumbnail',
      uri: 'neko-resource://workspace/assets%2Fimage.png',
      currentSessionOnly: true,
    });

    expect(() =>
      validateWorkbenchResourceProviderSnapshot({
        provider: {
          providerId: 'workspace-files',
          ownerId: 'test-host-bootstrap',
          surfaceId: 'explorer',
          providerKind: 'bootstrap-temporary',
        },
        nodes: [
          createWorkspaceTreeResourceNode({
            id: 'workspace:assets/image.png',
            name: 'image.png',
            relativePath: 'assets/image.png',
            stableRef: {
              kind: 'file',
              id: 'neko-resource://workspace/assets%2Fimage.png',
              source: 'workspace-files',
            },
          }),
        ],
        diagnostics: [],
        truncated: false,
      }),
    ).toThrow(WorkbenchContributionRegistrationError);
  });

  it('validates provider snapshots and rejects unsafe identities', () => {
    const safeNode = createWorkspaceTreeResourceNode({
      id: 'workspace:assets/image.png',
      name: 'image.png',
      relativePath: 'assets/image.png',
    });

    expect(() =>
      validateWorkbenchResourceProviderSnapshot({
        provider: {
          providerId: 'workspace-files',
          ownerId: 'test-host-bootstrap',
          surfaceId: 'explorer',
          providerKind: 'bootstrap-temporary',
        },
        nodes: [safeNode],
        diagnostics: [],
        truncated: false,
      }),
    ).not.toThrow();

    expect(() =>
      validateWorkbenchResourceProviderSnapshot({
        provider: {
          providerId: 'workspace-files',
          ownerId: 'test-host-bootstrap',
          surfaceId: 'explorer',
          providerKind: 'bootstrap-temporary',
        },
        nodes: [
          {
            ...safeNode,
            stableRef: {
              kind: 'file',
              id: '.neko/.cache/thumb.png',
              source: 'workspace-files',
            },
          },
        ],
        diagnostics: [],
        truncated: false,
      }),
    ).toThrow(WorkbenchContributionRegistrationError);
  });

  it('validates domain resource node projections and owner metadata', () => {
    const safeNode = createWorkspaceTreeResourceNode({
      id: 'workspace:assets/image.png',
      name: 'image.png',
      relativePath: 'assets/image.png',
    });

    expect(() =>
      validateWorkbenchResourceProviderSnapshot({
        provider: {
          providerId: 'assets',
          ownerId: 'neko-assets',
          owner: {
            id: 'neko-assets',
            kind: 'core-package',
            trust: 'core',
          },
          surfaceId: 'assets',
          providerKind: 'domain-provider',
        },
        nodes: [],
        resourceNodes: [
          {
            id: 'asset:hero',
            sourceId: 'assets',
            label: 'Hero',
            stableRef: {
              kind: 'asset',
              id: 'hero',
              source: 'assets',
            },
          },
        ],
        diagnostics: [],
        truncated: false,
      }),
    ).not.toThrow();

    expect(() =>
      validateWorkbenchResourceProviderSnapshot({
        provider: {
          providerId: 'assets',
          ownerId: 'neko-assets',
          owner: {
            id: 'other-owner',
            kind: 'core-package',
            trust: 'core',
          },
          surfaceId: 'assets',
          providerKind: 'domain-provider',
        },
        nodes: [safeNode],
        diagnostics: [],
        truncated: false,
      }),
    ).toThrow(WorkbenchContributionRegistrationError);

    expect(() =>
      validateWorkbenchResourceProviderSnapshot({
        provider: {
          providerId: 'assets',
          ownerId: 'neko-assets',
          surfaceId: 'assets',
          providerKind: 'domain-provider',
        },
        nodes: [],
        resourceNodes: [
          {
            id: 'asset:cache-thumb',
            sourceId: 'assets',
            label: 'Cache Thumb',
            stableRef: {
              kind: 'asset',
              id: '.neko/.cache/thumb.png',
              source: 'assets',
            },
          },
        ],
        diagnostics: [],
        truncated: false,
      }),
    ).toThrow(WorkbenchContributionRegistrationError);
  });
});
