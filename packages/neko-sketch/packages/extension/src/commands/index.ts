/**
 * NekoSketch command registration
 */
import * as vscode from 'vscode';
import type { SketchImportContext } from '@neko/shared';
import type { SketchEditorProvider } from '../editor/sketchEditorProvider';
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
        name: vscode.l10n.t('neko.sketch.template.layer.background'),
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
        name: vscode.l10n.t('neko.sketch.template.layer.default'),
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
    'neko.sketch.selectEraser',
    'neko.sketch.selectMove',
    'neko.sketch.selectShape',
    'neko.sketch.selectZoom',
    'neko.sketch.selectFill',
    'neko.sketch.selectSelect',
    'neko.sketch.selectTransform',
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

  // Import image data — accepts base64 string + name, injects directly as a new layer.
  // Used by neko-agent SketchGenerate tool for AI-generated image import.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.sketch.importImageData',
      (base64: string, name: string) => {
        editorProvider.postImageData(base64, name);
      },
    ),
  );

  // ─── Phase 2: Cross-module workflow commands ───

  // Send current canvas export to neko-cut timeline
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.sketch.sendToTimeline', async () => {
      const base64 = await editorProvider.requestExport();
      if (!base64) {
        vscode.window.showWarningMessage(vscode.l10n.t('neko.sketch.sendToTimeline.noCanvas'));
        return;
      }
      try {
        await vscode.commands.executeCommand('neko.cut.importGeneratedClip', {
          data: base64,
          type: 'image',
          name: 'sketch-export',
          duration: 3,
          source: 'sketch',
        });
      } catch {
        vscode.window.showErrorMessage(vscode.l10n.t('neko.sketch.sendToTimeline.failed'));
      }
    }),
  );

  // Send current canvas export back to the source Canvas node
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.sketch.sendToCanvas', async () => {
      const ctx = editorProvider.getImportContext();
      if (!ctx?.sourceNodeId) {
        vscode.window.showWarningMessage(vscode.l10n.t('neko.sketch.sendToCanvas.noContext'));
        return;
      }
      const base64 = await editorProvider.requestExport();
      if (!base64) {
        vscode.window.showWarningMessage(vscode.l10n.t('neko.sketch.sendToCanvas.noCanvas'));
        return;
      }
      try {
        await vscode.commands.executeCommand('neko.canvas.updateNodeImage', {
          nodeId: ctx.sourceNodeId,
          cellId: ctx.metadata?.['cellId'],
          imageData: base64,
        });
      } catch {
        vscode.window.showErrorMessage(vscode.l10n.t('neko.sketch.sendToCanvas.failed'));
      }
    }),
  );

  // Open an image in Sketch with optional source context (called by canvas/preview)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.sketch.editImage',
      async (args: { base64: string; name: string; context: SketchImportContext }) => {
        if (editorProvider.isActive()) {
          editorProvider.importImageWithContext(args.base64, args.name, args.context);
        } else {
          // Create a temp .nks file so the custom editor opens
          const workspaceFolders = vscode.workspace.workspaceFolders;
          if (!workspaceFolders?.[0]) {
            vscode.window.showErrorMessage(vscode.l10n.t('neko.sketch.editImage.noWorkspace'));
            return;
          }
          const tempDir = vscode.Uri.joinPath(workspaceFolders[0].uri, '.neko', 'temp');
          try {
            await vscode.workspace.fs.createDirectory(tempDir);
          } catch {
            // Directory may already exist
          }
          const tempFile = vscode.Uri.joinPath(tempDir, `edit-${Date.now()}.nks`);
          const content = getSketchTemplate('Sketch Edit');
          await vscode.workspace.fs.writeFile(tempFile, Buffer.from(content, 'utf-8'));
          // Store import as pending — provider will inject it once the editor is ready
          editorProvider.importImageWithContext(args.base64, args.name, args.context);
          await vscode.commands.executeCommand('vscode.openWith', tempFile, 'neko.sketchEditor');
        }
      },
    ),
  );

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
