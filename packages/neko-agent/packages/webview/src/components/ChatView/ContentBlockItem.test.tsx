import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentBlock } from '@neko-agent/types';
import { MessageActionsProvider } from '@/components/ChatView/MessageActionsContext';
import { registerDefaultRenderers } from '@/components/ChatView/RichContent';
import { ContentBlockItem } from './ContentBlockItem';

const { mockPostMessage } = vi.hoisted(() => ({
  mockPostMessage: vi.fn(),
}));

vi.mock('@neko/shared/vscode', () => ({
  getVSCodeAPI: () => ({
    postMessage: mockPostMessage,
    getState: vi.fn(),
    setState: vi.fn(),
  }),
  postMessage: (message: unknown) => mockPostMessage(message),
}));

vi.mock('@/i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars?.['count'] !== undefined ? `${String(vars['count'])} ${key}` : key,
  }),
}));

describe('ContentBlockItem Canvas transfer actions', () => {
  beforeEach(() => {
    mockPostMessage.mockClear();
  });

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

  it('renders Canvas Markdown lifecycle transfer for plain assistant prose', () => {
    renderContentBlock({
      id: 'plain',
      type: 'text',
      timestamp: 1,
      content: 'Hi! How can I help?',
    });

    expect(screen.getByRole('button', { name: /Canvas/ })).toBeTruthy();
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
                    actionId: 'canvas.ingestMarkdown',
                    kind: 'review',
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
    expect(screen.getByText('canvas.ingestMarkdown')).toBeTruthy();
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

  it('renders Canvas lifecycle follow-up actions as approval-gated controls', () => {
    renderContentBlock({
      id: 'canvas-result',
      type: 'canvas_lifecycle',
      timestamp: 1,
      canvasLifecycle: {
        requestId: 'req-1',
        success: true,
        result: {
          capabilityId: 'canvas.ingestMarkdown',
          phase: 'review',
          status: 'needs-review',
          diagnostics: [],
          reviewArtifact: {
            kind: 'node',
            id: 'table-1',
            packageId: 'neko-canvas',
            profile: 'storyboard',
          },
          actions: [
            {
              actionId: 'create-storyboard-nodes',
              label: 'Create storyboard nodes',
              capabilityId: 'canvas.createStoryboardFromMarkdown',
              phase: 'apply',
              requiresApproval: true,
              sourceRef: { kind: 'node', id: 'table-1', packageId: 'neko-canvas' },
              payload: {
                capabilityId: 'canvas.createStoryboardFromMarkdown',
                markdown: '| Scene | Shot | Visual |\\n| --- | --- | --- |\\n| S1 | 1 | open |',
                sourceFormat: 'gfm-table',
                mode: 'create-nodes',
              },
            },
          ],
        },
      },
    });

    expect(screen.getByText('Canvas needs-review')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Create storyboard nodes/ }));

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'invokeCanvasMarkdownCapability',
        conversationId: 'conv-1',
        input: expect.objectContaining({
          capabilityId: 'canvas.createStoryboardFromMarkdown',
          mode: 'create-nodes',
          approval: expect.objectContaining({ source: 'user-confirmation' }),
        }),
      }),
    );
  });

  it('marks generic fallback lifecycle results as display-only', () => {
    renderContentBlock({
      id: 'canvas-result',
      type: 'canvas_lifecycle',
      timestamp: 1,
      canvasLifecycle: {
        requestId: 'req-1',
        success: true,
        result: {
          capabilityId: 'canvas.ingestMarkdown',
          phase: 'review',
          status: 'needs-review',
          diagnostics: [
            {
              severity: 'warning',
              code: 'canvas-creative-profile-unsupported',
              message: 'Unsupported creative profile "interactive-video".',
            },
          ],
          data: {
            capabilityId: 'canvas.ingestMarkdown',
            status: 'created',
            resolvedKind: 'generic-table',
            displayFallback: true,
            diagnostics: [],
          },
        },
      },
    });

    expect(screen.getByText('display-only fallback')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Create storyboard nodes/ })).toBeNull();
  });

  it('renders unsupported Canvas lifecycle actions disabled', () => {
    renderContentBlock({
      id: 'canvas-result',
      type: 'canvas_lifecycle',
      timestamp: 1,
      canvasLifecycle: {
        requestId: 'req-1',
        success: true,
        result: {
          capabilityId: 'canvas.ingestMarkdown',
          phase: 'review',
          status: 'needs-review',
          diagnostics: [],
          actions: [
            {
              actionId: 'run-external',
              label: 'Run external action',
              capabilityId: 'canvas.createStoryboardFromMarkdown',
              phase: 'apply',
              requiresApproval: true,
              payload: { capabilityId: 'unknown.tool', markdown: 'nope' },
            },
          ],
        },
      },
    });

    const action = screen.getByRole('button', { name: /Run external action/ });
    expect(action.hasAttribute('disabled')).toBe(true);
    expect(action.getAttribute('title')).toBe('Unsupported action payload');
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
