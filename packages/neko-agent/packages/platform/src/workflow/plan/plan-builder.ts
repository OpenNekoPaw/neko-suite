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

import type { AssetLibrary, BindingSlot } from '../asset-library/types';
import type { ConsistencyChecker, Constraint, Violation } from '../consistency/types';
import type { MatchingEngine, Shot, ShotBindings } from '../matching/types';
import { buildReferenceChain } from '../reference-chain/reference-chain-builder';
import type {
  BuildReferenceChainOptions,
  ReferenceChainEntry,
  ReferenceChainShot,
} from '../reference-chain/types';
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
  /** Optional ConsistencyChecker — runs after matching to populate constraints/violations. */
  consistencyChecker?: ConsistencyChecker;
  /**
   * Reference-chain options forwarded to `buildReferenceChain`.  When omitted,
   * the hybrid strategy is used on the 'character' slot.  Pass `{ disabled:
   * true }` to suppress chain computation entirely (useful for tests).
   */
  referenceChain?: BuildReferenceChainOptions & { disabled?: boolean };
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
    const shotResult = await this.buildShots(input);
    const referenceChain =
      shotResult && input.shots ? this.computeReferenceChain(input.shots, shotResult.bindings) : [];

    return {
      id: this.generateId(),
      createdAt: this.now(),
      status: 'pending' satisfies LitePlanStatus,
      route: input.route,
      stages,
      ...(shotResult !== undefined && { shots: shotResult.shots }),
      ...(shotResult !== undefined &&
        shotResult.constraints.length > 0 && {
          constraints: shotResult.constraints,
        }),
      ...(shotResult !== undefined &&
        shotResult.violations.length > 0 && {
          violations: shotResult.violations,
        }),
      ...(referenceChain.length > 0 && { referenceChain }),
      ...(input.notes !== undefined && input.notes.length > 0 && { notes: input.notes }),
      // Phase 2.5+ — capture the originating RawInput so the plan is
      // self-sufficient for dispatch (forks / approvals don't need the
      // caller to pass input alongside).
      ...(input.input !== undefined && { input: input.input }),
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

  private async buildShots(input: PlanBuildInput): Promise<
    | {
        shots: ReadonlyArray<ShotBindingSummary>;
        bindings: ReadonlyArray<ShotBindings>;
        constraints: ReadonlyArray<Constraint>;
        violations: ReadonlyArray<Violation>;
      }
    | undefined
  > {
    if (!input.shots || input.shots.length === 0) return undefined;

    const { matchingEngine, assetLibrary, consistencyChecker } = this.options;
    let rawBindings: ShotBindings[];

    if (!matchingEngine || !assetLibrary) {
      // No matching configured — surface the raw shots without bindings
      rawBindings = input.shots.map((s) => ({
        shotId: s.id,
        primary: {},
        alternatives: {},
        unmatched: [],
      }));
    } else {
      rawBindings = [...(await matchingEngine.matchShots(input.shots, assetLibrary))];
    }

    const summaries = rawBindings.map((r) => toSummary(r));
    if (!consistencyChecker) {
      return { shots: summaries, bindings: rawBindings, constraints: [], violations: [] };
    }
    const report = consistencyChecker.check({
      shots: input.shots,
      bindings: rawBindings,
    });
    return {
      shots: summaries,
      bindings: rawBindings,
      constraints: report.constraints,
      violations: report.violations,
    };
  }

  /**
   * Build the reference chain from the matched bindings.  Pure mapping —
   * takes the shot metadata + per-shot entity ids and hands them to the
   * Phase 5 `buildReferenceChain` helper.
   *
   * Returns an empty array when the option is explicitly disabled or when
   * no shots end up with a binding.
   */
  private computeReferenceChain(
    shots: ReadonlyArray<Shot>,
    bindings: ReadonlyArray<ShotBindings>,
  ): ReadonlyArray<ReferenceChainEntry> {
    const opts = this.options.referenceChain;
    if (opts?.disabled) return [];

    const byId = new Map(bindings.map((b) => [b.shotId, b]));
    const chainShots: ReferenceChainShot[] = shots.map((shot, i) => {
      const boundEntities: Partial<Record<BindingSlot, string>> = {};
      const binding = byId.get(shot.id);
      if (binding) {
        for (const [slot, candidate] of Object.entries(binding.primary) as [
          BindingSlot,
          { entityId: string } | undefined,
        ][]) {
          if (candidate?.entityId) boundEntities[slot] = candidate.entityId;
        }
      }
      return {
        shotId: shot.id,
        index: shot.index ?? i,
        ...(shot.sceneGroupId !== undefined && { sceneGroupId: shot.sceneGroupId }),
        ...(shot.tags !== undefined && { tags: shot.tags }),
        boundEntities,
      };
    });

    const { disabled: _disabled, ...builderOpts } = opts ?? {};
    return buildReferenceChain(chainShots, builderOpts);
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
