import * as vscode from 'vscode';
import { createNewFile, generateHumanoidGlb } from '@neko/shared/vscode/extension';
import type { TemplateChoice } from '@neko/shared/vscode/extension';
import { ModelEditorProvider } from './editor/ModelEditorProvider';

/** Default .nkm document template */
function getModelTemplate(title: string, src: string | null = null): string {
  return JSON.stringify(
    {
      version: 2,
      name: title,
      model: { src },
      scene_snapshot: { nodes: [], animations: [] },
    },
    null,
    2,
  );
}

function getModelTemplates(): TemplateChoice[] {
  return [
    {
      id: 'blank',
      label: '$(file) ' + vscode.l10n.t('neko.model.template.blank'),
      description: vscode.l10n.t('neko.model.template.blank.desc'),
      template: (title) => getModelTemplate(title),
    },
    {
      id: 'humanoid',
      label: '$(person) ' + vscode.l10n.t('neko.model.template.humanoid'),
      description: vscode.l10n.t('neko.model.template.humanoid.desc'),
      template: (title) => getModelTemplate(title, `./${title}.glb`),
      assets: async (title) => [{ name: `${title}.glb`, data: generateHumanoidGlb(title) }],
    },
    {
      id: 'import',
      label: '$(folder-opened) ' + vscode.l10n.t('neko.model.template.import'),
      description: vscode.l10n.t('neko.model.template.import.desc'),
      template: (title) => getModelTemplate(title),
    },
  ];
}

let modelEditorProvider: ModelEditorProvider;

export function activate(context: vscode.ExtensionContext): void {
  modelEditorProvider = new ModelEditorProvider(context);

  // Register custom editor
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(ModelEditorProvider.viewType, modelEditorProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  // Register keyboard action commands
  const keyboardActions = [
    'neko.model.deleteSelected',
    'neko.model.escape',
    'neko.model.selectAll',
    'neko.model.undo',
    'neko.model.redo',
    'neko.model.resetView',
  ];

  for (const commandId of keyboardActions) {
    const action = commandId.replace('neko.model.', '');
    context.subscriptions.push(
      vscode.commands.registerCommand(commandId, () => {
        modelEditorProvider.postKeyboardAction(action);
      }),
    );
  }

  // New 3D Model Project — template selection + inline rename
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.model.new', async (uri?: vscode.Uri) => {
      await createNewFile({
        targetFolder: uri,
        ext: '.nkm',
        template: (title) => getModelTemplate(title),
        templates: getModelTemplates(),
        templatePickTitle: vscode.l10n.t('neko.model.new.pickTemplate'),
        noFolderErrorMessage: vscode.l10n.t('neko.model.new.noFolder'),
      });
    }),
  );
}
