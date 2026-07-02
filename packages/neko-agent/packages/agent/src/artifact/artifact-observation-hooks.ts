/**
 * ArtifactObservationHooks — ExecutorHooks that surface ArtifactWatcher
 * validation failures back into the AI conversation on the next think.
 *
 * See: docs/architecture/agent-unified-workflow.md §4 (built-in creation stages), §6.2
 *      (EventBus), §6.5 (non-blocking guardians)
 *
 * Why this exists:
 *   When a host opts into creation-document watching, validation can fail after
 *   the user-visible document is saved. Without a bridge, the structured
 *   issues just pile up in events.jsonl where the AI can't see them.
 *
 *   This hook closes that loop: it subscribes to
 *   `execution.artifact.invalid` on the EventBus, buffers issues, and on
 *   the next `beforeThink` drains the buffer into a system message appended
 *   to the context. The AI explains the issue and proposes corrected creation
 *   content; the host remains responsible for persistence.
 *
 * Non-goals:
 *   - No automatic file repair. Issues are surfaced as prose; the AI
 *     decides how to fix them.
 *   - No event emission. This hook is a *consumer*, not a producer — it
 *     only reads from the bus.
 *   - No deduplication across rounds: if the same file stays invalid
 *     across multiple writes, the AI sees each failure once per round.
 *     (Issues are buffered until drained, not persisted across runs.)
 */

import type { ArtifactKind, ExecutionArtifactInvalidEvent } from '@neko-agent/types';
import { EXECUTION_CHANNELS } from '@neko-agent/types';
import type { AgentContext, ExecutorHooks, ChatMessage } from '@neko/shared';
import type { IEventBus } from '../events/event-bus';

// =============================================================================
// Types
// =============================================================================

/** A buffered issue carried from the bus to the next think. */
interface BufferedInvalidation {
  kind: ArtifactKind;
  path: string;
  issues: ExecutionArtifactInvalidEvent['issues'];
  at: number;
}

export interface ArtifactObservationHooksConfig {
  /** Bus to subscribe to. Hooks become a no-op if null (offline tests). */
  eventBus: IEventBus | null;
  /**
   * Max issues to buffer. If the AI writes many invalid files in a row
   * we still want to bound memory; surplus events are dropped (with a
   * warning kept in the last drained batch).
   */
  maxBuffered?: number;
}

// =============================================================================
// Implementation
// =============================================================================

const DEFAULT_MAX_BUFFERED = 32;

export class ArtifactObservationHooks implements ExecutorHooks {
  readonly name = 'artifact-observation';

  private readonly _buffer: BufferedInvalidation[] = [];
  private readonly _maxBuffered: number;
  private _droppedOverflow = 0;
  private _unsubscribe: (() => void) | null = null;

  constructor(config: ArtifactObservationHooksConfig) {
    this._maxBuffered = config.maxBuffered ?? DEFAULT_MAX_BUFFERED;
    const bus = config.eventBus;
    if (!bus) return;
    this._unsubscribe = bus.on(EXECUTION_CHANNELS.ARTIFACT_INVALID, (event) => {
      this._ingest(event);
    });
  }

  async beforeThink(context: AgentContext): Promise<AgentContext | void> {
    if (this._buffer.length === 0 && this._droppedOverflow === 0) return;
    const drained = this._drain();
    const message: ChatMessage = {
      role: 'system',
      content: renderObservation(drained, this._droppedOverflow),
    };
    this._droppedOverflow = 0;
    return {
      ...context,
      messages: [...context.messages, message],
    };
  }

  /** Idempotent — safe to call twice. */
  dispose(): void {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    this._buffer.length = 0;
    this._droppedOverflow = 0;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _ingest(event: ExecutionArtifactInvalidEvent): void {
    if (this._buffer.length >= this._maxBuffered) {
      this._droppedOverflow += 1;
      return;
    }
    this._buffer.push({
      kind: event.kind,
      path: event.path,
      issues: event.issues,
      at: event.at,
    });
  }

  private _drain(): readonly BufferedInvalidation[] {
    const snapshot = this._buffer.slice();
    this._buffer.length = 0;
    return snapshot;
  }
}

// =============================================================================
// Factory + rendering
// =============================================================================

export function createArtifactObservationHooks(
  config: ArtifactObservationHooksConfig,
): ArtifactObservationHooks {
  return new ArtifactObservationHooks(config);
}

function renderObservation(entries: readonly BufferedInvalidation[], dropped: number): string {
  if (entries.length === 0 && dropped > 0) {
    return `⚠️ ArtifactWatcher dropped ${dropped} invalid-artifact events (buffer overflow). Re-check recently persisted creation documents.`;
  }

  const lines: string[] = [
    '⚠️ ArtifactWatcher reported validation issues on recently persisted creation document(s). Explain the listed frontmatter issue(s) and provide corrected creation content.',
    '',
  ];
  for (const entry of entries) {
    const filename = entry.path.split('/').pop() ?? entry.path;
    lines.push(`- \`${filename}\` (${entry.kind})`);
    for (const issue of entry.issues) {
      const fieldTag = issue.field ? ` [\`${issue.field}\`]` : '';
      lines.push(`    - ${issue.code}${fieldTag}: ${issue.message}`);
    }
  }
  if (dropped > 0) {
    lines.push('', `…and ${dropped} more issues dropped (buffer overflow).`);
  }
  return lines.join('\n');
}
