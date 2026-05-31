import {
  createEnvironmentPayload,
  createLightUpdatePayload,
  createNodeRemovePayload,
} from '@neko/neko-client';
import type {
  EnvironmentPatch,
  LightPatch,
  SceneCommand,
  SceneCommandAck,
  SceneCommandEnvelope,
  SelectionQuery,
  SelectionQueryResult,
  ViewportLookDevSettings,
} from '@neko/shared';
import type { SceneControlSocket } from '@neko/neko-client';
import type { EditableNodeTransform } from './SceneEditingTypes';

export interface SceneDocumentContext {
  sceneId: string;
  getRevision: () => number;
  allocateSeq: () => number;
  socket: SceneControlSocket;
  beforeSendCommand?: (envelope: SceneCommandEnvelope) => void;
}

export interface SceneHitTestResult {
  sceneId?: string;
  viewportId: string;
  revision: number;
  nodeId: string | null;
  depth: number | null;
  worldPosition: { x: number; y: number; z: number } | null;
  normal: { x: number; y: number; z: number } | null;
}

export class SceneDocument {
  private readonly context: SceneDocumentContext;

  constructor(context: SceneDocumentContext) {
    this.context = context;
  }

  node(nodeId: string): SceneNodeHandle {
    return new SceneNodeHandle(this.context, nodeId);
  }

  material(materialId: string): MaterialHandle {
    return new MaterialHandle(this.context, materialId, this.context.getRevision());
  }

  light(nodeId: string): LightHandle {
    return new LightHandle(this.context, nodeId, this.context.getRevision());
  }

  environment(environmentId = 'scene-environment'): EnvironmentHandle {
    return new EnvironmentHandle(this.context, environmentId, this.context.getRevision());
  }

  camera(cameraId: string): CameraHandle {
    return new CameraHandle(this.context, cameraId, this.context.getRevision());
  }

  transaction(id = createTransactionId()): SceneTransaction {
    return new SceneTransaction(this.context, id);
  }

  query<T>(query: string, payload: Record<string, unknown>): Promise<T> {
    return this.context.socket.query(query, payload) as Promise<T>;
  }

  select(query: SelectionQuery): Promise<SelectionQueryResult> {
    return this.query<SelectionQueryResult>('selectionQuery', {
      viewportId: query.viewportId,
      x: query.x,
      y: query.y,
      mask: query.mask,
      mode: query.mode,
    });
  }

  updateViewportSettings(
    viewportId: string,
    settings: ViewportLookDevSettings,
  ): Promise<SceneCommandAck> {
    return sendEnvelope(
      this.context,
      createEnvelope(this.context, 'viewport-settings-update', {
        viewportId,
        settings,
      }),
    );
  }
}

export class SceneNodeHandle {
  constructor(
    private readonly context: SceneDocumentContext,
    readonly nodeId: string,
    readonly revision: number = context.getRevision(),
  ) {}

  setTransform(transform: EditableNodeTransform): Promise<SceneCommandAck> {
    assertHandleFresh(this.context, this.revision);
    return sendEnvelope(
      this.context,
      createEnvelope(this.context, 'transform', {
        nodeId: this.nodeId,
        position: transform.position,
        rotation: transform.rotation,
        scale: transform.scale,
      }),
    );
  }

  setVisible(visible: boolean): Promise<SceneCommandAck> {
    assertHandleFresh(this.context, this.revision);
    return sendEnvelope(
      this.context,
      createEnvelope(this.context, 'visibility-set', {
        nodeId: this.nodeId,
        visible,
      }),
    );
  }

  remove(cascade = false): Promise<SceneCommandAck> {
    assertHandleFresh(this.context, this.revision);
    return sendEnvelope(
      this.context,
      createEnvelope(
        this.context,
        'node-remove',
        createNodeRemovePayload({ nodeId: this.nodeId, cascade }),
      ),
    );
  }

  hitTest(viewportId: string, x: number, y: number): Promise<SceneHitTestResult> {
    return this.context.socket.query('hitTest', {
      viewportId,
      x,
      y,
      nodeIds: [this.nodeId],
    }) as Promise<SceneHitTestResult>;
  }
}

export class MaterialHandle {
  constructor(
    private readonly context: SceneDocumentContext,
    readonly materialId: string,
    readonly revision: number = context.getRevision(),
  ) {}

  updateParams(params: Record<string, unknown>): Promise<SceneCommandAck> {
    assertHandleFresh(this.context, this.revision);
    return sendEnvelope(
      this.context,
      createEnvelope(this.context, 'material-update', {
        materialId: this.materialId,
        params,
      }),
    );
  }
}

export class LightHandle {
  constructor(
    private readonly context: SceneDocumentContext,
    readonly nodeId: string,
    readonly revision: number = context.getRevision(),
  ) {}

  updateParams(params: Record<string, unknown>): Promise<SceneCommandAck> {
    assertHandleFresh(this.context, this.revision);
    return sendEnvelope(
      this.context,
      createEnvelope(this.context, 'light-update', {
        nodeId: this.nodeId,
        params,
      }),
    );
  }

  update(patch: Omit<LightPatch, 'nodeId'>): Promise<SceneCommandAck> {
    assertHandleFresh(this.context, this.revision);
    return sendEnvelope(
      this.context,
      createEnvelope(
        this.context,
        'light-update',
        createLightUpdatePayload({ nodeId: this.nodeId, ...patch }),
      ),
    );
  }
}

export class EnvironmentHandle {
  constructor(
    private readonly context: SceneDocumentContext,
    readonly environmentId: string,
    readonly revision: number = context.getRevision(),
  ) {}

  set(patch: Omit<EnvironmentPatch, 'environmentId'>): Promise<SceneCommandAck> {
    assertHandleFresh(this.context, this.revision);
    return sendEnvelope(
      this.context,
      createEnvelope(
        this.context,
        'environment-set',
        createEnvironmentPayload({ environmentId: this.environmentId, ...patch }),
      ),
    );
  }

  update(patch: Omit<EnvironmentPatch, 'environmentId'>): Promise<SceneCommandAck> {
    assertHandleFresh(this.context, this.revision);
    return sendEnvelope(
      this.context,
      createEnvelope(
        this.context,
        'environment-update',
        createEnvironmentPayload({ environmentId: this.environmentId, ...patch }),
      ),
    );
  }

  clear(): Promise<SceneCommandAck> {
    assertHandleFresh(this.context, this.revision);
    return sendEnvelope(
      this.context,
      createEnvelope(this.context, 'environment-clear', {
        environmentId: this.environmentId,
      }),
    );
  }
}

export class CameraHandle {
  constructor(
    private readonly context: SceneDocumentContext,
    readonly cameraId: string,
    readonly revision: number = context.getRevision(),
  ) {}

  setFov(fov: number): Promise<SceneCommandAck> {
    assertHandleFresh(this.context, this.revision);
    return sendEnvelope(
      this.context,
      createEnvelope(this.context, 'camera-set', {
        cameraId: this.cameraId,
        fov,
      }),
    );
  }
}

export class SceneTransaction {
  private readonly envelopes: SceneCommandEnvelope[] = [];

  constructor(
    private readonly context: SceneDocumentContext,
    readonly transactionId: string,
  ) {}

  setNodeTransform(nodeId: string, transform: EditableNodeTransform): this {
    this.envelopes.push(
      createEnvelope(
        this.context,
        'transform',
        {
          nodeId,
          position: transform.position,
          rotation: transform.rotation,
          scale: transform.scale,
        },
        this.transactionId,
      ),
    );
    return this;
  }

  async commit(): Promise<SceneCommandAck[]> {
    assertHandleFresh(this.context, this.envelopes[0]?.baseRevision ?? this.context.getRevision());
    const acks: SceneCommandAck[] = [];
    for (const envelope of this.envelopes) {
      acks.push(await sendEnvelope(this.context, envelope));
    }
    this.envelopes.length = 0;
    return acks;
  }
}

function createEnvelope(
  context: SceneDocumentContext,
  type: SceneCommand['type'],
  payload: Record<string, unknown>,
  transactionId?: string,
): SceneCommandEnvelope {
  return {
    seq: context.allocateSeq(),
    baseRevision: context.getRevision(),
    transactionId,
    command: {
      type,
      payloadJson: JSON.stringify(payload),
    },
  };
}

function sendEnvelope(
  context: SceneDocumentContext,
  envelope: SceneCommandEnvelope,
): Promise<SceneCommandAck> {
  context.beforeSendCommand?.(envelope);
  return context.socket.sendCommand(envelope);
}

function assertHandleFresh(context: SceneDocumentContext, handleRevision: number): void {
  const currentRevision = context.getRevision();
  if (currentRevision !== handleRevision) {
    throw new Error(
      `Scene handle is stale: created at revision ${handleRevision}, current revision is ${currentRevision}`,
    );
  }
}

function createTransactionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `txn-${Date.now().toString(36)}`;
}
