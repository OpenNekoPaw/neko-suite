import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  console.log('Neko Sketch extension activated');

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.sketch.enable', () => {
      vscode.window.showInformationMessage('Sketch mode enabled');
    }),
    vscode.commands.registerCommand('neko.sketch.selectBrush', () => {
      vscode.window.showQuickPick(['pencil', 'pen', 'brush', 'airbrush', 'eraser'], {
        placeHolder: 'Select brush type',
      });
    }),
    vscode.commands.registerCommand('neko.sketch.adjustSize', () => {
      vscode.window.showInputBox({
        prompt: 'Enter brush size (1-100)',
        value: '10',
      });
    }),
    vscode.commands.registerCommand('neko.sketch.pickColor', () => {
      vscode.window.showInformationMessage('Color picker - Coming soon');
    }),
  );
}

export function deactivate() {}
