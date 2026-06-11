import { useMemo, useState } from 'react';
import {
  DASHBOARD_CREATIVE_ENTITY_KINDS,
  DASHBOARD_CREATIVE_ENTITY_LIFECYCLE_STATUSES,
  type DashboardCreativeEntityAction,
  type DashboardCreativeEntityActionRequest,
  type DashboardCreativeEntityBindingSummary,
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
            <th>{t('creativeEntities.column.kind')}</th>
            <th>{t('creativeEntities.column.status')}</th>
            <th>{t('creativeEntities.column.missing')}</th>
            <th>{t('creativeEntities.column.defaults')}</th>
            <th>{t('creativeEntities.column.orphans')}</th>
            <th>{t('creativeEntities.column.drafts')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const selectedRow =
              selected?.source === row.ref.source &&
              selected.sourceEntityId === row.ref.sourceEntityId;
            return (
              <tr key={`${row.ref.source}:${row.ref.sourceEntityId}`}>
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
                  <Badge className="h-auto rounded-full px-2 py-0.5">
                    {t(`creativeEntities.kind.${row.kind}`)}
                  </Badge>
                </td>
                <td>{t(`creativeEntities.status.${row.status}`)}</td>
                <td>{formatList(row.missingRepresentationKinds, t)}</td>
                <td>{formatList(row.defaultBindingRoles, t)}</td>
                <td>{formatOrphanCount(row.orphanedBindingCount, t)}</td>
                <td>{row.visualDraftCount ?? 0}</td>
              </tr>
            );
          })}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="empty-cell">
                {t('creativeEntities.empty')}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
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
      <DetailBlock
        title={t('creativeEntities.detail.aliases')}
        value={formatList(detail.aliases, t)}
      />
      <DetailBlock
        title={t('creativeEntities.detail.occurrences')}
        value={formatOccurrences(detail, t)}
      />
      <DetailBlock
        title={t('creativeEntities.detail.defaultBindings')}
        value={formatBindings(detail.defaults, t)}
      />
      <BindingList detail={detail} onAction={onAction} />
      <DetailBlock
        title={t('creativeEntities.detail.missingRequirements')}
        value={formatRequirements(detail, t)}
      />
      <DetailBlock
        title={t('creativeEntities.detail.visualDrafts')}
        value={formatDrafts(detail, t)}
      />
      <MemoryReviews detail={detail} onAction={onAction} />
      <SyncSuggestions detail={detail} onAction={onAction} />
      <div className="detail-actions">
        {detail.actions
          .filter((action) => !isBindingScopedAction(action.id))
          .map((action) => (
            <ActionButton key={action.id} detail={detail} action={action.id} onAction={onAction} />
          ))}
      </div>
    </aside>
  );
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
    return (
      <DetailBlock
        title={t('creativeEntities.detail.allBindings')}
        value={t('creativeEntities.detail.none')}
      />
    );
  }
  const orphaned = detail.bindings.filter((binding) => binding.availability === 'orphaned');
  const orderedBindings =
    orphaned.length > 0
      ? [...orphaned, ...detail.bindings.filter((binding) => binding.availability !== 'orphaned')]
      : detail.bindings;
  return (
    <div className="detail-block">
      <div className="detail-block-title">{t('creativeEntities.detail.allBindings')}</div>
      <div className="detail-list">
        {orderedBindings.map((binding) => (
          <BindingListItem key={binding.id} detail={detail} binding={binding} onAction={onAction} />
        ))}
      </div>
    </div>
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
    return (
      <DetailBlock
        title={t('creativeEntities.detail.memoryReviews')}
        value={t('creativeEntities.detail.none')}
      />
    );
  }

  return (
    <div className="detail-block">
      <div className="detail-block-title">{t('creativeEntities.detail.memoryReviews')}</div>
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
    </div>
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
    return (
      <DetailBlock
        title={t('creativeEntities.detail.syncSuggestions')}
        value={t('creativeEntities.detail.none')}
      />
    );
  }

  return (
    <div className="detail-block">
      <div className="detail-block-title">{t('creativeEntities.detail.syncSuggestions')}</div>
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
    </div>
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

function DetailBlock({ title, value }: { readonly title: string; readonly value: string }) {
  return (
    <div className="detail-block">
      <div className="detail-block-title">{title}</div>
      <div>{value}</div>
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

function formatList(
  values: readonly string[] | undefined,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  return values && values.length > 0
    ? values.map((value) => translateEnumValue(value, t)).join(', ')
    : t('creativeEntities.detail.none');
}

function formatOccurrences(
  detail: DashboardCreativeEntityDetail,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (detail.occurrences.length === 0) return t('creativeEntities.detail.none');
  return detail.occurrences
    .slice(0, 4)
    .map((occurrence) => `${occurrence.label} (${occurrence.location})`)
    .join('; ');
}

function formatBindings(
  bindings: DashboardCreativeEntityDetail['bindings'],
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (bindings.length === 0) return t('creativeEntities.detail.none');
  return bindings.map((binding) => formatBinding(binding, t)).join('; ');
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

function formatOrphanCount(
  count: number | undefined,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  return count && count > 0
    ? t('creativeEntities.orphanedBindingCount', { count })
    : t('creativeEntities.detail.none');
}

function formatRequirements(
  detail: DashboardCreativeEntityDetail,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (detail.requirements.length === 0) return t('creativeEntities.detail.none');
  return detail.requirements
    .map(
      (requirement) =>
        `${requirement.requiredKinds.map((kind) => translateEnumValue(kind, t)).join(', ')} · ${t(`creativeEntities.requirementStatus.${requirement.status}`)}`,
    )
    .join('; ');
}

function formatDrafts(
  detail: DashboardCreativeEntityDetail,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (detail.visualDrafts.length === 0) return t('creativeEntities.detail.none');
  return detail.visualDrafts
    .map(
      (draft) =>
        `${t(`creativeEntities.draftStatus.${draft.status}`)}: ${t(
          'creativeEntities.detail.assets',
          {
            count: draft.generatedAssetIds.length,
          },
        )}`,
    )
    .join('; ');
}

function translateEnumValue(
  value: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const roleKey = `creativeEntities.role.${value}`;
  const roleLabel = t(roleKey);
  return roleLabel === roleKey ? value : roleLabel;
}
