/**
 * NekoPuppet command registration
 */
import * as vscode from 'vscode';
import { createNewFile } from '@neko/shared/vscode/extension';
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
  // New Puppet - create blank .nkp file with inline rename
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.puppet.new', async (uri?: vscode.Uri) => {
      try {
        await createNewFile({
          targetFolder: uri,
          ext: '.nkp',
          template: (title) => getPuppetTemplate(title),
          noFolderErrorMessage: vscode.l10n.t('neko.puppet.new.noFolder'),
        });
      } catch (error) {
        await handleError(error, { showToUser: true });
      }
    }),
  );
}
