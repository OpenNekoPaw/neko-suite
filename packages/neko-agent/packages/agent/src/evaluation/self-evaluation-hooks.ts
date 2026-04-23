/**
 * SelfEvaluationHooks — runtime operationalisation of ADR §11.6.9
 * "AI self-evaluation three-piece kit", specifically piece ② (guidance).
 *
 * The kit is:
 *   ① Visibility    — AI can Read / .neko/drafts / inspect observations
 *   ② Guidance      — something nudges the AI at the right moment
 *   ③ Accumulation  — conclusions feed back into memory
 *
 * Pieces ① and ③ already exist (Read tool / ArtifactObservationHooks /
 * CreativeMemoryHooks.onExecuteEnd). Piece ② was a gap: persona prompts
 * mentioned "optional self-eval" as text but nothing fired at the right
 * moment. This hook closes that gap.
 *
 * Mechanism (mirrors ArtifactObservationHooks' proven pattern):
 *   1. Subscribe to StageTracker.onExited
 *   2. When the exiting stage is `apply`, flip an internal flag
 *   3. On the NEXT beforeThink, if flagged, append a single system
 *      message with invitation-style self-eval guidance and clear flag
 *
 * Deliberate non-goals (keep §11.6.9 boundary clean):
 *   - No LLM-as-judge — we never evaluate the output ourselves
 *   - No forced verdict — guidance is "consider reviewing", not "verify"
 *   - No EventBus channel — StageTracker callback is the only consumer
 *   - No PromptModule projection — message is per-turn ephemeral, matches
 *     the one-shot timing better than a layer section
 */
import type { AgentContext, ChatMessage, ExecutorHooks } from '@neko/shared';
import type { StageTracker } from '../skill/stage-tracker';

/**
 * Guidance text appended as a system message on the turn following an
 * Apply-stage exit. Exported for test assertions — the text itself is
 * an implementation detail callers shouldn't depend on.
 */
export const SELF_EVAL_GUIDANCE = `## Self-evaluation (optional)

You just completed an Apply stage. Before moving on, consider briefly
reviewing what you did against the approved Draft:

- Read the Draft (if needed) to recall the intent.
- List the artifacts you produced or modified during this Apply.
- If you notice drift from the Draft's stated goals, flag it explicitly
  in your next response and suggest whether to proceed, adjust, or seek
  user confirmation.

This is an invitation, not a required step — skip it when the Apply was
a single straightforward operation, or when the user is clearly waiting
on the next concrete action.`;

export interface SelfEvaluationHooksDeps {
  /**
   * Optional StageTracker. When absent the hook is an inert no-op — all
   * lifecycle methods passthrough without flipping any flags. Permits
   * sessions without IDC stage tracking (CLI smoke tests, simple
   * integrations) to wire the hook uniformly without special-casing.
   */
  readonly stageTracker?: StageTracker | null;
}

export class SelfEvaluationHooks implements ExecutorHooks {
  readonly name = 'self-evaluation';

  private _pending = false;
  private _unsubscribe: (() => void) | undefined;

  constructor(deps: SelfEvaluationHooksDeps) {
    const { stageTracker } = deps;
    if (!stageTracker) return;
    this._unsubscribe = stageTracker.onExited((event) => {
      if (event.stage === 'apply') {
        this._pending = true;
      }
    });
  }

  /**
   * Called by the executor before each think step. When an Apply-stage
   * exit has been buffered, append a single invitation-style system
   * message and clear the flag. Returns the modified context; when no
   * guidance is due returns undefined (matching ArtifactObservationHooks'
   * pattern — the executor treats undefined as "no changes").
   */
  async beforeThink(context: AgentContext): Promise<AgentContext | void> {
    if (!this._pending) return;
    this._pending = false;
    const guidance: ChatMessage = {
      role: 'system',
      content: SELF_EVAL_GUIDANCE,
    };
    return {
      ...context,
      messages: [...context.messages, guidance],
    };
  }

  /**
   * Test-only / introspection: true when an Apply-exit signal is
   * buffered and the next beforeThink will inject a guidance message.
   */
  isPending(): boolean {
    return this._pending;
  }

  /**
   * Release the StageTracker subscription. Safe to call multiple times
   * (idempotent — second call is a no-op).
   */
  dispose(): void {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = undefined;
    }
  }
}
