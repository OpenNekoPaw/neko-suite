// =============================================================================
// CrossModalDataProvider — Collects data from canvas, asset, and generated
// sources via cross-extension APIs. Provides a unified snapshot for the
// OccurrenceIndex and CreativeEntityGraph to consume.
// =============================================================================

import * as vscode from 'vscode';
import type {
  AssetEntity,
  CanvasNode,
  EntityAssetBinding,
  GeneratedAsset,
  NekoCanvasAPI,
} from '@neko/shared';
import {
  EntityAssetBindingService,
  resolveEntityAssetBindingsPath,
} from '@neko/shared/vscode/extension';
import { getRootLogger } from '../utils/logger';

export interface CrossModalDataSnapshot {
  readonly canvasNodes: readonly CanvasNode[];
  readonly assetEntities: readonly AssetEntity[];
  readonly generatedAssets: readonly GeneratedAsset[];
  readonly entityAssetBindings?: readonly EntityAssetBinding[];
}

const EMPTY_SNAPSHOT: CrossModalDataSnapshot = {
  canvasNodes: [],
  assetEntities: [],
  generatedAssets: [],
  entityAssetBindings: [],
};

export class CrossModalDataProvider implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly onDidUpdateEmitter = new vscode.EventEmitter<void>();
  readonly onDidUpdate = this.onDidUpdateEmitter.event;

  private canvasNodes: readonly CanvasNode[] = [];
  private assetEntities: readonly AssetEntity[] = [];
  private generatedAssets: readonly GeneratedAsset[] = [];
  private entityAssetBindings: readonly EntityAssetBinding[] = [];

  private canvasApi: NekoCanvasAPI | undefined;
  private subscribed = false;
  private initPromise: Promise<void> | undefined;

  async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }
    return this.initPromise;
  }

  getSnapshot(): CrossModalDataSnapshot {
    if (
      this.canvasNodes.length === 0 &&
      this.assetEntities.length === 0 &&
      this.generatedAssets.length === 0 &&
      this.entityAssetBindings.length === 0
    ) {
      return EMPTY_SNAPSHOT;
    }
    return {
      canvasNodes: this.canvasNodes,
      assetEntities: this.assetEntities,
      generatedAssets: this.generatedAssets,
      entityAssetBindings: this.entityAssetBindings,
    };
  }

  dispose(): void {
    this.onDidUpdateEmitter.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async initialize(): Promise<void> {
    this.trySubscribeCanvas();
    this.disposables.push(
      vscode.extensions.onDidChange(() => {
        this.trySubscribeCanvas();
      }),
    );

    this.watchEntityAssetBindings();

    await Promise.all([
      this.refreshAssetEntities(),
      this.refreshGeneratedAssets(),
      this.refreshEntityAssetBindings(),
    ]);
  }

  private trySubscribeCanvas(): void {
    if (this.subscribed) {
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

      this.canvasApi = api;
      this.subscribed = true;

      this.disposables.push(
        api.events.onDidChangeCanvas(() => {
          void this.refreshCanvasNodes();
        }),
      );

      if (api.events.onDidChangeAssets) {
        this.disposables.push(
          api.events.onDidChangeAssets(() => {
            void this.refreshAssetEntities();
          }),
        );
      }

      void this.refreshCanvasNodes();
    } catch {
      // neko-canvas unavailable — retry on extensions.onDidChange
    }
  }

  private async refreshCanvasNodes(): Promise<void> {
    if (!this.canvasApi) {
      return;
    }

    try {
      this.canvasNodes = await this.canvasApi.nodes.list();
      this.onDidUpdateEmitter.fire();
    } catch (error) {
      getRootLogger().warn(
        `CrossModalDataProvider: failed to list canvas nodes: ${formatError(error)}`,
      );
    }
  }

  private async refreshAssetEntities(): Promise<void> {
    try {
      const result = await vscode.commands.executeCommand<readonly AssetEntity[] | undefined>(
        'neko.assets.getAllEntities',
      );
      if (result) {
        this.assetEntities = result;
        this.onDidUpdateEmitter.fire();
      }
    } catch {
      // neko-assets not installed or command unavailable — leave empty
    }
  }

  private async refreshGeneratedAssets(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.[0]) {
      return;
    }

    const indexUri = vscode.Uri.joinPath(
      folders[0].uri,
      '.neko',
      '.cache',
      'generated',
      'index.json',
    );
    try {
      const raw = await vscode.workspace.fs.readFile(indexUri);
      const data = JSON.parse(new TextDecoder().decode(raw)) as {
        version?: number;
        assets?: GeneratedAsset[];
      };
      if (Array.isArray(data.assets)) {
        this.generatedAssets = data.assets;
        this.onDidUpdateEmitter.fire();
      }
    } catch {
      // No generated index file — leave empty
    }
  }

  private watchEntityAssetBindings(): void {
    const watcher = vscode.workspace.createFileSystemWatcher('**/neko/entity-bindings*.json');
    this.disposables.push(
      watcher,
      watcher.onDidChange(() => {
        void this.refreshEntityAssetBindings();
      }),
      watcher.onDidCreate(() => {
        void this.refreshEntityAssetBindings();
      }),
      watcher.onDidDelete(() => {
        this.entityAssetBindings = [];
        this.onDidUpdateEmitter.fire();
      }),
    );
  }

  private async refreshEntityAssetBindings(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.[0]) {
      return;
    }

    try {
      const service = new EntityAssetBindingService(
        resolveEntityAssetBindingsPath(folders[0].uri.fsPath),
      );
      this.entityAssetBindings = await service.list();
      this.onDidUpdateEmitter.fire();
    } catch (error) {
      getRootLogger().warn(
        `CrossModalDataProvider: failed to list entity asset bindings: ${formatError(error)}`,
      );
    }
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
