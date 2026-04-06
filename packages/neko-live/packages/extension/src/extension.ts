import * as vscode from 'vscode';
import { createVSCodeLogger, VSCodeErrorHandler } from '@neko/shared/vscode/extension';
import { LivePanelProvider } from './LivePanelProvider';
import { setErrorHandler } from './utils/errorHandler';

export function activate(context: vscode.ExtensionContext) {
  const logger = createVSCodeLogger('Neko Live', 'NekoLive', context);
  setErrorHandler(new VSCodeErrorHandler(logger));

  logger.info('Extension activated');

  const provider = new LivePanelProvider(context.extensionUri, logger);

  context.subscriptions.push(
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
    vscode.commands.registerCommand('neko.live.calibrate', () => {
      vscode.window.showInformationMessage(vscode.l10n.t('neko.live.calibrating'));
    }),
    vscode.commands.registerCommand('neko.live.startRecording', () => {
      provider.startRecording(true);
    }),
    vscode.commands.registerCommand('neko.live.startStreaming', () => {
      vscode.window.showInformationMessage(vscode.l10n.t('neko.live.streamingStarted'));
    }),

    { dispose: () => provider.dispose() },
  );
}

export function deactivate() {}
