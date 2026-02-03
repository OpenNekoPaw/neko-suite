/**
 * NekoCut Extension - Professional video editor for VSCode
 *
 * This is the main entry point for the NekoCut extension.
 * It provides video editing capabilities through a custom editor.
 */
import * as vscode from 'vscode';
import { VideoEditorProvider } from './editor';
import { PropertyPanelProvider, ProjectOutlineProvider } from './views';
import { registerTimelineCommands, registerProjectCommands } from './commands';
import type { NekoCutAPI } from './api';

// Extension state
let videoEditorProvider: VideoEditorProvider;
let propertyPanelProvider: PropertyPanelProvider;
let projectOutlineProvider: ProjectOutlineProvider;

/**
 * Check if NekoCutPro extension is installed
 */
function hasProFeatures(): boolean {
  return !!vscode.extensions.getExtension('neko.nekocut-pro');
}

/**
 * Prompt user to install NekoCutPro for advanced features
 */
async function promptProInstall(feature: string): Promise<boolean> {
  if (hasProFeatures()) {
    return true;
  }

  const action = await vscode.window.showInformationMessage(
    `"${feature}" requires NekoCutPro extension. Install now?`,
    'Install',
    'Later'
  );

  if (action === 'Install') {
    await vscode.commands.executeCommand(
      'workbench.extensions.installExtension',
      'neko.nekocut-pro'
    );
    return true;
  }

  return false;
}

/**
 * Activate the extension
 */
export function activate(context: vscode.ExtensionContext): NekoCutAPI {
  console.log('[NekoCut] Activating extension...');

  // Create providers
  videoEditorProvider = new VideoEditorProvider(context);
  propertyPanelProvider = new PropertyPanelProvider(context);
  projectOutlineProvider = new ProjectOutlineProvider();

  // Register custom editor
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      VideoEditorProvider.viewType,
      videoEditorProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false,
      }
    )
  );

  // Register views
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      PropertyPanelProvider.viewType,
      propertyPanelProvider
    )
  );

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      'neko.projectOutline',
      projectOutlineProvider
    )
  );

  // Register commands
  registerProjectCommands(context);
  registerTimelineCommands(context, videoEditorProvider);

  // Connect property panel to element selection
  videoEditorProvider.onDidSelectElement((event) => {
    if (event.element) {
      propertyPanelProvider.updateSelectedElement(event.element);
    } else {
      propertyPanelProvider.clearSelection();
    }
  });

  console.log('[NekoCut] Extension activated');

  // Return API for other extensions
  const api: NekoCutAPI = {
    timeline: {
      getInfo: () => videoEditorProvider.getTimelineInfo(),
      addElement: (config) => videoEditorProvider.addElement(config),
      updateElement: (id, updates) => videoEditorProvider.updateElement(id, updates),
      deleteElement: (id) => videoEditorProvider.deleteElement(id),
      listElements: () => videoEditorProvider.listElements(),
    },
    events: {
      onDidChangeTimeline: videoEditorProvider.onDidChangeTimeline,
      onDidSelectElement: videoEditorProvider.onDidSelectElement,
      onDidChangePlayback: videoEditorProvider.onDidChangePlayback,
    },
    hasProFeatures,
    promptProInstall,
  };

  return api;
}

/**
 * Deactivate the extension
 */
export function deactivate(): void {
  console.log('[NekoCut] Deactivating extension...');
}
