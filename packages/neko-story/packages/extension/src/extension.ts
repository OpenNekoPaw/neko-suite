import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  console.log('Neko Story extension activated');

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.story.preview', () => {
      vscode.window.showInformationMessage('Story preview - Coming soon');
    }),
    vscode.commands.registerCommand('neko.story.toTimeline', () => {
      vscode.window.showInformationMessage('Convert to timeline - Coming soon');
    }),
    vscode.commands.registerCommand('neko.story.generateStoryboard', () => {
      vscode.window.showInformationMessage('Generate storyboard - Coming soon');
    })
  );
}

export function deactivate() {}
