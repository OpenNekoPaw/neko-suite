import { create } from 'zustand';
import {
  validateCanvasGeneratedDraftGroupProjection,
  type CanvasGeneratedDraftGroupProjection,
} from '@neko/shared';

export interface GeneratedDraftStore {
  readonly projections: Readonly<Record<string, CanvasGeneratedDraftGroupProjection>>;
  readonly layouts: Readonly<Record<string, GeneratedDraftRuntimeLayout>>;
  readonly promotionDiagnostics: Readonly<Record<string, string>>;
  readonly upsert: (projection: CanvasGeneratedDraftGroupProjection) => void;
  readonly remove: (projectionId: string) => void;
  readonly moveGroup: (
    projectionId: string,
    position: { readonly x: number; readonly y: number },
  ) => void;
  readonly moveCandidate: (
    projectionId: string,
    candidateId: string,
    position: { readonly x: number; readonly y: number },
  ) => void;
  readonly setCollapsed: (projectionId: string, collapsed: boolean) => void;
  readonly setPromotionDiagnostic: (projectionId: string, diagnostic: string | undefined) => void;
  readonly clear: () => void;
}

export interface GeneratedDraftRuntimeLayout {
  readonly groupPosition?: { readonly x: number; readonly y: number };
  readonly candidatePositions: Readonly<Record<string, { readonly x: number; readonly y: number }>>;
  readonly collapsed?: boolean;
}

export const useGeneratedDraftStore = create<GeneratedDraftStore>((set) => ({
  projections: {},
  layouts: {},
  promotionDiagnostics: {},
  upsert: (projection) => {
    const diagnostics = validateCanvasGeneratedDraftGroupProjection(projection);
    if (diagnostics.length > 0) {
      throw new Error(
        `Invalid generated draft Group projection: ${diagnostics.map((diagnostic) => diagnostic.code).join(', ')}`,
      );
    }
    set((state) => {
      const promotionDiagnostics = { ...state.promotionDiagnostics };
      delete promotionDiagnostics[projection.projectionId];
      return {
        projections: { ...state.projections, [projection.projectionId]: projection },
        promotionDiagnostics,
      };
    });
  },
  remove: (projectionId) =>
    set((state) => {
      if (!state.projections[projectionId]) return state;
      const projections = { ...state.projections };
      const layouts = { ...state.layouts };
      const promotionDiagnostics = { ...state.promotionDiagnostics };
      delete projections[projectionId];
      delete layouts[projectionId];
      delete promotionDiagnostics[projectionId];
      return { projections, layouts, promotionDiagnostics };
    }),
  moveGroup: (projectionId, position) =>
    set((state) => {
      const projection = state.projections[projectionId];
      if (!projection) throw new Error(`Generated draft projection not found: ${projectionId}`);
      const layout = state.layouts[projectionId] ?? { candidatePositions: {} };
      const previous = layout.groupPosition ?? projection.position;
      const delta = { x: position.x - previous.x, y: position.y - previous.y };
      const candidatePositions = Object.fromEntries(
        projection.candidates.map((candidate) => {
          const current = layout.candidatePositions[candidate.candidateId] ?? candidate.position;
          return [candidate.candidateId, { x: current.x + delta.x, y: current.y + delta.y }];
        }),
      );
      return {
        layouts: {
          ...state.layouts,
          [projectionId]: { ...layout, groupPosition: position, candidatePositions },
        },
      };
    }),
  moveCandidate: (projectionId, candidateId, position) =>
    set((state) => {
      const projection = state.projections[projectionId];
      if (!projection?.candidates.some((candidate) => candidate.candidateId === candidateId)) {
        throw new Error(`Generated draft candidate not found: ${candidateId}`);
      }
      const layout = state.layouts[projectionId] ?? { candidatePositions: {} };
      return {
        layouts: {
          ...state.layouts,
          [projectionId]: {
            ...layout,
            candidatePositions: { ...layout.candidatePositions, [candidateId]: position },
          },
        },
      };
    }),
  setCollapsed: (projectionId, collapsed) =>
    set((state) => {
      if (!state.projections[projectionId]) {
        throw new Error(`Generated draft projection not found: ${projectionId}`);
      }
      const layout = state.layouts[projectionId] ?? { candidatePositions: {} };
      return {
        layouts: { ...state.layouts, [projectionId]: { ...layout, collapsed } },
      };
    }),
  setPromotionDiagnostic: (projectionId, diagnostic) =>
    set((state) => {
      if (!state.projections[projectionId]) {
        throw new Error(`Generated draft projection not found: ${projectionId}`);
      }
      const promotionDiagnostics = { ...state.promotionDiagnostics };
      if (diagnostic) promotionDiagnostics[projectionId] = diagnostic;
      else delete promotionDiagnostics[projectionId];
      return { promotionDiagnostics };
    }),
  clear: () => set({ projections: {}, layouts: {}, promotionDiagnostics: {} }),
}));
