import { describe, expect, it, vi } from 'vitest';
import {
  CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
  type CanvasBoardDeliveryRequest,
  type CanvasBoardQuerySummary,
} from '@neko/shared';
import { CanvasBoardDeliveryService } from './canvasBoardDeliveryService';

vi.mock('vscode', () => ({
  Uri: {
    file: (fsPath: string) => ({ fsPath, toString: () => `file://${fsPath}` }),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/workspace/project' } }],
  },
}));

const summary: CanvasBoardQuerySummary = {
  documentRef: { kind: 'workspace-path', path: 'neko/boards/story.nkc' },
  documentId: 'document:story',
  canvasId: 'canvas:story',
  revision: 'nkc:revision-1',
  title: 'Story',
};

function request(artifact: CanvasBoardDeliveryRequest['artifact']): CanvasBoardDeliveryRequest {
  return {
    version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
    target: {
      ...summary,
      conversationId: 'conversation:1',
      turnId: 'turn:1',
      taskId: 'task:1',
      runId: 'run:1',
      resolutionSource: 'created',
      frozenAt: '2026-07-15T01:00:00.000Z',
    },
    provenance: {
      version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
      deliveryId: 'delivery:1',
      artifactId: 'artifact:1',
      kind: artifact.kind,
      conversationId: 'conversation:1',
      turnId: 'turn:1',
      taskId: 'task:1',
      runId: 'run:1',
      sourceId: 'assistant:1',
      createdAt: '2026-07-15T01:00:00.000Z',
    },
    artifact,
  };
}

function harness(observed: CanvasBoardQuerySummary | undefined = summary) {
  const applyAgentContent = vi.fn().mockResolvedValue({
    status: 'success',
    projectRef: { projectRevision: 'nkc:revision-2' },
    createdNodes: [{ nodeId: 'node:markdown' }],
  });
  const importAsset = vi.fn().mockResolvedValue({
    nodeId: 'node:media',
    projectRef: { projectRevision: 'nkc:revision-2' },
  });
  const createNode = vi.fn().mockResolvedValue({
    nodeId: 'node:document',
    projectRef: { projectRevision: 'nkc:revision-2' },
  });
  const service = new CanvasBoardDeliveryService({
    index: { get: vi.fn().mockResolvedValue(observed), query: vi.fn() },
    authoring: { applyAgentContent, createNode, importAsset },
  });
  return { service, applyAgentContent, createNode, importAsset };
}

describe('CanvasBoardDeliveryService', () => {
  it('writes creator Markdown to the frozen Board with provenance and revision check', async () => {
    const { service, applyAgentContent } = harness();

    const result = await service.deliver(
      request({ kind: 'markdown', title: 'Storyboard Notes', markdown: '# Notes\n\nDraft.' }),
    );

    expect(result).toMatchObject({
      status: 'delivered',
      revision: 'nkc:revision-2',
      nodeIds: ['node:markdown'],
    });
    expect(applyAgentContent).toHaveBeenCalledWith({
      target: {
        kind: 'file',
        documentUri: 'file:///workspace/project/neko/boards/story.nkc',
        expectedRevision: 'nkc:revision-1',
      },
      payload: expect.objectContaining({
        kind: 'text',
        format: 'markdown',
        provenance: {
          source: 'agent',
          conversationId: 'conversation:1',
          messageId: 'artifact:1',
          label: 'delivery:1',
        },
      }),
    });
  });

  it('passes only stable resource refs for generated media', async () => {
    const { service, importAsset } = harness();
    const resourceRef = {
      id: 'generated:image:1',
      scope: 'project',
      provider: 'generated-output',
      kind: 'generated-output',
      source: { kind: 'project-file', path: 'neko/generated/image/1.png' },
      fingerprint: { algorithm: 'sha256', value: 'abc' },
    } as never;

    const result = await service.deliver(
      request({ kind: 'image', title: 'Variant 1', mimeType: 'image/png', resourceRef }),
    );

    expect(result.status).toBe('delivered');
    expect(importAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        asset: expect.objectContaining({
          type: 'image',
          resourceRef,
          provenance: expect.objectContaining({ messageId: 'artifact:1' }),
        }),
      }),
    );
    expect(JSON.stringify(importAsset.mock.calls)).not.toMatch(/renderUri|\.neko\/\.cache/);
  });

  it('blocks stale targets without invoking any authoring path', async () => {
    const { service, applyAgentContent, importAsset } = harness({
      ...summary,
      revision: 'nkc:revision-2',
    });

    const result = await service.deliver(
      request({ kind: 'markdown', title: 'Notes', markdown: 'Draft' }),
    );

    expect(result.status).toBe('blocked');
    expect(result.diagnostics.map(({ code }) => code)).toContain('stale-board-target');
    expect(applyAgentContent).not.toHaveBeenCalled();
    expect(importAsset).not.toHaveBeenCalled();
  });

  it('authors file references through the foundational document node with stable refs', async () => {
    const { service, applyAgentContent, createNode, importAsset } = harness();

    const result = await service.deliver(
      request({
        kind: 'file-reference',
        title: 'Reference',
        resourceRef: { id: 'reference:1' } as never,
      }),
    );

    expect(result.status).toBe('delivered');
    expect(createNode).toHaveBeenCalledWith(
      expect.objectContaining({
        node: expect.objectContaining({
          type: 'document',
          data: expect.objectContaining({
            docPath: '',
            docType: 'file',
            resourceRef: { id: 'reference:1' },
            provenance: expect.objectContaining({ messageId: 'artifact:1' }),
          }),
        }),
      }),
    );
    expect(applyAgentContent).not.toHaveBeenCalled();
    expect(importAsset).not.toHaveBeenCalled();
  });
});
