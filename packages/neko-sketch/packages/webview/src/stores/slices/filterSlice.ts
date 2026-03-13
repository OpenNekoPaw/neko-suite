/**
 * Filter Slice - image filter stack state
 *
 * Manages applied filters per layer: add, remove, reorder, toggle, update params.
 */
import type { StateCreator } from 'zustand';
import type { AppliedFilter } from '../../types/filter';

let filterCounter = 0;

export interface FilterSlice {
  // ── State ──
  filters: AppliedFilter[];

  // ── Actions ──
  addFilter: (
    filterId: string,
    params?: Record<string, number | boolean | [number, number] | [number, number, number, number]>,
  ) => void;
  removeFilter: (id: string) => void;
  updateFilterParam: (
    id: string,
    paramName: string,
    value: number | boolean | [number, number] | [number, number, number, number],
  ) => void;
  reorderFilter: (fromIndex: number, toIndex: number) => void;
  toggleFilter: (id: string) => void;
  clearFilters: () => void;
}

export const createFilterSlice: StateCreator<FilterSlice> = (set) => ({
  filters: [],

  addFilter: (filterId, params = {}) => {
    const id = `filter-${++filterCounter}-${Date.now()}`;
    const applied: AppliedFilter = { id, filterId, params, enabled: true };
    set((s) => ({ filters: [...s.filters, applied] }));
  },

  removeFilter: (id) => set((s) => ({ filters: s.filters.filter((f) => f.id !== id) })),

  updateFilterParam: (id, paramName, value) =>
    set((s) => ({
      filters: s.filters.map((f) =>
        f.id === id ? { ...f, params: { ...f.params, [paramName]: value } } : f,
      ),
    })),

  reorderFilter: (fromIndex, toIndex) =>
    set((s) => {
      const arr = [...s.filters];
      const [moved] = arr.splice(fromIndex, 1);
      if (!moved) return s;
      arr.splice(toIndex, 0, moved);
      return { filters: arr };
    }),

  toggleFilter: (id) =>
    set((s) => ({
      filters: s.filters.map((f) => (f.id === id ? { ...f, enabled: !f.enabled } : f)),
    })),

  clearFilters: () => set({ filters: [] }),
});
