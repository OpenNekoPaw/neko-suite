import * as vscode from 'vscode';
import { createNewFile } from '@neko/shared/vscode/extension';
import { ModelEditorProvider } from './editor/ModelEditorProvider';

/** Default .nkm document template */
function getModelTemplate(_title: string): string {
  return JSON.stringify(
    {
      version: 2,
      scene_snapshot: { nodes: [], animations: [] },
    },
    null,
    2,
  );
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

  // New 3D Model Project
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.model.new', async (uri?: vscode.Uri) => {
      await createNewFile({
        targetFolder: uri,
        ext: '.nkm',
        template: getModelTemplate,
        noFolderErrorMessage: vscode.l10n.t('neko.model.new.noFolder'),
      });
    }),
  );
}
