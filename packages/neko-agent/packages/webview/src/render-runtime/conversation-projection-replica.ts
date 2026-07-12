import type {
  ConversationProjectionPatch,
  ConversationProjectionSnapshot,
} from '@neko-agent/types';
import {
  applyConversationProjectionPatch,
  cloneConversationProjectionSnapshot,
} from '@neko-agent/types';

export interface ConversationProjectionReplicaSnapshot {
  readonly conversationId: string;
  readonly projection: ConversationProjectionSnapshot | null;
  readonly revision: number;
}

export interface ConversationProjectionReplica {
  getSnapshot(): ConversationProjectionReplicaSnapshot;
  subscribe(listener: () => void): () => void;
  installSnapshot(snapshot: ConversationProjectionSnapshot): void;
  applyPatch(patch: ConversationProjectionPatch): void;
  dispose(): void;
}

export function createConversationProjectionReplica(
  conversationId: string,
): ConversationProjectionReplica {
  return new DefaultConversationProjectionReplica(conversationId);
}

class DefaultConversationProjectionReplica implements ConversationProjectionReplica {
  private snapshot: ConversationProjectionReplicaSnapshot;
  private readonly listeners = new Set<() => void>();
  private disposed = false;

  constructor(private readonly conversationId: string) {
    assertRequiredIdentity('conversationId', conversationId);
    this.snapshot = Object.freeze({
      conversationId,
      projection: null,
      revision: 0,
    });
  }

  getSnapshot(): ConversationProjectionReplicaSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.assertActive();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  installSnapshot(snapshot: ConversationProjectionSnapshot): void {
    this.assertActive();
    this.assertOwner(snapshot.conversationId);
    assertProjectionVersion(snapshot.projectionVersion);
    this.commit(cloneConversationProjectionSnapshot(snapshot));
  }

  applyPatch(patch: ConversationProjectionPatch): void {
    this.assertActive();
    this.assertOwner(patch.conversationId);
    const projection = this.snapshot.projection;
    if (!projection) {
      throw new Error(
        `Conversation projection replica ${this.conversationId} requires a snapshot before patches.`,
      );
    }
    this.commit(applyConversationProjectionPatch(projection, patch));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.clear();
  }

  private commit(projection: ConversationProjectionSnapshot): void {
    this.snapshot = Object.freeze({
      conversationId: this.conversationId,
      projection,
      revision: this.snapshot.revision + 1,
    });
    for (const listener of this.listeners) listener();
  }

  private assertOwner(conversationId: string): void {
    if (conversationId !== this.conversationId) {
      throw new Error(
        `Conversation projection replica owner mismatch: expected ${this.conversationId}, received ${conversationId}.`,
      );
    }
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error(`Conversation projection replica ${this.conversationId} is disposed.`);
    }
  }
}

function assertProjectionVersion(version: number): void {
  if (!Number.isInteger(version) || version < 0) {
    throw new Error(`Conversation projection snapshot has invalid version ${version}.`);
  }
}

function assertRequiredIdentity(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new Error(`Projection replica ${name} is required.`);
  }
}
