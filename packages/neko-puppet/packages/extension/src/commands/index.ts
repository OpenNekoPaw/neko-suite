/**
 * NekoPuppet command registration
 */
import * as vscode from 'vscode';
import { createNewFile, generateHumanoidInp } from '@neko/shared/vscode/extension';
import type { TemplateChoice } from '@neko/shared/vscode/extension';
import { handleError } from '../utils/errorHandler';

/** Default .nkp puppet project template */
function getPuppetTemplate(name: string, src: string | null = null): string {
  const data = {
    version: '1.0',
    name,
    puppet: { src },
    parameters: {},
    viewport: { zoom: 1.0 },
  };
  return JSON.stringify(data, null, 2);
}

function getPuppetTemplates(): TemplateChoice[] {
  return [
    {
      id: 'blank',
      label: '$(file) ' + vscode.l10n.t('neko.puppet.template.blank'),
      description: vscode.l10n.t('neko.puppet.template.blank.desc'),
      template: (title) => getPuppetTemplate(title),
    },
    {
      id: 'humanoid',
      label: '$(person) ' + vscode.l10n.t('neko.puppet.template.humanoid'),
      description: vscode.l10n.t('neko.puppet.template.humanoid.desc'),
      template: (title) => getPuppetTemplate(title, `./${title}.inp`),
      assets: async (title) => [{ name: `${title}.inp`, data: generateHumanoidInp(title) }],
    },
    {
      id: 'import',
      label: '$(folder-opened) ' + vscode.l10n.t('neko.puppet.template.import'),
      description: vscode.l10n.t('neko.puppet.template.import.desc'),
      template: (title) => getPuppetTemplate(title),
    },
  ];
}

export function registerCommands(context: vscode.ExtensionContext): void {
  // New Puppet - create .nkp file with template selection + inline rename
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.puppet.new', async (uri?: vscode.Uri) => {
      try {
        await createNewFile({
          targetFolder: uri,
          ext: '.nkp',
          template: (title) => getPuppetTemplate(title),
          templates: getPuppetTemplates(),
          templatePickTitle: vscode.l10n.t('neko.puppet.new.pickTemplate'),
          noFolderErrorMessage: vscode.l10n.t('neko.puppet.new.noFolder'),
        });
      } catch (error) {
        await handleError(error, { showToUser: true });
      }
    }),
  );
}
