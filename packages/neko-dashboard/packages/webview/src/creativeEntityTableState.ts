import type {
  DashboardCreativeEntityKind,
  DashboardCreativeEntityLifecycleStatus,
  DashboardCreativeEntityRow,
} from '@neko/shared/types/dashboard-creative-entity';

export type CreativeEntityKindFilter = DashboardCreativeEntityKind | 'all';
export type CreativeEntityStatusFilter = DashboardCreativeEntityLifecycleStatus | 'all';
export type CreativeEntityMissingFilter = 'all' | 'missing' | 'complete';
export type CreativeEntityBindingFilter = 'all' | 'bound' | 'unbound';
export type CreativeEntitySortKey = 'status' | 'kind' | 'label' | 'missing' | 'bindings';

export interface CreativeEntityTableOptions {
  readonly query: string;
  readonly kindFilter: CreativeEntityKindFilter;
  readonly statusFilter: CreativeEntityStatusFilter;
  readonly missingFilter: CreativeEntityMissingFilter;
  readonly bindingFilter: CreativeEntityBindingFilter;
  readonly sortKey: CreativeEntitySortKey;
}

export function filterAndSortCreativeEntities(
  rows: readonly DashboardCreativeEntityRow[],
  options: CreativeEntityTableOptions,
): DashboardCreativeEntityRow[] {
  const normalizedQuery = options.query.trim().toLowerCase();

  return [...rows]
    .filter((row) => options.kindFilter === 'all' || row.kind === options.kindFilter)
    .filter((row) => options.statusFilter === 'all' || row.status === options.statusFilter)
    .filter((row) => {
      if (options.missingFilter === 'all') return true;
      const hasMissing = (row.missingRepresentationKinds?.length ?? 0) > 0;
      return options.missingFilter === 'missing' ? hasMissing : !hasMissing;
    })
    .filter((row) => {
      if (options.bindingFilter === 'all') return true;
      const hasBinding = (row.defaultBindingRoles?.length ?? 0) > 0;
      return options.bindingFilter === 'bound' ? hasBinding : !hasBinding;
    })
    .filter((row) => {
      if (!normalizedQuery) return true;
      return (
        row.label.toLowerCase().includes(normalizedQuery) ||
        row.searchText.toLowerCase().includes(normalizedQuery) ||
        row.aliases?.some((alias) => alias.toLowerCase().includes(normalizedQuery)) === true ||
        row.ref.sourceEntityId.toLowerCase().includes(normalizedQuery)
      );
    })
    .sort((a, b) => compareCreativeEntityRows(a, b, options.sortKey));
}

function compareCreativeEntityRows(
  a: DashboardCreativeEntityRow,
  b: DashboardCreativeEntityRow,
  sortKey: CreativeEntitySortKey,
): number {
  const primary = comparePrimary(a, b, sortKey);
  if (primary !== 0) return primary;
  return (
    a.label.localeCompare(b.label) ||
    a.ref.source.localeCompare(b.ref.source) ||
    a.ref.sourceEntityId.localeCompare(b.ref.sourceEntityId)
  );
}

function comparePrimary(
  a: DashboardCreativeEntityRow,
  b: DashboardCreativeEntityRow,
  sortKey: CreativeEntitySortKey,
): number {
  switch (sortKey) {
    case 'status':
      return statusRank(a.status) - statusRank(b.status);
    case 'kind':
      return a.kind.localeCompare(b.kind);
    case 'label':
      return a.label.localeCompare(b.label);
    case 'missing':
      return (
        (b.missingRepresentationKinds?.length ?? 0) - (a.missingRepresentationKinds?.length ?? 0)
      );
    case 'bindings':
      return (b.defaultBindingRoles?.length ?? 0) - (a.defaultBindingRoles?.length ?? 0);
  }
}

function statusRank(status: DashboardCreativeEntityLifecycleStatus): number {
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
