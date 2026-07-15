import * as vscode from 'vscode';
import {
  CANVAS_BOARD_DIRECTORY,
  CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
  NEKO_EXTENSION_IDS,
  validateCanvasBoardBinding,
  type CanvasBoardBinding,
  type CanvasBoardDeliveryArtifact,
  type CanvasBoardDeliveryResult,
  type CanvasBoardQueryFilter,
  type CanvasBoardResolutionInput,
  type CanvasBoardResolutionResult,
  type CanvasBoardTargetIdentity,
  type ImmutableCanvasWriteTarget,
  type NekoCanvasAPI,
} from '@neko/shared';

const CANVAS_BOARD_BINDING_STORAGE_KEY = 'neko.agent.canvasBoardBindings.v1';

export interface CanvasBoardBindingStorage {
  get(conversationId: string): CanvasBoardBinding | undefined;
  set(conversationId: string, binding: CanvasBoardBinding): Promise<void>;
  delete(conversationId: string): Promise<void>;
}

export class MementoCanvasBoardBindingStorage implements CanvasBoardBindingStorage {
  constructor(
    private readonly state: Pick<vscode.Memento, 'get' | 'update'>,
    private readonly storageKey = CANVAS_BOARD_BINDING_STORAGE_KEY,
  ) {}

  get(conversationId: string): CanvasBoardBinding | undefined {
    const value = this.readRecord()[conversationId];
    if (!value) return undefined;
    const diagnostics = validateCanvasBoardBinding(value);
    if (diagnostics.length > 0) {
      throw new Error(
        `Invalid persisted Canvas Board binding: ${diagnostics
          .map(({ code, message }) => `${code}: ${message}`)
          .join('; ')}`,
      );
    }
    return value;
  }

  async set(conversationId: string, binding: CanvasBoardBinding): Promise<void> {
    const diagnostics = validateCanvasBoardBinding(binding, {
      conversationId,
      ...(binding.scope === 'task' ? { taskId: binding.scopeId } : {}),
    });
    if (diagnostics.length > 0) {
      throw new Error(
        `Refused invalid Canvas Board binding: ${diagnostics
          .map(({ code, message }) => `${code}: ${message}`)
          .join('; ')}`,
      );
    }
    await this.state.update(this.storageKey, {
      ...this.readRecord(),
      [conversationId]: binding,
    });
  }

  async delete(conversationId: string): Promise<void> {
    const next = { ...this.readRecord() };
    delete next[conversationId];
    await this.state.update(this.storageKey, next);
  }

  private readRecord(): Readonly<Record<string, CanvasBoardBinding>> {
    const value = this.state.get<unknown>(this.storageKey, {});
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Canvas Board binding storage must contain an object record.');
    }
    return value as Readonly<Record<string, CanvasBoardBinding>>;
  }
}

export interface AgentCanvasBoardResolutionRequest {
  readonly conversationId: string;
  readonly turnId?: string;
  readonly taskId?: string;
  readonly runId?: string;
  readonly explicitTarget?: CanvasBoardTargetIdentity;
  readonly filter?: CanvasBoardQueryFilter;
  readonly suggestedTitle: string;
}

export interface AgentCanvasBoardCoordinatorOptions {
  readonly bindings: CanvasBoardBindingStorage;
  readonly getCanvasApi: () => Promise<Pick<NekoCanvasAPI, 'boards'>>;
  readonly now?: () => Date;
}

export class AgentCanvasBoardCoordinator {
  private readonly now: () => Date;

  constructor(private readonly options: AgentCanvasBoardCoordinatorOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async resolveForWork(
    request: AgentCanvasBoardResolutionRequest,
  ): Promise<CanvasBoardResolutionResult> {
    const binding = this.options.bindings.get(request.conversationId);
    const input: CanvasBoardResolutionInput = {
      version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
      conversationId: request.conversationId,
      ...(request.turnId ? { turnId: request.turnId } : {}),
      ...(request.taskId ? { taskId: request.taskId } : {}),
      ...(request.runId ? { runId: request.runId } : {}),
      ...(request.explicitTarget ? { explicitTarget: request.explicitTarget } : {}),
      ...(binding ? { binding } : {}),
      query: {
        version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
        directory: CANVAS_BOARD_DIRECTORY,
        ...(request.filter ? { filter: request.filter } : {}),
      },
      suggestedTitle: request.suggestedTitle,
    };
    const canvasApi = await this.options.getCanvasApi();
    const result = await canvasApi.boards.resolve(input);
    if (result.status === 'resolved' && result.target && result.source) {
      await this.options.bindings.set(request.conversationId, {
        version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
        scope: 'conversation',
        scopeId: request.conversationId,
        conversationId: request.conversationId,
        target: result.target,
        source: result.source,
        boundAt: this.now().toISOString(),
      });
    }
    return result;
  }

  async deliver(input: {
    readonly target: ImmutableCanvasWriteTarget;
    readonly artifactId: string;
    readonly artifact: CanvasBoardDeliveryArtifact;
    readonly sourceId: string;
  }): Promise<CanvasBoardDeliveryResult> {
    const canvasApi = await this.options.getCanvasApi();
    const createdAt = this.now().toISOString();
    const result = await canvasApi.boards.deliver({
      version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
      target: input.target,
      provenance: {
        version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
        deliveryId: `canvas-delivery:${input.artifactId}`,
        artifactId: input.artifactId,
        kind: input.artifact.kind,
        conversationId: input.target.conversationId,
        ...(input.target.turnId ? { turnId: input.target.turnId } : {}),
        ...(input.target.taskId ? { taskId: input.target.taskId } : {}),
        ...(input.target.runId ? { runId: input.target.runId } : {}),
        sourceId: input.sourceId,
        createdAt,
      },
      artifact: input.artifact,
    });
    if ((result.status === 'delivered' || result.status === 'noop') && result.revision) {
      await this.options.bindings.set(input.target.conversationId, {
        version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
        scope: 'conversation',
        scopeId: input.target.conversationId,
        conversationId: input.target.conversationId,
        target: { ...input.target, revision: result.revision },
        source: input.target.resolutionSource,
        boundAt: createdAt,
      });
    }
    return result;
  }

  removeConversationBinding(conversationId: string): Promise<void> {
    return this.options.bindings.delete(conversationId);
  }
}

export async function getCanvasBoardApi(): Promise<Pick<NekoCanvasAPI, 'boards'>> {
  const extension = vscode.extensions.getExtension<NekoCanvasAPI>(NEKO_EXTENSION_IDS.NEKO_CANVAS);
  if (!extension) {
    throw new Error('Canvas extension is not installed for Board resolution.');
  }
  const api = extension.isActive ? extension.exports : await extension.activate();
  if (!api?.boards?.resolve || !api.boards.query || !api.boards.deliver) {
    throw new Error('Canvas Board query/resolver API is unavailable.');
  }
  return api;
}
