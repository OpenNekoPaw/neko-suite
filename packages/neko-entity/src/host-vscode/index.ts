import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type {
  CharacterRecord,
  CharacterRegistryFile,
  CreativeEntityChangeEvent,
  DashboardCreativeEntityEvent,
  DashboardCreativeEntitySourceRequest,
} from '@neko/shared';
import { createEmptyCharacterRegistryFile } from '@neko/shared';
import {
  isDashboardCreativeEntitySourceRequest,
  toDashboardCreativeEntityId,
} from '@neko/shared/types/dashboard-creative-entity';
import { CreativeEntityService } from '../core/CreativeEntityService';
import {
  EntityAssetBindingService,
  EntityAssetRequirementService,
  VisualIdentityDraftService,
} from '../core/factStores';
import { CreativeEntityRegistryService, ProjectEntityStore } from '../core/entityStore';
import type { EntityRuntimeFileStore, EntityRuntimePorts } from '../core/ports';
import { SerialEntityRuntimeLock } from '../core/ports';
import { EntityDashboardCreativeEntitySource } from '../dashboard/source';
import { resolveCharacterRegistryPath } from '../core/paths';

export class NodeJsonEntityFileStore implements EntityRuntimeFileStore {
  async readJson(filePath: string): Promise<unknown | undefined> {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      return JSON.parse(raw) as unknown;
    } catch {
      return undefined;
    }
  }

  async writeJson(filePath: string, value: unknown): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.tmp`;
    await fs.writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await fs.rename(tmpPath, filePath);
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

export class CharacterRegistryService {
  private readonly ports: EntityRuntimePorts;
  private readonly store: ProjectEntityStore;

  constructor(
    private readonly filePath: string,
    ports?: EntityRuntimePorts,
  ) {
    this.ports = ports ?? createVSCodeEntityPorts();
    this.store = new ProjectEntityStore({
      projectRoot: path.dirname(filePath),
      ports: this.ports,
    });
  }

  async load(): Promise<CharacterRegistryFile> {
    return this.store.loadCharacters();
  }

  async save(registry: CharacterRegistryFile): Promise<void> {
    await this.ports.files.writeJson(this.filePath, registry);
  }

  async list(): Promise<readonly CharacterRecord[]> {
    return (await this.load()).characters;
  }

  async getById(id: string): Promise<CharacterRecord | undefined> {
    return (await this.load()).characters.find((record) => record.id === id);
  }

  async resolveByName(name: string): Promise<CharacterRecord | undefined> {
    return this.store.resolveCharacterRecordByName(name);
  }

  async resolveIds(names: readonly string[]): Promise<Record<string, string>> {
    const resolved: Record<string, string> = {};
    for (const name of names) {
      const record = await this.resolveByName(name);
      if (record) {
        resolved[name] = record.id;
      }
    }
    return resolved;
  }

  async upsert(record: CharacterRecord): Promise<CharacterRegistryFile> {
    const registry = await this.load();
    const next = {
      version: 1 as const,
      characters: [
        ...registry.characters.filter((candidate) => candidate.id !== record.id),
        record,
      ].sort((a, b) => a.canonicalName.localeCompare(b.canonicalName) || a.id.localeCompare(b.id)),
    };
    await this.save(next);
    return next;
  }

  async remove(id: string): Promise<CharacterRegistryFile> {
    const registry = await this.load();
    const next = {
      version: 1 as const,
      characters: registry.characters.filter((record) => record.id !== id),
    };
    await this.save(next);
    return next;
  }
}

export interface VSCodeEntityRuntimeOptions {
  readonly projectRoot: string;
  readonly logger?: {
    warn(message: string, metadata?: Record<string, unknown>): void;
    info?(message: string, metadata?: Record<string, unknown>): void;
    error?(message: string, metadata?: Record<string, unknown>): void;
  };
}

export interface VSCodeDashboardEntitySourceCommandOptions {
  readonly projectRoot?: string;
  readonly logger?: VSCodeEntityRuntimeOptions['logger'];
}

export function createVSCodeEntityRuntime(options: VSCodeEntityRuntimeOptions): {
  readonly service: CreativeEntityService;
  readonly ports: EntityRuntimePorts;
  readonly onDidChangeEntity: vscode.Event<CreativeEntityChangeEvent>;
  dispose(): void;
} {
  const emitter = new vscode.EventEmitter<CreativeEntityChangeEvent>();
  const ports: EntityRuntimePorts = {
    files: new NodeJsonEntityFileStore(),
    lock: new SerialEntityRuntimeLock(),
    logger: options.logger,
    events: { emit: (event) => emitter.fire(event) },
  };
  const service = new CreativeEntityService({ projectRoot: options.projectRoot, ports });
  return {
    service,
    ports,
    onDidChangeEntity: emitter.event,
    dispose() {
      emitter.dispose();
    },
  };
}

export function createVSCodeEntityPorts(
  options: Pick<VSCodeEntityRuntimeOptions, 'logger'> = {},
): EntityRuntimePorts {
  return {
    files: new NodeJsonEntityFileStore(),
    lock: new SerialEntityRuntimeLock(),
    logger: options.logger,
  };
}

export function createVSCodeEntityServices(options: VSCodeEntityRuntimeOptions): {
  readonly ports: EntityRuntimePorts;
  readonly store: ProjectEntityStore;
  readonly registry: CreativeEntityRegistryService;
  readonly bindings: EntityAssetBindingService;
  readonly requirements: EntityAssetRequirementService;
  readonly drafts: VisualIdentityDraftService;
  readonly service: CreativeEntityService;
} {
  const ports = createVSCodeEntityPorts(options);
  const store = new ProjectEntityStore({ projectRoot: options.projectRoot, ports });
  const registry = new CreativeEntityRegistryService(store);
  const bindings = EntityAssetBindingService.fromProjectRoot(options.projectRoot, ports);
  const requirements = EntityAssetRequirementService.fromProjectRoot(options.projectRoot, ports);
  const drafts = VisualIdentityDraftService.fromProjectRoot(options.projectRoot, ports);
  const service = new CreativeEntityService({
    projectRoot: options.projectRoot,
    ports,
    store,
    bindings,
    requirements,
    drafts,
  });

  return {
    ports,
    store,
    registry,
    bindings,
    requirements,
    drafts,
    service,
  };
}

export function createVSCodeDashboardEntitySource(options: VSCodeEntityRuntimeOptions) {
  const runtime = createVSCodeEntityRuntime(options);
  return {
    runtime,
    source: new EntityDashboardCreativeEntitySource({
      projectRoot: options.projectRoot,
      service: runtime.service,
      executeCommand: async (command, ...args) => vscode.commands.executeCommand(command, ...args),
      subscribe(listener) {
        const disposable = runtime.onDidChangeEntity((event) => {
          listener(entityEventToDashboardEvent(event));
        });
        return { dispose: () => disposable.dispose() };
      },
    }),
  };
}

function entityEventToDashboardEvent(
  event: CreativeEntityChangeEvent,
): DashboardCreativeEntityEvent {
  const entityRef = event.changedRefs.find((ref) => ref.entityRef)?.entityRef;
  return {
    type: event.reason === 'deprecate' ? 'removed' : 'refreshed',
    source: 'neko-entity',
    ref: entityRef
      ? {
          source: 'neko-entity',
          sourceEntityId: `entity:${entityRef.entityId}`,
          entityId: entityRef.entityId,
          entityKind: entityRef.entityKind,
          projectRoot: entityRef.projectRoot,
        }
      : undefined,
    freshness: event.freshness,
  };
}

export function registerDashboardEntitySourceCommand(
  options: VSCodeDashboardEntitySourceCommandOptions = {},
) {
  const cached = new Map<string, ReturnType<typeof createVSCodeDashboardEntitySource>>();
  const command = vscode.commands.registerCommand(
    'neko.entity.getDashboardCreativeEntitySource',
    (request: DashboardCreativeEntitySourceRequest | unknown) => {
      const sourceRequest = isDashboardCreativeEntitySourceRequest(request) ? request : undefined;
      const projectRoot =
        options.projectRoot ??
        sourceRequest?.projectRoot ??
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!projectRoot) {
        return undefined;
      }
      const current = cached.get(projectRoot);
      if (current) {
        return current.source;
      }
      const next = createVSCodeDashboardEntitySource({
        projectRoot,
        logger: options.logger,
      });
      cached.set(projectRoot, next);
      return next.source;
    },
  );
  return {
    dispose() {
      command.dispose();
      for (const entry of cached.values()) {
        entry.runtime.dispose();
      }
      cached.clear();
    },
  };
}

export { toDashboardCreativeEntityId };
export { createEmptyCharacterRegistryFile, resolveCharacterRegistryPath };
export type {
  EntityAssetBindingService,
  EntityAssetRequirementService,
  VisualIdentityDraftService,
} from '../core/factStores';
export type { CreativeEntityRegistryService } from '../core/entityStore';
