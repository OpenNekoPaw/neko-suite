import { describe, expect, it, vi } from 'vitest';
import {
  CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
  type CanvasBoardBinding,
  type CanvasBoardResolutionInput,
  type CanvasBoardResolutionResult,
} from '@neko/shared';
import {
  AgentCanvasBoardCoordinator,
  MementoCanvasBoardBindingStorage,
} from './agentCanvasBoardCoordinator';

function createMemento(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    get: vi.fn(
      <T>(key: string, fallback?: T): T | undefined =>
        (values.has(key) ? values.get(key) : fallback) as T | undefined,
    ),
    update: vi.fn(async (key: string, value: unknown) => {
      values.set(key, value);
    }),
  };
}

function resolved(input: CanvasBoardResolutionInput): CanvasBoardResolutionResult {
  return {
    version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
    status: 'resolved',
    source: input.binding ? 'conversation' : 'created',
    target: {
      documentRef: { kind: 'workspace-path', path: 'neko/boards/story.nkc' },
      documentId: 'document:story',
      canvasId: 'canvas:story',
      revision: 'nkc:revision-1',
      conversationId: input.conversationId,
      ...(input.turnId ? { turnId: input.turnId } : {}),
      ...(input.taskId ? { taskId: input.taskId } : {}),
      ...(input.runId ? { runId: input.runId } : {}),
      resolutionSource: input.binding ? 'conversation' : 'created',
      frozenAt: '2026-07-15T01:00:00.000Z',
    },
    diagnostics: [],
  };
}

describe('AgentCanvasBoardCoordinator', () => {
  it('resolves through the public Canvas API and persists a conversation binding', async () => {
    const memento = createMemento();
    const bindings = new MementoCanvasBoardBindingStorage(memento);
    const resolve = vi.fn(async (input: CanvasBoardResolutionInput) => resolved(input));
    const coordinator = new AgentCanvasBoardCoordinator({
      bindings,
      getCanvasApi: async () => ({ boards: { resolve, query: vi.fn(), deliver: vi.fn() } }),
      now: () => new Date('2026-07-15T02:00:00.000Z'),
    });

    const result = await coordinator.resolveForWork({
      conversationId: 'conversation:1',
      turnId: 'turn:1',
      taskId: 'task:1',
      runId: 'run:1',
      filter: { projectId: 'project:1', workId: 'work:1' },
      suggestedTitle: 'Story',
    });

    expect(result.target).toMatchObject({
      conversationId: 'conversation:1',
      turnId: 'turn:1',
      taskId: 'task:1',
      runId: 'run:1',
    });
    expect(resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conversation:1',
        query: expect.objectContaining({ directory: 'neko/boards' }),
      }),
    );
    expect(bindings.get('conversation:1')).toMatchObject({
      scope: 'conversation',
      scopeId: 'conversation:1',
      target: expect.objectContaining({ canvasId: 'canvas:story' }),
      boundAt: '2026-07-15T02:00:00.000Z',
    });
  });

  it('restores a persisted binding after restart and passes it to Canvas resolution', async () => {
    const memento = createMemento();
    const firstStorage = new MementoCanvasBoardBindingStorage(memento);
    const firstResolve = vi.fn(async (input: CanvasBoardResolutionInput) => resolved(input));
    await new AgentCanvasBoardCoordinator({
      bindings: firstStorage,
      getCanvasApi: async () => ({
        boards: { resolve: firstResolve, query: vi.fn(), deliver: vi.fn() },
      }),
    }).resolveForWork({ conversationId: 'conversation:1', suggestedTitle: 'Story' });

    const restartedStorage = new MementoCanvasBoardBindingStorage(memento);
    const restartedResolve = vi.fn(async (input: CanvasBoardResolutionInput) => resolved(input));
    await new AgentCanvasBoardCoordinator({
      bindings: restartedStorage,
      getCanvasApi: async () => ({
        boards: { resolve: restartedResolve, query: vi.fn(), deliver: vi.fn() },
      }),
    }).resolveForWork({ conversationId: 'conversation:1', suggestedTitle: 'Story' });

    expect(restartedResolve).toHaveBeenCalledWith(
      expect.objectContaining({
        binding: expect.objectContaining({
          conversationId: 'conversation:1',
          target: expect.objectContaining({ canvasId: 'canvas:story' }),
        }),
      }),
    );
  });

  it('removes only the binding when a conversation is archived or deleted', async () => {
    const memento = createMemento();
    const bindings = new MementoCanvasBoardBindingStorage(memento);
    const binding: CanvasBoardBinding = {
      version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
      scope: 'conversation',
      scopeId: 'conversation:1',
      conversationId: 'conversation:1',
      target: {
        documentRef: { kind: 'workspace-path', path: 'neko/boards/story.nkc' },
        documentId: 'document:story',
        canvasId: 'canvas:story',
        revision: 'nkc:revision-1',
      },
      source: 'created',
      boundAt: '2026-07-15T01:00:00.000Z',
    };
    await bindings.set('conversation:1', binding);
    const coordinator = new AgentCanvasBoardCoordinator({
      bindings,
      getCanvasApi: async () => ({
        boards: { resolve: vi.fn(), query: vi.fn(), deliver: vi.fn() },
      }),
    });

    await coordinator.removeConversationBinding('conversation:1');

    expect(bindings.get('conversation:1')).toBeUndefined();
    expect(JSON.stringify([...memento.values.entries()])).not.toContain('deleteFile');
  });

  it('fails visibly on a corrupt persisted binding instead of falling back', () => {
    const memento = createMemento({
      'neko.agent.canvasBoardBindings.v1': {
        'conversation:1': {
          version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
          scope: 'conversation',
          scopeId: 'conversation:1',
          conversationId: 'conversation:1',
          target: {
            documentRef: { kind: 'workspace-path', path: '/tmp/unsafe.nkc' },
            documentId: 'document:story',
            canvasId: 'canvas:story',
            revision: 'nkc:revision-1',
          },
          source: 'created',
          boundAt: '2026-07-15T01:00:00.000Z',
        },
      },
    });
    const storage = new MementoCanvasBoardBindingStorage(memento);

    expect(() => storage.get('conversation:1')).toThrow('Invalid persisted Canvas Board binding');
  });

  it('delivers to the frozen target and advances only the persisted binding revision', async () => {
    const memento = createMemento();
    const bindings = new MementoCanvasBoardBindingStorage(memento);
    const deliver = vi.fn().mockResolvedValue({
      version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
      status: 'delivered',
      target: resolved({} as CanvasBoardResolutionInput).target,
      revision: 'nkc:revision-2',
      nodeIds: ['node:1'],
      diagnostics: [],
    });
    const coordinator = new AgentCanvasBoardCoordinator({
      bindings,
      getCanvasApi: async () => ({
        boards: { resolve: vi.fn(), query: vi.fn(), deliver },
      }),
      now: () => new Date('2026-07-15T03:00:00.000Z'),
    });
    const target = {
      documentRef: { kind: 'workspace-path' as const, path: 'neko/boards/story.nkc' },
      documentId: 'document:story',
      canvasId: 'canvas:story',
      revision: 'nkc:revision-1',
      conversationId: 'conversation:1',
      taskId: 'task:1',
      resolutionSource: 'created' as const,
      frozenAt: '2026-07-15T01:00:00.000Z',
    };

    await coordinator.deliver({
      target,
      artifactId: 'artifact:1',
      artifact: { kind: 'markdown', title: 'Notes', markdown: '# Notes' },
      sourceId: 'assistant:1',
    });

    expect(deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        target,
        provenance: expect.objectContaining({
          deliveryId: 'canvas-delivery:artifact:1',
          taskId: 'task:1',
        }),
      }),
    );
    expect(bindings.get('conversation:1')?.target.revision).toBe('nkc:revision-2');
    expect(target.revision).toBe('nkc:revision-1');
  });
});
