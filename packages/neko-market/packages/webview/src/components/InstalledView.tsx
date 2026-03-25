/**
 * InstalledView — List of installed packages with enable/disable toggle and uninstall action.
 */

import React, { useCallback } from 'react';
import { useMarketplaceStore } from '../stores/marketplaceStore';
import { MarketMessages } from '../messages';

export const InstalledView: React.FC = () => {
  const { installed } = useMarketplaceStore();

  const handleToggleEnabled = useCallback((packageId: string, currentEnabled: boolean) => {
    if (currentEnabled) {
      MarketMessages.disable(packageId);
    } else {
      MarketMessages.enable(packageId);
    }
  }, []);

  if (installed.length === 0) {
    return (
      <div className="empty-state">
        <span className="codicon codicon-inbox empty-state__icon" />
        <p className="empty-state__text">No packages installed.</p>
        <p className="empty-state__hint">Browse the marketplace to find skills and assets.</p>
      </div>
    );
  }

  return (
    <div className="installed-view">
      <div className="installed-list">
        {installed.map((item) => (
          <div
            key={item.packageId}
            className={`installed-item${!item.enabled ? ' installed-item--disabled' : ''}`}
          >
            <div className="installed-item__info">
              <span className="installed-item__id">{item.packageId}</span>
              <span className="installed-item__version">v{item.version}</span>
              <span className="installed-item__type">{item.type}</span>
              {!item.enabled && (
                <span className="installed-item__badge installed-item__badge--disabled">
                  Disabled
                </span>
              )}
            </div>
            <div className="installed-item__actions">
              <button
                className="asset-action-btn asset-action-btn--ghost"
                onClick={() => handleToggleEnabled(item.packageId, item.enabled)}
                title={item.enabled ? 'Disable' : 'Enable'}
              >
                <span
                  className={`codicon ${item.enabled ? 'codicon-eye' : 'codicon-eye-closed'}`}
                />
              </button>
              <button
                className="asset-action-btn asset-action-btn--secondary"
                onClick={() => MarketMessages.uninstall(item.packageId)}
              >
                Uninstall
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
