/**
 * SkillCard — Marketplace skill card component.
 *
 * Displays skill info with install/uninstall button.
 */

import React from 'react';
import { VSCodeMessages } from '../../messages';
import type { MarketSkillItem, InstallProgressInfo } from './useSkillMarket';

interface SkillCardProps {
  skill: MarketSkillItem;
  progress?: InstallProgressInfo;
}

export const SkillCard: React.FC<SkillCardProps> = ({ skill, progress }) => {
  const isInstalling = !!progress;

  const handleInstall = () => {
    VSCodeMessages.marketInstall(skill.id, skill.version);
  };

  const handleUninstall = () => {
    VSCodeMessages.marketUninstall(skill.id);
  };

  return (
    <div className="flex items-start gap-3 rounded-lg border border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] p-3 hover:bg-[var(--vscode-list-hoverBackground)] transition-colors">
      {/* Icon */}
      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[var(--vscode-badge-background)] flex items-center justify-center text-lg">
        {skill.icon ?? '🧩'}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-[var(--vscode-foreground)] truncate">{skill.name}</span>
          <span className="text-xs text-[var(--vscode-descriptionForeground)]">
            v{skill.version}
          </span>
        </div>

        {skill.author && (
          <div className="text-xs text-[var(--vscode-descriptionForeground)] mt-0.5">
            by {skill.author}
          </div>
        )}

        {skill.description && (
          <p className="text-xs text-[var(--vscode-descriptionForeground)] mt-1 line-clamp-2">
            {skill.description}
          </p>
        )}

        {skill.tags && skill.tags.length > 0 && (
          <div className="flex gap-1 mt-1.5 flex-wrap">
            {skill.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 text-[10px] rounded bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Action button */}
      <div className="flex-shrink-0">
        {isInstalling ? (
          <div className="text-xs text-[var(--vscode-descriptionForeground)]">
            {progress.percent}%
          </div>
        ) : skill.installState === 'installed' ? (
          <button
            onClick={handleUninstall}
            className="px-2 py-1 text-xs rounded border border-[var(--vscode-button-secondaryBorder)] text-[var(--vscode-button-secondaryForeground)] bg-[var(--vscode-button-secondaryBackground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]"
          >
            Uninstall
          </button>
        ) : skill.installState === 'update-available' ? (
          <button
            onClick={handleInstall}
            className="px-2 py-1 text-xs rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]"
          >
            Update
          </button>
        ) : (
          <button
            onClick={handleInstall}
            className="px-2 py-1 text-xs rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]"
          >
            Install
          </button>
        )}
      </div>
    </div>
  );
};
