import { describe, expect, it } from 'vitest';
import type { DashboardCreativeEntityRow } from '@neko/shared/types/dashboard-creative-entity';
import { filterAndSortCreativeEntities } from './creativeEntityTableState';

const rows: readonly DashboardCreativeEntityRow[] = [
  {
    ref: {
      source: 'neko-story',
      sourceEntityId: 'entity:char_xiaoju',
      entityId: 'char_xiaoju',
      entityKind: 'character',
      workspaceFolder: 'neko-test',
    },
    label: '小橘',
    kind: 'character',
    status: 'confirmed',
    sourceKind: 'registry',
    aliases: ['Xiaoju'],
    missingRepresentationKinds: ['portrait'],
    freshness: 'fresh',
    actions: [{ id: 'show-detail', label: 'Show detail' }],
    searchText: '小橘 Xiaoju portrait',
  },
  {
    ref: {
      source: 'neko-story',
      sourceEntityId: 'candidate:character:阿灰',
      entityId: '阿灰',
      entityKind: 'character',
      workspaceFolder: 'neko-test',
    },
    label: '阿灰',
    kind: 'character',
    status: 'candidate',
    sourceKind: 'script',
    defaultBindingRoles: ['reference'],
    orphanedBindingCount: 1,
    freshness: 'fresh',
    actions: [{ id: 'show-detail', label: 'Show detail' }],
    searchText: '阿灰 candidate reference',
  },
  {
    ref: {
      source: 'neko-story',
      sourceEntityId: 'entity:location_cafe',
      entityId: 'location_cafe',
      entityKind: 'location',
      workspaceFolder: 'neko-test',
    },
    label: '咖啡店',
    kind: 'location',
    status: 'confirmed',
    sourceKind: 'registry',
    freshness: 'fresh',
    actions: [{ id: 'show-detail', label: 'Show detail' }],
    searchText: '咖啡店 location',
  },
];

describe('creative entity table state', () => {
  it('searches by Chinese names and aliases', () => {
    expect(baseFilter({ query: '小' }).map((row) => row.label)).toEqual(['小橘']);
    expect(baseFilter({ query: 'xiao' }).map((row) => row.label)).toEqual(['小橘']);
  });

  it('filters missing material and binding states', () => {
    expect(baseFilter({ missingFilter: 'missing' }).map((row) => row.label)).toEqual(['小橘']);
    expect(baseFilter({ bindingFilter: 'bound' }).map((row) => row.label)).toEqual(['阿灰']);
    expect(baseFilter({ bindingFilter: 'orphaned' }).map((row) => row.label)).toEqual(['阿灰']);
  });

  it('prioritizes orphaned bindings when sorting by binding state', () => {
    expect(baseFilter({ sortKey: 'bindings' }).map((row) => row.label)).toEqual([
      '阿灰',
      '咖啡店',
      '小橘',
    ]);
  });

  it('sorts deterministically by status with stable tie breakers', () => {
    expect(baseFilter({ sortKey: 'status' }).map((row) => row.label)).toEqual([
      '阿灰',
      '咖啡店',
      '小橘',
    ]);
  });
});

function baseFilter(
  overrides: Partial<Parameters<typeof filterAndSortCreativeEntities>[1]>,
): DashboardCreativeEntityRow[] {
  return filterAndSortCreativeEntities(rows, {
    query: '',
    kindFilter: 'all',
    statusFilter: 'all',
    missingFilter: 'all',
    bindingFilter: 'all',
    sortKey: 'status',
    ...overrides,
  });
}
