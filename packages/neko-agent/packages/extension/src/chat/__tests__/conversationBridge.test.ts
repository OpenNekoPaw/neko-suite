import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationBridge } from '../conversationBridge';

function createMockContext() {
  const store = new Map<string, unknown>();
  return {
    workspaceState: {
      get: vi.fn(
        <T>(key: string, defaultValue?: T): T | undefined => (store.get(key) as T) ?? defaultValue,
      ),
      update: vi.fn(async (key: string, value: unknown) => {
        store.set(key, value);
      }),
    },
  };
}

function createMockWebview() {
  return {
    postMessage: vi.fn().mockResolvedValue(true),
    asWebviewUri: vi.fn((uri: { toString(): string }) => ({
      toString: () => `vscode-webview://${uri.toString()}`,
    })),
  };
}

describe('ConversationBridge', () => {
  let handler: ConversationBridge;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
    handler = new ConversationBridge(ctx as any);
  });

  describe('create and ensureActive', () => {
    it('should create a conversation and return its ID', () => {
      const id = handler.create();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('ensureActive creates conversation when none exists', () => {
      const id = handler.ensureActive();
      expect(typeof id).toBe('string');
      expect(handler.getActiveId()).toBe(id);
    });

    it('ensureActive returns existing active conversation', () => {
      const id1 = handler.ensureActive();
      const id2 = handler.ensureActive();
      expect(id1).toBe(id2);
    });

    it('uses canonical conversationId format when workspace root is known', () => {
      const workspaceHandler = new ConversationBridge(ctx as any, '/workspace/demo');
      const id = workspaceHandler.create();

      expect(id).toMatch(/^[0-9a-z]{8}-[0-9A-HJKMNP-TV-Z]{26}$/);
    });
  });

  describe('switchTo', () => {
    it('should switch to an existing conversation', () => {
      const id1 = handler.create();
      const id2 = handler.create();
      expect(handler.switchTo(id1)).toBe(true);
      expect(handler.getActiveId()).toBe(id1);
      expect(handler.switchTo(id2)).toBe(true);
      expect(handler.getActiveId()).toBe(id2);
    });

    it('should return false for unknown conversation ID', () => {
      const result = handler.switchTo('nonexistent-id');
      expect(result).toBe(false);
    });
  });

  describe('addMessage', () => {
    it('should add message to active conversation', () => {
      handler.ensureActive();
      handler.addMessage({ id: 'm1', role: 'user', content: 'hello', timestamp: Date.now() });
      const active = handler.getActive();
      expect(active?.messages).toHaveLength(1);
      expect(active?.messages[0]?.content).toBe('hello');
    });

    it('should flush workspace state after adding a message', () => {
      handler.ensureActive();
      vi.mocked(ctx.workspaceState.update).mockClear();

      handler.addMessage({ id: 'm1', role: 'user', content: 'hello', timestamp: Date.now() });

      expect(ctx.workspaceState.update).toHaveBeenCalledWith(
        'conversations',
        expect.objectContaining({
          conversations: expect.arrayContaining([
            [
              expect.any(String),
              expect.objectContaining({
                messages: [expect.objectContaining({ id: 'm1', content: 'hello' })],
              }),
            ],
          ]),
        }),
      );
    });

    it('should not crash when no active conversation', () => {
      expect(() =>
        handler.addMessage({ id: 'm1', role: 'user', content: 'hello', timestamp: Date.now() }),
      ).not.toThrow();
    });
  });

  describe('list', () => {
    it('should list all conversations', () => {
      handler.create();
      handler.create();
      expect(handler.list()).toHaveLength(2);
    });

    it('should return empty array when no conversations', () => {
      expect(handler.list()).toHaveLength(0);
    });
  });

  describe('clearCurrent', () => {
    it('should clear messages from active conversation', () => {
      handler.ensureActive();
      handler.addMessage({ id: 'm1', role: 'user', content: 'hello', timestamp: Date.now() });
      handler.clearCurrent();
      expect(handler.getActive()?.messages).toHaveLength(0);
    });
  });

  describe('updateMessagesForConversation', () => {
    it('should replace messages for a specific conversation', () => {
      const id = handler.ensureActive();
      handler.updateMessagesForConversation(id, [
        { id: 'm1', role: 'user', content: 'updated', timestamp: Date.now() },
      ]);

      expect(handler.get(id)?.messages).toEqual([
        expect.objectContaining({ id: 'm1', content: 'updated' }),
      ]);
    });

    it('should flush workspace state after replacing messages', () => {
      const id = handler.ensureActive();
      vi.mocked(ctx.workspaceState.update).mockClear();

      handler.updateMessagesForConversation(id, [
        { id: 'm1', role: 'assistant', content: 'partial', timestamp: Date.now(), isError: true },
      ]);

      expect(ctx.workspaceState.update).toHaveBeenCalledWith(
        'conversations',
        expect.objectContaining({
          conversations: expect.arrayContaining([
            [
              id,
              expect.objectContaining({
                messages: [expect.objectContaining({ id: 'm1', isError: true })],
              }),
            ],
          ]),
        }),
      );
    });
  });

  describe('sendConversationList', () => {
    it('should post conversationList with mapped summaries', () => {
      const webview = createMockWebview();
      handler.create();
      handler.sendConversationList(webview as any);

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'conversationList',
          conversations: expect.arrayContaining([
            expect.objectContaining({ id: expect.any(String), messageCount: 0 }),
          ]),
        }),
      );
    });
  });

  describe('sendActiveConversation', () => {
    it('should post activeConversation with null when no active', () => {
      const webview = createMockWebview();
      handler.sendActiveConversation(webview as any);
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'activeConversation',
        conversation: null,
      });
    });

    it('should post activeConversation with conversation data when active', () => {
      const webview = createMockWebview();
      handler.ensureActive();
      handler.sendActiveConversation(webview as any);

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'activeConversation',
          conversation: expect.objectContaining({ id: expect.any(String), messages: [] }),
        }),
      );
    });

    it('does not project document scratch cache paths when restoring active conversation', () => {
      const localResourceAccess = {
        toWebviewUri: vi.fn((_webview, filePath: string) => `webview-uri:${filePath}`),
      };
      const bridge = new ConversationBridge(ctx as any, undefined, localResourceAccess as any);
      const webview = createMockWebview();
      const conversationId = bridge.ensureActive();
      const scratchPath =
        '/mock/workspace/.neko/.cache/document-image-cache/neko_epub_1/page-1.jpg';
      const managedPath =
        '/mock/workspace/.neko/.cache/resources/documents/doc_comic/OPS/page-1.jpg';

      bridge.updateMessagesForConversation(conversationId, [
        {
          id: 'message-1',
          role: 'assistant',
          content: '',
          timestamp: 1,
          toolCalls: [
            {
              id: 'tool-1',
              name: 'ReadImage',
              arguments: { image_paths: [scratchPath, managedPath] },
              result: {
                success: true,
                data: {
                  images: [
                    { path: scratchPath, label: 'P1' },
                    { path: managedPath, label: 'P1 cached' },
                  ],
                },
              },
            },
          ],
        },
      ]);

      bridge.sendActiveConversation(webview as any);

      expect(localResourceAccess.toWebviewUri).not.toHaveBeenCalledWith(
        webview,
        scratchPath,
        'neko-agent.conversation',
      );
      expect(localResourceAccess.toWebviewUri).toHaveBeenCalledWith(
        webview,
        managedPath,
        'neko-agent.conversation',
      );
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'activeConversation',
          conversation: expect.objectContaining({
            messages: [
              expect.objectContaining({
                toolCalls: [
                  expect.objectContaining({
                    arguments: {
                      image_paths: [scratchPath, managedPath],
                      imagePathWebviewUris: [undefined, `webview-uri:${managedPath}`],
                    },
                    result: expect.objectContaining({
                      data: {
                        images: [
                          { path: scratchPath, label: 'P1' },
                          {
                            path: managedPath,
                            label: 'P1 cached',
                            webviewUri: `webview-uri:${managedPath}`,
                          },
                        ],
                      },
                    }),
                  }),
                ],
              }),
            ],
          }),
        }),
      );
    });
  });

  describe('cleanup on init', () => {
    it('should survive construction without stored conversations', () => {
      expect(() => new ConversationBridge(ctx as any)).not.toThrow();
    });
  });
});
