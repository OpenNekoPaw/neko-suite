import { beforeEach, describe, expect, it } from 'vitest';
import {
  CANVAS_GENERATED_DRAFT_CANDIDATE_ID_PREFIX,
  CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION,
  CANVAS_GENERATED_DRAFT_GROUP_ID_PREFIX,
  createGeneratedAssetRevisionRef,
  type CanvasGeneratedDraftGroupProjection,
} from '@neko/shared';
import { useGeneratedDraftStore } from './generatedDraftStore';

beforeEach(() => useGeneratedDraftStore.getState().clear());

describe('generatedDraftStore', () => {
  it('keeps runtime projections outside durable Canvas data', () => {
    const projection = createProjection();

    useGeneratedDraftStore.getState().upsert(projection);

    expect(useGeneratedDraftStore.getState().projections[projection.projectionId]).toEqual(
      projection,
    );
    expect(JSON.stringify(useGeneratedDraftStore.getState().projections)).not.toContain(
      'sourcePath',
    );
  });

  it('fails visibly for invalid Host messages', () => {
    expect(() =>
      useGeneratedDraftStore.getState().upsert({
        ...createProjection(),
        version: 2,
      } as never),
    ).toThrow(/invalid-contract-version/);
  });

  it('keeps creator runtime layout separate from Host projections and moves a Group subtree', () => {
    const projection = createProjection();
    useGeneratedDraftStore.getState().upsert(projection);

    useGeneratedDraftStore
      .getState()
      .moveCandidate(projection.projectionId, projection.candidates[0]!.candidateId, {
        x: 150,
        y: 180,
      });
    useGeneratedDraftStore.getState().moveGroup(projection.projectionId, { x: 100, y: 120 });
    useGeneratedDraftStore.getState().setCollapsed(projection.projectionId, true);

    expect(useGeneratedDraftStore.getState().layouts[projection.projectionId]).toEqual({
      groupPosition: { x: 100, y: 120 },
      candidatePositions: {
        [projection.candidates[0]!.candidateId]: { x: 170, y: 220 },
      },
      collapsed: true,
    });
    expect(useGeneratedDraftStore.getState().projections[projection.projectionId]).toEqual(
      projection,
    );
  });
});

function createProjection(): CanvasGeneratedDraftGroupProjection {
  const lifecycle = createGeneratedAssetRevisionRef({
    assetId: 'generated-output:1',
    contentDigest: 'sha256:draft',
    mediaKind: 'image',
    mimeType: 'image/png',
    generation: { taskId: 'task:1', runId: 'run:1' },
  });
  return {
    version: CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION,
    projectionId: `${CANVAS_GENERATED_DRAFT_GROUP_ID_PREFIX}task:1`,
    taskId: 'task:1',
    runId: 'run:1',
    title: 'Generated candidates',
    target: {
      documentRef: { kind: 'workspace-path', path: 'neko/boards/story.nkc' },
      documentId: 'document:story',
      canvasId: 'canvas:story',
      revision: 'revision:1',
      conversationId: 'conversation:1',
      taskId: 'task:1',
      runId: 'run:1',
      resolutionSource: 'created',
      frozenAt: '2026-07-15T00:00:00.000Z',
    },
    position: { x: 80, y: 80 },
    size: { width: 376, height: 340 },
    collapsed: false,
    pinned: true,
    candidates: [
      {
        candidateId: `${CANVAS_GENERATED_DRAFT_CANDIDATE_ID_PREFIX}generated-output:1`,
        title: 'Candidate',
        mediaKind: 'image',
        mimeType: 'image/png',
        revision: lifecycle.revision,
        contentDigest: lifecycle.contentDigest,
        resourceRef: lifecycle.resourceRef,
        state: 'unsaved',
        position: { x: 108, y: 152 },
        size: { width: 312, height: 200 },
        renderUri: 'vscode-webview://generated/candidate.png',
      },
    ],
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
  };
}
