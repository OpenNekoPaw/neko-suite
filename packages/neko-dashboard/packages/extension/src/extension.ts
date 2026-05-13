import * as vscode from 'vscode';
import {
  createVSCodeLogger,
  resolveLogLevelSetting,
  watchLogLevel,
} from '@neko/shared/vscode/extension';
import { DashboardProvider } from './dashboardProvider';

export function activate(context: vscode.ExtensionContext): void {
  const logger = createVSCodeLogger(
    'Neko Dashboard',
    'NekoDashboard',
    context,
    resolveLogLevelSetting(context.extensionMode),
  );
  watchLogLevel(logger, context);

  const provider = new DashboardProvider(context, { logger });

  context.subscriptions.push(provider);
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.dashboard.show', () => provider.show()),
  );

  void provider.maybeShowOnStartup();
}

export function deactivate(): void {
  // VSCode disposes subscriptions from the extension context.
}
