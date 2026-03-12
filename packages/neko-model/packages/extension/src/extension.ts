import * as vscode from 'vscode';
import { ModelEditorProvider } from './editor/ModelEditorProvider';

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
}

export function deactivate(): void {
  // Cleanup handled by disposables
}
