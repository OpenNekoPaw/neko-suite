/**
 * NekoSketch command registration
 */
import * as vscode from 'vscode';
import type { SketchEditorProvider } from '../editor/sketchEditorProvider';
import { handleError } from '../utils/errorHandler';

/** Default .nks document template */
function getSketchTemplate(name: string, width = 1920, height = 1080): string {
  const data = {
    version: '1.0',
    canvas: {
      width,
      height,
      dpi: 72,
      backgroundColor: '#ffffff',
    },
    layers: [
      {
        id: 'layer-1',
        name: 'Background',
        type: 'fill',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        width,
        height,
        offsetX: 0,
        offsetY: 0,
        clippingMask: false,
        maskLayerId: null,
        children: [],
      },
      {
        id: 'layer-2',
        name: 'Layer 1',
        type: 'raster',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        width,
        height,
        offsetX: 0,
        offsetY: 0,
        clippingMask: false,
        maskLayerId: null,
        children: [],
      },
    ],
    brushPresets: [],
    palette: ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff'],
    viewport: { panX: 0, panY: 0, zoom: 1 },
  };
  return JSON.stringify(data, null, 2);
}

export function registerCommands(
  context: vscode.ExtensionContext,
  editorProvider: SketchEditorProvider,
): void {
  // New Sketch - create .nks file with inline rename
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.sketch.new', async (uri?: vscode.Uri) => {
      let targetFolder: vscode.Uri | undefined = uri;
      if (!targetFolder) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
          targetFolder = workspaceFolders[0]?.uri;
        }
      }
      if (!targetFolder) {
        vscode.window.showErrorMessage(vscode.l10n.t('neko.sketch.new.noFolder'));
        return;
      }

      const baseName = 'Untitled';
      const ext = '.nks';
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
        const title = fileName.replace(/\.nks$/, '');
        const content = getSketchTemplate(title);
        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf-8'));
        await vscode.commands.executeCommand('revealInExplorer', fileUri);
        await new Promise((resolve) => setTimeout(resolve, 200));
        await vscode.commands.executeCommand('renameFile');
      } catch (error) {
        await handleError(error, { showToUser: true });
      }
    }),
  );

  // Import image file
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.sketch.import', () => {
      editorProvider.postKeyboardAction('import');
    }),
  );

  // Export
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.sketch.export', () => {
      editorProvider.postKeyboardAction('export');
    }),
  );

  // Keyboard shortcuts forwarded to webview
  const keyboardActions = [
    'neko.sketch.deleteSelected',
    'neko.sketch.escape',
    'neko.sketch.selectAll',
    'neko.sketch.undo',
    'neko.sketch.redo',
    'neko.sketch.selectBrush',
    'neko.sketch.adjustSize',
    'neko.sketch.pickColor',
  ];
  for (const commandId of keyboardActions) {
    const action = commandId.replace('neko.sketch.', '');
    context.subscriptions.push(
      vscode.commands.registerCommand(commandId, () => {
        editorProvider.postKeyboardAction(action);
      }),
    );
  }

  // Outline: select layer from tree view
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.sketch.selectLayerFromOutline', (layerId: string) => {
      editorProvider.postKeyboardAction('selectLayer:' + layerId);
    }),
  );

  // Reset zoom
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.sketch.resetZoom', () => {
      editorProvider.postKeyboardAction('resetZoom');
    }),
  );

  // Export sprite sheet
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.sketch.exportSpriteSheet', () => {
      editorProvider.postKeyboardAction('exportSpriteSheet');
    }),
  );

  // Export scene
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.sketch.exportScene', () => {
      editorProvider.postKeyboardAction('exportScene');
    }),
  );

  // Import asset
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.sketch.importAsset', () => {
      editorProvider.postKeyboardAction('importAsset');
    }),
  );
}
