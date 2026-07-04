import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SendToMenu } from './SendToMenu';

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

describe('SendToMenu', () => {
  it('requests Agent-led Canvas Markdown handoff for Markdown handoff buttons', () => {
    render(
      <SendToMenu
        canvasMarkdownHandoff={{
          markdown:
            '| scene | shot id | visual | image |\n| --- | --- | --- | --- |\n| S1 | 1 | open | P1 |',
          sourceFormat: 'gfm-table',
          declaredIntentHint: 'creative-table',
          declaredProfileHint: 'storyboard',
          resources: [{ token: 'P1', sourcePath: '${PROJECT}/assets/panel-1.png' }],
          provenance: {
            source: 'webview',
            label: 'assistant-markdown-block',
          },
        }}
        conversationId="conv-1"
        mediaType="image"
        plugins={{ canvas: true }}
        allowedTargets={['canvas']}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Canvas/i }));

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'requestCanvasMarkdownHandoff',
        conversationId: 'conv-1',
        requestId: expect.stringMatching(/^canvas-markdown-handoff:/),
        markdown:
          '| scene | shot id | visual | image |\n| --- | --- | --- | --- |\n| S1 | 1 | open | P1 |',
        declaredIntentHint: 'creative-table',
        declaredProfileHint: 'storyboard',
        resources: [{ token: 'P1', sourcePath: '${PROJECT}/assets/panel-1.png' }],
        provenance: expect.objectContaining({
          source: 'webview',
          label: 'assistant-markdown-block',
        }),
      }),
    );
    expect(mockPostMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'invokeAgentCapabilityLifecycle',
      }),
    );
    expect(JSON.stringify(mockPostMessage.mock.calls)).not.toContain('capabilityId');
    expect(JSON.stringify(mockPostMessage.mock.calls)).not.toContain('intentHint');
    expect(JSON.stringify(mockPostMessage.mock.calls)).not.toContain('profileHint');
    expect(JSON.stringify(mockPostMessage.mock.calls)).not.toContain('vscode-webview://');
    expect(JSON.stringify(mockPostMessage.mock.calls)).not.toContain('blob:');
    expect(mockPostMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sendToPlugin' }),
    );
  });
});
