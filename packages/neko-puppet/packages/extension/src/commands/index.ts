/**
 * NekoPuppet command registration
 */
import * as vscode from 'vscode';
import { handleError } from '../utils/errorHandler';

/** Default .nkp puppet project template */
function getPuppetTemplate(name: string): string {
  const data = {
    version: '1.0',
    name,
    puppet: { src: null },
    parameters: {},
    viewport: { zoom: 1.0 },
  };
  return JSON.stringify(data, null, 2);
}

export function registerCommands(context: vscode.ExtensionContext): void {
  // New Puppet - create .nkp file with inline rename
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.puppet.new', async (uri?: vscode.Uri) => {
      let targetFolder: vscode.Uri | undefined = uri;
      if (!targetFolder) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
          targetFolder = workspaceFolders[0]?.uri;
        }
      }
      if (!targetFolder) {
        vscode.window.showErrorMessage(vscode.l10n.t('neko.puppet.new.noFolder'));
        return;
      }

      const baseName = 'Untitled';
      const ext = '.nkp';
      let fileName = `${baseName}${ext}`;
      let fileUri = vscode.Uri.joinPath(targetFolder, fileName);
      let counter = 1;
      while (true) {
        try {
          await vscode.workspace.fs.stat(fileUri);
          fileName = `${baseName}-${counter}${ext}`;
          fileUri = vscode.Uri.joinPath(targetFolder, fileName);
          counter++;
        } catch {
          break;
        }
      }

      try {
        const title = fileName.replace(/\.nkp$/, '');
        const content = getPuppetTemplate(title);
        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf-8'));
        await vscode.commands.executeCommand('revealInExplorer', fileUri);
        await new Promise((resolve) => setTimeout(resolve, 200));
        await vscode.commands.executeCommand('renameFile');
      } catch (error) {
        await handleError(error, { showToUser: true });
      }
    }),
  );
}
