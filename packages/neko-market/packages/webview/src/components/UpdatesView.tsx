/**
 * UpdatesView — Available updates for installed packages.
 */

import React from 'react';
import { useMarketplaceStore } from '../stores/marketplaceStore';
import { MarketMessages } from '../messages';
import { useTranslation } from '../i18n/I18nContext';

export const UpdatesView: React.FC = () => {
  const { updates, installProgress } = useMarketplaceStore();
  const { t } = useTranslation();

  if (updates.length === 0) {
    return (
      <div className="empty-state">
        <span className="codicon codicon-check empty-state__icon" />
        <p className="empty-state__text">{t('marketplace.updates.empty')}</p>
      </div>
    );
  }

  return (
    <div className="updates-view">
      <div className="updates-header">
        <span>
          {t(
            updates.length !== 1 ? 'marketplace.updates.countPlural' : 'marketplace.updates.count',
            { count: String(updates.length) },
          )}
        </span>
        <button
          className="asset-action-btn asset-action-btn--primary"
          onClick={() => {
            updates.forEach((u) => {
              if (!u.blocked) MarketMessages.update(u.packageId, u.latestVersion);
            });
          }}
        >
          {t('marketplace.updates.updateAll')}
        </button>
      </div>

      <div className="updates-list">
        {updates.map((update) => {
          const progress = installProgress.get(update.packageId);
          const isUpdating = progress !== undefined;
          const isBlocked = update.blocked === true;
          const compatibilityReasons = getCompatibilityReasons(update.compatibility);

          return (
            <div key={update.packageId} className="update-item">
              <div className="update-item__info">
                <span className="update-item__id">{update.packageId}</span>
                <span className="update-item__versions">
                  {update.currentVersion} → {update.latestVersion}
                </span>
                {isBlocked && (
                  <span className="status-badge status-badge--blocked">
                    {update.reason ?? t('marketplace.updates.blocked')}
                  </span>
                )}
                {update.changelog && <p className="update-item__changelog">{update.changelog}</p>}
                {compatibilityReasons.length > 0 && (
                  <div className="update-item__compatibility">
                    {compatibilityReasons.map((reason) => (
                      <span key={reason} className="status-badge status-badge--warning">
                        {reason}
                      </span>
                    ))}
                  </div>
                )}
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
                  disabled={isBlocked}
                  onClick={() => MarketMessages.update(update.packageId, update.latestVersion)}
                >
                  {t('marketplace.action.update')}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

function getCompatibilityReasons(updateCompatibility: unknown): string[] {
  if (!isRecord(updateCompatibility)) return [];
  const reasons: string[] = [];
  if (typeof updateCompatibility['nekoSuiteVersion'] === 'string') {
    reasons.push(`Neko ${updateCompatibility['nekoSuiteVersion']}`);
  }
  if (typeof updateCompatibility['vscodeVersion'] === 'string') {
    reasons.push(`VSCode ${updateCompatibility['vscodeVersion']}`);
  }
  if (Array.isArray(updateCompatibility['knownIncompatible'])) {
    for (const item of updateCompatibility['knownIncompatible']) {
      if (isRecord(item) && typeof item['reason'] === 'string') {
        reasons.push(item['reason']);
      }
    }
  }
  return reasons;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
