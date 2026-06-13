import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ContentBlock } from '@neko-agent/types';
import { MessageActionsProvider } from '@/components/ChatView/MessageActionsContext';
import { registerDefaultRenderers } from '@/components/ChatView/RichContent';
import { ContentBlockItem } from './ContentBlockItem';

vi.mock('@neko/shared/vscode', () => ({
  getVSCodeAPI: () => ({
    postMessage: vi.fn(),
    getState: vi.fn(),
    setState: vi.fn(),
  }),
  postMessage: vi.fn(),
}));

vi.mock('@/i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars?.['count'] !== undefined ? `${String(vars['count'])} ${key}` : key,
  }),
}));

describe('ContentBlockItem Canvas transfer actions', () => {
  it('renders assistant identity on the first content block avatar', () => {
    renderContentBlock(
      {
        id: 'plain',
        type: 'text',
        timestamp: 1,
        content: 'Hi! How can I help?',
      },
      {
        avatarLabel: '小橘',
        title: '小橘 (Character Dialogue)',
      },
    );

    expect(screen.getByLabelText('小橘 (Character Dialogue)')).toBeTruthy();
  });

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

  it('renders composite artifact transfers as review-only artifact cards', () => {
    renderContentBlock({
      id: 'tool-artifact',
      type: 'tool_call',
      timestamp: 1,
      toolCall: {
        id: 'tool-1',
        name: 'GeneratePlan',
        arguments: {},
        result: {
          success: true,
          data: { status: 'completed' },
          artifacts: [
            {
              type: 'artifactSnapshot',
              complete: true,
              artifact: {
                schemaVersion: 1,
                kind: 'composite-artifact',
                artifactId: 'artifact-1',
                profile: 'comic-shot-asset-prep',
                title: 'Comic shot plan',
                blocks: [{ blockId: 'summary', kind: 'text', text: 'Review shots.' }],
                suggestedActions: [
                  {
                    actionId: 'canvas.importStoryboard',
                    kind: 'execute',
                    disabled: true,
                    disabledReason: 'Provider unavailable',
                  },
                ],
              },
            },
          ],
        },
      },
    });

    expect(screen.getByText('Comic shot plan')).toBeTruthy();
    expect(screen.getByText('Review shots.')).toBeTruthy();
    expect(screen.getByText('text')).toBeTruthy();
    expect(screen.getByText('comic-shot-asset-prep')).toBeTruthy();
    expect(screen.getByText('canvas.importStoryboard')).toBeTruthy();
    expect(screen.getByText(/disabled: Provider unavailable/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /import/i })).toBeNull();
  });

  it('renders generic artifact table blocks without exposing execute controls', () => {
    renderContentBlock({
      id: 'tool-table-artifact',
      type: 'tool_call',
      timestamp: 1,
      toolCall: {
        id: 'tool-1',
        name: 'GeneratePlan',
        arguments: {},
        result: {
          success: true,
          data: { status: 'completed' },
          artifacts: [
            {
              type: 'artifactSnapshot',
              complete: true,
              artifact: {
                schemaVersion: 1,
                kind: 'composite-artifact',
                artifactId: 'artifact-1',
                profile: 'comic-to-animation-plan',
                title: 'Comic shot plan',
                blocks: [
                  {
                    blockId: 'table',
                    kind: 'table',
                    table: {
                      schemaVersion: 1,
                      kind: 'generic-table',
                      tableId: 'shots',
                      title: 'Shots',
                      columns: [{ columnId: 'shotId', cellType: 'string' }],
                      rows: [
                        {
                          rowId: 'shot-1',
                          cells: { shotId: { type: 'string', value: 'shot-1' } },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    });

    expect(screen.getAllByText('table').length).toBeGreaterThan(0);
    expect(screen.getByText('Shots')).toBeTruthy();
    expect(screen.getByText('shotId')).toBeTruthy();
    expect(screen.getByText('shot-1')).toBeTruthy();
    expect(screen.getByText('1 rows / 1 columns')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /execute|import/i })).toBeNull();
  });
});

function renderContentBlock(
  block: ContentBlock,
  assistantIdentity?: { avatarLabel: string; title: string },
) {
  registerDefaultRenderers();
  render(
    <MessageActionsProvider pluginsAvailable={{ canvas: true }}>
      <ContentBlockItem
        block={block}
        isFirst
        isLast
        isStreaming={false}
        conversationId="conv-1"
        assistantIdentity={
          assistantIdentity
            ? {
                displayName: assistantIdentity.avatarLabel,
                avatarLabel: assistantIdentity.avatarLabel,
                title: assistantIdentity.title,
              }
            : undefined
        }
      />
    </MessageActionsProvider>,
  );
}
