/**
 * Puppet Editor Provider - Custom editor for .nkp puppet project files
 *
 * Implements VSCode CustomEditorProvider to open Neko Puppet project files (.nkp)
 * with full read-write support and .moc3 source files in read-only mode.
 *
 * .nkp is a JSON project format that references an external .moc3 binary file
 * and persists parameter overrides and viewport state.
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { createProjectSnapshotPackage, injectLocaleAttribute } from '@neko/shared/vscode/extension';
import { Live2dBundleLoader } from '../live2d';
import { getLogger } from '../utils/logger';

const logger = getLogger('PuppetEditorProvider');

import { isNkpNativeProjectData, type NkpProjectData } from '@neko/shared';

/** Custom document for .nkp files */
class PuppetDocument implements vscode.CustomDocument {
  readonly uri: vscode.Uri;
  private _projectData: NkpProjectData | null = null;
  private readonly _isSourceFile: boolean;
  private _dirty = false;

  private readonly _onDidDispose = new vscode.EventEmitter<void>();
  readonly onDidDispose = this._onDidDispose.event;

  constructor(uri: vscode.Uri) {
    this.uri = uri;
    this._isSourceFile = uri.fsPath.toLowerCase().endsWith('.moc3');
  }

  get isSourceFile(): boolean {
    return this._isSourceFile;
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
  private _activeDocument: PuppetDocument | undefined;
  private enginePort: number | undefined;
  private activeParameterNames = new Set<string>();
  private readonly live2dBundleLoader = new Live2dBundleLoader();

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

    if (!doc.isSourceFile) {
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
    this._activeDocument = document;

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview')],
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
        this._activeDocument = undefined;
      }
    });
  }

  async saveCustomDocument(
    document: PuppetDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    if (document.isSourceFile || !document.projectData) return;
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
    if (document.isSourceFile) return;
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
        } else {
          webviewPanel.webview.postMessage({
            type: 'engineUnavailable',
            message: 'Neko Engine frame server is not available.',
          });
        }

        if (document.isSourceFile) {
          webviewPanel.webview.postMessage({
            type: 'loadPuppetSource',
            source: document.uri.fsPath,
          });
        } else if (document.projectData) {
          // .nkp project: resolve puppet source and load
          const srcPath = document.projectData.puppet.src;
          if (isNkpNativeProjectData(document.projectData)) {
            webviewPanel.webview.postMessage({
              type: 'loadNativePuppet',
              project: document.projectData,
            });
          } else if (srcPath) {
            await this.loadMoc3FromProject(document, webviewPanel);
          } else if (document.projectData.puppet.bundle) {
            await this.loadLive2dBundleFromProject(document, webviewPanel);
          } else {
            // No puppet source linked — webview shows import UI
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
        } else {
          webviewPanel.webview.postMessage({
            type: 'engineUnavailable',
            message: 'Neko Engine frame server is not available.',
          });
        }
        break;
      }

      case 'state:save': {
        // Persist parameter overrides from webview
        if (document.isSourceFile || !document.projectData) break;
        const params = message.parameters as Record<string, number> | undefined;
        if (params) {
          this.activeParameterNames = new Set(Object.keys(params));
          document.projectData.parameters = params;
          document.dirty = true;
          this._onDidChangeCustomDocument.fire({ document });
        }
        break;
      }

      case 'puppet:parametersLoaded': {
        const names = Array.isArray(message.parameters)
          ? message.parameters.filter((name): name is string => typeof name === 'string')
          : [];
        this.activeParameterNames = new Set(names);
        break;
      }

      case 'puppet:import': {
        // Open file dialog to select a new MOC3 source.
        if (document.isSourceFile) break;
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          filters: {
            [vscode.l10n.t('neko.puppet.import.filter')]: ['moc3', 'zip'],
          },
        });

        if (uris && uris[0] && document.projectData) {
          if (uris[0].fsPath.toLowerCase().endsWith('.zip')) {
            await this.importLive2dBundleIntoProject(document, webviewPanel, uris[0]);
            break;
          }

          // Compute relative path from .nkp to .moc3
          const nkpDir = path.dirname(document.uri.fsPath);
          const relativePath = path.relative(nkpDir, uris[0].fsPath).replace(/\\/g, '/');
          document.projectData.puppet.src = `./${relativePath}`;
          document.dirty = true;
          this._onDidChangeCustomDocument.fire({ document });

          // Load the selected MOC3
          await this.loadMoc3FromProject(document, webviewPanel);

          // Notify webview that puppet was imported
          webviewPanel.webview.postMessage({
            type: 'puppetImported',
            name: path.basename(uris[0].fsPath).replace(/\.moc3$/, ''),
          });
        }
        break;
      }

      case 'puppet:dropFile': {
        // Save dropped .moc3 file and load it.
        if (document.isSourceFile || !document.projectData) break;
        const fileName = message.name as string;
        if (!fileName.endsWith('.moc3')) break;
        const base64Data = message.data as string;
        const fileData = Buffer.from(base64Data, 'base64');

        // Write dropped file alongside .nkp
        const nkpDir2 = path.dirname(document.uri.fsPath);
        const dropUri = vscode.Uri.file(path.join(nkpDir2, fileName));
        await vscode.workspace.fs.writeFile(dropUri, fileData);

        // Update project reference
        document.projectData.puppet.src = `./${fileName}`;
        document.dirty = true;
        this._onDidChangeCustomDocument.fire({ document });

        // Load and notify
        await this.loadMoc3FromProject(document, webviewPanel);
        webviewPanel.webview.postMessage({
          type: 'puppetImported',
          name: path.basename(fileName).replace(/\.moc3$/, ''),
        });
        break;
      }

      case 'puppet:export': {
        const choice = await vscode.window.showQuickPick(
          [
            {
              label: '$(package) Model package',
              description: 'Export puppet model package',
              command: 'neko.puppet.exportModel',
            },
            {
              label: '$(run-all) Motion package',
              description: 'Export puppet motion package',
              command: 'neko.puppet.exportMotions',
            },
            {
              label: '$(settings-gear) Config package',
              description: 'Export puppet config package',
              command: 'neko.puppet.exportConfig',
            },
          ],
          { placeHolder: 'Select puppet export target' },
        );
        if (choice) {
          await vscode.commands.executeCommand(choice.command, document.uri);
        }
        break;
      }

      case 'project:package': {
        await createProjectSnapshotPackage({
          packageId: 'neko-puppet',
          title: 'Package Puppet Project',
          sourceUri: document.uri,
          sourceBytes: document.projectData
            ? Buffer.from(JSON.stringify(document.projectData, null, 2), 'utf-8')
            : undefined,
          metadata: {
            kind: 'puppet',
            viewType: PuppetEditorProvider.viewType,
          },
        });
        break;
      }

      default:
        break;
    }
  }

  /**
   * Resolve a MOC3 source path from .nkp project and let the webview load it.
   */
  private async loadMoc3FromProject(
    document: PuppetDocument,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    const srcPath = document.projectData?.puppet.src;
    if (!srcPath) return;

    try {
      const nkpDir = path.dirname(document.uri.fsPath);
      const moc3AbsPath = path.resolve(nkpDir, srcPath);
      webviewPanel.webview.postMessage({ type: 'loadPuppetSource', source: moc3AbsPath });
    } catch (err) {
      logger.error(`Failed to read .moc3 from project: ${err}`);
    }
  }

  private async loadLive2dBundleFromProject(
    document: PuppetDocument,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    const bundlePath = document.projectData?.puppet.bundle?.path;
    if (!bundlePath) return;

    try {
      const nkpDir = path.dirname(document.uri.fsPath);
      const bundleAbsPath = path.resolve(nkpDir, bundlePath);
      const bundleBytes = await vscode.workspace.fs.readFile(vscode.Uri.file(bundleAbsPath));
      const loaded = this.live2dBundleLoader.loadLive2dBundle(bundlePath, bundleBytes);
      document.projectData.puppet.bundle = loaded.projectData.puppet.bundle;
      document.projectData.bundleIndex = loaded.projectData.bundleIndex;
      webviewPanel.webview.postMessage({
        type: 'loadPuppet',
        data: loaded.runtime.mocData,
        textures: loaded.runtime.textures,
        auxiliary: loaded.runtime.auxiliary,
      });
    } catch (err) {
      logger.error(`Failed to load Live2D bundle from project: ${err}`);
      webviewPanel.webview.postMessage({
        type: 'engineUnavailable',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async importLive2dBundleIntoProject(
    document: PuppetDocument,
    webviewPanel: vscode.WebviewPanel,
    bundleUri: vscode.Uri,
  ): Promise<void> {
    const bundleBytes = await vscode.workspace.fs.readFile(bundleUri);
    const nkpDir = path.dirname(document.uri.fsPath);
    const relativePath = './' + path.relative(nkpDir, bundleUri.fsPath).replace(/\\/g, '/');
    const loaded = this.live2dBundleLoader.loadLive2dBundle(relativePath, bundleBytes);

    document.projectData = {
      ...document.projectData!,
      puppet: loaded.projectData.puppet,
      bundleIndex: loaded.projectData.bundleIndex,
    };
    document.dirty = true;
    this._onDidChangeCustomDocument.fire({ document });

    webviewPanel.webview.postMessage({
      type: 'loadPuppet',
      data: loaded.runtime.mocData,
      textures: loaded.runtime.textures,
      auxiliary: loaded.runtime.auxiliary,
    });
    webviewPanel.webview.postMessage({
      type: 'puppetImported',
      name: path.basename(bundleUri.fsPath).replace(/\.zip$/i, ''),
    });
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const webviewUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
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

  // ---------------------------------------------------------------------------
  // Public API (NekoPuppetAPI)
  // ---------------------------------------------------------------------------

  /** Get current face parameters from the active puppet document */
  getCurrentFaceParams(): Record<string, number> {
    return this._activeDocument?.projectData?.parameters ?? {};
  }

  /** Get parameter names reported by the active puppet renderer */
  getAvailableFaceParamNames(): string[] {
    if (this.activeParameterNames.size > 0) return [...this.activeParameterNames];
    return Object.keys(this.getCurrentFaceParams());
  }

  /** Set face parameters on the active puppet document and sync to webview */
  async setFaceParams(
    params: Record<string, number>,
    options: { persist?: boolean } = {},
  ): Promise<void> {
    if (!this._activeDocument?.projectData) return;
    const nextParameters = {
      ...this._activeDocument.projectData.parameters,
      ...params,
    };
    if (options.persist !== false) {
      this._activeDocument.projectData.parameters = nextParameters;
      this._activeDocument.dirty = true;
    }
    // Sync to webview
    this.activeWebviewPanel?.webview.postMessage({
      type: 'loadState',
      parameters: nextParameters,
    });
  }
}
