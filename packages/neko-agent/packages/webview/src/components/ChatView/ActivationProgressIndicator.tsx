import { useState } from 'react';
import { PackageIcon, ChevronDownIcon, ChevronRightIcon } from '@neko/shared/icons';
import type { ActivationProgressTimeline } from '@/presenters/activation-progress-presenter';
import { useTranslation } from '@/i18n/I18nContext';

export interface ActivationProgressIndicatorProps {
  readonly timelines: readonly ActivationProgressTimeline[];
}

export function ActivationProgressIndicator({ timelines }: ActivationProgressIndicatorProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const latest = timelines[0];
  if (!latest) return null;

  return (
    <div className="agent-activation-progress" role="status">
      <button
        type="button"
        className="agent-activation-progress-summary"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="agent-activation-progress-icon" aria-hidden="true">
          {expanded ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
        </span>
        <PackageIcon size={14} aria-hidden="true" />
        <span className="agent-activation-progress-title">
          {formatActivationToken(t, 'target', latest.target)}{' '}
          {formatActivationToken(t, 'status', latest.status)}: <code>{latest.name}</code>
        </span>
        <span className="agent-activation-progress-meta">
          {formatActivationSource(t, latest.source, latest.requestedBy)}
        </span>
      </button>
      {expanded ? (
        <ol className="agent-activation-progress-timeline">
          {latest.events.map((event) => (
            <li key={event.id} className="agent-activation-progress-event">
              <span className="agent-activation-progress-step">
                {formatActivationToken(t, 'step', event.step)}
              </span>
              <span className="agent-activation-progress-event-status">
                {formatActivationToken(t, 'status', event.status)}
              </span>
              {event.diagnostics?.length ? (
                <span className="agent-activation-progress-diagnostic">
                  {event.diagnostics.map((diagnostic) => diagnostic.message).join('; ')}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function formatSource(
  source: ActivationProgressTimeline['source'],
  requestedBy: ActivationProgressTimeline['requestedBy'],
): string {
  if (source === 'agent-tool') return `Agent: ${requestedBy}`;
  return `User: ${requestedBy}`;
}

function formatActivationSource(
  t: (key: string, params?: Record<string, string | number>) => string,
  source: ActivationProgressTimeline['source'],
  requestedBy: ActivationProgressTimeline['requestedBy'],
): string {
  const key = `chat.activation.source.${source}.${requestedBy}`;
  const label = t(key);
  return label === key ? formatSource(source, requestedBy) : label;
}

function formatActivationToken(
  t: (key: string, params?: Record<string, string | number>) => string,
  kind: 'target' | 'status' | 'step',
  token: string,
): string {
  const key = `chat.activation.${kind}.${token}`;
  const label = t(key);
  return label === key ? token : label;
}
