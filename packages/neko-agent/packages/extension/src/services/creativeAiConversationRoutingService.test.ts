import { describe, expect, it } from 'vitest';
import {
  CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
  type CreativeAiDocumentRef,
  type CreativeAiSourceRef,
  type CreativeAiTargetRef,
  type ExternalCreativeAiInvocation,
} from '@neko/shared/types/creative-ai-invocation';
import {
  CreativeAiConversationRoutingService,
  createMemoryCreativeAiAssociationStorage,
  resolveCreativeAiAssociationKey,
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
  revision: 'source-rev-1',
};

const targetRef: CreativeAiTargetRef = {
  kind: 'canvas-field',
  packageId: 'neko-canvas',
  id: 'node-1#/data/prompt',
  documentRef,
  fieldPath: '/data/prompt',
  revision: 'target-rev-1',
};

class FakeConversationPort implements CreativeAiConversationRoutingPort {
  readonly conversations = new Set<string>();
  readonly created: CreativeAiBackgroundConversationCreateInput[] = [];
  selectedConversationId: string | null = null;
  private nextBackgroundId = 1;

  constructor(conversationIds: readonly string[] = []) {
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
    const conversationId = `background-${this.nextBackgroundId}`;
    this.nextBackgroundId += 1;
    this.conversations.add(conversationId);
    return conversationId;
  }
}

function externalInvocation(
  overrides: Partial<ExternalCreativeAiInvocation> = {},
): ExternalCreativeAiInvocation {
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
    documentRevision: 'doc-rev-1',
    targetRevision: 'target-rev-1',
    routing: { associationKey: ASSOCIATION_KEY },
    idempotencyKey: 'neko-canvas:doc-1:node-1:prompt:edit:doc-rev-1',
    ...overrides,
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

describe('CreativeAiConversationRoutingService', () => {
  it('routes Agent-internal invocations only to the selected Agent conversation', async () => {
    const conversations = new FakeConversationPort(['agent-selected', 'background-existing']);
    conversations.selectedConversationId = 'agent-selected';
    const service = new CreativeAiConversationRoutingService({
      conversations,
      storage: createMemoryCreativeAiAssociationStorage(
        associationIndex([
          {
            conversationId: 'background-existing',
            sourcePackage: 'neko-canvas',
            associationKey: ASSOCIATION_KEY,
            state: 'active',
            createdAt: 10,
            updatedAt: 20,
            lastActivityAt: 20,
          },
        ]),
      ),
      now: () => 100,
    });

    const result = await service.routeAgentInternalInvocation({
      schemaVersion: CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
      domain: 'agent-internal',
      invocationId: 'agent-action-1',
      conversationId: 'agent-selected',
      intent: 'Retry this Agent message action.',
      mode: 'retry',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision).toEqual(
      expect.objectContaining({
        conversationId: 'agent-selected',
        domain: 'agent-internal',
        routingReason: 'selected-agent-conversation',
      }),
    );
    expect(result.decision.conversationId).not.toBe('background-existing');
  });

  it('fails Agent-internal routing when no selected conversation exists', async () => {
    const service = new CreativeAiConversationRoutingService({
      conversations: new FakeConversationPort(['background-existing']),
    });

    const result = await service.routeAgentInternalInvocation({
      schemaVersion: CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
      domain: 'agent-internal',
      invocationId: 'agent-action-1',
      conversationId: 'agent-selected',
      intent: 'Retry this Agent message action.',
      mode: 'retry',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'creative-ai-routing-missing-selected-conversation' }),
      expect.objectContaining({ code: 'creative-ai-routing-prohibited-cross-domain-fallback' }),
    ]);
  });

  it('routes external creative-package invocations by recent active association', async () => {
    const conversations = new FakeConversationPort([
      'agent-selected',
      'background-old',
      'background-new',
    ]);
    conversations.selectedConversationId = 'agent-selected';
    const service = new CreativeAiConversationRoutingService({
      conversations,
      storage: createMemoryCreativeAiAssociationStorage(
        associationIndex([
          {
            conversationId: 'background-old',
            sourcePackage: 'neko-canvas',
            associationKey: ASSOCIATION_KEY,
            state: 'active',
            createdAt: 10,
            updatedAt: 20,
            lastActivityAt: 20,
          },
          {
            conversationId: 'background-new',
            sourcePackage: 'neko-canvas',
            associationKey: ASSOCIATION_KEY,
            state: 'active',
            createdAt: 30,
            updatedAt: 40,
            lastActivityAt: 40,
          },
        ]),
      ),
      now: () => 100,
    });

    const result = await service.routeExternalInvocation(externalInvocation());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision).toEqual(
      expect.objectContaining({
        conversationId: 'background-new',
        domain: 'external-creative-package',
        routingReason: 'recent-associated-conversation',
        associationKey: ASSOCIATION_KEY,
      }),
    );
    expect(result.decision.conversationId).not.toBe('agent-selected');
    expect(conversations.created).toHaveLength(0);
  });

  it('creates a background conversation for external invocations without active association', async () => {
    const conversations = new FakeConversationPort(['agent-selected']);
    conversations.selectedConversationId = 'agent-selected';
    const storage = createMemoryCreativeAiAssociationStorage();
    const service = new CreativeAiConversationRoutingService({
      conversations,
      storage,
      now: () => 100,
    });

    const result = await service.routeExternalInvocation(externalInvocation());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision).toEqual(
      expect.objectContaining({
        conversationId: 'background-1',
        routingReason: 'created-new-background-conversation',
      }),
    );
    expect(result.decision.conversationId).not.toBe('agent-selected');
    expect(conversations.created).toEqual([
      expect.objectContaining({
        sourcePackage: 'neko-canvas',
        associationKey: ASSOCIATION_KEY,
      }),
    ]);
    await expect(service.getAssociations()).resolves.toEqual([
      expect.objectContaining({
        conversationId: 'background-1',
        state: 'active',
        associationKey: ASSOCIATION_KEY,
        lastActivityAt: 100,
      }),
    ]);
  });

  it('skips archived/deleted/unavailable associated conversations without falling back to Agent selection', async () => {
    const conversations = new FakeConversationPort(['agent-selected']);
    conversations.selectedConversationId = 'agent-selected';
    const service = new CreativeAiConversationRoutingService({
      conversations,
      storage: createMemoryCreativeAiAssociationStorage(
        associationIndex([
          {
            conversationId: 'archived-background',
            sourcePackage: 'neko-canvas',
            associationKey: ASSOCIATION_KEY,
            state: 'archived',
            createdAt: 10,
            updatedAt: 20,
            lastActivityAt: 30,
          },
          {
            conversationId: 'deleted-background',
            sourcePackage: 'neko-canvas',
            associationKey: ASSOCIATION_KEY,
            state: 'deleted',
            createdAt: 10,
            updatedAt: 20,
            lastActivityAt: 20,
          },
        ]),
      ),
      now: () => 100,
    });

    const result = await service.routeExternalInvocation(externalInvocation());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision.conversationId).toBe('background-1');
    expect(result.decision.conversationId).not.toBe('agent-selected');
    expect(result.decision.diagnostics).toEqual([
      expect.objectContaining({ code: 'creative-ai-routing-conversation-archived' }),
      expect.objectContaining({ code: 'creative-ai-routing-conversation-deleted' }),
    ]);
  });

  it('reports missing external target/source diagnostics before routing', async () => {
    const service = new CreativeAiConversationRoutingService({
      conversations: new FakeConversationPort(['agent-selected']),
    });

    const missingTarget = await service.routeExternalInvocation({
      ...externalInvocation(),
      targetRef: undefined,
      candidateTargetRef: undefined,
    });

    expect(missingTarget.ok).toBe(false);
    if (missingTarget.ok) return;
    expect(missingTarget.diagnostics).toEqual([
      expect.objectContaining({ code: 'creative-ai-missing-target-ref' }),
      expect.objectContaining({ code: 'creative-ai-routing-prohibited-cross-domain-fallback' }),
    ]);
  });

  it('allows explicit user-selected conversation routing without using hidden Agent selection', async () => {
    const conversations = new FakeConversationPort(['agent-selected', 'user-picked-background']);
    conversations.selectedConversationId = 'agent-selected';
    const service = new CreativeAiConversationRoutingService({
      conversations,
      storage: createMemoryCreativeAiAssociationStorage(),
      now: () => 100,
    });

    const result = await service.routeExternalInvocation(
      externalInvocation({
        routing: {
          associationKey: ASSOCIATION_KEY,
          userSelectedConversationId: 'user-picked-background',
        },
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision).toEqual(
      expect.objectContaining({
        conversationId: 'user-picked-background',
        routingReason: 'user-selected-conversation',
      }),
    );
    expect(result.decision.conversationId).not.toBe('agent-selected');
  });

  it('derives association keys from stable document refs when routing metadata is omitted', () => {
    expect(
      resolveCreativeAiAssociationKey(
        externalInvocation({
          routing: undefined,
        }),
      ),
    ).toBe('neko-canvas:document:neko-canvas:doc-1');
  });
});
