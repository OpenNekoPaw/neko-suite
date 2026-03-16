/**
 * Puppet Editor Provider - Custom editor for .nkp puppet project files
 *
 * Implements VSCode CustomEditorProvider to open Neko Puppet project files (.nkp)
 * with full read-write support. Also supports read-only opening of .inp files.
 *
 * .nkp is a JSON project format that references an external .inp binary file
 * and persists parameter overrides and viewport state.
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { injectLocaleAttribute } from '@neko/shared/vscode/extension';
import { getLogger } from '../utils/logger';

const logger = getLogger('PuppetEditorProvider');

/** Parsed .nkp project data */
interface NkpProjectData {
  version: string;
  name: string;
  puppet: { src: string | null };
  parameters: Record<string, number>;
  viewport: { zoom: number };
}

/** Custom document for .nkp files */
class PuppetDocument implements vscode.CustomDocument {
  readonly uri: vscode.Uri;
  private _projectData: NkpProjectData | null = null;
  private _isInpFile: boolean;
  private _dirty = false;

  private readonly _onDidDispose = new vscode.EventEmitter<void>();
  readonly onDidDispose = this._onDidDispose.event;

  constructor(uri: vscode.Uri) {
    this.uri = uri;
    this._isInpFile = uri.fsPath.endsWith('.inp');
  }

  get isInpFile(): boolean {
    return this._isInpFile;
  }

  get projectData(): NkpProjectData | null {
    return this._projectData;
  }

  set projectData(data: NkpProjectData | null) {
    this._projectData = data;
  }

  get dirty(): boolean {
    return this._dirty;
  }

  set dirty(value: boolean) {
    this._dirty = value;
  }

  dispose(): void {
    this._onDidDispose.fire();
    this._onDidDispose.dispose();
  }
}

export class PuppetEditorProvider implements vscode.CustomEditorProvider<PuppetDocument> {
  public static readonly viewType = 'neko.puppetEditor';

  private activeWebviewPanel: vscode.WebviewPanel | undefined;
  private enginePort: number | undefined;

  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<
    vscode.CustomDocumentContentChangeEvent<PuppetDocument>
  >();
  readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken,
  ): Promise<PuppetDocument> {
    const doc = new PuppetDocument(uri);

    if (!doc.isInpFile) {
      // Parse .nkp JSON
      try {
        const fileData = await vscode.workspace.fs.readFile(uri);
        const json = Buffer.from(fileData).toString('utf-8');
        doc.projectData = JSON.parse(json) as NkpProjectData;
      } catch (err) {
        logger.error(`Failed to parse .nkp file: ${err}`);
      }
    }

    return doc;
  }

  async resolveCustomEditor(
    document: PuppetDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    this.activeWebviewPanel = webviewPanel;

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'puppet-webview'),
      ],
    };

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    webviewPanel.webview.onDidReceiveMessage(
      (msg) => this.handleWebviewMessage(msg, webviewPanel, document),
      undefined,
      this.context.subscriptions,
    );

    webviewPanel.onDidDispose(() => {
      if (this.activeWebviewPanel === webviewPanel) {
        this.activeWebviewPanel = undefined;
      }
    });
  }

  async saveCustomDocument(
    document: PuppetDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    if (document.isInpFile || !document.projectData) return;
    const json = JSON.stringify(document.projectData, null, 2);
    await vscode.workspace.fs.writeFile(document.uri, Buffer.from(json, 'utf-8'));
    document.dirty = false;
  }

  async saveCustomDocumentAs(
    document: PuppetDocument,
    destination: vscode.Uri,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    if (!document.projectData) return;
    const json = JSON.stringify(document.projectData, null, 2);
    await vscode.workspace.fs.writeFile(destination, Buffer.from(json, 'utf-8'));
  }

  async revertCustomDocument(
    document: PuppetDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    if (document.isInpFile) return;
    try {
      const fileData = await vscode.workspace.fs.readFile(document.uri);
      const json = Buffer.from(fileData).toString('utf-8');
      document.projectData = JSON.parse(json) as NkpProjectData;
      document.dirty = false;

      // Notify webview of restored state
      if (this.activeWebviewPanel && document.projectData) {
        this.activeWebviewPanel.webview.postMessage({
          type: 'loadState',
          parameters: document.projectData.parameters,
        });
      }
    } catch (err) {
      logger.error(`Failed to revert .nkp file: ${err}`);
    }
  }

  async backupCustomDocument(
    document: PuppetDocument,
    context: vscode.CustomDocumentBackupContext,
    _cancellation: vscode.CancellationToken,
  ): Promise<vscode.CustomDocumentBackup> {
    if (document.projectData) {
      const json = JSON.stringify(document.projectData, null, 2);
      await vscode.workspace.fs.writeFile(context.destination, Buffer.from(json, 'utf-8'));
    }
    return {
      id: context.destination.toString(),
      delete: async () => {
        try {
          await vscode.workspace.fs.delete(context.destination);
        } catch {
          // Backup already cleaned up
        }
      },
    };
  }

  /**
   * Ensure engine port is discovered via neko-engine command.
   * Falls back gracefully — puppet webview shows static data without engine.
   */
  private async ensureEnginePort(): Promise<number | undefined> {
    if (this.enginePort) {
      return this.enginePort;
    }

    try {
      const result = await vscode.commands.executeCommand<{ port: number }>(
        'neko.engine.ensureFrameServer',
      );
      if (result) {
        this.enginePort = result.port;
      }
    } catch {
      // Engine extension not installed or not running
    }

    return this.enginePort;
  }

  private async handleWebviewMessage(
    message: { type: string; [key: string]: unknown },
    webviewPanel: vscode.WebviewPanel,
    document: PuppetDocument,
  ): Promise<void> {
    switch (message.type) {
      case 'ready': {
        // Send engine port first if available
        const port = await this.ensureEnginePort();
        if (port) {
          webviewPanel.webview.postMessage({ type: 'enginePort', port });
        }

        if (document.isInpFile) {
          // Read-only .inp: send binary directly
          try {
            const fileData = await vscode.workspace.fs.readFile(document.uri);
            const base64 = Buffer.from(fileData).toString('base64');
            webviewPanel.webview.postMessage({ type: 'loadPuppet', data: base64 });
          } catch (err) {
            logger.error(`Failed to read puppet file: ${err}`);
          }
        } else if (document.projectData) {
          // .nkp project: resolve .inp src and load
          const srcPath = document.projectData.puppet.src;
          if (srcPath) {
            await this.loadInpFromProject(document, webviewPanel);
          } else {
            // No .inp linked — webview shows import UI
            webviewPanel.webview.postMessage({ type: 'noPuppetSource' });
          }

          // Always send saved parameter state
          webviewPanel.webview.postMessage({
            type: 'loadState',
            parameters: document.projectData.parameters,
          });
        }
        break;
      }

      case 'requestEnginePort': {
        const port = await this.ensureEnginePort();
        if (port) {
          webviewPanel.webview.postMessage({ type: 'enginePort', port });
        }
        break;
      }

      case 'state:save': {
        // Persist parameter overrides from webview
        if (document.isInpFile || !document.projectData) break;
        const params = message.parameters as Record<string, number> | undefined;
        if (params) {
          document.projectData.parameters = params;
          document.dirty = true;
          this._onDidChangeCustomDocument.fire({ document });
        }
        break;
      }

      case 'puppet:import': {
        // Open file dialog to select .inp file
        if (document.isInpFile) break;
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          filters: {
            [vscode.l10n.t('neko.puppet.import.filter')]: ['inp'],
          },
        });

        if (uris && uris[0] && document.projectData) {
          // Compute relative path from .nkp to .inp
          const nkpDir = path.dirname(document.uri.fsPath);
          const relativePath = path.relative(nkpDir, uris[0].fsPath).replace(/\\/g, '/');
          document.projectData.puppet.src = `./${relativePath}`;
          document.dirty = true;
          this._onDidChangeCustomDocument.fire({ document });

          // Load the selected .inp
          await this.loadInpFromProject(document, webviewPanel);

          // Notify webview that puppet was imported
          webviewPanel.webview.postMessage({
            type: 'puppetImported',
            name: path.basename(uris[0].fsPath, '.inp'),
          });
        }
        break;
      }

      default:
        break;
    }
  }

  /**
   * Resolve .inp path from .nkp project and send binary to webview.
   */
  private async loadInpFromProject(
    document: PuppetDocument,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    const srcPath = document.projectData?.puppet.src;
    if (!srcPath) return;

    try {
      const nkpDir = path.dirname(document.uri.fsPath);
      const inpAbsPath = path.resolve(nkpDir, srcPath);
      const inpUri = vscode.Uri.file(inpAbsPath);
      const fileData = await vscode.workspace.fs.readFile(inpUri);
      const base64 = Buffer.from(fileData).toString('base64');
      webviewPanel.webview.postMessage({ type: 'loadPuppet', data: base64 });
    } catch (err) {
      logger.error(`Failed to read .inp from project: ${err}`);
    }
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const webviewUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'puppet-webview'),
    );
    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html ${injectLocaleAttribute()}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${webview.cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';
             img-src ${webview.cspSource} data: blob:;
             font-src ${webview.cspSource};
             connect-src ws://127.0.0.1:* http://127.0.0.1:*;">
  <link rel="stylesheet" href="${webviewUri}/assets/index.css">
  <title>Puppet Editor</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" type="module" src="${webviewUri}/assets/index.js"></script>
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
}
