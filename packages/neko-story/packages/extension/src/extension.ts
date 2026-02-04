import * as vscode from 'vscode';
import { FountainDocumentSymbolProvider } from './providers/documentSymbol';
import { FountainCompletionProvider } from './providers/completion';
import { FountainDefinitionProvider, FountainReferenceProvider } from './providers/definition';
import { FountainHoverProvider } from './providers/hover';
import { PreviewPanel } from './panels/PreviewPanel';

const FOUNTAIN_SELECTOR: vscode.DocumentSelector = { language: 'nekostory' };

export function activate(context: vscode.ExtensionContext) {
  console.log('Neko Story extension activated');

  // Register language providers
  context.subscriptions.push(
    // Outline view
    vscode.languages.registerDocumentSymbolProvider(
      FOUNTAIN_SELECTOR,
      new FountainDocumentSymbolProvider()
    ),
    // Auto-completion
    vscode.languages.registerCompletionItemProvider(
      FOUNTAIN_SELECTOR,
      new FountainCompletionProvider(),
      '.', // Trigger on period for forced scene headings
      '@'  // Trigger on @ for forced characters
    ),
    // Go to definition
    vscode.languages.registerDefinitionProvider(
      FOUNTAIN_SELECTOR,
      new FountainDefinitionProvider()
    ),
    // Find references
    vscode.languages.registerReferenceProvider(
      FOUNTAIN_SELECTOR,
      new FountainReferenceProvider()
    ),
    // Hover information
    vscode.languages.registerHoverProvider(
      FOUNTAIN_SELECTOR,
      new FountainHoverProvider()
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
    })
  );
}

export function deactivate() {}
