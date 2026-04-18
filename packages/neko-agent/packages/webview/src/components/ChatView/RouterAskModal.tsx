/**
 * RouterAskModal — renders the LLM router's `ask_user` clarifying question.
 *
 * Appears inline under the plan card (or on its own when the plan isn't yet
 * decided).  Supports either multiple-choice or freeform answers.  Closing
 * without answering sends a `dismissed` status so the router can fall back
 * to FastProbe.
 *
 * See docs/architecture/workflow-routing.md §6.
 */

import { memo, useCallback, useEffect, useState } from 'react';
import { vscode } from '@/messages';

interface RouterAskModalProps {
  askId: string;
  question: string;
  options?: readonly string[];
  timeoutMs?: number;
  onResolved: () => void;
}

export const RouterAskModal = memo(function RouterAskModal({
  askId,
  question,
  options,
  timeoutMs,
  onResolved,
}: RouterAskModalProps) {
  const [freeform, setFreeform] = useState('');
  const [remainingMs, setRemainingMs] = useState<number | undefined>(timeoutMs);

  useEffect(() => {
    if (!timeoutMs) return undefined;
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, timeoutMs - elapsed);
      setRemainingMs(remaining);
      if (remaining === 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [timeoutMs]);

  const respond = useCallback(
    (payload: { status: 'answered' | 'dismissed'; choice?: string; freeformAnswer?: string }) => {
      vscode?.postMessage({ type: 'workflow/routerAskResponse', askId, ...payload });
      onResolved();
    },
    [askId, onResolved],
  );

  const handlePickOption = (choice: string): void => respond({ status: 'answered', choice });
  const handleSubmitFreeform = (): void => {
    const trimmed = freeform.trim();
    if (trimmed.length === 0) {
      respond({ status: 'dismissed' });
    } else {
      respond({ status: 'answered', freeformAnswer: trimmed });
    }
  };
  const handleDismiss = (): void => respond({ status: 'dismissed' });

  const remainingSeconds = remainingMs !== undefined ? Math.ceil(remainingMs / 1000) : undefined;

  return (
    <div
      className="my-2 rounded-md border border-[var(--vscode-charts-blue)] bg-[var(--agent-bg-secondary)] p-3"
      role="dialog"
      aria-label="Router question"
      data-testid="router-ask-modal"
      data-ask-id={askId}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <span>❓</span>
          <span>Router needs a hint</span>
        </div>
        {remainingSeconds !== undefined && (
          <span className="text-[10px] text-[var(--agent-fg-secondary)]" aria-live="polite">
            {remainingSeconds}s
          </span>
        )}
      </div>

      <div className="mb-2 text-[12px]">{question}</div>

      {options && options.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              className="vscode-button-secondary px-2 py-0.5 text-[11px]"
              onClick={() => handlePickOption(opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      <div className="mb-2 flex items-center gap-1.5">
        <input
          type="text"
          className="flex-1 rounded border border-[var(--agent-divider)] bg-[var(--vscode-input-background)] px-2 py-1 text-[11px] text-[var(--vscode-input-foreground)]"
          placeholder="Or type an answer…"
          value={freeform}
          onChange={(e) => setFreeform(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmitFreeform();
          }}
        />
        <button
          type="button"
          className="vscode-button-primary px-2 py-1 text-[11px]"
          onClick={handleSubmitFreeform}
        >
          Send
        </button>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          className="text-[10px] text-[var(--agent-fg-secondary)] underline hover:opacity-80"
          onClick={handleDismiss}
        >
          Skip — let the router decide
        </button>
      </div>
    </div>
  );
});
