import * as vscode from 'vscode';
import type { DeviceInfo } from '@neko/shared';
import {
  createVSCodeLogger,
  VSCodeErrorHandler,
  resolveLogLevelSetting,
  watchLogLevel,
} from '@neko/shared/vscode/extension';
import { LivePanelProvider } from './LivePanelProvider';
import { setErrorHandler } from './utils/errorHandler';
import { TrackingService, registerTrackingCommands } from './tracking/TrackingService';

export function activate(context: vscode.ExtensionContext) {
  const logger = createVSCodeLogger(
    'Neko Live',
    'NekoLive',
    context,
    resolveLogLevelSetting(context.extensionMode),
  );
  setErrorHandler(new VSCodeErrorHandler(logger));
  watchLogLevel(logger, context);

  logger.info('Extension activated');

  const vmcPort = vscode.workspace.getConfiguration('neko.live').get<number>('vmcPort', 39539);
  const trackingService = new TrackingService(logger, vmcPort);
  registerTrackingCommands(context, trackingService);

  const provider = new LivePanelProvider(
    context.extensionUri,
    context.globalStorageUri,
    logger,
    trackingService,
  );

  context.subscriptions.push(
    trackingService,
    vscode.window.registerWebviewViewProvider(LivePanelProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),

    vscode.commands.registerCommand('neko.live.start', () => {
      provider.startVmc();
    }),
    vscode.commands.registerCommand('neko.live.stop', () => {
      provider.stopVmc();
    }),
    vscode.commands.registerCommand('neko.live.selectAvatar', () => {
      provider.selectAvatar();
    }),
    vscode.commands.registerCommand('neko.live.selectCreativeEntity', () => {
      provider.selectCreativeEntity();
    }),
    vscode.commands.registerCommand('neko.live.calibrate', () => {
      vscode.window.showInformationMessage(vscode.l10n.t('neko.live.calibrating'));
    }),
    vscode.commands.registerCommand('neko.live.startRecording', () => {
      provider.startRecording(true);
    }),
    vscode.commands.registerCommand('neko.live.startStreaming', () => {
      vscode.window.showInformationMessage(vscode.l10n.t('neko.live.streamingStarted'));
    }),
    vscode.commands.registerCommand('neko.live.useDevice', (device: DeviceInfo) =>
      provider.useDevice(device),
    ),

    { dispose: () => provider.dispose() },
  );
}

export function deactivate() {}
