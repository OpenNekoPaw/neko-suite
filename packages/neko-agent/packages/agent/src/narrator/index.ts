/**
 * Narrator module — MilestoneTracker + ProgressNarrator.
 *
 * See: docs/architecture/dual-flow-architecture.md §3.2 + §9.2
 *      plan v2 P5
 */

export {
  createMilestoneTracker,
  defaultClassify,
  type IMilestoneTracker,
  type Milestone,
  type MilestoneKind,
  type MilestoneTrackerConfig,
} from './milestone-tracker';

export {
  narrate,
  narrateOne,
  narrateHeadline,
  DEFAULT_NARRATION_ICONS,
  type NarrationFormat,
} from './progress-narrator';
