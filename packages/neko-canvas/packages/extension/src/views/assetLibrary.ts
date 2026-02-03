/**
 * Asset Library Provider - Webview for asset management
 */
import * as vscode from 'vscode';
import type { Asset, AssetFilter, AssetChangeEvent } from '../api';

export class AssetLibraryProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'neko.assetLibrary';

  private view?: vscode.WebviewView;
  private assets: Asset[] = [];

  private readonly _onDidChangeAssets = new vscode.EventEmitter<AssetChangeEvent>();
  public readonly onDidChangeAssets = this._onDidChangeAssets.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      (message) => this.handleMessage(message),
      undefined,
      this.context.subscriptions
    );
  }

  // API Methods
  async importAsset(path: string): Promise<Asset> {
    const id = this.generateId();
    const name = path.split('/').pop() || 'Unknown';
    const type = this.getAssetType(path);

    const asset: Asset = {
      id,
      name,
      type,
      path,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.assets.push(asset);
    this._onDidChangeAssets.fire({ type: 'add', assetId: id });
    this.refreshView();

    return asset;
  }

  async listAssets(filter?: AssetFilter): Promise<Asset[]> {
    let result = [...this.assets];

    if (filter?.type) {
      result = result.filter((a) => a.type === filter.type);
    }

    if (filter?.tags && filter.tags.length > 0) {
      result = result.filter((a) =>
        filter.tags!.some((tag) => a.tags?.includes(tag))
      );
    }

    if (filter?.search) {
      const search = filter.search.toLowerCase();
      result = result.filter((a) =>
        a.name.toLowerCase().includes(search)
      );
    }

    return result;
  }

  async getAssetById(id: string): Promise<Asset | undefined> {
    return this.assets.find((a) => a.id === id);
  }

  async deleteAsset(id: string): Promise<void> {
    const index = this.assets.findIndex((a) => a.id === id);
    if (index !== -1) {
      this.assets.splice(index, 1);
      this._onDidChangeAssets.fire({ type: 'delete', assetId: id });
      this.refreshView();
    }
  }

  async updateAsset(id: string, updates: Partial<Asset>): Promise<void> {
    const asset = this.assets.find((a) => a.id === id);
    if (asset) {
      Object.assign(asset, updates, { updatedAt: Date.now() });
      this._onDidChangeAssets.fire({ type: 'update', assetId: id });
      this.refreshView();
    }
  }

  private refreshView(): void {
    this.view?.webview.postMessage({
      type: 'updateAssets',
      assets: this.assets,
    });
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data: blob:;">
  <title>Asset Library</title>
  <style>
    body {
      padding: 10px;
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
    }
    .search-box {
      width: 100%;
      padding: 6px 10px;
      margin-bottom: 10px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
    }
    .asset-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
      gap: 8px;
    }
    .asset-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 8px;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .asset-item:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .asset-icon {
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--vscode-editor-background);
      border-radius: 4px;
      margin-bottom: 4px;
    }
    .asset-name {
      font-size: 11px;
      text-align: center;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      width: 100%;
    }
    .empty-state {
      text-align: center;
      color: var(--vscode-descriptionForeground);
      padding: 40px 20px;
    }
    .import-btn {
      display: block;
      width: 100%;
      padding: 8px;
      margin-top: 10px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    .import-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }
  </style>
</head>
<body>
  <input type="text" class="search-box" placeholder="Search assets..." id="search">
  <div id="content" class="asset-grid"></div>
  <button class="import-btn" id="importBtn">Import Asset</button>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const content = document.getElementById('content');
    const searchInput = document.getElementById('search');
    const importBtn = document.getElementById('importBtn');

    let assets = [];

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'updateAssets') {
        assets = message.assets;
        renderAssets();
      }
    });

    searchInput.addEventListener('input', () => {
      renderAssets();
    });

    importBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'import' });
    });

    function renderAssets() {
      const search = searchInput.value.toLowerCase();
      const filtered = assets.filter(a =>
        a.name.toLowerCase().includes(search)
      );

      if (filtered.length === 0) {
        content.innerHTML = '<div class="empty-state">No assets found.<br>Import assets to get started.</div>';
        return;
      }

      content.innerHTML = filtered.map(asset => \`
        <div class="asset-item" data-id="\${asset.id}" draggable="true">
          <div class="asset-icon">\${getIcon(asset.type)}</div>
          <div class="asset-name">\${asset.name}</div>
        </div>
      \`).join('');

      // Add drag handlers
      document.querySelectorAll('.asset-item').forEach(item => {
        item.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', item.dataset.id);
        });
        item.addEventListener('click', () => {
          vscode.postMessage({ type: 'select', assetId: item.dataset.id });
        });
      });
    }

    function getIcon(type) {
      switch (type) {
        case 'video': return '🎬';
        case 'audio': return '🎵';
        case 'image': return '🖼️';
        case 'text': return '📄';
        default: return '📁';
      }
    }

    // Initial render
    renderAssets();
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

  private generateId(): string {
    return `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getAssetType(path: string): Asset['type'] {
    const ext = path.split('.').pop()?.toLowerCase() || '';
    if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(ext)) return 'audio';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
    if (['txt', 'md', 'json', 'srt', 'vtt'].includes(ext)) return 'text';
    return 'other';
  }

  private async handleMessage(message: { type: string; [key: string]: unknown }): Promise<void> {
    switch (message.type) {
      case 'import':
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: true,
          filters: {
            'Media Files': ['mp4', 'mov', 'avi', 'mp3', 'wav', 'png', 'jpg', 'gif'],
            'All Files': ['*'],
          },
        });
        if (uris) {
          for (const uri of uris) {
            await this.importAsset(uri.fsPath);
          }
        }
        break;
      case 'select':
        // Handle asset selection
        break;
    }
  }
}
