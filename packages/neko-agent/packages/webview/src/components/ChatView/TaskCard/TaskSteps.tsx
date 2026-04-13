/**
 * TaskSteps - Expandable step list for task progress tracking
 */

import { useState, useCallback } from 'react';
import type { TaskStep } from '@/components/TaskListView';
import { formatDuration, getStepStatusIcon, getStepStatusColor } from './task-utils';
import { ChevronRightIcon as ChevronIcon } from '@neko/shared/icons';

interface TaskStepsProps {
  steps: TaskStep[];
  currentStepId?: string;
}

export function TaskSteps({ steps, currentStepId }: TaskStepsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  if (!steps || steps.length === 0) return null;

  const currentStepIndex = steps.findIndex((s) => s.id === currentStepId);
  const completedSteps = steps.filter((s) => s.status === 'completed').length;

  return (
    <div className="mb-2">
      {/* Steps header */}
      <button
        onClick={toggleExpand}
        className="flex w-full items-center gap-2 text-[10px] text-[var(--agent-fg-secondary)] transition-colors hover:text-[var(--agent-fg)]"
      >
        <ChevronIcon className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        <span>
          Steps: {completedSteps}/{steps.length}
        </span>
        {currentStepId && currentStepIndex >= 0 && (
          <span className="text-[var(--agent-fg)]">- {steps[currentStepIndex]!.name}</span>
        )}
      </button>

      {/* Steps list (expanded) */}
      {isExpanded && (
        <div className="mt-2 space-y-1 border-l-2 border-[var(--agent-divider)] pl-2">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={`flex items-start gap-2 text-[10px] ${
                step.id === currentStepId
                  ? 'text-[var(--agent-fg)]'
                  : 'text-[var(--agent-fg-secondary)]'
              }`}
            >
              {/* Status icon */}
              <span
                className={`flex-shrink-0 ${step.status === 'running' ? 'animate-pulse' : ''}`}
                style={{ color: getStepStatusColor(step.status) }}
              >
                {getStepStatusIcon(step.status)}
              </span>

              {/* Step info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {index + 1}. {step.name}
                  </span>
                  {step.startTime && step.endTime && (
                    <span className="text-[var(--agent-fg-secondary)]">
                      ({formatDuration(Math.round((step.endTime - step.startTime) / 1000))})
                    </span>
                  )}
                </div>
                {step.message && (
                  <div className="truncate text-[var(--agent-fg-secondary)]">{step.message}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { ChevronRightIcon as ChevronIcon } from '@neko/shared/icons';
