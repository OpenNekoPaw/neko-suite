// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CANVAS_GENERATED_DRAFT_CANDIDATE_ID_PREFIX,
  CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION,
  CANVAS_GENERATED_DRAFT_GROUP_ID_PREFIX,
  createGeneratedAssetRevisionRef,
  type CanvasGeneratedDraftGroupProjection,
} from '@neko/shared';
import { installMockWebviewWindow } from '@neko/shared/vscode/test-utils';
import { useGeneratedDraftStore } from '../../stores/generatedDraftStore';
import { GeneratedDraftLayer } from './GeneratedDraftLayer';

let host: HTMLDivElement;
let root: Root;
let webview: ReturnType<typeof installMockWebviewWindow>;

beforeEach(() => {
  useGeneratedDraftStore.getState().clear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  webview = installMockWebviewWindow();
  vi.stubGlobal('crypto', { randomUUID: () => 'request:ui-test' });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  webview.dispose();
  vi.unstubAllGlobals();
});

describe('GeneratedDraftLayer', () => {
  it('renders runtime candidates with explicit unsaved state and no Host path details', () => {
    const projection = createProjection();
    useGeneratedDraftStore.getState().upsert(projection);

    act(() => {
      root.render(<GeneratedDraftLayer viewport={{ pan: { x: 0, y: 0 }, zoom: 1 }} />);
    });
    const markup = host.innerHTML;

    expect(markup).toContain(`data-runtime-generated-group="${projection.projectionId}"`);
    expect(markup).toContain('data-runtime-generated-candidate-state="unsaved"');
    expect(markup).toContain('Unsaved');
    expect(markup).toContain('Save to Assets');
    expect(markup).not.toContain('sourcePath');
    expect(markup).not.toContain('.neko/.cache');
  });

  it('sends one validated candidate selection without runtime render values', () => {
    const projection = createProjection();
    useGeneratedDraftStore.getState().upsert(projection);
    act(() => {
      root.render(<GeneratedDraftLayer viewport={{ pan: { x: 0, y: 0 }, zoom: 1 }} />);
    });
    const saveButton = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === 'Save to Assets',
    );
    act(() => saveButton?.click());

    expect(webview.api.postedMessages).toHaveLength(1);
    expect(webview.api.postedMessages[0]).toMatchObject({
      type: 'canvas.generatedDraft.saveToAssets',
      request: {
        requestId: 'request:ui-test',
        projectionId: projection.projectionId,
        target: { documentRef: { path: 'neko/boards/ui-test.nkc' } },
        selections: [
          {
            candidateId: projection.candidates[0]?.candidateId,
            revision: projection.candidates[0]?.revision,
            contentDigest: projection.candidates[0]?.contentDigest,
          },
        ],
      },
    });
    expect(JSON.stringify(webview.api.postedMessages[0])).not.toContain('renderUri');
  });

  it('renders every lifecycle state with non-color text and item diagnostics', () => {
    const base = createProjection();
    const candidate = base.candidates[0]!;
    const promotedAsset = {
      entityId: 'asset:entity:ui-test',
      variantId: 'asset:variant:ui-test',
      fileId: 'asset:file:ui-test',
      path: 'neko/assets/files/image/ui-test.png',
      mediaType: 'image' as const,
    };
    const projection: CanvasGeneratedDraftGroupProjection = {
      ...base,
      candidates: [
        candidate,
        {
          ...candidate,
          candidateId: `${CANVAS_GENERATED_DRAFT_CANDIDATE_ID_PREFIX}promoting`,
          state: 'promoting',
          title: 'Promoting',
        },
        {
          ...candidate,
          candidateId: `${CANVAS_GENERATED_DRAFT_CANDIDATE_ID_PREFIX}saved`,
          state: 'saved-to-assets',
          title: 'Saved',
          promotedAsset,
        },
        {
          ...candidate,
          candidateId: `${CANVAS_GENERATED_DRAFT_CANDIDATE_ID_PREFIX}board`,
          state: 'added-to-board',
          title: 'Board',
          promotedAsset,
        },
        {
          ...candidate,
          candidateId: `${CANVAS_GENERATED_DRAFT_CANDIDATE_ID_PREFIX}missing`,
          state: 'unavailable',
          title: 'Missing',
          renderUri: undefined,
          diagnostic: 'Source was reclaimed.',
        },
        {
          ...candidate,
          candidateId: `${CANVAS_GENERATED_DRAFT_CANDIDATE_ID_PREFIX}failed`,
          state: 'failed',
          title: 'Failed',
          diagnostic: 'Asset storage failed.',
        },
      ],
    };
    useGeneratedDraftStore.getState().upsert(projection);
    act(() => {
      root.render(<GeneratedDraftLayer viewport={{ pan: { x: 0, y: 0 }, zoom: 1 }} />);
    });

    for (const state of [
      'unsaved',
      'promoting',
      'saved-to-assets',
      'added-to-board',
      'unavailable',
      'failed',
    ]) {
      expect(
        host.querySelector(`[data-runtime-generated-candidate-state="${state}"]`),
      ).not.toBeNull();
    }
    expect(host.textContent).toContain('Source was reclaimed.');
    expect(host.textContent).toContain('Asset storage failed.');
    expect(host.textContent).toContain('Retry');
    expect(
      host.querySelector<HTMLButtonElement>('button[aria-label="Discard review"]')?.disabled,
    ).toBe(true);
  });
});

function createProjection(): CanvasGeneratedDraftGroupProjection {
  const lifecycle = createGeneratedAssetRevisionRef({
    assetId: 'generated-output:ui-test',
    contentDigest: 'sha256:ui-test',
    mediaKind: 'image',
    mimeType: 'image/png',
    generation: { taskId: 'task:ui-test', runId: 'run:ui-test' },
  });
  return {
    version: CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION,
    projectionId: `${CANVAS_GENERATED_DRAFT_GROUP_ID_PREFIX}task:ui-test`,
    taskId: 'task:ui-test',
    runId: 'run:ui-test',
    title: 'Generated references',
    target: {
      documentRef: { kind: 'workspace-path', path: 'neko/boards/ui-test.nkc' },
      documentId: 'document:ui-test',
      canvasId: 'canvas:ui-test',
      revision: 'revision:1',
      conversationId: 'conversation:ui-test',
      taskId: 'task:ui-test',
      runId: 'run:ui-test',
      resolutionSource: 'created',
      frozenAt: '2026-07-15T00:00:00.000Z',
    },
    position: { x: 80, y: 80 },
    size: { width: 420, height: 360 },
    collapsed: false,
    pinned: true,
    candidates: [
      {
        candidateId: `${CANVAS_GENERATED_DRAFT_CANDIDATE_ID_PREFIX}generated-output:ui-test`,
        title: 'Reference image',
        mediaKind: 'image',
        mimeType: 'image/png',
        revision: lifecycle.revision,
        contentDigest: lifecycle.contentDigest,
        resourceRef: lifecycle.resourceRef,
        state: 'unsaved',
        position: { x: 108, y: 150 },
        size: { width: 280, height: 190 },
        renderUri: 'vscode-webview://generated/reference.png',
      },
    ],
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
  };
}
