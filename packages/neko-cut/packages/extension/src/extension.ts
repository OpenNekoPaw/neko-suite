/**
 * NekoCut Extension - Professional video editor for VSCode
 *
 * Main entry point using the new architecture with:
 * - ServiceCollection for dependency injection
 * - EditorRegistry + Model pattern
 * - Bootstrap services for MCP, Platform, Workflow
 */
import * as vscode from 'vscode';
import { ServiceCollection, setGlobalServices } from './base';
import { bootstrapCoreServices, logServicesStatus } from './bootstrap';
import { VideoEditorProvider } from './editor/video/videoEditorProvider';
import { PropertyPanelViewProvider } from './propertyPanel/propertyPanelViewProvider';
import { registerCommands } from './commands';

/**
 * Activate the extension
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('[NekoCut] Activating extension...');

  // Initialize service collection
  const services = new ServiceCollection();
  setGlobalServices(services);

  // Bootstrap core services (Platform, MCP, Tools, etc.)
  const bootstrapResult = await bootstrapCoreServices(services, context);
  logServicesStatus(bootstrapResult);

  // Create providers
  const videoEditorProvider = new VideoEditorProvider(context);
  const propertyPanelProvider = new PropertyPanelViewProvider(context.extensionUri, context);

  // Register custom editor (CustomTextEditorProvider for .jvi files)
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      'neko.videoEditor',
      videoEditorProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false,
      }
    )
  );

  // Register property panel view
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      PropertyPanelViewProvider.viewType,
      propertyPanelProvider
    )
  );

  // Register outline view
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      'neko.projectOutline',
      bootstrapResult.outlineProvider
    )
  );

  // Register commands
  registerCommands(context, bootstrapResult.outlineProvider, videoEditorProvider);

  // Register media preview command (opens in neko-preview's customEditor)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.cut.previewMedia', async (uri?: vscode.Uri) => {
      if (!uri) return;

      const ext = uri.fsPath.split('.').pop()?.toLowerCase() ?? '';
      const videoExts = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'ts', 'flv', 'wmv'];
      const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'];

      try {
        if (videoExts.includes(ext)) {
          await vscode.commands.executeCommand('vscode.openWith', uri, 'neko.videoPreview');
        } else if (audioExts.includes(ext)) {
          await vscode.commands.executeCommand('vscode.openWith', uri, 'neko.audioPreview');
        }
      } catch (error) {
        console.error('[NekoCut] Failed to open media preview:', error);
      }
    })
  );

  // Connect property panel to element selection
  videoEditorProvider.onElementSelected((event) => {
    propertyPanelProvider.updateSelectedElement(
      event.element,
      event.trackId,
      event.currentTime
    );
  });

  // Connect property panel to current time updates
  videoEditorProvider.onCurrentTimeUpdate((event) => {
    propertyPanelProvider.updateCurrentTime(event.currentTime);
  });

  // Connect property panel to project defaults updates
  videoEditorProvider.onProjectDefaultsUpdate((event) => {
    propertyPanelProvider.updateProjectDefaults(event.defaults);
  });

  // Connect property panel changes back to editor
  propertyPanelProvider.onDidChangeProperty((message) => {
    videoEditorProvider.handlePropertyPanelMessage(message);
  });

  propertyPanelProvider.onDidChangeDefaults((message) => {
    videoEditorProvider.handlePropertyPanelMessage(message);
  });

  propertyPanelProvider.onDidAddKeyframe((message) => {
    videoEditorProvider.handlePropertyPanelMessage(message);
  });

  propertyPanelProvider.onDidRemoveKeyframe((message) => {
    videoEditorProvider.handlePropertyPanelMessage(message);
  });

  console.log('[NekoCut] Extension activated');
}

/**
 * Deactivate the extension
 */
export function deactivate(): void {
  console.log('[NekoCut] Deactivating extension...');
}
