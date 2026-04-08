import * as vscode from 'vscode';
import {
  createEmptyCharacterRegistry,
  isCharacterRegistryFile,
  normalizeCharacterLookupKey,
  type CreativeEntityMatchOptions,
  type CreativeEntityMatchSuggestion,
  type CharacterNameResolution,
  type CharacterRecord,
  type CharacterRegistryFile,
} from '@neko/shared';
import { suggestCharacterMatches } from './CharacterMatchSuggester';

const CHARACTER_REGISTRY_FILE = 'characters.json';

export interface ICharacterWorkspaceIndex extends vscode.Disposable {
  ensureInitialized(): Promise<void>;
  getRegistry(): CharacterRegistryFile;
  getRegistryUri(): vscode.Uri | undefined;
  reload(): Promise<void>;
  save(registry: CharacterRegistryFile): Promise<void>;
  findById(id: string): CharacterRecord | undefined;
  resolveCharacter(name: string): CharacterNameResolution | undefined;
  suggestCharacters(
    name: string,
    options?: Pick<CreativeEntityMatchOptions, 'limit' | 'minConfidence'>,
  ): CreativeEntityMatchSuggestion<CharacterRecord>[];
  getDefinitionLocation(characterId: string): vscode.Location | undefined;
}

export class CharacterWorkspaceIndexService implements ICharacterWorkspaceIndex {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly recordsById = new Map<string, CharacterRecord>();
  private readonly lookup = new Map<string, CharacterNameResolution>();
  private readonly definitionLocations = new Map<string, vscode.Location>();
  private registry: CharacterRegistryFile = createEmptyCharacterRegistry();
  private registryUri: vscode.Uri | undefined;
  private initPromise: Promise<void> | undefined;

  private readonly _onDidUpdateRegistry = new vscode.EventEmitter<CharacterRegistryFile>();
  readonly onDidUpdateRegistry = this._onDidUpdateRegistry.event;

  constructor() {
    this.disposables.push(this._onDidUpdateRegistry);
    this.setupWatcher();
  }

  async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.reload();
    }
    return this.initPromise;
  }

  getRegistry(): CharacterRegistryFile {
    return this.registry;
  }

  getRegistryUri(): vscode.Uri | undefined {
    return this.registryUri;
  }

  async reload(): Promise<void> {
    const uri = this.resolveRegistryUri();
    this.registryUri = uri;

    if (!uri) {
      this.applyRegistry(createEmptyCharacterRegistry());
      return;
    }

    try {
      const raw = await vscode.workspace.fs.readFile(uri);
      const text = Buffer.from(raw).toString('utf-8');
      const parsed = JSON.parse(text) as unknown;
      if (!isCharacterRegistryFile(parsed)) {
        this.applyRegistry(createEmptyCharacterRegistry());
        return;
      }
      this.applyRegistry(parsed, text);
    } catch {
      this.applyRegistry(createEmptyCharacterRegistry());
    }
  }

  async save(registry: CharacterRegistryFile): Promise<void> {
    if (!isCharacterRegistryFile(registry)) {
      throw new Error('Invalid characters.json payload');
    }

    const uri = this.resolveRegistryUri(true);
    const json = JSON.stringify(registry, null, 2);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(json, 'utf-8'));
    this.registryUri = uri;
    this.applyRegistry(registry, json);
  }

  findById(id: string): CharacterRecord | undefined {
    return this.recordsById.get(id);
  }

  resolveCharacter(name: string): CharacterNameResolution | undefined {
    return this.lookup.get(normalizeCharacterLookupKey(name));
  }

  suggestCharacters(
    name: string,
    options: Pick<CreativeEntityMatchOptions, 'limit' | 'minConfidence'> = {},
  ): CreativeEntityMatchSuggestion<CharacterRecord>[] {
    return suggestCharacterMatches(name, this.registry.characters, options);
  }

  getDefinitionLocation(characterId: string): vscode.Location | undefined {
    return this.definitionLocations.get(characterId);
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
    this.recordsById.clear();
    this.lookup.clear();
    this.definitionLocations.clear();
  }

  private setupWatcher(): void {
    const watcher = vscode.workspace.createFileSystemWatcher(`**/${CHARACTER_REGISTRY_FILE}`);
    watcher.onDidCreate(() => {
      void this.reload();
    });
    watcher.onDidChange(() => {
      void this.reload();
    });
    watcher.onDidDelete(() => {
      void this.reload();
    });
    this.disposables.push(watcher);
  }

  private resolveRegistryUri(createWhenMissing = false): vscode.Uri | undefined {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return undefined;
    }

    const uri = vscode.Uri.joinPath(workspaceFolder.uri, CHARACTER_REGISTRY_FILE);
    if (createWhenMissing) {
      return uri;
    }
    return uri;
  }

  private applyRegistry(registry: CharacterRegistryFile, rawText?: string): void {
    this.registry = registry;
    this.recordsById.clear();
    this.lookup.clear();
    this.definitionLocations.clear();

    const lines = rawText?.split(/\r?\n/);

    for (const record of registry.characters) {
      this.recordsById.set(record.id, record);
      this.addLookup(record.id, record.id, record, 'id');
      this.addLookup(record.canonicalName, record.id, record, 'canonicalName');
      if (record.displayName) {
        this.addLookup(record.displayName, record.id, record, 'displayName');
      }
      for (const alias of record.aliases) {
        this.addLookup(alias, record.id, record, 'alias');
      }
      for (const scriptName of record.bindings?.scriptNames ?? []) {
        this.addLookup(scriptName, record.id, record, 'scriptName');
      }
      this.addDefinitionLocation(record.id, lines);
    }

    this._onDidUpdateRegistry.fire(this.registry);
  }

  private addLookup(
    rawKey: string,
    characterId: string,
    record: CharacterRecord,
    matchedBy: CharacterNameResolution['matchedBy'],
  ): void {
    const key = normalizeCharacterLookupKey(rawKey);
    if (!key || this.lookup.has(key)) {
      return;
    }
    this.lookup.set(key, { characterId, matchedBy, record });
  }

  private addDefinitionLocation(characterId: string, lines: string[] | undefined): void {
    if (!lines || !this.registryUri) {
      return;
    }

    const pattern = `"id": "${characterId}"`;
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const charIndex = line?.indexOf(pattern) ?? -1;
      if (charIndex >= 0) {
        const range = new vscode.Range(lineIndex, charIndex, lineIndex, charIndex + pattern.length);
        this.definitionLocations.set(characterId, new vscode.Location(this.registryUri, range));
        return;
      }
    }
  }
}
