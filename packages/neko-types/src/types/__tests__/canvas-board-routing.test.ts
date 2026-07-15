import { describe, expect, it } from 'vitest';
import {
  CANVAS_BOARD_DIRECTORY,
  CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
  validateCanvasBoardBinding,
  validateCanvasBoardDeliveryProvenance,
  validateCanvasBoardDeliveryRequest,
  validateCanvasBoardDocumentRef,
  validateCanvasBoardResolutionInput,
  validateCanvasBoardResolutionResult,
  validateCanvasBoardObservedTarget,
  type CanvasBoardBinding,
  type CanvasBoardResolutionInput,
  type CanvasBoardResolutionResult,
  type CanvasBoardTargetIdentity,
} from '../canvas-board-routing';

const target: CanvasBoardTargetIdentity = {
  documentRef: { kind: 'workspace-path', path: 'neko/boards/story.nkc' },
  documentId: 'document:story',
  canvasId: 'canvas:story',
  revision: 'revision:1',
};

function resolutionInput(
  overrides: Partial<CanvasBoardResolutionInput> = {},
): CanvasBoardResolutionInput {
  return {
    version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
    conversationId: 'conversation:1',
    taskId: 'task:1',
    query: {
      version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
      directory: CANVAS_BOARD_DIRECTORY,
      filter: { projectId: 'project:1', workId: 'work:1' },
    },
    suggestedTitle: 'Story Notes',
    ...overrides,
  };
}

describe('Canvas Board routing contracts', () => {
  it('accepts only workspace-relative .nkc paths under neko/boards', () => {
    expect(validateCanvasBoardDocumentRef(target.documentRef)).toEqual([]);
    expect(
      validateCanvasBoardDocumentRef({ kind: 'workspace-path', path: 'story.nkc' })[0]?.code,
    ).toBe('board-outside-directory');
    expect(
      validateCanvasBoardDocumentRef({ kind: 'workspace-path', path: 'neko/boards/story.md' })[0]
        ?.code,
    ).toBe('invalid-board-extension');
    expect(
      validateCanvasBoardDocumentRef({
        kind: 'workspace-path',
        path: '/workspace/neko/boards/story.nkc',
      })[0]?.code,
    ).toBe('unsafe-board-path');
    expect(
      validateCanvasBoardDocumentRef({
        kind: 'workspace-path',
        path: 'neko/boards/../professional/story.nkc',
      })[0]?.code,
    ).toBe('unsafe-board-path');
  });

  it('rejects stale cross-conversation and mismatched task bindings', () => {
    const binding: CanvasBoardBinding = {
      version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
      scope: 'task',
      scopeId: 'task:other',
      conversationId: 'conversation:other',
      target,
      source: 'conversation',
      boundAt: '2026-07-15T00:00:00.000Z',
    };

    expect(validateCanvasBoardBinding(binding, resolutionInput()).map(({ code }) => code)).toEqual(
      expect.arrayContaining(['cross-conversation-binding', 'binding-scope-mismatch']),
    );
  });

  it('accepts an explicit target and a valid conversation binding without active Canvas state', () => {
    const binding: CanvasBoardBinding = {
      version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
      scope: 'conversation',
      scopeId: 'conversation:1',
      conversationId: 'conversation:1',
      target,
      source: 'exact-index',
      boundAt: '2026-07-15T00:00:00.000Z',
    };

    expect(validateCanvasBoardResolutionInput(resolutionInput({ explicitTarget: target }))).toEqual(
      [],
    );
    expect(validateCanvasBoardResolutionInput(resolutionInput({ binding }))).toEqual([]);
  });

  it('requires resolved source and frozen target to agree', () => {
    const result: CanvasBoardResolutionResult = {
      version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
      status: 'resolved',
      source: 'created',
      target: {
        ...target,
        conversationId: 'conversation:1',
        taskId: 'task:1',
        resolutionSource: 'exact-index',
        frozenAt: '2026-07-15T00:00:00.000Z',
      },
      diagnostics: [],
    };

    expect(validateCanvasBoardResolutionResult(result).map(({ code }) => code)).toContain(
      'canvas-identity-mismatch',
    );
  });

  it('rejects deleted, stale, and identity-mismatched observed targets', () => {
    expect(validateCanvasBoardObservedTarget(target, { exists: false })[0]?.code).toBe(
      'deleted-board-target',
    );
    expect(
      validateCanvasBoardObservedTarget(target, {
        exists: true,
        summary: { ...target, revision: 'revision:2', title: 'Story' },
      })[0]?.code,
    ).toBe('stale-board-target');
    expect(
      validateCanvasBoardObservedTarget(target, {
        exists: true,
        summary: { ...target, canvasId: 'canvas:other', title: 'Story' },
      })[0]?.code,
    ).toBe('canvas-identity-mismatch');
  });

  it('rejects unknown resolution sources and delivery kinds at runtime', () => {
    const binding = {
      version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
      scope: 'conversation',
      scopeId: 'conversation:1',
      conversationId: 'conversation:1',
      target,
      source: 'active',
      boundAt: '2026-07-15T00:00:00.000Z',
    } as unknown as CanvasBoardBinding;
    const provenance = {
      version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
      deliveryId: 'delivery:1',
      artifactId: 'artifact:1',
      kind: 'reasoning',
      conversationId: 'conversation:1',
      sourceId: 'assistant:1',
      createdAt: '2026-07-15T00:00:00.000Z',
    } as Parameters<typeof validateCanvasBoardDeliveryProvenance>[0];

    expect(validateCanvasBoardBinding(binding).map(({ code }) => code)).toContain(
      'unsupported-resolution-source',
    );
    expect(validateCanvasBoardDeliveryProvenance(provenance).map(({ code }) => code)).toContain(
      'unsupported-delivery-kind',
    );
  });

  it('rejects raw Canvas, profiles, render/cache URIs, tokens, and process handles', () => {
    const invalid = {
      ...resolutionInput(),
      documentUri: 'file:///workspace/neko/boards/story.nkc',
      basicProfile: 'basic',
      canvasData: { nodes: [] },
      renderUri: 'vscode-webview://render/story',
      cachePath: '.neko/.cache/generated/story.png',
      token: 'secret',
      processHandle: 42,
    } as unknown as CanvasBoardResolutionInput;

    const diagnostics = validateCanvasBoardResolutionInput(invalid);
    expect(diagnostics.filter(({ code }) => code === 'runtime-value-forbidden')).toHaveLength(7);
  });

  it('poisons legacy fallback and false Asset membership fields', () => {
    const invalid = {
      ...resolutionInput(),
      activeCanvas: true,
      recentCanvas: 'story.nkc',
      professionalCanvas: 'neko/cut/story.nkc',
      sendToCanvas: true,
      legacyStoryboardCompiler: true,
      assetMembership: true,
      assetLibraryId: 'asset:1',
      assetRef: { id: 'asset:1' },
    } as unknown as CanvasBoardResolutionInput;
    const diagnostics = validateCanvasBoardResolutionInput(invalid);

    expect(diagnostics.filter(({ code }) => code === 'runtime-value-forbidden')).toHaveLength(8);
    expect(JSON.stringify(diagnostics)).not.toContain('story.nkc');
  });

  it('keeps blocked results target-free', () => {
    const blocked = {
      version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
      status: 'blocked',
      source: 'created',
      target: {
        ...target,
        conversationId: 'conversation:1',
        resolutionSource: 'created',
        frozenAt: '2026-07-15T00:00:00.000Z',
      },
      diagnostics: [],
    } as CanvasBoardResolutionResult;

    expect(validateCanvasBoardResolutionResult(blocked).map(({ code }) => code)).toContain(
      'canvas-identity-mismatch',
    );
  });

  it('requires delivery artifact kind and provenance to match', () => {
    const diagnostics = validateCanvasBoardDeliveryRequest({
      version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
      target: {
        ...target,
        conversationId: 'conversation:1',
        resolutionSource: 'created',
        frozenAt: '2026-07-15T00:00:00.000Z',
      },
      provenance: {
        version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
        deliveryId: 'delivery:1',
        artifactId: 'artifact:1',
        kind: 'image',
        conversationId: 'conversation:1',
        sourceId: 'assistant:1',
        createdAt: '2026-07-15T00:00:00.000Z',
      },
      artifact: { kind: 'markdown', title: 'Notes', markdown: 'Draft' },
    });

    expect(diagnostics.map(({ code }) => code)).toContain('unsupported-delivery-kind');
  });
});
