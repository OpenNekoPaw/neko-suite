import { describe, expect, it, vi } from 'vitest';
import {
  CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
  createGeneratedAssetRevisionRef,
  type CanvasBoardDeliveryResult,
  type CanvasBoardResolutionResult,
  type ImmutableCanvasWriteTarget,
} from '@neko/shared';
import {
  AgentCanvasBoardWorkRuntime,
  classifyAgentCanvasBoardWorkIntent,
} from './agentCanvasBoardWorkRuntime';

const target: ImmutableCanvasWriteTarget = {
  documentRef: { kind: 'workspace-path', path: 'neko/boards/story.nkc' },
  documentId: 'document:story',
  canvasId: 'canvas:story',
  revision: 'nkc:1',
  conversationId: 'conversation:1',
  turnId: 'turn:1',
  runId: 'run:1',
  resolutionSource: 'created',
  frozenAt: '2026-07-15T01:00:00.000Z',
};

function resolved(): CanvasBoardResolutionResult {
  return {
    version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
    status: 'resolved',
    source: 'created',
    target,
    diagnostics: [],
  };
}

describe('AgentCanvasBoardWorkRuntime', () => {
  it('does not create a Board for ordinary conversation', async () => {
    const resolveForWork = vi.fn();
    const runtime = new AgentCanvasBoardWorkRuntime({
      coordinator: { resolveForWork, deliver: vi.fn() },
    });

    const session = await runtime.begin({
      conversationId: 'conversation:1',
      turnId: 'turn:1',
      runId: 'run:1',
      message: '解释一下 React 的 useMemo。',
    });

    expect(session).toBeUndefined();
    expect(resolveForWork).not.toHaveBeenCalled();
  });

  it('resolves before creator work and advances only from authoritative delivery revisions', async () => {
    const resolveForWork = vi.fn(async () => resolved());
    const deliver = vi
      .fn()
      .mockImplementationOnce(
        async ({ target: writeTarget }): Promise<CanvasBoardDeliveryResult> => ({
          version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
          status: 'delivered',
          target: writeTarget,
          revision: 'nkc:2',
          nodeIds: ['markdown:1'],
          diagnostics: [],
        }),
      )
      .mockImplementationOnce(
        async ({ target: writeTarget }): Promise<CanvasBoardDeliveryResult> => ({
          version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
          status: 'delivered',
          target: writeTarget,
          revision: 'nkc:3',
          nodeIds: ['media:1'],
          diagnostics: [],
        }),
      );
    const runtime = new AgentCanvasBoardWorkRuntime({ coordinator: { resolveForWork, deliver } });
    const session = await runtime.begin({
      conversationId: 'conversation:1',
      turnId: 'turn:1',
      runId: 'run:1',
      message: '写一个分镜并生成图片',
    });
    const lifecycle = createGeneratedAssetRevisionRef({
      assetId: 'asset:1',
      contentDigest: 'sha256:asset-1',
      mediaKind: 'image',
      mimeType: 'image/png',
      generation: { taskId: 'task:1' },
    });

    await session?.deliverMarkdown({ messageId: 'assistant:1', markdown: '# 分镜' });
    await session?.deliverGeneratedAssets('task:1', [
      {
        type: 'generated-image',
        id: 'asset:1',
        path: '/host-only/generated.png',
        mimeType: 'image/png',
        generatedAt: '2026-07-15T01:00:00.000Z',
        width: 1024,
        height: 1024,
        ratio: '1:1',
        lifecycle,
      },
    ]);

    expect(resolveForWork).toHaveBeenCalledBefore(deliver);
    expect(deliver).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ target: expect.objectContaining({ revision: 'nkc:1' }) }),
    );
    expect(deliver).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        target: expect.objectContaining({ revision: 'nkc:2', taskId: 'task:1' }),
      }),
    );
  });

  it('keeps media task output recoverable and reports a missing stable identity', async () => {
    const diagnostics = vi.fn();
    const deliver = vi.fn();
    const runtime = new AgentCanvasBoardWorkRuntime({
      coordinator: { resolveForWork: vi.fn(async () => resolved()), deliver },
      onDiagnostic: diagnostics,
    });
    const session = await runtime.begin({
      conversationId: 'conversation:1',
      turnId: 'turn:1',
      runId: 'run:1',
      message: '生成一张图片',
      forceMedia: true,
    });

    await session?.deliverGeneratedAssets('task:1', [
      {
        type: 'generated-image',
        id: 'asset:missing-ref',
        path: '/host-only/generated.png',
        mimeType: 'image/png',
        generatedAt: '2026-07-15T01:00:00.000Z',
        width: 1024,
        height: 1024,
        ratio: '1:1',
      },
    ]);

    expect(deliver).not.toHaveBeenCalled();
    expect(diagnostics).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'delivery', conversationId: 'conversation:1' }),
    );
  });

  it('keeps concurrent conversation targets independent from UI navigation', async () => {
    const deliver = vi.fn(async ({ target: writeTarget }): Promise<CanvasBoardDeliveryResult> => ({
      version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
      status: 'delivered',
      target: writeTarget,
      revision: `${writeTarget.revision}:next`,
      diagnostics: [],
    }));
    const runtime = new AgentCanvasBoardWorkRuntime({
      coordinator: {
        resolveForWork: vi.fn(async (request) => ({
          ...resolved(),
          target: {
            ...target,
            conversationId: request.conversationId,
            documentRef: {
              kind: 'workspace-path' as const,
              path: `neko/boards/${request.conversationId}.nkc`,
            },
            documentId: `document:${request.conversationId}`,
            canvasId: `canvas:${request.conversationId}`,
          },
        })),
        deliver,
      },
    });
    const first = await runtime.begin({
      conversationId: 'conversation:1',
      turnId: 'turn:1',
      runId: 'run:1',
      message: '写一个剧本文档',
    });
    const second = await runtime.begin({
      conversationId: 'conversation:2',
      turnId: 'turn:2',
      runId: 'run:2',
      message: '写一个剧本文档',
    });

    await Promise.all([
      first?.deliverMarkdown({ messageId: 'assistant:1', markdown: '# One' }),
      second?.deliverMarkdown({ messageId: 'assistant:2', markdown: '# Two' }),
    ]);

    expect(deliver.mock.calls.map(([call]) => call.target.documentRef.path).sort()).toEqual([
      'neko/boards/conversation:1.nkc',
      'neko/boards/conversation:2.nkc',
    ]);
    expect(JSON.stringify(deliver.mock.calls)).not.toContain('activeCanvas');
  });

  it('surfaces a stale delivery without resolving or retargeting again', async () => {
    const diagnostics = vi.fn();
    const resolveForWork = vi.fn(async () => resolved());
    const deliver = vi.fn(async ({ target: writeTarget }): Promise<CanvasBoardDeliveryResult> => ({
      version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
      status: 'blocked',
      target: writeTarget,
      diagnostics: [
        {
          code: 'stale-board-target',
          severity: 'error',
          message: 'The creator edited this Board while generation was running.',
        },
      ],
    }));
    const runtime = new AgentCanvasBoardWorkRuntime({
      coordinator: { resolveForWork, deliver },
      onDiagnostic: diagnostics,
    });
    const session = await runtime.begin({
      conversationId: 'conversation:1',
      turnId: 'turn:1',
      runId: 'run:1',
      message: '写一个剧本文档',
    });

    await session?.deliverMarkdown({ messageId: 'assistant:1', markdown: '# Draft' });

    expect(resolveForWork).toHaveBeenCalledTimes(1);
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(diagnostics).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'delivery',
        message: expect.stringContaining('edited this Board'),
      }),
    );
  });
});

describe('classifyAgentCanvasBoardWorkIntent', () => {
  it('separates media-only work from creator Markdown and rejects adjacent negatives', () => {
    expect(classifyAgentCanvasBoardWorkIntent({ message: '生成一张角色海报' })?.kinds).toEqual(
      new Set(['media']),
    );
    expect(classifyAgentCanvasBoardWorkIntent({ message: '写一个角色设定文档' })?.kinds).toEqual(
      new Set(['markdown']),
    );
    expect(classifyAgentCanvasBoardWorkIntent({ message: '图片格式有哪些？' })).toBeUndefined();
  });
});
