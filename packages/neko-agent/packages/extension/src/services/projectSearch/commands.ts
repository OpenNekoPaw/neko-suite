import * as vscode from 'vscode';
import type {
  ProjectIndexChangedRef,
  ProjectIndexUpdateReason,
  ProjectSearchPartitionKind,
  ProjectSearchQuery,
} from '@neko/shared';
import { ProjectCacheSearchService } from './ProjectCacheSearchService';
import { createCompatibilityProjectSearchAdapters } from './compatAdapters';

export const PROJECT_SEARCH_QUERY_COMMAND = 'neko.projectSearch.query';
export const PROJECT_SEARCH_REFRESH_COMMAND = 'neko.projectSearch.refresh';
const TEXT_DOCUMENT_REFRESH_DEBOUNCE_MS = 400;
const FILE_WATCHER_REFRESH_DEBOUNCE_MS = 300;

export function registerProjectSearchService(
  context: vscode.ExtensionContext,
  options: {
    readonly resolveThumbnailUri?: (filePath: string) => string | undefined;
  } = {},
): ProjectCacheSearchService {
  const service = new ProjectCacheSearchService();
  for (const adapter of createCompatibilityProjectSearchAdapters(options)) {
    context.subscriptions.push(service.registerAdapter(adapter));
  }

  const watcherDisposables = registerProjectSearchWatchers(context, service);

  context.subscriptions.push(
    service,
    ...watcherDisposables,
    vscode.commands.registerCommand(
      PROJECT_SEARCH_QUERY_COMMAND,
      async (query: ProjectSearchQuery) => service.query(query),
    ),
    vscode.commands.registerCommand(
      PROJECT_SEARCH_REFRESH_COMMAND,
      async (projectRoot?: string) => {
        const root = projectRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) return undefined;
        await service.refresh(root, 'manual-refresh');
        return service.getStatus(root);
      },
    ),
  );

  void service.ensureInitialized();
  return service;
}

function registerProjectSearchWatchers(
  context: vscode.ExtensionContext,
  service: ProjectCacheSearchService,
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];
  const debouncedRefresh = new PartitionRefreshDebouncer(service);
  const refresh = (
    uri: vscode.Uri,
    reason: ProjectIndexUpdateReason,
    partition: ProjectSearchPartitionKind,
    delayMs: number,
  ) => {
    const projectRoot = vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
    if (!projectRoot) return;
    const changedRefs: ProjectIndexChangedRef[] = [
      { kind: partition, filePath: uri.fsPath, uri: uri.toString() },
    ];
    debouncedRefresh.schedule(projectRoot, reason, partition, changedRefs, delayMs);
  };

  disposables.push(
    debouncedRefresh,
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (isStoryDocument(event.document)) {
        refresh(
          event.document.uri,
          'document-change',
          'story-symbols',
          TEXT_DOCUMENT_REFRESH_DEBOUNCE_MS,
        );
      }
    }),
  );

  for (const [pattern, partition] of [
    ['**/*.{fountain,nks,story}', 'story-symbols'],
    ['**/neko/assets/library.json', 'asset-library'],
    ['**/neko/entity-asset-requirements.json', 'creative-entities'],
    ['**/neko/entity-bindings.json', 'creative-entities'],
    ['**/neko/visual-identity-drafts.json', 'creative-entities'],
    ['**/.neko/.cache/generated/index.json', 'generated-assets'],
    ['**/neko/settings.json', 'media-library'],
    ['**/.neko/settings.local.json', 'media-library'],
  ] as const) {
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    disposables.push(
      watcher,
      watcher.onDidCreate((uri) =>
        refresh(uri, 'file-create', partition, FILE_WATCHER_REFRESH_DEBOUNCE_MS),
      ),
      watcher.onDidChange((uri) =>
        refresh(uri, 'file-change', partition, FILE_WATCHER_REFRESH_DEBOUNCE_MS),
      ),
      watcher.onDidDelete((uri) =>
        refresh(uri, 'file-delete', partition, FILE_WATCHER_REFRESH_DEBOUNCE_MS),
      ),
    );
  }

  context.subscriptions.push(...disposables);
  return disposables;
}

class PartitionRefreshDebouncer implements vscode.Disposable {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly refsByKey = new Map<string, ProjectIndexChangedRef[]>();

  constructor(private readonly service: ProjectCacheSearchService) {}

  schedule(
    projectRoot: string,
    reason: ProjectIndexUpdateReason,
    partition: ProjectSearchPartitionKind,
    changedRefs: readonly ProjectIndexChangedRef[],
    delayMs: number,
  ): void {
    const key = `${projectRoot}:${partition}:${reason}`;
    const refs = this.refsByKey.get(key) ?? [];
    refs.push(...changedRefs);
    this.refsByKey.set(key, refs);
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        const batchedRefs = this.refsByKey.get(key) ?? [];
        this.refsByKey.delete(key);
        void this.service.refresh(projectRoot, reason, { partition, changedRefs: batchedRefs });
      }, delayMs),
    );
  }

  dispose(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.refsByKey.clear();
  }
}

function isStoryDocument(document: vscode.TextDocument): boolean {
  return (
    document.languageId === 'nekostory' ||
    document.uri.fsPath.endsWith('.fountain') ||
    document.uri.fsPath.endsWith('.nks') ||
    document.uri.fsPath.endsWith('.story')
  );
}
