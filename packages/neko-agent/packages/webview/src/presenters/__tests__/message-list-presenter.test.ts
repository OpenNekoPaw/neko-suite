import { describe, expect, it } from 'vitest';
import type { ContentBlock } from '@neko-agent/types';
import { projectMessageList, projectMessageListItems } from '../message-list-presenter';

describe('message-list-presenter', () => {
  it('projects an active skill notice as a conversation-scoped list item', () => {
    const projection = projectMessageList({
      messages: [],
      isThinking: false,
      streamingMessageId: null,
      activeSkillNotice: {
        skillName: 'comic-to-storyboard',
        allowedTools: ['ReadDocument'],
      },
    });

    expect(projection.items).toEqual([
      {
        kind: 'skill_notice',
        notice: {
          skillName: 'comic-to-storyboard',
          allowedTools: ['ReadDocument'],
        },
        ownerMessageId: null,
        estimatedHeight: 46,
      },
    ]);
  });

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

  it('keeps completed process records before the assistant result when they happened first', () => {
    const items = projectMessageListItems(
      [
        {
          id: 'msg-1',
          role: 'assistant',
          content: '',
          timestamp: 1,
          contentBlocks: [
            {
              id: 'thinking-1',
              type: 'thinking',
              timestamp: 8,
              thinking: 'Analyze the source pages.',
              isThinkingComplete: true,
            },
            toolBlock('tool-1', 'ReadDocument', '/books/a.epub', 10),
            {
              id: 'text-1',
              type: 'text',
              timestamp: 20,
              content: 'Final storyboard summary.',
            },
          ],
        },
      ],
      false,
    );

    expect(items.map((item) => item.kind)).toEqual(['process_group', 'content_block']);
    expect(items[0]).toMatchObject({
      kind: 'process_group',
      isFirst: true,
      processGroup: {
        blockCount: 2,
        toolCallCount: 1,
        thinkingCount: 1,
      },
    });
    expect(items[1]).toMatchObject({
      kind: 'content_block',
      isFirst: false,
      projection: {
        renderKind: 'markdown',
        content: 'Final storyboard summary.',
      },
    });
  });

  it('keeps process records between assistant response blocks when they happen in the middle', () => {
    const items = projectMessageListItems(
      [
        {
          id: 'msg-1',
          role: 'assistant',
          content: '',
          timestamp: 1,
          contentBlocks: [
            {
              id: 'text-1',
              type: 'text',
              timestamp: 8,
              content: 'I will inspect the source.',
            },
            toolBlock('tool-1', 'ReadDocument', '/books/a.epub', 10),
            {
              id: 'text-2',
              type: 'text',
              timestamp: 20,
              content: 'Here is the summary.',
            },
          ],
        },
      ],
      false,
    );

    expect(items.map((item) => item.kind)).toEqual([
      'content_block',
      'process_group',
      'content_block',
    ]);
    expect(items[0]).toMatchObject({
      kind: 'content_block',
      projection: { renderKind: 'markdown', content: 'I will inspect the source.' },
    });
    expect(items[1]).toMatchObject({
      kind: 'process_group',
      processGroup: {
        blockCount: 1,
        toolCallCount: 1,
      },
    });
    expect(items[2]).toMatchObject({
      kind: 'content_block',
      projection: { renderKind: 'markdown', content: 'Here is the summary.' },
    });
  });

  it('keeps failed tools visible instead of hiding them in process records', () => {
    const items = projectMessageListItems(
      [
        {
          id: 'msg-1',
          role: 'assistant',
          content: '',
          timestamp: 1,
          contentBlocks: [
            failedToolBlock('tool-1', 'ReadDocument', '/books/a.epub', 10),
            {
              id: 'text-1',
              type: 'text',
              timestamp: 20,
              content: 'Final answer.',
            },
          ],
        },
      ],
      false,
    );

    expect(items.map((item) => item.kind)).toEqual(['content_block', 'content_block']);
    expect(items[0]).toMatchObject({
      kind: 'content_block',
      projection: {
        renderKind: 'tool',
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

function failedToolBlock(
  id: string,
  name: string,
  filePath: string,
  duration: number,
): ContentBlock {
  return {
    id: `block-${id}`,
    type: 'tool_call',
    timestamp: duration,
    toolCall: {
      id,
      name,
      arguments: { file_path: filePath },
      result: {
        success: false,
        data: { file_path: filePath },
        error: 'read failed',
        duration,
      },
    },
  };
}
