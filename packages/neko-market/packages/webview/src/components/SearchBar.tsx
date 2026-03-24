/**
 * SearchBar — Search input with asset type filter chips.
 */

import React, { useCallback, useRef } from 'react';
import { useMarketplaceStore, type AssetTypeFilter } from '../stores/marketplaceStore';
import { MarketMessages } from '../messages';

const TYPE_FILTERS: { key: AssetTypeFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'skill', label: 'Skills' },
  { key: 'shader', label: 'Shaders' },
  { key: 'model', label: 'Models' },
  { key: 'preset', label: 'Presets' },
];

export const SearchBar: React.FC = () => {
  const { searchText, assetTypeFilter, setSearchText, setSearching, setAssetTypeFilter } =
    useMarketplaceStore();

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
          placeholder="Search marketplace…"
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
        {TYPE_FILTERS.map(({ key, label }) => (
          <button
            key={key}
            className={`type-chip ${assetTypeFilter === key ? 'type-chip--active' : ''}`}
            onClick={() => handleTypeChange(key)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
};
