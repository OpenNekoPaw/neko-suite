/**
 * BrowseFilters — AssetCategory → AssetType → kind filtering for Browse.
 */

import React from 'react';
import {
  buildBrowseQueryFromState,
  useMarketplaceStore,
  type BrowseFilters as BrowseFilterState,
} from '../stores/marketplaceStore';
import {
  MarketMessages,
  type AssetCategory,
  type AssetType,
  type MarketPricing,
  type MarketSort,
} from '../messages';
import { useTranslation } from '../i18n/I18nContext';

const CATEGORY_OPTIONS: Array<{ key: BrowseFilterState['category']; i18nKey: string }> = [
  { key: 'all', i18nKey: 'marketplace.filter.all' },
  { key: 'media', i18nKey: 'marketplace.category.media' },
  { key: 'ai', i18nKey: 'marketplace.category.ai' },
  { key: 'tooling', i18nKey: 'marketplace.category.tooling' },
  { key: 'bundle', i18nKey: 'marketplace.category.bundle' },
];

const TYPES_BY_CATEGORY: Record<AssetCategory, AssetType[]> = {
  media: ['media', 'starter', 'identity'],
  ai: ['model', 'endpoint', 'provider'],
  tooling: ['skill', 'plugin', 'shader', 'preset'],
  bundle: ['bundle'],
};

const KIND_OPTIONS: Partial<Record<AssetType, string[]>> = {
  media: ['video', 'audio', 'image', 'sequence', '3d-model', 'puppet-motion', 'document'],
  model: ['base', 'lora', 'embedding'],
  shader: ['standalone', 'preset'],
  preset: [
    'lut',
    'transition',
    'effect',
    'export',
    'color',
    'memory',
    'theme',
    'keybinding',
    'convention',
  ],
  identity: ['character', 'location', 'object', 'style'],
};

const SORT_OPTIONS: Array<{ key: MarketSort; i18nKey: string }> = [
  { key: 'featured', i18nKey: 'marketplace.sort.recommended' },
  { key: 'created', i18nKey: 'marketplace.sort.latest' },
  { key: 'trending', i18nKey: 'marketplace.sort.trending' },
  { key: 'downloads', i18nKey: 'marketplace.sort.downloads' },
];

const PRICING_OPTIONS: Array<{ key: MarketPricing; i18nKey: string }> = [
  { key: 'all', i18nKey: 'marketplace.filter.all' },
  { key: 'free', i18nKey: 'marketplace.pricing.free' },
  { key: 'paid', i18nKey: 'marketplace.pricing.paid' },
];

export const BrowseFilters: React.FC = () => {
  const { browseFilters, searchText, serverInfo, setBrowseFilters, setSearching } =
    useMarketplaceStore();
  const { t } = useTranslation();
  const availableTypes = getAvailableTypes(browseFilters.category);
  const selectedType = browseFilters.type !== 'all' ? browseFilters.type : undefined;
  const kindOptions = selectedType ? (KIND_OPTIONS[selectedType] ?? []) : [];
  const sortOptions = SORT_OPTIONS.filter((option) =>
    isSortSupported(option.key, serverInfo?.capabilities),
  );
  const pricingOptions = PRICING_OPTIONS.filter((option) =>
    isPricingSupported(option.key, serverInfo?.capabilities),
  );

  const runSearch = (next: Partial<BrowseFilterState>) => {
    setBrowseFilters(next);
    setSearching(true);
    const merged = { ...browseFilters, ...next };
    MarketMessages.search(buildBrowseQueryFromState(searchText, merged));
  };

  return (
    <div className="browse-filters">
      <SegmentedGroup label={t('marketplace.filter.category')}>
        {CATEGORY_OPTIONS.map(({ key, i18nKey }) => (
          <FilterButton
            key={key}
            active={browseFilters.category === key}
            onClick={() => runSearch({ category: key, type: 'all', kind: undefined })}
          >
            {t(i18nKey)}
          </FilterButton>
        ))}
      </SegmentedGroup>

      <SegmentedGroup label={t('marketplace.filter.type')}>
        <FilterButton
          active={browseFilters.type === 'all'}
          onClick={() => runSearch({ type: 'all', kind: undefined })}
        >
          {t('marketplace.filter.all')}
        </FilterButton>
        {availableTypes.map((type) => (
          <FilterButton
            key={type}
            active={browseFilters.type === type}
            onClick={() => runSearch({ type, kind: undefined })}
          >
            {t(`marketplace.filter.${type}`)}
          </FilterButton>
        ))}
      </SegmentedGroup>

      {kindOptions.length > 0 && (
        <SegmentedGroup label={t('marketplace.filter.kind')}>
          <FilterButton active={!browseFilters.kind} onClick={() => runSearch({ kind: undefined })}>
            {t('marketplace.filter.all')}
          </FilterButton>
          {kindOptions.map((kind) => (
            <FilterButton
              key={kind}
              active={browseFilters.kind === kind}
              onClick={() => runSearch({ kind })}
            >
              {kind}
            </FilterButton>
          ))}
        </SegmentedGroup>
      )}

      <SegmentedGroup label={t('marketplace.filter.sort')}>
        {sortOptions.map(({ key, i18nKey }) => (
          <FilterButton
            key={key}
            active={browseFilters.sort === key}
            onClick={() => runSearch({ sort: key })}
          >
            {t(i18nKey)}
          </FilterButton>
        ))}
      </SegmentedGroup>

      <SegmentedGroup label={t('marketplace.filter.pricing')}>
        {pricingOptions.map(({ key, i18nKey }) => (
          <FilterButton
            key={key}
            active={browseFilters.pricing === key}
            onClick={() => runSearch({ pricing: key })}
          >
            {t(i18nKey)}
          </FilterButton>
        ))}
      </SegmentedGroup>
    </div>
  );
};

function SegmentedGroup(props: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="filter-group" role="group" aria-label={props.label}>
      <span className="filter-group__label">{props.label}</span>
      <div className="filter-group__items">{props.children}</div>
    </div>
  );
}

function FilterButton(props: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      className={`type-chip ${props.active ? 'type-chip--active' : ''}`}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

function getAvailableTypes(category: BrowseFilterState['category']): AssetType[] {
  if (category === 'all') {
    return [
      ...TYPES_BY_CATEGORY.media,
      ...TYPES_BY_CATEGORY.ai,
      ...TYPES_BY_CATEGORY.tooling,
      ...TYPES_BY_CATEGORY.bundle,
    ];
  }
  return TYPES_BY_CATEGORY[category];
}

function isSortSupported(sort: MarketSort, capabilities: string[] | undefined): boolean {
  if (sort === 'featured' || sort === 'created') return true;
  if (!capabilities) return true;
  return capabilities.includes(`search.sort.${sort}`) || capabilities.includes(`search.${sort}`);
}

function isPricingSupported(pricing: MarketPricing, capabilities: string[] | undefined): boolean {
  if (pricing === 'all') return true;
  if (!capabilities) return true;
  return (
    capabilities.includes('search.pricing') || capabilities.includes(`search.pricing.${pricing}`)
  );
}
