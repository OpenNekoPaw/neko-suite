import type {
  ProjectionAttachmentHostFrame,
  ProjectionAttachmentKey,
  ProjectionAttachRequest,
  ProjectionDetachMessage,
  ProjectionPatchFrame,
  ProjectionSnapshotAcknowledgement,
  ProjectionSnapshotFrame,
} from '@neko-agent/types';
import { isSameProjectionAttachment } from '@neko-agent/types';
import type {
  ConversationProjectionPatch,
  ConversationProjectionSnapshot,
  ConversationProjectionStore,
} from '@neko/agent/runtime';

export type ConversationProjectionAttachmentHostFrame = ProjectionAttachmentHostFrame<
  ConversationProjectionSnapshot,
  ConversationProjectionPatch
>;

export interface ConversationProjectionAttachmentServerOptions {
  readonly endpointEpoch: string;
  readonly resolveProjection: (conversationId: string) => ConversationProjectionStore;
  readonly postMessage: (frame: ConversationProjectionAttachmentHostFrame) => Promise<boolean>;
  readonly reportError: (error: Error, key: ProjectionAttachmentKey) => void;
}

export interface ConversationProjectionAttachmentServer {
  attach(request: ProjectionAttachRequest): Promise<void>;
  acknowledge(acknowledgement: ProjectionSnapshotAcknowledgement): Promise<void>;
  detach(message: ProjectionDetachMessage): Promise<void>;
  dispose(): Promise<void>;
}

export function createConversationProjectionAttachmentServer(
  options: ConversationProjectionAttachmentServerOptions,
): ConversationProjectionAttachmentServer {
  return new DefaultConversationProjectionAttachmentServer(options);
}

type AttachmentPhase = 'attaching' | 'awaiting-snapshot-ack' | 'live' | 'closing' | 'failed';

class DefaultConversationProjectionAttachmentServer implements ConversationProjectionAttachmentServer {
  private readonly attachmentsById = new Map<string, ProjectionAttachment>();
  private readonly attachmentIdByTabId = new Map<string, string>();
  private disposed = false;

  constructor(private readonly options: ConversationProjectionAttachmentServerOptions) {
    assertRequiredIdentity('endpointEpoch', options.endpointEpoch);
  }

  async attach(request: ProjectionAttachRequest): Promise<void> {
    this.assertActive();
    this.assertEndpoint(request.key);
    assertRequiredIdentity('attachmentId', request.key.attachmentId);
    assertRequiredIdentity('tabId', request.key.tabId);
    assertRequiredIdentity('conversationId', request.key.conversationId);
    if (this.attachmentsById.has(request.key.attachmentId)) {
      throw new Error(
        `Projection attachment ${request.key.attachmentId} is already registered for this endpoint.`,
      );
    }
    const existingAttachmentId = this.attachmentIdByTabId.get(request.key.tabId);
    if (existingAttachmentId) {
      throw new Error(
        `Projection Tab ${request.key.tabId} is already attached as ${existingAttachmentId}.`,
      );
    }

    const projection = this.options.resolveProjection(request.key.conversationId);
    if (projection.conversationId !== request.key.conversationId) {
      throw new Error(
        `Projection resolver returned conversation ${projection.conversationId} for ${request.key.conversationId}.`,
      );
    }
    const attachment = new ProjectionAttachment({
      key: request.key,
      projection,
      postMessage: this.options.postMessage,
      reportError: this.options.reportError,
    });
    this.attachmentsById.set(request.key.attachmentId, attachment);
    this.attachmentIdByTabId.set(request.key.tabId, request.key.attachmentId);
    try {
      await attachment.start();
    } catch (error: unknown) {
      this.removeAttachment(attachment);
      throw error;
    }
  }

  async acknowledge(acknowledgement: ProjectionSnapshotAcknowledgement): Promise<void> {
    this.assertActive();
    const attachment = this.requireAttachment(acknowledgement.key);
    await attachment.acknowledge(acknowledgement);
  }

  async detach(message: ProjectionDetachMessage): Promise<void> {
    this.assertActive();
    const attachment = this.requireAttachment(message.key);
    try {
      await attachment.detach(message);
    } finally {
      this.removeAttachment(attachment);
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const attachments = Array.from(this.attachmentsById.values());
    await Promise.all(
      attachments.map(async (attachment) => {
        try {
          await attachment.detach({
            type: 'projectionDetach',
            key: attachment.key,
            reason: 'endpoint-replaced',
          });
        } finally {
          this.removeAttachment(attachment);
        }
      }),
    );
  }

  private requireAttachment(key: ProjectionAttachmentKey): ProjectionAttachment {
    this.assertEndpoint(key);
    const attachment = this.attachmentsById.get(key.attachmentId);
    if (!attachment) {
      throw new Error(`Projection attachment ${key.attachmentId} is not registered.`);
    }
    if (!isSameProjectionAttachment(attachment.key, key)) {
      throw new Error(`Projection attachment identity mismatch for ${key.attachmentId}.`);
    }
    return attachment;
  }

  private removeAttachment(attachment: ProjectionAttachment): void {
    if (this.attachmentsById.get(attachment.key.attachmentId) === attachment) {
      this.attachmentsById.delete(attachment.key.attachmentId);
    }
    if (this.attachmentIdByTabId.get(attachment.key.tabId) === attachment.key.attachmentId) {
      this.attachmentIdByTabId.delete(attachment.key.tabId);
    }
  }

  private assertEndpoint(key: ProjectionAttachmentKey): void {
    if (key.endpointEpoch !== this.options.endpointEpoch) {
      throw new Error(
        `Projection attachment endpoint mismatch: expected ${this.options.endpointEpoch}, received ${key.endpointEpoch}.`,
      );
    }
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error('Projection attachment server is disposed.');
    }
  }
}

interface ProjectionAttachmentOptions {
  readonly key: ProjectionAttachmentKey;
  readonly projection: ConversationProjectionStore;
  readonly postMessage: (frame: ConversationProjectionAttachmentHostFrame) => Promise<boolean>;
  readonly reportError: (error: Error, key: ProjectionAttachmentKey) => void;
}

class ProjectionAttachment {
  readonly key: ProjectionAttachmentKey;
  private phase: AttachmentPhase = 'attaching';
  private snapshotVersion: number | undefined;
  private deliveredProjectionVersion: number | undefined;
  private nextPatchSequence = 1;
  private pendingPatches: ConversationProjectionPatch[] = [];
  private unsubscribe: (() => void) | undefined;
  private tail: Promise<void> = Promise.resolve();
  private fatalError: Error | undefined;

  constructor(private readonly options: ProjectionAttachmentOptions) {
    this.key = { ...options.key };
  }

  start(): Promise<void> {
    this.unsubscribe = this.options.projection.subscribe((patch) => this.acceptPatch(patch));
    const snapshot = this.options.projection.snapshot();
    this.snapshotVersion = snapshot.projectionVersion;
    this.deliveredProjectionVersion = snapshot.projectionVersion;
    const frame: ProjectionSnapshotFrame<ConversationProjectionSnapshot> = {
      type: 'projectionSnapshot',
      key: this.key,
      sequence: 0,
      projectionVersion: snapshot.projectionVersion,
      projection: snapshot,
    };
    return this.enqueue(async () => {
      await this.deliver(frame);
      if (this.phase === 'attaching') {
        this.phase = 'awaiting-snapshot-ack';
      }
    }).catch((error: unknown) => {
      const fatal = toError(error);
      this.fail(fatal);
      throw fatal;
    });
  }

  acknowledge(acknowledgement: ProjectionSnapshotAcknowledgement): Promise<void> {
    if (!isSameProjectionAttachment(this.key, acknowledgement.key)) {
      throw new Error(`Projection attachment identity mismatch for ${this.key.attachmentId}.`);
    }
    return this.enqueue(async () => {
      this.assertHealthy();
      if (this.phase !== 'awaiting-snapshot-ack') {
        throw new Error(
          `Projection attachment ${this.key.attachmentId} cannot acknowledge a snapshot while ${this.phase}.`,
        );
      }
      if (
        acknowledgement.sequence !== 0 ||
        acknowledgement.projectionVersion !== this.snapshotVersion
      ) {
        throw new Error(
          `Projection attachment ${this.key.attachmentId} received a stale snapshot acknowledgement.`,
        );
      }

      this.phase = 'live';
      const patches = this.pendingPatches;
      this.pendingPatches = [];
      for (const patch of patches) {
        await this.deliverPatch(patch);
      }
    }).catch((error: unknown) => {
      const fatal = toError(error);
      this.fail(fatal);
      throw fatal;
    });
  }

  detach(message: ProjectionDetachMessage): Promise<void> {
    if (!isSameProjectionAttachment(this.key, message.key)) {
      throw new Error(`Projection attachment identity mismatch for ${this.key.attachmentId}.`);
    }
    if (this.phase === 'closing') return this.tail;
    this.phase = 'closing';
    this.unsubscribeProjection();
    this.pendingPatches = [];
    return this.enqueue(() => this.deliver(message));
  }

  private acceptPatch(patch: ConversationProjectionPatch): void {
    if (patch.conversationId !== this.key.conversationId) {
      this.fail(
        new Error(
          `Projection attachment ${this.key.attachmentId} received patch for conversation ${patch.conversationId}.`,
        ),
      );
      return;
    }
    if (this.phase === 'attaching' || this.phase === 'awaiting-snapshot-ack') {
      this.pendingPatches.push(patch);
      return;
    }
    if (this.phase !== 'live') return;
    void this.enqueue(() => this.deliverPatch(patch)).catch((error: unknown) => {
      this.fail(toError(error));
    });
  }

  private async deliverPatch(patch: ConversationProjectionPatch): Promise<void> {
    this.assertHealthy();
    if (patch.baseProjectionVersion !== this.deliveredProjectionVersion) {
      throw new Error(
        `Projection attachment ${this.key.attachmentId} patch base mismatch: expected ${this.deliveredProjectionVersion}, received ${patch.baseProjectionVersion}.`,
      );
    }
    const frame: ProjectionPatchFrame<ConversationProjectionPatch> = {
      type: 'projectionPatch',
      key: this.key,
      sequence: this.nextPatchSequence,
      baseProjectionVersion: patch.baseProjectionVersion,
      projectionVersion: patch.projectionVersion,
      patch,
    };
    await this.deliver(frame);
    this.nextPatchSequence += 1;
    this.deliveredProjectionVersion = patch.projectionVersion;
  }

  private async deliver(frame: ConversationProjectionAttachmentHostFrame): Promise<void> {
    const delivered = await this.options.postMessage(frame);
    if (!delivered) {
      throw new Error(
        `Projection attachment ${this.key.attachmentId} endpoint rejected ${frame.type}.`,
      );
    }
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.tail.then(operation);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private fail(error: Error): void {
    if (this.fatalError) return;
    this.fatalError = error;
    this.phase = 'failed';
    this.unsubscribeProjection();
    this.pendingPatches = [];
    this.options.reportError(error, this.key);
  }

  private assertHealthy(): void {
    if (this.fatalError) throw this.fatalError;
  }

  private unsubscribeProjection(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }
}

function assertRequiredIdentity(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new Error(`Projection attachment ${name} is required.`);
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
