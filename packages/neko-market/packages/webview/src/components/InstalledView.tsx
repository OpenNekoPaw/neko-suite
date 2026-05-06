/**
 * InstalledView — List of installed packages with enable/disable toggle and uninstall action.
 */

import React, { useCallback } from 'react';
import { useMarketplaceStore, type InstalledItem } from '../stores/marketplaceStore';
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
      {groupInstalled(installed).map(([category, items]) => (
        <section key={category} className="installed-group">
          <h3 className="section-title">
            {t(`marketplace.category.${category}`)} ({items.length})
          </h3>
          <div className="installed-list">
            {items.map((item) => (
              <div
                key={item.packageId}
                className={`installed-item${!item.enabled ? ' installed-item--disabled' : ''}`}
              >
                <div className="installed-item__info">
                  <span className="installed-item__id">{item.packageId}</span>
                  <span className="installed-item__version">v{item.version}</span>
                  <span className="installed-item__type">
                    {item.type}
                    {item.kind ? ` · ${item.kind}` : ''}
                  </span>
                  <div className="status-row">
                    {!item.enabled && (
                      <span className="status-badge">{t('marketplace.installed.disabled')}</span>
                    )}
                    <span className={statusClass(item.status ?? 'active')}>
                      {t(`marketplace.status.${item.status ?? 'active'}`)}
                    </span>
                    {item.largeAsset && (
                      <span className="status-badge">
                        {t(`marketplace.largeAsset.state.${item.largeAsset.state}`)}
                      </span>
                    )}
                  </div>
                  {item.refs && Object.keys(item.refs).length > 0 && (
                    <span className="installed-item__dependency">
                      {t('marketplace.installed.dependencies', {
                        count: String(Object.keys(item.refs).length),
                      })}
                    </span>
                  )}
                </div>
                <div className="installed-item__actions">
                  <button
                    className="asset-action-btn asset-action-btn--ghost"
                    onClick={() => handleToggleEnabled(item.packageId, item.enabled)}
                    title={
                      item.enabled
                        ? t('marketplace.action.disable')
                        : t('marketplace.action.enable')
                    }
                  >
                    <span
                      className={`codicon ${item.enabled ? 'codicon-eye' : 'codicon-eye-closed'}`}
                    />
                  </button>
                  <button
                    className="asset-action-btn asset-action-btn--secondary"
                    onClick={() => MarketMessages.getPackage(item.packageId)}
                  >
                    {t('marketplace.action.detail')}
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
        </section>
      ))}
    </div>
  );
};

function groupInstalled(items: InstalledItem[]): Array<[string, InstalledItem[]]> {
  const groups = new Map<string, InstalledItem[]>();
  for (const item of items) {
    const category = item.category ?? 'tooling';
    groups.set(category, [...(groups.get(category) ?? []), item]);
  }
  return Array.from(groups.entries());
}

function statusClass(status: NonNullable<InstalledItem['status']>): string {
  if (status === 'expired' || status === 'incompatible')
    return 'status-badge status-badge--blocked';
  if (status === 'expiring-soon' || status === 'deprecated')
    return 'status-badge status-badge--warning';
  return 'status-badge status-badge--active';
}
