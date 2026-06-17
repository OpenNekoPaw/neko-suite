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

export interface PuppetViewportControllerOptions {
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

interface PuppetViewportCommandOptions {
  readonly seq?: number;
  readonly correlationId?: string;
  readonly baseRevision?: number;
  readonly pendingAlreadyTracked?: boolean;
}

interface PuppetBoneDragState {
  readonly boneId: string;
  readonly pointerId: number;
  readonly startScenePosition: readonly [number, number];
  readonly latestScenePosition: readonly [number, number];
  readonly baseRevision: number;
  readonly seq: number;
  readonly correlationId: string;
}

const BONE_DRAG_COMMIT_EPSILON = 0.5;

class IdlePuppetViewportController implements ISceneController {
  readonly sceneId = 'puppet-main';
  readonly sceneType = '2d' as const;

  onPointerDown(_input: ViewportPointerInput): void {}
  onPointerMove(_input: ViewportPointerInput): void {}
  onPointerUp(_input: ViewportPointerInput): void {}
  onPointerCancel(_input: ViewportPointerInput): void {}
  onWheel(_input: ViewportWheelInput): void {}
  onKeyDown(_input: ViewportKeyInput): void {}
  onKeyUp(_input: ViewportKeyInput): void {}
  getOverlays(_frame?: ViewportFrameMeta): readonly ViewportOverlayDescriptor[] {
    return [];
  }
  getToolbarExtensions(): readonly ViewportToolbarItem[] {
    return [];
  }
  getContextMenu(_request: ViewportContextMenuRequest): readonly ViewportMenuItem[] {
    return [];
  }
  handleViewportEvent(_event: ViewportEvent): void {}
}

export function createIdlePuppetViewportController(): ISceneController {
  return new IdlePuppetViewportController();
}

export class PuppetViewportController implements ISceneController {
  readonly sceneType = '2d' as const;

  private readonly options: PuppetViewportControllerOptions;
  private readonly predictions = new ViewportPredictionLayer();
  private latestFrameMeta: ViewportFrameMeta | null = null;
  private activeBoneDrag: PuppetBoneDragState | null = null;
  private onionSkinEnabled = false;
  private lastControlError: string | null = null;

  constructor(options: PuppetViewportControllerOptions) {
    this.options = options;
  }

  get sceneId(): string {
    return this.options.sceneId;
  }

  onPointerDown(input: ViewportPointerInput): ViewportControllerResult | void {
    if (input.button !== 0) return undefined;
    const scenePosition = this.toScenePosition(input.position);
    const nearestBone = nearestBoneAt(scenePosition);
    if (nearestBone) {
      const store = usePuppetStore.getState();
      if (this.latestFrameMeta && this.latestFrameMeta.revision > store.nativeRevision) {
        return {
          diagnostics: [
            `puppet snapshot stale for bone selection: frame ${this.latestFrameMeta.revision}, native ${store.nativeRevision}`,
          ],
        };
      }
      const seq = store.nextNativeSeq();
      const correlationId = `${this.options.viewportId}:${seq}`;
      store.setSelectedNativeBoneId(nearestBone);
      store.addPendingNativeCommand(correlationId);
      this.activeBoneDrag = {
        boneId: nearestBone,
        pointerId: input.pointerId,
        startScenePosition: scenePosition,
        latestScenePosition: scenePosition,
        baseRevision: store.nativeRevision,
        seq,
        correlationId,
      };
      this.upsertBoneDragPrediction(this.activeBoneDrag);
      return { diagnostics: [`selected puppet bone ${nearestBone}`, 'puppet bone drag started'] };
    }
    return undefined;
  }

  onPointerMove(input: ViewportPointerInput): ViewportControllerResult | void {
    if (!this.activeBoneDrag || this.activeBoneDrag.pointerId !== input.pointerId) {
      return undefined;
    }
    this.activeBoneDrag = {
      ...this.activeBoneDrag,
      latestScenePosition: this.toScenePosition(input.position),
    };
    this.upsertBoneDragPrediction(this.activeBoneDrag);
    return undefined;
  }

  async onPointerUp(input: ViewportPointerInput): Promise<ViewportControllerResult | void> {
    if (!this.activeBoneDrag || this.activeBoneDrag.pointerId !== input.pointerId) {
      return undefined;
    }
    const drag = {
      ...this.activeBoneDrag,
      latestScenePosition: this.toScenePosition(input.position),
    };
    this.activeBoneDrag = null;
    if (!hasMeaningfulBoneDrag(drag)) {
      this.predictions.rollback(drag.seq, Date.now(), 'manual');
      this.clearFinalizedPredictions();
      return { diagnostics: ['puppet bone drag cancelled'] };
    }

    const command = this.createViewportCommand(
      'scene:puppet:drag-bone',
      {
        bone: drag.boneId,
        transform: serializeTransform({ position: drag.latestScenePosition }),
        mode: 'set',
      },
      {
        seq: drag.seq,
        correlationId: drag.correlationId,
        baseRevision: drag.baseRevision,
        pendingAlreadyTracked: true,
      },
    );
    try {
      await this.dispatchPuppetCommand(command);
    } catch (error) {
      this.options.onError?.(error instanceof Error ? error.message : String(error));
    }
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

  onKeyUp(_input: ViewportKeyInput): ViewportControllerResult | void {
    return undefined;
  }

  onPointerCancel(input: ViewportPointerInput): ViewportControllerResult | void {
    if (!this.activeBoneDrag || this.activeBoneDrag.pointerId !== input.pointerId) {
      return undefined;
    }
    const drag = this.activeBoneDrag;
    this.activeBoneDrag = null;
    this.predictions.rollback(drag.seq, Date.now(), 'manual');
    this.clearFinalizedPredictions();
    return { diagnostics: ['puppet bone drag cancelled'] };
  }

  getOverlays(frame?: ViewportFrameMeta): readonly ViewportOverlayDescriptor[] {
    if (
      frame &&
      frame.sceneId === this.options.sceneId &&
      frame.viewportId === this.options.viewportId
    ) {
      this.latestFrameMeta = frame;
    }
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
        payload: {
          points: [bone.position],
          radius: bone.id === state.selectedNativeBoneId ? 4 : 3,
        },
      });
    }

    if (frame) {
      this.predictions.reconcileFrameMeta(frame);
      this.predictions.timeout(Date.now());
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
    const hasPendingCommand = usePuppetStore.getState().pendingNativeCommandIds.size > 0;
    const degraded = hasPendingCommand || this.lastControlError !== null;
    const degradedReason = hasPendingCommand
      ? 'control-reconnecting'
      : this.lastControlError
        ? 'command-rejected'
        : undefined;
    return [
      {
        id: 'puppet-onion-skin',
        kind: 'toggle',
        label: 'Onion',
        icon: 'O',
        action: 'scene:puppet:toggle-onion-skin',
        group: 'puppet',
        order: 100,
        toggled: this.onionSkinEnabled,
        disabled: hasPendingCommand,
        disabledReason: hasPendingCommand ? 'Native puppet command pending' : undefined,
        degraded,
        degradedReason,
        payload: { enabled: !this.onionSkinEnabled },
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
      this.lastControlError = event.error?.message ?? 'puppet viewport command failed';
      this.options.onError?.(this.lastControlError);
      this.predictions.reconcileEvent(event);
      this.clearFinalizedPredictions();
      return;
    }
    this.lastControlError = null;
    if (event.ackSeq > 0) {
      usePuppetStore.getState().setNativeRevision(event.revision);
    }
    this.applyAckBackedUiState(event);
    this.predictions.reconcileEvent(event);
    this.clearFinalizedPredictions();
  }

  async dispatchPuppetAction(
    action: PuppetViewportAction,
    payload: ViewportSerializableRecord,
  ): Promise<ViewportEvent> {
    const command = this.createViewportCommand(action, payload);
    return this.dispatchPuppetCommand(command);
  }

  async setOnionSkin(enabled: boolean): Promise<ViewportEvent> {
    return this.dispatchPuppetAction('scene:puppet:toggle-onion-skin', { enabled });
  }

  private async dispatchPuppetCommand(command: PuppetViewportCommand): Promise<ViewportEvent> {
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
    options: PuppetViewportCommandOptions = {},
  ): PuppetViewportCommand {
    const state = usePuppetStore.getState();
    const seq = options.seq ?? state.nextNativeSeq();
    const correlationId = options.correlationId ?? `${this.options.viewportId}:${seq}`;
    if (!options.pendingAlreadyTracked) {
      state.addPendingNativeCommand(correlationId);
    }
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
      baseRevision: options.baseRevision ?? state.nativeRevision,
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
    const existing = this.predictions
      .all()
      .find(
        (prediction) =>
          prediction.status === 'active' &&
          prediction.seq === command.seq &&
          prediction.sceneId === command.sceneId &&
          prediction.viewportId === command.viewportId,
      );
    if (existing) {
      this.predictions.update(existing.id, {
        payload: command.payload,
        overlays,
      });
      return;
    }
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

  private upsertBoneDragPrediction(drag: PuppetBoneDragState): void {
    const command = this.createViewportCommand(
      'scene:puppet:drag-bone',
      {
        bone: drag.boneId,
        transform: serializeTransform({ position: drag.latestScenePosition }),
        mode: 'set',
      },
      {
        seq: drag.seq,
        correlationId: drag.correlationId,
        baseRevision: drag.baseRevision,
        pendingAlreadyTracked: true,
      },
    );
    this.createPrediction(command);
  }

  private applyAckBackedUiState(event: ViewportEvent): void {
    if (event.status === 'error') return;
    if (event.event.startsWith('scene:puppet:set-blendshape')) {
      const name = readOptionalString(event.payload['name']);
      const weight = readOptionalFiniteNumber(event.payload['weight']);
      if (name !== undefined && weight !== undefined) {
        usePuppetStore.getState().updateNativeBlendShapeWeight(name, weight);
      }
    }
    if (event.event.startsWith('scene:puppet:edit-vertex')) {
      const name = readOptionalString(event.payload['name']);
      const weight = readOptionalFiniteNumber(event.payload['weight']);
      if (name !== undefined && weight !== undefined) {
        usePuppetStore.getState().updateNativeBlendShapeWeight(name, weight);
      }
    }
    if (event.event.startsWith('scene:puppet:set-driver-weight')) {
      const name = readOptionalString(event.payload['name']);
      const value = readOptionalFiniteNumber(event.payload['value']);
      if (name !== undefined && value !== undefined) {
        usePuppetStore.getState().updateNativeTrackingInputValue(name, value);
      }
    }
    if (event.event.startsWith('scene:puppet:toggle-onion-skin')) {
      const enabled = readOptionalBoolean(event.payload['enabled']);
      if (enabled !== undefined) {
        this.onionSkinEnabled = enabled;
      }
    }
  }

  private toScenePosition(position: readonly [number, number]): readonly [number, number] {
    const frame = this.latestFrameMeta;
    if (!frame) return position;
    return invertViewportTransform(frame.viewTransform, position);
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

export async function handlePuppetToolbarAction(
  item: ViewportToolbarItem,
  controller?: PuppetViewportController | null,
): Promise<void> {
  if (item.action === 'scene:puppet:toggle-onion-skin') {
    const enabled = readOptionalBoolean(item.payload?.['enabled']) ?? item.toggled !== true;
    await controller?.setOnionSkin(enabled);
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
      ...command.payload,
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

function hasMeaningfulBoneDrag(drag: PuppetBoneDragState): boolean {
  const dx = drag.latestScenePosition[0] - drag.startScenePosition[0];
  const dy = drag.latestScenePosition[1] - drag.startScenePosition[1];
  return Math.hypot(dx, dy) >= BONE_DRAG_COMMIT_EPSILON;
}

function invertViewportTransform(
  transform: readonly [number, number, number, number, number, number],
  point: readonly [number, number],
): readonly [number, number] {
  const [a, b, c, d, tx, ty] = transform;
  const det = a * d - b * c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-9) return point;
  const x = point[0] - tx;
  const y = point[1] - ty;
  return [(d * x - c * y) / det, (-b * x + a * y) / det];
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

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readOptionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
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

function readTransform(
  value: unknown,
): Extract<PuppetCommand, { type: 'setNativeBoneTransform' }>['transform'] {
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
