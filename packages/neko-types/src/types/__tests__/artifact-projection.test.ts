import { describe, expect, it } from 'vitest';
import type { CompositeArtifact, StoryboardTable } from '../index';
import {
  projectCompositeArtifactToCanvasStoryboardPayload,
  projectCompositeArtifactToCutStoryboardPayload,
  projectCompositeArtifactToStoryboardTable,
} from '../artifact-projection';

describe('artifact storyboard projection', () => {
  it('projects a StoryboardTable domain block into Canvas and Cut payloads', () => {
    const artifact = makeArtifact(makeStoryboardTable());

    expect(projectCompositeArtifactToStoryboardTable({ artifact })).toMatchObject({
      table: { kind: 'storyboard-table', title: 'Artifact Storyboard' },
      diagnostics: [],
    });
    expect(projectCompositeArtifactToCanvasStoryboardPayload({ artifact }).payload).toMatchObject({
      mode: 'semantic',
      scenes: [
        {
          sceneId: 'scene-1',
          shotPlans: [
            {
              shotNumber: 1,
              referenceImagePath: '${WORKSPACE}/comic/panel-1.png',
            },
          ],
        },
      ],
    });
    expect(projectCompositeArtifactToCutStoryboardPayload({ artifact }).payload).toEqual({
      projectName: 'Artifact Storyboard',
      shots: [
        {
          id: 'shot-1',
          shotNumber: 1,
          duration: 1.5,
          dialogue: 'Go.',
          label: '#001 Opening',
          imagePath: '${WORKSPACE}/comic/panel-1.png',
        },
      ],
    });
  });

  it('diagnoses missing storyboard domain blocks without producing execution payloads', () => {
    const result = projectCompositeArtifactToCanvasStoryboardPayload({
      artifact: {
        schemaVersion: 1,
        kind: 'composite-artifact',
        artifactId: 'artifact-empty',
        title: 'No storyboard',
        blocks: [{ blockId: 'summary', kind: 'text', text: 'Review only.' }],
      },
    });

    expect(result.payload).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'missing-required-field',
      }),
    ]);
  });

  it('keeps Cut projection review-only when storyboard image refs are not projectable', () => {
    const artifact = makeArtifact(
      makeStoryboardTable({
        scenes: [
          {
            sceneId: 'scene-1',
            sceneTitle: 'Opening',
            shots: [
              {
                shotId: 'shot-1',
                shotNumber: 1,
                duration: 1.5,
                visualDescription: 'A panel.',
                characterAction: 'A character runs.',
                imageStrategy: 'generate-new',
                generationPrompt: 'running character',
              },
            ],
          },
        ],
      }),
    );

    const result = projectCompositeArtifactToCutStoryboardPayload({ artifact });

    expect(result.payload).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'warning',
        message: expect.stringContaining('projectable image refs'),
      }),
    ]);
  });

  it('maps invalid storyboard diagnostics back to the artifact domain block path', () => {
    const artifact = makeArtifact({
      ...makeStoryboardTable(),
      scenes: [
        {
          sceneId: 'scene-1',
          sceneTitle: 'Opening',
          shots: [
            {
              shotId: 'shot-1',
              shotNumber: 1,
              duration: 1.5,
              visualDescription: 'A panel.',
              characterAction: 'A character runs.',
              imageStrategy: 'reuse-original',
            },
          ],
        },
      ],
    });

    const result = projectCompositeArtifactToCanvasStoryboardPayload({ artifact });

    expect(result.payload).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'invalid-required-field',
        path: expect.arrayContaining(['blocks', 'storyboard-domain', 'payload']),
      }),
    ]);
  });
});

function makeArtifact(table: StoryboardTable): CompositeArtifact {
  return {
    schemaVersion: 1,
    kind: 'composite-artifact',
    artifactId: 'artifact-storyboard',
    title: 'Artifact Storyboard',
    blocks: [
      {
        blockId: 'storyboard-domain',
        kind: 'domain',
        domainKind: 'StoryboardTable',
        schemaVersion: 1,
        payload: table,
      },
    ],
  };
}

function makeStoryboardTable(overrides: Partial<StoryboardTable> = {}): StoryboardTable {
  return {
    schemaVersion: 1,
    kind: 'storyboard-table',
    title: 'Artifact Storyboard',
    scenes: [
      {
        sceneId: 'scene-1',
        sceneTitle: 'Opening',
        shots: [
          {
            shotId: 'shot-1',
            shotNumber: 1,
            duration: 1.5,
            visualDescription: 'A panel.',
            characterAction: 'A character runs.',
            dialogue: 'Go.',
            imageStrategy: 'reuse-original',
            sourceMediaRefs: [
              {
                refId: 'panel-1',
                role: 'source',
                locator: {
                  type: 'workspace-path',
                  path: '${WORKSPACE}/comic/panel-1.png',
                },
                mimeType: 'image/png',
              },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}
