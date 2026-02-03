import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  console.log('Neko Tools extension activated');

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.tools.compareFiles', async (uri: vscode.Uri, uris: vscode.Uri[]) => {
      if (uris && uris.length >= 2) {
        vscode.window.showInformationMessage(`Comparing ${uris.length} files...`);
        // TODO: Implement file comparison
      } else {
        vscode.window.showWarningMessage('Please select at least 2 files to compare');
      }
    }),
    vscode.commands.registerCommand('neko.tools.compareImages', () => {
      vscode.window.showInformationMessage('Image comparison - Coming soon');
    }),
    vscode.commands.registerCommand('neko.tools.compareVideos', () => {
      vscode.window.showInformationMessage('Video comparison - Coming soon');
    }),
    vscode.commands.registerCommand('neko.tools.compareAudio', () => {
      vscode.window.showInformationMessage('Audio comparison - Coming soon');
    }),
    vscode.commands.registerCommand('neko.tools.compareAssetVariants', () => {
      vscode.window.showInformationMessage('Asset variant comparison - Coming soon');
    }),
    vscode.commands.registerCommand('neko.tools.showMediaInfo', async (uri: vscode.Uri) => {
      if (uri) {
        vscode.window.showInformationMessage(`Media info for: ${uri.fsPath}`);
        // TODO: Implement media info display
      }
    })
  );
}

export function deactivate() {}
