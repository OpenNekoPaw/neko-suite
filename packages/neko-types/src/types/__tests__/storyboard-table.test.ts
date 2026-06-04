import { describe, expect, it } from 'vitest';
import type {
  StoryboardTableProfileV1,
  StoryboardTableV1,
  StoryboardValidationDiagnosticV1,
} from '../storyboard-table';
import {
  STORYBOARD_GENERATED_MEDIA_ROLES_V1,
  STORYBOARD_SCENE_V1_REQUIRED_FIELDS,
  STORYBOARD_SHOT_IMAGE_STRATEGIES_V1,
  STORYBOARD_SHOT_V1_REQUIRED_FIELDS,
  STORYBOARD_SOURCE_MEDIA_ROLES_V1,
  STORYBOARD_TABLE_V1_REQUIRED_FIELDS,
  interpretStoryboardImageStrategiesV1,
  normalizeStoryboardTableV1,
  projectStoryboardTableV1ToCanvasPayload,
  projectStoryboardTableV1ToCutPayload,
  validateStoryboardTableV1,
} from '../storyboard-table';

describe('storyboard table contract', () => {
  it('defines stable-core required fields as shared constants', () => {
    expect(STORYBOARD_TABLE_V1_REQUIRED_FIELDS).toEqual([
      'schemaVersion',
      'kind',
      'title',
      'scenes',
    ]);
    expect(STORYBOARD_SCENE_V1_REQUIRED_FIELDS).toEqual(['sceneId', 'sceneTitle', 'shots']);
    expect(STORYBOARD_SHOT_V1_REQUIRED_FIELDS).toEqual([
      'shotNumber',
      'duration',
      'visualDescription',
      'characterAction',
      'imageStrategy',
    ]);
  });

  it('accepts a strict semantic storyboard table with layered media refs', () => {
    const profile: StoryboardTableProfileV1 = 'manga-to-video';
    const table: StoryboardTableV1 = {
      schemaVersion: 1,
      kind: 'storyboard-table',
      profile,
      source: {
        type: 'document',
        sourceUri: '${WORKSPACE}/books/page-01.cbz',
      },
      title: 'Opening sequence',
      scenes: [
        {
          sceneId: 'scene-1',
          sceneTitle: 'Rin finds the signal',
          sceneNumber: 1,
          shots: [
            {
              shotId: 'scene-1-shot-1',
              shotNumber: 1,
              duration: 4,
              visualDescription: 'A wide dusk frame of Rin finding a broken radio.',
              characters: [{ name: 'Rin', role: 'primary', emotion: 'curious' }],
              shotScale: 'LS',
              characterAction: 'Rin kneels beside the radio.',
              emotion: ['curious'],
              sceneTags: ['dusk', 'radio'],
              imageStrategy: 'use-as-reference',
              generationPrompt: 'anime dusk field, broken radio, cinematic wide shot',
              decisionReason: 'The source panel is useful for layout, but needs a video keyframe.',
              sourceMediaRefs: [
                {
                  refId: 'source-panel-1',
                  role: 'source',
                  locator: {
                    type: 'tool-result',
                    toolCallId: 'read-document-1',
                    assetIndex: 0,
                  },
                  label: 'Original panel',
                  mimeType: 'image/jpeg',
                },
              ],
              generatedMediaRefs: [
                {
                  refId: 'generated-keyframe-1',
                  role: 'generated',
                  locator: {
                    type: 'asset',
                    assetId: 'asset-keyframe-1',
                    uri: '${WORKSPACE}/.neko/generated/image/keyframe-1.png',
                  },
                  metadata: { provider: 'test-provider', selected: true },
                },
              ],
              extensions: {
                'neko.mangaToVideo': {
                  panelId: 'page-01-panel-02',
                  motionHint: 'slow push-in',
                },
              },
            },
          ],
        },
      ],
      extensions: {
        'neko.storyboardTable': {
          authoringMode: 'agent-plan',
        },
      },
    };

    expect(table.profile).toBe('manga-to-video');
    expect(table.scenes[0]?.shots[0]?.sourceMediaRefs?.[0]?.locator.type).toBe('tool-result');
    expect(JSON.parse(JSON.stringify(table))).toEqual(table);
  });

  it('exports strategy and layered media role constants for validators', () => {
    expect(STORYBOARD_SHOT_IMAGE_STRATEGIES_V1).toContain('transform-original');
    expect(STORYBOARD_SOURCE_MEDIA_ROLES_V1).toEqual(['source', 'reference', 'thumbnail', 'mask']);
    expect(STORYBOARD_GENERATED_MEDIA_ROLES_V1).toEqual([
      'generated',
      'derived',
      'thumbnail',
      'mask',
    ]);
  });

  it('models graded diagnostics without Agent or Webview dependencies', () => {
    const diagnostic: StoryboardValidationDiagnosticV1 = {
      severity: 'profileHint',
      code: 'missing-profile-field',
      path: ['scenes', 0, 'shots', 0, 'cameraAngle'],
      message: 'script-breakdown profile recommends cameraAngle.',
      expected: 'cameraAngle for script-breakdown profile',
      details: { profile: 'script-breakdown' },
    };

    expect(diagnostic.severity).toBe('profileHint');
    expect(JSON.parse(JSON.stringify(diagnostic))).toEqual(diagnostic);
  });

  it('reports stable-core required field errors as projection blockers', () => {
    const result = validateStoryboardTableV1({
      schemaVersion: 1,
      kind: 'storyboard-table',
      title: 'Broken',
      scenes: [
        {
          sceneId: 'scene-1',
          sceneTitle: 'Scene',
          shots: [
            {
              shotNumber: 1,
              duration: 3,
              characterAction: 'Rin looks up.',
              imageStrategy: 'generate-new',
              generationPrompt: 'wide frame',
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'missing-required-field',
          path: ['scenes', 0, 'shots', 0, 'visualDescription'],
        }),
      ]),
    );
  });

  it('keeps profile recommendations non-blocking', () => {
    const result = validateStoryboardTableV1({
      schemaVersion: 1,
      kind: 'storyboard-table',
      profile: 'script-breakdown',
      title: 'Profile hints',
      scenes: [
        {
          sceneId: 'scene-1',
          sceneTitle: 'Scene',
          shots: [
            {
              shotNumber: 1,
              duration: 3,
              visualDescription: 'Rin looks up.',
              characterAction: 'Rin looks up.',
              imageStrategy: 'generate-new',
              generationPrompt: 'wide frame',
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'profileHint',
          code: 'missing-profile-field',
          path: ['scenes', 0, 'shots', 0, 'cameraAngle'],
        }),
      ]),
    );
  });

  it('treats source-based image strategies without source refs as projection blockers', () => {
    const result = validateStoryboardTableV1({
      schemaVersion: 1,
      kind: 'storyboard-table',
      title: 'Missing source',
      scenes: [
        {
          sceneId: 'scene-1',
          sceneTitle: 'Scene',
          shots: [
            {
              shotNumber: 1,
              duration: 3,
              visualDescription: 'Rin looks up.',
              characterAction: 'Rin looks up.',
              imageStrategy: 'reuse-original',
              decisionReason: 'The source panel is available in the previous message.',
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'image-strategy-missing-source',
          path: ['scenes', 0, 'shots', 0, 'sourceMediaRefs'],
        }),
      ]),
    );
  });

  it('keeps decisionReason as display metadata, not validation input', () => {
    const result = validateStoryboardTableV1({
      schemaVersion: 1,
      kind: 'storyboard-table',
      title: 'Reason only',
      scenes: [
        {
          sceneId: 'scene-1',
          sceneTitle: 'Scene',
          shots: [
            {
              shotNumber: 1,
              duration: 3,
              visualDescription: 'Rin looks up.',
              characterAction: 'Rin looks up.',
              imageStrategy: 'generate-new',
              decisionReason: 'Generate from the source panel instead of text.',
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'image-strategy-missing-prompt',
          path: ['scenes', 0, 'shots', 0, 'generationPrompt'],
        }),
      ]),
    );
  });

  it('blocks generation when confirmation policy is pending', () => {
    const result = interpretStoryboardImageStrategiesV1({
      table: storyboardTable({ imageStrategy: 'generate-new', generationPrompt: 'frame' }),
      availableTools: [{ toolName: 'GenerateImage', supportsReferences: true }],
      userOverride: {
        generationPolicy: 'confirm',
        source: 'webview-confirmation',
      },
    });

    expect(result.actions).toEqual([]);
    expect(result.blockedActions[0]).toMatchObject({
      reason: 'confirmation-required',
      imageStrategy: 'generate-new',
    });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'generation-confirmation-required',
      }),
    ]);
  });

  it('rejects unsafe media refs and layered role drift', () => {
    const result = validateStoryboardTableV1({
      schemaVersion: 1,
      kind: 'storyboard-table',
      title: 'Unsafe refs',
      scenes: [
        {
          sceneId: 'scene-1',
          sceneTitle: 'Scene',
          shots: [
            {
              shotNumber: 1,
              duration: 3,
              visualDescription: 'Rin looks up.',
              characterAction: 'Rin looks up.',
              imageStrategy: 'reuse-original',
              sourceMediaRefs: [
                {
                  refId: 'generated-in-source',
                  role: 'generated',
                  locator: {
                    type: 'workspace-path',
                    path: '/tmp/fake.png',
                  },
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'media-ref-role-mismatch',
          path: ['scenes', 0, 'shots', 0, 'sourceMediaRefs', 0, 'role'],
        }),
        expect.objectContaining({
          severity: 'error',
          code: 'unsafe-media-ref',
          path: ['scenes', 0, 'shots', 0, 'sourceMediaRefs', 0, 'locator'],
        }),
      ]),
    );
  });

  it('normalizes legacy mediaRefs into layered refs by role', () => {
    const result = normalizeStoryboardTableV1({
      value: {
        template: 'storyboard-table',
        title: 'Legacy',
        sections: [
          {
            heading: 'Shot 1',
            content: 'Use original panel, then generated keyframe.',
            mediaRefs: [
              { toolCallId: 'read-panel', assetIndex: 0, role: 'original', caption: '原图' },
              { toolCallId: 'generate-shot', assetIndex: 1, role: 'generated' },
            ],
          },
        ],
      },
    });

    expect(result.table?.scenes[0]?.shots[0]).toMatchObject({
      shotNumber: 1,
      imageStrategy: 'reuse-original',
      sourceMediaRefs: [
        {
          refId: 'legacy:read-panel:0',
          role: 'source',
          locator: { type: 'tool-result', toolCallId: 'read-panel', assetIndex: 0 },
          label: '原图',
        },
      ],
      generatedMediaRefs: [
        {
          refId: 'legacy:generate-shot:1',
          role: 'generated',
          locator: { type: 'tool-result', toolCallId: 'generate-shot', assetIndex: 1 },
        },
      ],
    });
  });

  it('splits semantic legacy mediaRefs when layered refs are absent', () => {
    const result = normalizeStoryboardTableV1({
      value: {
        schemaVersion: 1,
        kind: 'storyboard-table',
        title: 'Mixed',
        scenes: [
          {
            sceneId: 'scene-1',
            sceneTitle: 'Scene',
            shots: [
              {
                shotNumber: 1,
                duration: 3,
                visualDescription: 'Rin looks up.',
                characterAction: 'Rin looks up.',
                imageStrategy: 'reuse-original',
                mediaRefs: [
                  {
                    refId: 'source-1',
                    role: 'source',
                    locator: { type: 'tool-result', toolCallId: 'read-1', assetIndex: 0 },
                  },
                  {
                    refId: 'generated-1',
                    role: 'generated',
                    locator: { type: 'asset', assetId: 'asset-1' },
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    expect(result.table?.scenes[0]?.shots[0]?.sourceMediaRefs?.map((ref) => ref.refId)).toEqual([
      'source-1',
    ]);
    expect(result.table?.scenes[0]?.shots[0]?.generatedMediaRefs?.map((ref) => ref.refId)).toEqual([
      'generated-1',
    ]);
  });

  it('rejects non-serializable or un-namespaced extensions', () => {
    const result = validateStoryboardTableV1({
      schemaVersion: 1,
      kind: 'storyboard-table',
      title: 'Extensions',
      extensions: {
        custom: { unsafe: true },
        'neko.bad': () => 'not serializable',
      },
      scenes: [
        {
          sceneId: 'scene-1',
          sceneTitle: 'Scene',
          shots: [
            {
              shotNumber: 1,
              duration: 3,
              visualDescription: 'Rin looks up.',
              characterAction: 'Rin looks up.',
              imageStrategy: 'generate-new',
              generationPrompt: 'wide frame',
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'invalid-extension-namespace',
          path: ['extensions', 'custom'],
        }),
        expect.objectContaining({
          severity: 'error',
          code: 'non-serializable-extension',
          path: ['extensions', 'neko.bad'],
        }),
      ]),
    );
  });

  it('projects valid semantic tables to Canvas and Cut payloads', () => {
    const table: StoryboardTableV1 = {
      schemaVersion: 1,
      kind: 'storyboard-table',
      title: 'Projection',
      scenes: [
        {
          sceneId: 'scene-1',
          sceneTitle: 'Scene',
          shots: [
            {
              shotId: 'shot-1',
              shotNumber: 1,
              duration: 4,
              visualDescription: 'Rin looks up.',
              characters: [{ characterId: 'char-rin', name: 'Rin', emotion: 'curious' }],
              shotScale: 'CU',
              characterAction: 'Rin looks up.',
              emotion: ['curious'],
              sceneTags: ['signal'],
              dialogue: 'What is that?',
              voiceOver: 'The signal returns.',
              soundCue: 'Radio static.',
              generationPrompt: 'close-up anime frame',
              imageStrategy: 'generate-new',
              generatedMediaRefs: [
                {
                  refId: 'asset-1',
                  role: 'generated',
                  locator: {
                    type: 'workspace-path',
                    path: '${WORKSPACE}/.neko/generated/image/shot-1.png',
                  },
                  mimeType: 'image/png',
                },
              ],
            },
          ],
        },
      ],
    };

    expect(projectStoryboardTableV1ToCanvasPayload(table)).toEqual({
      mode: 'semantic',
      sourceScriptUri: 'agent://storyboard-table/v1',
      scenes: [
        {
          sceneId: 'scene-1',
          sceneTitle: 'Scene',
          sceneNumber: 1,
          shotPlans: [
            {
              shotNumber: 1,
              duration: 4,
              visualDescription: 'Rin looks up.',
              characters: [
                {
                  characterId: 'char-rin',
                  characterName: 'Rin',
                  emotion: 'curious',
                },
              ],
              shotScale: 'CU',
              characterAction: 'Rin looks up.',
              emotion: ['curious'],
              sceneTags: ['signal'],
              dialogue: 'What is that?',
              voiceOver: 'The signal returns.',
              soundCue: 'Radio static.',
              generationPrompt: 'close-up anime frame',
              referenceImagePath: '${WORKSPACE}/.neko/generated/image/shot-1.png',
            },
          ],
        },
      ],
    });

    expect(projectStoryboardTableV1ToCutPayload(table)).toEqual({
      projectName: 'Projection',
      shots: [
        {
          id: 'shot-1',
          shotNumber: 1,
          duration: 4,
          dialogue: 'What is that?',
          voiceOver: 'The signal returns.',
          soundCue: 'Radio static.',
          label: '#001 Scene',
          imagePath: '${WORKSPACE}/.neko/generated/image/shot-1.png',
        },
      ],
    });
  });

  it('uses canvas fallback image resolvers when a semantic shot has no media refs', () => {
    const table: StoryboardTableV1 = {
      schemaVersion: 1,
      kind: 'storyboard-table',
      title: 'Projection',
      scenes: [
        {
          sceneId: 'scene-1',
          sceneTitle: 'Scene',
          shots: [
            {
              shotNumber: 1,
              duration: 4,
              visualDescription: 'Rin looks up.',
              characterAction: 'Rin looks up.',
              imageStrategy: 'generate-new',
              generationPrompt: 'close-up anime frame',
            },
          ],
        },
      ],
    };
    const resourceRef = {
      kind: 'document-entry' as const,
      source: { filePath: '${BOOKS}/comic.epub', format: 'epub' as const },
      entryPath: 'OPS/page-1.jpg',
      cachePath: '/tmp/neko-cache/page-1.jpg',
      versionPolicy: 'read-only-source' as const,
    };

    expect(
      projectStoryboardTableV1ToCanvasPayload(table, {
        resolveFallbackImagePath: ({ shot }) =>
          shot.shotNumber === 1 ? '/tmp/neko-cache/page-1.jpg' : undefined,
        resolveFallbackImageResourceRef: ({ shot }) =>
          shot.shotNumber === 1 ? resourceRef : undefined,
      }).scenes[0]?.shotPlans[0],
    ).toMatchObject({
      referenceImagePath: '/tmp/neko-cache/page-1.jpg',
      referenceImageResourceRef: resourceRef,
    });
  });

  it('interprets image strategies without scheduling generation for reuse-original', () => {
    const table = storyboardTable({
      imageStrategy: 'reuse-original',
      sourceMediaRefs: [sourceMediaRef('source-1')],
    });

    const result = interpretStoryboardImageStrategiesV1({
      table,
      availableTools: [{ toolName: 'GenerateImage', supportsReferences: true }],
    });

    expect(result.blockedActions).toEqual([]);
    expect(result.actions).toEqual([
      expect.objectContaining({
        kind: 'reuse-original',
        imageStrategy: 'reuse-original',
        sourceMediaRefs: [sourceMediaRef('source-1')],
      }),
    ]);
  });

  it('requires prompt, source refs, allowed generation, and provider capability', () => {
    const missingPrompt = interpretStoryboardImageStrategiesV1({
      table: storyboardTable({ imageStrategy: 'generate-new' }),
      availableTools: [{ toolName: 'GenerateImage', supportsReferences: true }],
    });
    expect(missingPrompt.blockedActions[0]).toMatchObject({
      reason: 'missing-prompt',
      imageStrategy: 'generate-new',
    });

    const missingSource = interpretStoryboardImageStrategiesV1({
      table: storyboardTable({ imageStrategy: 'use-as-reference', generationPrompt: 'frame' }),
      availableTools: [{ toolName: 'GenerateImage', supportsReferences: true }],
    });
    expect(missingSource.blockedActions[0]).toMatchObject({
      reason: 'missing-source',
      imageStrategy: 'use-as-reference',
    });

    const missingCapability = interpretStoryboardImageStrategiesV1({
      table: storyboardTable({ imageStrategy: 'generate-new', generationPrompt: 'frame' }),
      availableTools: [],
    });
    expect(missingCapability.blockedActions[0]).toMatchObject({
      reason: 'missing-capability',
      imageStrategy: 'generate-new',
    });

    const denied = interpretStoryboardImageStrategiesV1({
      table: storyboardTable({ imageStrategy: 'generate-new', generationPrompt: 'frame' }),
      availableTools: [{ toolName: 'GenerateImage', supportsReferences: true }],
      userOverride: {
        generationPolicy: 'deny',
        source: 'chat-instruction',
      },
    });
    expect(denied.blockedActions[0]).toMatchObject({
      reason: 'generation-denied',
      imageStrategy: 'generate-new',
    });
  });

  it('routes generate and transform strategies through available tool capabilities', () => {
    const table: StoryboardTableV1 = {
      schemaVersion: 1,
      kind: 'storyboard-table',
      title: 'Strategies',
      scenes: [
        {
          sceneId: 'scene-1',
          sceneTitle: 'Scene',
          shots: [
            {
              shotId: 'shot-generate',
              shotNumber: 1,
              duration: 3,
              visualDescription: 'Generate a frame.',
              characterAction: 'Rin looks up.',
              imageStrategy: 'generate-new',
              generationPrompt: 'new frame',
            },
            {
              shotId: 'shot-transform',
              shotNumber: 2,
              duration: 3,
              visualDescription: 'Transform source.',
              characterAction: 'Rin looks up.',
              imageStrategy: 'transform-original',
              sourceMediaRefs: [sourceMediaRef('source-2')],
            },
          ],
        },
      ],
    };

    const result = interpretStoryboardImageStrategiesV1({
      table,
      availableTools: [
        { toolName: 'GenerateImage', supportsReferences: true },
        { toolName: 'TransformImage', supportsReferences: true },
      ],
    });

    expect(result.blockedActions).toEqual([]);
    expect(result.actions).toEqual([
      expect.objectContaining({
        kind: 'generate-image',
        toolName: 'GenerateImage',
        shotId: 'shot-generate',
        generationPrompt: 'new frame',
      }),
      expect.objectContaining({
        kind: 'transform-image',
        toolName: 'TransformImage',
        shotId: 'shot-transform',
        sourceMediaRefs: [sourceMediaRef('source-2')],
      }),
    ]);
  });
});

function storyboardTable(
  shot: Partial<StoryboardTableV1['scenes'][number]['shots'][number]>,
): StoryboardTableV1 {
  return {
    schemaVersion: 1,
    kind: 'storyboard-table',
    title: 'Strategies',
    scenes: [
      {
        sceneId: 'scene-1',
        sceneTitle: 'Scene',
        shots: [
          {
            shotId: 'shot-1',
            shotNumber: 1,
            duration: 3,
            visualDescription: 'Rin looks up.',
            characterAction: 'Rin looks up.',
            imageStrategy: 'generate-new',
            ...shot,
          },
        ],
      },
    ],
  };
}

function sourceMediaRef(refId: string) {
  return {
    refId,
    role: 'source' as const,
    locator: {
      type: 'tool-result' as const,
      toolCallId: `tool-${refId}`,
      assetIndex: 0,
    },
  };
}
