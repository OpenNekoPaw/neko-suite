/**
 * SkillMarketPanel — Main marketplace panel for skills.
 *
 * Provides three tabs: Browse, Installed, Updates.
 * Communicates with Extension via postMessage protocol.
 */

import React, { useEffect } from 'react';
import { VSCodeMessages } from '../../messages';
import { useSkillMarket, type MarketSkillItem, type InstallProgressInfo } from './useSkillMarket';
import { SkillSearchBar } from './SkillSearchBar';
import { SkillCard } from './SkillCard';

// =============================================================================
// Tabs
// =============================================================================

const TABS = [
  { key: 'browse' as const, label: 'Browse' },
  { key: 'installed' as const, label: 'Installed' },
  { key: 'updates' as const, label: 'Updates' },
];

// =============================================================================
// Component
// =============================================================================

export const SkillMarketPanel: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    searchResults,
    searchTotal,
    isSearching,
    installedSkills,
    updates,
    featured,
    installProgress,
  } = useSkillMarket();

  // Load initial data
  useEffect(() => {
    VSCodeMessages.marketGetFeatured();
    VSCodeMessages.marketListInstalled();
    VSCodeMessages.marketCheckUpdates();
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex border-b border-[var(--vscode-panel-border)] px-3">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-[var(--vscode-focusBorder)] text-[var(--vscode-foreground)]'
                : 'border-transparent text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)]'
            }`}
          >
            {tab.label}
            {tab.key === 'updates' && updates.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]">
                {updates.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'browse' && (
          <BrowseTab
            searchResults={searchResults}
            searchTotal={searchTotal}
            isSearching={isSearching}
            featured={featured}
            installProgress={installProgress}
          />
        )}
        {activeTab === 'installed' && (
          <InstalledTab skills={installedSkills} installProgress={installProgress} />
        )}
        {activeTab === 'updates' && (
          <UpdatesTab updates={updates} installProgress={installProgress} />
        )}
      </div>
    </div>
  );
};

// =============================================================================
// Browse Tab
// =============================================================================

const BrowseTab: React.FC<{
  searchResults: MarketSkillItem[];
  searchTotal: number;
  isSearching: boolean;
  featured: MarketSkillItem[];
  installProgress: Map<string, InstallProgressInfo>;
}> = ({ searchResults, isSearching, featured, installProgress }) => {
  const items = searchResults.length > 0 ? searchResults : featured;

  return (
    <>
      <SkillSearchBar />
      <div className="px-3 pb-3 space-y-2">
        {isSearching && (
          <div className="text-xs text-[var(--vscode-descriptionForeground)] text-center py-4">
            Searching...
          </div>
        )}
        {!isSearching && items.length === 0 && (
          <div className="text-xs text-[var(--vscode-descriptionForeground)] text-center py-8">
            No skills found. Try a different search.
          </div>
        )}
        {!isSearching &&
          items.map((skill) => (
            <SkillCard key={skill.id} skill={skill} progress={installProgress.get(skill.id)} />
          ))}
      </div>
    </>
  );
};

// =============================================================================
// Installed Tab
// =============================================================================

const InstalledTab: React.FC<{
  skills: MarketSkillItem[];
  installProgress: Map<string, InstallProgressInfo>;
}> = ({ skills, installProgress }) => (
  <div className="px-3 py-2 space-y-2">
    {skills.length === 0 ? (
      <div className="text-xs text-[var(--vscode-descriptionForeground)] text-center py-8">
        No marketplace skills installed yet.
      </div>
    ) : (
      skills.map((skill) => (
        <SkillCard key={skill.id} skill={skill} progress={installProgress.get(skill.id)} />
      ))
    )}
  </div>
);

// =============================================================================
// Updates Tab
// =============================================================================

const UpdatesTab: React.FC<{
  updates: Array<{ packageId: string; currentVersion: string; latestVersion: string }>;
  installProgress: Map<string, InstallProgressInfo>;
}> = ({ updates, installProgress }) => (
  <div className="px-3 py-2 space-y-2">
    {updates.length === 0 ? (
      <div className="text-xs text-[var(--vscode-descriptionForeground)] text-center py-8">
        All skills are up to date.
      </div>
    ) : (
      updates.map((update) => (
        <div
          key={update.packageId}
          className="flex items-center justify-between rounded-lg border border-[var(--vscode-panel-border)] p-3"
        >
          <div>
            <span className="text-sm text-[var(--vscode-foreground)]">{update.packageId}</span>
            <span className="ml-2 text-xs text-[var(--vscode-descriptionForeground)]">
              {update.currentVersion} → {update.latestVersion}
            </span>
          </div>
          {installProgress.has(update.packageId) ? (
            <span className="text-xs text-[var(--vscode-descriptionForeground)]">
              {installProgress.get(update.packageId)?.percent}%
            </span>
          ) : (
            <button
              onClick={() => VSCodeMessages.marketInstall(update.packageId, update.latestVersion)}
              className="px-2 py-1 text-xs rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]"
            >
              Update
            </button>
          )}
        </div>
      ))
    )}
  </div>
);
