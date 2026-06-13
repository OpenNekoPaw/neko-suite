import type {
  LiveCompositorDiagnostic,
  LiveCompositorLayer,
  LiveCompositorScene,
  LiveCompositorSourceKind,
  LiveCompositorSourceRef,
  LiveOutputRoute,
  ViewportSerializableRecord,
} from '@neko/shared';
import { LIVE_COMPOSITOR_CONTRACT_VERSION } from '@neko/shared';
import type { AvatarType, LiveDeviceBinding } from '../types/tracking';

export const LIVE_COMPOSITOR_SCENE_ID = 'live-scene-main';
export const LIVE_COMPOSITOR_VIEWPORT_ID = 'viewport-live-main';

export interface CreateDefaultLiveCompositorSceneOptions {
  readonly avatarUrl?: string | null;
  readonly avatarType?: AvatarType;
  readonly cameraBinding?: LiveDeviceBinding;
  readonly now?: number;
}

export function createDefaultLiveCompositorScene(
  options: CreateDefaultLiveCompositorSceneOptions = {},
): LiveCompositorScene {
  const now = options.now ?? Date.now();
  const sources: LiveCompositorSourceRef[] = [backgroundSource()];
  const layers: LiveCompositorLayer[] = [backgroundLayer()];
  const diagnostics: LiveCompositorDiagnostic[] = [localPreviewDiagnostic(now)];

  const avatarSource = createAvatarSource(options.avatarUrl, options.avatarType);
  if (avatarSource) {
    sources.push(avatarSource);
    layers.push(avatarLayer(avatarSource));
  }

  if (options.cameraBinding?.sessionId) {
    const source = cameraSource(options.cameraBinding);
    sources.push(source);
    layers.push(cameraLayer(source));
  }

  const trackingSource = trackingOverlaySource();
  sources.push(trackingSource);
  layers.push(trackingOverlayLayer(trackingSource));

  return {
    contractVersion: LIVE_COMPOSITOR_CONTRACT_VERSION,
    sceneId: LIVE_COMPOSITOR_SCENE_ID,
    viewportId: LIVE_COMPOSITOR_VIEWPORT_ID,
    name: 'Main Live Scene',
    revision: 0,
    canvas: {
      width: 1280,
      height: 720,
      fps: 30,
      pixelRatio: 1,
      colorSpace: 'srgb',
      background: '#101014',
    },
    sources,
    layers,
    presets: [
      {
        id: 'preset-main',
        label: 'Main',
        order: 0,
        layerIds: layers.map((layer) => layer.id),
        outputRouteIds: ['route-monitor'],
        trackingOverlay: {
          id: 'tracking-overlay-main',
          enabled: true,
          visible: true,
          mode: 'skeleton',
          sourceIds: avatarSource ? [avatarSource.sourceId] : [],
          opacity: 0.6,
          zIndex: 90,
          stalePolicy: 'dim',
        },
      },
      {
        id: 'preset-clean',
        label: 'Clean',
        order: 1,
        layerIds: layers.filter((layer) => layer.role !== 'diagnostic').map((layer) => layer.id),
        outputRouteIds: ['route-monitor'],
      },
    ],
    activePresetId: 'preset-main',
    trackingOverlay: {
      id: 'tracking-overlay-main',
      enabled: true,
      visible: true,
      mode: 'skeleton',
      sourceIds: avatarSource ? [avatarSource.sourceId] : [],
      opacity: 0.6,
      zIndex: 90,
      stalePolicy: 'dim',
    },
    outputRoutes: outputRoutes(now),
    diagnostics,
    latencySamples: [
      {
        id: 'latency-decode-unavailable',
        kind: 'decode',
        timestamp: now,
        budgetMs: 16,
        withinBudget: false,
        unavailableReason: 'WebCodecs presentation callback not available until stream starts',
      },
    ],
    metadata: {
      createdBy: 'neko-live-webview',
      authoritative: true,
    },
    updatedAt: now,
  };
}

function backgroundSource(): LiveCompositorSourceRef {
  return {
    sourceId: 'source-bg',
    kind: 'solid',
    label: 'Studio Background',
    color: '#101014',
  };
}

function backgroundLayer(): LiveCompositorLayer {
  return {
    id: 'layer-bg',
    role: 'background',
    label: 'Background',
    source: backgroundSource(),
    transform: {
      position: [640, 360],
      scale: [1, 1],
      rotationDeg: 0,
      anchor: [0.5, 0.5],
      size: [1280, 720],
    },
    opacity: 1,
    blendMode: 'normal',
    visible: true,
    zIndex: 0,
    sourceUnavailablePolicy: 'substitute',
  };
}

function createAvatarSource(
  avatarUrl: string | null | undefined,
  avatarType: AvatarType | undefined,
): LiveCompositorSourceRef | null {
  if (!avatarUrl) return null;
  const kind: LiveCompositorSourceKind = avatarType === 'puppet' ? 'puppet' : 'model';
  return {
    sourceId: 'source-avatar-main',
    kind,
    label: avatarType === 'puppet' ? 'Host Puppet' : 'Host Model',
    entityRef: avatarUrl,
    metadata: {
      webviewProvidedRef: true,
    },
  };
}

function avatarLayer(source: LiveCompositorSourceRef): LiveCompositorLayer {
  return {
    id: 'layer-avatar',
    role: 'avatar',
    label: source.label ?? 'Avatar',
    source,
    transform: {
      position: [640, 520],
      scale: [1, 1],
      rotationDeg: 0,
      anchor: [0.5, 0.9],
      size: [520, 620],
    },
    opacity: 1,
    blendMode: 'normal',
    visible: true,
    zIndex: 20,
    sourceUnavailablePolicy: 'hold-last-frame',
  };
}

function cameraSource(binding: LiveDeviceBinding): LiveCompositorSourceRef {
  return {
    ...(binding.compositorSourceRef ?? {
      sourceId: 'source-camera-main',
      kind: 'camera' as const,
      label: binding.label,
      deviceSessionRef: binding.sessionId,
    }),
    metadata: {
      ...binding.compositorSourceRef?.metadata,
      role: binding.role,
      authorized: true,
    },
  };
}

function cameraLayer(source: LiveCompositorSourceRef): LiveCompositorLayer {
  return {
    id: 'layer-camera',
    role: 'camera',
    label: source.label ?? 'Camera',
    source,
    transform: {
      position: [1080, 560],
      scale: [0.28, 0.28],
      rotationDeg: 0,
      anchor: [0.5, 0.5],
      size: [1280, 720],
      crop: [0, 0, 1280, 720],
    },
    opacity: 1,
    blendMode: 'normal',
    visible: true,
    zIndex: 10,
    sourceUnavailablePolicy: 'diagnostic-overlay',
  };
}

function trackingOverlaySource(): LiveCompositorSourceRef {
  return {
    sourceId: 'source-tracking-overlay',
    kind: 'tracking-overlay',
    label: 'Tracking Diagnostics',
  };
}

function trackingOverlayLayer(source: LiveCompositorSourceRef): LiveCompositorLayer {
  return {
    id: 'layer-tracking-overlay',
    role: 'diagnostic',
    label: 'Tracking Overlay',
    source,
    transform: {
      position: [640, 360],
      scale: [1, 1],
      rotationDeg: 0,
      anchor: [0.5, 0.5],
      size: [1280, 720],
    },
    opacity: 0.6,
    blendMode: 'alpha',
    visible: true,
    zIndex: 90,
    sourceUnavailablePolicy: 'exclude',
  };
}

function outputRoutes(now: number): LiveOutputRoute[] {
  return [
    {
      id: 'route-monitor',
      kind: 'monitor',
      label: 'Monitor Preview',
      enabled: true,
      status: 'active',
      targetRef: LIVE_COMPOSITOR_VIEWPORT_ID,
    },
    {
      id: 'route-recording',
      kind: 'recording',
      label: 'Compositor Recording',
      enabled: false,
      status: 'unsupported',
      diagnostics: [unsupportedOutputDiagnostic(now, 'route-recording', 'recording')],
    },
    {
      id: 'route-obs',
      kind: 'obs-virtual-camera',
      label: 'OBS Virtual Camera',
      enabled: false,
      status: 'unavailable',
      diagnostics: [unavailableOutputDiagnostic(now, 'route-obs', 'OBS virtual camera')],
    },
    {
      id: 'route-rtmp',
      kind: 'rtmp',
      label: 'RTMP',
      enabled: false,
      status: 'permission-required',
      diagnostics: [permissionOutputDiagnostic(now, 'route-rtmp')],
    },
  ];
}

function localPreviewDiagnostic(now: number): LiveCompositorDiagnostic {
  return {
    id: 'diag-local-preview',
    code: 'preview-non-authoritative',
    severity: 'info',
    message: 'Local Webview preview remains available only as a non-authoritative preview.',
    timestamp: now,
  };
}

function unsupportedOutputDiagnostic(
  now: number,
  routeId: string,
  label: string,
): LiveCompositorDiagnostic {
  return {
    id: `diag-${routeId}-unsupported`,
    code: 'unsupported-output-route',
    severity: 'warning',
    message: `Compositor ${label} output is not implemented in this build.`,
    timestamp: now,
    routeId,
    retryable: false,
  };
}

function unavailableOutputDiagnostic(
  now: number,
  routeId: string,
  label: string,
): LiveCompositorDiagnostic {
  return {
    id: `diag-${routeId}-unavailable`,
    code: 'unavailable-output-route',
    severity: 'warning',
    message: `${label} backend is unavailable on this host.`,
    timestamp: now,
    routeId,
    retryable: true,
  };
}

function permissionOutputDiagnostic(now: number, routeId: string): LiveCompositorDiagnostic {
  return {
    id: `diag-${routeId}-permission-required`,
    code: 'permission-required',
    severity: 'warning',
    message: 'RTMP output requires stream credentials before it can be enabled.',
    timestamp: now,
    routeId,
    retryable: true,
  };
}

export function withLiveSceneRevision(
  scene: LiveCompositorScene,
  revision: number,
  updatedAt: number,
  patch: Partial<LiveCompositorScene> = {},
): LiveCompositorScene {
  return {
    ...scene,
    ...patch,
    revision,
    updatedAt,
    metadata: cloneMetadata(scene.metadata),
  };
}

function cloneMetadata(
  metadata: ViewportSerializableRecord | undefined,
): ViewportSerializableRecord | undefined {
  return metadata ? { ...metadata } : undefined;
}
