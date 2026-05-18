import * as vscode from 'vscode';
import {
  DASHBOARD_CREATIVE_ENTITY_SOURCE_COMMAND,
  isDashboardCreativeEntityActionRequest,
  isDashboardCreativeEntityActionResult,
  isDashboardCreativeEntityDetail,
  isDashboardCreativeEntityEvent,
  isDashboardCreativeEntityRef,
  isDashboardCreativeEntityRow,
  isDashboardCreativeEntitySnapshot,
  isDashboardCreativeEntitySource,
  isDashboardCreativeEntitySourceStatus,
  toDashboardCreativeEntityId,
  type DashboardCreativeEntityActionRequest,
  type DashboardCreativeEntityActionResult,
  type DashboardCreativeEntityDetail,
  type DashboardCreativeEntityEvent,
  type DashboardCreativeEntityRef,
  type DashboardCreativeEntityRow,
  type DashboardCreativeEntitySource,
  type DashboardCreativeEntitySourceStatus,
} from '@neko/shared/types/dashboard-creative-entity';
import {
  isDashboardDisposableLike,
  type DashboardDisposableLike,
} from '@neko/shared/types/dashboard-task';
import { NOOP_DASHBOARD_LOGGER, type DashboardLogger } from './logging';

const SOURCE_COMMANDS = [DASHBOARD_CREATIVE_ENTITY_SOURCE_COMMAND] as const;

export interface DashboardCreativeEntityState {
  readonly statuses: readonly DashboardCreativeEntitySourceStatus[];
  readonly rows: readonly DashboardCreativeEntityRow[];
  readonly selectedRef?: DashboardCreativeEntityRef;
  readonly detail?: DashboardCreativeEntityDetail;
}

interface RegisteredEntitySource {
  readonly source: DashboardCreativeEntitySource;
  readonly subscription: DashboardDisposableLike;
}

export interface CreativeEntitySourceAggregatorOptions {
  readonly logger?: DashboardLogger;
  readonly sourceCommands?: readonly string[];
}

export class CreativeEntitySourceAggregator implements vscode.Disposable {
  private readonly sources = new Map<string, RegisteredEntitySource>();
  private readonly statuses = new Map<string, DashboardCreativeEntitySourceStatus>();
  private readonly rows = new Map<string, DashboardCreativeEntityRow>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly emitter = new vscode.EventEmitter<DashboardCreativeEntityEvent>();
  private readonly logger: DashboardLogger;
  private readonly sourceCommands: readonly string[];
  private selectedRef: DashboardCreativeEntityRef | undefined;
  private detail: DashboardCreativeEntityDetail | undefined;

  readonly onDidChangeEntity = this.emitter.event;

  constructor(options: CreativeEntitySourceAggregatorOptions = {}) {
    this.logger = options.logger ?? NOOP_DASHBOARD_LOGGER;
    this.sourceCommands = options.sourceCommands ?? SOURCE_COMMANDS;
    this.disposables.push(
      vscode.commands.registerCommand(
        'neko.dashboard.registerCreativeEntitySource',
        (candidate: unknown) => this.register(candidate),
      ),
    );
  }

  async refreshSources(): Promise<void> {
    await Promise.all(
      this.sourceCommands.map(async (command) => {
        try {
          const candidate = await vscode.commands.executeCommand<unknown>(command);
          await this.register(candidate);
        } catch (error) {
          const missingStatus = missingSourceStatusForCommand(command, error);
          this.statuses.set(missingStatus.source, {
            source: missingStatus.source,
            sourceDisplayName: missingStatus.sourceDisplayName,
            available: false,
            freshness: 'stale',
            error: missingStatus.error,
          });
          this.logger.warn('Dashboard creative entity source discovery failed', {
            command,
            error,
          });
        }
      }),
    );
  }

  getState(): DashboardCreativeEntityState {
    return {
      statuses: [...this.statuses.values()].sort(compareStatuses),
      rows: [...this.rows.values()].sort(compareRows),
      ...(this.selectedRef ? { selectedRef: this.selectedRef } : {}),
      ...(this.detail ? { detail: this.detail } : {}),
    };
  }

  async getDetail(
    ref: DashboardCreativeEntityRef,
  ): Promise<DashboardCreativeEntityDetail | undefined> {
    if (!isDashboardCreativeEntityRef(ref)) {
      throw new Error('Invalid creative entity ref.');
    }

    const source = this.sources.get(ref.source)?.source;
    if (!source) {
      throw new Error(`Unknown creative entity source: ${ref.source}`);
    }

    const detail = await source.getDetail(ref);
    if (detail !== undefined && !isDashboardCreativeEntityDetail(detail)) {
      this.logger.warn('Ignoring invalid dashboard creative entity detail', {
        source: ref.source,
        ref,
      });
      return undefined;
    }

    this.selectedRef = ref;
    this.detail = detail;
    return detail;
  }

  async executeAction(
    request: DashboardCreativeEntityActionRequest,
  ): Promise<DashboardCreativeEntityActionResult> {
    if (!isDashboardCreativeEntityActionRequest(request)) {
      throw new Error('Invalid creative entity action request.');
    }

    const source = this.sources.get(request.source)?.source;
    if (!source) {
      throw new Error(`Unknown creative entity source: ${request.source}`);
    }

    const result = await source.executeAction(request);
    if (!isDashboardCreativeEntityActionResult(result)) {
      throw new Error(`Invalid creative entity action result from ${request.source}`);
    }

    if (result.refresh) {
      await this.reloadSource(source);
      if (
        result.ref &&
        this.selectedRef &&
        toDashboardCreativeEntityId(result.ref) === toDashboardCreativeEntityId(this.selectedRef)
      ) {
        await this.getDetail(result.ref);
      }
    }

    return result;
  }

  dispose(): void {
    for (const registered of this.sources.values()) {
      registered.subscription.dispose();
    }
    this.sources.clear();
    this.statuses.clear();
    this.rows.clear();
    this.detail = undefined;
    this.selectedRef = undefined;
    this.emitter.dispose();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private async register(candidate: unknown): Promise<void> {
    if (!isDashboardCreativeEntitySource(candidate)) {
      if (candidate !== undefined) {
        this.logger.warn('Ignoring invalid dashboard creative entity source', { candidate });
      }
      return;
    }

    const subscription = candidate.onDidChangeEntity((event) => {
      void this.applyEvent(event);
    });
    if (!isDashboardDisposableLike(subscription)) {
      this.logger.warn('Ignoring dashboard creative entity source with invalid subscription', {
        source: candidate.source,
      });
      return;
    }

    const previous = this.sources.get(candidate.source);
    previous?.subscription.dispose();
    this.deleteRowsForSource(candidate.source);
    this.sources.set(candidate.source, { source: candidate, subscription });
    await this.reloadSource(candidate);
  }

  private async reloadSource(source: DashboardCreativeEntitySource): Promise<void> {
    try {
      const snapshot = await source.getSnapshot();
      if (!isDashboardCreativeEntitySnapshot(snapshot)) {
        this.logger.warn('Ignoring invalid dashboard creative entity snapshot', {
          source: source.source,
        });
        return;
      }

      this.statuses.set(source.source, snapshot.status);
      this.deleteRowsForSource(source.source);
      for (const row of snapshot.rows) {
        if (isDashboardCreativeEntityRow(row)) {
          this.rows.set(toDashboardCreativeEntityId(row.ref), row);
        } else {
          this.logger.warn('Ignoring invalid dashboard creative entity row', {
            source: source.source,
          });
        }
      }
    } catch (error) {
      this.statuses.set(source.source, {
        source: source.source,
        sourceDisplayName: source.sourceDisplayName,
        available: false,
        freshness: 'stale',
        error: error instanceof Error ? error.message : String(error),
      });
      this.logger.warn('Dashboard creative entity snapshot failed', {
        source: source.source,
        error,
      });
    }
  }

  private async applyEvent(event: DashboardCreativeEntityEvent): Promise<void> {
    if (!isDashboardCreativeEntityEvent(event)) return;

    const source = this.sources.get(event.source)?.source;
    if (!source) return;

    if (event.row && isDashboardCreativeEntityRow(event.row)) {
      const rowId = toDashboardCreativeEntityId(event.row.ref);
      if (event.type === 'removed') {
        this.rows.delete(rowId);
      } else {
        this.rows.set(rowId, event.row);
      }
    } else {
      await this.reloadSource(source);
    }

    const previousStatus = this.statuses.get(event.source);
    if (previousStatus && isDashboardCreativeEntitySourceStatus(previousStatus)) {
      this.statuses.set(event.source, { ...previousStatus, freshness: event.freshness });
    }

    if (
      event.ref &&
      this.selectedRef &&
      toDashboardCreativeEntityId(event.ref) === toDashboardCreativeEntityId(this.selectedRef)
    ) {
      await this.getDetail(event.ref);
    }

    this.emitter.fire(event);
  }

  private deleteRowsForSource(source: string): void {
    for (const [rowId, row] of this.rows) {
      if (row.ref.source === source) {
        this.rows.delete(rowId);
      }
    }
  }
}

function missingSourceStatusForCommand(
  command: string,
  error: unknown,
): Pick<DashboardCreativeEntitySourceStatus, 'source' | 'sourceDisplayName' | 'error'> {
  if (command === DASHBOARD_CREATIVE_ENTITY_SOURCE_COMMAND) {
    return {
      source: 'neko-story',
      sourceDisplayName: 'Neko Story',
      error: error instanceof Error ? error.message : String(error),
    };
  }
  return {
    source: command,
    sourceDisplayName: command,
    error: error instanceof Error ? error.message : String(error),
  };
}

function compareStatuses(
  a: DashboardCreativeEntitySourceStatus,
  b: DashboardCreativeEntitySourceStatus,
): number {
  return a.source.localeCompare(b.source);
}

function compareRows(a: DashboardCreativeEntityRow, b: DashboardCreativeEntityRow): number {
  return (
    statusRank(a.status) - statusRank(b.status) ||
    a.kind.localeCompare(b.kind) ||
    a.label.localeCompare(b.label) ||
    a.ref.source.localeCompare(b.ref.source) ||
    a.ref.sourceEntityId.localeCompare(b.ref.sourceEntityId)
  );
}

function statusRank(status: DashboardCreativeEntityRow['status']): number {
  switch (status) {
    case 'candidate':
      return 0;
    case 'confirmed':
      return 1;
    case 'deprecated':
      return 2;
    case 'merged':
      return 3;
    case 'unknown':
      return 4;
  }
}
