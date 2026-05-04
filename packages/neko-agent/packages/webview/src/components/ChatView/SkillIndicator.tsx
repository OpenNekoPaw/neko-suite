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
