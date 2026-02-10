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
    }),

    // Preview media files with neko-preview (hardware-accelerated customEditor)
    vscode.commands.registerCommand('neko.assets.previewMedia', async (uri?: vscode.Uri) => {
      if (!uri) {
        // Called from command palette — show file picker
        const fileUri = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectMany: false,
          filters: {
            'Media Files': [
              'mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'ts', 'flv', 'wmv',
              'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus',
            ],
          },
        });
        if (!fileUri?.[0]) return;
        uri = fileUri[0];
      }

      const ext = uri.fsPath.split('.').pop()?.toLowerCase() ?? '';
      const videoExts = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'ts', 'flv', 'wmv'];
      const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'];

      try {
        if (videoExts.includes(ext)) {
          await vscode.commands.executeCommand('vscode.openWith', uri, 'neko.videoPreview');
        } else if (audioExts.includes(ext)) {
          await vscode.commands.executeCommand('vscode.openWith', uri, 'neko.audioPreview');
        }
      } catch (error) {
        console.error('[Neko Assets] Failed to open media preview:', error);
        vscode.window.showErrorMessage(`Failed to preview: ${uri.fsPath}`);
      }
    })
  );
}

export function deactivate() {}
