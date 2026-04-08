import * as vscode from 'vscode';
import type {
  AgentContextPayload,
  AssetEntity,
  NekoAgentAPI,
  NekoAssetsAPI,
  NekoStoryAPI,
} from '@neko/shared';
import { NEKO_EXTENSION_IDS } from '@neko/shared';
import { createNekoStoryCapabilityProvider } from './agentCapabilityProvider';
import {
  createVSCodeLogger,
  createNewFile,
  VSCodeErrorHandler,
} from '@neko/shared/vscode/extension';
import { setErrorHandler } from './utils/errorHandler';
import { FountainDocumentSymbolProvider } from './providers/documentSymbol';
import { FountainCompletionProvider } from './providers/completion';
import { FountainDefinitionProvider, FountainReferenceProvider } from './providers/definition';
import { FountainHoverProvider } from './providers/hover';
import { FountainWorkspaceSymbolProvider } from './providers/workspaceSymbol';
import { FountainDocumentLinkProvider } from './providers/documentLink';
import { FountainDiagnosticsProvider } from './providers/diagnostics';
import { FountainInlineCompletionProvider } from './providers/inlineCompletion';
import { PreviewPanel } from './panels/PreviewPanel';
import { getStoryTemplate } from './templates/storyTemplate';
import { WorkspaceIndexService } from './services/WorkspaceIndexService';
import { CharacterWorkspaceIndexService } from './services/CharacterWorkspaceIndexService';
import { setRootLogger, getRootLogger } from './utils/logger';
import * as path from 'path';
import { parse } from '@neko-story/parser';
import { TimelineConverter, formatDuration } from './converters/TimelineConverter';

const FOUNTAIN_SELECTOR: vscode.DocumentSelector = { language: 'nekostory' };

export function activate(context: vscode.ExtensionContext) {
  const rootLogger = createVSCodeLogger('Neko Story', 'NekoStory', context);
  setRootLogger(rootLogger);
  setErrorHandler(new VSCodeErrorHandler(rootLogger));
  const logger = getRootLogger();

  logger.info('Extension activated');

  const occurrenceLookup = createAgentOccurrenceLookup();
  const assetLookup = createAssetsEntityLookup();

  const characterIndexService = new CharacterWorkspaceIndexService();
  context.subscriptions.push(characterIndexService);
  void characterIndexService.ensureInitialized();

  // Create shared workspace index service
  const indexService = new WorkspaceIndexService(characterIndexService);
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
      new FountainDefinitionProvider(indexService, characterIndexService, assetLookup),
    ),
    // Find references (cross-file via index)
    vscode.languages.registerReferenceProvider(
      FOUNTAIN_SELECTOR,
      new FountainReferenceProvider(
        indexService,
        characterIndexService,
        occurrenceLookup,
        assetLookup,
      ),
    ),
    // Hover information (cross-file stats via index)
    vscode.languages.registerHoverProvider(
      FOUNTAIN_SELECTOR,
      new FountainHoverProvider(indexService, characterIndexService, assetLookup),
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
    // LLM ghost text — 400 ms debounce, delegates to neko.agent.internalChat
    vscode.languages.registerInlineCompletionItemProvider(
      FOUNTAIN_SELECTOR,
      new FountainInlineCompletionProvider(),
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
    vscode.commands.registerCommand(
      'neko.story.applyInlineDiff',
      async (params: {
        scriptPath: string;
        range: {
          start: { line: number; character: number };
          end: { line: number; character: number };
        };
        newText: string;
      }) => {
        const uri = vscode.Uri.file(params.scriptPath);
        const document = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(document, { preserveFocus: false });

        // Highlight the range so the user can see what will change
        const vsRange = new vscode.Range(
          params.range.start.line,
          params.range.start.character,
          params.range.end.line,
          params.range.end.character,
        );
        editor.selection = new vscode.Selection(vsRange.start, vsRange.end);
        editor.revealRange(vsRange, vscode.TextEditorRevealType.InCenter);

        const originalText = document.getText(vsRange);
        const preview = params.newText.slice(0, 120) + (params.newText.length > 120 ? '…' : '');
        const answer = await vscode.window.showInformationMessage(
          `AI 建议修改：\n"${preview}"`,
          { modal: true },
          '接受',
          '拒绝',
        );

        if (answer === '接受') {
          const edit = new vscode.WorkspaceEdit();
          edit.replace(uri, vsRange, params.newText);
          await vscode.workspace.applyEdit(edit);
        } else {
          // Restore selection to nothing on reject
          editor.selection = new vscode.Selection(vsRange.start, vsRange.start);
          void originalText; // suppress unused warning
        }
      },
    ),
    vscode.commands.registerCommand('neko.story.sendToAgent', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'nekostory') return;

      const selection = editor.selection;
      const selectedText = editor.document.getText(selection.isEmpty ? undefined : selection);
      const scriptPath = editor.document.uri.fsPath;

      // Determine nearest scene heading above cursor
      let sceneLabel = 'Story Selection';
      if (!selection.isEmpty) {
        const line = selection.start.line;
        for (let i = line; i >= 0; i--) {
          const lineText = editor.document.lineAt(i).text.trim();
          if (/^(INT|EXT|INT\.\/EXT|I\/E)[. ]/i.test(lineText)) {
            sceneLabel = lineText.length > 40 ? lineText.slice(0, 38) + '…' : lineText;
            break;
          }
        }
      } else {
        // No selection — use file name as label
        const baseName = scriptPath.split('/').pop() ?? scriptPath;
        sceneLabel = baseName.replace(/\.fountain$/, '');
      }

      const summary = selectedText
        ? `Scene: ${sceneLabel}\n\n${selectedText.slice(0, 400)}${selectedText.length > 400 ? '…' : ''}`
        : `Script file: ${scriptPath.split('/').pop() ?? scriptPath}`;

      const payload: AgentContextPayload = {
        type: 'story-selection',
        id: `story:${scriptPath}:${selection.start.line}`,
        label: sceneLabel,
        summary,
        data: {
          scriptPath,
          selectedText: selectedText || null,
          range: selection.isEmpty
            ? null
            : {
                start: { line: selection.start.line, character: selection.start.character },
                end: { line: selection.end.line, character: selection.end.character },
              },
        },
        intent: selectedText ? '请帮我改写这段内容：' : undefined,
      };

      try {
        await vscode.commands.executeCommand('neko.agent.sendContext', payload);
      } catch {
        // neko-agent extension not installed or not activated — silently ignore
      }
    }),
    vscode.commands.registerCommand('neko.story.scriptTableView', () => {
      const panel = PreviewPanel.createOrShow(context.extensionUri);
      panel?.postMessage({ type: 'setView', view: 'table' });
    }),
    vscode.commands.registerCommand('neko.story.creativeGridView', () => {
      const panel = PreviewPanel.createOrShow(context.extensionUri);
      panel?.postMessage({ type: 'setView', view: 'grid' });
    }),
    vscode.commands.registerCommand('neko.story.newFile', async (uri?: vscode.Uri) => {
      await createNewFile({
        targetFolder: uri,
        ext: '.fountain',
        template: (title) => getStoryTemplate(title),
        noFolderErrorMessage: vscode.l10n.t('neko.story.newFile.noFolder'),
      });
    }),
  );

  // Expose API for cross-extension communication (e.g., neko-agent pipeline)
  const api: NekoStoryAPI = {
    /**
     * Parse Fountain screenplay text into structured document
     */
    parseScript(content: string) {
      const doc = parse(content);
      // Extract title from titlePage entries (key='Title' by Fountain convention)
      const title = doc.titlePage?.entries.find((e) => e.key.toLowerCase() === 'title')?.value;
      return {
        title,
        elements: doc.elements.map((el) => ({
          type: el.type,
          text: 'text' in el ? (el.text as string) : '',
          ...(el as unknown as Record<string, unknown>),
        })),
      };
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

    entities: {
      async findOccurrences(entity) {
        await indexService.ensureInitialized();
        return [...indexService.listOccurrences(entity)];
      },

      async findCharacterOccurrences(characterId: string) {
        await indexService.ensureInitialized();
        return [...indexService.listOccurrencesByCharacterId(characterId)];
      },

      async suggestCharacterMatches(name, options) {
        await characterIndexService.ensureInitialized();
        return characterIndexService.suggestCharacters(name, options);
      },
    },
  };

  // Register capability provider with neko-agent (if installed)
  try {
    const provider = createNekoStoryCapabilityProvider(api);
    void vscode.commands.executeCommand('neko.agent.registerCapabilities', provider);
  } catch {
    // neko-agent not installed — silently ignore
  }

  return api;
}

export function deactivate() {}

function createAgentOccurrenceLookup() {
  return {
    async findOccurrences(entity) {
      const extension = vscode.extensions.getExtension<NekoAgentAPI>(NEKO_EXTENSION_IDS.NEKO_AGENT);
      if (!extension) {
        return [];
      }

      try {
        const api = extension.isActive
          ? extension.exports
          : ((await extension.activate()) as NekoAgentAPI);
        return api.entities.findOccurrences(entity);
      } catch {
        return [];
      }
    },

    async findCharacterOccurrences(characterId: string) {
      const extension = vscode.extensions.getExtension<NekoAgentAPI>(NEKO_EXTENSION_IDS.NEKO_AGENT);
      if (!extension) {
        return [];
      }

      try {
        const api = extension.isActive
          ? extension.exports
          : ((await extension.activate()) as NekoAgentAPI);
        return api.entities.findCharacterOccurrences(characterId);
      } catch {
        return [];
      }
    },
  };
}

function createAssetsEntityLookup() {
  return {
    async resolveObject(name: string): Promise<AssetEntity | null> {
      const extension = vscode.extensions.getExtension<NekoAssetsAPI>(
        NEKO_EXTENSION_IDS.NEKO_ASSETS,
      );
      if (!extension) {
        return null;
      }

      try {
        const api = extension.isActive
          ? extension.exports
          : ((await extension.activate()) as NekoAssetsAPI);
        return api.entities.resolveEntityByName(name, { categories: ['object', 'vehicle'] });
      } catch {
        return null;
      }
    },

    async getDefinitionLocation(id: string): Promise<vscode.Location | null> {
      const extension = vscode.extensions.getExtension<NekoAssetsAPI>(
        NEKO_EXTENSION_IDS.NEKO_ASSETS,
      );
      if (!extension) {
        return null;
      }

      try {
        const api = extension.isActive
          ? extension.exports
          : ((await extension.activate()) as NekoAssetsAPI);
        const location = await api.entities.getDefinitionLocation(id);
        if (!location) {
          return null;
        }

        return new vscode.Location(
          vscode.Uri.parse(location.uri),
          new vscode.Position(location.line, location.character),
        );
      } catch {
        return null;
      }
    },
  };
}
