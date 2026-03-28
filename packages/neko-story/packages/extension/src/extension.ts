import * as vscode from 'vscode';
import { createVSCodeLogger } from '@neko/shared/vscode/extension';
import { FountainDocumentSymbolProvider } from './providers/documentSymbol';
import { FountainCompletionProvider } from './providers/completion';
import { FountainDefinitionProvider, FountainReferenceProvider } from './providers/definition';
import { FountainHoverProvider } from './providers/hover';
import { FountainWorkspaceSymbolProvider } from './providers/workspaceSymbol';
import { FountainDocumentLinkProvider } from './providers/documentLink';
import { FountainDiagnosticsProvider } from './providers/diagnostics';
import { PreviewPanel } from './panels/PreviewPanel';
import { getStoryTemplate } from './templates/storyTemplate';
import { WorkspaceIndexService } from './services/WorkspaceIndexService';
import { setRootLogger, getRootLogger } from './utils/logger';
import * as path from 'path';
import { parse } from '@neko-story/parser';
import { TimelineConverter, formatDuration } from './converters/TimelineConverter';

const FOUNTAIN_SELECTOR: vscode.DocumentSelector = { language: 'nekostory' };

export function activate(context: vscode.ExtensionContext) {
  const rootLogger = createVSCodeLogger('Neko Story', 'NekoStory', context);
  setRootLogger(rootLogger);
  const logger = getRootLogger();

  logger.info('Extension activated');

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
      new FountainDocumentSymbolProvider(),
    ),
    // Auto-completion (cross-file via index)
    vscode.languages.registerCompletionItemProvider(
      FOUNTAIN_SELECTOR,
      new FountainCompletionProvider(indexService),
      '.', // Trigger on period for forced scene headings
      '@', // Trigger on @ for forced characters
    ),
    // Go to definition (cross-file via index)
    vscode.languages.registerDefinitionProvider(
      FOUNTAIN_SELECTOR,
      new FountainDefinitionProvider(indexService),
    ),
    // Find references (cross-file via index)
    vscode.languages.registerReferenceProvider(
      FOUNTAIN_SELECTOR,
      new FountainReferenceProvider(indexService),
    ),
    // Hover information (cross-file stats via index)
    vscode.languages.registerHoverProvider(
      FOUNTAIN_SELECTOR,
      new FountainHoverProvider(indexService),
    ),
    // Workspace symbol search — Ctrl+T (cross-file via index)
    vscode.languages.registerWorkspaceSymbolProvider(
      new FountainWorkspaceSymbolProvider(indexService),
    ),
    // Document links — [[see: file.fountain]] clickable
    vscode.languages.registerDocumentLinkProvider(
      FOUNTAIN_SELECTOR,
      new FountainDocumentLinkProvider(),
    ),
  );

  // Register diagnostics provider (error underlining)
  const diagnosticsProvider = new FountainDiagnosticsProvider(indexService);
  diagnosticsProvider.activate();
  context.subscriptions.push(diagnosticsProvider);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.story.preview', () => {
      PreviewPanel.createOrShow(context.extensionUri);
    }),
    vscode.commands.registerCommand('neko.story.toTimeline', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'nekostory') {
        vscode.window.showErrorMessage('请在剧本文件中执行此命令');
        return;
      }

      const text = editor.document.getText();
      const doc = parse(text);
      const baseName = path.basename(
        editor.document.fileName,
        path.extname(editor.document.fileName),
      );

      const converter = new TimelineConverter();
      const result = converter.convert(doc, baseName);

      const picked = await vscode.window.showQuickPick(
        [
          {
            label: '$(file-add) 新建 neko-cut 项目',
            description: `${result.sceneCount} 个场景 · 约 ${formatDuration(result.totalDurationSec)} · ${result.characterNames.length} 个角色`,
          },
        ],
        {
          placeHolder: '预览：剧本将转换为以下时间线，确认后选择保存位置',
          title: '剧本 → 时间线',
        },
      );

      if (!picked) return;

      const defaultUri = vscode.Uri.file(
        path.join(path.dirname(editor.document.fileName), `${baseName}.neko`),
      );

      const saveUri = await vscode.window.showSaveDialog({
        defaultUri,
        filters: { 'Neko Cut Project': ['neko'] },
        title: '保存时间线项目',
      });

      if (!saveUri) return;

      const json = JSON.stringify(result.project, null, 2);
      await vscode.workspace.fs.writeFile(saveUri, Buffer.from(json, 'utf-8'));

      await vscode.commands.executeCommand('vscode.openWith', saveUri, 'neko.cut.editor');
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
        vscode.window.showErrorMessage(vscode.l10n.t('neko.story.newFile.noFolder'));
        return;
      }

      // Generate a unique default file name (Untitled.fountain, Untitled-1.fountain, ...)
      const baseName = 'Untitled';
      const ext = '.fountain';
      let fileName = `${baseName}${ext}`;
      let fileUri = vscode.Uri.joinPath(targetFolder, fileName);
      let counter = 1;
      while (true) {
        try {
          await vscode.workspace.fs.stat(fileUri);
          // File exists, try next name
          fileName = `${baseName}-${counter}${ext}`;
          fileUri = vscode.Uri.joinPath(targetFolder, fileName);
          counter++;
        } catch {
          // File does not exist — use this name
          break;
        }
      }

      // Create file with template content
      const title = fileName.replace(/\.fountain$/, '');
      const content = getStoryTemplate(title);
      await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf-8'));

      // Reveal in explorer and trigger inline rename
      await vscode.commands.executeCommand('revealInExplorer', fileUri);
      await vscode.commands.executeCommand('renameFile');
    }),
  );

  // Expose API for cross-extension communication (e.g., neko-agent pipeline)
  const api = {
    /**
     * Parse Fountain screenplay text into structured document
     */
    parseScript(content: string) {
      return parse(content);
    },

    /**
     * Convert parsed Fountain document to neko-cut timeline ProjectData
     */
    convertToTimeline(fountainContent: string, projectName = 'Untitled') {
      const doc = parse(fountainContent);
      const converter = new TimelineConverter();
      return converter.convert(doc, projectName);
    },

    /**
     * Returns a structured ScriptIndex for the given file path or URI string,
     * suitable for agent tools (Read offset/limit access patterns).
     * Returns undefined if the file has not been indexed yet.
     */
    getScriptIndex(uriOrPath: string) {
      const uri =
        uriOrPath.startsWith('file://') || uriOrPath.includes('://')
          ? vscode.Uri.parse(uriOrPath)
          : vscode.Uri.file(uriOrPath);
      return indexService.getScriptIndex(uri);
    },
  };

  return api;
}

export function deactivate() {}
