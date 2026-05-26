/**
 * BrowseFilters — Compact dropdown-based filter bar for Browse.
 */

import React, { useCallback, useRef, useState } from 'react';
import { Button } from '@neko/ui/primitives';
import { toCodiconClassName } from '@neko/ui/icons';
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

  const runSearch = useCallback(
    (next: Partial<BrowseFilterState>) => {
      setBrowseFilters(next);
      setSearching(true);
      const merged = { ...browseFilters, ...next };
      MarketMessages.search(buildBrowseQueryFromState(searchText, merged));
    },
    [browseFilters, searchText, setBrowseFilters, setSearching],
  );

  const typeOptions: Array<{ key: string; label: string }> = [
    { key: 'all', label: t('marketplace.filter.all') },
    ...availableTypes.map((type) => ({ key: type, label: t(`marketplace.filter.${type}`) })),
  ];

  const kindDropdownOptions: Array<{ key: string; label: string }> = [
    { key: '', label: t('marketplace.filter.all') },
    ...kindOptions.map((kind) => ({ key: kind, label: kind })),
  ];

  return (
    <div className="browse-filters">
      <FilterDropdown
        label={t('marketplace.filter.category')}
        value={browseFilters.category}
        options={CATEGORY_OPTIONS.map(({ key, i18nKey }) => ({
          key,
          label: t(i18nKey),
        }))}
        onChange={(key) =>
          runSearch({
            category: key as BrowseFilterState['category'],
            type: 'all',
            kind: undefined,
          })
        }
      />

      <FilterDropdown
        label={t('marketplace.filter.type')}
        value={browseFilters.type}
        options={typeOptions}
        onChange={(key) => runSearch({ type: key as AssetType | 'all', kind: undefined })}
      />

      {kindOptions.length > 0 && (
        <FilterDropdown
          label={t('marketplace.filter.kind')}
          value={browseFilters.kind ?? ''}
          options={kindDropdownOptions}
          onChange={(key) => runSearch({ kind: key || undefined })}
        />
      )}

      <FilterDropdown
        label={t('marketplace.filter.sort')}
        value={browseFilters.sort}
        options={sortOptions.map(({ key, i18nKey }) => ({
          key,
          label: t(i18nKey),
        }))}
        onChange={(key) => runSearch({ sort: key as MarketSort })}
      />

      {pricingOptions.length > 1 && (
        <FilterDropdown
          label={t('marketplace.filter.pricing')}
          value={browseFilters.pricing}
          options={pricingOptions.map(({ key, i18nKey }) => ({
            key,
            label: t(i18nKey),
          }))}
          onChange={(key) => runSearch({ pricing: key as MarketPricing })}
        />
      )}
    </div>
  );
};

function FilterDropdown(props: {
  label: string;
  value: string;
  options: Array<{ key: string; label: string }>;
  onChange: (key: string) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedLabel =
    props.options.find((o) => o.key === props.value)?.label ?? props.options[0]?.label ?? '';

  const isDefault = props.value === props.options[0]?.key;

  const handleBlur = useCallback((e: React.FocusEvent) => {
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setOpen(false);
    }
  }, []);

  return (
    <div className="filter-dropdown" ref={containerRef} onBlur={handleBlur}>
      <Button
        className={`filter-dropdown__trigger${!isDefault ? ' filter-dropdown__trigger--active' : ''}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={props.label}
        size="xs"
        variant="secondary"
      >
        <span className="filter-dropdown__label">{props.label}</span>
        <span className="filter-dropdown__value">{selectedLabel}</span>
        <span className={`filter-dropdown__chevron ${toCodiconClassName('chevron-down')}`} />
      </Button>
      {open && (
        <div className="filter-dropdown__menu" role="listbox" aria-label={props.label}>
          {props.options.map(({ key, label }) => (
            <Button
              key={key}
              className={`filter-dropdown__item${key === props.value ? ' filter-dropdown__item--active' : ''}`}
              role="option"
              aria-selected={key === props.value}
              size="xs"
              variant="ghost"
              onClick={() => {
                props.onChange(key);
                setOpen(false);
              }}
            >
              {key === props.value && (
                <span className={`${toCodiconClassName('check')} filter-dropdown__check`} />
              )}
              {label}
            </Button>
          ))}
        </div>
      )}
    </div>
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
