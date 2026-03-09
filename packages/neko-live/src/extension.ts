import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  console.log('Neko Live extension activated');

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.live.start', () => {
      vscode.window.showInformationMessage('Live session started');
    }),
    vscode.commands.registerCommand('neko.live.stop', () => {
      vscode.window.showInformationMessage('Live session stopped');
    }),
    vscode.commands.registerCommand('neko.live.selectAvatar', () => {
      vscode.window.showOpenDialog({
        canSelectFiles: true,
        filters: { 'VRM Models': ['vrm'], '3D Models': ['glb', 'gltf'] },
      });
    }),
    vscode.commands.registerCommand('neko.live.calibrate', () => {
      vscode.window.showInformationMessage('Calibrating tracking...');
    }),
    vscode.commands.registerCommand('neko.live.startRecording', () => {
      vscode.window.showInformationMessage('Recording started');
    }),
    vscode.commands.registerCommand('neko.live.startStreaming', () => {
      vscode.window.showInformationMessage('Streaming started');
    }),
  );
}

export function deactivate() {}
