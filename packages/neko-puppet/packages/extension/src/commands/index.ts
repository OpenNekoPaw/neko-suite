/**
 * NekoPuppet command registration
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { createNewFile } from '@neko/shared/vscode/extension';
import { handleError } from '../utils/errorHandler';
import type { PuppetLiveModeService } from '../live';
import { Live2dBundleLoader } from '../live2d';
import { PuppetAssetExportService } from '../export/PuppetAssetExportService';

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
    puppet: { src: null },
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

        const bundleBytes = await vscode.workspace.fs.readFile(bundleUri);
        const relativeBundlePath =
          './' + path.relative(workspaceFolder.fsPath, bundleUri.fsPath).replace(/\\/g, '/');
        const loaded = live2dBundleLoader.loadLive2dBundle(relativeBundlePath, bundleBytes);
        const projectStem = path.basename(bundleUri.fsPath).replace(/\.zip$/i, '');
        const projectUri = vscode.Uri.joinPath(workspaceFolder, `${projectStem}.nkp.puppet.bundle`);

        await vscode.workspace.fs.writeFile(
          projectUri,
          Buffer.from(JSON.stringify(loaded.projectData, null, 2), 'utf-8'),
        );
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
