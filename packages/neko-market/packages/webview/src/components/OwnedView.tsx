/**
 * OwnedView — Server entitlement projection.
 */

import React from 'react';
import { toCodiconClassName } from '@neko/ui/icons';
import { useMarketplaceStore, type OwnedItem } from '../stores/marketplaceStore';
import { MarketMessages } from '../messages';
import { useTranslation } from '../i18n/I18nContext';

const STATE_BADGE_CLASS: Record<OwnedItem['state'], string> = {
  'owned-installed': 'status-badge status-badge--active',
  'owned-not-installed': 'status-badge',
  expiring: 'status-badge status-badge--warning',
  expired: 'status-badge status-badge--blocked',
  pending: 'status-badge',
};

export const OwnedView: React.FC = () => {
  const { entitlements, setEntitlementsRefreshing } = useMarketplaceStore();
  const { t } = useTranslation();

  const refresh = () => {
    setEntitlementsRefreshing(true);
    MarketMessages.refreshEntitlements();
  };

  if (entitlements.items.length === 0) {
    return (
      <div className="empty-state">
        <span className={`${toCodiconClassName('account')} empty-state__icon`} />
        <p className="empty-state__text">{t('marketplace.owned.empty')}</p>
        <button className="asset-action-btn asset-action-btn--secondary" onClick={refresh}>
          {t('marketplace.action.refresh')}
        </button>
      </div>
    );
  }

  return (
    <div className="owned-view">
      <div className="surface-header">
        <span>{t('marketplace.owned.count', { count: String(entitlements.items.length) })}</span>
        <button
          className="asset-action-btn asset-action-btn--secondary"
          onClick={refresh}
          disabled={entitlements.isRefreshing}
        >
          {t('marketplace.action.refresh')}
        </button>
      </div>

      <div className="owned-list">
        {entitlements.items.map((item) => {
          const title = item.name ?? item.packageId;
          const canInstall =
            (item.state === 'owned-not-installed' || item.state === 'expiring') && item.version;
          const canRenew = item.state === 'expired' || item.state === 'expiring';

          return (
            <div key={item.packageId} className="owned-item">
              <div className="owned-item__info">
                <span className="owned-item__id">{title}</span>
                <span className="owned-item__meta">
                  {item.type ?? 'package'}
                  {item.version ? ` · v${item.version}` : ''}
                </span>
                <span className={STATE_BADGE_CLASS[item.state]}>
                  {t(`marketplace.owned.state.${item.state}`)}
                </span>
              </div>

              <div className="owned-item__actions">
                {canInstall && (
                  <button
                    className="asset-action-btn asset-action-btn--primary"
                    onClick={() => MarketMessages.install(item.packageId, item.version as string)}
                  >
                    {t('marketplace.action.install')}
                  </button>
                )}
                {canRenew && (
                  <button
                    className="asset-action-btn asset-action-btn--secondary"
                    onClick={() => MarketMessages.checkout(item.packageId, 'renew')}
                  >
                    {t('marketplace.action.renew')}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
