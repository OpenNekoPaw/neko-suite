/**
 * PlanReview Component
 * Displays AI execution plan for user review
 * Supports approve/reject individual steps or entire plan
 */

import { useState, memo } from 'react';
import { Plan } from '@/components/types';
import { useTranslation } from '@/i18n/I18nContext';
import { ChevronRightIcon, CheckIcon, CloseIcon, EditIcon } from '@neko/shared/icons';
import {
  projectPlanReviewUiState,
  type PlanReviewBadgeTone,
  type PlanReviewStepProjection,
  type PlanStepContainerTone,
  type PlanStepContentTone,
  type PlanStepIconKind,
  type PlanStepIconTone,
} from '@/presenters/plan-review-presenter';

interface PlanReviewProps {
  plan: Plan;
  onApproveStep?: (stepId: string) => void;
  onRejectStep?: (stepId: string) => void;
  onModifyStep?: (stepId: string, newDescription: string) => void;
  onApproveAll?: () => void;
  onRejectAll?: () => void;
}

/**
 * Status icon component
 */
function StatusIcon({ kind, tone }: { kind: PlanStepIconKind; tone: PlanStepIconTone }) {
  return <span className={planStepIconToneClass(tone)}>{planStepIconGlyph(kind)}</span>;
}

/**
 * Individual plan step component
 */
function PlanStepItem({
  projection,
  onApprove,
  onReject,
  onModify,
}: {
  projection: PlanReviewStepProjection;
  onApprove?: () => void;
  onReject?: () => void;
  onModify?: (newDescription: string) => void;
}) {
  const { t } = useTranslation();
  const { step, index } = projection;
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(step.description);

  const handleSaveEdit = () => {
    if (editValue.trim() && editValue !== step.description) {
      onModify?.(editValue.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    }
    if (e.key === 'Escape') {
      setEditValue(step.description);
      setIsEditing(false);
    }
  };

  return (
    <div
      className={`flex items-start gap-2 border-b border-[var(--agent-divider)] py-1.5 last:border-b-0 ${planStepContainerToneClass(
        projection.containerTone,
      )}`}
    >
      {/* Step number and status */}
      <div className="flex items-center gap-1 flex-shrink-0 w-10">
        <span className="text-[11px] text-[var(--agent-fg-secondary)]">{index + 1}.</span>
        <StatusIcon kind={projection.icon.kind} tone={projection.icon.tone} />
      </div>

      {/* Step content */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSaveEdit}
            autoFocus
            className="vscode-input min-h-[52px] w-full resize-none px-2 py-1 text-[12px]"
            rows={2}
          />
        ) : (
          <>
            <p
              className={`text-[12px] leading-relaxed ${planStepContentToneClass(
                projection.contentTone,
              )}`}
            >
              {step.description}
            </p>
            {projection.showOriginalDescription && (
              <p className="mt-0.5 text-[11px] text-[var(--agent-fg-secondary)] line-through">
                {step.originalDescription}
              </p>
            )}
          </>
        )}
      </div>

      {/* Action buttons */}
      {projection.isPending && !isEditing && (
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {/* Edit button */}
          <button
            onClick={() => setIsEditing(true)}
            className="agent-header-action min-h-0 min-w-0 p-1"
            title={t('chat.plan.edit')}
          >
            <EditIcon className="w-3 h-3" />
          </button>
          {/* Approve button */}
          <button
            onClick={onApprove}
            className="agent-header-action min-h-0 min-w-0 p-1 hover:text-[var(--agent-success)]"
            title={t('chat.plan.approve')}
          >
            <CheckIcon className="w-3 h-3" />
          </button>
          {/* Reject button */}
          <button
            onClick={onReject}
            className="agent-header-action min-h-0 min-w-0 p-1 hover:text-[var(--agent-danger)]"
            title={t('chat.plan.reject')}
          >
            <XIcon className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

function PlanReviewComponent({
  plan,
  onApproveStep,
  onRejectStep,
  onModifyStep,
  onApproveAll,
  onRejectAll,
}: PlanReviewProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(true);
  const projection = projectPlanReviewUiState({
    plan,
    canApproveAll: Boolean(onApproveAll),
    canRejectAll: Boolean(onRejectAll),
  });

  return (
    <div className="agent-inline-card my-1">
      {/* Header */}
      <div
        className="agent-inline-header flex cursor-pointer items-center gap-2 px-2 py-1.5"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Expand/Collapse icon */}
        <ChevronIcon className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />

        {/* Plan icon */}
        <PlanIcon className="w-3 h-3 text-[var(--agent-fg-secondary)]" />

        {/* Title */}
        <span className="flex-1 text-[11px] font-medium text-[var(--agent-fg)]">
          {plan.title || t('chat.plan.title')}
        </span>

        {/* Stats */}
        <span className="text-[10px] text-[var(--agent-fg-secondary)]">
          {projection.stats.total} {t('chat.plan.steps')}
        </span>

        {/* Status badge */}
        {projection.badge && (
          <span
            className={`agent-badge ${planReviewBadgeToneClass(projection.badge.tone)} text-[9px]`}
          >
            {t(projection.badge.labelKey)}
          </span>
        )}
      </div>

      {/* Steps list */}
      {isExpanded && (
        <>
          <div className="max-h-[300px] overflow-y-auto px-2 py-1">
            {projection.steps.map((stepProjection) => (
              <PlanStepItem
                key={stepProjection.step.id}
                projection={stepProjection}
                onApprove={() => onApproveStep?.(stepProjection.step.id)}
                onReject={() => onRejectStep?.(stepProjection.step.id)}
                onModify={(desc) => onModifyStep?.(stepProjection.step.id, desc)}
              />
            ))}
          </div>

          {/* Footer with bulk actions */}
          {projection.showBulkActions && (
            <div className="flex items-center gap-2 border-t border-[var(--agent-divider)] px-2 py-1.5">
              {onApproveAll && (
                <button
                  onClick={onApproveAll}
                  className="vscode-button flex items-center gap-1 px-2 py-0.5 text-[11px] leading-4"
                >
                  <CheckIcon className="w-3 h-3" />
                  {t('chat.plan.approveAll')}
                </button>
              )}
              {onRejectAll && (
                <button
                  onClick={onRejectAll}
                  className="vscode-button vscode-button-secondary flex items-center gap-1 px-2 py-0.5 text-[11px] leading-4"
                >
                  <XIcon className="w-3 h-3" />
                  {t('chat.plan.rejectAll')}
                </button>
              )}
              <span className="flex-1" />
              <span className="text-[10px] text-[var(--agent-fg-secondary)]">
                {projection.stats.pending} {t('chat.plan.pending')}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export const PlanReview = memo(PlanReviewComponent);

function planReviewBadgeToneClass(tone: PlanReviewBadgeTone): string {
  switch (tone) {
    case 'success':
      return 'is-success';
    case 'danger':
      return 'is-danger';
    case 'warning':
      return 'is-warning';
  }
}

function planStepIconToneClass(tone: PlanStepIconTone): string {
  switch (tone) {
    case 'success':
      return 'text-[var(--agent-success)]';
    case 'danger':
      return 'text-[var(--agent-danger)]';
    case 'warning':
      return 'text-[var(--agent-warning-fg)]';
    case 'secondary':
      return 'text-[var(--agent-fg-secondary)]';
  }
}

function planStepIconGlyph(kind: PlanStepIconKind): string {
  switch (kind) {
    case 'approved':
      return '✓';
    case 'rejected':
      return '✗';
    case 'modified':
      return '✎';
    case 'default':
      return '○';
  }
}

function planStepContainerToneClass(tone: PlanStepContainerTone): string {
  return tone === 'muted' ? 'opacity-50' : '';
}

function planStepContentToneClass(tone: PlanStepContentTone): string {
  return tone === 'warning' ? 'text-[var(--agent-warning-fg)]' : 'text-[var(--agent-fg)]';
}

// Icons
const ChevronIcon = ChevronRightIcon;

function PlanIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
      />
    </svg>
  );
}

const XIcon = CloseIcon;
