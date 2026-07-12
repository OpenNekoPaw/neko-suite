import * as vscode from 'vscode';
import {
  createNekoProjectAuthoringDiagnostic,
  createNekoProjectAuthoringResult,
  type EnvironmentPlacement,
  type ILogger,
  type NekoModelAPI,
  type NekoProjectAuthoringTarget,
  type NkmSceneProfile,
} from '@neko/shared';
import {
  createNewFile,
  createVSCodeProjectFileIoAdapter,
  createVSCodeLogger,
  resolveLogLevelSetting,
  VSCodeErrorHandler,
  watchLogLevel,
} from '@neko/shared/vscode/extension';
import { setRootLogger, getRootLogger } from './logger';
import { ModelEditorProvider } from './editor/ModelEditorProvider';
import { ModelStatusBar } from './editor/ModelStatusBar';
import { createNekoModelCapabilityProvider } from './agentCapabilityProvider';
import { formatSupportedModelAssetExtensions, parseModelImportAssetArgs } from './importModelAsset';
import { ModelLiveModeService } from './live';
import { registerMarketInstallTargets } from './market/registerMarketInstallTargets';
import { ModelAssetExportService } from './export/ModelAssetExportService';
import { ModelProjectAuthoringService } from './services/ModelProjectAuthoringService';
import { ModelProjectQualityFacade } from './services/ModelProjectQualityFacade';

/** Default .nkm document template */
function getModelTemplate(title: string, profile: NkmSceneProfile = '3d'): string {
  return JSON.stringify(
    {
      version: 2,
      name: title,
      profile,
      model: { src: null },
      ...(profile === '3d' ? { scene_snapshot: { nodes: [], animations: [] } } : {}),
      ...(profile === '2d'
        ? {
            scene2d: {
              sprites: [],
              tilemaps: [],
              lights: [],
              parallaxLayers: [],
              particles: [],
              camera: null,
            },
          }
        : {}),
      faceParams: {},
      customClips: [],
      camera: null,
      viewport: { zoom: 1 },
      editorState: {},
    },
    null,
    2,
  );
}

interface ExportModelAssetArgs {
  readonly sourcePath: string;
  readonly outputPath?: string;
  readonly name?: string;
}

let modelEditorProvider: ModelEditorProvider;

export function activate(context: vscode.ExtensionContext): NekoModelAPI {
  // Initialize shared logger
  const logger = createVSCodeLogger(
    'Neko Model',
    'NekoModel',
    context,
    resolveLogLevelSetting(context.extensionMode),
  );
  setRootLogger(logger);
  watchLogLevel(logger, context);
  const errorHandler = new VSCodeErrorHandler(logger.child('Errors'));
  getRootLogger().info('Activating extension...');

  const modelStatusBar = new ModelStatusBar();
  context.subscriptions.push(modelStatusBar);
  modelEditorProvider = new ModelEditorProvider(context, modelStatusBar);
  const projectFileAdapter = createVSCodeProjectFileIoAdapter({ vscodeApi: vscode });
  const projectQuality = new ModelProjectQualityFacade({
    fileOps: projectFileAdapter.fileOps,
    runtimeProbe: {
      async probe({ document }) {
        const engine = vscode.extensions.getExtension('neko.neko-engine');
        return {
          available: Boolean(engine),
          profileId: document.profile ?? '3d',
          diagnostics: engine
            ? []
            : [
                {
                  code: 'quality-evaluator-failed',
                  severity: 'warning',
                  message: 'The Neko Engine runtime adapter is not installed.',
                },
              ],
        };
      },
    },
  });
  const api: NekoModelAPI = {
    ...modelEditorProvider.getModelApi(),
    projectQuality,
  };
  const liveModeService = new ModelLiveModeService({
    editorProvider: modelEditorProvider,
    logger: logger.child('LiveMode'),
  });
  const exportService = new ModelAssetExportService({
    fs: {
      readFile: async (filePath) => vscode.workspace.fs.readFile(vscode.Uri.file(filePath)),
      writeFile: async (filePath, data) =>
        vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), data),
      createDirectory: async (dirPath) =>
        vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath)),
    },
  });
  const authoringService = new ModelProjectAuthoringService({
    getActiveDocumentUri: () => modelEditorProvider.getActiveDocumentUri(),
    revealDocument: async (uri) => {
      await vscode.commands.executeCommand('vscode.openWith', uri, ModelEditorProvider.viewType);
    },
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
        onCreated: async (fileUri) => {
          await vscode.commands.executeCommand(
            'vscode.openWith',
            fileUri,
            ModelEditorProvider.viewType,
          );
        },
      });
    }),
    vscode.commands.registerCommand('neko.model.new2dScene', async (uri?: vscode.Uri) => {
      await createNewFile({
        targetFolder: uri,
        ext: '.nkm',
        template: (title) => getModelTemplate(title, '2d'),
        noFolderErrorMessage: vscode.l10n.t('neko.model.new.noFolder'),
        onCreated: async (fileUri) => {
          await vscode.commands.executeCommand(
            'vscode.openWith',
            fileUri,
            ModelEditorProvider.viewType,
          );
        },
      });
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.model.liveMode.start', async () => {
      try {
        await liveModeService.start();
        void vscode.window.showInformationMessage(vscode.l10n.t('neko.model.liveMode.started'));
      } catch (error) {
        await errorHandler.handleError(toError(error), {
          showToUser: true,
          severity: 'error',
        });
      }
    }),
    vscode.commands.registerCommand('neko.model.liveMode.stop', async () => {
      await liveModeService.stop();
      void vscode.window.showInformationMessage(vscode.l10n.t('neko.model.liveMode.stopped'));
    }),
    vscode.commands.registerCommand('neko.model.authoring.importAsset', async (args?: unknown) => {
      const parseResult = parseModelImportAssetArgs(args);
      if (parseResult.status === 'missing') {
        return createNekoProjectAuthoringResult({
          ok: false,
          diagnostics: [
            createNekoProjectAuthoringDiagnostic({
              code: 'invalid-authoring-operation',
              message: 'Model authoring import requires a supported asset path.',
            }),
          ],
        });
      }
      if (parseResult.status === 'invalid') {
        return createNekoProjectAuthoringResult({
          ok: false,
          diagnostics: [
            createNekoProjectAuthoringDiagnostic({
              code: 'invalid-authoring-operation',
              message: getUnsupportedModelAssetMessage(),
              context: { path: parseResult.path, extension: parseResult.extension },
            }),
          ],
        });
      }
      return await authoringService.importAsset({
        assetPath: parseResult.payload.path,
        name: parseResult.payload.name,
        target: resolveAuthoringImportTarget(parseResult.payload, false),
      });
    }),
    vscode.commands.registerCommand('neko.model.exportMotions', async (input?: unknown) => {
      await runModelAssetExport(input, 'motions', exportService, errorHandler);
    }),
    vscode.commands.registerCommand('neko.model.exportConfig', async (input?: unknown) => {
      await runModelAssetExport(input, 'config', exportService, errorHandler);
    }),
    vscode.commands.registerCommand('neko.model.useEnvironment', async (input?: unknown) => {
      const placement = parseEnvironmentPlacement(input);
      if (!placement) {
        const message = vscode.l10n.t('neko.model.useEnvironment.invalidPlacement');
        getRootLogger().warn(message);
        await errorHandler.handleError(new Error(message), {
          showToUser: true,
          severity: 'error',
        });
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

  registerModelCapabilityProvider(api, logger);
  void registerMarketInstallTargets(context, logger.child('MarketInstallTargets'));

  getRootLogger().info('Extension activated, API exported');
  return api;
}

async function runModelAssetExport(
  input: unknown,
  kind: 'motions' | 'config',
  exportService: ModelAssetExportService,
  errorHandler: VSCodeErrorHandler,
): Promise<void> {
  try {
    const args = parseExportModelAssetArgs(input);
    const sourceUri = args?.sourcePath
      ? vscode.Uri.file(args.sourcePath)
      : (
          await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
              [vscode.l10n.t('neko.model.export.sourceFilter')]: ['nkm'],
            },
          })
        )?.[0];
    if (!sourceUri) return;

    const outputUri = args?.outputPath
      ? vscode.Uri.file(args.outputPath)
      : await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(exportService.defaultOutputPath(sourceUri.fsPath, kind)),
          filters: {
            [vscode.l10n.t('neko.model.export.artifactFilter')]: [
              kind === 'motions' ? 'nkma' : 'nkmc',
            ],
          },
        });
    if (!outputUri) return;

    const request = {
      sourcePath: sourceUri.fsPath,
      outputPath: outputUri.fsPath,
      ...(args?.name ? { name: args.name } : {}),
    };
    const result =
      kind === 'motions'
        ? await exportService.exportMotions(request)
        : await exportService.exportConfig(request);
    void vscode.window.showInformationMessage(
      vscode.l10n.t('neko.model.export.completed', { path: result.outputPath }),
    );
  } catch (error) {
    await errorHandler.handleError(toError(error), {
      showToUser: true,
      severity: 'error',
    });
  }
}

export function deactivate(): void {
  // No extension-level resources require explicit shutdown beyond VSCode disposables.
}

function resolveAuthoringImportTarget(
  payload: {
    readonly name?: string;
    readonly documentUri?: string;
    readonly target?: NekoProjectAuthoringTarget;
    readonly reveal?: boolean;
  },
  defaultReveal: boolean,
): NekoProjectAuthoringTarget {
  const reveal = payload.reveal ?? defaultReveal;
  if (payload.target) {
    return { ...payload.target, reveal: payload.target.reveal ?? reveal };
  }
  if (payload.documentUri) {
    return { kind: 'file', documentUri: payload.documentUri, reveal };
  }
  return { kind: 'new', ...(payload.name ? { title: payload.name } : {}), reveal };
}

function getUnsupportedModelAssetMessage(): string {
  return vscode.l10n.t('neko.model.authoring.importAsset.unsupportedFormat', {
    extensions: formatSupportedModelAssetExtensions(),
  });
}

function registerModelCapabilityProvider(api: NekoModelAPI, logger: ILogger): void {
  try {
    const capabilityProvider = createNekoModelCapabilityProvider(api);
    void vscode.commands.executeCommand('neko.agent.registerCapabilities', capabilityProvider).then(
      () => undefined,
      (error: unknown) => {
        logger.debug('Agent capability registration skipped', error);
      },
    );
  } catch (error) {
    logger.debug('Agent capability registration skipped', error);
  }
}

function parseExportModelAssetArgs(value: unknown): ExportModelAssetArgs | undefined {
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

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
