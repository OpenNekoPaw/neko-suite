import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  console.log('Neko Script extension activated');

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.script.run', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        vscode.window.showInformationMessage('Running script...');
      }
    }),
    vscode.commands.registerCommand('neko.script.validate', () => {
      vscode.window.showInformationMessage('Script validation - Coming soon');
    }),
    vscode.commands.registerCommand('neko.script.fromTimeline', () => {
      vscode.window.showInformationMessage('Generate script from timeline - Coming soon');
    }),
    vscode.commands.registerCommand('neko.script.toTimeline', () => {
      vscode.window.showInformationMessage('Apply script to timeline - Coming soon');
    })
  );
}

export function deactivate() {}
