/**
 * Property Panel Provider - Webview for element properties
 */
import * as vscode from 'vscode';

export class PropertyPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'neko.propertyPanel';

  private view?: vscode.WebviewView;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
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
   * Update the property panel with selected element data
   */
  updateSelectedElement(element: unknown): void {
    this.view?.webview.postMessage({
      type: 'updateElement',
      element,
    });
  }

  /**
   * Clear the property panel
   */
  clearSelection(): void {
    this.view?.webview.postMessage({
      type: 'clearSelection',
    });
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Properties</title>
  <style>
    body {
      padding: 10px;
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    .empty-state {
      text-align: center;
      color: var(--vscode-descriptionForeground);
      padding: 20px;
    }
    .property-group {
      margin-bottom: 16px;
    }
    .property-group-title {
      font-weight: bold;
      margin-bottom: 8px;
      color: var(--vscode-foreground);
    }
    .property-row {
      display: flex;
      align-items: center;
      margin-bottom: 4px;
    }
    .property-label {
      flex: 0 0 80px;
      color: var(--vscode-descriptionForeground);
    }
    .property-value {
      flex: 1;
    }
    input, select {
      width: 100%;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      padding: 4px 8px;
      border-radius: 2px;
    }
  </style>
</head>
<body>
  <div id="content">
    <div class="empty-state">Select an element to view properties</div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const content = document.getElementById('content');

    window.addEventListener('message', (event) => {
      const message = event.data;
      switch (message.type) {
        case 'updateElement':
          renderElement(message.element);
          break;
        case 'clearSelection':
          content.innerHTML = '<div class="empty-state">Select an element to view properties</div>';
          break;
      }
    });

    function renderElement(element) {
      if (!element) {
        content.innerHTML = '<div class="empty-state">Select an element to view properties</div>';
        return;
      }

      content.innerHTML = \`
        <div class="property-group">
          <div class="property-group-title">Basic</div>
          <div class="property-row">
            <span class="property-label">Type</span>
            <span class="property-value">\${element.type || 'Unknown'}</span>
          </div>
          <div class="property-row">
            <span class="property-label">ID</span>
            <span class="property-value">\${element.id || 'N/A'}</span>
          </div>
        </div>
        <div class="property-group">
          <div class="property-group-title">Timing</div>
          <div class="property-row">
            <span class="property-label">Start</span>
            <input type="number" value="\${element.startTime || 0}" step="0.1">
          </div>
          <div class="property-row">
            <span class="property-label">Duration</span>
            <input type="number" value="\${element.duration || 0}" step="0.1">
          </div>
        </div>
      \`;
    }
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

  private handleMessage(message: { type: string; [key: string]: unknown }): void {
    switch (message.type) {
      case 'updateProperty':
        // Forward property updates to the video editor
        vscode.commands.executeCommand('neko.element.update', {
          id: message.elementId,
          updates: message.updates,
        });
        break;
    }
  }
}
