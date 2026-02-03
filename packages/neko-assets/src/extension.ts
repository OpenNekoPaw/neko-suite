import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  console.log('Neko Assets extension activated');

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.sync', () => {
      vscode.window.showInformationMessage('Syncing assets...');
    }),
    vscode.commands.registerCommand('neko.assets.push', () => {
      vscode.window.showInformationMessage('Pushing to cloud...');
    }),
    vscode.commands.registerCommand('neko.assets.pull', () => {
      vscode.window.showInformationMessage('Pulling from cloud...');
    }),
    vscode.commands.registerCommand('neko.assets.initLfs', async () => {
      const terminal = vscode.window.createTerminal('Git LFS');
      terminal.sendText('git lfs install');
      terminal.show();
    }),
    vscode.commands.registerCommand('neko.assets.trackLfs', async () => {
      const pattern = await vscode.window.showInputBox({
        prompt: 'Enter file pattern to track (e.g., *.mp4)',
        value: '*.mp4'
      });
      if (pattern) {
        const terminal = vscode.window.createTerminal('Git LFS');
        terminal.sendText(`git lfs track "${pattern}"`);
        terminal.show();
      }
    }),
    vscode.commands.registerCommand('neko.assets.triggerRender', () => {
      vscode.window.showInformationMessage('CI/CD render triggered');
    }),
    vscode.commands.registerCommand('neko.assets.viewHistory', () => {
      vscode.window.showInformationMessage('Asset history - Coming soon');
    })
  );
}

export function deactivate() {}
