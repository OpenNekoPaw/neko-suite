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
  const propertyPanelProvider = new PropertyPanelViewProvider(context);

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
  propertyPanelProvider.onElementPropertyChange((message) => {
    videoEditorProvider.handlePropertyPanelMessage(message);
  });

  propertyPanelProvider.onDefaultsPropertyChange((message) => {
    videoEditorProvider.handlePropertyPanelMessage(message);
  });

  propertyPanelProvider.onAddKeyframe((message) => {
    videoEditorProvider.handlePropertyPanelMessage(message);
  });

  propertyPanelProvider.onRemoveKeyframe((message) => {
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
