import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => await import('../../__mocks__/vscode'));

import * as vscode from 'vscode';
import {
  NEKO_WEBVIEW_KEYBOARD_EDITABLE_UPDATE_COMMAND,
  type WebviewKeyboardEditableOwnerUpdate,
} from '@neko/shared/vscode/extension';
import { ChatViewProvider, createChatLocalResourceAccess } from '../chatProvider';

describe('chatProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('restores persisted character role tabs only after role controllers are initialized', () => {
    const context = createMockContext({
      'neko.tabState': {
        openTabs: [
          {
            id: 'tab-character-dialogue',
            title: 'Character Dialogue: 小橘',
            conversationId: 'character-dialogue-session-1',
            kind: 'character-dialogue',
            characterDialogueSession: {
              sessionId: 'character-dialogue-session-1',
              entityId: 'char-xiaoju',
              displayName: '小橘',
              mode: 'roleplay',
              profile: {
                entityRef: { entityId: 'char-xiaoju', entityKind: 'character' },
                displayName: '小橘',
                aliases: [],
                facts: [],
                sparsity: 'thin',
              },
              summary: 'thin profile',
              startedAt: '2026-06-02T00:00:00.000Z',
              status: 'active',
            },
          },
          {
            id: 'tab-embody-character',
            title: 'Embody: 小橘',
            conversationId: 'embody-character-session-1',
            kind: 'embody-character',
            embodyCharacterSession: {
              sessionId: 'embody-character-session-1',
              entityId: 'char-xiaoju',
              displayName: '小橘',
              profile: {
                entityRef: { entityId: 'char-xiaoju', entityKind: 'character' },
                displayName: '小橘',
                aliases: [],
                facts: [],
                sparsity: 'thin',
              },
              scopeSummary: ['project: current project'],
              summary: 'thin profile',
              startedAt: '2026-06-02T00:00:00.000Z',
              status: 'active',
            },
          },
        ],
        activeTabId: 'tab-embody-character',
      },
    });

    const provider = new ChatViewProvider(vscode.Uri.file('/ext/neko-agent'), context, {
      localResourceAccess: createImmediateLocalResourceAccess(),
    });

    expect(context.workspaceState.update).toHaveBeenCalledWith('neko.tabState', {
      openTabs: [],
      activeTabId: null,
    });

    provider.dispose();
  });

  it('configures unified chat roots for extension assets, caches, workspace, and media libraries', async () => {
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({
      id: 'neko.neko-assets',
      extensionUri: vscode.Uri.file('/ext/neko-assets'),
      extensionPath: '/ext/neko-assets',
      isActive: true,
      packageJSON: {},
      extensionKind: 1,
      exports: {
        getMediaLibraryRoots: vi.fn(async () => ['/external/media-library']),
        onDidChangeMediaLibraryRoots: vi.fn(() => ({ dispose: vi.fn() })),
      },
      activate: vi.fn(),
    } as any);
    const extensionUri = vscode.Uri.file('/ext/neko-agent');
    const context = {
      globalStorageUri: vscode.Uri.file('/global/neko-agent'),
    } as vscode.ExtensionContext;
    const webview = vscode.createMockWebview();

    const access = createChatLocalResourceAccess(extensionUri, context);
    await access.configureChatWebview(webview as any);
    const roots = webview.options.localResourceRoots?.map((uri) => uri.fsPath);

    expect(roots).toEqual([
      '/ext/neko-agent/dist/webview',
      '/mock/workspace',
      '/external/media-library',
      '/mock/workspace/.neko/.cache',
    ]);
    expect(access.toWebviewUri(webview as any, '/external/media-library/page.jpg', 'test')).toBe(
      'file:///external/media-library/page.jpg',
    );

    access.dispose();
  });

  it('does not re-authorize legacy document image scratch cache paths', async () => {
    const extensionUri = vscode.Uri.file('/ext/neko-agent');
    const context = {
      globalStorageUri: vscode.Uri.file('/global/neko-agent'),
    } as vscode.ExtensionContext;
    const webview = vscode.createMockWebview();
    webview.options = {
      localResourceRoots: [vscode.Uri.file('/ext/neko-agent/dist/webview')],
    };

    const access = createChatLocalResourceAccess(extensionUri, context);
    const uri = access.toWebviewUri(
      webview as any,
      '/global/neko-agent/document-image-cache/neko_epub_1/page.jpg',
      'test',
    );

    expect(uri).toBeUndefined();
    expect(webview.options.localResourceRoots?.map((root) => root.fsPath)).toEqual([
      '/ext/neko-agent/dist/webview',
    ]);

    access.dispose();
  });

  it('re-authorizes workspace resource cache paths when a restored webview has stale roots', async () => {
    const extensionUri = vscode.Uri.file('/ext/neko-agent');
    const context = {
      globalStorageUri: vscode.Uri.file('/global/neko-agent'),
    } as vscode.ExtensionContext;
    const webview = vscode.createMockWebview();
    webview.options = {
      localResourceRoots: [vscode.Uri.file('/ext/neko-agent/dist/webview')],
    };

    const access = createChatLocalResourceAccess(extensionUri, context);
    const uri = access.toWebviewUri(
      webview as any,
      '/mock/workspace/.neko/.cache/resources/documents/doc_1/page.jpg',
      'test',
    );

    expect(uri).toBe('file:///mock/workspace/.neko/.cache/resources/documents/doc_1/page.jpg');
    expect(webview.options.localResourceRoots?.map((root) => root.fsPath)).toEqual([
      '/ext/neko-agent/dist/webview',
      '/mock/workspace/.neko/.cache',
    ]);

    access.dispose();
  });

  it('does not project document scratch cache paths using computed roots', async () => {
    const extensionUri = vscode.Uri.file('/ext/neko-agent');
    const context = {
      globalStorageUri: vscode.Uri.file('/global/neko-agent'),
    } as vscode.ExtensionContext;
    const staleRoots = [vscode.Uri.file('/ext/neko-agent/dist/webview')];
    const webview = vscode.createMockWebview();
    Object.defineProperty(webview, 'options', {
      configurable: true,
      get: () => ({ localResourceRoots: staleRoots }),
      set: vi.fn(),
    });

    const access = createChatLocalResourceAccess(extensionUri, context);
    const uri = access.toWebviewUri(
      webview as any,
      '/global/neko-agent/document-image-cache/neko_epub_1/page.jpg',
      'neko-agent.conversation',
    );

    expect(uri).toBeUndefined();

    access.dispose();
  });

  it('rejects document scratch cache paths when global storage uses a non-file uri scheme', async () => {
    const extensionUri = vscode.Uri.file('/ext/neko-agent');
    const context = {
      globalStorageUri: {
        scheme: 'vscode-userdata',
        fsPath: '/global/neko-agent',
        path: '/global/neko-agent',
        toString: () => 'vscode-userdata:/global/neko-agent',
      },
    } as vscode.ExtensionContext;
    const webview = vscode.createMockWebview();
    webview.options = {
      localResourceRoots: [vscode.Uri.file('/ext/neko-agent/dist/webview')],
    };

    const access = createChatLocalResourceAccess(extensionUri, context);
    const uri = access.toWebviewUri(
      webview as any,
      '/global/neko-agent/document-image-cache/neko_epub_1/page.jpg',
      'neko-agent.stream-tool-result',
    );

    expect(uri).toBeUndefined();
    expect(webview.options.localResourceRoots?.map((root) => root.fsPath)).toEqual([
      '/ext/neko-agent/dist/webview',
    ]);

    access.dispose();
  });

  it('waits for local resource roots before loading chat HTML and message handlers', async () => {
    let finishConfigure!: () => void;
    const configureChatWebview = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishConfigure = resolve;
        }),
    );
    const localResourceAccess = {
      service: {},
      configureChatWebview,
      createProjector: vi.fn(),
      toWebviewUri: vi.fn(),
      toWebviewAsset: vi.fn(),
      dispose: vi.fn(),
    };
    const webview = vscode.createMockWebview();
    const view = {
      webview,
      visible: true,
      onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
    };
    const provider = new ChatViewProvider(vscode.Uri.file('/ext/neko-agent'), createMockContext(), {
      localResourceAccess: localResourceAccess as never,
    });

    provider.resolveWebviewView(view as never, {} as never, {} as never);

    expect(configureChatWebview).toHaveBeenCalledWith(webview);
    expect(webview.html).toBe('');
    expect(webview.onDidReceiveMessage).not.toHaveBeenCalled();

    finishConfigure();
    await Promise.resolve();

    expect(webview.html).toContain('<!DOCTYPE html>');
    expect(webview.onDidReceiveMessage).toHaveBeenCalled();

    provider.dispose();
  });

  it('reposts plugin availability when the webview requests config', async () => {
    vi.mocked(vscode.extensions.getExtension).mockImplementation((extensionId: string) =>
      extensionId === 'neko.neko-canvas'
        ? ({
            id: extensionId,
            extensionUri: vscode.Uri.file('/ext/neko-canvas'),
            extensionPath: '/ext/neko-canvas',
            isActive: true,
            packageJSON: {},
            extensionKind: 1,
            exports: {},
            activate: vi.fn(),
          } as any)
        : undefined,
    );
    const webview = vscode.createMockWebview();
    const view = {
      webview,
      visible: true,
      onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
    };
    const provider = new ChatViewProvider(vscode.Uri.file('/ext/neko-agent'), createMockContext(), {
      localResourceAccess: createImmediateLocalResourceAccess(),
    });

    provider.resolveWebviewView(view as never, {} as never, {} as never);
    await Promise.resolve();

    const receiveMessage = vi.mocked(webview.onDidReceiveMessage).mock.calls[0]?.[0] as
      | ((message: unknown) => void | Promise<void>)
      | undefined;
    expect(receiveMessage).toBeDefined();

    vi.mocked(webview.postMessage).mockClear();
    await receiveMessage?.({ type: 'getConfig' });

    expect(webview.postMessage).toHaveBeenCalledWith({
      type: 'pluginsAvailable',
      plugins: {
        canvas: true,
        cut: false,
        sketch: false,
        model: false,
      },
    });

    provider.dispose();
  });

  it('sets the agent editable keyboard context while the assistant input owns focus', async () => {
    const webview = vscode.createMockWebview();
    const view = {
      webview,
      visible: true,
      onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
    };
    const provider = new ChatViewProvider(vscode.Uri.file('/ext/neko-agent'), createMockContext(), {
      localResourceAccess: createImmediateLocalResourceAccess(),
    });

    provider.resolveWebviewView(view as never, {} as never, {} as never);
    await Promise.resolve();

    const receiveMessage = vi.mocked(webview.onDidReceiveMessage).mock.calls[0]?.[0] as
      | ((message: unknown) => void | Promise<void>)
      | undefined;
    expect(receiveMessage).toBeDefined();

    await receiveMessage?.({ type: 'webviewKeyboardEditable', editable: true });
    expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
      'setContext',
      'neko.agent.keyboardEditable',
      true,
    );

    await receiveMessage?.({ type: 'webviewKeyboardFocus', focused: true });
    await receiveMessage?.({ type: 'webviewKeyboardEditable', editable: true });
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      NEKO_WEBVIEW_KEYBOARD_EDITABLE_UPDATE_COMMAND,
      {
        ownerId: 'neko.agent:assistant',
        editable: true,
      } satisfies WebviewKeyboardEditableOwnerUpdate,
    );
    await Promise.resolve();
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'setContext',
      'neko.agent.keyboardEditable',
      true,
    );

    await receiveMessage?.({ type: 'webviewKeyboardFocus', focused: false });
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      NEKO_WEBVIEW_KEYBOARD_EDITABLE_UPDATE_COMMAND,
      {
        ownerId: 'neko.agent:assistant',
        editable: false,
      } satisfies WebviewKeyboardEditableOwnerUpdate,
    );
    await Promise.resolve();
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'setContext',
      'neko.agent.keyboardEditable',
      false,
    );

    provider.dispose();
  });

  it('does not treat keyboard ownership reports as chat readiness messages', async () => {
    const webview = vscode.createMockWebview();
    const provider = new ChatViewProvider(vscode.Uri.file('/ext/neko-agent'), createMockContext(), {
      localResourceAccess: createImmediateLocalResourceAccess(),
    });

    await provider.sendMessageToAssistant('queued message', false);
    provider.resolveWebviewView(
      {
        webview,
        visible: true,
        onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
      } as never,
      {} as never,
      {} as never,
    );
    await Promise.resolve();

    const receiveMessage = vi.mocked(webview.onDidReceiveMessage).mock.calls[0]?.[0] as
      | ((message: unknown) => void | Promise<void>)
      | undefined;
    vi.mocked(webview.postMessage).mockClear();

    await receiveMessage?.({ type: 'webviewKeyboardFocus', focused: true });
    expect(webview.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'prefillInput' }),
    );

    await receiveMessage?.({ type: 'getConfig' });
    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'prefillInput', message: 'queued message' }),
    );

    provider.dispose();
  });

  it('clears the agent editable keyboard context when the assistant view is hidden', async () => {
    const webview = vscode.createMockWebview();
    let visibilityListener: (() => void) | undefined;
    const view = {
      webview,
      visible: true,
      onDidChangeVisibility: vi.fn((listener: () => void) => {
        visibilityListener = listener;
        return { dispose: vi.fn() };
      }),
    };
    const provider = new ChatViewProvider(vscode.Uri.file('/ext/neko-agent'), createMockContext(), {
      localResourceAccess: createImmediateLocalResourceAccess(),
    });

    provider.resolveWebviewView(view as never, {} as never, {} as never);
    await Promise.resolve();

    const receiveMessage = vi.mocked(webview.onDidReceiveMessage).mock.calls[0]?.[0] as
      | ((message: unknown) => void | Promise<void>)
      | undefined;
    await receiveMessage?.({ type: 'webviewKeyboardFocus', focused: true });
    await receiveMessage?.({ type: 'webviewKeyboardEditable', editable: true });
    vi.mocked(vscode.commands.executeCommand).mockClear();

    view.visible = false;
    visibilityListener?.();
    await Promise.resolve();

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      NEKO_WEBVIEW_KEYBOARD_EDITABLE_UPDATE_COMMAND,
      {
        ownerId: 'neko.agent:assistant',
        editable: false,
      } satisfies WebviewKeyboardEditableOwnerUpdate,
    );
    await Promise.resolve();
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'setContext',
      'neko.agent.keyboardEditable',
      false,
    );

    provider.dispose();
  });
});

function createMockContext(
  initialWorkspaceState: Readonly<Record<string, unknown>> = {},
): vscode.ExtensionContext {
  const store = new Map<string, unknown>(Object.entries(initialWorkspaceState));
  const memento = {
    get: vi.fn(
      <T>(key: string, defaultValue?: T): T | undefined => (store.get(key) as T) ?? defaultValue,
    ),
    update: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
  };
  return {
    globalStorageUri: vscode.Uri.file('/global/neko-agent'),
    workspaceState: memento,
    globalState: memento,
    subscriptions: [],
  } as unknown as vscode.ExtensionContext;
}

function createImmediateLocalResourceAccess() {
  return {
    service: {},
    configureChatWebview: vi.fn(async () => {}),
    createProjector: vi.fn(),
    toWebviewUri: vi.fn(),
    toWebviewAsset: vi.fn(),
    dispose: vi.fn(),
  };
}
