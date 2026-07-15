import { describe, expect, it, vi } from 'vitest';
import {
  CANVAS_BOARD_DIRECTORY,
  CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
  type CanvasBoardBinding,
  type CanvasBoardQuerySummary,
  type CanvasBoardResolutionInput,
} from '@neko/shared';
import {
  CanvasBoardResolverService,
  type CanvasBoardDocumentCreator,
  type CanvasBoardIndexReader,
} from './canvasBoardResolverService';

function summary(
  name: string,
  overrides: Partial<CanvasBoardQuerySummary> = {},
): CanvasBoardQuerySummary {
  return {
    documentRef: { kind: 'workspace-path', path: `neko/boards/${name}.nkc` },
    documentId: `document:${name}`,
    canvasId: `canvas:${name}`,
    revision: 'nkc:revision-1',
    title: name,
    projectId: 'project:1',
    workId: 'work:1',
    scopeKind: 'generic',
    ...overrides,
  };
}

function input(overrides: Partial<CanvasBoardResolutionInput> = {}): CanvasBoardResolutionInput {
  return {
    version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
    conversationId: 'conversation:1',
    turnId: 'turn:1',
    taskId: 'task:1',
    runId: 'run:1',
    query: {
      version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
      directory: CANVAS_BOARD_DIRECTORY,
      filter: { projectId: 'project:1', workId: 'work:1' },
    },
    suggestedTitle: 'Story Notes',
    ...overrides,
  };
}

function harness(
  options: {
    readonly querySummaries?: readonly CanvasBoardQuerySummary[];
    readonly documents?: readonly CanvasBoardQuerySummary[];
    readonly created?: CanvasBoardQuerySummary;
  } = {},
) {
  const documents = new Map(
    (options.documents ?? options.querySummaries ?? []).map((entry) => [
      entry.documentRef.path,
      entry,
    ]),
  );
  const index: CanvasBoardIndexReader = {
    query: vi.fn(async () => ({
      version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
      summaries: options.querySummaries ?? [],
      diagnostics: [],
    })),
    get: vi.fn(async (ref) => documents.get(ref.path)),
  };
  const creator: CanvasBoardDocumentCreator = {
    createBoardDocument: vi.fn(async () => options.created ?? summary('Story Notes')),
  };
  const service = new CanvasBoardResolverService({
    index,
    creator,
    clock: { now: () => new Date('2026-07-15T01:02:03.000Z') },
  });
  return { service, index, creator };
}

describe('CanvasBoardResolverService', () => {
  it('uses an explicit valid Board target before binding or index lookup', async () => {
    const explicitTarget = summary('explicit');
    const { service, index, creator } = harness({ documents: [explicitTarget] });

    const result = await service.resolve(input({ explicitTarget }));

    expect(result.status).toBe('resolved');
    expect(result.source).toBe('explicit');
    expect(result.target).toMatchObject({
      documentRef: explicitTarget.documentRef,
      canvasId: explicitTarget.canvasId,
      revision: explicitTarget.revision,
      frozenAt: '2026-07-15T01:02:03.000Z',
    });
    expect(index.query).not.toHaveBeenCalled();
    expect(creator.createBoardDocument).not.toHaveBeenCalled();
  });

  it('reuses a valid conversation binding and freezes task/run identity', async () => {
    const bound = summary('bound');
    const binding: CanvasBoardBinding = {
      version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
      scope: 'conversation',
      scopeId: 'conversation:1',
      conversationId: 'conversation:1',
      target: bound,
      source: 'exact-index',
      boundAt: '2026-07-15T00:00:00.000Z',
    };
    const { service, index } = harness({ documents: [bound] });

    const result = await service.resolve(input({ binding }));

    expect(result.source).toBe('conversation');
    expect(result.target).toMatchObject({
      conversationId: 'conversation:1',
      turnId: 'turn:1',
      taskId: 'task:1',
      runId: 'run:1',
      canvasId: 'canvas:bound',
    });
    expect(index.query).not.toHaveBeenCalled();
  });

  it('reuses exactly one indexed Board match', async () => {
    const match = summary('match');
    const { service, creator } = harness({ querySummaries: [match] });

    const result = await service.resolve(input());

    expect(result.source).toBe('exact-index');
    expect(result.target?.documentRef).toEqual(match.documentRef);
    expect(creator.createBoardDocument).not.toHaveBeenCalled();
  });

  it('creates a new Board for ambiguity and returns old matches only as suggestions', async () => {
    const first = summary('first');
    const second = summary('second');
    const created = summary('new-board');
    const { service, creator } = harness({ querySummaries: [first, second], created });

    const result = await service.resolve(input());

    expect(result.source).toBe('created');
    expect(result.target?.documentRef).toEqual(created.documentRef);
    expect(result.suggestions).toEqual([first, second]);
    expect(result.diagnostics.map(({ code }) => code)).toContain('ambiguous-board-match');
    expect(creator.createBoardDocument).toHaveBeenCalledWith('Story Notes', {
      projectId: 'project:1',
      workId: 'work:1',
    });
  });

  it('creates a new Board when no exact match exists', async () => {
    const created = summary('created');
    const { service } = harness({ created });

    const result = await service.resolve(input());

    expect(result.source).toBe('created');
    expect(result.target?.documentRef.path).toBe('neko/boards/created.nkc');
  });

  it('re-enters Board resolution for a stale binding without retargeting active Canvas', async () => {
    const stale = summary('bound', { revision: 'nkc:old' });
    const current = summary('bound', { revision: 'nkc:current' });
    const binding: CanvasBoardBinding = {
      version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
      scope: 'conversation',
      scopeId: 'conversation:1',
      conversationId: 'conversation:1',
      target: stale,
      source: 'conversation',
      boundAt: '2026-07-15T00:00:00.000Z',
    };
    const { service, index } = harness({ querySummaries: [current], documents: [current] });

    const result = await service.resolve(input({ binding }));

    expect(result.source).toBe('exact-index');
    expect(result.target?.revision).toBe('nkc:current');
    expect(result.diagnostics.map(({ code }) => code)).toContain('stale-board-target');
    expect(index.query).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toMatch(/active|recent|professional/i);
  });

  it('blocks a stale explicit target instead of falling back', async () => {
    const explicit = summary('explicit', { revision: 'nkc:old' });
    const current = summary('explicit', { revision: 'nkc:current' });
    const { service, index, creator } = harness({ documents: [current] });

    const result = await service.resolve(input({ explicitTarget: explicit }));

    expect(result.status).toBe('blocked');
    expect(result.diagnostics.map(({ code }) => code)).toContain('stale-board-target');
    expect(index.query).not.toHaveBeenCalled();
    expect(creator.createBoardDocument).not.toHaveBeenCalled();
  });

  it('re-enters Board resolution when a bound Board was deleted', async () => {
    const deleted = summary('deleted');
    const created = summary('recovered');
    const binding: CanvasBoardBinding = {
      version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
      scope: 'conversation',
      scopeId: 'conversation:1',
      conversationId: 'conversation:1',
      target: deleted,
      source: 'conversation',
      boundAt: '2026-07-15T00:00:00.000Z',
    };
    const { service } = harness({ created });

    const result = await service.resolve(input({ binding }));

    expect(result.source).toBe('created');
    expect(result.target?.canvasId).toBe('canvas:recovered');
    expect(result.diagnostics.map(({ code }) => code)).toContain('deleted-board-target');
  });

  it('blocks an unsafe index summary instead of using or hiding it', async () => {
    const unsafe = summary('unsafe', {
      documentRef: { kind: 'workspace-path', path: '/workspace/unsafe.nkc' },
    });
    const { service, creator } = harness({ querySummaries: [unsafe] });

    const result = await service.resolve(input());

    expect(result.status).toBe('blocked');
    expect(result.diagnostics.map(({ code }) => code)).toContain('unsafe-board-path');
    expect(creator.createBoardDocument).not.toHaveBeenCalled();
  });

  it('keeps concurrent conversation targets independent', async () => {
    const firstHarness = harness({ created: summary('conversation-1') });
    const secondHarness = harness({ created: summary('conversation-2') });

    const [first, second] = await Promise.all([
      firstHarness.service.resolve(input({ conversationId: 'conversation:1' })),
      secondHarness.service.resolve(
        input({
          conversationId: 'conversation:2',
          turnId: 'turn:2',
          taskId: 'task:2',
          runId: 'run:2',
        }),
      ),
    ]);

    expect(first.target?.conversationId).toBe('conversation:1');
    expect(second.target?.conversationId).toBe('conversation:2');
    expect(first.target?.canvasId).not.toBe(second.target?.canvasId);
  });

  it('rejects an explicit Canvas outside neko/boards before consulting any owner', async () => {
    const { service, index, creator } = harness();
    const result = await service.resolve(
      input({
        explicitTarget: {
          ...summary('professional'),
          documentRef: { kind: 'workspace-path', path: 'neko/cut/professional.nkc' },
        },
      }),
    );

    expect(result.status).toBe('blocked');
    expect(result.diagnostics.map(({ code }) => code)).toContain('board-outside-directory');
    expect(index.get).not.toHaveBeenCalled();
    expect(index.query).not.toHaveBeenCalled();
    expect(creator.createBoardDocument).not.toHaveBeenCalled();
  });
});
