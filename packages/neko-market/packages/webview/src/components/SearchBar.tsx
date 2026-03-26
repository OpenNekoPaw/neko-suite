/**
 * SearchBar — Search input with asset type filter chips.
 */

import React, { useCallback, useRef } from 'react';
import { useMarketplaceStore, type AssetTypeFilter } from '../stores/marketplaceStore';
import { MarketMessages } from '../messages';
import { useTranslation } from '../i18n/I18nContext';

const TYPE_FILTER_KEYS: { key: AssetTypeFilter; i18nKey: string }[] = [
  { key: 'all', i18nKey: 'marketplace.filter.all' },
  { key: 'skill', i18nKey: 'marketplace.filter.skill' },
  { key: 'shader', i18nKey: 'marketplace.filter.shader' },
  { key: 'model', i18nKey: 'marketplace.filter.model' },
  { key: 'preset', i18nKey: 'marketplace.filter.preset' },
];

export const SearchBar: React.FC = () => {
  const { searchText, assetTypeFilter, setSearchText, setSearching, setAssetTypeFilter } =
    useMarketplaceStore();
  const { t } = useTranslation();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const text = e.target.value;
      setSearchText(text);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setSearching(true);
        MarketMessages.search({
          text: text || undefined,
          types: assetTypeFilter !== 'all' ? [assetTypeFilter] : undefined,
        });
      }, 300);
    },
    [assetTypeFilter, setSearchText, setSearching],
  );

  const handleTypeChange = useCallback(
    (filter: AssetTypeFilter) => {
      setAssetTypeFilter(filter);
      setSearching(true);
      MarketMessages.search({
        text: searchText || undefined,
        types: filter !== 'all' ? [filter] : undefined,
      });
    },
    [searchText, setAssetTypeFilter, setSearching],
  );

  return (
    <div className="search-bar">
      <div className="search-input-wrapper">
        <span className="search-icon codicon codicon-search" />
        <input
          className="search-input"
          type="text"
          placeholder={t('marketplace.search.placeholder')}
          value={searchText}
          onChange={handleInput}
        />
        {searchText && (
          <button
            className="search-clear"
            onClick={() => {
              setSearchText('');
              MarketMessages.getFeatured(assetTypeFilter !== 'all' ? assetTypeFilter : undefined);
            }}
          >
            <span className="codicon codicon-close" />
          </button>
        )}
      </div>

      <div className="type-filters">
        {TYPE_FILTER_KEYS.map(({ key, i18nKey }) => (
          <button
            key={key}
            className={`type-chip ${assetTypeFilter === key ? 'type-chip--active' : ''}`}
            onClick={() => handleTypeChange(key)}
          >
            {t(i18nKey)}
          </button>
        ))}
      </div>
    </div>
  );
};
