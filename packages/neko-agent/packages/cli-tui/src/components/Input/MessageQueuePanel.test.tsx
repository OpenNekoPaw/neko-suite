import React from 'react';
import { render } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { useAgentStore } from '../../stores/agent-store';
import { MessageQueuePanel } from './MessageQueuePanel';

const originalLocale = process.env.NEKO_LOCALE;

afterEach(() => {
  useAgentStore.getState().reset();
  if (originalLocale === undefined) {
    delete process.env.NEKO_LOCALE;
  } else {
    process.env.NEKO_LOCALE = originalLocale;
  }
});

describe('MessageQueuePanel', () => {
  it('renders nothing for an empty queue', () => {
    const view = render(<MessageQueuePanel />);
    expect(view.lastFrame()).toBe('');
  });

  it('shows ordered content above the composer without making ids primary copy', () => {
    process.env.NEKO_LOCALE = 'en-US';
    useAgentStore.getState().setMessageQueueSnapshot({
      conversationId: 'conv-1',
      pendingCount: 2,
      version: 1,
      items: [
        {
          id: 'queue-internal-1',
          conversationId: 'conv-1',
          content: 'Analyze the first ten pages',
          createdAt: 1,
          source: 'user',
        },
        {
          id: 'queue-internal-2',
          conversationId: 'conv-1',
          content: 'Send the storyboard to Canvas',
          createdAt: 2,
          source: 'composer',
        },
      ],
    });

    const frame = render(<MessageQueuePanel />).lastFrame()!;
    expect(frame).toContain('Next turn · 2');
    expect(frame).toContain('1. message: Analyze the first ten pages');
    expect(frame).toContain('2. message: Send the storyboard to Canvas');
    expect(frame).toContain('/queue list');
    expect(frame).not.toContain('queue-internal-1');
  });

  it('distinguishes priority continuations and collapses extra rows', () => {
    process.env.NEKO_LOCALE = 'zh-CN';
    useAgentStore.getState().setMessageQueueSnapshot({
      conversationId: 'conv-1',
      pendingCount: 3,
      version: 1,
      items: [
        {
          id: 'task-1',
          conversationId: 'conv-1',
          content: '继续处理任务结果',
          createdAt: 1,
          source: 'task-result-continuation',
        },
        {
          id: 'queue-1',
          conversationId: 'conv-1',
          content: '生成分镜表',
          createdAt: 2,
          source: 'user',
        },
        {
          id: 'queue-2',
          conversationId: 'conv-1',
          content: '发送到 Canvas',
          createdAt: 3,
          source: 'user',
        },
      ],
    });

    const frame = render(<MessageQueuePanel />).lastFrame()!;
    expect(frame).toContain('下一轮 · 3');
    expect(frame).toContain('内部续跑优先');
    expect(frame).toContain('任务续跑: 继续处理任务结果');
    expect(frame).toContain('+1 条');
  });
});
