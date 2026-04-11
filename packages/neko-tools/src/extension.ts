import * as vscode from 'vscode';
import {
  bootstrapNekoToolsExtension,
  type INekoToolsExtensionActivation,
} from '../packages/extension/src/bootstrap';

let activation: INekoToolsExtensionActivation | undefined;

export function activate(context: vscode.ExtensionContext): void {
  activation = bootstrapNekoToolsExtension(context);
}

export function deactivate(): void {
  activation?.dispose();
  activation = undefined;
}
