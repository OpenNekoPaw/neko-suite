/**
 * SearchBar — Search input for Browse.
 */

import React, { useCallback, useRef } from 'react';
import { IconButton } from '@neko/ui/primitives';
import { toCodiconClassName } from '@neko/ui/icons';
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
        <span className={`search-icon ${toCodiconClassName('search')}`} />
        <input
          className="search-input"
          type="text"
          placeholder={t('marketplace.search.placeholder')}
          value={searchText}
          onChange={handleInput}
        />
        {searchText && (
          <IconButton
            className="search-clear"
            label={t('marketplace.search.clear')}
            icon={<span className={toCodiconClassName('close')} />}
            onClick={() => {
              setSearchText('');
              setSearching(true);
              MarketMessages.search(buildBrowseQuery());
            }}
          />
        )}
      </div>
    </div>
  );
};
