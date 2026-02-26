/**
 * PlanReview Component
 * Displays AI execution plan for user review
 * Supports approve/reject individual steps or entire plan
 */

import { useState, memo } from 'react';
import { Plan, PlanStep } from '@/components/types';
import { useTranslation } from '@/i18n/I18nContext';

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
      return <span className="text-[var(--vscode-charts-green)]">✓</span>;
    case 'rejected':
      return <span className="text-[var(--vscode-charts-red)]">✗</span>;
    case 'modified':
      return <span className="text-[var(--vscode-charts-yellow)]">✎</span>;
    default:
      return <span className="text-[var(--vscode-descriptionForeground)]">○</span>;
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
      className={`flex items-start gap-2 py-1.5 border-b border-[var(--vscode-panel-border)] last:border-b-0 ${
        step.status === 'rejected' ? 'opacity-50' : ''
      }`}
    >
      {/* Step number and status */}
      <div className="flex items-center gap-1 flex-shrink-0 w-10">
        <span className="text-[11px] text-[var(--vscode-descriptionForeground)]">
          {index + 1}.
        </span>
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
            className="w-full px-1.5 py-0.5 text-[12px] bg-[var(--vscode-input-background)] border border-[var(--vscode-focusBorder)] rounded resize-none outline-none"
            rows={2}
          />
        ) : (
          <>
            <p
              className={`text-[12px] leading-relaxed ${
                step.status === 'modified' ? 'text-[var(--vscode-charts-yellow)]' : 'text-[var(--vscode-foreground)]'
              }`}
            >
              {step.description}
            </p>
            {step.status === 'modified' && step.originalDescription && (
              <p className="text-[11px] text-[var(--vscode-descriptionForeground)] line-through mt-0.5">
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
            className="w-5 h-5 flex items-center justify-center text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded transition-colors"
            title={t('chat.plan.edit')}
          >
            <EditIcon className="w-3 h-3" />
          </button>
          {/* Approve button */}
          <button
            onClick={onApprove}
            className="w-5 h-5 flex items-center justify-center text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-charts-green)] hover:bg-[var(--vscode-charts-green)]/10 rounded transition-colors"
            title={t('chat.plan.approve')}
          >
            <CheckIcon className="w-3 h-3" />
          </button>
          {/* Reject button */}
          <button
            onClick={onReject}
            className="w-5 h-5 flex items-center justify-center text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-charts-red)] hover:bg-[var(--vscode-charts-red)]/10 rounded transition-colors"
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
  const approvedCount = plan.steps.filter((s) => s.status === 'approved' || s.status === 'modified').length;
  const rejectedCount = plan.steps.filter((s) => s.status === 'rejected').length;

  // Determine overall status display
  const getStatusBadge = () => {
    if (plan.status === 'approved' || (pendingCount === 0 && rejectedCount === 0)) {
      return (
        <span className="text-[9px] px-1 rounded bg-[var(--vscode-charts-green)]/20 text-[var(--vscode-charts-green)]">
          {t('chat.plan.approved')}
        </span>
      );
    }
    if (plan.status === 'rejected' || (pendingCount === 0 && approvedCount === 0)) {
      return (
        <span className="text-[9px] px-1 rounded bg-[var(--vscode-charts-red)]/20 text-[var(--vscode-charts-red)]">
          {t('chat.plan.rejected')}
        </span>
      );
    }
    if (pendingCount === 0 && approvedCount > 0 && rejectedCount > 0) {
      return (
        <span className="text-[9px] px-1 rounded bg-[var(--vscode-charts-yellow)]/20 text-[var(--vscode-charts-yellow)]">
          {t('chat.plan.partial')}
        </span>
      );
    }
    return null;
  };

  return (
    <div className="my-1 rounded border border-[var(--vscode-panel-border)] overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-2 py-1.5 bg-[var(--vscode-textBlockQuote-background)] cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Expand/Collapse icon */}
        <ChevronIcon className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />

        {/* Plan icon */}
        <PlanIcon className="w-3 h-3 text-[var(--vscode-descriptionForeground)]" />

        {/* Title */}
        <span className="text-[11px] font-medium text-[var(--vscode-foreground)] flex-1">
          {plan.title || t('chat.plan.title')}
        </span>

        {/* Stats */}
        <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
          {plan.steps.length} {t('chat.plan.steps')}
        </span>

        {/* Status badge */}
        {getStatusBadge()}
      </div>

      {/* Steps list */}
      {isExpanded && (
        <>
          <div className="px-2 py-1 max-h-[300px] overflow-y-auto">
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
            <div className="flex items-center gap-2 px-2 py-1.5 border-t border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)]">
              {onApproveAll && (
                <button
                  onClick={onApproveAll}
                  className="flex items-center gap-1 px-2 py-0.5 text-[11px] bg-[var(--vscode-button-background)] hover:bg-[var(--vscode-button-hoverBackground)] text-[var(--vscode-button-foreground)] rounded transition-colors"
                >
                  <CheckIcon className="w-3 h-3" />
                  {t('chat.plan.approveAll')}
                </button>
              )}
              {onRejectAll && (
                <button
                  onClick={onRejectAll}
                  className="flex items-center gap-1 px-2 py-0.5 text-[11px] bg-[var(--vscode-button-secondaryBackground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] text-[var(--vscode-button-secondaryForeground)] rounded transition-colors"
                >
                  <XIcon className="w-3 h-3" />
                  {t('chat.plan.rejectAll')}
                </button>
              )}
              <span className="flex-1" />
              <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
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
function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

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

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
    </svg>
  );
}
