/**
 * PlanBuilder — turns a Route (+ optional Shot list) into a LitePlan.
 *
 * Phase 1 MVP scope:
 *   - Translate Route.flowId + skipStages into a stage preview
 *   - Optionally run MatchingEngine on provided shots to populate bindings
 *   - Return an in-memory LitePlan with status='pending'
 *
 * Phase 2 will add .nkplan persistence and state-machine transitions.
 *
 * See docs/architecture/plan-mode.md §9.
 */

import type { AssetLibrary } from '../asset-library/types';
import type { MatchingEngine, Shot, ShotBindings } from '../matching/types';
import type { Route } from '../types';

import type {
  LitePlan,
  LitePlanStatus,
  PlanBuildInput,
  PlannedStage,
  ShotBindingSummary,
} from './types';

// =============================================================================
// Stage catalogue (label + default cost hints)
// =============================================================================

interface StageMeta {
  label: string;
  estimate?: PlannedStage['estimate'];
}

const STAGE_META: Record<string, StageMeta> = {
  readDocument: { label: 'Read document', estimate: { durationSec: 5 } },
  parseStoryboard: { label: 'Parse storyboard', estimate: { tokens: 2000, durationSec: 15 } },
  importStoryboardToCanvas: { label: 'Import to canvas', estimate: { durationSec: 3 } },
  generatePrompts: { label: 'Generate prompts', estimate: { tokens: 4000, durationSec: 20 } },
  generatePilot: { label: 'Generate pilot', estimate: { credits: 5, durationSec: 45 } },
  batchGenerate: { label: 'Batch generate', estimate: { credits: 40, durationSec: 240 } },
  qualityGate: { label: 'Quality gate', estimate: { durationSec: 15 } },
  arrangeOnTimeline: { label: 'Arrange timeline', estimate: { durationSec: 5 } },
};

/**
 * Returns the canonical stage order for each flow.
 * Mirrors FLOW_DEFINITIONS in @neko/agent/pipeline/pipeline-registry.ts — kept
 * in sync manually because pipeline-registry doesn't export the mapping.
 */
function stagesForFlow(flowId: Route['flowId']): string[] {
  switch (flowId) {
    case 'flowA':
      return [
        'readDocument',
        'parseStoryboard',
        'importStoryboardToCanvas',
        'generatePrompts',
        'generatePilot',
        'batchGenerate',
        'qualityGate',
        'arrangeOnTimeline',
      ];
    case 'flowB':
      return [
        'generatePrompts',
        'generatePilot',
        'batchGenerate',
        'qualityGate',
        'arrangeOnTimeline',
      ];
    case 'flowC':
      return [
        'readDocument',
        'generatePrompts',
        'generatePilot',
        'batchGenerate',
        'qualityGate',
        'arrangeOnTimeline',
      ];
    case 'flowD':
      return ['parseStoryboard', 'arrangeOnTimeline'];
    case 'flowE':
    case 'flowF':
      return [
        'parseStoryboard',
        'importStoryboardToCanvas',
        'generatePrompts',
        'generatePilot',
        'batchGenerate',
        'qualityGate',
        'arrangeOnTimeline',
      ];
  }
}

// =============================================================================
// PlanBuilder
// =============================================================================

export interface PlanBuilderOptions {
  /** MatchingEngine used when the input includes shots. Omit to skip binding resolution. */
  matchingEngine?: MatchingEngine;
  /** AssetLibrary needed alongside matchingEngine. */
  assetLibrary?: AssetLibrary;
  /** Override id generator for deterministic tests */
  generateId?: () => string;
  /** Override clock for deterministic tests */
  now?: () => number;
}

export class PlanBuilder {
  private readonly generateId: () => string;
  private readonly now: () => number;

  constructor(private readonly options: PlanBuilderOptions = {}) {
    this.generateId = options.generateId ?? defaultIdGen;
    this.now = options.now ?? (() => Date.now());
  }

  async build(input: PlanBuildInput): Promise<LitePlan> {
    const stages = this.buildStages(input.route);
    const shots = await this.buildShots(input);

    return {
      id: this.generateId(),
      createdAt: this.now(),
      status: 'pending' satisfies LitePlanStatus,
      route: input.route,
      stages,
      ...(shots !== undefined && { shots }),
      ...(input.notes !== undefined && input.notes.length > 0 && { notes: input.notes }),
    };
  }

  // -------------------------------------------------------------------------

  private buildStages(route: Route): PlannedStage[] {
    const order = stagesForFlow(route.flowId);
    const skip = new Set(route.skipStages);
    return order.map((id) => {
      const meta = STAGE_META[id];
      const stage: PlannedStage = {
        id,
        label: meta?.label ?? id,
        skipped: skip.has(id),
        ...(meta?.estimate !== undefined && { estimate: meta.estimate }),
      };
      return stage;
    });
  }

  private async buildShots(
    input: PlanBuildInput,
  ): Promise<ReadonlyArray<ShotBindingSummary> | undefined> {
    if (!input.shots || input.shots.length === 0) return undefined;

    const { matchingEngine, assetLibrary } = this.options;
    if (!matchingEngine || !assetLibrary) {
      // No matching configured — surface the raw shots without bindings
      return input.shots.map((s) => ({
        shotId: s.id,
        primary: {},
        alternatives: {},
        unmatched: [],
      }));
    }

    const results = await matchingEngine.matchShots(input.shots, assetLibrary);
    return results.map((r) => toSummary(r));
  }
}

export function createPlanBuilder(options: PlanBuilderOptions = {}): PlanBuilder {
  return new PlanBuilder(options);
}

// =============================================================================
// Helpers
// =============================================================================

function toSummary(r: ShotBindings): ShotBindingSummary {
  return {
    shotId: r.shotId,
    primary: r.primary,
    alternatives: r.alternatives,
    unmatched: r.unmatched,
  };
}

function defaultIdGen(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `plan_${t}${r}`;
}

// =============================================================================
// Re-exports
// =============================================================================

export type {
  LitePlan,
  LitePlanStatus,
  PlanBuildInput,
  PlannedStage,
  ShotBindingSummary,
} from './types';
