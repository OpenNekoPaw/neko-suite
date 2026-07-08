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
import {
  createDefaultProjectFormatCodecRegistry,
  handleProjectSourceAddHostRequest,
  handleProjectSourceAddRequest,
  ingestProjectSourceAddRequest,
  nkpSourcePathPolicy,
  postProjectSourceAddResult,
  ProjectFileStore,
  type ProjectSourceAddRequest,
  type ProjectSourceAddResult,
} from '@neko/shared';
import {
  createProjectSnapshotPackage,
  createVSCodeProjectFileIoAdapter,
  formatProjectFileDiagnostics,
  injectLocaleAttribute,
  normalizeVSCodeProjectSourceAddRequest,
  ProjectFileSaveSession,
} from '@neko/shared/vscode/extension';
import { Live2dBundleLoader } from '../live2d';
import { getLogger } from '../utils/logger';

const logger = getLogger('PuppetEditorProvider');

import {
  isNkpNativeProjectData,
  type NkpProjectData,
  type NkpPuppetRuntimeAdapterReference,
} from '@neko/shared';

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
  private readonly projectFileAdapter = createVSCodeProjectFileIoAdapter({ vscodeApi: vscode });
  private readonly projectFileStore = new ProjectFileStore({
    registry: createDefaultProjectFormatCodecRegistry(),
    fileOps: this.projectFileAdapter.fileOps,
    logger,
  });
  private readonly projectFileSession = new ProjectFileSaveSession<NkpProjectData>({
    formatId: 'nkp',
    store: this.projectFileStore,
    sourcePolicy: nkpSourcePathPolicy,
    createSourcePolicyOptions: (uri) => this.createSourcePolicyOptions(uri),
    logger,
  });

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
      const result = await this.projectFileStore.load<NkpProjectData>({
        filePath: uri.fsPath,
        formatId: 'nkp',
        sourcePolicy: nkpSourcePathPolicy,
        sourcePolicyOptions: this.createSourcePolicyOptions(uri),
      });
      if (result.document) {
        doc.projectData = result.document;
      } else {
        logger.error(
          formatProjectFileDiagnostics(result.diagnostics, 'Failed to load .nkp project'),
        );
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
    await this.projectFileSession.save({
      targetUri: document.uri,
      document: document.projectData,
      saveReason: 'vscode-save',
      defaultMessage: 'Failed to save .nkp file',
    });
    document.dirty = false;
  }

  async saveCustomDocumentAs(
    document: PuppetDocument,
    destination: vscode.Uri,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    if (!document.projectData) return;
    await this.projectFileSession.save({
      targetUri: destination,
      document: document.projectData,
      saveReason: 'save-as',
      defaultMessage: 'Failed to save .nkp file as target',
      useSaveAs: true,
    });
    document.dirty = false;
  }

  async revertCustomDocument(
    document: PuppetDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    if (document.isSourceFile) return;
    const result = await this.projectFileStore.revert<NkpProjectData>({
      filePath: document.uri.fsPath,
      formatId: 'nkp',
      sourcePolicy: nkpSourcePathPolicy,
      sourcePolicyOptions: this.createSourcePolicyOptions(document.uri),
    });
    if (!result.document || !result.ok) {
      throw new Error(
        formatProjectFileDiagnostics(result.diagnostics, 'Failed to revert .nkp file'),
      );
    }
    document.projectData = result.document;
    document.dirty = false;

    // Notify webview of restored state
    if (this.activeWebviewPanel) {
      this.activeWebviewPanel.webview.postMessage({
        type: 'loadState',
        parameters: document.projectData.parameters,
      });
    }
  }

  async backupCustomDocument(
    document: PuppetDocument,
    context: vscode.CustomDocumentBackupContext,
    _cancellation: vscode.CancellationToken,
  ): Promise<vscode.CustomDocumentBackup> {
    if (document.projectData) {
      await this.projectFileSession.backup({
        documentUri: document.uri,
        backupUri: context.destination,
        document: document.projectData,
        defaultMessage: 'Failed to backup .nkp file',
      });
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
        webviewPanel.webview.postMessage({
          type: 'documentContext',
          context: this.createDocumentContext(document),
        });

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

      case 'project:addSource': {
        await this.handlePuppetProjectAddSource(
          (message as { request?: ProjectSourceAddRequest }).request,
          document,
          webviewPanel,
        );
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
    requestId?: string,
  ): Promise<ProjectSourceAddResult> {
    const fileName = path.basename(bundleUri.fsPath);
    const sourceResult = await this.acquirePuppetProjectSource({
      request: this.createPuppetProjectSourceAddRequest({
        documentUri: document.uri,
        sourcePath: bundleUri.fsPath,
        fileName,
        role: 'bundle',
        kind: 'file-picker',
        caller: 'neko-puppet.import-live2d-bundle-editor',
        requestId:
          requestId ?? `puppet-bundle-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      }),
      defaultFileName: fileName,
      unmanagedSourceMessage:
        'Live2D bundle must be moved into the project, asset library, or a configured media root before saving.',
    });
    if (!sourceResult.ok || !sourceResult.durablePath) {
      throw new Error(
        sourceResult.diagnostics[0]?.message ?? `Unable to add puppet bundle: ${fileName}`,
      );
    }
    const bundleBytes = await vscode.workspace.fs.readFile(bundleUri);
    const loaded = this.live2dBundleLoader.loadLive2dBundle(sourceResult.durablePath, bundleBytes);

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
    return sourceResult;
  }

  private async handlePuppetProjectAddSource(
    request: ProjectSourceAddRequest | undefined,
    document: PuppetDocument,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    if (!request) return;
    if (this.isPuppetFilePickerSourceAddRequest(request)) {
      await this.handlePuppetFilePickerSourceAdd(request, document, webviewPanel);
      return;
    }
    await handleProjectSourceAddHostRequest(request, {
      addSource: (sourceRequest) =>
        this.addPuppetProjectSource(
          normalizeVSCodeProjectSourceAddRequest(sourceRequest),
          document,
          webviewPanel,
        ),
      postMessage: (message) => webviewPanel.webview.postMessage(message),
      logger,
    });
  }

  private isPuppetFilePickerSourceAddRequest(request: ProjectSourceAddRequest): boolean {
    return (
      request.kind === 'file-picker' &&
      request.formatId === 'nkp' &&
      !request.sourcePath &&
      !request.sourceUri &&
      !request.bytes &&
      !request.generatedAssetId
    );
  }

  private async handlePuppetFilePickerSourceAdd(
    request: ProjectSourceAddRequest,
    document: PuppetDocument,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    if (document.isSourceFile) {
      await handleProjectSourceAddHostRequest(request, {
        addSource: async () => ({
          requestId: request.requestId,
          ok: false,
          diagnostics: [
            {
              code: 'invalid-document',
              severity: 'error',
              message: 'Puppet source files cannot import another puppet source.',
              recoverability: 'manual',
            },
          ],
        }),
        postMessage: (message) => webviewPanel.webview.postMessage(message),
        logger,
      });
      return;
    }

    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        [vscode.l10n.t('neko.puppet.import.filter')]: ['moc3', 'zip'],
      },
    });
    const uri = uris?.[0];
    if (!uri) {
      await handleProjectSourceAddHostRequest(request, {
        addSource: async () => ({
          requestId: request.requestId,
          ok: false,
          diagnostics: [
            {
              code: 'add-source-cancelled',
              severity: 'info',
              message: 'Puppet source selection was cancelled.',
              recoverability: 'none',
            },
          ],
        }),
        postMessage: (message) => webviewPanel.webview.postMessage(message),
        logger,
      });
      return;
    }

    if (uri.fsPath.toLowerCase().endsWith('.zip')) {
      try {
        const sourceResult = await this.importLive2dBundleIntoProject(
          document,
          webviewPanel,
          uri,
          request.requestId,
        );
        await postProjectSourceAddResult(sourceResult, {
          postMessage: (message) => webviewPanel.webview.postMessage(message),
          logger,
        });
      } catch (error) {
        await webviewPanel.webview.postMessage({
          type: 'project:sourceRejected',
          result: {
            requestId: request.requestId,
            ok: false,
            diagnostics: [
              {
                code: 'add-source-failed',
                severity: 'error',
                message: error instanceof Error ? error.message : String(error),
                recoverability: 'manual',
              },
            ],
          },
        });
      }
      return;
    }

    await this.handlePuppetProjectAddSource(
      this.createPuppetProjectSourceAddRequest({
        documentUri: document.uri,
        sourcePath: uri.fsPath,
        fileName: path.basename(uri.fsPath),
        role: 'puppet',
        kind: 'file-picker',
        caller: request.caller ?? 'neko-puppet.project-add-source',
        requestId: request.requestId,
      }),
      document,
      webviewPanel,
    );
  }

  private async addPuppetProjectSource(
    request: ProjectSourceAddRequest,
    document: PuppetDocument,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<ProjectSourceAddResult> {
    if (document.isSourceFile || !document.projectData) {
      return {
        requestId: request.requestId,
        ok: false,
        diagnostics: [
          {
            code: 'invalid-document',
            severity: 'error',
            message: 'No .nkp project is loaded for puppet source add.',
            recoverability: 'manual',
          },
        ],
      };
    }

    const fileName = readPuppetSourceAddFileName(request);
    if (!fileName.toLowerCase().endsWith('.moc3')) {
      return {
        requestId: request.requestId,
        ok: false,
        diagnostics: [
          {
            code: 'invalid-document',
            severity: 'error',
            message: `Unsupported puppet source: ${fileName}`,
            recoverability: 'manual',
          },
        ],
      };
    }

    const result = await this.acquirePuppetProjectSource({
      request,
      documentUri: document.uri,
      defaultFileName: 'puppet.moc3',
      unmanagedSourceMessage:
        'MOC3 source must be moved into the project, asset library, or a configured media root before saving.',
    });
    if (!result.ok || !result.durablePath) {
      return result;
    }

    document.projectData.puppet.src = result.durablePath;
    document.dirty = true;
    this._onDidChangeCustomDocument.fire({ document });

    await this.loadMoc3FromProject(document, webviewPanel);
    webviewPanel.webview.postMessage({
      type: 'puppetImported',
      name: path.basename(fileName).replace(/\.moc3$/i, ''),
    });
    return result;
  }

  private createPuppetProjectSourceAddRequest(input: {
    readonly documentUri: vscode.Uri;
    readonly sourcePath: string;
    readonly fileName: string;
    readonly role: 'puppet' | 'bundle';
    readonly kind: ProjectSourceAddRequest['kind'];
    readonly caller: string;
    readonly requestId: string;
  }): ProjectSourceAddRequest {
    return {
      requestId: input.requestId,
      kind: input.kind,
      formatId: 'nkp',
      documentUri: input.documentUri.toString(),
      sourcePath: input.sourcePath,
      browserFile: { name: input.fileName },
      target: { role: input.role },
      destination: { kind: 'project', directory: '.', copyMode: 'link' },
      ingestMode: 'link',
      caller: input.caller,
      metadata: { puppetAdd: true, name: input.fileName },
    };
  }

  private async acquirePuppetProjectSource(input: {
    readonly request: ProjectSourceAddRequest;
    readonly documentUri?: vscode.Uri;
    readonly defaultFileName: string;
    readonly unmanagedSourceMessage: string;
  }): Promise<ProjectSourceAddResult> {
    const request = input.request;
    const fileName = readPuppetSourceAddFileName(request);
    const documentUri =
      input.documentUri ??
      (request.documentUri ? vscode.Uri.parse(request.documentUri) : undefined);
    if (!documentUri) {
      return {
        requestId: request.requestId,
        ok: false,
        diagnostics: [
          {
            code: 'invalid-document',
            severity: 'error',
            message: 'No .nkp document URI is available for puppet source add.',
            recoverability: 'manual',
          },
        ],
      };
    }

    return await handleProjectSourceAddRequest(
      {
        ...request,
        caller: request.caller ?? 'neko-puppet.project-add-source',
        target: request.target ?? { role: 'puppet' },
        destination: {
          kind: 'project',
          directory: request.destination.directory ?? '.',
          copyMode: request.destination.copyMode ?? (request.bytes ? 'copy' : 'link'),
        },
        metadata: {
          ...(request.metadata ?? {}),
          puppetAdd: true,
          name: fileName,
        },
      },
      {
        ingest: (ingestRequest) =>
          ingestProjectSourceAddRequest(ingestRequest, {
            documentPath: documentUri.fsPath,
            assetDirectory: request.destination.directory ?? '.',
            workspaceContext: this.createSourcePolicyOptions(documentUri).context,
            fileOps: this.createPuppetSourceAssetFileOps(),
            defaultFileName: input.defaultFileName,
            unmanagedSourceMessage: input.unmanagedSourceMessage,
          }),
      },
    );
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

  private createSourcePolicyOptions(
    uri: vscode.Uri,
  ): Parameters<ProjectFileStore['save']>[0]['sourcePolicyOptions'] {
    const documentDir = path.dirname(uri.fsPath);
    const context = this.projectFileAdapter.createWorkspaceMediaPathContext({
      documentUri: uri,
      pathVariables: new Map([['PROJECT', documentDir]]),
      allowedRoots: [
        documentDir,
        ...(vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),
      ],
    });
    const pathVariables = new Map(context.pathVariables ?? []);
    pathVariables.set('PROJECT', documentDir);
    return {
      context: {
        ...context,
        owningWorkspaceRoot: context.owningWorkspaceRoot ?? documentDir,
        documentDir,
        pathVariables,
      },
    };
  }

  private createPuppetSourceAssetFileOps() {
    return {
      createDirectory: async (dirPath: string) =>
        vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath)),
      fileExists: async (filePath: string) => {
        try {
          await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
          return true;
        } catch {
          return false;
        }
      },
      writeFile: async (filePath: string, content: Uint8Array) =>
        vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), content),
    };
  }

  private createDocumentContext(document: PuppetDocument): {
    readonly owner: 'neko-puppet';
    readonly documentKind: 'nkp' | 'moc3';
    readonly profile: 'live2d' | 'neko-puppet';
    readonly runtimeAdapter?: NkpPuppetRuntimeAdapterReference;
  } {
    if (document.isSourceFile) {
      return {
        owner: 'neko-puppet',
        documentKind: 'moc3',
        profile: 'live2d',
        runtimeAdapter: {
          id: 'live2d-moc3-compat',
          version: 'clean-room',
        },
      };
    }

    const runtimeAdapter = document.projectData?.puppet.runtimeAdapter;
    return {
      owner: 'neko-puppet',
      documentKind: 'nkp',
      profile: isNkpNativeProjectData(document.projectData) ? 'neko-puppet' : 'live2d',
      ...(runtimeAdapter ? { runtimeAdapter } : {}),
    };
  }

  // ---------------------------------------------------------------------------
  // Public API (NekoPuppetAPI)
  // ---------------------------------------------------------------------------

  /** Get current face parameters from the active puppet document */
  getCurrentFaceParams(): Record<string, number> {
    return this._activeDocument?.projectData?.parameters ?? {};
  }

  /** Whether there is an active puppet document for runtime parameter writes. */
  isActive(): boolean {
    return this._activeDocument?.projectData !== undefined;
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
    if (!this._activeDocument?.projectData) {
      throw new Error('No active puppet editor is available for face parameter writes.');
    }
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

function readPuppetSourceAddFileName(request: ProjectSourceAddRequest): string {
  const metadataName = request.metadata?.['name'];
  if (typeof metadataName === 'string' && metadataName.length > 0) {
    return metadataName;
  }
  const source =
    request.browserFile?.name ?? request.sourcePath ?? request.sourceUri ?? 'puppet.moc3';
  const normalized = source.split(/[?#]/, 1)[0]?.replace(/\\/g, '/') ?? source;
  const name = normalized.split('/').pop();
  return name && name.length > 0 ? decodeURIComponentSafe(name) : 'puppet.moc3';
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
