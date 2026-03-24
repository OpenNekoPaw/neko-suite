/**
 * UpdatesView — Available updates for installed packages.
 */

import React from 'react';
import { useMarketplaceStore } from '../stores/marketplaceStore';
import { MarketMessages } from '../messages';

export const UpdatesView: React.FC = () => {
  const { updates, installProgress } = useMarketplaceStore();

  if (updates.length === 0) {
    return (
      <div className="empty-state">
        <span className="codicon codicon-check empty-state__icon" />
        <p className="empty-state__text">Everything is up to date.</p>
      </div>
    );
  }

  return (
    <div className="updates-view">
      <div className="updates-header">
        <span>
          {updates.length} update{updates.length !== 1 ? 's' : ''} available
        </span>
        <button
          className="asset-action-btn asset-action-btn--primary"
          onClick={() => {
            updates.forEach((u) => MarketMessages.install(u.packageId, u.latestVersion));
          }}
        >
          Update All
        </button>
      </div>

      <div className="updates-list">
        {updates.map((update) => {
          const progress = installProgress.get(update.packageId);
          const isUpdating = progress !== undefined;

          return (
            <div key={update.packageId} className="update-item">
              <div className="update-item__info">
                <span className="update-item__id">{update.packageId}</span>
                <span className="update-item__versions">
                  {update.currentVersion} → {update.latestVersion}
                </span>
                {update.changelog && <p className="update-item__changelog">{update.changelog}</p>}
              </div>

              {isUpdating ? (
                <div className="install-progress" style={{ width: 80 }}>
                  <div
                    className="install-progress__bar"
                    style={{ width: `${progress.percent}%` }}
                  />
                  <span className="install-progress__phase">{progress.percent}%</span>
                </div>
              ) : (
                <button
                  className="asset-action-btn asset-action-btn--primary"
                  onClick={() => MarketMessages.install(update.packageId, update.latestVersion)}
                >
                  Update
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
