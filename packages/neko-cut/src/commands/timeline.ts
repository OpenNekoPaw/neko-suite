/**
 * Timeline Commands - Register timeline-related commands
 */
import * as vscode from 'vscode';
import { VideoEditorProvider } from '../editor';

export function registerTimelineCommands(
  context: vscode.ExtensionContext,
  editorProvider: VideoEditorProvider
): void {
  // Get Timeline Info
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.timeline.getInfo', async () => {
      const info = await editorProvider.getTimelineInfo();
      if (info) {
        vscode.window.showInformationMessage(
          `Timeline: ${info.name} | Duration: ${info.duration}s | ${info.width}x${info.height} @ ${info.fps}fps`
        );
      } else {
        vscode.window.showWarningMessage('No active video editor');
      }
      return info;
    })
  );

  // List Elements
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.timeline.listElements', async () => {
      return editorProvider.listElements();
    })
  );

  // Add Element
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.element.add', async (config) => {
      return editorProvider.addElement(config);
    })
  );

  // Update Element
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.element.update', async (args) => {
      return editorProvider.updateElement(args.id, args.updates);
    })
  );

  // Delete Element
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.element.delete', async (args) => {
      return editorProvider.deleteElement(args.id);
    })
  );

  // Get Element Info
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.element.getInfo', async (args) => {
      const elements = await editorProvider.listElements();
      return elements.find((e) => (e as { id?: string }).id === args.id);
    })
  );
}
