import { describe, expect, it } from 'vitest';
import type { WorkbenchEngineViewportSessionContract } from './engine-viewport-session';
import {
  WORKBENCH_ENGINE_VIEWPORT_OWNER,
  WorkbenchEngineViewportSessionContractError,
  createWorkbenchViewportSessionContributionFromContract,
  validateWorkbenchEngineViewportSessionContract,
} from './engine-viewport-session';

const validSession: WorkbenchEngineViewportSessionContract = {
  id: 'engine-viewport-primary',
  label: 'Engine Viewport',
  owner: WORKBENCH_ENGINE_VIEWPORT_OWNER,
  ownerRuntime: 'neko-engine',
  availability: 'ready',
  output: {
    kind: 'engine-native-surface',
    ownerRuntime: 'neko-engine',
    authoritative: true,
    colorPipeline: {
      mode: 'engine-managed',
      bitDepth: 'unknown',
      hdr: 'planned',
    },
    textureBoundary: {
      mode: 'texture-lease-planned',
      status: 'planned',
    },
  },
  capabilities: [
    'engine-owned-output-truth',
    'viewport-intent-routing',
    'color-managed-preview-contract',
    'texture-lease-boundary',
  ],
  controlSurfaces: [
    {
      id: 'desktop-webview-controls',
      hostKind: 'electron',
      role: 'control-ui',
      canSendIntents: true,
      authoritative: false,
    },
  ],
  nonAuthoritativeProjections: [
    {
      id: 'html-video',
      hostKind: 'electron',
      authoritative: false,
      reasons: ['codec-limits', 'color-management-limits'],
    },
    {
      id: 'canvas',
      hostKind: 'electron',
      authoritative: false,
      reasons: ['texture-copy-limits'],
    },
  ],
  requiredHostCapabilities: ['engine.viewport'],
  supportedHosts: ['electron'],
};

describe('Engine viewport session contract', () => {
  it('validates Engine-owned viewport output authority', () => {
    expect(() => validateWorkbenchEngineViewportSessionContract(validSession)).not.toThrow();
  });

  it('projects Workbench viewport contributions from the session contract', () => {
    expect(createWorkbenchViewportSessionContributionFromContract(validSession)).toEqual({
      id: 'engine-viewport-primary',
      kind: 'viewport-session',
      owner: WORKBENCH_ENGINE_VIEWPORT_OWNER,
      label: 'Engine Viewport',
      ownerRuntime: 'neko-engine',
      authoritative: true,
      capabilities: validSession.capabilities,
      nonAuthoritativeWebSurfaces: ['html-video', 'canvas'],
      requiredHostCapabilities: ['engine.viewport'],
      supportedHosts: ['electron'],
    });
  });

  it('rejects non-Engine viewport authority', () => {
    const invalidSession: WorkbenchEngineViewportSessionContract = {
      ...validSession,
      owner: { ...WORKBENCH_ENGINE_VIEWPORT_OWNER, id: 'neko-desktop-bootstrap' },
    };

    expect(() => validateWorkbenchEngineViewportSessionContract(invalidSession)).toThrow(
      WorkbenchEngineViewportSessionContractError,
    );
  });

  it('rejects Web projections as authoritative output targets', () => {
    const invalidSession: WorkbenchEngineViewportSessionContract = {
      ...validSession,
      output: {
        ...validSession.output,
        kind: 'webcodecs' as unknown as WorkbenchEngineViewportSessionContract['output']['kind'],
      },
    };

    expect(() => validateWorkbenchEngineViewportSessionContract(invalidSession)).toThrow(
      /Unsupported Engine viewport output target/,
    );
  });

  it('requires non-authoritative projection reasons', () => {
    const invalidSession: WorkbenchEngineViewportSessionContract = {
      ...validSession,
      nonAuthoritativeProjections: [
        {
          id: 'electron-webcontents',
          hostKind: 'electron',
          authoritative: false,
          reasons: [],
        },
      ],
    };

    expect(() => validateWorkbenchEngineViewportSessionContract(invalidSession)).toThrow(
      /must declare why it is non-authoritative/,
    );
  });
});
