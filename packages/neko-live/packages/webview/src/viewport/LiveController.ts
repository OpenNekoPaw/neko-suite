import type {
  ISceneController,
  LiveCompositorCommandAction,
  LiveCompositorCommandPayload,
  LiveCompositorLayer,
  LiveCompositorLayerPatch,
  LiveCompositorScene,
  LiveCompositorSetOutputRoutePayload,
  LiveCompositorSetTrackingOverlayPayload,
  LiveOutputRoute,
  ViewportCommand,
  ViewportContextMenuRequest,
  ViewportControllerResult,
  ViewportEvent,
  ViewportFrameMeta,
  ViewportKeyInput,
  ViewportMenuItem,
  ViewportOverlayDescriptor,
  ViewportPointerInput,
  ViewportSerializableRecord,
  ViewportToolbarItem,
  ViewportWheelInput,
} from '@neko/shared';
import { LIVE_COMPOSITOR_COMMAND_ACTIONS, VIEWPORT_PROTOCOL_VERSION } from '@neko/shared';
import { EngineClient } from '@neko/neko-client';
import { withLiveSceneRevision } from './liveCompositorScene';

export interface LiveControllerOptions {
  readonly enginePort: number;
  readonly scene: LiveCompositorScene;
  readonly viewportId: string;
  readonly onSceneChange?: (scene: LiveCompositorScene) => void;
  readonly onError?: (message: string) => void;
}

type LiveViewportCommand = ViewportCommand<ViewportSerializableRecord>;

export class LiveController implements ISceneController {
  readonly sceneType = 'live' as const;

  private readonly client: Pick<EngineClient, 'dispatchViewportCommand'>;
  private readonly viewportId: string;
  private readonly onSceneChange: ((scene: LiveCompositorScene) => void) | undefined;
  private readonly onError: ((message: string) => void) | undefined;
  private sceneSnapshot: LiveCompositorScene;
  private nextSeq = 1;
  private readonly pendingCommands = new Map<
    number,
    {
      readonly action: LiveCompositorCommandAction;
      readonly payload: LiveCompositorCommandPayload;
    }
  >();

  constructor(
    options: LiveControllerOptions,
    client: Pick<EngineClient, 'dispatchViewportCommand'> = new EngineClient(options.enginePort),
  ) {
    this.sceneSnapshot = options.scene;
    this.viewportId = options.viewportId;
    this.onSceneChange = options.onSceneChange;
    this.onError = options.onError;
    this.client = client;
  }

  get sceneId(): string {
    return this.sceneSnapshot.sceneId;
  }

  updateScene(scene: LiveCompositorScene): void {
    this.sceneSnapshot = scene;
    this.nextSeq = Math.max(this.nextSeq, scene.revision + 1);
  }

  onPointerDown(_input: ViewportPointerInput): ViewportControllerResult | void {
    return undefined;
  }

  onPointerMove(_input: ViewportPointerInput): ViewportControllerResult | void {
    return undefined;
  }

  onPointerUp(_input: ViewportPointerInput): ViewportControllerResult | void {
    return undefined;
  }

  onWheel(_input: ViewportWheelInput): ViewportControllerResult | void {
    return undefined;
  }

  onKeyDown(input: ViewportKeyInput): ViewportControllerResult | void {
    if (input.key === 'Escape') {
      return { diagnostics: ['live viewport focus cleared'] };
    }
    return undefined;
  }

  getOverlays(frame?: ViewportFrameMeta): readonly ViewportOverlayDescriptor[] {
    if (!this.sceneSnapshot.trackingOverlay.visible) return [];
    if (!this.sceneSnapshot.trackingOverlay.enabled) return [];

    return [
      {
        id: this.sceneSnapshot.trackingOverlay.id,
        kind: 'text',
        sceneId: this.sceneId,
        viewportId: this.viewportId,
        coordinateSpace: 'screen',
        revision: frame?.revision ?? this.sceneSnapshot.revision,
        zIndex: this.sceneSnapshot.trackingOverlay.zIndex,
        authoritative: false,
        stalePolicy: 'draw-as-prediction',
        style: {
          fill: `rgba(251, 191, 36, ${this.sceneSnapshot.trackingOverlay.opacity})`,
        },
        payload: {
          text: `Tracking ${this.sceneSnapshot.trackingOverlay.mode}`,
          position: [14, 20],
        },
      },
    ];
  }

  getToolbarExtensions(): readonly ViewportToolbarItem[] {
    const presetOptions = this.sceneSnapshot.presets.map((preset) => ({
      id: preset.id,
      label: preset.label,
    }));
    const routeOptions = this.sceneSnapshot.outputRoutes.map((route) => ({
      id: route.id,
      label: route.label ?? route.kind,
      disabled:
        route.status === 'unsupported' ||
        route.status === 'unavailable' ||
        route.status === 'permission-required',
    }));

    return [
      {
        id: 'live-preset',
        kind: 'select',
        label: 'Preset',
        icon: 'P',
        action: LIVE_COMPOSITOR_COMMAND_ACTIONS.setPreset,
        group: 'live',
        order: 100,
        value: this.sceneSnapshot.activePresetId ?? this.sceneSnapshot.presets[0]?.id ?? '',
        options: presetOptions,
        payload: {
          presetId: this.sceneSnapshot.activePresetId ?? this.sceneSnapshot.presets[0]?.id ?? '',
        },
      },
      {
        id: 'live-tracking-overlay',
        kind: 'toggle',
        label: 'Tracking Overlay',
        icon: 'T',
        action: LIVE_COMPOSITOR_COMMAND_ACTIONS.setTrackingOverlay,
        group: 'live',
        order: 101,
        toggled:
          this.sceneSnapshot.trackingOverlay.enabled &&
          this.sceneSnapshot.trackingOverlay.visible,
        payload: {
          enabled: this.sceneSnapshot.trackingOverlay.enabled,
          visible: this.sceneSnapshot.trackingOverlay.visible,
        },
      },
      {
        id: 'live-output-route',
        kind: 'select',
        label: 'Output',
        icon: 'O',
        action: LIVE_COMPOSITOR_COMMAND_ACTIONS.setOutputRoute,
        group: 'live',
        order: 102,
        value: activeRouteId(this.sceneSnapshot.outputRoutes),
        options: routeOptions,
        payload: {
          routeId: activeRouteId(this.sceneSnapshot.outputRoutes),
        },
      },
    ];
  }

  getContextMenu(_request: ViewportContextMenuRequest): readonly ViewportMenuItem[] {
    return this.sceneSnapshot.layers
      .slice()
      .sort((left, right) => left.zIndex - right.zIndex)
      .map((layer) => ({
        id: `live-toggle-layer-${layer.id}`,
        label: layer.label ?? layer.id,
        action: LIVE_COMPOSITOR_COMMAND_ACTIONS.updateLayer,
        checked: layer.visible,
        disabled: layer.locked,
        payload: {
          layerId: layer.id,
          visible: layer.visible,
        },
      }));
  }

  async handleViewportEvent(event: ViewportEvent): Promise<void> {
    if (event.status === 'error') {
      this.pendingCommands.delete(event.ackSeq);
      this.onError?.(event.error?.message ?? 'live compositor command failed');
      return;
    }

    const pending = this.pendingCommands.get(event.ackSeq);
    this.pendingCommands.delete(event.ackSeq);
    const nextScene = applyAckToScene(this.sceneSnapshot, event, pending);
    this.sceneSnapshot = nextScene;
    this.onSceneChange?.(nextScene);
  }

  async setPreset(presetId: string): Promise<ViewportEvent> {
    return this.dispatchLiveCommand(LIVE_COMPOSITOR_COMMAND_ACTIONS.setPreset, { presetId });
  }

  async updateLayer(layerId: string, patch: LiveCompositorLayerPatch): Promise<ViewportEvent> {
    return this.dispatchLiveCommand(LIVE_COMPOSITOR_COMMAND_ACTIONS.updateLayer, {
      layerId,
      patch,
    });
  }

  async toggleLayerVisibility(layerId: string, visible: boolean): Promise<ViewportEvent> {
    return this.updateLayer(layerId, { visible });
  }

  async setTrackingOverlay(
    payload: LiveCompositorSetTrackingOverlayPayload,
  ): Promise<ViewportEvent> {
    return this.dispatchLiveCommand(
      LIVE_COMPOSITOR_COMMAND_ACTIONS.setTrackingOverlay,
      payload,
    );
  }

  async toggleTrackingOverlay(): Promise<ViewportEvent> {
    const next = {
      ...this.sceneSnapshot.trackingOverlay,
      enabled: !this.sceneSnapshot.trackingOverlay.enabled,
      visible: !this.sceneSnapshot.trackingOverlay.visible,
    };
    return this.setTrackingOverlay({ trackingOverlay: next });
  }

  async setOutputRoute(payload: LiveCompositorSetOutputRoutePayload): Promise<ViewportEvent> {
    return this.dispatchLiveCommand(LIVE_COMPOSITOR_COMMAND_ACTIONS.setOutputRoute, payload);
  }

  async handleToolbarAction(item: ViewportToolbarItem): Promise<void> {
    if (item.action === LIVE_COMPOSITOR_COMMAND_ACTIONS.setPreset) {
      const presetId = readString(item.value) ?? readString(item.payload?.['presetId']);
      if (presetId) {
        await this.setPreset(presetId);
      }
      return;
    }

    if (item.action === LIVE_COMPOSITOR_COMMAND_ACTIONS.setTrackingOverlay) {
      await this.toggleTrackingOverlay();
      return;
    }

    if (item.action === LIVE_COMPOSITOR_COMMAND_ACTIONS.setOutputRoute) {
      const routeId = readString(item.value) ?? readString(item.payload?.['routeId']);
      if (routeId) {
        const route = this.sceneSnapshot.outputRoutes.find((candidate) => candidate.id === routeId);
        await this.setOutputRoute({ routeId, enabled: true, route });
      }
    }
  }

  async handleMenuAction(item: ViewportMenuItem): Promise<void> {
    if (item.action !== LIVE_COMPOSITOR_COMMAND_ACTIONS.updateLayer) return;
    const layerId = readString(item.payload?.['layerId']);
    const visible = readBoolean(item.payload?.['visible']);
    if (layerId && visible !== undefined) {
      await this.toggleLayerVisibility(layerId, !visible);
    }
  }

  createViewportCommand(
    action: LiveCompositorCommandAction,
    payload: LiveCompositorCommandPayload,
  ): LiveViewportCommand {
    const seq = this.nextSeq++;
    return {
      protocolVersion: VIEWPORT_PROTOCOL_VERSION,
      domain: 'scene',
      action,
      sceneId: this.sceneId,
      viewportId: this.viewportId,
      seq,
      correlationId: `${this.viewportId}:${seq}`,
      timestamp: Date.now(),
      source: 'user',
      baseRevision: this.sceneSnapshot.revision,
      payload: payload as ViewportSerializableRecord,
    };
  }

  private async dispatchLiveCommand(
    action: LiveCompositorCommandAction,
    payload: LiveCompositorCommandPayload,
  ): Promise<ViewportEvent> {
    const command = this.createViewportCommand(action, payload);
    this.pendingCommands.set(command.seq, { action, payload });
    try {
      const event = await this.client.dispatchViewportCommand(command);
      await this.handleViewportEvent(event);
      return event;
    } catch (error) {
      this.pendingCommands.delete(command.seq);
      throw error;
    }
  }
}

function applyAckToScene(
  scene: LiveCompositorScene,
  event: ViewportEvent,
  pending:
    | {
        readonly action: LiveCompositorCommandAction;
        readonly payload: LiveCompositorCommandPayload;
      }
    | undefined,
): LiveCompositorScene {
  const revision = event.revision;
  const updatedAt = event.timestamp;

  if (event.event.startsWith(LIVE_COMPOSITOR_COMMAND_ACTIONS.setPreset)) {
    const pendingPayload = pending?.payload as Partial<{ readonly presetId: unknown }> | undefined;
    const activePresetId =
      readString(event.payload['activePresetId']) ?? readString(pendingPayload?.presetId);
    return withLiveSceneRevision(scene, revision, updatedAt, {
      activePresetId: activePresetId ?? scene.activePresetId,
    });
  }

  if (event.event.startsWith(LIVE_COMPOSITOR_COMMAND_ACTIONS.updateLayer)) {
    const pendingPayload =
      pending?.payload as
        | Partial<{ readonly layerId: unknown; readonly patch: LiveCompositorLayerPatch }>
        | undefined;
    const layerId = readString(event.payload['layerId']) ?? readString(pendingPayload?.layerId);
    if (!layerId) return withLiveSceneRevision(scene, revision, updatedAt);
    return withLiveSceneRevision(scene, revision, updatedAt, {
      layers: scene.layers.map((layer) =>
        layer.id === layerId
          ? applyLocalLayerAck(layer, event.payload, pendingPayload?.patch)
          : layer,
      ),
    });
  }

  if (event.event.startsWith(LIVE_COMPOSITOR_COMMAND_ACTIONS.setTrackingOverlay)) {
    const pendingPayload =
      pending?.payload as
        | Partial<{ readonly trackingOverlay: LiveCompositorScene['trackingOverlay'] }>
        | undefined;
    return withLiveSceneRevision(scene, revision, updatedAt, {
      trackingOverlay: pendingPayload?.trackingOverlay ?? scene.trackingOverlay,
    });
  }

  if (event.event.startsWith(LIVE_COMPOSITOR_COMMAND_ACTIONS.setOutputRoute)) {
    const pendingPayload =
      pending?.payload as
        | Partial<{
            readonly routeId: unknown;
            readonly enabled: unknown;
            readonly route: LiveOutputRoute;
          }>
        | undefined;
    const routeId = readString(event.payload['routeId']) ?? readString(pendingPayload?.routeId);
    if (!routeId) return withLiveSceneRevision(scene, revision, updatedAt);
    return withLiveSceneRevision(scene, revision, updatedAt, {
      outputRoutes: scene.outputRoutes.map((route) =>
        route.id === routeId
          ? {
              ...(pendingPayload?.route ?? route),
              enabled: readBoolean(pendingPayload?.enabled) ?? route.enabled,
            }
          : route,
      ),
    });
  }

  return withLiveSceneRevision(scene, revision, updatedAt);
}

function applyLocalLayerAck(
  layer: LiveCompositorLayer,
  payload: ViewportSerializableRecord,
  patch: LiveCompositorLayerPatch | undefined,
): LiveCompositorLayer {
  const visible = readBoolean(payload['visible']) ?? patch?.visible;
  return {
    ...layer,
    ...patch,
    visible: visible ?? layer.visible,
  };
}

function activeRouteId(routes: readonly LiveOutputRoute[]): string {
  return (
    routes.find((route) => route.status === 'active' && route.enabled)?.id ??
    routes.find((route) => route.kind === 'monitor')?.id ??
    routes[0]?.id ??
    ''
  );
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}
