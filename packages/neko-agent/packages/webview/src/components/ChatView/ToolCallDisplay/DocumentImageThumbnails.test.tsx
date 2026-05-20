import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MessageActionsProvider } from '@/components/ChatView/MessageActionsContext';
import { DocumentImageThumbnails } from './DocumentImageThumbnails';

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

describe('DocumentImageThumbnails', () => {
  it('renders a Send to Canvas action for document image thumbnails', () => {
    render(
      <MessageActionsProvider pluginsAvailable={{ canvas: true }}>
        <DocumentImageThumbnails
          thumbnails={[
            {
              id: '/tmp/page-1.jpg:0',
              index: 0,
              filePath: '/books/a.epub',
              path: '/tmp/page-1.jpg',
              src: 'vscode-webview://page-1.jpg',
              width: 1494,
              height: 2133,
              byteSize: 1024,
              mimeType: 'image/jpeg',
              label: 'C2',
              resourceRef: {
                kind: 'document-entry',
                source: { filePath: '/books/a.epub', format: 'epub' },
                entryPath: 'image/Page_1.jpg',
                cachePath: '/tmp/page-1.jpg',
                versionPolicy: 'versioned-export',
              },
              referenceJson: '{}',
            },
          ]}
        />
      </MessageActionsProvider>,
    );

    const sendButton = screen.getByRole('button', { name: /Canvas/i });
    expect(sendButton).toBeTruthy();

    fireEvent.click(sendButton);

    expect(mockPostMessage).toHaveBeenCalledWith({
      type: 'sendToPlugin',
      target: 'canvas',
      payload: {
        kind: 'singleAsset',
        asset: {
          path: '/tmp/page-1.jpg',
          mediaType: 'image',
          name: 'page-1.jpg',
          documentResourceRef: {
            kind: 'document-entry',
            source: { filePath: '/books/a.epub', format: 'epub' },
            entryPath: 'image/Page_1.jpg',
            cachePath: '/tmp/page-1.jpg',
            versionPolicy: 'versioned-export',
          },
        },
        target: {
          plugin: 'canvas',
          mode: 'insert',
        },
        provenance: {
          source: 'webview',
          label: 'document-image:C2',
          metadata: {
            documentResourceRef: {
              kind: 'document-entry',
              source: { filePath: '/books/a.epub', format: 'epub' },
              entryPath: 'image/Page_1.jpg',
              cachePath: '/tmp/page-1.jpg',
              versionPolicy: 'versioned-export',
            },
          },
        },
      },
    });
  });
});
