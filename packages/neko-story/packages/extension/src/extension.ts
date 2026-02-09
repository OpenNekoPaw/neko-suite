import * as vscode from 'vscode';
import { FountainDocumentSymbolProvider } from './providers/documentSymbol';
import { FountainCompletionProvider } from './providers/completion';
import { FountainDefinitionProvider, FountainReferenceProvider } from './providers/definition';
import { FountainHoverProvider } from './providers/hover';
import { FountainWorkspaceSymbolProvider } from './providers/workspaceSymbol';
import { FountainDocumentLinkProvider } from './providers/documentLink';
import { PreviewPanel } from './panels/PreviewPanel';
import { getStoryTemplate } from './templates/storyTemplate';
import { WorkspaceIndexService } from './services/WorkspaceIndexService';

const FOUNTAIN_SELECTOR: vscode.DocumentSelector = { language: 'nekostory' };

export function activate(context: vscode.ExtensionContext) {
  console.log('Neko Story extension activated');

  // Create shared workspace index service
  const indexService = new WorkspaceIndexService();
  context.subscriptions.push(indexService);
  // Non-blocking background initialization
  void indexService.ensureInitialized();

  // Register language providers
  context.subscriptions.push(
    // Outline view (per-file, no index needed)
    vscode.languages.registerDocumentSymbolProvider(
      FOUNTAIN_SELECTOR,
      new FountainDocumentSymbolProvider()
    ),
    // Auto-completion (cross-file via index)
    vscode.languages.registerCompletionItemProvider(
      FOUNTAIN_SELECTOR,
      new FountainCompletionProvider(indexService),
      '.', // Trigger on period for forced scene headings
      '@'  // Trigger on @ for forced characters
    ),
    // Go to definition (cross-file via index)
    vscode.languages.registerDefinitionProvider(
      FOUNTAIN_SELECTOR,
      new FountainDefinitionProvider(indexService)
    ),
    // Find references (cross-file via index)
    vscode.languages.registerReferenceProvider(
      FOUNTAIN_SELECTOR,
      new FountainReferenceProvider(indexService)
    ),
    // Hover information (cross-file stats via index)
    vscode.languages.registerHoverProvider(
      FOUNTAIN_SELECTOR,
      new FountainHoverProvider(indexService)
    ),
    // Workspace symbol search — Ctrl+T (cross-file via index)
    vscode.languages.registerWorkspaceSymbolProvider(
      new FountainWorkspaceSymbolProvider(indexService)
    ),
    // Document links — [[see: file.fountain]] clickable
    vscode.languages.registerDocumentLinkProvider(
      FOUNTAIN_SELECTOR,
      new FountainDocumentLinkProvider()
    )
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.story.preview', () => {
      PreviewPanel.createOrShow(context.extensionUri);
    }),
    vscode.commands.registerCommand('neko.story.toTimeline', () => {
      vscode.window.showInformationMessage('Convert to timeline - Coming soon');
    }),
    vscode.commands.registerCommand('neko.story.generateStoryboard', () => {
      vscode.window.showInformationMessage('Generate storyboard - Coming soon');
    }),
    vscode.commands.registerCommand('neko.story.newFile', async (uri?: vscode.Uri) => {
      // Determine target folder from context menu uri or workspace root
      let targetFolder: vscode.Uri | undefined = uri;
      if (!targetFolder) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
          targetFolder = workspaceFolders[0]?.uri;
        }
      }
      if (!targetFolder) {
        vscode.window.showErrorMessage(vscode.l10n.t('command.newFile.noFolder'));
        return;
      }

      // Prompt user for file name
      const fileName = await vscode.window.showInputBox({
        prompt: vscode.l10n.t('command.newFile.prompt'),
        placeHolder: 'my-story',
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return vscode.l10n.t('command.newFile.validation');
          }
          return undefined;
        },
      });

      if (!fileName) {
        return; // User cancelled
      }

      // Ensure .fountain extension
      const baseName = fileName.trim();
      const fullName = baseName.endsWith('.fountain')
        || baseName.endsWith('.nks')
        || baseName.endsWith('.story')
        ? baseName
        : `${baseName}.fountain`;

      const fileUri = vscode.Uri.joinPath(targetFolder, fullName);

      // Check if file already exists
      try {
        await vscode.workspace.fs.stat(fileUri);
        vscode.window.showErrorMessage(
          vscode.l10n.t('command.newFile.exists', fullName)
        );
        return;
      } catch {
        // File does not exist — proceed
      }

      // Create file with template content
      const title = baseName.replace(/\.(fountain|nks|story)$/, '');
      const content = getStoryTemplate(title);
      await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf-8'));

      // Open the new file
      const doc = await vscode.workspace.openTextDocument(fileUri);
      await vscode.window.showTextDocument(doc);
    })
  );
}

export function deactivate() {}
