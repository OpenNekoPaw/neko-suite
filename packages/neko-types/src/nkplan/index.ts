// =============================================================================
// NKPLAN Format SDK — Public API
// =============================================================================

export { loadNkplan, saveNkplan, isValidNkplan } from './codec';
export {
  validateNkplan,
  validateNkplanStruct,
  detectVersion as detectNkplanVersion,
} from './validator';
export { migrateNkplan } from './migrator';

export type {
  // Version
  NkplanVersion,
  // Enums
  NkplanRouteLevel,
  NkplanExtensionId,
  NkplanBindingSlot,
  NkplanBindingProvenance,
  NkplanRouteProvenance,
  NkplanStatus,
  NkplanConstraintKind,
  // Primitive shapes
  NkplanRoute,
  NkplanStage,
  NkplanBindingCandidate,
  NkplanShotBindings,
  NkplanConstraint,
  NkplanStatusEvent,
  NkplanProjectRef,
  NkPlan,
  // SDK shapes
  NkplanLoadResult,
  NkplanSaveOptions,
  NkplanValidateOptions,
  NkplanMigrationResult,
  // Re-export
  ValidationResult,
  ValidationError,
} from './types';

export { CURRENT_NKPLAN_VERSION } from './types';
