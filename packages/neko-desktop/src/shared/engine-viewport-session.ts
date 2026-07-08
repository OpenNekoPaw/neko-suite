import type {
  WorkbenchEngineViewportAvailability,
  WorkbenchEngineViewportSessionContract,
} from '@neko/workbench-core';
import { WORKBENCH_ENGINE_VIEWPORT_OWNER } from '@neko/workbench-core';

export interface DesktopEngineViewportSessionOptions {
  readonly availability: WorkbenchEngineViewportAvailability;
  readonly diagnostic: string;
}

export function createDesktopEngineViewportSessionContract(
  options: DesktopEngineViewportSessionOptions,
): WorkbenchEngineViewportSessionContract {
  return {
    id: 'engine-viewport-primary',
    label: 'Engine Viewport',
    owner: WORKBENCH_ENGINE_VIEWPORT_OWNER,
    ownerRuntime: 'neko-engine',
    availability: options.availability,
    diagnostic: options.diagnostic,
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
        status: options.availability === 'ready' ? 'planned' : 'unavailable',
      },
    },
    capabilities: [
      'engine-owned-output-truth',
      'engine-http-health',
      'viewport-intent-routing',
      'native-surface-target',
      'texture-lease-boundary',
      'color-managed-preview-contract',
      '10bit-hdr-follow-up',
    ],
    controlSurfaces: [
      {
        id: 'desktop-webview-viewport-controls',
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
        reasons: ['texture-copy-limits', 'color-management-limits'],
      },
      {
        id: 'webcodecs',
        hostKind: 'electron',
        authoritative: false,
        reasons: ['codec-limits', 'texture-copy-limits'],
      },
      {
        id: 'electron-webcontents',
        hostKind: 'electron',
        authoritative: false,
        reasons: ['webview-sandbox-limits', 'texture-copy-limits'],
      },
    ],
    requiredHostCapabilities: ['engine.viewport'],
    supportedHosts: ['electron'],
  };
}
