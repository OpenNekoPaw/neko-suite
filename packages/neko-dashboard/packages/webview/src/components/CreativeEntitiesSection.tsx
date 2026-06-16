import { useMemo, useState, type ReactNode } from 'react';
import {
  DASHBOARD_CREATIVE_ENTITY_KINDS,
  DASHBOARD_CREATIVE_ENTITY_LIFECYCLE_STATUSES,
  type DashboardCreativeEntityAction,
  type DashboardCreativeEntityActionRequest,
  type DashboardCreativeEntityBindingSummary,
  type DashboardCreativeEntityBindingPreviewKind,
  type DashboardCreativeEntityDetail,
  type DashboardCreativeEntityRef,
  type DashboardCreativeEntityRow,
  type DashboardEntityMemoryReviewAction,
  type DashboardEntityMemoryReviewItem,
} from '@neko/shared/types/dashboard-creative-entity';
import {
  filterAndSortCreativeEntities,
  type CreativeEntityBindingFilter,
  type CreativeEntityKindFilter,
  type CreativeEntityMissingFilter,
  type CreativeEntitySortKey,
  type CreativeEntityStatusFilter,
} from '../creativeEntityTableState';
import {
  shouldRenderCreativeEntityDetail,
  shouldRenderCreativeEntityRow,
} from '../creativeEntityRenderGuards';
import { Badge, Button, Select } from '@neko/ui/primitives';
import { useTranslation } from '../i18n/I18nContext';
import type { DashboardCreativeEntityState } from '../types';

export interface CreativeEntitiesSectionProps {
  readonly state: DashboardCreativeEntityState;
  readonly onSelect: (ref: DashboardCreativeEntityRef) => void;
  readonly onAction: (request: DashboardCreativeEntityActionRequest) => void;
  readonly onRefresh: () => void;
}

export function CreativeEntitiesSection({
  state,
  onSelect,
  onAction,
  onRefresh,
}: CreativeEntitiesSectionProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<CreativeEntityKindFilter>('all');
  const [statusFilter, setStatusFilter] = useState<CreativeEntityStatusFilter>('all');
  const [missingFilter, setMissingFilter] = useState<CreativeEntityMissingFilter>('all');
  const [bindingFilter, setBindingFilter] = useState<CreativeEntityBindingFilter>('all');
  const [sortKey, setSortKey] = useState<CreativeEntitySortKey>('status');

  const rows = useMemo(
    () =>
      filterAndSortCreativeEntities(state.rows.filter(shouldRenderCreativeEntityRow), {
        query,
        kindFilter,
        statusFilter,
        missingFilter,
        bindingFilter,
        sortKey,
      }),
    [bindingFilter, kindFilter, missingFilter, query, sortKey, state.rows, statusFilter],
  );
  const detail =
    state.detail && shouldRenderCreativeEntityDetail(state.detail) ? state.detail : undefined;

  return (
    <section className="panel creative-entities" aria-label={t('creativeEntities.title')}>
      <div className="section-header">
        <div>
          <h2>{t('creativeEntities.title')}</h2>
          <div className="section-subtitle">{formatSourceStatus(state, t)}</div>
        </div>
        <Button size="sm" variant="secondary" onClick={onRefresh}>
          {t('common.refresh')}
        </Button>
      </div>
      <div className="table-toolbar creative-entity-toolbar">
        <input
          aria-label={t('creativeEntities.search')}
          placeholder={t('creativeEntities.search')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Select
          label={t('creativeEntities.allKinds')}
          value={kindFilter}
          options={[
            { value: 'all', label: t('creativeEntities.allKinds') },
            ...DASHBOARD_CREATIVE_ENTITY_KINDS.map((kind) => ({
              value: kind,
              label: t(`creativeEntities.kind.${kind}`),
            })),
          ]}
          onValueChange={(value) => setKindFilter(value as CreativeEntityKindFilter)}
        />
        <Select
          label={t('creativeEntities.allStatuses')}
          value={statusFilter}
          options={[
            { value: 'all', label: t('creativeEntities.allStatuses') },
            ...DASHBOARD_CREATIVE_ENTITY_LIFECYCLE_STATUSES.map((status) => ({
              value: status,
              label: t(`creativeEntities.status.${status}`),
            })),
          ]}
          onValueChange={(value) => setStatusFilter(value as CreativeEntityStatusFilter)}
        />
        <Select
          label={t('creativeEntities.allMaterialStates')}
          value={missingFilter}
          options={[
            { value: 'all', label: t('creativeEntities.allMaterialStates') },
            { value: 'missing', label: t('creativeEntities.missingMaterials') },
            { value: 'complete', label: t('creativeEntities.noMissingMaterials') },
          ]}
          onValueChange={(value) => setMissingFilter(value as CreativeEntityMissingFilter)}
        />
        <Select
          label={t('creativeEntities.allBindingStates')}
          value={bindingFilter}
          options={[
            { value: 'all', label: t('creativeEntities.allBindingStates') },
            { value: 'bound', label: t('creativeEntities.hasDefaultBinding') },
            { value: 'unbound', label: t('creativeEntities.noDefaultBinding') },
            { value: 'orphaned', label: t('creativeEntities.orphanedBindings') },
          ]}
          onValueChange={(value) => setBindingFilter(value as CreativeEntityBindingFilter)}
        />
        <Select
          label={t('creativeEntities.sort.status')}
          value={sortKey}
          options={[
            { value: 'status', label: t('creativeEntities.sort.status') },
            { value: 'kind', label: t('creativeEntities.sort.kind') },
            { value: 'label', label: t('creativeEntities.sort.label') },
            { value: 'missing', label: t('creativeEntities.sort.missing') },
            { value: 'bindings', label: t('creativeEntities.sort.bindings') },
          ]}
          onValueChange={(value) => setSortKey(value as CreativeEntitySortKey)}
        />
      </div>
      <div className="creative-entity-layout">
        <CreativeEntityTable rows={rows} selected={state.selectedRef} onSelect={onSelect} />
        <CreativeEntityDetailPanel detail={detail} onAction={onAction} />
      </div>
    </section>
  );
}

interface CreativeEntityTableProps {
  readonly rows: readonly DashboardCreativeEntityRow[];
  readonly selected?: DashboardCreativeEntityRef;
  readonly onSelect: (ref: DashboardCreativeEntityRef) => void;
}

function CreativeEntityTable({ rows, selected, onSelect }: CreativeEntityTableProps) {
  const { t } = useTranslation();
  return (
    <div className="creative-entity-table-wrap">
      <table>
        <thead>
          <tr>
            <th>{t('creativeEntities.column.name')}</th>
            <th>{t('creativeEntities.column.identity')}</th>
            <th>{t('creativeEntities.column.materialState')}</th>
            <th>{t('creativeEntities.column.activity')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const selectedRow =
              selected?.source === row.ref.source &&
              selected.sourceEntityId === row.ref.sourceEntityId;
            return (
              <tr
                key={`${row.ref.source}:${row.ref.sourceEntityId}`}
                className={selectedRow ? 'creative-entity-row selected' : 'creative-entity-row'}
              >
                <td>
                  <Button
                    className={selectedRow ? 'link-button selected-link' : 'link-button'}
                    size="xs"
                    variant="ghost"
                    onClick={() => onSelect(row.ref)}
                  >
                    {row.label}
                  </Button>
                  {row.aliases?.length ? (
                    <div className="muted-line">{row.aliases.join(', ')}</div>
                  ) : null}
                </td>
                <td>
                  <div className="entity-table-identity">
                    <Badge className="h-auto rounded-full px-2 py-0.5">
                      {t(`creativeEntities.kind.${row.kind}`)}
                    </Badge>
                    <span>{t(`creativeEntities.status.${row.status}`)}</span>
                  </div>
                </td>
                <td>
                  <EntityTableMaterialSignals row={row} />
                </td>
                <td>
                  <EntityTableActivitySignals row={row} />
                </td>
              </tr>
            );
          })}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="empty-cell">
                {t('creativeEntities.empty')}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function EntityTableMaterialSignals({ row }: { readonly row: DashboardCreativeEntityRow }) {
  const { t } = useTranslation();
  const missingKinds = row.missingRepresentationKinds ?? [];
  const defaultRoles = row.defaultBindingRoles ?? [];
  const orphanedCount = row.orphanedBindingCount ?? 0;
  const signals: ReactNode[] = [];

  if (missingKinds.length > 0) {
    signals.push(
      <span key="missing" className="entity-table-signal" data-tone="warning">
        {t('creativeEntities.tableSignal.missing', {
          kinds: missingKinds.map((kind) => translateEnumValue(kind, t)).join(', '),
        })}
      </span>,
    );
  }
  if (defaultRoles.length > 0) {
    signals.push(
      <span key="defaults" className="entity-table-signal" data-tone="success">
        {t('creativeEntities.tableSignal.defaults', {
          roles: defaultRoles.map((role) => translateEnumValue(role, t)).join(', '),
        })}
      </span>,
    );
  }
  if (orphanedCount > 0) {
    signals.push(
      <span key="orphans" className="entity-table-signal" data-tone="danger">
        {t('creativeEntities.tableSignal.orphaned', { count: orphanedCount })}
      </span>,
    );
  }

  return (
    <div className="entity-table-signals">
      {signals.length > 0 ? (
        signals
      ) : (
        <span className="entity-table-signal" data-tone="neutral">
          {t('creativeEntities.tableSignal.ready')}
        </span>
      )}
    </div>
  );
}

function EntityTableActivitySignals({ row }: { readonly row: DashboardCreativeEntityRow }) {
  const { t } = useTranslation();
  const signals: ReactNode[] = [];
  if (row.occurrenceCount !== undefined && row.occurrenceCount > 0) {
    signals.push(
      <span key="occurrences" className="entity-table-signal" data-tone="neutral">
        {t('creativeEntities.tableSignal.occurrences', { count: row.occurrenceCount })}
      </span>,
    );
  }
  if (row.visualDraftCount !== undefined && row.visualDraftCount > 0) {
    signals.push(
      <span key="drafts" className="entity-table-signal" data-tone="info">
        {t('creativeEntities.tableSignal.drafts', { count: row.visualDraftCount })}
      </span>,
    );
  }
  if (row.syncSuggestionCount !== undefined && row.syncSuggestionCount > 0) {
    signals.push(
      <span key="sync" className="entity-table-signal" data-tone="info">
        {t('creativeEntities.tableSignal.syncSuggestions', { count: row.syncSuggestionCount })}
      </span>,
    );
  }

  return (
    <div className="entity-table-signals">
      {signals.length > 0 ? (
        signals
      ) : (
        <span className="muted-line">{t(`creativeEntities.freshness.${row.freshness}`)}</span>
      )}
    </div>
  );
}

interface CreativeEntityDetailPanelProps {
  readonly detail?: DashboardCreativeEntityDetail;
  readonly onAction: (request: DashboardCreativeEntityActionRequest) => void;
}

function CreativeEntityDetailPanel({ detail, onAction }: CreativeEntityDetailPanelProps) {
  const { t } = useTranslation();
  if (!detail) {
    return (
      <aside className="creative-entity-detail empty-cell">
        {t('creativeEntities.selectEntity')}
      </aside>
    );
  }
  const footerActions = detail.actions.filter((action) =>
    shouldRenderDetailFooterAction(action.id),
  );

  return (
    <aside className="creative-entity-detail">
      <div className="detail-title-row">
        <div>
          <h3>{detail.label}</h3>
          <div className="muted-line">
            {t(`creativeEntities.kind.${detail.kind}`)} ·{' '}
            {t(`creativeEntities.status.${detail.status}`)} ·{' '}
            {t(`creativeEntities.freshness.${detail.freshness}`)}
          </div>
        </div>
        <ActionButton detail={detail} action="open-source" onAction={onAction} />
      </div>
      <CreativeEntityDetailSummary detail={detail} />
      <CreativeEntityPreviewPanel detail={detail} onAction={onAction} />
      {detail.aliases.length > 0 ? (
        <DetailBlock title={t('creativeEntities.detail.aliases')}>
          <DetailChipList values={detail.aliases} />
        </DetailBlock>
      ) : null}
      <OccurrenceList detail={detail} />
      <BindingList detail={detail} onAction={onAction} />
      <RequirementList detail={detail} />
      <VisualDraftList detail={detail} />
      <MemoryReviews detail={detail} onAction={onAction} />
      <SyncSuggestions detail={detail} onAction={onAction} />
      {footerActions.length > 0 ? (
        <div className="detail-actions">
          {footerActions.map((action) => (
            <ActionButton key={action.id} detail={detail} action={action.id} onAction={onAction} />
          ))}
        </div>
      ) : null}
    </aside>
  );
}

interface CreativeEntityPreviewItem {
  readonly id: string;
  readonly kind: DashboardCreativeEntityBindingPreviewKind;
  readonly binding: DashboardCreativeEntityBindingSummary;
  readonly displayUri: string;
  readonly label: string;
}

interface CreativeEntityPreviewPanelProps {
  readonly detail: DashboardCreativeEntityDetail;
  readonly onAction: (request: DashboardCreativeEntityActionRequest) => void;
}

function CreativeEntityPreviewPanel({ detail, onAction }: CreativeEntityPreviewPanelProps) {
  const { t } = useTranslation();
  const [previewKind, setPreviewKind] =
    useState<DashboardCreativeEntityBindingPreviewKind>('image');
  const [selectedPreviewId, setSelectedPreviewId] = useState<string | undefined>();
  const previewItems = useMemo(() => buildCreativeEntityPreviewItems(detail), [detail]);
  const imageCount = previewItems.filter((item) => item.kind === 'image').length;
  const modelCount = previewItems.filter((item) => item.kind === 'model').length;
  const resolvedKind = resolvePreviewKind(previewKind, previewItems);
  const selectedItems = previewItems.filter((item) => item.kind === resolvedKind);
  const selectedItem =
    selectedItems.find((item) => item.id === selectedPreviewId) ?? selectedItems[0];

  return (
    <section className="entity-preview-panel" aria-label={t('creativeEntities.preview.title')}>
      <div className="entity-preview-header">
        <div>
          <div className="entity-preview-eyebrow">{t('creativeEntities.preview.title')}</div>
          <div className="entity-preview-summary">
            {formatPreviewSummary(imageCount, modelCount, t)}
          </div>
        </div>
        <div
          className="entity-preview-switch"
          role="tablist"
          aria-label={t('creativeEntities.preview.tabsLabel')}
        >
          {(['image', 'model'] as const).map((kind) => {
            const count = kind === 'image' ? imageCount : modelCount;
            const selected = resolvedKind === kind;
            return (
              <button
                key={kind}
                aria-selected={selected}
                className={selected ? 'entity-preview-tab active' : 'entity-preview-tab'}
                disabled={previewItems.length > 0 && count === 0}
                onClick={() => setPreviewKind(kind)}
                role="tab"
                type="button"
              >
                <span>{t(`creativeEntities.preview.kind.${kind}`)}</span>
                <span className="entity-preview-tab-count">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="entity-preview-stage" data-preview-kind={resolvedKind}>
        {selectedItem ? (
          <PreviewStage item={selectedItem} />
        ) : (
          <PreviewEmptyState detail={detail} onAction={onAction} />
        )}
      </div>

      {selectedItem ? <PreviewResourceMeta item={selectedItem} /> : null}
      {selectedItems.length > 1 ? (
        <PreviewStrip
          items={selectedItems}
          selectedId={selectedItem?.id}
          onSelect={setSelectedPreviewId}
        />
      ) : null}
    </section>
  );
}

function PreviewStage({ item }: { readonly item: CreativeEntityPreviewItem }) {
  const { t } = useTranslation();
  if (item.kind === 'image') {
    return (
      <img
        alt={t('creativeEntities.preview.imageAlt', { label: item.label })}
        className="entity-preview-media"
        src={item.displayUri}
      />
    );
  }

  return (
    <div className="entity-preview-model">
      {item.binding.preview?.thumbnailUri ? (
        <img
          alt={t('creativeEntities.preview.modelAlt', { label: item.label })}
          className="entity-preview-media"
          src={item.binding.preview.thumbnailUri}
        />
      ) : (
        <div className="entity-preview-model-placeholder" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      )}
      <div className="entity-preview-model-label">
        {t('creativeEntities.preview.modelPlaceholder')}
      </div>
    </div>
  );
}

function PreviewEmptyState({
  detail,
  onAction,
}: {
  readonly detail: DashboardCreativeEntityDetail;
  readonly onAction: (request: DashboardCreativeEntityActionRequest) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="entity-preview-empty" role="status">
      <div className="entity-preview-empty-mark" aria-hidden="true" />
      <div>
        <div className="entity-preview-empty-title">{t('creativeEntities.preview.emptyTitle')}</div>
        <div className="muted-line">{t('creativeEntities.preview.emptyDescription')}</div>
      </div>
      <div className="button-row entity-preview-empty-actions">
        {(['bind-existing', 'generate-material'] as const)
          .filter((action) => hasDetailAction(detail, action))
          .map((action) => (
            <ActionButton key={action} detail={detail} action={action} onAction={onAction} />
          ))}
      </div>
    </div>
  );
}

function PreviewResourceMeta({ item }: { readonly item: CreativeEntityPreviewItem }) {
  const { t } = useTranslation();
  return (
    <div className="entity-preview-resource-line">
      <Badge className="h-auto rounded-full px-2 py-0.5">
        {t(`creativeEntities.preview.kind.${item.kind}`)}
      </Badge>
      <span className="entity-preview-resource-name">{item.label}</span>
      <span className="entity-preview-resource-ref">{item.binding.assetRef}</span>
    </div>
  );
}

function PreviewStrip({
  items,
  selectedId,
  onSelect,
}: {
  readonly items: readonly CreativeEntityPreviewItem[];
  readonly selectedId?: string;
  readonly onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="entity-preview-strip" aria-label={t('creativeEntities.preview.stripLabel')}>
      {items.map((item) => {
        const selected = item.id === selectedId;
        return (
          <button
            key={item.id}
            aria-pressed={selected}
            className={selected ? 'entity-preview-thumb selected' : 'entity-preview-thumb'}
            onClick={() => onSelect(item.id)}
            title={item.label}
            type="button"
          >
            {item.binding.preview?.thumbnailUri || item.kind === 'image' ? (
              <img alt="" src={item.displayUri} />
            ) : (
              <span aria-hidden="true">3D</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function CreativeEntityDetailSummary({
  detail,
}: {
  readonly detail: DashboardCreativeEntityDetail;
}) {
  const { t } = useTranslation();
  const items = buildDetailSummaryItems(detail, t);
  if (items.length === 0) return null;

  return (
    <div className="detail-summary-strip" aria-label={t('creativeEntities.summary.label')}>
      {items.map((item) => (
        <span key={item.id} className="detail-summary-chip" data-tone={item.tone}>
          {item.label}
        </span>
      ))}
    </div>
  );
}

interface DetailSummaryItem {
  readonly id: string;
  readonly label: string;
  readonly tone: 'neutral' | 'info' | 'success' | 'warning';
}

function buildDetailSummaryItems(
  detail: DashboardCreativeEntityDetail,
  t: (key: string, params?: Record<string, string | number>) => string,
): readonly DetailSummaryItem[] {
  const items: DetailSummaryItem[] = [];
  if (detail.occurrences.length > 0) {
    items.push({
      id: 'occurrences',
      label: t('creativeEntities.summary.occurrences', {
        count: detail.occurrences.length,
      }),
      tone: 'neutral',
    });
  }
  if (detail.bindings.length > 0) {
    items.push({
      id: 'bindings',
      label: t('creativeEntities.summary.bindings', { count: detail.bindings.length }),
      tone: 'success',
    });
  }
  const defaultRoles = uniqueValues(detail.defaults.map((binding) => binding.role));
  if (defaultRoles.length > 0) {
    items.push({
      id: 'defaults',
      label: t('creativeEntities.summary.defaultBindings', {
        roles: defaultRoles.map((role) => translateEnumValue(role, t)).join(', '),
      }),
      tone: 'info',
    });
  }
  const missingKinds = uniqueValues(
    detail.requirements.flatMap((requirement) => requirement.requiredKinds),
  );
  if (missingKinds.length > 0) {
    items.push({
      id: 'missing',
      label: t('creativeEntities.summary.missingRequirements', {
        kinds: missingKinds.map((kind) => translateEnumValue(kind, t)).join(', '),
      }),
      tone: 'warning',
    });
  }
  if (detail.visualDrafts.length > 0) {
    items.push({
      id: 'drafts',
      label: t('creativeEntities.summary.visualDrafts', { count: detail.visualDrafts.length }),
      tone: 'info',
    });
  }
  const reviewCount = detail.memoryReviews?.length ?? 0;
  if (reviewCount > 0) {
    items.push({
      id: 'memory-reviews',
      label: t('creativeEntities.summary.memoryReviews', { count: reviewCount }),
      tone: 'warning',
    });
  }
  if (detail.syncSuggestions.length > 0) {
    items.push({
      id: 'sync-suggestions',
      label: t('creativeEntities.summary.syncSuggestions', {
        count: detail.syncSuggestions.length,
      }),
      tone: 'info',
    });
  }
  return items;
}

function BindingList({
  detail,
  onAction,
}: {
  readonly detail: DashboardCreativeEntityDetail;
  readonly onAction: (request: DashboardCreativeEntityActionRequest) => void;
}) {
  const { t } = useTranslation();
  if (detail.bindings.length === 0) {
    return null;
  }
  const orphaned = detail.bindings.filter((binding) => binding.availability === 'orphaned');
  const orderedBindings =
    orphaned.length > 0
      ? [...orphaned, ...detail.bindings.filter((binding) => binding.availability !== 'orphaned')]
      : detail.bindings;
  return (
    <DetailBlock title={t('creativeEntities.detail.allBindings')}>
      <div className="detail-list">
        {orderedBindings.map((binding) => (
          <BindingListItem key={binding.id} detail={detail} binding={binding} onAction={onAction} />
        ))}
      </div>
    </DetailBlock>
  );
}

function BindingListItem({
  detail,
  binding,
  onAction,
}: {
  readonly detail: DashboardCreativeEntityDetail;
  readonly binding: DashboardCreativeEntityBindingSummary;
  readonly onAction: (request: DashboardCreativeEntityActionRequest) => void;
}) {
  const { t } = useTranslation();
  const orphaned = binding.availability === 'orphaned';
  const [nextAssetRef, setNextAssetRef] = useState('');
  return (
    <div className="detail-list-item">
      <div>
        <div>{formatBinding(binding, t)}</div>
        {binding.orphanedAt ? (
          <div className="muted-line">
            {t('creativeEntities.binding.orphanedAt', { date: binding.orphanedAt })}
          </div>
        ) : null}
      </div>
      {orphaned ? (
        <div className="button-row">
          <input
            aria-label={t('creativeEntities.binding.rebindAssetRef')}
            placeholder={t('creativeEntities.binding.rebindAssetRef')}
            value={nextAssetRef}
            onChange={(event) => setNextAssetRef(event.target.value)}
          />
          <Button
            size="xs"
            variant="secondary"
            disabled={!nextAssetRef.trim()}
            onClick={() =>
              onAction({
                source: detail.ref.source,
                ref: detail.ref,
                action: 'rebind-orphaned-binding',
                payload: {
                  bindingId: binding.id,
                  assetRef: nextAssetRef.trim(),
                },
              })
            }
          >
            {t('creativeEntities.action.rebind-orphaned-binding')}
          </Button>
          <BindingActionButton
            detail={detail}
            binding={binding}
            action="locate-binding-source"
            onAction={onAction}
          />
          <BindingActionButton
            detail={detail}
            binding={binding}
            action="archive-binding"
            onAction={onAction}
          />
          {binding.status === 'suggested' ? (
            <BindingActionButton
              detail={detail}
              binding={binding}
              action="cleanup-suggested-orphan"
              onAction={onAction}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function BindingActionButton({
  detail,
  binding,
  action,
  onAction,
}: {
  readonly detail: DashboardCreativeEntityDetail;
  readonly binding: DashboardCreativeEntityBindingSummary;
  readonly action: DashboardCreativeEntityAction;
  readonly onAction: (request: DashboardCreativeEntityActionRequest) => void;
}) {
  const { t } = useTranslation();
  return (
    <Button
      size="xs"
      variant="secondary"
      onClick={() =>
        onAction({
          source: detail.ref.source,
          ref: detail.ref,
          action,
          payload: bindingActionPayload(action, binding),
        })
      }
    >
      {t(`creativeEntities.action.${action}`)}
    </Button>
  );
}

function bindingActionPayload(
  action: DashboardCreativeEntityAction,
  binding: DashboardCreativeEntityBindingSummary,
): Record<string, unknown> {
  return {
    bindingId: binding.id,
    ...(action === 'locate-binding-source' ? { assetRef: binding.assetRef } : {}),
  };
}

function isBindingScopedAction(action: DashboardCreativeEntityAction): boolean {
  switch (action) {
    case 'rebind-orphaned-binding':
    case 'locate-binding-source':
    case 'archive-binding':
    case 'cleanup-suggested-orphan':
      return true;
    default:
      return false;
  }
}

function shouldRenderDetailFooterAction(action: DashboardCreativeEntityAction): boolean {
  if (isBindingScopedAction(action)) return false;
  switch (action) {
    case 'open-source':
    case 'show-detail':
    case 'bind-existing':
    case 'generate-material':
    case 'handle-requirement':
    case 'review-drafts':
    case 'dismiss-requirement':
    case 'import-material':
    case 'show-representation-package':
    case 'apply-sync-suggestion':
    case 'ignore-sync-suggestion':
    case 'refresh':
      return false;
    default:
      return true;
  }
}

function hasDetailAction(
  detail: DashboardCreativeEntityDetail,
  action: DashboardCreativeEntityAction,
): boolean {
  return detail.actions.some((candidate) => candidate.id === action);
}

function MemoryReviews({
  detail,
  onAction,
}: {
  readonly detail: DashboardCreativeEntityDetail;
  readonly onAction: (request: DashboardCreativeEntityActionRequest) => void;
}) {
  const { t } = useTranslation();
  const reviews = detail.memoryReviews ?? [];
  if (reviews.length === 0) {
    return null;
  }

  return (
    <DetailBlock title={t('creativeEntities.detail.memoryReviews')}>
      <div className="detail-list">
        {reviews.map((review) => (
          <MemoryReviewItem
            key={review.reviewId}
            detail={detail}
            review={review}
            onAction={onAction}
          />
        ))}
      </div>
    </DetailBlock>
  );
}

function MemoryReviewItem({
  detail,
  review,
  onAction,
}: {
  readonly detail: DashboardCreativeEntityDetail;
  readonly review: DashboardEntityMemoryReviewItem;
  readonly onAction: (request: DashboardCreativeEntityActionRequest) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="detail-list-item">
      <div>
        <div>
          {review.summary} · {t(`creativeEntities.memoryStatus.${review.reviewStatus}`)}
        </div>
        <div className="muted-line">
          {review.sourceLabel ?? review.sourcePackage} · {review.sourceKind} ·{' '}
          {review.dimensions.join(', ')}
        </div>
        {review.evidenceText ? <div className="muted-line">{review.evidenceText}</div> : null}
      </div>
      <div className="button-row">
        {review.actions.map((action) => (
          <Button
            key={action}
            size="xs"
            variant={action === 'accept-memory-review' ? 'default' : 'secondary'}
            onClick={() =>
              onAction({
                source: detail.ref.source,
                ref: detail.ref,
                action,
                memoryReviewId: review.reviewId,
              })
            }
          >
            {memoryReviewActionLabel(action, t)}
          </Button>
        ))}
      </div>
    </div>
  );
}

function SyncSuggestions({
  detail,
  onAction,
}: {
  readonly detail: DashboardCreativeEntityDetail;
  readonly onAction: (request: DashboardCreativeEntityActionRequest) => void;
}) {
  const { t } = useTranslation();
  if (detail.syncSuggestions.length === 0) {
    return null;
  }

  return (
    <DetailBlock title={t('creativeEntities.detail.syncSuggestions')}>
      <div className="detail-list">
        {detail.syncSuggestions.map((suggestion) => (
          <div key={suggestion.id} className="detail-list-item">
            <div>
              {t(`creativeEntities.suggestion.${suggestion.kind}`)} ·{' '}
              {t(`creativeEntities.suggestionStatus.${suggestion.status}`)}
              <div className="muted-line">{suggestion.reason}</div>
            </div>
            <div className="button-row">
              <Button
                size="xs"
                disabled={suggestion.status === 'unavailable'}
                onClick={() =>
                  onAction({
                    source: detail.ref.source,
                    ref: detail.ref,
                    action: 'apply-sync-suggestion',
                    suggestionId: suggestion.id,
                  })
                }
              >
                {t('creativeEntities.action.apply')}
              </Button>
              <Button
                size="xs"
                variant="secondary"
                onClick={() =>
                  onAction({
                    source: detail.ref.source,
                    ref: detail.ref,
                    action: 'ignore-sync-suggestion',
                    suggestionId: suggestion.id,
                  })
                }
              >
                {t('creativeEntities.action.ignore')}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </DetailBlock>
  );
}

function memoryReviewActionLabel(
  action: DashboardEntityMemoryReviewAction,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const key = `creativeEntities.memoryAction.${action}`;
  const label = t(key);
  return label === key ? action : label;
}

function ActionButton({
  detail,
  action,
  onAction,
}: {
  readonly detail: DashboardCreativeEntityDetail;
  readonly action: DashboardCreativeEntityAction;
  readonly onAction: (request: DashboardCreativeEntityActionRequest) => void;
}) {
  const { t } = useTranslation();
  const descriptor = detail.actions.find((candidate) => candidate.id === action) ?? {
    id: action,
    label: t(`creativeEntities.action.${action}`),
  };
  const labelKey = `creativeEntities.action.${action}`;
  const translatedLabel = t(labelKey);
  const label = translatedLabel === labelKey ? descriptor.label : translatedLabel;
  return (
    <Button
      size="xs"
      variant="secondary"
      disabled={descriptor.disabled}
      title={descriptor.reason}
      onClick={() => onAction({ source: detail.ref.source, ref: detail.ref, action })}
    >
      {label}
    </Button>
  );
}

function OccurrenceList({ detail }: { readonly detail: DashboardCreativeEntityDetail }) {
  const { t } = useTranslation();
  if (detail.occurrences.length === 0) return null;
  const visibleOccurrences = detail.occurrences.slice(0, 4);
  const remaining = detail.occurrences.length - visibleOccurrences.length;
  return (
    <DetailBlock title={t('creativeEntities.detail.occurrences')}>
      <div className="detail-occurrence-list">
        {visibleOccurrences.map((occurrence, index) => (
          <OccurrenceChip
            key={`${occurrence.source}:${occurrence.role}:${occurrence.location}:${index}`}
            occurrence={occurrence}
          />
        ))}
        {remaining > 0 ? (
          <span className="detail-more-chip">
            {t('creativeEntities.detail.moreItems', { count: remaining })}
          </span>
        ) : null}
      </div>
    </DetailBlock>
  );
}

function OccurrenceChip({
  occurrence,
}: {
  readonly occurrence: DashboardCreativeEntityDetail['occurrences'][number];
}) {
  const { t } = useTranslation();
  const sourceLabel = formatOccurrenceSource(occurrence.source, t);
  const roleLabel = t(`creativeEntities.occurrenceRole.${occurrence.role}`);
  const locationLabel = formatCompactLocation(occurrence.location);
  return (
    <span
      className="detail-occurrence-chip"
      title={`${sourceLabel} · ${roleLabel} · ${occurrence.location}`}
    >
      <span className="detail-occurrence-meta">
        {sourceLabel} · {roleLabel}
      </span>
      <span className="detail-occurrence-location">{locationLabel}</span>
    </span>
  );
}

function RequirementList({ detail }: { readonly detail: DashboardCreativeEntityDetail }) {
  const { t } = useTranslation();
  if (detail.requirements.length === 0) return null;
  return (
    <DetailBlock title={t('creativeEntities.detail.missingRequirements')}>
      <div className="detail-list detail-list--compact">
        {detail.requirements.map((requirement) => (
          <div key={requirement.id} className="detail-list-item detail-list-item--compact">
            <div>
              <div className="detail-list-item-title">
                {requirement.requiredKinds.map((kind) => translateEnumValue(kind, t)).join(', ')}
              </div>
              <div className="muted-line">
                {t(`creativeEntities.requirementStatus.${requirement.status}`)} ·{' '}
                {formatCompactLocation(requirement.sourceRef)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </DetailBlock>
  );
}

function VisualDraftList({ detail }: { readonly detail: DashboardCreativeEntityDetail }) {
  const { t } = useTranslation();
  if (detail.visualDrafts.length === 0) return null;
  return (
    <DetailBlock title={t('creativeEntities.detail.visualDrafts')}>
      <div className="detail-list detail-list--compact">
        {detail.visualDrafts.map((draft) => (
          <div key={draft.id} className="detail-list-item detail-list-item--compact">
            <div>
              <div className="detail-list-item-title">
                {t(`creativeEntities.draftStatus.${draft.status}`)}
              </div>
              <div className="muted-line">
                {t('creativeEntities.detail.assets', {
                  count: draft.generatedAssetIds.length,
                })}{' '}
                · {draft.prompt}
              </div>
            </div>
          </div>
        ))}
      </div>
    </DetailBlock>
  );
}

function DetailChipList({ values }: { readonly values: readonly string[] }) {
  return (
    <div className="detail-chip-list">
      {values.map((value) => (
        <span key={value} className="detail-chip">
          {value}
        </span>
      ))}
    </div>
  );
}

function DetailBlock({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="detail-block">
      <div className="detail-block-title">{title}</div>
      <div className="detail-block-value">{children}</div>
    </div>
  );
}

function formatSourceStatus(
  state: DashboardCreativeEntityState,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (state.statuses.length === 0) return t('creativeEntities.noSource');
  return state.statuses
    .map((status) =>
      status.available
        ? `${status.sourceDisplayName ?? status.source}: ${t(`creativeEntities.freshness.${status.freshness}`)}`
        : `${status.sourceDisplayName ?? status.source}: ${t('creativeEntities.unavailable')}`,
    )
    .join(' · ');
}

function buildCreativeEntityPreviewItems(
  detail: DashboardCreativeEntityDetail,
): readonly CreativeEntityPreviewItem[] {
  return detail.bindings
    .flatMap((binding): CreativeEntityPreviewItem[] => {
      const preview = binding.preview;
      if (binding.availability !== 'active' || !preview) return [];
      return [
        {
          id: binding.id,
          kind: preview.kind,
          binding,
          displayUri: preview.thumbnailUri ?? preview.uri,
          label: preview.label ?? binding.assetRef,
        },
      ];
    })
    .sort(comparePreviewItems);
}

function comparePreviewItems(
  left: CreativeEntityPreviewItem,
  right: CreativeEntityPreviewItem,
): number {
  const defaultDelta = Number(right.binding.isDefault) - Number(left.binding.isDefault);
  if (defaultDelta !== 0) return defaultDelta;
  const statusDelta = bindingStatusPriority(right.binding) - bindingStatusPriority(left.binding);
  if (statusDelta !== 0) return statusDelta;
  return left.label.localeCompare(right.label);
}

function bindingStatusPriority(binding: DashboardCreativeEntityBindingSummary): number {
  switch (binding.status) {
    case 'confirmed':
      return 2;
    case 'suggested':
      return 1;
    case 'rejected':
      return 0;
  }
}

function resolvePreviewKind(
  preferredKind: DashboardCreativeEntityBindingPreviewKind,
  items: readonly CreativeEntityPreviewItem[],
): DashboardCreativeEntityBindingPreviewKind {
  if (items.length === 0) return preferredKind;
  if (items.some((item) => item.kind === preferredKind)) return preferredKind;
  return items.some((item) => item.kind === 'image') ? 'image' : 'model';
}

function formatPreviewSummary(
  imageCount: number,
  modelCount: number,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  return t('creativeEntities.preview.summary', {
    images: imageCount,
    models: modelCount,
  });
}

function formatBinding(
  binding: DashboardCreativeEntityBindingSummary,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const availability =
    binding.availability === 'active'
      ? ''
      : ` · ${t(`creativeEntities.availability.${binding.availability}`)}`;
  return `${translateEnumValue(binding.role, t)}: ${binding.assetRef} · ${t(
    `creativeEntities.bindingStatus.${binding.status}`,
  )}${availability}`;
}

function formatOccurrenceSource(
  source: DashboardCreativeEntityDetail['occurrences'][number]['source'],
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const key = `creativeEntities.occurrenceSource.${source}`;
  const label = t(key);
  return label === key ? source : label;
}

function formatCompactLocation(location: string): string {
  const withoutProtocol = location.startsWith('file://')
    ? location.slice('file://'.length)
    : location;
  const normalized = withoutProtocol.replace(/\\/g, '/');
  const match = /^(.*?)(?::(\d+(?:-\d+)?))?$/.exec(normalized);
  const rawPath = match?.[1] ?? normalized;
  const lineSuffix = match?.[2] ? `:${match[2]}` : '';
  const compactPath = compactPathLabel(decodeLocationPath(rawPath));
  return `${compactPath}${lineSuffix}`;
}

function compactPathLabel(value: string): string {
  const withoutScheme = value.replace(/^[A-Za-z][A-Za-z0-9+.-]*:\/\//, '');
  const normalized = withoutScheme.replace(/\/+/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 2) return normalized || value;
  return `${parts.at(-2)}/${parts.at(-1)}`;
}

function decodeLocationPath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function uniqueValues<T extends string>(values: readonly T[]): readonly T[] {
  return [...new Set(values)];
}

function translateEnumValue(
  value: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const roleKey = `creativeEntities.role.${value}`;
  const roleLabel = t(roleKey);
  return roleLabel === roleKey ? value : roleLabel;
}
