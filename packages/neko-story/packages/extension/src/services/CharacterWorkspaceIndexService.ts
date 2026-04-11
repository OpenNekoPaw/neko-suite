import * as vscode from 'vscode';
import {
  createEmptyCharacterRegistryFile,
  isCharacterRegistryFile,
  normalizeCharacterLookupKey,
  type CharacterRecord,
  type CharacterRegistryFile,
} from '@neko/shared';
import { resolveCharacterRegistryPath } from '@neko/shared/vscode/extension';
import type {
  CharacterRegistrySymbol,
  CharacterMatchSource,
  ICharacterWorkspaceIndex,
  ResolvedCharacterMatch,
} from './types';

const CHARACTER_REGISTRY_FILE = 'characters.json';
const CHARACTER_REGISTRY_GLOB = `**/${CHARACTER_REGISTRY_FILE}`;

interface CharacterLookupEntry extends ResolvedCharacterMatch {}

interface CharacterWorkspaceState {
  readonly registryUri: vscode.Uri;
  readonly rawText: string | undefined;
  readonly registry: CharacterRegistryFile;
  readonly lookup: ReadonlyMap<string, CharacterLookupEntry>;
  readonly completionNames: readonly string[];
}

/**
 * Workspace-level character identity index backed by project root characters.json.
 *
 * This service intentionally stays separate from WorkspaceIndexService:
 * - WorkspaceIndexService answers "where does this script symbol occur?"
 * - CharacterWorkspaceIndexService answers "which registry character does this name belong to?"
 */
export class CharacterWorkspaceIndexService implements ICharacterWorkspaceIndex {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly states = new Map<string, CharacterWorkspaceState>();
  private initPromise: Promise<void> | undefined;

  constructor() {
    this.setupWatchers();
  }

  async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.buildInitialState();
    }
    return this.initPromise;
  }

  getRegistry(currentUri?: vscode.Uri): CharacterRegistryFile | undefined {
    return this.getState(currentUri)?.registry;
  }

  resolveCharacter(name: string, currentUri?: vscode.Uri): ResolvedCharacterMatch | undefined {
    const key = normalizeCharacterLookupKey(name);
    if (!key) {
      return undefined;
    }

    return this.getState(currentUri)?.lookup.get(key);
  }

  getDefinition(name: string, currentUri?: vscode.Uri): vscode.Location | undefined {
    const state = this.getState(currentUri);
    const resolved = this.resolveCharacter(name, currentUri);
    if (!state || !resolved || !state.rawText) {
      return undefined;
    }

    const range = findCharacterDefinitionRange(state.rawText, resolved.record);
    if (!range) {
      return undefined;
    }

    return new vscode.Location(state.registryUri, range);
  }

  getReferenceNames(name: string, currentUri?: vscode.Uri): readonly string[] {
    const resolved = this.resolveCharacter(name, currentUri);
    if (!resolved) {
      return [];
    }

    return collectRegistryDisplayNames(resolved.record);
  }

  getAllCompletionNames(currentUri?: vscode.Uri): readonly string[] {
    return this.getState(currentUri)?.completionNames ?? [];
  }

  searchCharacters(query: string, currentUri?: vscode.Uri): readonly CharacterRegistrySymbol[] {
    const state = this.getState(currentUri);
    const normalizedQuery = normalizeCharacterLookupKey(query);
    if (!state || !normalizedQuery) {
      return [];
    }

    const results: CharacterRegistrySymbol[] = [];

    for (const record of state.registry.characters) {
      const names = collectRegistryDisplayNames(record);
      const matches = names.some((name) =>
        normalizeCharacterLookupKey(name).includes(normalizedQuery),
      );
      if (!matches) {
        continue;
      }

      const range = state.rawText ? findCharacterDefinitionRange(state.rawText, record) : undefined;
      if (!range) {
        continue;
      }

      results.push({
        record,
        label: record.displayName ?? record.canonicalName,
        detail: buildCharacterSymbolDetail(record),
        location: new vscode.Location(state.registryUri, range),
      });
    }

    return results;
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
    this.states.clear();
  }

  private setupWatchers(): void {
    const watcher = vscode.workspace.createFileSystemWatcher(CHARACTER_REGISTRY_GLOB);
    watcher.onDidCreate((uri) => {
      void this.reloadStateForRegistryUri(uri);
    });
    watcher.onDidChange((uri) => {
      void this.reloadStateForRegistryUri(uri);
    });
    watcher.onDidDelete((uri) => {
      this.clearStateForRegistryUri(uri);
    });
    this.disposables.push(watcher);

    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((document) => {
        if (isCharacterRegistryDocument(document)) {
          void this.reloadStateForRegistryUri(document.uri);
        }
      }),
    );

    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (isCharacterRegistryDocument(event.document)) {
          void this.reloadStateForRegistryUri(event.document.uri);
        }
      }),
    );
  }

  private async buildInitialState(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    await Promise.all(folders.map((folder) => this.reloadWorkspaceFolder(folder)));
  }

  private async reloadStateForRegistryUri(uri: vscode.Uri): Promise<void> {
    const folder = getOwningWorkspaceFolder(uri);
    if (!folder || !isRootRegistryUri(folder, uri)) {
      return;
    }

    await this.reloadWorkspaceFolder(folder);
  }

  private clearStateForRegistryUri(uri: vscode.Uri): void {
    const folder = getOwningWorkspaceFolder(uri);
    if (!folder || !isRootRegistryUri(folder, uri)) {
      return;
    }

    this.states.set(folder.uri.toString(), createEmptyWorkspaceState(folder));
  }

  private async reloadWorkspaceFolder(folder: vscode.WorkspaceFolder): Promise<void> {
    const state = await loadWorkspaceState(folder);
    if (state) {
      this.states.set(folder.uri.toString(), state);
    }
  }

  private getState(currentUri?: vscode.Uri): CharacterWorkspaceState | undefined {
    const folder = currentUri ? getOwningWorkspaceFolder(currentUri) : undefined;
    if (folder) {
      return this.states.get(folder.uri.toString());
    }

    const fallbackFolder = vscode.workspace.workspaceFolders?.[0];
    if (!fallbackFolder) {
      return undefined;
    }

    return this.states.get(fallbackFolder.uri.toString());
  }
}

async function loadWorkspaceState(
  folder: vscode.WorkspaceFolder,
): Promise<CharacterWorkspaceState | undefined> {
  const registryUri = getRegistryUri(folder);
  const rawText = await readRegistryContent(registryUri);
  if (rawText === undefined) {
    return createEmptyWorkspaceState(folder);
  }

  const registry = parseRegistryFile(rawText);
  if (!registry) {
    return createEmptyWorkspaceState(folder, rawText);
  }

  const lookup = buildLookup(registry.characters);
  const completionNames = buildCompletionNames(registry.characters);

  return {
    registryUri,
    rawText,
    registry,
    lookup,
    completionNames,
  };
}

function createEmptyWorkspaceState(
  folder: vscode.WorkspaceFolder,
  rawText?: string,
): CharacterWorkspaceState {
  return {
    registryUri: getRegistryUri(folder),
    rawText,
    registry: createEmptyCharacterRegistryFile(),
    lookup: new Map(),
    completionNames: [],
  };
}

async function readRegistryContent(uri: vscode.Uri): Promise<string | undefined> {
  const openDocument = vscode.workspace.textDocuments.find(
    (document) => document.uri.toString() === uri.toString(),
  );
  if (openDocument) {
    return openDocument.getText();
  }

  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return undefined;
  }
}

function parseRegistryFile(rawText: string): CharacterRegistryFile | undefined {
  try {
    const parsed: unknown = JSON.parse(rawText);
    return isCharacterRegistryFile(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function buildLookup(
  characters: readonly CharacterRecord[],
): ReadonlyMap<string, CharacterLookupEntry> {
  const lookup = new Map<string, CharacterLookupEntry>();

  for (const record of characters) {
    for (const entry of collectLookupEntries(record)) {
      const key = normalizeCharacterLookupKey(entry.matchedName);
      if (!key || lookup.has(key)) {
        continue;
      }
      lookup.set(key, entry);
    }
  }

  return lookup;
}

function buildCompletionNames(characters: readonly CharacterRecord[]): readonly string[] {
  const names: string[] = [];
  const seen = new Set<string>();

  for (const record of characters) {
    for (const name of collectRegistryDisplayNames(record)) {
      const key = normalizeCharacterLookupKey(name);
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      names.push(name);
    }
  }

  return names;
}

function collectLookupEntries(record: CharacterRecord): readonly CharacterLookupEntry[] {
  const entries: CharacterLookupEntry[] = [];

  pushLookupEntry(entries, record, record.canonicalName, 'canonicalName');
  pushLookupEntry(entries, record, record.displayName, 'displayName');

  for (const alias of record.aliases) {
    pushLookupEntry(entries, record, alias, 'alias');
  }

  for (const scriptName of record.bindings?.scriptNames ?? []) {
    pushLookupEntry(entries, record, scriptName, 'scriptName');
  }

  return entries;
}

function pushLookupEntry(
  entries: CharacterLookupEntry[],
  record: CharacterRecord,
  value: string | undefined,
  matchSource: CharacterMatchSource,
): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return;
  }

  const normalized = normalizeCharacterLookupKey(value);
  if (
    !normalized ||
    entries.some((entry) => normalizeCharacterLookupKey(entry.matchedName) === normalized)
  ) {
    return;
  }

  entries.push({
    record,
    matchedName: value,
    matchSource,
  });
}

function collectRegistryDisplayNames(record: CharacterRecord): readonly string[] {
  const names: string[] = [];
  const seen = new Set<string>();

  const candidates = [
    record.canonicalName,
    record.displayName,
    ...record.aliases,
    ...(record.bindings?.scriptNames ?? []),
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || candidate.trim().length === 0) {
      continue;
    }

    const normalized = normalizeCharacterLookupKey(candidate);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    names.push(candidate);
  }

  return names;
}

function buildCharacterSymbolDetail(record: CharacterRecord): string {
  const parts = ['characters.json', record.canonicalName];
  if (record.aliases.length > 0) {
    parts.push(`aliases: ${record.aliases.join(', ')}`);
  }
  return parts.join(' • ');
}

function getRegistryUri(folder: vscode.WorkspaceFolder): vscode.Uri {
  return vscode.Uri.file(resolveCharacterRegistryPath(folder.uri.fsPath));
}

function getOwningWorkspaceFolder(uri: vscode.Uri): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.getWorkspaceFolder(uri);
}

function isRootRegistryUri(folder: vscode.WorkspaceFolder, uri: vscode.Uri): boolean {
  return getRegistryUri(folder).toString() === uri.toString();
}

function isCharacterRegistryDocument(document: vscode.TextDocument): boolean {
  const folder = getOwningWorkspaceFolder(document.uri);
  return Boolean(folder && isRootRegistryUri(folder, document.uri));
}

function findCharacterDefinitionRange(
  rawText: string,
  record: CharacterRecord,
): vscode.Range | undefined {
  const idRange = findJsonPropertyRange(rawText, 'id', record.id);
  if (idRange) {
    return idRange;
  }

  return findJsonPropertyRange(rawText, 'canonicalName', record.canonicalName);
}

function findJsonPropertyRange(
  rawText: string,
  property: string,
  value: string,
): vscode.Range | undefined {
  const escapedValue = escapeRegExp(JSON.stringify(value).slice(1, -1));
  const pattern = new RegExp(`"${escapeRegExp(property)}"\\s*:\\s*"${escapedValue}"`);
  const match = pattern.exec(rawText);
  if (!match || typeof match.index !== 'number') {
    return undefined;
  }

  const startOffset = match.index;
  const endOffset = startOffset + match[0].length;
  const start = offsetToPosition(rawText, startOffset);
  const end = offsetToPosition(rawText, endOffset);

  return new vscode.Range(start.line, start.character, end.line, end.character);
}

function offsetToPosition(rawText: string, offset: number): vscode.Position {
  const prefix = rawText.slice(0, offset);
  const lines = prefix.split('\n');
  const line = lines.length - 1;
  const character = lines[line]?.length ?? 0;
  return new vscode.Position(line, character);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
