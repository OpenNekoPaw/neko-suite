/**
 * Artifact module — post-write validator + file watcher for the IDC three
 * artifact families (Draft / Plan / Task).
 *
 * Replaces the dedicated `DraftWriteTool` / `PlanWriteTool` / `TaskWriteTool`
 * boundary (Phase B, 2026-04-22). AI uses the generic `Write` tool; the
 * watcher validates on-disk state and emits `artifact.written` /
 * `artifact.invalid` events.
 */

export {
  validateArtifact,
  type ArtifactValidationResult,
  type ArtifactIssue,
  type ArtifactIssueCode,
} from './artifact-validator';

export {
  createArtifactWatcher,
  type IArtifactWatcher,
  type ArtifactWatcherConfig,
  type ArtifactWatcherFsOps,
  type ArtifactWatcherHandle,
} from './artifact-watcher';

export {
  ArtifactObservationHooks,
  createArtifactObservationHooks,
  type ArtifactObservationHooksConfig,
} from './artifact-observation-hooks';

export {
  buildEntityMemoryContribution,
  buildEntityMemoryContributionReviewArtifact,
  buildCharacterMemoryReviewArtifact,
  buildCharacterObservationTable,
  buildMediaTextSegmentTable,
  type CharacterMemoryArtifactInput,
  type EntityMemoryContributionBuildInput,
  type EntityMemoryContributionArtifactInput,
} from './character-memory-artifact';

export {
  findProjectedEntityMemoryContribution,
  inferEntityMemoryContributionFromCharacterAnalysis,
  maybeAttachInferredEntityMemoryContribution,
} from './entity-memory-contribution-inference';

export {
  buildShotImagePrepReviewArtifact,
  buildStoryboardShotImagePrepReviewArtifact,
  type ShotImagePrepArtifactInput,
  type StoryboardShotImagePrepArtifactInput,
  type StoryboardShotImagePrepArtifactResult,
} from './shot-image-prep-artifact';
