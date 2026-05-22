import type {
  ISceneController,
  PuppetCommand,
  PuppetCommandAck,
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
import { VIEWPORT_PROTOCOL_VERSION } from '@neko/shared';
import type { IPuppetController } from '../animation/puppet-controller';
import { usePuppetStore } from '../stores/puppet-store';
import { ViewportPredictionLayer } from '@neko/ui';

export type PuppetViewportAction =
  | 'scene:puppet:drag-bone'
  | 'scene:puppet:set-blendshape'
  | 'scene:puppet:edit-vertex'
  | 'scene:puppet:set-driver-weight'
  | 'scene:puppet:toggle-onion-skin';

export interface PuppetSceneControllerOptions {
  readonly sceneId: string;
  readonly viewportId: string;
  readonly controller: IPuppetController;
  readonly onError?: (message: string) => void;
}

interface PuppetViewportCommand {
  readonly protocolVersion: typeof VIEWPORT_PROTOCOL_VERSION;
  readonly domain: 'scene';
  readonly action: PuppetViewportAction;
  readonly sceneId: string;
  readonly viewportId: string;
  readonly seq: number;
  readonly correlationId: string;
  readonly timestamp: number;
  readonly source: 'user';
  readonly baseRevision: number;
  readonly payload: ViewportSerializableRecord;
}

export class PuppetSceneController implements ISceneController {
  readonly sceneType = '2d' as const;

  private readonly options: PuppetSceneControllerOptions;
  private readonly predictions = new ViewportPredictionLayer();

  constructor(options: PuppetSceneControllerOptions) {
    this.options = options;
  }

  get sceneId(): string {
    return this.options.sceneId;
  }

  onPointerDown(input: ViewportPointerInput): ViewportControllerResult | void {
    if (input.button !== 0) return undefined;
    const nearestBone = nearestBoneAt(input.position);
    if (nearestBone) {
      usePuppetStore.getState().setSelectedNativeBoneId(nearestBone);
      return { diagnostics: [`selected puppet bone ${nearestBone}`] };
    }
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
      usePuppetStore.getState().setSelectedNativeBoneId(null);
      return { diagnostics: ['puppet bone selection cleared'] };
    }
    return undefined;
  }

  getOverlays(frame?: ViewportFrameMeta): readonly ViewportOverlayDescriptor[] {
    const state = usePuppetStore.getState();
    const revision = frame?.revision ?? state.nativeRevision;
    const overlays: ViewportOverlayDescriptor[] = [];
    const bones = state.puppetSnapshot?.nodes.filter((node) => node.node_type === 'group') ?? [];

    for (const bone of bones) {
      if (bone.parent_id) {
        const parent = bones.find((node) => node.id === bone.parent_id);
        if (parent) {
          overlays.push({
            id: `puppet-bone-link-${bone.id}`,
            kind: 'polyline',
            sceneId: this.options.sceneId,
            viewportId: this.options.viewportId,
            coordinateSpace: 'scene',
            revision,
            zIndex: 20,
            authoritative: true,
            stalePolicy: 'hide',
            style: { stroke: 'rgba(75, 190, 255, 0.85)', lineWidth: 1.5 },
            payload: { points: [parent.position, bone.position] },
          });
        }
      }
      overlays.push({
        id: `puppet-bone-handle-${bone.id}`,
        kind: 'points',
        sceneId: this.options.sceneId,
        viewportId: this.options.viewportId,
        coordinateSpace: 'scene',
        revision,
        zIndex: 21,
        authoritative: true,
        stalePolicy: 'hide',
        style: {
          fill:
            bone.id === state.selectedNativeBoneId
              ? 'rgba(255, 214, 102, 0.95)'
              : 'rgba(75, 190, 255, 0.95)',
        },
        payload: { points: [bone.position], radius: bone.id === state.selectedNativeBoneId ? 4 : 3 },
      });
    }

    if (frame) {
      this.predictions.reconcileFrameMeta(frame);
      this.clearFinalizedPredictions();
    }

    for (const prediction of this.predictions.active()) {
      overlays.push(
        ...prediction.overlays.map((overlay) => ({
          ...overlay,
          revision,
        })),
      );
    }

    return overlays;
  }

  getToolbarExtensions(): readonly ViewportToolbarItem[] {
    return [
      {
        id: 'puppet-onion-skin',
        kind: 'toggle',
        label: 'Onion',
        icon: 'O',
        action: 'scene:puppet:toggle-onion-skin',
        group: 'puppet',
        order: 100,
      },
    ];
  }

  getContextMenu(request: ViewportContextMenuRequest): readonly ViewportMenuItem[] {
    return [
      {
        id: 'puppet-clear-bone-selection',
        label: 'Clear bone selection',
        action: 'scene:puppet:select-none',
        disabled: usePuppetStore.getState().selectedNativeBoneId === null,
        payload: { sceneId: request.sceneId, viewportId: request.viewportId },
      },
    ];
  }

  async handleViewportEvent(event: ViewportEvent): Promise<void> {
    if (event.status === 'error') {
      this.options.onError?.(event.error?.message ?? 'puppet viewport command failed');
      this.predictions.reconcileEvent(event);
      this.clearFinalizedPredictions();
      return;
    }
    if (event.ackSeq > 0) {
      usePuppetStore.getState().setNativeRevision(event.revision);
    }
    this.predictions.reconcileEvent(event);
    this.clearFinalizedPredictions();
  }

  async dispatchPuppetAction(
    action: PuppetViewportAction,
    payload: ViewportSerializableRecord,
  ): Promise<ViewportEvent> {
    const command = this.createViewportCommand(action, payload);
    this.createPrediction(command);
    const puppetCommand = puppetCommandFromViewportCommand(command);
    const ack = await this.applyPuppetCommand(command, puppetCommand);
    const event = eventFromPuppetAck(command, ack);
    await this.handleViewportEvent(event);
    return event;
  }

  async dragBone(
    bone: string,
    transform: Extract<PuppetCommand, { type: 'setNativeBoneTransform' }>['transform'],
    mode: Extract<PuppetCommand, { type: 'setNativeBoneTransform' }>['mode'] = 'set',
  ): Promise<ViewportEvent> {
    return this.dispatchPuppetAction('scene:puppet:drag-bone', {
      bone,
      transform: serializeTransform(transform),
      mode,
    });
  }

  async setBlendShape(name: string, weight: number): Promise<ViewportEvent> {
    return this.dispatchPuppetAction('scene:puppet:set-blendshape', { name, weight });
  }

  private createViewportCommand(
    action: PuppetViewportAction,
    payload: ViewportSerializableRecord,
  ): PuppetViewportCommand {
    const state = usePuppetStore.getState();
    const seq = state.nextNativeSeq();
    const correlationId = `${this.options.viewportId}:${seq}`;
    state.addPendingNativeCommand(correlationId);
    return {
      protocolVersion: VIEWPORT_PROTOCOL_VERSION,
      domain: 'scene',
      action,
      sceneId: this.options.sceneId,
      viewportId: this.options.viewportId,
      seq,
      correlationId,
      timestamp: Date.now(),
      source: 'user',
      baseRevision: state.nativeRevision,
      payload,
    };
  }

  private async applyPuppetCommand(
    command: PuppetViewportCommand,
    puppetCommand: PuppetCommand,
  ): Promise<PuppetCommandAck> {
    try {
      return await this.options.controller.applyNativeCommand(
        command.seq,
        command.baseRevision,
        puppetCommand,
        command.correlationId,
      );
    } catch (error) {
      this.predictions.rollback(command.seq, Date.now(), 'error');
      this.clearFinalizedPredictions();
      throw error;
    }
  }

  private createPrediction(command: PuppetViewportCommand): void {
    const overlays = createPredictionOverlays(command);
    if (overlays.length === 0) return;
    this.predictions.create({
      kind: predictionKindForAction(command.action),
      seq: command.seq,
      correlationId: command.correlationId,
      sceneId: command.sceneId,
      viewportId: command.viewportId,
      baseRevision: command.baseRevision,
      targetId: predictionTargetId(command),
      payload: command.payload,
      overlays,
      timeoutMs: 2_000,
    });
  }

  private clearFinalizedPredictions(): void {
    const finalized = this.predictions.all().filter((prediction) => prediction.status !== 'active');
    if (finalized.length === 0) return;
    const store = usePuppetStore.getState();
    for (const prediction of finalized) {
      if (prediction.correlationId) {
        store.removePendingNativeCommand(prediction.correlationId);
      }
    }
    this.predictions.clearFinalized();
  }
}

export function handlePuppetMenuAction(item: ViewportMenuItem): void {
  if (item.action === 'scene:puppet:select-none') {
    usePuppetStore.getState().setSelectedNativeBoneId(null);
  }
}

export function puppetCommandFromViewportCommand(command: PuppetViewportCommand): PuppetCommand {
  switch (command.action) {
    case 'scene:puppet:drag-bone':
      return {
        type: 'setNativeBoneTransform',
        bone: readString(command.payload, 'bone'),
        transform: readTransform(command.payload['transform']),
        mode: readTransformMode(command.payload['mode']),
      };
    case 'scene:puppet:set-blendshape':
      return {
        type: 'setNativeBlendShape',
        name: readString(command.payload, 'name'),
        weight: readFiniteNumber(command.payload, 'weight'),
      };
    case 'scene:puppet:edit-vertex':
      return {
        type: 'setNativeBlendShapeDelta',
        name: readString(command.payload, 'name'),
        meshId: readString(command.payload, 'meshId'),
        vertexIndex: readNonNegativeInteger(command.payload, 'vertexIndex'),
        delta: readVec2(command.payload['delta']),
      };
    case 'scene:puppet:set-driver-weight':
      return {
        type: 'setNativeTrackingInput',
        name: readString(command.payload, 'name'),
        value: readFiniteNumber(command.payload, 'value'),
      };
    case 'scene:puppet:toggle-onion-skin':
      return {
        type: 'setNativeTrackingInput',
        name: 'onionSkin',
        value: command.payload['enabled'] === false ? 0 : 1,
      };
  }
}

function eventFromPuppetAck(command: PuppetViewportCommand, ack: PuppetCommandAck): ViewportEvent {
  return {
    protocolVersion: VIEWPORT_PROTOCOL_VERSION,
    domain: 'scene',
    event: `${command.action}:${ack.status === 'applied' ? 'ack' : 'error'}`,
    sceneId: command.sceneId,
    viewportId: command.viewportId,
    ackSeq: ack.seq,
    revision: ack.revision,
    timestamp: Date.now(),
    status: ack.status === 'applied' ? 'ack' : 'error',
    appliedSeq: ack.appliedSeq,
    error: ack.error
      ? {
          code: ack.error.code,
          message: ack.error.message,
        }
      : undefined,
    payload: {
      sceneId: command.sceneId,
      viewportId: command.viewportId,
      revision: ack.revision,
      puppetRevision: ack.revision,
      commandType: command.action,
    },
  };
}

function nearestBoneAt(position: readonly [number, number]): string | null {
  const nodes = usePuppetStore.getState().puppetSnapshot?.nodes ?? [];
  let nearest: { id: string; distanceSquared: number } | null = null;
  for (const node of nodes) {
    if (node.node_type !== 'group') continue;
    const dx = node.position[0] - position[0];
    const dy = node.position[1] - position[1];
    const distanceSquared = dx * dx + dy * dy;
    if (nearest === null || distanceSquared < nearest.distanceSquared) {
      nearest = { id: node.id, distanceSquared };
    }
  }
  return nearest && nearest.distanceSquared <= 64 ? nearest.id : null;
}

function readString(payload: ViewportSerializableRecord, key: string): string {
  const value = payload[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`puppet viewport payload requires ${key}`);
  }
  return value;
}

function readFiniteNumber(payload: ViewportSerializableRecord, key: string): number {
  const value = payload[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`puppet viewport payload requires finite ${key}`);
  }
  return value;
}

function readNonNegativeInteger(payload: ViewportSerializableRecord, key: string): number {
  const value = readFiniteNumber(payload, key);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`puppet viewport payload requires non-negative integer ${key}`);
  }
  return value;
}

function readVec2(value: unknown): readonly [number, number] {
  if (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((item) => typeof item === 'number' && Number.isFinite(item))
  ) {
    return [value[0], value[1]];
  }
  throw new Error('puppet viewport payload requires vec2');
}

function readTransform(value: unknown): Extract<
  PuppetCommand,
  { type: 'setNativeBoneTransform' }
>['transform'] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('puppet viewport payload requires transform');
  }
  const record = value as Record<string, unknown>;
  return {
    position:
      record['position'] === undefined || record['position'] === null
        ? undefined
        : readVec2(record['position']),
    rotation:
      typeof record['rotation'] === 'number' && Number.isFinite(record['rotation'])
        ? record['rotation']
        : undefined,
    scale:
      record['scale'] === undefined || record['scale'] === null
        ? undefined
        : readVec2(record['scale']),
  };
}

function readTransformMode(
  value: unknown,
): Extract<PuppetCommand, { type: 'setNativeBoneTransform' }>['mode'] {
  return value === 'offset' ? 'offset' : 'set';
}

function serializeTransform(
  transform: Extract<PuppetCommand, { type: 'setNativeBoneTransform' }>['transform'],
): ViewportSerializableRecord {
  return {
    position: transform.position ? [transform.position[0], transform.position[1]] : null,
    rotation: transform.rotation ?? null,
    scale: transform.scale ? [transform.scale[0], transform.scale[1]] : null,
  };
}

function createPredictionOverlays(
  command: PuppetViewportCommand,
): readonly ViewportOverlayDescriptor[] {
  switch (command.action) {
    case 'scene:puppet:drag-bone':
      return createBonePredictionOverlays(command);
    case 'scene:puppet:set-blendshape':
      return [
        createPredictionLabel(
          command,
          `BlendShape ${readString(command.payload, 'name')} ${readFiniteNumber(command.payload, 'weight').toFixed(2)}`,
          [16, 24],
        ),
      ];
    case 'scene:puppet:edit-vertex':
      return [
        createPredictionLabel(
          command,
          `Vertex ${readString(command.payload, 'meshId')}:${readNonNegativeInteger(command.payload, 'vertexIndex')}`,
          [16, 40],
        ),
      ];
    case 'scene:puppet:set-driver-weight':
      return [
        createPredictionLabel(
          command,
          `Driver ${readString(command.payload, 'name')} ${readFiniteNumber(command.payload, 'value').toFixed(2)}`,
          [16, 56],
        ),
      ];
    case 'scene:puppet:toggle-onion-skin':
      return [
        createPredictionLabel(
          command,
          command.payload['enabled'] === false ? 'Onion skin off' : 'Onion skin on',
          [16, 72],
        ),
      ];
  }
}

function createBonePredictionOverlays(
  command: PuppetViewportCommand,
): readonly ViewportOverlayDescriptor[] {
  const boneId = readString(command.payload, 'bone');
  const transform = readTransform(command.payload['transform']);
  const position = transform.position;
  if (!position) {
    return [createPredictionLabel(command, `Bone ${boneId}`, [16, 24])];
  }

  const bone = usePuppetStore
    .getState()
    .puppetSnapshot?.nodes.find((node) => node.id === boneId && node.node_type === 'group');
  const start = bone?.position ?? position;
  const startPoint = vec2Payload(start);
  const endPoint = vec2Payload(position);
  return [
    {
      id: `puppet-prediction-bone-path-${command.correlationId}`,
      kind: 'polyline',
      sceneId: command.sceneId,
      viewportId: command.viewportId,
      coordinateSpace: 'scene',
      revision: command.baseRevision,
      appliedSeq: command.seq,
      zIndex: 45,
      authoritative: false,
      stalePolicy: 'draw-as-prediction',
      style: { stroke: 'rgba(251, 191, 36, 0.95)', lineWidth: 1.25, dash: [4, 3] },
      payload: { points: [startPoint, endPoint] },
    },
    {
      id: `puppet-prediction-bone-handle-${command.correlationId}`,
      kind: 'points',
      sceneId: command.sceneId,
      viewportId: command.viewportId,
      coordinateSpace: 'scene',
      revision: command.baseRevision,
      appliedSeq: command.seq,
      zIndex: 46,
      authoritative: false,
      stalePolicy: 'draw-as-prediction',
      style: { fill: 'rgba(251, 191, 36, 0.95)' },
      payload: { points: [endPoint], radius: 4 },
    },
  ];
}

function createPredictionLabel(
  command: PuppetViewportCommand,
  text: string,
  position: readonly [number, number],
): ViewportOverlayDescriptor {
  return {
    id: `puppet-prediction-label-${command.correlationId}`,
    kind: 'text',
    sceneId: command.sceneId,
    viewportId: command.viewportId,
    coordinateSpace: 'screen',
    revision: command.baseRevision,
    appliedSeq: command.seq,
    zIndex: 50,
    authoritative: false,
    stalePolicy: 'draw-as-prediction',
    style: { fill: 'rgba(251, 191, 36, 0.95)' },
    payload: { position: vec2Payload(position), text },
  };
}

function vec2Payload(point: readonly [number, number]): [number, number] {
  return [point[0], point[1]];
}

function predictionKindForAction(
  action: PuppetViewportAction,
): Parameters<ViewportPredictionLayer['create']>[0]['kind'] {
  switch (action) {
    case 'scene:puppet:drag-bone':
      return 'bone';
    case 'scene:puppet:set-blendshape':
    case 'scene:puppet:edit-vertex':
      return 'blendshape';
    case 'scene:puppet:set-driver-weight':
    case 'scene:puppet:toggle-onion-skin':
      return 'overlay';
  }
}

function predictionTargetId(command: PuppetViewportCommand): string | undefined {
  switch (command.action) {
    case 'scene:puppet:drag-bone':
      return readString(command.payload, 'bone');
    case 'scene:puppet:set-blendshape':
    case 'scene:puppet:edit-vertex':
      return readString(command.payload, 'name');
    case 'scene:puppet:set-driver-weight':
      return readString(command.payload, 'name');
    case 'scene:puppet:toggle-onion-skin':
      return 'onionSkin';
  }
}
