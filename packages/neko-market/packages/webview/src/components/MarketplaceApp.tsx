/**
 * MarketplaceApp — Root component for the Neko Marketplace webview.
 *
 * Handles message routing from Extension Host and tab-based navigation.
 */

import React, { useEffect, useCallback } from 'react';
import {
  useMarketplaceStore,
  type MarketItem,
  type InstalledItem,
  type UpdateItem,
  type TabType,
} from '../stores/marketplaceStore';
import { MarketMessages } from '../messages';
import { useTranslation } from '../i18n/I18nContext';
import { getLogger } from '../utils/logger';
import { SearchBar } from './SearchBar';
import { BrowseView } from './BrowseView';
import { InstalledView } from './InstalledView';
import { UpdatesView } from './UpdatesView';

const logger = getLogger('MarketplaceApp');

// =============================================================================
// Message types from Extension Host
// =============================================================================

interface ExtensionMessage {
  type: string;
  data?: unknown;
  error?: string;
}

// =============================================================================
// Component
// =============================================================================

export const MarketplaceApp: React.FC = () => {
  const store = useMarketplaceStore();
  const { t } = useTranslation();

  const TABS: { key: TabType; labelKey: string; icon: string }[] = [
    { key: 'browse', labelKey: 'marketplace.tab.browse', icon: 'codicon-search' },
    { key: 'installed', labelKey: 'marketplace.tab.installed', icon: 'codicon-package' },
    { key: 'updates', labelKey: 'marketplace.tab.updates', icon: 'codicon-cloud-download' },
  ];

  // ---------------------------------------------------------------------------
  // Message handler
  // ---------------------------------------------------------------------------

  const handleMessage = useCallback(
    (event: MessageEvent<ExtensionMessage>) => {
      const { type, data } = event.data;

      switch (type) {
        case 'market:searchResult': {
          const result = data as { items: MarketItem[]; total: number };
          store.setSearchResults(result.items ?? [], result.total ?? 0);
          break;
        }
        case 'market:featuredResult':
          store.setFeatured((data as MarketItem[]) ?? []);
          break;

        case 'market:installedResult':
          store.setInstalled((data as InstalledItem[]) ?? []);
          break;

        case 'market:updatesResult':
          store.setUpdates((data as UpdateItem[]) ?? []);
          break;

        case 'market:installProgress':
          store.setInstallProgress(data as Parameters<typeof store.setInstallProgress>[0]);
          break;

        case 'market:installResult': {
          const result = data as { success: boolean; error?: string };
          if (result.success) {
            logger.info('Install succeeded, refreshing lists');
            MarketMessages.listInstalled();
            MarketMessages.checkUpdates();
          } else if (result.error) {
            logger.warn('Install failed', result.error);
            store.setError({ i18nKey: 'marketplace.error.installFailed', message: result.error });
          }
          break;
        }

        case 'market:uninstallResult':
          // installedResult is pushed automatically by handler after uninstall
          break;

        case 'market:filterByType': {
          const filter = data as string as ReturnType<typeof store.assetTypeFilter.toString>;
          store.setActiveTab('browse');
          store.setAssetTypeFilter(filter as Parameters<typeof store.setAssetTypeFilter>[0]);
          break;
        }

        case 'market:error': {
          const errorMsg = event.data.error ?? 'Unknown error';
          logger.error('Extension reported error', errorMsg);
          store.setSearching(false);
          store.setError({ i18nKey: 'marketplace.error.loadFailed', message: errorMsg });
          break;
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ---------------------------------------------------------------------------
  // Init & message subscription
  // ---------------------------------------------------------------------------

  useEffect(() => {
    window.addEventListener('message', handleMessage);

    // Signal ready so extension can flush pending messages
    MarketMessages.ready();

    // Initial data load
    MarketMessages.getFeatured();
    MarketMessages.listInstalled();
    MarketMessages.checkUpdates();

    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const { activeTab, updates, error } = store;

  return (
    <div className="marketplace-app">
      {/* Header */}
      <div className="marketplace-header">
        <SearchBar />
      </div>

      {/* Error banner */}
      {error && (
        <div
          className="flex items-center justify-between px-3 py-1.5 text-xs"
          style={{
            background: 'var(--vscode-inputValidation-errorBackground, #5a1d1d)',
            color: 'var(--vscode-inputValidation-errorForeground, #f48771)',
          }}
          role="alert"
        >
          <span>{t(error.i18nKey, error.message ? { message: error.message } : undefined)}</span>
          <button
            onClick={() => store.setError(null)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'inherit',
              opacity: 0.7,
            }}
            aria-label="Dismiss"
          >
            <span className="codicon codicon-close" />
          </button>
        </div>
      )}

      {/* Tab bar */}
      <div className="tab-bar" role="tablist">
        {TABS.map(({ key, labelKey, icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={activeTab === key}
            className={`tab-btn ${activeTab === key ? 'tab-btn--active' : ''}`}
            onClick={() => store.setActiveTab(key)}
          >
            <span className={`codicon ${icon}`} />
            <span className="tab-btn__label">{t(labelKey)}</span>
            {key === 'updates' && updates.length > 0 && (
              <span className="badge">{updates.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="marketplace-content">
        {activeTab === 'browse' && <BrowseView />}
        {activeTab === 'installed' && <InstalledView />}
        {activeTab === 'updates' && <UpdatesView />}
      </div>
    </div>
  );
};
