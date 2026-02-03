/**
 * Project Commands - Register project-related commands
 */
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export function registerProjectCommands(context: vscode.ExtensionContext): void {
  // New Project
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.newProject', async (uri?: vscode.Uri) => {
      // Get target folder
      let targetFolder: string;
      if (uri) {
        targetFolder = uri.fsPath;
      } else {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
          vscode.window.showErrorMessage('Please open a folder first');
          return;
        }
        targetFolder = folders[0].uri.fsPath;
      }

      // Ask for project name
      const projectName = await vscode.window.showInputBox({
        prompt: 'Enter project name',
        value: 'Untitled',
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Project name cannot be empty';
          }
          return null;
        },
      });

      if (!projectName) {
        return;
      }

      // Create project file
      const projectFile = path.join(targetFolder, `${projectName}.jvi`);

      const defaultProject = {
        version: '1.0.0',
        name: projectName,
        settings: {
          width: 1920,
          height: 1080,
          fps: 30,
          duration: 0,
        },
        tracks: [],
        elements: [],
      };

      try {
        fs.writeFileSync(projectFile, JSON.stringify(defaultProject, null, 2));
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(projectFile));
        await vscode.commands.executeCommand('vscode.openWith', doc.uri, 'neko.videoEditor');
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to create project: ${error}`);
      }
    })
  );

  // Add to Timeline
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.addToTimeline', async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage('No file selected');
        return;
      }

      // Check if there's an active video editor
      const activeEditor = vscode.window.activeTextEditor;
      // TODO: Get active video editor and add element
      vscode.window.showInformationMessage(`Adding ${path.basename(uri.fsPath)} to timeline`);
    })
  );

  // Open in Editor
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.openInEditor', async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage('No file selected');
        return;
      }

      await vscode.commands.executeCommand('vscode.openWith', uri, 'neko.videoEditor');
    })
  );
}
