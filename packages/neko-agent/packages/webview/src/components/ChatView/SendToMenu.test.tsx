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
  it('invokes Canvas Markdown capabilities instead of sendToPlugin for Markdown handoff', () => {
    render(
      <SendToMenu
        canvasMarkdownCapability={{
          capabilityId: 'canvas.ingestMarkdown',
          markdown:
            '| scene | shot id | visual | image |\n| --- | --- | --- | --- |\n| S1 | 1 | open | P1 |',
          sourceFormat: 'gfm-table',
          intentHint: 'creative-table',
          profileHint: 'storyboard',
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
        type: 'invokeCanvasMarkdownCapability',
        conversationId: 'conv-1',
        input: expect.objectContaining({
          capabilityId: 'canvas.ingestMarkdown',
          intentHint: 'creative-table',
          profileHint: 'storyboard',
          resources: [{ token: 'P1', sourcePath: '${PROJECT}/assets/panel-1.png' }],
          provenance: {
            source: 'webview',
            label: 'assistant-markdown-block',
          },
        }),
      }),
    );
    expect(JSON.stringify(mockPostMessage.mock.calls)).not.toContain('vscode-webview://');
    expect(JSON.stringify(mockPostMessage.mock.calls)).not.toContain('blob:');
    expect(mockPostMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sendToPlugin' }),
    );
  });
});
