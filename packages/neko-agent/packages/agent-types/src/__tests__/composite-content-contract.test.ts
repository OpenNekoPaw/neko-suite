import { describe, expect, it } from 'vitest';
import { extractCompositeContentBlocks, parseCompositeContentJson } from '../index';

describe('composite content contract', () => {
  it('extracts fenced storyboard composite blocks from markdown', () => {
    const result = extractCompositeContentBlocks(`Here is the plan.

\`\`\`neko-composite
{
  "template": "storyboard-table",
  "title": "Opening",
  "sections": [
    {
      "heading": "Shot 1",
      "content": "Wide frame",
      "layout": "table-row",
      "mediaRefs": [
        { "toolCallId": "read-1", "assetIndex": 0, "caption": "原图", "role": "original" }
      ]
    }
  ]
}
\`\`\`

Done.`);

    expect(result.text).toBe('Here is the plan.\n\nDone.');
    expect(result.composites).toEqual([
      {
        template: 'storyboard-table',
        title: 'Opening',
        sections: [
          {
            heading: 'Shot 1',
            content: 'Wide frame',
            layout: 'table-row',
            mediaRefs: [
              {
                toolCallId: 'read-1',
                assetIndex: 0,
                caption: '原图',
                role: 'original',
              },
            ],
          },
        ],
      },
    ]);
  });

  it('parses envelopes and drops invalid composite payloads', () => {
    expect(
      parseCompositeContentJson(
        JSON.stringify({
          kind: 'neko-composite',
          composites: [
            {
              template: 'gallery',
              sections: [{ mediaRefs: [{ toolCallId: 'call-1', assetIndex: 1.5 }] }],
            },
            {
              template: 'unknown',
              sections: [{ heading: 'Ignored' }],
            },
          ],
        }),
      ),
    ).toEqual([
      {
        template: 'gallery',
        sections: [
          {
            mediaRefs: [{ toolCallId: 'call-1' }],
          },
        ],
      },
    ]);
  });

  it('extracts semantic storyboard tables without requiring legacy sections', () => {
    const result = parseCompositeContentJson(
      JSON.stringify({
        template: 'storyboard-table',
        schemaVersion: 1,
        kind: 'storyboard-table',
        title: 'Opening',
        scenes: [
          {
            sceneId: 'scene-1',
            sceneTitle: 'INT. CAFE - DAY',
            shots: [
              {
                shotNumber: 1,
                duration: 4,
                visualDescription: 'A wide establishing frame.',
                characterAction: 'Rin enters the cafe.',
                imageStrategy: 'generate-new',
                generationPrompt: 'wide anime cafe frame',
              },
            ],
          },
        ],
      }),
    );

    expect(result[0]).toMatchObject({
      template: 'storyboard-table',
      title: 'Opening',
      storyboardTable: {
        schemaVersion: 1,
        kind: 'storyboard-table',
        scenes: [
          {
            sceneId: 'scene-1',
            shots: [
              {
                shotNumber: 1,
                visualDescription: 'A wide establishing frame.',
              },
            ],
          },
        ],
      },
      sections: [
        {
          heading: 'INT. CAFE - DAY / Shot 1',
          content: 'A wide establishing frame.',
          layout: 'table-row',
        },
      ],
    });
  });

  it('keeps invalid semantic storyboard tables visible with bounded diagnostics', () => {
    const result = parseCompositeContentJson(
      JSON.stringify({
        template: 'storyboard-table',
        schemaVersion: 1,
        kind: 'storyboard-table',
        title: 'Broken',
        scenes: [
          {
            sceneId: 'scene-1',
            sceneTitle: 'INT. CAFE - DAY',
            shots: [
              {
                shotNumber: 1,
                duration: 4,
                characterAction: 'Rin enters the cafe.',
                imageStrategy: 'generate-new',
              },
            ],
          },
        ],
      }),
    );

    expect(result[0]?.storyboardTable).toBeUndefined();
    expect(result[0]?.storyboardDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'missing-required-field',
          path: ['scenes', 0, 'shots', 0, 'visualDescription'],
        }),
      ]),
    );
    expect(result[0]?.sections[0]).toMatchObject({
      heading: 'Storyboard validation failed',
      layout: 'table-row',
    });
  });
});
