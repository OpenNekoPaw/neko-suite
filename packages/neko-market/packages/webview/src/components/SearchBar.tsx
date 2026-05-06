/**
 * SearchBar — Search input for Browse.
 */

import React, { useCallback, useRef } from 'react';
import { useMarketplaceStore } from '../stores/marketplaceStore';
import { MarketMessages } from '../messages';
import { useTranslation } from '../i18n/I18nContext';

export const SearchBar: React.FC = () => {
  const { searchText, buildBrowseQuery, setSearchText, setSearching } = useMarketplaceStore();
  const { t } = useTranslation();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const text = e.target.value;
      setSearchText(text);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setSearching(true);
        MarketMessages.search(buildBrowseQuery());
      }, 300);
    },
    [buildBrowseQuery, setSearchText, setSearching],
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
              setSearching(true);
              MarketMessages.search(buildBrowseQuery());
            }}
          >
            <span className="codicon codicon-close" />
          </button>
        )}
      </div>
    </div>
  );
};
