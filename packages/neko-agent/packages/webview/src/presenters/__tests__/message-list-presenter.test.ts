import { describe, expect, it } from 'vitest';
import type { ContentBlock } from '@neko-agent/types';
import { projectMessageListItems } from '../message-list-presenter';

describe('message-list-presenter', () => {
  it('projects repeated assistant tool blocks as a single grouped list item', () => {
    const items = projectMessageListItems(
      [
        {
          id: 'msg-1',
          role: 'assistant',
          content: '',
          timestamp: 1,
          contentBlocks: [
            toolBlock('tool-1', 'ReadDocument', '/books/a.epub', 10),
            toolBlock('tool-2', 'ReadDocument', '/books/a.epub', 14),
            toolBlock('tool-3', 'ReadDocument', '/books/a.epub', 18),
          ],
        },
      ],
      false,
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'content_block',
      projection: {
        renderKind: 'toolGroup',
        toolName: 'ReadDocument',
        count: 3,
        targetLabel: '/books/a.epub',
      },
    });
  });
});

function toolBlock(id: string, name: string, filePath: string, duration: number): ContentBlock {
  return {
    id: `block-${id}`,
    type: 'tool_call',
    timestamp: duration,
    toolCall: {
      id,
      name,
      arguments: { file_path: filePath },
      result: {
        success: true,
        data: { file_path: filePath },
        duration,
      },
    },
  };
}
