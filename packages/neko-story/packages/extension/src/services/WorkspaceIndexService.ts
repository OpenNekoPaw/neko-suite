import * as vscode from 'vscode';
import { parse } from '@neko-story/parser';
import type { FountainDocument, Character, SceneHeading, Section } from '@neko-story/types';
import type {
  IWorkspaceIndex,
  SymbolLocation,
  ScriptIndex,
  SceneEntry,
  CharacterEntry,
} from './types';
import type { ICharacterWorkspaceIndex } from './CharacterWorkspaceIndexService';

const FOUNTAIN_GLOB = '**/*.{fountain,nks,story}';

/**
 * Workspace-wide index service for Fountain documents.
 *
 * Scans all .fountain files, caches parse results,
 * maintains derived symbol indices, and watches for file changes.
 */
export class WorkspaceIndexService implements IWorkspaceIndex {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly fileCache = new Map<string, FountainDocument>();

  // Derived indices: name → SymbolLocation[]
  private readonly characterIndex = new Map<string, SymbolLocation[]>();
  private readonly sceneIndex = new Map<string, SymbolLocation[]>();
  private readonly sectionIndex = new Map<string, SymbolLocation[]>();

  private initPromise: Promise<void> | undefined;

  private readonly _onDidUpdateIndex = new vscode.EventEmitter<vscode.Uri[]>();
  readonly onDidUpdateIndex = this._onDidUpdateIndex.event;

  constructor(private readonly characterIndexService?: ICharacterWorkspaceIndex) {
    this.disposables.push(this._onDidUpdateIndex);
    this.setupWatchers();
  }

  // -- IWorkspaceIndex --

  async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.buildFullIndex();
    }
    return this.initPromise;
  }

  getDocument(uri: vscode.Uri): FountainDocument | undefined {
    return this.fileCache.get(uri.toString());
  }

  findCharacterLocations(name: string, currentUri?: vscode.Uri): readonly SymbolLocation[] {
    const locations = this.characterIndex.get(name) ?? [];
    return sortCurrentFirst(locations, currentUri);
  }

  findCharacterDefinition(name: string, currentUri?: vscode.Uri): SymbolLocation | undefined {
    const sorted = this.findCharacterLocations(name, currentUri);
    return sorted[0];
  }

  findSceneLocations(location: string, currentUri?: vscode.Uri): readonly SymbolLocation[] {
    const locations = this.sceneIndex.get(location) ?? [];
    return sortCurrentFirst(locations, currentUri);
  }

  findSectionLocations(text: string, currentUri?: vscode.Uri): readonly SymbolLocation[] {
    const locations = this.sectionIndex.get(text) ?? [];
    return sortCurrentFirst(locations, currentUri);
  }

  searchSymbols(query: string): readonly SymbolLocation[] {
    if (!query) return [];
    const lowerQuery = query.toLowerCase();
    const results: SymbolLocation[] = [];

    for (const [, locations] of this.characterIndex) {
      for (const loc of locations) {
        if (loc.name.toLowerCase().includes(lowerQuery)) {
          // Only include first occurrence per character per file to avoid duplicates
          if (
            !results.some((r) => r.name === loc.name && r.uri.toString() === loc.uri.toString())
          ) {
            results.push(loc);
          }
        }
      }
    }
    for (const [, locations] of this.sceneIndex) {
      for (const loc of locations) {
        if (loc.name.toLowerCase().includes(lowerQuery)) {
          if (
            !results.some(
              (r) =>
                r.name === loc.name &&
                r.kind === 'scene' &&
                r.uri.toString() === loc.uri.toString(),
            )
          ) {
            results.push(loc);
          }
        }
      }
    }
    for (const [, locations] of this.sectionIndex) {
      for (const loc of locations) {
        if (loc.name.toLowerCase().includes(lowerQuery)) {
          results.push(loc);
        }
      }
    }

    return results;
  }

  getAllCharacterNames(): readonly string[] {
    return Array.from(this.characterIndex.keys()).sort();
  }

  getAllSceneLocations(): readonly string[] {
    return Array.from(this.sceneIndex.keys()).sort();
  }

  getScriptIndex(uri: vscode.Uri): ScriptIndex | undefined {
    const doc = this.fileCache.get(uri.toString());
    if (!doc) return undefined;

    const uriStr = uri.toString();

    // Collect scene headings in document order
    const sceneHeadings: Array<{ element: SceneHeading; lineStart: number }> = [];
    let maxLine = 0;

    for (const element of doc.elements) {
      const endLine = element.range.end.line;
      if (endLine > maxLine) maxLine = endLine;
      if (element.type === 'scene_heading') {
        sceneHeadings.push({
          element: element as SceneHeading,
          lineStart: element.range.start.line,
        });
      }
    }

    // Build SceneEntry[] — line_end = next scene's start - 1 (or EOF)
    const scenes: SceneEntry[] = sceneHeadings.map((sh, idx) => {
      const next = sceneHeadings[idx + 1];
      const lineEnd = next ? next.lineStart - 1 : maxLine;
      const heading = sh.element.raw.trim();
      const parts = [sh.element.intExt, sh.element.location, sh.element.time]
        .filter(Boolean)
        .join('. ');
      return {
        id: `S${idx + 1}`,
        heading: heading || parts,
        intExt: sh.element.intExt,
        location: sh.element.location,
        time: sh.element.time,
        line_start: sh.lineStart,
        line_end: lineEnd,
      };
    });

    // Build scene membership map: sceneIndex (0-based) → sceneId
    // A character appearing between sceneHeadings[i].lineStart and sceneHeadings[i+1].lineStart
    // belongs to scene S(i+1).
    const getSceneIdForLine = (line: number): string | undefined => {
      let sceneId: string | undefined;
      for (const scene of scenes) {
        if (line >= scene.line_start && line <= scene.line_end) {
          sceneId = scene.id;
          break;
        }
      }
      return sceneId;
    };

    // Collect character appearances in this file
    const charMap = new Map<string, { firstLine: number; sceneIds: Set<string> }>();
    for (const element of doc.elements) {
      if (element.type === 'character') {
        const char = element as Character;
        const line = element.range.start.line;
        const sceneId = getSceneIdForLine(line);
        let entry = charMap.get(char.name);
        if (!entry) {
          entry = { firstLine: line, sceneIds: new Set() };
          charMap.set(char.name, entry);
        } else if (line < entry.firstLine) {
          entry.firstLine = line;
        }
        if (sceneId) entry.sceneIds.add(sceneId);
      }
    }

    const characters: CharacterEntry[] = Array.from(charMap.entries())
      .sort(([, a], [, b]) => a.firstLine - b.firstLine)
      .map(([name, entry]) => ({
        name,
        characterId: this.characterIndexService?.resolveCharacter(name)?.characterId,
        first_line: entry.firstLine,
        scene_ids: Array.from(entry.sceneIds),
      }));

    return {
      uri: uriStr,
      total_lines: maxLine + 1,
      scenes,
      characters,
    };
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
    this.fileCache.clear();
    this.characterIndex.clear();
    this.sceneIndex.clear();
    this.sectionIndex.clear();
  }

  // -- Internal --

  private setupWatchers(): void {
    const watcher = vscode.workspace.createFileSystemWatcher(FOUNTAIN_GLOB);

    watcher.onDidCreate((uri) => {
      void this.onFileChanged(uri);
    });
    watcher.onDidChange((uri) => {
      void this.onFileChanged(uri);
    });
    watcher.onDidDelete((uri) => {
      this.onFileDeleted(uri);
    });

    this.disposables.push(watcher);

    // Watch live editor changes (unsaved buffers)
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (this.isRelevantDocument(e.document)) {
          void this.indexDocument(e.document.uri, e.document.getText());
        }
      }),
    );

    // Watch document open (pick up live buffers)
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((doc) => {
        if (this.isRelevantDocument(doc)) {
          void this.indexDocument(doc.uri, doc.getText());
        }
      }),
    );
  }

  private isRelevantDocument(doc: vscode.TextDocument): boolean {
    return doc.languageId === 'nekostory' || doc.uri.fsPath.endsWith('.fountain');
  }

  private async buildFullIndex(): Promise<void> {
    const uris = await vscode.workspace.findFiles(FOUNTAIN_GLOB);
    for (const uri of uris) {
      const content = await this.readFileContent(uri);
      if (content !== undefined) {
        this.parseAndCache(uri, content);
      }
    }
    this.rebuildDerivedIndices();
    this._onDidUpdateIndex.fire(uris);
  }

  private async onFileChanged(uri: vscode.Uri): Promise<void> {
    const content = await this.readFileContent(uri);
    if (content !== undefined) {
      this.parseAndCache(uri, content);
      this.rebuildDerivedIndices();
      this._onDidUpdateIndex.fire([uri]);
    }
  }

  private onFileDeleted(uri: vscode.Uri): void {
    this.fileCache.delete(uri.toString());
    this.rebuildDerivedIndices();
    this._onDidUpdateIndex.fire([uri]);
  }

  private async indexDocument(uri: vscode.Uri, content: string): Promise<void> {
    this.parseAndCache(uri, content);
    this.rebuildDerivedIndices();
    this._onDidUpdateIndex.fire([uri]);
  }

  /**
   * Reads file content, preferring the live editor buffer over disk.
   */
  private async readFileContent(uri: vscode.Uri): Promise<string | undefined> {
    // Prefer open editor buffer (may have unsaved changes)
    const openDoc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
    if (openDoc) {
      return openDoc.getText();
    }
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      return new TextDecoder('utf-8').decode(bytes);
    } catch {
      return undefined;
    }
  }

  private parseAndCache(uri: vscode.Uri, content: string): void {
    try {
      const doc = parse(content);
      this.fileCache.set(uri.toString(), doc);
    } catch {
      // Ignore parse errors — keep stale cache entry if any
    }
  }

  /**
   * Rebuilds all derived indices from the file cache.
   * Called after any cache mutation.
   */
  private rebuildDerivedIndices(): void {
    this.characterIndex.clear();
    this.sceneIndex.clear();
    this.sectionIndex.clear();

    for (const [uriStr, doc] of this.fileCache) {
      const uri = vscode.Uri.parse(uriStr);

      for (const element of doc.elements) {
        const range = new vscode.Range(
          element.range.start.line,
          element.range.start.character,
          element.range.end.line,
          element.range.end.character,
        );

        if (element.type === 'character') {
          const char = element as Character;
          const loc: SymbolLocation = {
            uri,
            name: char.name,
            kind: 'character',
            range,
            detail: char.extension ?? undefined,
          };
          pushToIndex(this.characterIndex, char.name, loc);
        } else if (element.type === 'scene_heading') {
          const scene = element as SceneHeading;
          if (scene.location) {
            const detail = [scene.intExt, scene.time].filter(Boolean).join(' - ');
            const loc: SymbolLocation = {
              uri,
              name: scene.location,
              kind: 'scene',
              range,
              detail: detail || undefined,
            };
            pushToIndex(this.sceneIndex, scene.location, loc);
          }
        } else if (element.type === 'section') {
          const section = element as Section;
          const loc: SymbolLocation = {
            uri,
            name: section.text,
            kind: 'section',
            range,
            detail: `H${section.level}`,
          };
          pushToIndex(this.sectionIndex, section.text, loc);
        }
      }
    }
  }
}

// -- Helpers --

function pushToIndex(index: Map<string, SymbolLocation[]>, key: string, loc: SymbolLocation): void {
  let arr = index.get(key);
  if (!arr) {
    arr = [];
    index.set(key, arr);
  }
  arr.push(loc);
}

/**
 * Sorts locations so that entries matching `currentUri` come first.
 */
function sortCurrentFirst(
  locations: readonly SymbolLocation[],
  currentUri?: vscode.Uri,
): readonly SymbolLocation[] {
  if (!currentUri || locations.length === 0) return locations;
  const currentStr = currentUri.toString();
  const current: SymbolLocation[] = [];
  const rest: SymbolLocation[] = [];
  for (const loc of locations) {
    if (loc.uri.toString() === currentStr) {
      current.push(loc);
    } else {
      rest.push(loc);
    }
  }
  return [...current, ...rest];
}
