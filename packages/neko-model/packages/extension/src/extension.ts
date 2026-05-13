import * as vscode from 'vscode';
import type { EnvironmentPlacement } from '@neko/shared';
import {
  createNewFile,
  createVSCodeLogger,
  resolveLogLevelSetting,
  watchLogLevel,
} from '@neko/shared/vscode/extension';
import { setRootLogger, getRootLogger } from './logger';
import { ModelEditorProvider } from './editor/ModelEditorProvider';
import {
  formatSupportedModelAssetExtensions,
  getSupportedModelAssetFileExtensions,
  parseModelImportAssetArgs,
  validateModelAssetPath,
} from './importModelAsset';
import { ModelLiveModeService } from './live';

/** Default .nkm document template */
function getModelTemplate(title: string): string {
  return JSON.stringify(
    {
      version: 2,
      name: title,
      model: { src: null },
      scene_snapshot: { nodes: [], animations: [] },
    },
    null,
    2,
  );
}

let modelEditorProvider: ModelEditorProvider;

export function activate(context: vscode.ExtensionContext): void {
  // Initialize shared logger
  const logger = createVSCodeLogger(
    'Neko Model',
    'NekoModel',
    context,
    resolveLogLevelSetting(context.extensionMode),
  );
  setRootLogger(logger);
  watchLogLevel(logger, context);
  getRootLogger().info('Activating extension...');

  modelEditorProvider = new ModelEditorProvider(context);
  const liveModeService = new ModelLiveModeService({
    editorProvider: modelEditorProvider,
    logger: logger.child('LiveMode'),
  });

  // Register custom editor
  context.subscriptions.push(
    liveModeService,
    vscode.window.registerCustomEditorProvider(ModelEditorProvider.viewType, modelEditorProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  // Register keyboard action commands
  const keyboardActions = [
    'neko.model.deleteSelected',
    'neko.model.escape',
    'neko.model.selectAll',
    'neko.model.undo',
    'neko.model.redo',
    'neko.model.resetView',
  ];

  for (const commandId of keyboardActions) {
    const action = commandId.replace('neko.model.', '');
    context.subscriptions.push(
      vscode.commands.registerCommand(commandId, () => {
        modelEditorProvider.postKeyboardAction(action);
      }),
    );
  }

  // New 3D Model Project — create blank .nkm with inline rename
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.model.new', async (uri?: vscode.Uri) => {
      await createNewFile({
        targetFolder: uri,
        ext: '.nkm',
        template: (title) => getModelTemplate(title),
        noFolderErrorMessage: vscode.l10n.t('neko.model.new.noFolder'),
      });
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.model.liveMode.start', async () => {
      try {
        await liveModeService.start();
        void vscode.window.showInformationMessage(vscode.l10n.t('neko.model.liveMode.started'));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        getRootLogger().error(`liveMode.start failed: ${message}`);
        void vscode.window.showErrorMessage(message);
      }
    }),
    vscode.commands.registerCommand('neko.model.liveMode.stop', async () => {
      await liveModeService.stop();
      void vscode.window.showInformationMessage(vscode.l10n.t('neko.model.liveMode.stopped'));
    }),
    vscode.commands.registerCommand('neko.model.importAsset', async (args?: unknown) => {
      const parseResult = parseModelImportAssetArgs(args);
      if (parseResult.status === 'missing') {
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          filters: { '3D Models': Array.from(getSupportedModelAssetFileExtensions()) },
        });
        if (uris?.[0]) {
          await importModelAsset(modelEditorProvider, uris[0]);
        }
        return;
      }

      if (parseResult.status === 'invalid') {
        const message = getUnsupportedModelAssetMessage();
        getRootLogger().warn(`importAsset rejected unsupported format: ${parseResult.path}`);
        void vscode.window.showErrorMessage(message);
        return;
      }

      try {
        await importModelAsset(modelEditorProvider, vscode.Uri.file(parseResult.payload.path));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        getRootLogger().error(`importAsset failed: ${message}`);
        void vscode.window.showErrorMessage(message);
      }
    }),
    vscode.commands.registerCommand('neko.model.useEnvironment', async (input?: unknown) => {
      const placement = parseEnvironmentPlacement(input);
      if (!placement) {
        const message = vscode.l10n.t('neko.model.useEnvironment.invalidPlacement');
        getRootLogger().warn(message);
        void vscode.window.showErrorMessage(message);
        return;
      }
      if (modelEditorProvider.useEnvironment(placement)) {
        return;
      }
      const message = vscode.l10n.t('neko.model.useEnvironment.noActiveEditor');
      getRootLogger().warn(message);
      void vscode.window.showWarningMessage(message);
    }),
  );
}

export function deactivate(): void {
  // No extension-level resources require explicit shutdown beyond VSCode disposables.
}

async function importModelAsset(provider: ModelEditorProvider, uri: vscode.Uri): Promise<void> {
  if (!validateModelAssetPath(uri.fsPath).supported) {
    throw new Error(getUnsupportedModelAssetMessage());
  }

  if (provider.isActive()) {
    await provider.importAsset(uri);
    return;
  }

  await openModelProjectWithQueuedImport(provider, uri);
}

async function openModelProjectWithQueuedImport(
  provider: ModelEditorProvider,
  uri: vscode.Uri,
): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders?.[0]) {
    const message = vscode.l10n.t('neko.model.importAsset.noWorkspace');
    getRootLogger().warn(message);
    void vscode.window.showWarningMessage(message);
    return;
  }

  const tempDir = vscode.Uri.joinPath(workspaceFolders[0].uri, '.neko', 'temp');
  const tempFile = vscode.Uri.joinPath(tempDir, `model-import-${Date.now()}.nkm`);
  try {
    await vscode.workspace.fs.createDirectory(tempDir);
    await vscode.workspace.fs.writeFile(
      tempFile,
      Buffer.from(getModelTemplate('Model Import'), 'utf-8'),
    );
    provider.queueModelImport(uri);
    await vscode.commands.executeCommand('vscode.openWith', tempFile, ModelEditorProvider.viewType);
  } catch (error) {
    provider.clearQueuedModelImport();
    throw error;
  }
}

function getUnsupportedModelAssetMessage(): string {
  return vscode.l10n.t('neko.model.importAsset.unsupportedFormat', {
    extensions: formatSupportedModelAssetExtensions(),
  });
}

function parseEnvironmentPlacement(value: unknown): EnvironmentPlacement | null {
  if (!isRecord(value)) return null;
  const mode = value['mode'];
  if (mode !== 'skybox' && mode !== 'ibl' && mode !== 'background-and-ibl') return null;
  const sourceAssetId = value['sourceAssetId'];
  const rotationDeg = finiteNumber(value['rotationDeg']);
  const intensity = finiteNumber(value['intensity']);
  const exposure = finiteNumber(value['exposure']);
  const visibleAsBackground = value['visibleAsBackground'];
  if (
    typeof sourceAssetId !== 'string' ||
    sourceAssetId.length === 0 ||
    rotationDeg === null ||
    intensity === null ||
    exposure === null ||
    typeof visibleAsBackground !== 'boolean'
  ) {
    return null;
  }
  const sourceUri = value['sourceUri'];
  return {
    sourceAssetId,
    sourceUri: typeof sourceUri === 'string' ? sourceUri : undefined,
    mode,
    rotationDeg,
    intensity,
    exposure,
    visibleAsBackground,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
