import * as vscode from 'vscode';
import { ConsoleLogger, LogLevel } from '@neko/shared';

const logger = new ConsoleLogger('NekoAudio', LogLevel.Info);

export function activate(context: vscode.ExtensionContext) {
  logger.info('extension activated');

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.audio.record', () => {
      vscode.window.showInformationMessage('Audio recording - Coming soon');
    }),
    vscode.commands.registerCommand('neko.audio.denoise', () => {
      vscode.window.showInformationMessage('Audio denoise - Coming soon');
    }),
    vscode.commands.registerCommand('neko.audio.normalize', () => {
      vscode.window.showInformationMessage('Audio normalize - Coming soon');
    }),
    vscode.commands.registerCommand('neko.audio.showSpectrum', () => {
      vscode.window.showInformationMessage('Spectrum analyzer - Coming soon');
    }),
    vscode.commands.registerCommand('neko.audio.trim', () => {
      vscode.window.showInformationMessage('Audio trim - Coming soon');
    }),
    vscode.commands.registerCommand('neko.audio.fadeIn', () => {
      vscode.window.showInformationMessage('Fade in applied');
    }),
    vscode.commands.registerCommand('neko.audio.fadeOut', () => {
      vscode.window.showInformationMessage('Fade out applied');
    }),
  );
}

export function deactivate() {}
