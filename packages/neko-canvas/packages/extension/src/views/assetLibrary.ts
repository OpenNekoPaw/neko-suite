/**
 * Asset Library Provider - Webview for asset management
 *
 * Delegates to neko-assets via internal commands for storage/search.
 * Uses the unified AssetDragData protocol from @neko/shared.
 */
import * as vscode from 'vscode';
import { detectMediaType, ASSET_DRAG_MIME } from '@neko/shared';
import type { AssetEntity, AssetVariant, SingleAssetDragData } from '@neko/shared';
import { injectLocaleAttribute } from '@neko/shared/vscode/extension';
import { handleError } from '../utils/errorHandler';

export class AssetLibraryProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'neko.assetLibrary';

  private view?: vscode.WebviewView;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
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
      this.context.subscriptions,
    );

    // Load initial data
    this.refreshView();
  }

  // =========================================================================
  // Data Access (via neko-assets commands)
  // =========================================================================

  private async getAllEntities(): Promise<AssetEntity[]> {
    try {
      const entities = await vscode.commands.executeCommand<AssetEntity[]>(
        'neko.assets.getAllEntities',
      );
      return entities ?? [];
    } catch {
      return [];
    }
  }

  private async importFile(filePath: string): Promise<void> {
    try {
      await vscode.commands.executeCommand('neko.assets.importFile', vscode.Uri.file(filePath));
      await this.refreshView();
    } catch (error) {
      await handleError(error, { showToUser: true });
    }
  }

  // =========================================================================
  // View
  // =========================================================================

  async refreshView(): Promise<void> {
    if (!this.view) return;
    const entities = await this.getAllEntities();

    // Flatten to simple items for the webview
    const items = entities.flatMap((entity) =>
      entity.variants.map((variant) => ({
        entityId: entity.id,
        variantId: variant.id,
        entityName: entity.name,
        variantName: variant.name,
        category: entity.category,
        mediaType: variant.files[0]?.mediaType ?? 'image',
        filePath: variant.files[0]?.path ?? '',
        fileName: variant.files[0]?.name ?? entity.name,
        tags: entity.tags,
      })),
    );

    this.view.webview.postMessage({ type: 'updateAssets', items });
  }

  // =========================================================================
  // HTML
  // =========================================================================

  private getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html ${injectLocaleAttribute()}>
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
      font-size: 24px;
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

    let items = [];

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'updateAssets') {
        items = message.items;
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
      const filtered = items.filter(a =>
        a.entityName.toLowerCase().includes(search) ||
        a.variantName.toLowerCase().includes(search) ||
        (a.tags || []).some(t => t.toLowerCase().includes(search))
      );

      if (filtered.length === 0) {
        content.innerHTML = '<div class="empty-state">No assets found.<br>Import assets to get started.</div>';
        return;
      }

      content.innerHTML = filtered.map(item => \`
        <div class="asset-item"
             data-entity-id="\${item.entityId}"
             data-variant-id="\${item.variantId}"
             data-drag='\${JSON.stringify(item)}'
             draggable="true">
          <div class="asset-icon">\${getIcon(item.mediaType)}</div>
          <div class="asset-name">\${item.entityName}</div>
        </div>
      \`).join('');

      // Add drag handlers — use unified AssetDragData protocol
      document.querySelectorAll('.asset-item').forEach(el => {
        el.addEventListener('dragstart', (e) => {
          const data = JSON.parse(el.dataset.drag);
          const dragData = {
            type: 'asset',
            entityId: data.entityId,
            variantId: data.variantId,
            entityName: data.entityName,
            variantName: data.variantName,
            category: data.category,
            files: [{
              path: data.filePath,
              name: data.fileName,
              mediaType: data.mediaType,
            }],
          };
          e.dataTransfer.setData('${ASSET_DRAG_MIME}', JSON.stringify(dragData));
          e.dataTransfer.effectAllowed = 'copyMove';
        });
        el.addEventListener('click', () => {
          vscode.postMessage({
            type: 'select',
            entityId: el.dataset.entityId,
            variantId: el.dataset.variantId,
          });
        });
      });
    }

    function getIcon(mediaType) {
      switch (mediaType) {
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

  private async handleMessage(message: { type: string; [key: string]: unknown }): Promise<void> {
    switch (message.type) {
      case 'import': {
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: true,
          filters: {
            'Media Files': [
              'mp4',
              'mov',
              'avi',
              'mkv',
              'webm',
              'mp3',
              'wav',
              'ogg',
              'flac',
              'aac',
              'png',
              'jpg',
              'jpeg',
              'gif',
              'webp',
            ],
            'All Files': ['*'],
          },
        });
        if (uris) {
          for (const uri of uris) {
            await this.importFile(uri.fsPath);
          }
        }
        break;
      }
      case 'select':
        // Handle asset selection — could open preview or show properties
        break;
    }
  }
}
