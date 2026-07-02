import { describe, expect, it, vi } from 'vitest';
import {
  createResourceFingerprint,
  createResourceRef,
  type CanvasCreateCompositeRequest,
  type CanvasMarkdownCapabilityInput,
  type CanvasMarkdownResourceRef,
  type ResourceRef,
} from '@neko/shared';
import {
  invokeCanvasMarkdownCapability,
  type CanvasMarkdownCapabilityOperations,
} from '../markdownCapabilities';

describe('Canvas Markdown capabilities', () => {
  it('creates Markdown notes through Canvas-owned text content operations', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createMarkdownNote',
        markdown: '## Plan\n\nKeep the shot order reviewable.',
        title: 'Plan',
        target: { insertionPoint: { x: 12, y: 24 }, mode: 'insert' },
        provenance: { source: 'agent', messageId: 'message-1' },
      },
      operations,
    );

    expect(result).toMatchObject({
      capabilityId: 'canvas.createMarkdownNote',
      status: 'created',
      nodeIds: ['note-1'],
      diagnostics: [],
    });
    expect(operations.applyAgentContent).toHaveBeenCalledWith({
      kind: 'text',
      text: '## Plan\n\nKeep the shot order reviewable.',
      title: 'Plan',
      format: 'markdown',
      target: { insertionPoint: { x: 12, y: 24 }, mode: 'insert' },
      provenance: { source: 'agent', messageId: 'message-1' },
    });
  });

  it('creates a Canvas table node from a GFM table and preserves extra columns', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createTableFromMarkdown',
        markdown: [
          '| Scene | Shot | Image | Prompt | Next Action | Custom Field |',
          '| --- | --- | --- | --- | --- | --- |',
          '| Opening | 1 | P1 | neon door | review | keep this |',
        ].join('\n'),
        title: 'Storyboard Plan',
        tableTitle: 'Draft Table',
        sourceFormat: 'gfm-table',
        resources: [createResource('P1')],
      },
      operations,
    );

    expect(result.status).toBe('created');
    expect(result.tableNodeId).toBe('table-1');
    expect(result.preview).toMatchObject({
      tableCount: 1,
      rowCount: 1,
      resourceTokenCount: 1,
      unresolvedResourceTokenCount: 0,
      resolvedKind: 'generic-table',
      profileId: 'generic',
    });
    expect(operations.createNode).toHaveBeenCalledWith(
      'table',
      { x: 0, y: 0 },
      expect.objectContaining({
        label: 'Draft Table',
        rowCount: 1,
        columnCount: 6,
        markdown: expect.objectContaining({
          sourceFormat: 'gfm-table',
          resolvedKind: 'generic-table',
          tableProfile: 'generic',
          reviewKind: 'generic-table',
          displayFallback: false,
          consumedColumns: [
            expect.objectContaining({
              fieldId: 'resource',
              columnId: 'image',
              valueType: 'resource-token',
            }),
          ],
          unknownColumnPolicy: 'preserve',
          unknownColumns: expect.arrayContaining([
            expect.objectContaining({ id: 'scene', label: 'Scene' }),
            expect.objectContaining({ id: 'custom-field', label: 'Custom Field' }),
          ]),
          rows: [
            expect.objectContaining({
              cells: expect.objectContaining({
                'custom-field': 'keep this',
              }),
            }),
          ],
          resources: [expect.objectContaining({ token: 'P1', status: 'bound' })],
        }),
      }),
      'table.basic',
    );
  });

  it('creates review-first storyboard drafts with resource diagnostics instead of guessing order', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createStoryboardDraftFromMarkdown',
        markdown: [
          '| Scene | Shot | Image | Prompt | Next Action |',
          '| --- | --- | --- | --- | --- |',
          '| Opening | 1 | P1 | neon door | review |',
          '| Opening | 2 | P2 | close-up | create |',
        ].join('\n'),
        title: 'Opening Draft',
        resources: [createResource('P1')],
      },
      operations,
    );

    expect(result.status).toBe('needs-review');
    expect(result.resolvedKind).toBe('creative-table');
    expect(result.profileId).toBe('storyboard');
    expect(result.draftNodeId).toBe('table-1');
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'canvas-markdown-missing-resource-token',
    );
    expect(result.actions).toEqual([
      {
        actionId: 'create-storyboard-nodes',
        label: 'Create storyboard nodes',
        capabilityId: 'canvas.createStoryboardFromMarkdown',
      },
    ]);
    expect(operations.createNode).toHaveBeenCalledWith(
      'table',
      { x: 0, y: 0 },
      expect.objectContaining({
        label: 'Opening Draft',
        markdown: expect.objectContaining({
          resolvedKind: 'creative-table',
          tableProfile: 'storyboard',
          reviewKind: 'storyboard',
          creative: true,
          consumedColumns: expect.arrayContaining([
            expect.objectContaining({ fieldId: 'scene', columnId: 'scene', role: 'approval' }),
            expect.objectContaining({ fieldId: 'shot', columnId: 'shot', role: 'approval' }),
            expect.objectContaining({
              fieldId: 'image',
              columnId: 'image',
              role: 'approval',
              valueType: 'resource-token',
            }),
            expect.objectContaining({
              fieldId: 'prompt',
              columnId: 'prompt',
              role: 'plan',
              valueType: 'prompt',
            }),
            expect.objectContaining({
              fieldId: 'action',
              columnId: 'next-action',
              role: 'execution',
              valueType: 'action',
            }),
          ]),
          resources: expect.arrayContaining([
            expect.objectContaining({ token: 'P1', status: 'bound' }),
            expect.objectContaining({ token: 'P2', status: 'missing' }),
          ]),
        }),
      }),
      'table.basic',
    );
  });

  it('requires explicit create-nodes mode and lifecycle approval before production storyboard node creation', async () => {
    const operations = createOperations();
    const blocked = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createStoryboardFromMarkdown',
        markdown: STORYBOARD_MARKDOWN,
      },
      operations,
    );

    expect(blocked.status).toBe('blocked');
    expect(blocked.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'canvas-markdown-storyboard-create-not-confirmed',
    ]);
    expect(operations.createComposite).not.toHaveBeenCalled();

    const unapproved = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createStoryboardFromMarkdown',
        markdown: STORYBOARD_MARKDOWN,
        title: 'Opening',
        mode: 'create-nodes',
      },
      operations,
    );

    expect(unapproved.status).toBe('blocked');
    expect(unapproved.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'canvas-markdown-storyboard-create-approval-required',
    ]);
    expect(operations.createComposite).not.toHaveBeenCalled();

    const created = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createStoryboardFromMarkdown',
        markdown: STORYBOARD_MARKDOWN,
        title: 'Opening',
        mode: 'create-nodes',
        approval: {
          source: 'creation-apply',
          creationId: 'creation-1',
          iterationId: 'iteration-1',
          profileId: 'idc.default',
          stageId: 'apply',
        },
      },
      operations,
    );

    expect(created.status).toBe('created');
    expect(created.nodeIds).toEqual(['scene-1', 'shot-1', 'shot-2']);
    const request = vi.mocked(operations.createComposite).mock.calls[0]?.[0];
    expect(request).toMatchObject({
      containerType: 'scene',
      containerPreset: 'scene.basic',
      children: [
        {
          type: 'shot',
          preset: 'shot.basic',
          data: expect.objectContaining({
            shotNumber: 1,
            visualDescription: 'Wide view',
            generationPrompt: 'cinematic wide prompt',
          }),
        },
        {
          type: 'shot',
          preset: 'shot.basic',
          data: expect.objectContaining({
            shotNumber: 2,
            visualDescription: 'Close-up',
            generationPrompt: 'close prompt',
          }),
        },
      ],
    } satisfies Partial<CanvasCreateCompositeRequest>);
  });

  it('attaches stable resource refs to an existing Canvas target', async () => {
    const operations = createOperations();
    const resource = createResource('P1');
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.attachResource',
        target: { nodeId: 'shot-1', mode: 'apply' },
        resource,
        role: 'reference',
      },
      operations,
    );

    expect(result).toMatchObject({
      capabilityId: 'canvas.attachResource',
      status: 'changed',
      nodeIds: ['shot-1'],
      diagnostics: [],
    });
    expect(operations.updateNode).toHaveBeenCalledWith(
      'shot-1',
      expect.objectContaining({
        markdownResourceToken: 'P1',
        markdownResourceRole: 'reference',
        referenceResourceRef: resource.resourceRef,
      }),
    );
  });

  it('validates storyboard tables without mutating Canvas state', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.validateMarkdownStoryboard',
        markdown: STORYBOARD_MARKDOWN,
      },
      operations,
    );

    expect(result.status).toBe('validated');
    expect(result.preview).toMatchObject({ tableCount: 1, rowCount: 2 });
    expect(operations.createNode).not.toHaveBeenCalled();
    expect(operations.createComposite).not.toHaveBeenCalled();
    expect(operations.updateNode).not.toHaveBeenCalled();
  });

  it('ingests Markdown notes through the unified Canvas facade', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.ingestMarkdown',
        markdown: '## Review\n\nKeep these notes on the board.',
        title: 'Review Note',
      },
      operations,
    );

    expect(result).toMatchObject({
      capabilityId: 'canvas.ingestMarkdown',
      status: 'created',
      resolvedKind: 'markdown-note',
      nodeIds: ['note-1'],
      preview: expect.objectContaining({
        resolvedKind: 'markdown-note',
      }),
    });
    expect(operations.applyAgentContent).toHaveBeenCalled();
    expect(operations.createNode).not.toHaveBeenCalled();
  });

  it('ingests generic Markdown tables with media-aware display metadata', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.ingestMarkdown',
        markdown: [
          '| Image | Notes | Extra |',
          '| --- | --- | --- |',
          '| `read-image-cover.jpg` | cover option | keep |',
        ].join('\n'),
        resources: [
          {
            token: 'read-image-cover.jpg',
            label: 'Cover',
            sourcePath: 'assets/read-image-cover.jpg',
          },
        ],
      },
      operations,
    );

    expect(result).toMatchObject({
      capabilityId: 'canvas.ingestMarkdown',
      status: 'created',
      resolvedKind: 'generic-table',
      profileId: 'generic',
      displayFallback: false,
      preview: expect.objectContaining({
        resourceTokenCount: 1,
        unresolvedResourceTokenCount: 0,
        table: expect.objectContaining({
          profileId: 'generic',
          unknownColumns: expect.arrayContaining([expect.objectContaining({ id: 'notes' })]),
        }),
      }),
    });
    expect(operations.createNode).toHaveBeenCalledWith(
      'table',
      { x: 0, y: 0 },
      expect.objectContaining({
        markdown: expect.objectContaining({
          tableProfile: 'generic',
          resources: [expect.objectContaining({ token: 'read-image-cover.jpg', status: 'bound' })],
          unknownColumns: expect.arrayContaining([expect.objectContaining({ id: 'notes' })]),
        }),
      }),
      'table.basic',
    );
  });

  it('ingests storyboard creative tables through the built-in storyboard profile', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.ingestMarkdown',
        intentHint: 'creative-table',
        profileHint: 'storyboard-draft',
        markdown: [
          '| Scene | Shot | Image | Visual | Prompt | Next Action |',
          '| --- | --- | --- | --- | --- | --- |',
          '| Opening | 1 | P1 | wide shot | cinematic light | create |',
        ].join('\n'),
        resources: [createResource('P1')],
      },
      operations,
    );

    expect(result).toMatchObject({
      capabilityId: 'canvas.ingestMarkdown',
      status: 'created',
      resolvedKind: 'creative-table',
      profileId: 'storyboard',
      draftNodeId: 'table-1',
      actions: [
        {
          actionId: 'create-storyboard-nodes',
          label: 'Create storyboard nodes',
          capabilityId: 'canvas.createStoryboardFromMarkdown',
        },
      ],
      preview: expect.objectContaining({
        resolvedKind: 'creative-table',
        profileId: 'storyboard',
        table: expect.objectContaining({
          profileId: 'storyboard',
          consumedColumns: expect.arrayContaining([
            expect.objectContaining({ fieldId: 'visual', role: 'approval' }),
            expect.objectContaining({ fieldId: 'prompt', role: 'plan' }),
            expect.objectContaining({ fieldId: 'action', role: 'execution' }),
          ]),
        }),
      }),
    });
  });

  it('consumes normalized creative table headers and preserves extension columns', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.ingestMarkdown',
        intentHint: 'creative-table',
        profileHint: 'storyboard',
        markdown: [
          '| scene | shot | source | sourcePanel | decision | duration | visual | motion | audio | characters | dialogue | prompt | reviewStatus | nextAction |',
          '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
          '| Opening | 1 | P1#panel_1 | top | keep | 3s | wide shot | slow push | wind | Moe |  | cinematic light | needs-review | use-as-reference |',
        ].join('\n'),
        resources: [createResource('P1')],
      },
      operations,
    );

    expect(result.status).toBe('created');
    expect(result.preview).toMatchObject({
      resolvedKind: 'creative-table',
      profileId: 'storyboard',
      resourceTokenCount: 1,
      unresolvedResourceTokenCount: 0,
    });
    expect(operations.createNode).toHaveBeenCalledWith(
      'table',
      { x: 0, y: 0 },
      expect.objectContaining({
        markdown: expect.objectContaining({
          tableProfile: 'storyboard',
          consumedColumns: expect.arrayContaining([
            expect.objectContaining({ fieldId: 'image', columnId: 'source' }),
            expect.objectContaining({ fieldId: 'visual', columnId: 'visual' }),
            expect.objectContaining({ fieldId: 'prompt', columnId: 'prompt' }),
            expect.objectContaining({ fieldId: 'action', columnId: 'nextaction' }),
          ]),
          unknownColumns: expect.arrayContaining([
            expect.objectContaining({ id: 'sourcepanel', label: 'sourcePanel' }),
            expect.objectContaining({ id: 'decision', label: 'decision' }),
            expect.objectContaining({ id: 'reviewstatus', label: 'reviewStatus' }),
          ]),
          rows: [
            expect.objectContaining({
              cells: expect.objectContaining({
                source: 'P1#panel_1',
                sourcepanel: 'top',
                decision: 'keep',
                reviewstatus: 'needs-review',
                nextaction: 'use-as-reference',
              }),
            }),
          ],
          resources: [expect.objectContaining({ token: 'P1', status: 'bound' })],
        }),
      }),
      'table.basic',
    );
  });

  it('falls back unsupported creative profiles to display-only generic tables', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.ingestMarkdown',
        intentHint: 'creative-table',
        profileHint: 'interactive-video-branch-map',
        markdown: [
          '| Branch | Image | Decision Reason |',
          '| --- | --- | --- |',
          '| A | P1 | user choice |',
        ].join('\n'),
        resources: [createResource('P1')],
      },
      operations,
    );

    expect(result).toMatchObject({
      capabilityId: 'canvas.ingestMarkdown',
      status: 'needs-review',
      resolvedKind: 'generic-table',
      profileId: 'generic',
      displayFallback: true,
    });
    expect(result.actions).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'canvas-markdown-unsupported-table-profile',
    );
    expect(operations.createComposite).not.toHaveBeenCalled();
  });

  it('preserves one-image-to-many-shots and many-images-to-one-shot bindings by explicit tokens', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createStoryboardDraftFromMarkdown',
        markdown: [
          '| Scene | Shot | Image | Prompt | Next Action |',
          '| --- | --- | --- | --- | --- |',
          '| Opening | 1 | P1 | establish panel | review |',
          '| Opening | 2 | P1 P2 | split details | review |',
        ].join('\n'),
        resources: [createResource('P2'), createResource('P1')],
      },
      operations,
    );

    expect(result.status).toBe('created');
    expect(result.diagnostics).toEqual([]);
    expect(result.preview).toMatchObject({
      rowCount: 2,
      resourceTokenCount: 2,
      unresolvedResourceTokenCount: 0,
    });
    expect(operations.createNode).toHaveBeenCalledWith(
      'table',
      { x: 0, y: 0 },
      expect.objectContaining({
        markdown: expect.objectContaining({
          rows: [
            expect.objectContaining({
              cells: expect.objectContaining({ image: 'P1' }),
            }),
            expect.objectContaining({
              cells: expect.objectContaining({ image: 'P1 P2' }),
            }),
          ],
          tableProfile: 'storyboard',
          resources: [
            expect.objectContaining({ token: 'P1', status: 'bound' }),
            expect.objectContaining({ token: 'P2', status: 'bound' }),
          ],
        }),
      }),
      'table.basic',
    );
  });

  it('treats panel hints as shot placement metadata instead of separate resource tokens', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createStoryboardDraftFromMarkdown',
        markdown: [
          '| Scene | Shot | Image | Prompt | Next Action |',
          '| --- | --- | --- | --- | --- |',
          '| Opening | 1 | P1#panel_1 | establish panel | review |',
          '| Opening | 2 | P1#panel_2 | close-up panel | review |',
        ].join('\n'),
        resources: [createResource('P1')],
      },
      operations,
    );

    expect(result.status).toBe('created');
    expect(result.diagnostics).toEqual([]);
    expect(result.preview).toMatchObject({
      rowCount: 2,
      resourceTokenCount: 1,
      unresolvedResourceTokenCount: 0,
    });
    expect(operations.createNode).toHaveBeenCalledWith(
      'table',
      { x: 0, y: 0 },
      expect.objectContaining({
        markdown: expect.objectContaining({
          rows: [
            expect.objectContaining({
              cells: expect.objectContaining({ image: 'P1#panel_1' }),
            }),
            expect.objectContaining({
              cells: expect.objectContaining({ image: 'P1#panel_2' }),
            }),
          ],
          tableProfile: 'storyboard',
          resources: [expect.objectContaining({ token: 'P1', status: 'bound' })],
        }),
      }),
      'table.basic',
    );
  });

  it('does not bind CommonMark image alt text as a separate resource token', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createTableFromMarkdown',
        markdown: [
          '| Scene | Image | Prompt |',
          '| --- | --- | --- |',
          '| Opening | ![cover](assets/P1.png) | establish panel |',
        ].join('\n'),
        resources: [
          {
            ...createResource('P1'),
            sourcePath: 'assets/P1.png',
          },
        ],
      },
      operations,
    );

    expect(result.status).toBe('created');
    expect(result.diagnostics).toEqual([]);
    expect(result.preview).toMatchObject({
      resourceTokenCount: 1,
      unresolvedResourceTokenCount: 0,
    });
    expect(operations.createNode).toHaveBeenCalledWith(
      'table',
      { x: 0, y: 0 },
      expect.objectContaining({
        markdown: expect.objectContaining({
          resources: [expect.objectContaining({ token: 'assets/P1.png', status: 'bound' })],
        }),
      }),
      'table.basic',
    );
  });

  it('keeps scene grouping hints and extra columns as draft metadata', async () => {
    const operations = createOperations();
    await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createStoryboardDraftFromMarkdown',
        markdown: [
          '| Scene | Shot | Image | Prompt | Beat Group | Execution Status |',
          '| --- | --- | --- | --- | --- | --- |',
          '| Opening | 1 | P1 | establish panel | A | planned |',
        ].join('\n'),
        resources: [createResource('P1')],
      },
      operations,
    );

    expect(operations.createNode).toHaveBeenCalledWith(
      'table',
      { x: 0, y: 0 },
      expect.objectContaining({
        markdown: expect.objectContaining({
          tableProfile: 'storyboard',
          rows: [
            expect.objectContaining({
              cells: expect.objectContaining({
                scene: 'Opening',
                'beat-group': 'A',
                'execution-status': 'planned',
              }),
            }),
          ],
        }),
      }),
      'table.basic',
    );
  });

  it('uses storyboard profile aliases for Chinese and variant headers', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createStoryboardFromMarkdown',
        mode: 'create-nodes',
        approval: {
          source: 'creation-apply',
          creationId: 'creation-1',
          iterationId: 'iteration-1',
          profileId: 'idc.default',
          stageId: 'apply',
        },
        markdown: [
          '| 场景 | 镜号 | 画面描述 | 生成提示词 | 镜头运动 | 时长秒 | 角色 | 台词 |',
          '| --- | --- | --- | --- | --- | --- | --- | --- |',
          '| 夜市 | S01 | 灯牌下的远景 | neon market | 推进 | 4s | Mika、Ren | 走吧 |',
        ].join('\n'),
      },
      operations,
    );

    expect(result.status).toBe('created');
    const request = vi.mocked(operations.createComposite).mock.calls[0]?.[0];
    expect(request).toMatchObject({
      data: expect.objectContaining({
        sceneTitle: '夜市',
      }),
      children: [
        {
          data: expect.objectContaining({
            shotNumber: 1,
            duration: 4,
            visualDescription: '灯牌下的远景',
            generationPrompt: 'neon market',
            cameraMovement: 'zoom-in',
            characters: [{ characterName: 'Mika' }, { characterName: 'Ren' }],
            dialogue: '走吧',
            sceneTags: ['夜市'],
          }),
        },
      ],
    } satisfies Partial<CanvasCreateCompositeRequest>);
  });

  it('rejects unsupported storyboard table profile hints visibly', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createStoryboardDraftFromMarkdown',
        profileHint: 'canvas.tableProfile.interactive-branch-map',
        markdown: STORYBOARD_MARKDOWN,
      },
      operations,
    );

    expect(result.status).toBe('blocked');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'canvas-markdown-unsupported-table-profile',
        fieldKey: 'profileHint',
      }),
    ]);
    expect(operations.createNode).not.toHaveBeenCalled();
  });

  it('keeps generic tables generic even when they contain storyboard-like columns', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createTableFromMarkdown',
        markdown: [
          '| Scene | Shot | Image | Prompt | Approval |',
          '| --- | --- | --- | --- | --- |',
          '| Opening | 1 | P1 | neon door | pending |',
        ].join('\n'),
        resources: [createResource('P1')],
      },
      operations,
    );

    expect(result.status).toBe('created');
    expect(result.actions).toBeUndefined();
    expect(operations.createComposite).not.toHaveBeenCalled();
    expect(operations.createNode).toHaveBeenCalledWith(
      'table',
      { x: 0, y: 0 },
      expect.objectContaining({
        markdown: expect.objectContaining({
          tableProfile: 'generic',
          reviewKind: 'generic-table',
          unknownColumns: expect.arrayContaining([
            expect.objectContaining({ id: 'scene' }),
            expect.objectContaining({ id: 'shot' }),
            expect.objectContaining({ id: 'prompt' }),
            expect.objectContaining({ id: 'approval' }),
          ]),
        }),
      }),
      'table.basic',
    );
  });

  it('keeps drafts reviewable when visual is missing but blocks production creation', async () => {
    const operations = createOperations();
    const draft = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createStoryboardDraftFromMarkdown',
        markdown: [
          '| Scene | Shot | Image | Next Action |',
          '| --- | --- | --- | --- |',
          '| Opening | 1 | P1 | review |',
        ].join('\n'),
        resources: [createResource('P1')],
      },
      operations,
    );

    expect(draft.status).toBe('needs-review');
    expect(draft.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'canvas-markdown-storyboard-visual-or-prompt-missing',
    );

    const production = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createStoryboardFromMarkdown',
        mode: 'create-nodes',
        approval: {
          source: 'creation-apply',
          creationId: 'creation-1',
          iterationId: 'iteration-1',
          profileId: 'idc.default',
          stageId: 'apply',
        },
        markdown: [
          '| Scene | Shot | Image | Next Action |',
          '| --- | --- | --- | --- |',
          '| Opening | 1 | P1 | create |',
        ].join('\n'),
      },
      operations,
    );

    expect(production.status).toBe('blocked');
    expect(production.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'canvas-markdown-storyboard-visual-column-required',
    ]);
  });

  it('reports ambiguous resource tokens with safe candidate summaries', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createStoryboardDraftFromMarkdown',
        markdown: [
          '| Scene | Shot | Image | Prompt | Next Action |',
          '| --- | --- | --- | --- | --- |',
          '| Opening | 1 | P1 | establish panel | review |',
        ].join('\n'),
        resources: [createResource('P1'), createResource('P1')],
      },
      operations,
    );

    expect(result.status).toBe('needs-review');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'canvas-markdown-ambiguous-resource-token',
        token: 'P1',
        candidates: [
          expect.objectContaining({ token: 'P1', label: 'Page 1' }),
          expect.objectContaining({ token: 'P1', label: 'Page 1' }),
        ],
      }),
    ]);
    expect(JSON.stringify(result.diagnostics)).not.toContain('filePath');
    expect(JSON.stringify(result.diagnostics)).not.toContain('${MEDIA}');
  });
});

const STORYBOARD_MARKDOWN = [
  '| Scene | Shot | Visual | Prompt | Duration | Character | Next Action |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  '| Opening | 1 | Wide view | cinematic wide prompt | 2.5s | Mika | create |',
  '| Opening | 2 | Close-up | close prompt | 0s | Mika | create |',
].join('\n');

function createOperations(): CanvasMarkdownCapabilityOperations {
  return {
    applyAgentContent: vi.fn(async () => ({
      changed: true,
      mode: 'insert',
      nodeId: 'note-1',
      createdNodeIds: ['note-1'],
    })),
    createNode: vi.fn(async () => 'table-1'),
    updateNode: vi.fn(async () => undefined),
    createComposite: vi.fn(async () => ({
      containerId: 'scene-1',
      childIds: ['shot-1', 'shot-2'],
    })),
  };
}

function createResource(token: string): CanvasMarkdownResourceRef {
  return {
    token,
    label: `Page ${token.slice(1)}`,
    role: 'source',
    resourceRef: createTestResourceRef(token),
  };
}

function createTestResourceRef(token: string): ResourceRef {
  return createResourceRef({
    scope: 'project',
    provider: 'test',
    kind: 'media',
    source: {
      kind: 'file',
      filePath: `\${MEDIA}/${token}.png`,
      projectRelativePath: `assets/${token}.png`,
    },
    fingerprint: createResourceFingerprint({ strategy: 'provider', value: token }),
  });
}
