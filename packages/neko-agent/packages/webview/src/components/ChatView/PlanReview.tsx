/**
 * PlanReview Component
 * Displays AI execution plan for user review
 * Supports approve/reject individual steps or entire plan
 */

import { useState, memo } from 'react';
import { Plan, PlanStep } from '@/components/types';
import { useTranslation } from '@/i18n/I18nContext';
import { ChevronRightIcon, CheckIcon, CloseIcon, EditIcon } from '@neko/shared/icons';

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
function StatusIcon({ status }: { status: PlanStep['status'] }) {
  switch (status) {
    case 'approved':
      return <span className="text-[var(--agent-success)]">✓</span>;
    case 'rejected':
      return <span className="text-[var(--agent-danger)]">✗</span>;
    case 'modified':
      return <span className="text-[var(--agent-warning-fg)]">✎</span>;
    default:
      return <span className="text-[var(--agent-fg-secondary)]">○</span>;
  }
}

/**
 * Individual plan step component
 */
function PlanStepItem({
  step,
  index,
  onApprove,
  onReject,
  onModify,
}: {
  step: PlanStep;
  index: number;
  onApprove?: () => void;
  onReject?: () => void;
  onModify?: (newDescription: string) => void;
}) {
  const { t } = useTranslation();
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
      className={`flex items-start gap-2 border-b border-[var(--agent-divider)] py-1.5 last:border-b-0 ${
        step.status === 'rejected' ? 'opacity-50' : ''
      }`}
    >
      {/* Step number and status */}
      <div className="flex items-center gap-1 flex-shrink-0 w-10">
        <span className="text-[11px] text-[var(--agent-fg-secondary)]">{index + 1}.</span>
        <StatusIcon status={step.status} />
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
              className={`text-[12px] leading-relaxed ${
                step.status === 'modified'
                  ? 'text-[var(--agent-warning-fg)]'
                  : 'text-[var(--agent-fg)]'
              }`}
            >
              {step.description}
            </p>
            {step.status === 'modified' && step.originalDescription && (
              <p className="mt-0.5 text-[11px] text-[var(--agent-fg-secondary)] line-through">
                {step.originalDescription}
              </p>
            )}
          </>
        )}
      </div>

      {/* Action buttons */}
      {step.status === 'pending' && !isEditing && (
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

  // Calculate stats
  const pendingCount = plan.steps.filter((s) => s.status === 'pending').length;
  const approvedCount = plan.steps.filter(
    (s) => s.status === 'approved' || s.status === 'modified',
  ).length;
  const rejectedCount = plan.steps.filter((s) => s.status === 'rejected').length;

  // Determine overall status display
  const getStatusBadge = () => {
    if (plan.status === 'approved' || (pendingCount === 0 && rejectedCount === 0)) {
      return <span className="agent-badge is-success text-[9px]">{t('chat.plan.approved')}</span>;
    }
    if (plan.status === 'rejected' || (pendingCount === 0 && approvedCount === 0)) {
      return <span className="agent-badge is-danger text-[9px]">{t('chat.plan.rejected')}</span>;
    }
    if (pendingCount === 0 && approvedCount > 0 && rejectedCount > 0) {
      return <span className="agent-badge is-warning text-[9px]">{t('chat.plan.partial')}</span>;
    }
    return null;
  };

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
          {plan.steps.length} {t('chat.plan.steps')}
        </span>

        {/* Status badge */}
        {getStatusBadge()}
      </div>

      {/* Steps list */}
      {isExpanded && (
        <>
          <div className="max-h-[300px] overflow-y-auto px-2 py-1">
            {plan.steps.map((step, index) => (
              <PlanStepItem
                key={step.id}
                step={step}
                index={index}
                onApprove={() => onApproveStep?.(step.id)}
                onReject={() => onRejectStep?.(step.id)}
                onModify={(desc) => onModifyStep?.(step.id, desc)}
              />
            ))}
          </div>

          {/* Footer with bulk actions */}
          {pendingCount > 0 && (onApproveAll || onRejectAll) && (
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
                {pendingCount} {t('chat.plan.pending')}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export const PlanReview = memo(PlanReviewComponent);

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
