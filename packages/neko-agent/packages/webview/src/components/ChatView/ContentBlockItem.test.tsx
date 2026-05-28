import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ContentBlock } from '@/components/types';
import { MessageActionsProvider } from '@/components/ChatView/MessageActionsContext';
import { ContentBlockItem } from './ContentBlockItem';

vi.mock('@neko/shared/vscode', () => ({
  getVSCodeAPI: () => ({
    postMessage: vi.fn(),
    getState: vi.fn(),
    setState: vi.fn(),
  }),
  postMessage: vi.fn(),
}));

describe('ContentBlockItem Canvas transfer actions', () => {
  it('does not render Canvas transfer for plain assistant prose', () => {
    renderContentBlock({
      id: 'plain',
      type: 'text',
      timestamp: 1,
      content: 'Hi! How can I help?',
    });

    expect(screen.queryByRole('button', { name: 'Canvas' })).toBeNull();
  });

  it('renders Canvas transfer for storyboard-ready markdown', () => {
    renderContentBlock({
      id: 'storyboard',
      type: 'text',
      timestamp: 1,
      content: `
| 镜头 | 画面 |
| --- | --- |
| 1 | 角色进入森林 |
`,
    });

    expect(screen.getByRole('button', { name: /Canvas/ })).toBeTruthy();
  });
});

function renderContentBlock(block: ContentBlock) {
  render(
    <MessageActionsProvider pluginsAvailable={{ canvas: true }}>
      <ContentBlockItem block={block} isFirst isLast isStreaming={false} conversationId="conv-1" />
    </MessageActionsProvider>,
  );
}
