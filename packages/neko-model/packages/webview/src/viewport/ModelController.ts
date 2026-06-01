import type {
  CharacterPreviewModeId,
  CharacterPreviewModeStatePayload,
  ISceneController,
  SceneCommandAck,
  SceneCommandEnvelope,
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
  SceneSelectionKind,
  SelectionTarget,
} from '@neko/shared';
import {
  EngineClient,
  isRecord,
  readFiniteNumber,
  readString,
  type SceneControlSocket,
} from '@neko/neko-client';
import type { ModelState } from '../stores/modelStore';
import { useModelStore } from '../stores/modelStore';
import type { ViewportQueryResolution } from '../components/InteractionLayer';
import {
  buildViewportPointerQueryFromPosition,
  isCompatibleViewportQueryResult,
} from '../components/InteractionLayer';
import type { EditableNodeTransform } from '../scene/SceneEditingTypes';

type ModelViewportAction =
  | 'viewport:select'
  | 'viewport:marquee'
  | 'viewport:transform'
  | 'viewport:camera';

type ModelPreviewAction =
  | 'scene:model:characterPreview:setMode'
  | 'scene:model:characterPreview:resetModeCamera'
  | 'scene:model:characterPreview:playback';

type ModelViewportCommand = ViewportCommandForAction<ModelViewportAction>;
interface ModelPreviewCommand {
  readonly protocolVersion: 1;
  readonly domain: 'scene';
  readonly action: ModelPreviewAction;
  readonly sceneId: string;
  readonly viewportId: string;
  readonly seq: number;
  readonly correlationId: string;
  readonly timestamp: number;
  readonly source: 'user';
  readonly baseRevision: number;
  readonly payload: CharacterPreviewCommandPayload;
}
type ModelPredictionKind = ModelState['localPredictions'][number]['kind'];
type DragPredictionFrame =
  | { readonly kind: 'animationFrame'; readonly id: number }
  | { readonly kind: 'timeout'; readonly id: ReturnType<typeof setTimeout> };

interface CharacterPreviewCommandPayload {
  readonly characterId: string;
  readonly modeId: CharacterPreviewModeId;
  readonly viewportId: string;
  readonly resetCamera?: boolean;
  readonly action?: 'play' | 'pause' | 'stop' | 'seek';
  readonly clockMs?: number;
}

interface ModelViewportHitTestResult {
  readonly sceneId?: string;
  readonly viewportId?: string;
  readonly revision?: number;
  readonly nodeId?: unknown;
  readonly candidates?: readonly SelectionTarget[];
}

interface ModelViewportDragState {
  readonly nodeId: string;
  readonly startPosition: readonly [number, number];
  readonly latestPosition: readonly [number, number];
  readonly baseRevision: number;
  readonly predictionSeq: number;
}

const PREDICTION_POINT_BY_KIND: Record<ModelPredictionKind, readonly [number, number]> = {
  transform: [24, 24],
  camera: [36, 24],
  morph: [48, 24],
  ik: [60, 24],
  brush: [72, 24],
  selection: [84, 24],
  snap: [96, 24],
  visibility: [108, 24],
  topology: [120, 24],
};

interface ViewportCommandForAction<TAction extends string> extends ViewportCommandBase {
  readonly action: TAction;
}

interface ViewportCommandBase {
  readonly protocolVersion: 1;
  readonly domain: 'viewport';
  readonly action: string;
  readonly sceneId: string;
  readonly viewportId: string;
  readonly seq: number;
  readonly correlationId: string;
  readonly timestamp: number;
  readonly source: 'user';
  readonly baseRevision: number;
  readonly payload: ViewportSerializableRecord;
}

export interface ModelControllerOptions {
  readonly enginePort: number;
  readonly sceneId: string;
  readonly viewportId: string;
  readonly sceneRevision: number;
  readonly resolution?: ViewportQueryResolution | null;
  readonly onSelectNode?: (nodeId: string | null) => void;
  readonly onError?: (message: string) => void;
  readonly onMaterialPreview?: () => void | Promise<void>;
  readonly onInteractiveStreamActivity?: () => void;
  readonly getViewportRect?: () => Pick<DOMRect, 'width' | 'height'>;
  readonly sceneControlSocket?: SceneControlSocket | null;
}

export class ModelController implements ISceneController {
  readonly sceneType = '3d' as const;

  private readonly client: EngineClient;
  private readonly options: ModelControllerOptions;
  private activeDrag: ModelViewportDragState | null = null;
  private dragPredictionFrame: DragPredictionFrame | null = null;

  constructor(options: ModelControllerOptions, client = new EngineClient(options.enginePort)) {
    this.options = options;
    this.client = client;
  }

  get sceneId(): string {
    return this.options.sceneId;
  }

  async onPointerDown(input: ViewportPointerInput): Promise<ViewportControllerResult | void> {
    if (input.button !== 0) return undefined;
    if (
      input.modifiers.alt ||
      input.modifiers.shift ||
      input.modifiers.ctrl ||
      input.modifiers.meta
    ) {
      return undefined;
    }

    const maybeDrag = this.tryBeginTransformDrag(input);
    if (maybeDrag) {
      this.options.onInteractiveStreamActivity?.();
      return maybeDrag;
    }

    const rect = this.options.getViewportRect?.() ?? { width: 1, height: 1 };
    const query = buildViewportPointerQueryFromPosition(
      this.options.viewportId,
      this.options.sceneRevision,
      rect,
      input.position,
    );
    const payload: ViewportSerializableRecord = this.options.resolution
      ? {
          viewportId: query.viewportId,
          sceneRevision: query.sceneRevision,
          x: query.x,
          y: query.y,
          sceneId: this.options.sceneId,
          resolution: viewportResolutionPayload(this.options.resolution),
        }
      : {
          viewportId: query.viewportId,
          sceneRevision: query.sceneRevision,
          x: query.x,
          y: query.y,
          sceneId: this.options.sceneId,
        };
    const event = await this.sendViewportCommand('viewport:select', payload);
    await this.handleViewportEvent(event);
    return undefined;
  }

  onPointerMove(input: ViewportPointerInput): ViewportControllerResult | void {
    if (!this.activeDrag) {
      return undefined;
    }
    this.activeDrag = {
      ...this.activeDrag,
      latestPosition: input.position,
    };
    this.options.onInteractiveStreamActivity?.();
    this.scheduleDragPrediction();
    return undefined;
  }

  async onPointerUp(input: ViewportPointerInput): Promise<ViewportControllerResult | void> {
    if (!this.activeDrag) {
      return undefined;
    }
    const drag = {
      ...this.activeDrag,
      latestPosition: input.position,
    };
    this.options.onInteractiveStreamActivity?.();
    this.cancelScheduledDragPrediction();
    this.activeDrag = null;
    const transform = this.transformForDrag(drag);
    if (!transform) {
      useModelStore.getState().rollbackTransformPrediction(drag.predictionSeq);
      useModelStore.getState().rollbackLocalPrediction(drag.predictionSeq);
      return undefined;
    }
    try {
      await this.dispatchTransformCommand(
        drag.nodeId,
        transform,
        drag.predictionSeq,
        drag.baseRevision,
      );
    } catch {
      // dispatchTransformCommand already rolls back and reports through the caller path.
    }
    return undefined;
  }

  onPointerCancel(_input: ViewportPointerInput): ViewportControllerResult | void {
    if (!this.activeDrag) {
      return undefined;
    }
    const seq = this.activeDrag.predictionSeq;
    this.options.onInteractiveStreamActivity?.();
    this.cancelScheduledDragPrediction();
    this.activeDrag = null;
    useModelStore.getState().rollbackTransformPrediction(seq);
    useModelStore.getState().rollbackLocalPrediction(seq);
    return { diagnostics: ['model transform drag canceled'] };
  }

  onWheel(_input: ViewportWheelInput): ViewportControllerResult | void {
    return undefined;
  }

  onKeyDown(input: ViewportKeyInput): ViewportControllerResult | void {
    if (input.key === 'Escape') {
      this.options.onSelectNode?.(null);
      return { diagnostics: ['selection cleared'] };
    }
    return undefined;
  }

  getOverlays(frame?: ViewportFrameMeta): readonly ViewportOverlayDescriptor[] {
    const state = useModelStore.getState();
    return createModelPredictionOverlays(
      state.localPredictions,
      state.pendingTransformPredictions,
      this.options.sceneId,
      this.options.viewportId,
      frame?.revision ?? this.options.sceneRevision,
    );
  }

  getToolbarExtensions(): readonly ViewportToolbarItem[] {
    const state = useModelStore.getState();
    return [
      {
        id: 'model-transform-translate',
        kind: 'toggle',
        label: 'Translate',
        icon: 'T',
        action: 'scene:model:transform-mode',
        group: 'model',
        order: 100,
        toggled: state.transformMode === 'translate',
        payload: { mode: 'translate' },
      },
      {
        id: 'model-transform-rotate',
        kind: 'toggle',
        label: 'Rotate',
        icon: 'R',
        action: 'scene:model:transform-mode',
        group: 'model',
        order: 101,
        toggled: state.transformMode === 'rotate',
        payload: { mode: 'rotate' },
      },
      {
        id: 'model-transform-scale',
        kind: 'toggle',
        label: 'Scale',
        icon: 'S',
        action: 'scene:model:transform-mode',
        group: 'model',
        order: 102,
        toggled: state.transformMode === 'scale',
        payload: { mode: 'scale' },
      },
      {
        id: 'model-material-preview',
        kind: 'toggle',
        label: 'Material',
        icon: 'M',
        action: 'scene:model:material-preview',
        group: 'model',
        order: 110,
        toggled: state.qualityPreviewDataUrl !== null,
      },
    ];
  }

  getContextMenu(request: ViewportContextMenuRequest): readonly ViewportMenuItem[] {
    return [
      {
        id: 'model-select-none',
        label: 'Clear selection',
        action: 'scene:model:select-none',
        disabled: useModelStore.getState().selectedNodeId === null,
        payload: { sceneId: request.sceneId, viewportId: request.viewportId },
      },
    ];
  }

  async handleViewportEvent(event: ViewportEvent): Promise<void> {
    if (event.status === 'error') {
      this.options.onError?.(event.error?.message ?? 'viewport command failed');
      if (event.ackSeq > 0) {
        useModelStore.getState().rollbackTransformPrediction(event.ackSeq);
        useModelStore.getState().rollbackLocalPrediction(event.ackSeq);
      }
      return;
    }

    if (event.event.startsWith('viewport:select')) {
      const result = event.payload as ModelViewportHitTestResult;
      if (
        isCompatibleViewportQueryResult(
          {
            sceneId: result.sceneId,
            viewportId: result.viewportId ?? this.options.viewportId,
            revision: result.revision ?? event.revision,
          },
          this.options.sceneId,
          this.options.viewportId,
          this.options.sceneRevision,
        )
      ) {
        const candidates = Array.isArray(result.candidates) ? result.candidates : [];
        const primary = candidates[0];
        useModelStore.setState({
          selectedTargets: candidates.length > 0 ? [...candidates] : [],
        });
        this.options.onSelectNode?.(
          typeof primary?.nodeId === 'string'
            ? primary.nodeId
            : typeof result.nodeId === 'string'
              ? result.nodeId
              : null,
        );
      }
    }

    if (event.event.startsWith('scene:model:characterPreview:')) {
      useModelStore.getState().applyCharacterPreviewEvent(event);
    }

    const appliedSeq = event.appliedSeq ?? event.ackSeq;
    if (appliedSeq > 0) {
      useModelStore.getState().commitPredictionsThrough(appliedSeq);
      useModelStore.getState().commitLocalPredictionsThrough(appliedSeq);
    }
  }

  async sendViewportCommand(
    action: ModelViewportAction,
    payload: ViewportSerializableRecord,
    baseRevision = this.options.sceneRevision,
  ): Promise<ViewportEvent> {
    return this.dispatchViewportCommand(this.createViewportCommand(action, payload, baseRevision));
  }

  async transformNode(nodeId: string, transform: EditableNodeTransform): Promise<ViewportEvent> {
    return this.dispatchTransformCommand(nodeId, transform);
  }

  private async dispatchTransformCommand(
    nodeId: string,
    transform: EditableNodeTransform,
    existingSeq?: number,
    baseRevision = this.options.sceneRevision,
  ): Promise<ViewportEvent> {
    const command = this.createViewportCommand(
      'viewport:transform',
      {
        nodeId,
        position: vec3ToTuple(transform.position),
        rotation: quatToTuple(transform.rotation),
        scale: vec3ToTuple(transform.scale),
      },
      baseRevision,
      existingSeq,
    );
    this.upsertTransformPrediction(command.seq, nodeId, transform, baseRevision);

    try {
      const event = await this.dispatchViewportCommand(command);
      await this.handleViewportEvent(event);
      return event;
    } catch (error) {
      useModelStore.getState().rollbackTransformPrediction(command.seq);
      useModelStore.getState().rollbackLocalPrediction(command.seq);
      throw error;
    }
  }

  async updateCamera(): Promise<ViewportEvent> {
    const store = useModelStore.getState();
    const command = this.createViewportCommand(
      'viewport:camera',
      {
        position: vec3ToTuple(store.getCameraPosition()),
        target: vec3ToTuple(store.cameraTarget),
      },
      this.options.sceneRevision,
    );
    store.createLocalPrediction({
      kind: 'camera',
      seq: command.seq,
      viewportId: this.options.viewportId,
      sceneRevision: this.options.sceneRevision,
      payload: command.payload,
    });
    try {
      const event = await this.dispatchViewportCommand(command);
      await this.handleViewportEvent(event);
      useModelStore.getState().commitLocalPredictionsThrough(command.seq);
      return event;
    } catch (error) {
      useModelStore.getState().rollbackLocalPrediction(command.seq);
      throw error;
    }
  }

  async requestMaterialPreview(): Promise<void> {
    await this.options.onMaterialPreview?.();
  }

  async setCharacterPreviewMode(
    characterId: string,
    modeId: CharacterPreviewModeId,
  ): Promise<ViewportEvent> {
    const command = this.createPreviewCommand('scene:model:characterPreview:setMode', {
      characterId,
      modeId,
      viewportId: this.options.viewportId,
    });
    useModelStore.getState().requestCharacterPreviewMode(modeId);
    return this.dispatchPreviewCommand(command);
  }

  async resetCharacterPreviewCamera(
    characterId: string,
    modeId: CharacterPreviewModeId,
  ): Promise<ViewportEvent> {
    const command = this.createPreviewCommand('scene:model:characterPreview:resetModeCamera', {
      characterId,
      modeId,
      viewportId: this.options.viewportId,
      resetCamera: true,
    });
    return this.dispatchPreviewCommand(command);
  }

  async controlCharacterPreviewPlayback(
    characterId: string,
    modeId: CharacterPreviewModeId,
    action: 'play' | 'pause' | 'stop' | 'seek',
    clockMs?: number,
  ): Promise<ViewportEvent> {
    const command = this.createPreviewCommand('scene:model:characterPreview:playback', {
      characterId,
      modeId,
      viewportId: this.options.viewportId,
      action,
      ...(clockMs !== undefined ? { clockMs } : {}),
    });
    return this.dispatchPreviewCommand(command);
  }

  private createViewportCommand(
    action: ModelViewportAction,
    payload: ViewportSerializableRecord,
    baseRevision = this.options.sceneRevision,
    existingSeq?: number,
  ): ModelViewportCommand {
    const seq = existingSeq ?? useModelStore.getState().allocateSceneCommandSeq();
    return {
      protocolVersion: 1,
      domain: 'viewport',
      action,
      sceneId: this.options.sceneId,
      viewportId: this.options.viewportId,
      seq,
      correlationId: `${this.options.viewportId}:${seq}`,
      timestamp: Date.now(),
      source: 'user',
      baseRevision,
      payload,
    };
  }

  private createPreviewCommand(
    action: ModelPreviewAction,
    payload: CharacterPreviewCommandPayload,
    baseRevision = this.options.sceneRevision,
  ): ModelPreviewCommand {
    const seq = useModelStore.getState().allocateSceneCommandSeq();
    return {
      protocolVersion: 1,
      domain: 'scene',
      action,
      sceneId: this.options.sceneId,
      viewportId: this.options.viewportId,
      seq,
      correlationId: `${this.options.viewportId}:preview:${seq}`,
      timestamp: Date.now(),
      source: 'user',
      baseRevision,
      payload: stripUndefinedPayload(payload),
    };
  }

  private async dispatchPreviewCommand(command: ModelPreviewCommand): Promise<ViewportEvent> {
    const socket = this.options.sceneControlSocket;
    if (!socket) {
      const state = useModelStore.getState();
      state.applyCharacterPreviewState(createUnavailablePreviewState(command));
      return viewportErrorEvent(
        command,
        'scene-control-unavailable',
        'scene control websocket is disconnected',
      );
    }

    try {
      const event = await socket.sendViewportCommand(commandToViewportCommand(command));
      await this.handleViewportEvent(event);
      return event;
    } catch (error) {
      const failed = viewportErrorEvent(
        command,
        'scene-control-unavailable',
        toErrorMessage(error),
      );
      useModelStore.getState().applyCharacterPreviewEvent(failed);
      throw error;
    }
  }

  private async dispatchViewportCommand(command: ModelViewportCommand): Promise<ViewportEvent> {
    const socket = this.options.sceneControlSocket;
    if (!socket) {
      if (this.options.sceneControlSocket === null) {
        return viewportErrorEvent(
          command,
          'sceneControlDisconnected',
          'scene control websocket is disconnected',
        );
      }
      return this.client.dispatchViewportCommand(command);
    }

    switch (command.action) {
      case 'viewport:select':
        return this.dispatchSelectOverSocket(socket, command);
      case 'viewport:transform':
        return this.dispatchTransformOverSocket(socket, command);
      case 'viewport:camera':
        return this.dispatchCameraOverSocket(socket, command);
      default:
        return this.client.dispatchViewportCommand(command);
    }
  }

  private tryBeginTransformDrag(input: ViewportPointerInput): ViewportControllerResult | void {
    const state = useModelStore.getState();
    const nodeId = state.selectedNodeId;
    const overlay = state.viewportOverlay;
    const rect = this.options.getViewportRect?.() ?? { width: 1, height: 1 };
    if (!nodeId || !overlay || !isPointerNearSelectedGizmo(input.position, overlay, nodeId, rect)) {
      return undefined;
    }

    const seq = state.allocateSceneCommandSeq();
    this.cancelScheduledDragPrediction();
    this.activeDrag = {
      nodeId,
      startPosition: input.position,
      latestPosition: input.position,
      baseRevision: this.options.sceneRevision,
      predictionSeq: seq,
    };
    const transform = this.transformForDrag(this.activeDrag);
    if (transform) {
      this.upsertTransformPrediction(seq, nodeId, transform, this.options.sceneRevision);
    }
    return { diagnostics: ['model transform drag started'] };
  }

  private scheduleDragPrediction(): void {
    if (this.dragPredictionFrame !== null) {
      return;
    }
    this.dragPredictionFrame = requestDragPredictionFrame(() => {
      this.dragPredictionFrame = null;
      if (this.activeDrag) {
        this.updateDragPrediction(this.activeDrag);
      }
    });
  }

  private cancelScheduledDragPrediction(): void {
    if (this.dragPredictionFrame === null) {
      return;
    }
    cancelDragPredictionFrame(this.dragPredictionFrame);
    this.dragPredictionFrame = null;
  }

  private updateDragPrediction(drag: ModelViewportDragState): void {
    const transform = this.transformForDrag(drag);
    if (!transform) return;
    this.upsertTransformPrediction(drag.predictionSeq, drag.nodeId, transform, drag.baseRevision);
  }

  private transformForDrag(drag: ModelViewportDragState): EditableNodeTransform | null {
    const node = useModelStore.getState().sceneNodes.find((item) => item.nodeId === drag.nodeId);
    const transform = node?.transform;
    if (!transform?.position || !transform.rotation || !transform.scale) {
      return null;
    }
    const dx = (drag.latestPosition[0] - drag.startPosition[0]) / 100;
    const dy = (drag.latestPosition[1] - drag.startPosition[1]) / 100;
    return {
      position: {
        x: transform.position.x + dx,
        y: transform.position.y - dy,
        z: transform.position.z,
      },
      rotation: transform.rotation,
      scale: transform.scale,
    };
  }

  private upsertTransformPrediction(
    seq: number,
    nodeId: string,
    transform: EditableNodeTransform,
    baseRevision: number,
  ): void {
    const store = useModelStore.getState();
    store.addTransformPrediction({
      seq,
      nodeId,
      position: transform.position,
      rotation: transform.rotation,
      scale: transform.scale,
    });
    const existing = store.localPredictions.find((prediction) => prediction.seq === seq);
    if (existing) {
      store.localPredictionLayer.update(existing.id, {
        position: transform.position,
        rotation: transform.rotation,
        scale: transform.scale,
      });
      useModelStore.setState({ localPredictions: store.localPredictionLayer.active() });
      return;
    }
    store.createLocalPrediction({
      kind: 'transform',
      seq,
      viewportId: this.options.viewportId,
      sceneRevision: baseRevision,
      nodeId,
      payload: {
        position: transform.position,
        rotation: transform.rotation,
        scale: transform.scale,
      },
    });
  }

  private async dispatchSelectOverSocket(
    socket: SceneControlSocket,
    command: ModelViewportCommand,
  ): Promise<ViewportEvent> {
    const result = await socket.query('selectionQuery', {
      ...command.payload,
      mask: selectionMaskForWorkflow(useModelStore.getState().selectionWorkflow),
      mode: 'replace',
    });
    return viewportEventFromPayload(
      command,
      'viewport:select:ack',
      normalizeHitTestPayload(result, command),
      {
        appliedSeq: 0,
      },
    );
  }

  private async dispatchTransformOverSocket(
    socket: SceneControlSocket,
    command: ModelViewportCommand,
  ): Promise<ViewportEvent> {
    const nodeId = readString(command.payload['nodeId']);
    const position = readVec3Tuple(command.payload['position']);
    const rotation = readQuatTuple(command.payload['rotation']);
    const scale = readVec3Tuple(command.payload['scale']);
    if (!nodeId || !position || !rotation || !scale) {
      return viewportErrorEvent(
        command,
        'invalidTransformPayload',
        'viewport transform payload is invalid',
      );
    }

    const envelope: SceneCommandEnvelope = {
      seq: command.seq,
      baseRevision: command.baseRevision,
      command: {
        type: 'transform',
        payloadJson: JSON.stringify({ nodeId, position, rotation, scale }),
      },
    };
    const ack = await socket.sendCommand(envelope);
    return viewportEventFromSceneAck(command, 'viewport:transform:ack', ack, {
      sceneId: command.sceneId,
      viewportId: command.viewportId,
      revision: ack.revision,
      nodeId,
    });
  }

  private async dispatchCameraOverSocket(
    socket: SceneControlSocket,
    command: ModelViewportCommand,
  ): Promise<ViewportEvent> {
    const position = readVec3Tuple(command.payload['position']);
    const target = readVec3Tuple(command.payload['target']);
    if (!position || !target) {
      return viewportErrorEvent(
        command,
        'invalidCameraPayload',
        'viewport camera payload is invalid',
      );
    }

    const ack = await socket.updateViewportCamera({
      sceneId: command.sceneId,
      sceneRevision: command.baseRevision,
      viewportId: command.viewportId,
      position,
      target,
      resolution: readViewportResolution(command.payload['resolution']),
    });
    const revision = ack.acceptedRevision ?? ack.revision ?? command.baseRevision;
    return viewportEventFromPayload(
      command,
      'viewport:camera:ack',
      {
        sceneId: ack.sceneId ?? command.sceneId,
        viewportId: ack.viewportId ?? command.viewportId,
        revision,
        camera: 'editor',
      },
      { revision, appliedSeq: command.seq },
    );
  }
}

export async function handleModelToolbarAction(
  item: ViewportToolbarItem,
  controller?: ModelController,
): Promise<void> {
  await handleModelAction(item.action, item.payload, controller);
}

export async function handleModelMenuAction(
  item: ViewportMenuItem,
  controller?: ModelController,
): Promise<void> {
  await handleModelAction(item.action, item.payload, controller);
}

async function handleModelAction(
  action: string | undefined,
  payload: ViewportSerializableRecord | undefined,
  controller?: ModelController,
): Promise<void> {
  if (action === 'scene:model:transform-mode') {
    const mode = payload?.['mode'];
    if (mode === 'translate' || mode === 'rotate' || mode === 'scale') {
      useModelStore.getState().setTransformMode(mode);
    }
  }
  if (action === 'scene:model:select-none') {
    useModelStore.getState().selectNode(null);
  }
  if (action === 'scene:model:material-preview') {
    await controller?.requestMaterialPreview();
  }
}

function createModelPredictionOverlays(
  localPredictions: ModelState['localPredictions'],
  transformPredictions: ModelState['pendingTransformPredictions'],
  sceneId: string,
  viewportId: string,
  revision: number,
): readonly ViewportOverlayDescriptor[] {
  const overlays: ViewportOverlayDescriptor[] = [];
  for (const prediction of transformPredictions) {
    overlays.push({
      id: `model-transform-prediction-${prediction.seq}`,
      kind: 'points',
      sceneId,
      viewportId,
      coordinateSpace: 'screen',
      revision,
      appliedSeq: prediction.seq,
      authoritative: false,
      stalePolicy: 'draw-as-prediction',
      style: { fill: 'rgba(251, 191, 36, 0.95)', opacity: 0.9 },
      payload: { points: [[24, 24]], radius: 5, nodeId: prediction.nodeId },
    });
  }

  for (const prediction of localPredictions) {
    overlays.push({
      id: `model-local-prediction-${prediction.id}`,
      kind: prediction.kind === 'morph' ? 'rect' : 'points',
      sceneId,
      viewportId,
      coordinateSpace: 'screen',
      revision,
      appliedSeq: prediction.seq,
      authoritative: false,
      stalePolicy: 'draw-as-prediction',
      style: { stroke: 'rgba(52, 211, 153, 0.95)', fill: 'rgba(52, 211, 153, 0.8)' },
      payload:
        prediction.kind === 'morph'
          ? { rect: [32, 32, 42, 12], predictionId: prediction.id }
          : {
              points: [
                [
                  PREDICTION_POINT_BY_KIND[prediction.kind][0],
                  PREDICTION_POINT_BY_KIND[prediction.kind][1],
                ],
              ],
              radius: 6,
              predictionId: prediction.id,
            },
    });
  }
  return overlays;
}

function requestDragPredictionFrame(callback: () => void): DragPredictionFrame {
  if (typeof requestAnimationFrame === 'function') {
    return {
      kind: 'animationFrame',
      id: requestAnimationFrame(callback),
    };
  }
  return {
    kind: 'timeout',
    id: setTimeout(callback, 16),
  };
}

function cancelDragPredictionFrame(frame: DragPredictionFrame): void {
  if (frame.kind === 'animationFrame') {
    cancelAnimationFrame(frame.id);
    return;
  }
  clearTimeout(frame.id);
}

function isPointerNearSelectedGizmo(
  position: readonly [number, number],
  overlay: NonNullable<ModelState['viewportOverlay']>,
  nodeId: string,
  rect: Pick<DOMRect, 'width' | 'height'>,
): boolean {
  const anchors = overlay.gizmoAnchors ?? [];
  for (const anchor of anchors) {
    if (anchor.nodeId !== nodeId || !anchor.screenPosition) continue;
    const anchorX = anchor.screenPosition.x * rect.width;
    const anchorY = anchor.screenPosition.y * rect.height;
    const dx = position[0] - anchorX;
    const dy = position[1] - anchorY;
    if (Math.hypot(dx, dy) <= 24) {
      return true;
    }
  }
  return false;
}

function vec3ToTuple(
  value: EditableNodeTransform['position'] | readonly [number, number, number],
): [number, number, number] {
  if (isVec3Tuple(value)) {
    return [value[0], value[1], value[2]];
  }
  return [value.x, value.y, value.z];
}

function quatToTuple(value: EditableNodeTransform['rotation']): [number, number, number, number] {
  return [value.x, value.y, value.z, value.w];
}

function isVec3Tuple(
  value: EditableNodeTransform['position'] | readonly [number, number, number],
): value is readonly [number, number, number] {
  return Array.isArray(value);
}

function viewportResolutionPayload(
  resolution: ViewportQueryResolution,
): ViewportSerializableRecord {
  return {
    width: resolution.width,
    height: resolution.height,
    pixelRatio: resolution.pixelRatio,
  };
}

function stripUndefinedPayload(
  payload: CharacterPreviewCommandPayload,
): CharacterPreviewCommandPayload {
  return {
    characterId: payload.characterId,
    modeId: payload.modeId,
    viewportId: payload.viewportId,
    ...(payload.resetCamera !== undefined ? { resetCamera: payload.resetCamera } : {}),
    ...(payload.action !== undefined ? { action: payload.action } : {}),
    ...(payload.clockMs !== undefined ? { clockMs: payload.clockMs } : {}),
  };
}

function commandToViewportCommand(command: ModelPreviewCommand): ViewportCommand {
  return {
    ...command,
    payload: {
      characterId: command.payload.characterId,
      modeId: command.payload.modeId,
      viewportId: command.payload.viewportId,
      ...(command.payload.resetCamera !== undefined
        ? { resetCamera: command.payload.resetCamera }
        : {}),
      ...(command.payload.action !== undefined ? { action: command.payload.action } : {}),
      ...(command.payload.clockMs !== undefined ? { clockMs: command.payload.clockMs } : {}),
    },
  };
}

function viewportEventFromPayload(
  command: ModelViewportCommand,
  event: string,
  payload: ViewportSerializableRecord,
  options: { revision?: number; appliedSeq?: number } = {},
): ViewportEvent {
  return {
    protocolVersion: 1,
    domain: 'viewport',
    event,
    sceneId: command.sceneId,
    viewportId: command.viewportId,
    ackSeq: command.seq,
    revision: options.revision ?? readFiniteNumber(payload['revision']) ?? command.baseRevision,
    timestamp: Date.now(),
    status: 'ack',
    ...(options.appliedSeq !== undefined ? { appliedSeq: options.appliedSeq } : {}),
    payload,
  };
}

function viewportErrorEvent(
  command: ModelViewportCommand | ModelPreviewCommand,
  code: string,
  message: string,
): ViewportEvent {
  return {
    protocolVersion: 1,
    domain: 'viewport',
    event: `${command.action}:error`,
    sceneId: command.sceneId,
    viewportId: command.viewportId,
    ackSeq: command.seq,
    revision: command.baseRevision ?? 0,
    timestamp: Date.now(),
    status: 'error',
    error: { code, message },
    payload: {},
  };
}

function viewportEventFromSceneAck(
  command: ModelViewportCommand,
  event: string,
  ack: SceneCommandAck,
  payload: ViewportSerializableRecord,
): ViewportEvent {
  if (ack.status !== 'applied') {
    return viewportErrorEvent(command, ack.status, ack.error ?? `scene command ${ack.status}`);
  }
  return viewportEventFromPayload(command, event, payload, {
    revision: ack.revision,
    appliedSeq: ack.appliedSeq || ack.seq,
  });
}

function createUnavailablePreviewState(
  command: ModelPreviewCommand,
): CharacterPreviewModeStatePayload {
  return {
    characterId: command.payload.characterId,
    modeId: command.payload.modeId,
    viewportId: command.payload.viewportId,
    status: 'unavailable',
    sceneRevision: command.baseRevision ?? 0,
    appliedSeq: command.seq,
    cameraPreset: previewCameraPreset(command.payload.modeId),
    renderPreset: previewRenderPreset(command.payload.modeId),
    playback: { state: 'unavailable' },
    diagnostics: [
      {
        code: 'scene-control-unavailable',
        severity: 'error',
        message: 'Scene control websocket is disconnected.',
        retryable: true,
      },
    ],
    hasCameraOverride: false,
  };
}

function previewCameraPreset(
  modeId: CharacterPreviewModeId,
): CharacterPreviewModeStatePayload['cameraPreset'] {
  switch (modeId) {
    case 'face':
      return 'face-closeup';
    case 'full-body':
      return 'full-body';
    case 'motion':
      return 'motion-review';
    case 'voice-pack':
      return 'voice-performance';
  }
}

function previewRenderPreset(
  modeId: CharacterPreviewModeId,
): CharacterPreviewModeStatePayload['renderPreset'] {
  switch (modeId) {
    case 'face':
      return 'face-detail';
    case 'full-body':
      return 'body-silhouette';
    case 'motion':
      return 'motion-diagnostics';
    case 'voice-pack':
      return 'voice-lipsync';
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeHitTestPayload(
  result: unknown,
  command: ModelViewportCommand,
): ViewportSerializableRecord {
  if (!isRecord(result)) {
    return {
      sceneId: command.sceneId,
      viewportId: command.viewportId,
      revision: command.baseRevision,
      nodeId: null,
    };
  }

  const payload: Record<string, string | number | boolean | null> = {};
  const candidates = readSelectionTargets(result['candidates']);
  for (const [key, value] of Object.entries(result)) {
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      typeof value === 'number'
    ) {
      payload[key] = value;
    }
  }

  return {
    ...payload,
    sceneId: readString(result['sceneId']) ?? command.sceneId,
    viewportId: readString(result['viewportId']) ?? command.viewportId,
    revision: readFiniteNumber(result['revision']) ?? command.baseRevision,
    nodeId: readString(result['nodeId']) ?? candidates[0]?.nodeId ?? null,
    candidates: candidates.map(selectionTargetToPayload),
  };
}

function selectionMaskForWorkflow(
  workflow: ModelState['selectionWorkflow'],
): readonly SceneSelectionKind[] {
  switch (workflow) {
    case 'face-region':
      return ['characterRegion', 'morphControl', 'materialSlot', 'node'];
    case 'bone-pose':
      return ['bone', 'node'];
    case 'light':
      return ['node'];
    case 'animation':
      return ['bone', 'node'];
    case 'export-inspect':
      return ['node', 'materialSlot', 'submesh', 'primitive', 'environment'];
    case 'object':
      return ['node', 'submesh', 'materialSlot', 'primitive'];
  }
}

function readSelectionTargets(value: unknown): SelectionTarget[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isSelectionTarget);
}

function selectionTargetToPayload(
  target: SelectionTarget,
): Record<string, string | number | boolean | null> {
  const payload: Record<string, string | number | boolean | null> = {
    kind: target.kind,
  };
  for (const key of [
    'nodeId',
    'characterId',
    'boneId',
    'materialSlotId',
    'submeshId',
    'primitiveId',
    'regionId',
    'morphId',
    'environmentId',
  ] as const) {
    const value = target[key];
    if (typeof value === 'string') {
      payload[key] = value;
    }
  }
  if (target.hit?.depth !== undefined) {
    payload.depth = target.hit.depth;
  }
  return payload;
}

function isSelectionTarget(value: unknown): value is SelectionTarget {
  if (!isRecord(value)) return false;
  switch (value['kind']) {
    case 'node':
    case 'bone':
    case 'materialSlot':
    case 'submesh':
    case 'primitive':
    case 'characterRegion':
    case 'morphControl':
    case 'environment':
      return true;
    default:
      return false;
  }
}

function readVec3Tuple(value: unknown): [number, number, number] | null {
  if (Array.isArray(value)) {
    const x = readFiniteNumber(value[0]);
    const y = readFiniteNumber(value[1]);
    const z = readFiniteNumber(value[2]);
    return x !== undefined && y !== undefined && z !== undefined ? [x, y, z] : null;
  }
  if (isRecord(value)) {
    const x = readFiniteNumber(value['x']);
    const y = readFiniteNumber(value['y']);
    const z = readFiniteNumber(value['z']);
    return x !== undefined && y !== undefined && z !== undefined ? [x, y, z] : null;
  }
  return null;
}

function readQuatTuple(value: unknown): [number, number, number, number] | null {
  if (Array.isArray(value)) {
    const x = readFiniteNumber(value[0]);
    const y = readFiniteNumber(value[1]);
    const z = readFiniteNumber(value[2]);
    const w = readFiniteNumber(value[3]);
    return x !== undefined && y !== undefined && z !== undefined && w !== undefined
      ? [x, y, z, w]
      : null;
  }
  if (isRecord(value)) {
    const x = readFiniteNumber(value['x']);
    const y = readFiniteNumber(value['y']);
    const z = readFiniteNumber(value['z']);
    const w = readFiniteNumber(value['w']);
    return x !== undefined && y !== undefined && z !== undefined && w !== undefined
      ? [x, y, z, w]
      : null;
  }
  return null;
}

function readViewportResolution(value: unknown): ViewportQueryResolution | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const width = readFiniteNumber(value['width']);
  const height = readFiniteNumber(value['height']);
  const pixelRatio = readFiniteNumber(value['pixelRatio']);
  if (width === undefined || height === undefined || pixelRatio === undefined) {
    return undefined;
  }
  return { width, height, pixelRatio };
}
