import { useMemo, useState } from 'react';
import {
  DASHBOARD_CREATIVE_ENTITY_KINDS,
  DASHBOARD_CREATIVE_ENTITY_LIFECYCLE_STATUSES,
  type DashboardCreativeEntityAction,
  type DashboardCreativeEntityActionRequest,
  type DashboardCreativeEntityDetail,
  type DashboardCreativeEntityRef,
  type DashboardCreativeEntityRow,
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
        <button type="button" onClick={onRefresh}>
          {t('common.refresh')}
        </button>
      </div>
      <div className="table-toolbar creative-entity-toolbar">
        <input
          aria-label={t('creativeEntities.search')}
          placeholder={t('creativeEntities.search')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          aria-label={t('creativeEntities.allKinds')}
          value={kindFilter}
          onChange={(event) => setKindFilter(event.target.value as CreativeEntityKindFilter)}
        >
          <option value="all">{t('creativeEntities.allKinds')}</option>
          {DASHBOARD_CREATIVE_ENTITY_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t(`creativeEntities.kind.${kind}`)}
            </option>
          ))}
        </select>
        <select
          aria-label={t('creativeEntities.allStatuses')}
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as CreativeEntityStatusFilter)}
        >
          <option value="all">{t('creativeEntities.allStatuses')}</option>
          {DASHBOARD_CREATIVE_ENTITY_LIFECYCLE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`creativeEntities.status.${status}`)}
            </option>
          ))}
        </select>
        <select
          aria-label={t('creativeEntities.allMaterialStates')}
          value={missingFilter}
          onChange={(event) => setMissingFilter(event.target.value as CreativeEntityMissingFilter)}
        >
          <option value="all">{t('creativeEntities.allMaterialStates')}</option>
          <option value="missing">{t('creativeEntities.missingMaterials')}</option>
          <option value="complete">{t('creativeEntities.noMissingMaterials')}</option>
        </select>
        <select
          aria-label={t('creativeEntities.allBindingStates')}
          value={bindingFilter}
          onChange={(event) => setBindingFilter(event.target.value as CreativeEntityBindingFilter)}
        >
          <option value="all">{t('creativeEntities.allBindingStates')}</option>
          <option value="bound">{t('creativeEntities.hasDefaultBinding')}</option>
          <option value="unbound">{t('creativeEntities.noDefaultBinding')}</option>
        </select>
        <select
          aria-label={t('creativeEntities.sort.status')}
          value={sortKey}
          onChange={(event) => setSortKey(event.target.value as CreativeEntitySortKey)}
        >
          <option value="status">{t('creativeEntities.sort.status')}</option>
          <option value="kind">{t('creativeEntities.sort.kind')}</option>
          <option value="label">{t('creativeEntities.sort.label')}</option>
          <option value="missing">{t('creativeEntities.sort.missing')}</option>
          <option value="bindings">{t('creativeEntities.sort.bindings')}</option>
        </select>
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
                  <button
                    className={selectedRow ? 'link-button selected-link' : 'link-button'}
                    type="button"
                    onClick={() => onSelect(row.ref)}
                  >
                    {row.label}
                  </button>
                  {row.aliases?.length ? (
                    <div className="muted-line">{row.aliases.join(', ')}</div>
                  ) : null}
                </td>
                <td>
                  <span className="badge">{t(`creativeEntities.kind.${row.kind}`)}</span>
                </td>
                <td>{t(`creativeEntities.status.${row.status}`)}</td>
                <td>{formatList(row.missingRepresentationKinds, t)}</td>
                <td>{formatList(row.defaultBindingRoles, t)}</td>
                <td>{row.visualDraftCount ?? 0}</td>
              </tr>
            );
          })}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="empty-cell">
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
      <DetailBlock
        title={t('creativeEntities.detail.allBindings')}
        value={formatBindings(detail.bindings, t)}
      />
      <DetailBlock
        title={t('creativeEntities.detail.missingRequirements')}
        value={formatRequirements(detail, t)}
      />
      <DetailBlock
        title={t('creativeEntities.detail.visualDrafts')}
        value={formatDrafts(detail, t)}
      />
      <SyncSuggestions detail={detail} onAction={onAction} />
      <div className="detail-actions">
        {detail.actions.map((action) => (
          <ActionButton key={action.id} detail={detail} action={action.id} onAction={onAction} />
        ))}
      </div>
    </aside>
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
              <button
                type="button"
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
              </button>
              <button
                type="button"
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
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
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
    <button
      type="button"
      disabled={descriptor.disabled}
      title={descriptor.reason}
      onClick={() => onAction({ source: detail.ref.source, ref: detail.ref, action })}
    >
      {label}
    </button>
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
  return bindings
    .map((binding) => `${translateEnumValue(binding.role, t)}: ${binding.assetRef}`)
    .join('; ');
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
