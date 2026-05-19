import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DASHBOARD_CREATIVE_ENTITY_CONTRACT_VERSION,
  DASHBOARD_CREATIVE_ENTITY_SOURCE_COMMAND,
  DASHBOARD_NEUTRAL_CREATIVE_ENTITY_SOURCE_COMMAND,
  type DashboardCreativeEntityDetail,
  type DashboardCreativeEntityEvent,
  type DashboardCreativeEntityRef,
  type DashboardCreativeEntityRow,
  type DashboardCreativeEntitySource,
} from '@neko/shared/types/dashboard-creative-entity';
import type { DashboardLogger } from './logging';
import { registerCommandHandler, vscodeCommandState } from './vscode-test-double';
import { CreativeEntitySourceAggregator } from './creativeEntitySourceAggregator';

const ref: DashboardCreativeEntityRef = {
  source: 'neko-story',
  sourceEntityId: 'entity:char_xiaoju',
  entityId: 'char_xiaoju',
  entityKind: 'character',
  workspaceFolder: 'neko-test',
};

const row: DashboardCreativeEntityRow = {
  ref,
  label: '小橘',
  kind: 'character',
  status: 'confirmed',
  sourceKind: 'registry',
  aliases: ['Xiaoju'],
  occurrenceCount: 2,
  defaultBindingRoles: ['portrait'],
  missingRepresentationKinds: ['live2d'],
  visualDraftCount: 1,
  syncSuggestionCount: 1,
  freshness: 'fresh',
  actions: [{ id: 'show-detail', label: 'Show detail' }],
  searchText: '小橘 Xiaoju portrait',
};

const detail: DashboardCreativeEntityDetail = {
  ref,
  label: '小橘',
  kind: 'character',
  status: 'confirmed',
  sourceKind: 'registry',
  aliases: ['Xiaoju'],
  relationships: [],
  occurrences: [],
  bindings: [],
  defaults: [],
  requirements: [],
  visualDrafts: [],
  syncSuggestions: [],
  freshness: 'fresh',
  actions: [{ id: 'refresh', label: 'Refresh' }],
};

describe('CreativeEntitySourceAggregator', () => {
  beforeEach(() => {
    vscodeCommandState.reset();
  });

  it('reports a missing Story source without breaking the state', async () => {
    const aggregator = new CreativeEntitySourceAggregator();

    await aggregator.refreshSources();

    expect(aggregator.getState()).toEqual({
      statuses: expect.arrayContaining([
        expect.objectContaining({
          source: 'neko-entity',
          sourceDisplayName: 'Neko Entity',
          available: false,
          freshness: 'stale',
        }),
        expect.objectContaining({
          source: 'neko-story',
          sourceDisplayName: 'Neko Story',
          available: false,
          freshness: 'stale',
        }),
      ]),
      rows: [],
    });
    aggregator.dispose();
  });

  it('rejects invalid sources and logs the issue', async () => {
    const logger = createLogger();
    registerCommandHandler(DASHBOARD_CREATIVE_ENTITY_SOURCE_COMMAND, () => ({ source: 'bad' }));
    const aggregator = new CreativeEntitySourceAggregator({ logger });

    await aggregator.refreshSources();

    expect(aggregator.getState().rows).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(
      'Ignoring invalid dashboard creative entity source',
      expect.objectContaining({ candidate: { source: 'bad' } }),
    );
    aggregator.dispose();
  });

  it('discovers valid sources and replaces duplicate subscriptions', async () => {
    const firstDispose = vi.fn();
    registerCommandHandler(DASHBOARD_CREATIVE_ENTITY_SOURCE_COMMAND, () =>
      createSource({ rows: [row], dispose: firstDispose }),
    );
    const aggregator = new CreativeEntitySourceAggregator();

    await aggregator.refreshSources();
    registerCommandHandler(DASHBOARD_CREATIVE_ENTITY_SOURCE_COMMAND, () =>
      createSource({ rows: [{ ...row, label: '小橘 Updated' }] }),
    );
    await aggregator.refreshSources();

    expect(firstDispose).toHaveBeenCalledOnce();
    expect(aggregator.getState().rows.map((item) => item.label)).toEqual(['小橘 Updated']);
    aggregator.dispose();
  });

  it('passes source discovery requests to dashboard source commands', async () => {
    const handler = vi.fn(() => createSource({ rows: [row] }));
    registerCommandHandler(DASHBOARD_CREATIVE_ENTITY_SOURCE_COMMAND, handler);
    const aggregator = new CreativeEntitySourceAggregator();

    await aggregator.refreshSources({
      projectRoot: '/workspace/neko-test',
      contextFilePath: '/workspace/neko-test/cases/test.fountain',
    });

    expect(handler).toHaveBeenCalledWith({
      projectRoot: '/workspace/neko-test',
      contextFilePath: '/workspace/neko-test/cases/test.fountain',
    });
    aggregator.dispose();
  });

  it('dedupes confirmed entity rows across neutral and Story sources', async () => {
    registerCommandHandler(DASHBOARD_NEUTRAL_CREATIVE_ENTITY_SOURCE_COMMAND, () =>
      createSource({
        source: 'neko-entity',
        sourceDisplayName: 'Neko Entity',
        rows: [
          {
            ...row,
            ref: { ...row.ref, source: 'neko-entity' },
            label: '小橘 Neutral',
          },
        ],
      }),
    );
    registerCommandHandler(DASHBOARD_CREATIVE_ENTITY_SOURCE_COMMAND, () =>
      createSource({ rows: [row] }),
    );
    const aggregator = new CreativeEntitySourceAggregator();

    await aggregator.refreshSources();

    expect(aggregator.getState().rows).toEqual([
      expect.objectContaining({ label: '小橘 Neutral' }),
    ]);
    aggregator.dispose();
  });

  it('loads details and delegates actions through the owning source', async () => {
    const executeAction = vi.fn(async () => ({ ok: true, refresh: false, ref }));
    registerCommandHandler(DASHBOARD_CREATIVE_ENTITY_SOURCE_COMMAND, () =>
      createSource({ rows: [row], detail, executeAction }),
    );
    const aggregator = new CreativeEntitySourceAggregator();

    await aggregator.refreshSources();
    await expect(aggregator.getDetail(ref)).resolves.toEqual(detail);
    await expect(
      aggregator.executeAction({
        source: 'neko-story',
        ref,
        action: 'bind-existing',
        role: 'portrait',
      }),
    ).resolves.toEqual({ ok: true, refresh: false, ref });

    expect(executeAction).toHaveBeenCalledWith({
      source: 'neko-story',
      ref,
      action: 'bind-existing',
      role: 'portrait',
    });
    aggregator.dispose();
  });

  it('refreshes stale state from source events', async () => {
    let listener: ((event: DashboardCreativeEntityEvent) => void) | undefined;
    registerCommandHandler(DASHBOARD_CREATIVE_ENTITY_SOURCE_COMMAND, () =>
      createSource({
        rows: [row],
        captureListener: (candidate) => {
          listener = candidate;
        },
      }),
    );
    const aggregator = new CreativeEntitySourceAggregator();
    const onChange = vi.fn();
    aggregator.onDidChangeEntity(onChange);

    await aggregator.refreshSources();
    listener?.({
      type: 'updated',
      source: 'neko-story',
      row: { ...row, label: '小橘 Fresh' },
      freshness: 'stale',
    });
    await Promise.resolve();

    expect(aggregator.getState().rows.map((item) => item.label)).toEqual(['小橘 Fresh']);
    expect(aggregator.getState().statuses[0]).toEqual(
      expect.objectContaining({ freshness: 'stale' }),
    );
    expect(onChange).toHaveBeenCalledOnce();
    aggregator.dispose();
  });

  it('rejects unsafe refs before action dispatch', async () => {
    const executeAction = vi.fn(async () => ({ ok: true }));
    registerCommandHandler(DASHBOARD_CREATIVE_ENTITY_SOURCE_COMMAND, () =>
      createSource({ rows: [row], executeAction }),
    );
    const aggregator = new CreativeEntitySourceAggregator();
    await aggregator.refreshSources();

    await expect(
      aggregator.executeAction({
        source: 'neko-story',
        ref: { ...ref, workspaceFolder: '/tmp/neko-test' },
        action: 'open-source',
      }),
    ).rejects.toThrow('Invalid creative entity action request.');
    expect(executeAction).not.toHaveBeenCalled();
    aggregator.dispose();
  });
});

interface CreateSourceOptions {
  readonly source?: string;
  readonly sourceDisplayName?: string;
  readonly rows?: readonly DashboardCreativeEntityRow[];
  readonly detail?: DashboardCreativeEntityDetail;
  readonly dispose?: () => void;
  readonly captureListener?: (listener: (event: DashboardCreativeEntityEvent) => void) => void;
  readonly executeAction?: DashboardCreativeEntitySource['executeAction'];
}

function createSource(options: CreateSourceOptions = {}): DashboardCreativeEntitySource {
  const source = options.source ?? 'neko-story';
  const sourceDisplayName = options.sourceDisplayName ?? 'Neko Story';
  return {
    contractVersion: DASHBOARD_CREATIVE_ENTITY_CONTRACT_VERSION,
    source,
    sourceDisplayName,
    async getSnapshot() {
      return {
        source,
        sourceDisplayName,
        status: {
          source,
          sourceDisplayName,
          available: true,
          freshness: 'fresh',
          entityCount: options.rows?.length ?? 0,
          updatedAt: '2026-05-18T00:00:00.000Z',
        },
        rows: options.rows ?? [],
        freshness: 'fresh',
        updatedAt: '2026-05-18T00:00:00.000Z',
      };
    },
    async getDetail(candidateRef) {
      return candidateRef.sourceEntityId === ref.sourceEntityId ? options.detail : undefined;
    },
    executeAction: options.executeAction ?? (async () => ({ ok: true })),
    onDidChangeEntity(listener) {
      options.captureListener?.(listener);
      return { dispose: options.dispose ?? vi.fn() };
    },
  };
}

function createLogger(): DashboardLogger & { readonly warn: ReturnType<typeof vi.fn> } {
  const logger = {
    source: 'CreativeEntitySourceAggregatorTest',
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
    setLevel: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger;
}
