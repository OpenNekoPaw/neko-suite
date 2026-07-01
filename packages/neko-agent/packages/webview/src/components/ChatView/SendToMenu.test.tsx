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
  it('invokes Canvas Markdown lifecycle directly for Markdown handoff buttons', () => {
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
        type: 'invokeAgentCapabilityLifecycle',
        conversationId: 'conv-1',
        invocation: expect.objectContaining({
          capabilityId: 'canvas.ingestMarkdown',
          phase: 'review',
          payload: expect.objectContaining({
            capabilityId: 'canvas.ingestMarkdown',
            markdown:
              '| scene | shot id | visual | image |\n| --- | --- | --- | --- |\n| S1 | 1 | open | P1 |',
            intentHint: 'creative-table',
            profileHint: 'storyboard',
            resources: [{ token: 'P1', sourcePath: '${PROJECT}/assets/panel-1.png' }],
            provenance: expect.objectContaining({
              source: 'webview',
              label: 'assistant-markdown-block',
              conversationId: 'conv-1',
            }),
          }),
          provenance: expect.objectContaining({
            source: 'webview',
            conversationId: 'conv-1',
          }),
        }),
      }),
    );
    expect(JSON.stringify(mockPostMessage.mock.calls)).not.toContain(
      'requestCanvasMarkdownHandoff',
    );
    expect(JSON.stringify(mockPostMessage.mock.calls)).not.toContain('vscode-webview://');
    expect(JSON.stringify(mockPostMessage.mock.calls)).not.toContain('blob:');
    expect(mockPostMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sendToPlugin' }),
    );
  });
});
