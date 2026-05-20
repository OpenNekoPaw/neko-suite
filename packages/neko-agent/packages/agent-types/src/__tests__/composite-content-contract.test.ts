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
});
