import * as vscode from 'vscode';
import type { AgentContextPayload, NekoCanvasAPI, NekoStoryAPI } from '@neko/shared';
import { createEmptyCharacterRegistryFile } from '@neko/shared';
import { createNekoStoryCapabilityProvider } from './agentCapabilityProvider';
import {
  CharacterRegistryService,
  createVSCodeLogger,
  createNewFile,
  resolveCharacterRegistryPath,
  VSCodeErrorHandler,
  resolveLogLevelSetting,
  watchLogLevel,
} from '@neko/shared/vscode/extension';
import { setErrorHandler, handleError } from './utils/errorHandler';
import { FountainDocumentSymbolProvider } from './providers/documentSymbol';
import { FountainCompletionProvider } from './providers/completion';
import { FountainDefinitionProvider, FountainReferenceProvider } from './providers/definition';
import { FountainHoverProvider } from './providers/hover';
import {
  FountainCharacterCodeActionProvider,
  FountainCharacterRenameProvider,
} from './providers/rename';
import { FountainWorkspaceSymbolProvider } from './providers/workspaceSymbol';
import { FountainDocumentLinkProvider } from './providers/documentLink';
import { FountainDiagnosticsProvider } from './providers/diagnostics';
import { FountainInlineCompletionProvider } from './providers/inlineCompletion';
import { PreviewPanel } from './panels/PreviewPanel';
import { getStoryTemplate } from './templates/storyTemplate';
import { WorkspaceIndexService } from './services/WorkspaceIndexService';
import { AssetLinkingService } from './services/AssetLinkingService';
import { CharacterWorkspaceIndexService } from './services/CharacterWorkspaceIndexService';
import { CreativeEntityWorkspaceIndexService } from './services/CreativeEntityWorkspaceIndexService';
import { CrossModalDataProvider } from './services/CrossModalDataProvider';
import {
  CharacterRegistryTextOccurrenceResolver,
  OccurrenceIndexService,
} from './services/OccurrenceIndexService';
import { CreativeEntityGraphService } from './services/CreativeEntityGraphService';
import { SceneWorkspaceIndexService } from './services/SceneWorkspaceIndexService';
import { registerCreativeEntityCommands } from './commands/creativeEntityCommands';
import { buildScriptIndex } from './services/scriptIndexBuilder';
import { buildShotPlansForScene, buildStoryScenePlans } from './services/storyScenePlanner';
import {
  StorySceneStateStore,
  type StoryPipelineEventPayload,
} from './services/storySceneStateStore';
import { setRootLogger, getRootLogger } from './utils/logger';
import * as path from 'path';
import * as os from 'os';
import { parse } from '@neko-story/parser';
import { resolveStorageLayout } from '@neko/shared';
import { TimelineConverter, formatDuration } from './converters/TimelineConverter';

const FOUNTAIN_SELECTOR: vscode.DocumentSelector = { language: 'nekostory' };

export function activate(context: vscode.ExtensionContext) {
  const rootLogger = createVSCodeLogger(
    'Neko Story',
    'NekoStory',
    context,
    resolveLogLevelSetting(context.extensionMode),
  );
  setRootLogger(rootLogger);
  setErrorHandler(new VSCodeErrorHandler(rootLogger));
  watchLogLevel(rootLogger, context);
  const logger = getRootLogger();

  logger.info('Extension activated');

  // Create shared workspace index service
  const indexService = new WorkspaceIndexService();
  context.subscriptions.push(indexService);
  const characterIndexService = new CharacterWorkspaceIndexService();
  context.subscriptions.push(characterIndexService);

  // Phase 3: cross-modal data provider, occurrence index, and entity graph
  const crossModalDataProvider = new CrossModalDataProvider();
  context.subscriptions.push(crossModalDataProvider);
  const occurrenceIndexService = new OccurrenceIndexService(crossModalDataProvider, {
    textResolver: new CharacterRegistryTextOccurrenceResolver(characterIndexService),
  });
  context.subscriptions.push(occurrenceIndexService);

  const graphPath = resolveGraphPath();
  const entityGraphService = new CreativeEntityGraphService(
    crossModalDataProvider,
    characterIndexService,
    graphPath,
  );
  context.subscriptions.push(entityGraphService);

  const assetLinkingService = new AssetLinkingService();
  const sceneStateStore = new StorySceneStateStore(context.workspaceState);
  context.subscriptions.push(sceneStateStore);

  // Phase 4: scene workspace index (script-backed, no separate registry)
  const sceneIndexService = new SceneWorkspaceIndexService(indexService, sceneStateStore);
  context.subscriptions.push(sceneIndexService);

  const creativeEntityIndexService = new CreativeEntityWorkspaceIndexService(
    indexService,
    characterIndexService,
    occurrenceIndexService,
    entityGraphService,
    sceneIndexService,
    assetLinkingService,
  );
  context.subscriptions.push(creativeEntityIndexService);
  // Non-blocking background initialization
  void indexService.ensureInitialized();
  void characterIndexService.ensureInitialized();
  subscribeCanvasSceneWriteback(context, sceneStateStore);

  const resolveStoryboardCharacterBindings = async (
    names: readonly string[],
    uriOrPath?: string,
  ): Promise<Record<string, string>> => {
    let uri: vscode.Uri | undefined;
    try {
      uri = uriOrPath ? resolveUriOrPath(uriOrPath) : undefined;
    } catch (error) {
      logger.warn(`Failed to resolve storyboard character binding URI: ${formatError(error)}`);
      return {};
    }

    const bindings: Record<string, string> = {};

    for (const name of names) {
      try {
        const resolved = characterIndexService.resolveCharacter(name, uri);
        const characterId = resolved?.record.id;
        if (characterId) {
          bindings[name] = characterId;
        }
      } catch (error) {
        logger.warn(`Failed to resolve storyboard character "${name}": ${formatError(error)}`);
      }
    }

    return bindings;
  };

  const resolvePreviewCharacterRegistry = (uriOrPath?: string) => {
    try {
      const uri = uriOrPath ? resolveUriOrPath(uriOrPath) : undefined;
      return characterIndexService.getRegistry(uri);
    } catch (error) {
      logger.warn(`Failed to resolve preview character registry: ${formatError(error)}`);
      return undefined;
    }
  };

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
      new FountainCompletionProvider(indexService, characterIndexService),
      '.', // Trigger on period for forced scene headings
      '@', // Trigger on @ for forced characters
      '[', // Trigger on [ for [[KEY: value]] directives
    ),
    // Go to definition (cross-file via index)
    vscode.languages.registerDefinitionProvider(
      FOUNTAIN_SELECTOR,
      new FountainDefinitionProvider(indexService, creativeEntityIndexService),
    ),
    // Find references (cross-file via index)
    vscode.languages.registerReferenceProvider(
      FOUNTAIN_SELECTOR,
      new FountainReferenceProvider(indexService, creativeEntityIndexService),
    ),
    // Hover information (cross-file stats via index)
    vscode.languages.registerHoverProvider(
      FOUNTAIN_SELECTOR,
      new FountainHoverProvider(indexService, creativeEntityIndexService),
    ),
    vscode.languages.registerRenameProvider(
      FOUNTAIN_SELECTOR,
      new FountainCharacterRenameProvider(
        indexService,
        characterIndexService,
        creativeEntityIndexService,
      ),
    ),
    vscode.languages.registerCodeActionsProvider(
      FOUNTAIN_SELECTOR,
      new FountainCharacterCodeActionProvider(indexService, creativeEntityIndexService),
    ),
    // Workspace symbol search — Ctrl+T (cross-file via index)
    vscode.languages.registerWorkspaceSymbolProvider(
      new FountainWorkspaceSymbolProvider(indexService, characterIndexService),
    ),
    // Document links — [[see: file.fountain]] clickable
    vscode.languages.registerDocumentLinkProvider(
      FOUNTAIN_SELECTOR,
      new FountainDocumentLinkProvider(),
    ),
    // LLM ghost text — 400 ms debounce, delegates to neko.agent.internalChat
    vscode.languages.registerInlineCompletionItemProvider(
      FOUNTAIN_SELECTOR,
      new FountainInlineCompletionProvider(indexService, characterIndexService),
    ),
  );

  // Register diagnostics provider (error underlining)
  const diagnosticsProvider = new FountainDiagnosticsProvider(indexService);
  diagnosticsProvider.activate();
  context.subscriptions.push(diagnosticsProvider);

  // Register commands
  registerCreativeEntityCommands(context, {
    creativeEntityIndex: creativeEntityIndexService,
    entityGraph: entityGraphService,
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.story.preview', () => {
      PreviewPanel.create(
        context.extensionUri,
        sceneStateStore,
        resolveStoryboardCharacterBindings,
        resolvePreviewCharacterRegistry,
      );
    }),
    vscode.commands.registerCommand('neko.story.toTimeline', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'nekostory') {
        void handleError(new Error('请在剧本文件中执行此命令'), { showToUser: true });
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
    vscode.commands.registerCommand('neko.story.generateStoryboard', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'nekostory') {
        void handleError(new Error('请在剧本文件中执行此命令'), { showToUser: true });
        return;
      }

      const payload = buildSceneAgentPayload(
        editor,
        '请为这个场景生成 storyboard 计划，并准备发送到 canvas：',
      );
      if (!payload) {
        void handleError(new Error('当前光标不在可识别的场景中'), {
          showToUser: true,
          severity: 'warning',
        });
        return;
      }

      try {
        await vscode.commands.executeCommand('neko.agent.sendContext', payload);
      } catch {
        // neko-agent extension not installed or not activated — silently ignore
      }
    }),
    vscode.commands.registerCommand(
      'neko.story.startVideoCreation',
      async (options?: { sceneId?: string; sceneIds?: string[]; mode?: 'scene' | 'all' }) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'nekostory') {
          void handleError(new Error('请在剧本文件中执行此命令'), { showToUser: true });
          return;
        }

        // "All scenes" mode: skip scene cursor check, process entire screenplay
        if (options?.mode === 'all' || options?.sceneIds) {
          const document = parse(editor.document.getText());
          const scriptIndex = buildScriptIndex(editor.document.uri, document);
          const scriptPath = editor.document.uri.fsPath;
          const targetSceneIds = options?.sceneIds ?? scriptIndex.scenes.map((s) => s.sceneId);
          const firstScene = scriptIndex.scenes[0];

          if (!firstScene) {
            void handleError(new Error('剧本中没有可识别的场景'), {
              showToUser: true,
              severity: 'warning',
            });
            return;
          }

          const allScenesPayload: AgentContextPayload = {
            type: 'story-selection',
            id: `story:${scriptPath}:all`,
            label: firstScene.sceneTitle,
            summary: `All scenes (${targetSceneIds.length}) from ${scriptPath}`,
            data: {
              scriptPath,
              sceneIds: targetSceneIds,
            },
            intent:
              '请基于剧本中的所有场景启动标准视频创作流程：先生成 storyboard，再继续 prompts、pilot、batch generation、quality gate 和 timeline 编排。',
          };
          try {
            await vscode.commands.executeCommand('neko.agent.sendContext', allScenesPayload);
          } catch {
            // neko-agent extension not available
          }
          return;
        }

        // Single scene mode: use cursor position or explicit sceneId
        const payload = options?.sceneId
          ? buildSceneAgentPayloadBySceneId(editor, options.sceneId)
          : buildSceneAgentPayload(
              editor,
              '请基于当前场景启动标准视频创作流程：先生成 storyboard，再继续 prompts、pilot、batch generation、quality gate 和 timeline 编排。',
            );
        if (!payload) {
          void handleError(new Error('当前光标不在可识别的场景中'), {
            showToUser: true,
            severity: 'warning',
          });
          return;
        }

        try {
          await vscode.commands.executeCommand('neko.agent.sendContext', payload);
        } catch {
          // neko-agent extension not installed or not activated — silently ignore
        }
      },
    ),
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
      const panel = PreviewPanel.create(
        context.extensionUri,
        sceneStateStore,
        resolveStoryboardCharacterBindings,
        resolvePreviewCharacterRegistry,
      );
      panel.postMessage({ type: 'setView', view: 'table' });
    }),
    vscode.commands.registerCommand(
      'neko.story.linkCharacterAsset',
      async (args: { name: string; characterId?: string; aliases?: readonly string[] }) => {
        if (!args?.name) {
          return null;
        }
        return assetLinkingService.linkCharacter(args.name, {
          characterId: args.characterId,
          aliases: args.aliases,
        });
      },
    ),
    vscode.commands.registerCommand(
      'neko.story.linkLocationAsset',
      async (args: string | { location: string }) => {
        const location = typeof args === 'string' ? args : args?.location;
        if (!location) {
          return null;
        }
        return assetLinkingService.linkLocation(location);
      },
    ),
    vscode.commands.registerCommand(
      'neko.story.handlePipelineEvent',
      async (params: {
        pipelineId: string;
        event: { type: string; [key: string]: unknown };
        payload: StoryPipelineEventPayload;
      }) => {
        const uri = resolveUriOrPath(params.payload.scriptPath);
        const scriptIndex = indexService.getScriptIndex(uri);
        if (!scriptIndex) {
          return;
        }
        sceneStateStore.handlePipelineEvent(
          scriptIndex,
          params.payload,
          params.pipelineId,
          params.event,
        );
      },
    ),
    vscode.commands.registerCommand('neko.story.newFile', async (uri?: vscode.Uri) => {
      await createNewFile({
        targetFolder: uri,
        ext: '.fountain',
        template: (title) => getStoryTemplate(title),
        noFolderErrorMessage: vscode.l10n.t('neko.story.newFile.noFolder'),
        onError: (error) => void handleError(error, { showToUser: true }),
      });
    }),
    vscode.commands.registerCommand(
      'neko.story.openCharacterRegistry',
      async (uri?: vscode.Uri) => {
        const folder = resolveTargetWorkspaceFolder(uri);
        if (!folder) {
          void handleError(new Error(vscode.l10n.t('neko.story.openCharacterRegistry.noFolder')), {
            showToUser: true,
          });
          return;
        }

        const registryPath = resolveCharacterRegistryPath(folder.uri.fsPath);
        const registryUri = vscode.Uri.file(registryPath);
        const registryService = new CharacterRegistryService(registryPath);

        if (!(await workspaceFileExists(registryUri))) {
          await registryService.save(createEmptyCharacterRegistryFile());
        }

        const document = await vscode.workspace.openTextDocument(registryUri);
        await vscode.window.showTextDocument(document, { preserveFocus: false });
      },
    ),
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
      const uri = resolveUriOrPath(uriOrPath);
      return indexService.getScriptIndex(uri);
    },

    /**
     * Returns the current workspace folder's character registry snapshot.
     */
    getCharacterRegistry(uriOrPath?: string) {
      const uri = uriOrPath ? resolveUriOrPath(uriOrPath) : undefined;
      return characterIndexService.getRegistry(uri);
    },

    /**
     * Resolves a character name / alias against the project registry.
     */
    resolveCharacter(name: string, uriOrPath?: string) {
      try {
        const uri = uriOrPath ? resolveUriOrPath(uriOrPath) : undefined;
        return characterIndexService.resolveCharacter(name, uri);
      } catch (error) {
        logger.warn(`Failed to resolve character "${name}": ${formatError(error)}`);
        return undefined;
      }
    },

    /**
     * Builds deterministic scene-level storyboard plans from ScriptIndex.
     * Returns undefined if the file has not been indexed yet.
     */
    generateScenePlans(uriOrPath: string, sceneIds?: readonly string[]) {
      const uri = resolveUriOrPath(uriOrPath);
      const index = indexService.getScriptIndex(uri);
      if (!index) {
        return undefined;
      }
      return buildStoryScenePlans(index, { sceneIds });
    },

    /**
     * Builds deterministic shot plans for a single indexed scene.
     * Returns undefined if the file or scene is unavailable.
     */
    generateShotPlan(uriOrPath: string, sceneId: string, recommendedShotCount?: number) {
      const uri = resolveUriOrPath(uriOrPath);
      const index = indexService.getScriptIndex(uri);
      const scene = index?.scenes.find((entry) => entry.sceneId === sceneId);
      if (!scene) {
        return undefined;
      }
      return buildShotPlansForScene(scene, recommendedShotCount);
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

function subscribeCanvasSceneWriteback(
  context: vscode.ExtensionContext,
  sceneStateStore: StorySceneStateStore,
): void {
  let subscribed = false;

  const trySubscribe = async (): Promise<void> => {
    if (subscribed) {
      return;
    }

    const canvasExt = vscode.extensions.getExtension<NekoCanvasAPI>('neko.nekocanvas');
    if (!canvasExt?.isActive) {
      return;
    }

    try {
      const api = canvasExt.exports;
      if (!api?.events?.onDidChangeCanvas) {
        return;
      }

      subscribed = true;
      context.subscriptions.push(
        api.events.onDidChangeCanvas((event) => {
          sceneStateStore.handleCanvasEvent(event);
        }),
      );
    } catch {
      // neko-canvas unavailable or failed to activate; retry on extension changes
    }
  };

  void trySubscribe();
  context.subscriptions.push(
    vscode.extensions.onDidChange(() => {
      void trySubscribe();
    }),
  );
}

function resolveUriOrPath(uriOrPath: string): vscode.Uri {
  return uriOrPath.startsWith('file://') || uriOrPath.includes('://')
    ? vscode.Uri.parse(uriOrPath)
    : vscode.Uri.file(uriOrPath);
}

function resolveGraphPath(): string | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    return undefined;
  }
  const layout = resolveStorageLayout(folder.uri.fsPath, os.homedir());
  return layout.project.cache.assetGraph;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolveTargetWorkspaceFolder(uri?: vscode.Uri): vscode.WorkspaceFolder | undefined {
  if (uri) {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (folder) {
      return folder;
    }
  }

  const activeDocumentUri = vscode.window.activeTextEditor?.document.uri;
  if (activeDocumentUri) {
    const folder = vscode.workspace.getWorkspaceFolder(activeDocumentUri);
    if (folder) {
      return folder;
    }
  }

  return vscode.workspace.workspaceFolders?.[0];
}

async function workspaceFileExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

function buildSceneAgentPayload(
  editor: vscode.TextEditor,
  intent: string,
): AgentContextPayload | null {
  const document = parse(editor.document.getText());
  const scriptIndex = buildScriptIndex(editor.document.uri, document);
  const cursorLine = editor.selection.active.line;
  const scene = scriptIndex.scenes.find(
    (entry) => entry.line_start <= cursorLine && entry.line_end >= cursorLine,
  );
  if (!scene) {
    return null;
  }

  const selection = new vscode.Selection(
    scene.line_start,
    0,
    scene.line_end,
    Number.MAX_SAFE_INTEGER,
  );
  const selectedText = editor.document.getText(selection);
  const scriptPath = editor.document.uri.fsPath;

  return {
    type: 'story-selection',
    id: `story:${scriptPath}:${scene.sceneId}`,
    label: scene.sceneTitle,
    summary: `Scene: ${scene.sceneTitle}\n\n${selectedText.slice(0, 400)}${selectedText.length > 400 ? '…' : ''}`,
    data: {
      scriptPath,
      sceneId: scene.sceneId,
      selectedText,
      range: {
        start: { line: scene.line_start, character: 0 },
        end: { line: scene.line_end, character: Number.MAX_SAFE_INTEGER },
      },
    },
    intent,
  };
}

/**
 * Build an agent payload for a specific sceneId (used by ScriptTableView actions).
 * Unlike buildSceneAgentPayload which uses cursor position, this looks up by sceneId.
 */
function buildSceneAgentPayloadBySceneId(
  editor: vscode.TextEditor,
  sceneId: string,
): AgentContextPayload | null {
  const document = parse(editor.document.getText());
  const scriptIndex = buildScriptIndex(editor.document.uri, document);
  const scene = scriptIndex.scenes.find((entry) => entry.sceneId === sceneId);
  if (!scene) {
    return null;
  }

  const selection = new vscode.Selection(
    scene.line_start,
    0,
    scene.line_end,
    Number.MAX_SAFE_INTEGER,
  );
  const selectedText = editor.document.getText(selection);
  const scriptPath = editor.document.uri.fsPath;

  return {
    type: 'story-selection',
    id: `story:${scriptPath}:${scene.sceneId}`,
    label: scene.sceneTitle,
    summary: `Scene: ${scene.sceneTitle}\n\n${selectedText.slice(0, 400)}${selectedText.length > 400 ? '…' : ''}`,
    data: {
      scriptPath,
      sceneId: scene.sceneId,
      selectedText,
      range: {
        start: { line: scene.line_start, character: 0 },
        end: { line: scene.line_end, character: Number.MAX_SAFE_INTEGER },
      },
    },
    intent: '请基于当前场景启动标准视频创作流程。',
  };
}
