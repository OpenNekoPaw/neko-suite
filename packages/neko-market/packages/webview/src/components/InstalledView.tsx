/**
 * InstalledView — List of installed packages with enable/disable toggle and uninstall action.
 */

import React, { useCallback } from 'react';
import { useMarketplaceStore } from '../stores/marketplaceStore';
import { MarketMessages } from '../messages';
import { useTranslation } from '../i18n/I18nContext';

export const InstalledView: React.FC = () => {
  const { installed } = useMarketplaceStore();
  const { t } = useTranslation();

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
        <p className="empty-state__text">{t('marketplace.installed.empty')}</p>
        <p className="empty-state__hint">{t('marketplace.installed.hint')}</p>
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
                  {t('marketplace.installed.disabled')}
                </span>
              )}
            </div>
            <div className="installed-item__actions">
              <button
                className="asset-action-btn asset-action-btn--ghost"
                onClick={() => handleToggleEnabled(item.packageId, item.enabled)}
                title={
                  item.enabled ? t('marketplace.action.disable') : t('marketplace.action.enable')
                }
              >
                <span
                  className={`codicon ${item.enabled ? 'codicon-eye' : 'codicon-eye-closed'}`}
                />
              </button>
              <button
                className="asset-action-btn asset-action-btn--secondary"
                onClick={() => MarketMessages.uninstall(item.packageId)}
              >
                {t('marketplace.action.uninstall')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
