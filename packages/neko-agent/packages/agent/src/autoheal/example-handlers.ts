/**
 * Autoheal example handlers — drop-in factories for the common L2/L3/L4
 * strategies described in ADR §6.4.
 *
 * The core autoheal-chain.ts keeps its default handlers conservative
 * (pass-through) so callers can compose incrementally. This file is
 * the library of "known-good" recovery moves callers can lift into
 * their AutohealHandlers config without re-deriving the pattern.
 *
 * These handlers never re-execute the tool themselves. They **describe**
 * the retry plan via the outcome's `note` field; the ReAct loop runner
 * reads that note to adjust the next tool call.
 *
 * Contract for outcome.note when resolution === 'healed':
 *   - L2 degrade:    `"degrade:<knob>=<newValue>"` — runner tweaks the
 *                    named arg before retrying the same tool.
 *   - L3 substitute: `"substitute:<fallbackToolName>"` — runner swaps
 *                    the tool name, keeping args compatible.
 *   - L4 subagent:   `"subagent:<actions>"` — runner deserialises a
 *                    structured action list from context (handler sets
 *                    it) and dispatches in order.
 *
 * Sites that want richer signalling than a string note should define
 * their own AutohealHandler; this module is about low-friction defaults.
 */

import type { AutohealHandler } from './autoheal-chain';
import type { AutohealFailure } from './autoheal-types';

// =============================================================================
// L2 — Degrade on cost / OOM / quality-fail
// =============================================================================

/**
 * Config for the "resolution knob" degrade strategy. The handler only
 * engages when the failure's `errorCode` matches one of the trigger
 * codes (defaults to OOM / cost_limit / quality_fail). Otherwise it
 * passes — L3 or L5 takes the recovery.
 */
export interface ResolutionDegradeConfig {
  /** Error codes that trigger the degrade. */
  triggers?: readonly string[];
  /**
   * Resolution ladder — each entry is a value the handler suggests as
   * the next `resolution` argument, walked in order. Defaults to a
   * typical video-gen ladder (`1080p → 720p → 480p`). Exhausting the
   * ladder passes to the next level.
   */
  ladder?: readonly string[];
  /** Argument key the runner reads. Defaults to 'resolution'. */
  argKey?: string;
}

const DEFAULT_DEGRADE_TRIGGERS = ['OOM', 'cost_limit', 'quality_fail'] as const;
const DEFAULT_RESOLUTION_LADDER = ['1080p', '720p', '480p'] as const;

/**
 * L2 degrade handler that walks a fixed resolution ladder. On the N-th
 * failure it suggests `ladder[N]`; when N >= ladder.length it passes.
 *
 * Usage:
 *   const chain = createAutohealChain({
 *     handlers: {
 *       l2Degrade: createResolutionDegradeHandler({ ladder: ['4k', '1080p'] }),
 *     },
 *   });
 */
export function createResolutionDegradeHandler(
  config: ResolutionDegradeConfig = {},
): AutohealHandler {
  const triggers = new Set(config.triggers ?? DEFAULT_DEGRADE_TRIGGERS);
  const ladder = config.ladder ?? DEFAULT_RESOLUTION_LADDER;
  const key = config.argKey ?? 'resolution';

  return async (failure: AutohealFailure) => {
    if (!triggers.has(failure.errorCode)) {
      return { resolution: 'pass', level: 2, note: `not-a-degrade-trigger:${failure.errorCode}` };
    }
    // L2 fires after L1 retries; `failure.attempt` therefore already
    // includes any L1 retries. Index the ladder from attempt offset.
    const rung = failure.attempt - 1; // one attempt consumed by L1
    if (rung < 0 || rung >= ladder.length) {
      return { resolution: 'pass', level: 2, note: 'degrade-ladder-exhausted' };
    }
    return {
      resolution: 'healed',
      level: 2,
      note: `degrade:${key}=${ladder[rung]}`,
    };
  };
}

// =============================================================================
// L3 — Substitute with a fallback tool
// =============================================================================

export interface SubstituteConfig {
  /**
   * Map from failed tool name → fallback tool name. The handler checks
   * `failure.subject` (a `tool:<name>` kind or bare tool name) against
   * the map and, on hit, emits a `substitute:<fallback>` note.
   */
  map: ReadonlyMap<string, string> | Readonly<Record<string, string>>;
  /**
   * Error codes that justify substitution. Defaults to capability
   * issues — permanent problems with the current tool rather than
   * transient ones.
   */
  triggers?: readonly string[];
}

const DEFAULT_SUBSTITUTE_TRIGGERS = ['tool_unavailable', 'deprecated', 'unsupported'] as const;

/**
 * L3 substitute handler. Matches the failing tool name against a
 * user-supplied fallback map; on a hit it emits `substitute:<fallback>`
 * so the runner can swap endpoints without re-planning.
 *
 * Usage:
 *   createSubstituteHandler({
 *     map: { 'image.dalle': 'image.sdxl', 'video.sora': 'video.kling' },
 *   });
 */
export function createSubstituteHandler(config: SubstituteConfig): AutohealHandler {
  const triggers = new Set(config.triggers ?? DEFAULT_SUBSTITUTE_TRIGGERS);
  const mapGet: (key: string) => string | undefined =
    config.map instanceof Map
      ? (k) => (config.map as ReadonlyMap<string, string>).get(k)
      : (k) => (config.map as Readonly<Record<string, string>>)[k];

  return async (failure: AutohealFailure) => {
    if (!triggers.has(failure.errorCode)) {
      return {
        resolution: 'pass',
        level: 3,
        note: `not-a-substitute-trigger:${failure.errorCode}`,
      };
    }
    const bareName = _bareToolName(failure.subject);
    const fallback = mapGet(bareName);
    if (!fallback) {
      return { resolution: 'aborted', level: 3, reason: 'unsubstitutable' };
    }
    return {
      resolution: 'healed',
      level: 3,
      note: `substitute:${fallback}`,
    };
  };
}

function _bareToolName(subject: string): string {
  // Strategy packs emit 'tool:<name>'; runners sometimes pass the
  // bare name. Accept both.
  return subject.startsWith('tool:') ? subject.slice('tool:'.length) : subject;
}

// =============================================================================
// L5 — User-decline composition helper
// =============================================================================

/**
 * L5 handler that asks the caller-supplied prompt for a decision.
 * Returns `aborted:user-decline` on false/null and falls back to
 * `retry-exhausted` when the prompt is absent — matches the ADR's
 * intent that L5 is always a terminal exit, but the caller chooses
 * the reason.
 *
 * Usage:
 *   l5Escalate: createUserEscalationHandler(async (failure) => {
 *     return window.showWarningModal('Retry failed — abort?', 'Abort', 'Keep going');
 *   });
 */
export function createUserEscalationHandler(
  prompt: (failure: AutohealFailure) => Promise<boolean>,
): AutohealHandler {
  return async (failure) => {
    const declineAbort = await prompt(failure).catch(() => false);
    return {
      resolution: 'aborted',
      level: 5,
      reason: declineAbort ? 'user-decline' : 'retry-exhausted',
    };
  };
}
