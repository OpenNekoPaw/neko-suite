/**
 * NekoPuppet command registration
 */
import * as vscode from 'vscode';
import * as path from 'path';
import {
  createDefaultProjectFormatCodecRegistry,
  ingestProjectSourceAddRequest,
  nkpSourcePathPolicy,
  ProjectFileStore,
  type NkpProjectData,
  type WorkspaceMediaPathContext,
} from '@neko/shared';
import {
  createNewFile,
  createVSCodeProjectFileIoAdapter,
  formatProjectFileDiagnostics,
  ProjectFileSaveSession,
} from '@neko/shared/vscode/extension';
import { handleError } from '../utils/errorHandler';
import { PuppetEditorProvider } from '../editor';
import type { PuppetLiveModeService } from '../live';
import { Live2dBundleLoader } from '../live2d';
import { PuppetAssetExportService } from '../export/PuppetAssetExportService';
import { getLogger } from '../utils/logger';

const logger = getLogger('PuppetCommands');

interface ImportLive2dBundleArgs {
  readonly path: string;
  readonly workspaceFolderPath?: string;
}

interface ExportPuppetAssetArgs {
  readonly sourcePath: string;
  readonly outputPath?: string;
  readonly name?: string;
}

/** Default .nkp puppet project template */
function getPuppetTemplate(name: string): string {
  const data = {
    version: '1.0',
    name,
    puppet: {
      src: null,
      format: 'moc3',
      runtimeAdapter: {
        id: 'live2d-moc3-compat',
        version: 'clean-room',
      },
    },
    parameters: {},
    viewport: { zoom: 1.0 },
  };
  return JSON.stringify(data, null, 2);
}

export function registerCommands(
  context: vscode.ExtensionContext,
  liveModeService?: PuppetLiveModeService,
): void {
  const live2dBundleLoader = new Live2dBundleLoader();
  const projectFileAdapter = createVSCodeProjectFileIoAdapter({ vscodeApi: vscode });
  const projectFileStore = new ProjectFileStore({
    registry: createDefaultProjectFormatCodecRegistry(),
    fileOps: projectFileAdapter.fileOps,
    logger,
  });
  const projectFileSession = new ProjectFileSaveSession<NkpProjectData>({
    formatId: 'nkp',
    store: projectFileStore,
    sourcePolicy: nkpSourcePathPolicy,
    createSourcePolicyOptions: (uri) => ({
      context: createPuppetCommandSourceContext(projectFileAdapter, uri, uri),
    }),
    logger,
  });
  const exportService = new PuppetAssetExportService({
    fs: {
      readFile: async (filePath) => vscode.workspace.fs.readFile(vscode.Uri.file(filePath)),
      writeFile: async (filePath, data) =>
        vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), data),
      createDirectory: async (dirPath) =>
        vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath)),
    },
  });

  // New Puppet - create blank .nkp file with inline rename
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.puppet.new', async (uri?: vscode.Uri) => {
      try {
        await createNewFile({
          targetFolder: uri,
          ext: '.nkp',
          template: (title) => getPuppetTemplate(title),
          noFolderErrorMessage: vscode.l10n.t('neko.puppet.new.noFolder'),
          onCreated: async (fileUri) => {
            await vscode.commands.executeCommand(
              'vscode.openWith',
              fileUri,
              PuppetEditorProvider.viewType,
            );
          },
        });
      } catch (error) {
        await handleError(error, { showToUser: true });
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.puppet.importLive2dBundle', async (uri?: vscode.Uri) => {
      try {
        const args = parseImportLive2dBundleArgs(uri);
        const workspaceFolder = resolveWorkspaceFolder(
          args?.workspaceFolderPath ? vscode.Uri.file(args.workspaceFolderPath) : uri,
        );
        if (!workspaceFolder) {
          throw new Error(vscode.l10n.t('neko.puppet.importLive2dBundle.noFolder'));
        }

        const bundleUri = args
          ? vscode.Uri.file(args.path)
          : (
              await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: {
                  [vscode.l10n.t('neko.puppet.importLive2dBundle.filter')]: ['zip'],
                },
              })
            )?.[0];
        if (!bundleUri) return;

        const projectStem = path.basename(bundleUri.fsPath).replace(/\.zip$/i, '');
        const projectUri = vscode.Uri.joinPath(workspaceFolder, `${projectStem}.nkp.puppet.bundle`);
        const sourcePolicyContext = createPuppetCommandSourceContext(
          projectFileAdapter,
          projectUri,
          workspaceFolder,
        );
        const durableBundlePath = await linkPuppetBundleSource(
          bundleUri.fsPath,
          projectUri,
          sourcePolicyContext,
        );
        const bundleBytes = await vscode.workspace.fs.readFile(bundleUri);
        const loaded = live2dBundleLoader.loadLive2dBundle(durableBundlePath, bundleBytes);

        await projectFileSession.save({
          targetUri: projectUri,
          document: loaded.projectData,
          saveReason: 'import',
          defaultMessage: vscode.l10n.t('neko.puppet.importLive2dBundle.saveFailed'),
          sourcePolicyOptions: {
            context: sourcePolicyContext,
          },
        });
        await vscode.commands.executeCommand('vscode.openWith', projectUri, 'neko.puppetEditor');
        void vscode.window.showInformationMessage(
          vscode.l10n.t('neko.puppet.importLive2dBundle.imported'),
        );
      } catch (error) {
        await handleError(error, { showToUser: true });
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.puppet.exportModel', async (input?: unknown) => {
      await runPuppetAssetExport(input, 'model', exportService);
    }),
    vscode.commands.registerCommand('neko.puppet.exportMotions', async (input?: unknown) => {
      await runPuppetAssetExport(input, 'motions', exportService);
    }),
    vscode.commands.registerCommand('neko.puppet.exportConfig', async (input?: unknown) => {
      await runPuppetAssetExport(input, 'config', exportService);
    }),
  );

  if (liveModeService) {
    context.subscriptions.push(
      vscode.commands.registerCommand('neko.puppet.liveMode.start', async () => {
        try {
          await liveModeService.start();
          void vscode.window.showInformationMessage(vscode.l10n.t('neko.puppet.liveMode.started'));
        } catch (error) {
          await handleError(error, { showToUser: true });
        }
      }),
      vscode.commands.registerCommand('neko.puppet.liveMode.stop', async () => {
        await liveModeService.stop();
        void vscode.window.showInformationMessage(vscode.l10n.t('neko.puppet.liveMode.stopped'));
      }),
    );
  }
}

function createPuppetCommandSourceContext(
  projectFileAdapter: ReturnType<typeof createVSCodeProjectFileIoAdapter>,
  projectUri: vscode.Uri,
  workspaceFolder: vscode.Uri,
): WorkspaceMediaPathContext {
  const documentDir = path.dirname(projectUri.fsPath);
  const context = projectFileAdapter.createWorkspaceMediaPathContext({
    documentUri: projectUri,
    pathVariables: new Map([['PROJECT', documentDir]]),
    allowedRoots: [documentDir, workspaceFolder.fsPath],
  });
  const pathVariables = new Map(context.pathVariables ?? []);
  pathVariables.set('PROJECT', documentDir);
  return {
    ...context,
    documentDir,
    pathVariables,
  };
}

async function linkPuppetBundleSource(
  bundlePath: string,
  projectUri: vscode.Uri,
  context: WorkspaceMediaPathContext,
): Promise<string> {
  const result = await ingestProjectSourceAddRequest(
    {
      mode: 'link',
      sourcePath: bundlePath,
      destination: { kind: 'project', directory: '.', copyMode: 'link' },
      fileName: path.basename(bundlePath),
      caller: 'neko-puppet.import-live2d-bundle',
    },
    {
      documentPath: projectUri.fsPath,
      assetDirectory: '.',
      workspaceContext: context,
      fileOps: {
        createDirectory: async (dirPath) =>
          vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath)),
        fileExists: async (filePath) => {
          try {
            await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
            return true;
          } catch {
            return false;
          }
        },
        writeFile: async (filePath, bytes) =>
          vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), bytes),
      },
      unmanagedSourceMessage:
        'Live2D bundle must be moved into the project, asset library, or a configured media root before saving.',
    },
  );
  if (result.status !== 'ready' || !result.contractedPath) {
    throw new Error(result.error ?? `Unable to link Live2D bundle: ${bundlePath}`);
  }
  return result.contractedPath;
}

async function runPuppetAssetExport(
  input: unknown,
  kind: 'model' | 'motions' | 'config',
  exportService: PuppetAssetExportService,
): Promise<void> {
  try {
    const args = parseExportPuppetAssetArgs(input);
    const sourceUri = args?.sourcePath
      ? vscode.Uri.file(args.sourcePath)
      : (
          await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
              [vscode.l10n.t('neko.puppet.export.sourceFilter')]: [
                'nkp',
                'nkp.puppet.bundle',
                'moc3',
              ],
            },
          })
        )?.[0];
    if (!sourceUri) return;

    const defaultOutputPath = exportService.defaultOutputPath(sourceUri.fsPath, kind);
    const outputUri = args?.outputPath
      ? vscode.Uri.file(args.outputPath)
      : await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(defaultOutputPath),
          filters: {
            [vscode.l10n.t('neko.puppet.export.packageFilter')]: ['zip'],
          },
        });
    if (!outputUri) return;

    const request = {
      sourcePath: sourceUri.fsPath,
      outputPath: outputUri.fsPath,
      ...(args?.name ? { name: args.name } : {}),
    };
    const result =
      kind === 'model'
        ? await exportService.exportModel(request)
        : kind === 'motions'
          ? await exportService.exportMotions(request)
          : await exportService.exportConfig(request);

    void vscode.window.showInformationMessage(
      vscode.l10n.t('neko.puppet.export.completed', {
        path: result.outputPath,
      }),
    );
  } catch (error) {
    await handleError(error, { showToUser: true });
  }
}

function parseImportLive2dBundleArgs(value: unknown): ImportLive2dBundleArgs | undefined {
  if (!isRecord(value)) return undefined;
  const importPath = value['path'];
  if (typeof importPath !== 'string' || importPath.trim().length === 0) return undefined;
  const workspaceFolderPath = value['workspaceFolderPath'];
  return {
    path: importPath.trim(),
    ...(typeof workspaceFolderPath === 'string' && workspaceFolderPath.trim().length > 0
      ? { workspaceFolderPath: workspaceFolderPath.trim() }
      : {}),
  };
}

function parseExportPuppetAssetArgs(value: unknown): ExportPuppetAssetArgs | undefined {
  if (value instanceof vscode.Uri) {
    return { sourcePath: value.fsPath };
  }
  if (!isRecord(value)) return undefined;
  const sourcePath = value['sourcePath'];
  if (typeof sourcePath !== 'string' || sourcePath.trim().length === 0) return undefined;
  const outputPath = value['outputPath'];
  const name = value['name'];
  return {
    sourcePath: sourcePath.trim(),
    ...(typeof outputPath === 'string' && outputPath.trim().length > 0
      ? { outputPath: outputPath.trim() }
      : {}),
    ...(typeof name === 'string' && name.trim().length > 0 ? { name: name.trim() } : {}),
  };
}

function resolveWorkspaceFolder(uri?: vscode.Uri): vscode.Uri | undefined {
  if (uri) {
    const statPath = path.extname(uri.fsPath) ? path.dirname(uri.fsPath) : uri.fsPath;
    return vscode.Uri.file(statPath);
  }
  return vscode.workspace.workspaceFolders?.[0]?.uri;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
