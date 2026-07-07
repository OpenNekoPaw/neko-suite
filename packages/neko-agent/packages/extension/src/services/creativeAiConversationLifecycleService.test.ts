import { describe, expect, it } from 'vitest';
import {
  CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
  type ConversationLifecycleCommand,
  type CreativeAiDocumentRef,
  type CreativeAiSourceRef,
  type CreativeAiTargetRef,
  type ExternalCreativeAiInvocation,
} from '@neko/shared/types/creative-ai-invocation';
import { CreativeAiConversationLifecycleService } from './creativeAiConversationLifecycleService';
import {
  CreativeAiConversationRoutingService,
  createMemoryCreativeAiAssociationStorage,
  type CreativeAiBackgroundConversationCreateInput,
  type CreativeAiConversationAssociationIndex,
  type CreativeAiConversationRoutingPort,
} from './creativeAiConversationRoutingService';

const ASSOCIATION_KEY = 'neko-canvas:document:doc-1';

const documentRef: CreativeAiDocumentRef = {
  kind: 'nk-document',
  packageId: 'neko-canvas',
  documentId: 'doc-1',
  projectRelativePath: 'boards/intro.nkc',
  label: 'Intro Board',
};

const sourceRef: CreativeAiSourceRef = {
  kind: 'canvas-node',
  packageId: 'neko-canvas',
  id: 'node-1',
  documentRef,
};

const targetRef: CreativeAiTargetRef = {
  kind: 'canvas-field',
  packageId: 'neko-canvas',
  id: 'node-1#/data/prompt',
  documentRef,
  fieldPath: '/data/prompt',
};

class FakeConversationPort implements CreativeAiConversationRoutingPort {
  readonly conversations = new Set<string>();
  readonly deletedHistory: string[] = [];
  readonly created: CreativeAiBackgroundConversationCreateInput[] = [];
  selectedConversationId: string | null = null;

  constructor(conversationIds: readonly string[]) {
    for (const conversationId of conversationIds) {
      this.conversations.add(conversationId);
    }
  }

  getSelectedAgentConversationId(): string | null {
    return this.selectedConversationId;
  }

  hasConversation(conversationId: string): boolean {
    return this.conversations.has(conversationId);
  }

  createBackgroundConversation(input: CreativeAiBackgroundConversationCreateInput): string {
    this.created.push(input);
    const conversationId = `background-created-${this.created.length}`;
    this.conversations.add(conversationId);
    return conversationId;
  }

  deleteConversationHistory(conversationId: string): void {
    this.deletedHistory.push(conversationId);
    this.conversations.delete(conversationId);
  }
}

class FakeRunPort {
  readonly active = new Map<string, string[]>();
  readonly cancelled: Array<{
    readonly conversationId: string;
    readonly runIds: readonly string[];
    readonly reason: string;
  }> = [];

  listActiveRunIds(conversationId: string): readonly string[] {
    return this.active.get(conversationId) ?? [];
  }

  cancelRuns(conversationId: string, runIds: readonly string[], reason: string): void {
    this.cancelled.push({ conversationId, runIds: [...runIds], reason });
    this.active.set(conversationId, []);
  }
}

function lifecycleCommand(
  action: ConversationLifecycleCommand['action'],
  conversationId = 'background-1',
): ConversationLifecycleCommand {
  return {
    schemaVersion: CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
    commandId: `${action}-${conversationId}`,
    conversationId,
    action,
  };
}

function associationIndex(
  records: CreativeAiConversationAssociationIndex['records'],
): CreativeAiConversationAssociationIndex {
  return {
    version: 1,
    records,
  };
}

function externalInvocation(): ExternalCreativeAiInvocation {
  return {
    schemaVersion: CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
    domain: 'external-creative-package',
    invocationId: 'invoke-1',
    sourcePackage: 'neko-canvas',
    documentRef,
    sourceRef,
    targetRef,
    intent: 'Improve the node prompt.',
    mode: 'edit',
    writeback: { kind: 'mutating', requiresRevisionMatch: true },
    routing: { associationKey: ASSOCIATION_KEY },
    idempotencyKey: 'neko-canvas:doc-1:node-1:prompt:edit:doc-rev-1',
  };
}

describe('CreativeAiConversationLifecycleService', () => {
  it('rejects ordinary archive/delete with active runs and allows stop-and-archive', async () => {
    const conversations = new FakeConversationPort(['background-1']);
    const runs = new FakeRunPort();
    runs.active.set('background-1', ['run-1', 'run-2']);
    const routing = new CreativeAiConversationRoutingService({
      conversations,
      storage: createMemoryCreativeAiAssociationStorage(
        associationIndex([
          {
            conversationId: 'background-1',
            sourcePackage: 'neko-canvas',
            associationKey: ASSOCIATION_KEY,
            state: 'active',
            createdAt: 10,
            updatedAt: 20,
            lastActivityAt: 20,
          },
        ]),
      ),
    });
    const lifecycle = new CreativeAiConversationLifecycleService({
      associations: routing,
      conversations,
      runs,
    });

    const archive = await lifecycle.handleCommand(lifecycleCommand('archive'));
    expect(archive.ok).toBe(false);
    if (archive.ok) return;
    expect(archive.diagnostics).toEqual([
      expect.objectContaining({
        code: 'creative-ai-lifecycle-active-runs',
        metadata: expect.objectContaining({ activeRunIds: ['run-1', 'run-2'] }),
      }),
    ]);

    const stopped = await lifecycle.handleCommand(lifecycleCommand('stop-and-archive'));
    expect(stopped).toEqual(
      expect.objectContaining({
        ok: true,
        conversationId: 'background-1',
        state: 'archived',
      }),
    );
    expect(runs.cancelled).toEqual([
      {
        conversationId: 'background-1',
        runIds: ['run-1', 'run-2'],
        reason: 'stop-and-archive',
      },
    ]);
    await expect(routing.getAssociations()).resolves.toEqual([
      expect.objectContaining({ conversationId: 'background-1', state: 'archived' }),
    ]);
  });

  it('restores archived conversations and excludes archived records from default routing', async () => {
    const conversations = new FakeConversationPort(['background-archived', 'background-active']);
    const runs = new FakeRunPort();
    const routing = new CreativeAiConversationRoutingService({
      conversations,
      storage: createMemoryCreativeAiAssociationStorage(
        associationIndex([
          {
            conversationId: 'background-active',
            sourcePackage: 'neko-canvas',
            associationKey: ASSOCIATION_KEY,
            state: 'active',
            createdAt: 10,
            updatedAt: 20,
            lastActivityAt: 20,
          },
          {
            conversationId: 'background-archived',
            sourcePackage: 'neko-canvas',
            associationKey: ASSOCIATION_KEY,
            state: 'archived',
            createdAt: 30,
            updatedAt: 40,
            lastActivityAt: 40,
          },
        ]),
      ),
      now: () => 100,
    });
    const lifecycle = new CreativeAiConversationLifecycleService({
      associations: routing,
      conversations,
      runs,
    });

    const routed = await routing.routeExternalInvocation(externalInvocation());
    expect(routed.ok).toBe(true);
    if (!routed.ok) return;
    expect(routed.decision).toEqual(
      expect.objectContaining({
        conversationId: 'background-active',
        routingReason: 'recent-associated-conversation',
        diagnostics: [
          expect.objectContaining({ code: 'creative-ai-routing-conversation-archived' }),
        ],
      }),
    );

    const restored = await lifecycle.handleCommand(
      lifecycleCommand('restore', 'background-archived'),
    );
    expect(restored).toEqual(
      expect.objectContaining({
        ok: true,
        conversationId: 'background-archived',
        state: 'active',
      }),
    );
  });

  it('stop-and-delete cancels active runs and deletes conversation history without touching promoted memory', async () => {
    const conversations = new FakeConversationPort(['background-1']);
    const runs = new FakeRunPort();
    runs.active.set('background-1', ['run-1']);
    const promotedMemory = ['character:aki:visual-style'];
    const routing = new CreativeAiConversationRoutingService({
      conversations,
      storage: createMemoryCreativeAiAssociationStorage(
        associationIndex([
          {
            conversationId: 'background-1',
            sourcePackage: 'neko-canvas',
            associationKey: ASSOCIATION_KEY,
            state: 'active',
            createdAt: 10,
            updatedAt: 20,
            lastActivityAt: 20,
          },
        ]),
      ),
    });
    const lifecycle = new CreativeAiConversationLifecycleService({
      associations: routing,
      conversations,
      runs,
    });

    const ordinaryDelete = await lifecycle.handleCommand(lifecycleCommand('delete'));
    expect(ordinaryDelete.ok).toBe(false);

    const stoppedDelete = await lifecycle.handleCommand(lifecycleCommand('stop-and-delete'));
    expect(stoppedDelete).toEqual(
      expect.objectContaining({
        ok: true,
        conversationId: 'background-1',
        state: 'deleted',
      }),
    );
    expect(runs.cancelled).toEqual([
      {
        conversationId: 'background-1',
        runIds: ['run-1'],
        reason: 'stop-and-delete',
      },
    ]);
    expect(conversations.deletedHistory).toEqual(['background-1']);
    expect(promotedMemory).toEqual(['character:aki:visual-style']);
    await expect(routing.getAssociations()).resolves.toEqual([
      expect.objectContaining({ conversationId: 'background-1', state: 'deleted' }),
    ]);
  });

  it('does not archive or delete conversations when an editor closes', async () => {
    const conversations = new FakeConversationPort(['background-1']);
    const runs = new FakeRunPort();
    const routing = new CreativeAiConversationRoutingService({
      conversations,
      storage: createMemoryCreativeAiAssociationStorage(
        associationIndex([
          {
            conversationId: 'background-1',
            sourcePackage: 'neko-canvas',
            associationKey: ASSOCIATION_KEY,
            state: 'active',
            createdAt: 10,
            updatedAt: 20,
            lastActivityAt: 20,
          },
        ]),
      ),
    });
    const lifecycle = new CreativeAiConversationLifecycleService({
      associations: routing,
      conversations,
      runs,
    });

    const result = await lifecycle.handleEditorClosed(ASSOCIATION_KEY);

    expect(result.ok).toBe(true);
    expect(conversations.deletedHistory).toEqual([]);
    await expect(routing.getAssociations()).resolves.toEqual([
      expect.objectContaining({ conversationId: 'background-1', state: 'active' }),
    ]);
  });

  it('allows multiple active conversations for the same document and archives only the requested one', async () => {
    const conversations = new FakeConversationPort(['background-a', 'background-b']);
    const runs = new FakeRunPort();
    const routing = new CreativeAiConversationRoutingService({
      conversations,
      storage: createMemoryCreativeAiAssociationStorage(
        associationIndex([
          {
            conversationId: 'background-a',
            sourcePackage: 'neko-canvas',
            associationKey: ASSOCIATION_KEY,
            state: 'active',
            createdAt: 10,
            updatedAt: 20,
            lastActivityAt: 20,
          },
          {
            conversationId: 'background-b',
            sourcePackage: 'neko-canvas',
            associationKey: ASSOCIATION_KEY,
            state: 'active',
            createdAt: 30,
            updatedAt: 40,
            lastActivityAt: 40,
          },
        ]),
      ),
    });
    const lifecycle = new CreativeAiConversationLifecycleService({
      associations: routing,
      conversations,
      runs,
    });

    await lifecycle.handleCommand(lifecycleCommand('archive', 'background-b'));

    await expect(routing.getAssociations()).resolves.toEqual([
      expect.objectContaining({ conversationId: 'background-a', state: 'active' }),
      expect.objectContaining({ conversationId: 'background-b', state: 'archived' }),
    ]);
    const routed = await routing.routeExternalInvocation(externalInvocation());
    expect(routed.ok).toBe(true);
    if (!routed.ok) return;
    expect(routed.decision.conversationId).toBe('background-a');
  });
});
