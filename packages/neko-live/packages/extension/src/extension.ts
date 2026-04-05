import * as vscode from 'vscode';
import { ConsoleLogger, LogLevel } from '@neko/shared';
import { LivePanelProvider } from './LivePanelProvider';

const logger = new ConsoleLogger('NekoLive', LogLevel.Info);

export function activate(context: vscode.ExtensionContext) {
  logger.info('Extension activated');

  const provider = new LivePanelProvider(context.extensionUri, logger);

  context.subscriptions.push(
    // Register the webview panel provider
    vscode.window.registerWebviewViewProvider(LivePanelProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),

    // Tracking commands
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
      vscode.window.showInformationMessage('Calibrating tracking...');
      // TODO(P1): implement calibration system
    }),

    // Recording commands
    vscode.commands.registerCommand('neko.live.startRecording', () => {
      provider.startRecording(true);
    }),
    vscode.commands.registerCommand('neko.live.startStreaming', () => {
      vscode.window.showInformationMessage('Streaming started');
      // TODO(P2): implement RTMP/SRT streaming (Phase 5.3)
    }),

    // Cleanup
    { dispose: () => provider.dispose() },
  );
}

export function deactivate() {}
