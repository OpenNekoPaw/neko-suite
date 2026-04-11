// =============================================================================
// SceneWorkspaceIndexService — Script-backed scene identity index.
//
// Unlike CharacterWorkspaceIndexService (backed by characters.json), this
// derives scene identity from the script files via IWorkspaceIndex. The script
// IS the authority — no separate registry file needed.
//
// See ADR §2.3 and §9.6 for the scene entity model.
// =============================================================================

import * as vscode from 'vscode';
import type {
  ISceneWorkspaceIndex,
  IWorkspaceIndex,
  ResolvedSceneMatch,
  SceneCanvasBinding,
  SceneEntry,
} from './types';
import type { StorySceneStateStore } from './storySceneStateStore';

interface SceneIndexEntry {
  readonly entry: SceneEntry;
  readonly scriptUri: vscode.Uri;
}

export class SceneWorkspaceIndexService implements ISceneWorkspaceIndex {
  private readonly disposables: vscode.Disposable[] = [];

  /** sceneId → entry */
  private sceneIdMap = new Map<string, SceneIndexEntry>();
  /** normalized location → entries (may span multiple files) */
  private locationMap = new Map<string, SceneIndexEntry[]>();
  /** normalized heading → entry */
  private headingMap = new Map<string, SceneIndexEntry>();

  private initPromise: Promise<void> | undefined;

  constructor(
    private readonly workspaceIndex: IWorkspaceIndex,
    private readonly sceneStateStore: StorySceneStateStore,
  ) {}

  async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }
    return this.initPromise;
  }

  resolveScene(query: string, _currentUri?: vscode.Uri): ResolvedSceneMatch | undefined {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return undefined;
    }

    // 1. Try exact sceneId
    const byId = this.sceneIdMap.get(trimmed);
    if (byId) {
      return { entry: byId.entry, scriptUri: byId.scriptUri, matchedBy: 'sceneId' };
    }

    // 2. Try normalized heading
    const normalizedHeading = normalizeKey(trimmed);
    const byHeading = this.headingMap.get(normalizedHeading);
    if (byHeading) {
      return { entry: byHeading.entry, scriptUri: byHeading.scriptUri, matchedBy: 'heading' };
    }

    // 3. Try normalized location
    const byLocation = this.locationMap.get(normalizedHeading);
    const firstMatch = byLocation?.[0];
    if (firstMatch) {
      return { entry: firstMatch.entry, scriptUri: firstMatch.scriptUri, matchedBy: 'location' };
    }

    return undefined;
  }

  getDefinition(sceneId: string, _currentUri?: vscode.Uri): vscode.Location | undefined {
    const entry = this.sceneIdMap.get(sceneId);
    if (!entry) {
      return undefined;
    }
    return new vscode.Location(
      entry.scriptUri,
      new vscode.Range(
        entry.entry.line_start,
        0,
        entry.entry.line_start,
        entry.entry.heading.length,
      ),
    );
  }

  getLocationReferences(location: string, currentUri?: vscode.Uri): readonly vscode.Location[] {
    return this.workspaceIndex
      .findSceneLocations(location, currentUri)
      .map((loc) => new vscode.Location(loc.uri, loc.range));
  }

  getCanvasBinding(sceneId: string, documentUri?: vscode.Uri): SceneCanvasBinding | undefined {
    return this.sceneStateStore.getCanvasBinding(sceneId, documentUri) ?? undefined;
  }

  getAllSceneIds(_currentUri?: vscode.Uri): readonly string[] {
    return Array.from(this.sceneIdMap.keys());
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async initialize(): Promise<void> {
    await this.workspaceIndex.ensureInitialized();
    this.rebuildIndex();
    this.disposables.push(
      this.workspaceIndex.onDidUpdateIndex(() => {
        this.rebuildIndex();
      }),
    );
  }

  private rebuildIndex(): void {
    this.sceneIdMap.clear();
    this.locationMap.clear();
    this.headingMap.clear();

    for (const scriptIndex of this.workspaceIndex.getAllScriptIndices()) {
      const scriptUri = vscode.Uri.parse(scriptIndex.uri);
      for (const scene of scriptIndex.scenes) {
        const indexEntry: SceneIndexEntry = { entry: scene, scriptUri };

        // sceneId → entry (first wins in case of duplicates across files)
        if (!this.sceneIdMap.has(scene.sceneId)) {
          this.sceneIdMap.set(scene.sceneId, indexEntry);
        }

        // heading → entry (first wins)
        const normalizedHeading = normalizeKey(scene.heading);
        if (!this.headingMap.has(normalizedHeading)) {
          this.headingMap.set(normalizedHeading, indexEntry);
        }

        // location → entries (collect all)
        const normalizedLocation = normalizeKey(scene.location);
        if (normalizedLocation.length > 0) {
          let entries = this.locationMap.get(normalizedLocation);
          if (!entries) {
            entries = [];
            this.locationMap.set(normalizedLocation, entries);
          }
          entries.push(indexEntry);
        }
      }
    }
  }
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}
