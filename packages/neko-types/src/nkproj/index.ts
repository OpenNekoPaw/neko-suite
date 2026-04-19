// =============================================================================
// NKPROJ Format SDK — Public API
// =============================================================================

export { loadNkproj, saveNkproj, isValidNkproj } from './codec';
export {
  validateNkproj,
  validateNkprojStruct,
  detectVersion as detectNkprojVersion,
} from './validator';
export { migrateNkproj } from './migrator';

export type {
  NkprojVersion,
  NkprojArtifactKind,
  NkprojRouteLevel,
  NkprojArtifactRef,
  NkprojUpgradeEvent,
  NkprojWorkflowPrefs,
  NkProj,
  NkprojLoadResult,
  NkprojSaveOptions,
  NkprojValidateOptions,
  NkprojMigrationResult,
  ValidationResult,
  ValidationError,
} from './types';

export { CURRENT_NKPROJ_VERSION } from './types';

// Phase 6.2 — Lossless Upgrade authoring helpers
export {
  addArtifacts,
  appendUpgradeEvent,
  artifactsByKind,
  recordLosslessUpgrade,
  removeArtifacts,
} from './operations';
export type { AppendUpgradeInput, RecordUpgradeInput } from './operations';
