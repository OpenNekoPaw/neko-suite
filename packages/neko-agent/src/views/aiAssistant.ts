/**
 * AI Assistant Provider - Webview for AI chat interface
 */
import * as vscode from 'vscode';
import type { AgentMessage } from '../api';

export class AIAssistantProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'neko.aiAssistant';

  private view?: vscode.WebviewView;
  private messages: AgentMessage[] = [];

  private readonly _onDidReceiveMessage = new vscode.EventEmitter<AgentMessage>();
  public readonly onDidReceiveMessage = this._onDidReceiveMessage.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly chatHandler: (message: string) => Promise<string>
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'assistant'),
      ],
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      (message) => this.handleMessage(message),
      undefined,
      this.context.subscriptions
    );
  }

  /**
   * Add a message to the chat
   */
  addMessage(message: AgentMessage): void {
    this.messages.push(message);
    this.view?.webview.postMessage({
      type: 'addMessage',
      message,
    });
    this._onDidReceiveMessage.fire(message);
  }

  /**
   * Clear all messages
   */
  clearMessages(): void {
    this.messages = [];
    this.view?.webview.postMessage({ type: 'clearMessages' });
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const assistantUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'assistant')
    );

    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data: blob:; font-src ${webview.cspSource};">
  <title>AI Assistant</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      height: 100vh;
      display: flex;
      flex-direction: column;
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      background: var(--vscode-editor-background);
    }
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
    }
    .message {
      margin-bottom: 12px;
      padding: 8px 12px;
      border-radius: 8px;
      max-width: 85%;
    }
    .message.user {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      margin-left: auto;
    }
    .message.assistant {
      background: var(--vscode-editor-inactiveSelectionBackground);
    }
    .message.system {
      background: var(--vscode-editorInfo-background);
      font-style: italic;
      text-align: center;
      max-width: 100%;
    }
    .input-area {
      padding: 12px;
      border-top: 1px solid var(--vscode-panel-border);
      display: flex;
      gap: 8px;
    }
    .input-area textarea {
      flex: 1;
      padding: 8px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 4px;
      resize: none;
      font-family: inherit;
      font-size: inherit;
    }
    .input-area button {
      padding: 8px 16px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    .input-area button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .input-area button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .typing {
      display: flex;
      gap: 4px;
      padding: 8px;
    }
    .typing span {
      width: 8px;
      height: 8px;
      background: var(--vscode-foreground);
      border-radius: 50%;
      animation: bounce 1.4s infinite ease-in-out;
    }
    .typing span:nth-child(1) { animation-delay: -0.32s; }
    .typing span:nth-child(2) { animation-delay: -0.16s; }
    @keyframes bounce {
      0%, 80%, 100% { transform: scale(0); }
      40% { transform: scale(1); }
    }
  </style>
</head>
<body>
  <div class="messages" id="messages">
    <div class="message system">Welcome to Neko AI Assistant! How can I help you today?</div>
  </div>
  <div class="input-area">
    <textarea id="input" rows="2" placeholder="Type your message..."></textarea>
    <button id="send">Send</button>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const messagesEl = document.getElementById('messages');
    const inputEl = document.getElementById('input');
    const sendBtn = document.getElementById('send');

    let isLoading = false;

    sendBtn.addEventListener('click', sendMessage);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    function sendMessage() {
      const text = inputEl.value.trim();
      if (!text || isLoading) return;

      addMessageToUI({ role: 'user', content: text });
      inputEl.value = '';
      setLoading(true);

      vscode.postMessage({ type: 'chat', message: text });
    }

    function addMessageToUI(message) {
      const div = document.createElement('div');
      div.className = 'message ' + message.role;
      div.textContent = message.content;
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function setLoading(loading) {
      isLoading = loading;
      sendBtn.disabled = loading;

      const existingTyping = document.querySelector('.typing');
      if (existingTyping) existingTyping.remove();

      if (loading) {
        const typing = document.createElement('div');
        typing.className = 'typing';
        typing.innerHTML = '<span></span><span></span><span></span>';
        messagesEl.appendChild(typing);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    }

    window.addEventListener('message', (event) => {
      const message = event.data;
      switch (message.type) {
        case 'addMessage':
          setLoading(false);
          addMessageToUI(message.message);
          break;
        case 'clearMessages':
          messagesEl.innerHTML = '<div class="message system">Chat cleared. How can I help you?</div>';
          break;
        case 'error':
          setLoading(false);
          addMessageToUI({ role: 'system', content: 'Error: ' + message.error });
          break;
      }
    });
  </script>
</body>
</html>`;
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  private async handleMessage(message: { type: string; [key: string]: unknown }): Promise<void> {
    switch (message.type) {
      case 'chat':
        try {
          const userMessage = message.message as string;
          this.addMessage({ role: 'user', content: userMessage });

          const response = await this.chatHandler(userMessage);
          this.addMessage({ role: 'assistant', content: response });
        } catch (error) {
          this.view?.webview.postMessage({
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
        break;
    }
  }
}
