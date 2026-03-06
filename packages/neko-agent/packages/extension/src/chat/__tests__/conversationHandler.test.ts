import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationHandler } from '../conversationHandler';

function createMockContext() {
  const store = new Map<string, unknown>();
  return {
    workspaceState: {
      get: vi.fn(<T>(key: string, defaultValue?: T): T | undefined =>
        (store.get(key) as T) ?? defaultValue
      ),
      update: vi.fn(async (key: string, value: unknown) => { store.set(key, value); }),
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

describe('ConversationHandler', () => {
  let handler: ConversationHandler;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
    handler = new ConversationHandler(ctx as any);
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

    it('should not crash when no active conversation', () => {
      expect(() =>
        handler.addMessage({ id: 'm1', role: 'user', content: 'hello', timestamp: Date.now() })
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
        })
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
        })
      );
    });
  });

  describe('cleanup on init', () => {
    it('should survive construction without stored conversations', () => {
      expect(() => new ConversationHandler(ctx as any)).not.toThrow();
    });
  });
});
