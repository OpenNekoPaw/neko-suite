/**
 * Skill Confirmation Banner
 *
 * Displays a confirmation prompt when a skill is discovered through semantic matching.
 * Shows skill name, description, relevance, and match reason.
 */

import { useState } from 'react';

export interface SkillConfirmRequest {
  skillName: string;
  skillDescription: string;
  relevance: number;
  reason: string;
}

interface SkillConfirmBannerProps {
  request: SkillConfirmRequest;
  onConfirm: () => void;
  onDecline: () => void;
}

export function SkillConfirmBanner({ request, onConfirm, onDecline }: SkillConfirmBannerProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = () => {
    setIsLoading(true);
    onConfirm();
  };

  const handleDecline = () => {
    setIsLoading(true);
    onDecline();
  };

  // Calculate relevance display (percentage)
  const relevancePercent = Math.round(request.relevance * 100);
  const relevanceColor =
    relevancePercent >= 80
      ? 'text-[var(--vscode-charts-green)]'
      : relevancePercent >= 60
        ? 'text-[var(--vscode-charts-yellow)]'
        : 'text-[var(--vscode-charts-orange)]';

  return (
    <div className="mx-4 my-2 p-3 rounded-lg border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)]">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">✨</span>
        <span className="font-medium text-[var(--vscode-foreground)]">发现匹配的 Skill</span>
        <span className={`text-xs ${relevanceColor}`}>({relevancePercent}% 匹配度)</span>
      </div>

      {/* Skill Info */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-1">
          <code className="px-2 py-0.5 rounded bg-[var(--vscode-textBlockQuote-background)] text-[var(--vscode-textLink-foreground)]">
            /{request.skillName}
          </code>
        </div>
        <p className="text-sm text-[var(--vscode-descriptionForeground)] line-clamp-2">
          {request.skillDescription}
        </p>
        <p className="text-xs text-[var(--vscode-descriptionForeground)] mt-1 italic">
          {request.reason}
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleConfirm}
          disabled={isLoading}
          className="px-3 py-1.5 text-sm rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] disabled:opacity-50 transition-colors"
        >
          {isLoading ? '应用中...' : '应用 Skill'}
        </button>
        <button
          onClick={handleDecline}
          disabled={isLoading}
          className="px-3 py-1.5 text-sm rounded border border-[var(--vscode-input-border)] text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] disabled:opacity-50 transition-colors"
        >
          跳过
        </button>
      </div>
    </div>
  );
}

/**
 * Skill Injection Indicator
 *
 * Shows when a skill is actively injected into the conversation.
 */
export interface ActiveSkillIndicator {
  skillName: string;
  allowedTools?: string[];
}

interface SkillIndicatorProps {
  skill: ActiveSkillIndicator;
  onClear: () => void;
}

export function SkillIndicator({ skill, onClear }: SkillIndicatorProps) {
  return (
    <div className="mx-4 my-1 px-3 py-1.5 rounded-md flex items-center gap-2 bg-[var(--vscode-textBlockQuote-background)] border border-[var(--vscode-textBlockQuote-border)]">
      <span className="text-sm">🎯</span>
      <span className="text-sm font-medium text-[var(--vscode-foreground)]">Skill 已激活:</span>
      <code className="text-xs px-1.5 py-0.5 rounded bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]">
        {skill.skillName}
      </code>
      {skill.allowedTools && skill.allowedTools.length > 0 && (
        <span className="text-xs text-[var(--vscode-descriptionForeground)]">
          (工具限制: {skill.allowedTools.length})
        </span>
      )}
      <button
        onClick={onClear}
        className="ml-auto text-xs text-[var(--vscode-textLink-foreground)] hover:underline"
      >
        清除
      </button>
    </div>
  );
}
