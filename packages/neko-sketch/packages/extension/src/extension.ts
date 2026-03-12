/**
 * NekoSketch Extension - Professional 2D drawing and painting tools
 *
 * Main entry point for the NekoSketch extension.
 * Provides custom editor for .nks files with a WebGL-based drawing canvas.
 */
import * as vscode from 'vscode';
import { createVSCodeLogger, VSCodeErrorHandler } from '@neko/shared/vscode/extension';
import { SketchEditorProvider } from './editor';
import { LayerOutlineProvider, SketchStatusBar } from './views';
import { setRootLogger, getRootLogger } from './utils/logger';
import { setErrorHandler } from './utils/errorHandler';
import { registerCommands } from './commands';

// Extension state
let sketchEditorProvider: SketchEditorProvider;
let layerOutlineProvider: LayerOutlineProvider;
let sketchStatusBar: SketchStatusBar;

/**
 * Activate the extension
 */
export function activate(context: vscode.ExtensionContext): void {
  const rootLogger = createVSCodeLogger('Neko Sketch', 'NekoSketch', context);
  setRootLogger(rootLogger);
  setErrorHandler(new VSCodeErrorHandler(rootLogger));
  const logger = getRootLogger();

  logger.info('Activating extension...');

  // Create providers
  sketchEditorProvider = new SketchEditorProvider(context);
  layerOutlineProvider = new LayerOutlineProvider();
  sketchStatusBar = new SketchStatusBar();

  // Wire providers into editor provider for data sync
  sketchEditorProvider.setProviders({
    outline: layerOutlineProvider,
    statusBar: sketchStatusBar,
  });

  // Register custom editor for .nks files
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      SketchEditorProvider.viewType,
      sketchEditorProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false,
      },
    ),
  );

  // Register layer outline tree view
  context.subscriptions.push(
    vscode.window.createTreeView('neko.sketchLayerOutline', {
      treeDataProvider: layerOutlineProvider,
      showCollapseAll: true,
    }),
  );

  // Register disposables
  context.subscriptions.push(layerOutlineProvider);
  context.subscriptions.push(sketchStatusBar);

  // Hide status bar when switching away to text editor
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      sketchStatusBar.hide();
    }),
  );

  // Register commands
  registerCommands(context, sketchEditorProvider);

  logger.info('Extension activated');
}

/**
 * Deactivate the extension
 */
export function deactivate(): void {
  getRootLogger().info('Deactivating extension...');
}
