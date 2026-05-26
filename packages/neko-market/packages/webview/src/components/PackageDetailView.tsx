/**
 * PackageDetailView — primary action state and large asset entry point.
 */

import React from 'react';
import { Button, IconButton } from '@neko/ui/primitives';
import { toCodiconClassName } from '@neko/ui/icons';
import { useMarketplaceStore, type MarketItem } from '../stores/marketplaceStore';
import { MarketMessages } from '../messages';
import { useTranslation } from '../i18n/I18nContext';

export const PackageDetailView: React.FC = () => {
  const { selectedPackage, setSelectedPackage, openLargeAssetPicker } = useMarketplaceStore();
  const { t } = useTranslation();

  if (!selectedPackage) return null;

  const action = getPrimaryAction(selectedPackage);
  const hasLargeAsset = selectedPackage.largeAsset !== undefined;
  const largeAsset = selectedPackage.largeAsset;
  const pickerMode = largeAsset?.modes.includes('variant')
    ? 'variant'
    : largeAsset?.modes.includes('sparse')
      ? 'sparse'
      : largeAsset?.modes.includes('proxy')
        ? 'proxy'
        : 'delta';
  const selectedVariant =
    largeAsset?.variants?.find((variant) => variant.recommended) ?? largeAsset?.variants?.[0];
  const selectedItems =
    largeAsset?.sparseItems?.filter((item) => item.defaultSelected).map((item) => item.itemId) ??
    [];
  const defaultProxy =
    largeAsset?.proxyVariants?.find((variant) => variant.default) ?? largeAsset?.proxyVariants?.[0];

  return (
    <div className="detail-panel" role="dialog" aria-label={selectedPackage.name}>
      <div className="detail-panel__header">
        <div>
          <h2 className="detail-panel__title">{selectedPackage.name}</h2>
          <span className="detail-panel__meta">
            {selectedPackage.type}
            {selectedPackage.kind ? ` · ${selectedPackage.kind}` : ''}
          </span>
        </div>
        <IconButton
          className="search-clear"
          label={t('marketplace.action.dismiss')}
          icon={<span className={toCodiconClassName('close')} />}
          onClick={() => setSelectedPackage(null)}
        />
      </div>

      {selectedPackage.description && (
        <p className="detail-panel__description">{selectedPackage.description}</p>
      )}

      <div className="detail-panel__actions">
        <Button
          className="asset-action-btn"
          size="xs"
          variant={action.variant === 'primary' ? 'default' : 'secondary'}
          disabled={action.disabled}
          onClick={() => action.run(selectedPackage)}
        >
          {t(action.labelKey)}
        </Button>
        {hasLargeAsset && (
          <Button
            className="asset-action-btn"
            size="xs"
            variant="secondary"
            onClick={() =>
              openLargeAssetPicker({
                packageId: selectedPackage.id,
                mode: pickerMode,
                variants: largeAsset?.variants,
                sparseItems: largeAsset?.sparseItems,
                proxyVariants: largeAsset?.proxyVariants,
                selectedVariantId: selectedVariant?.variantId,
                selectedItems,
                totalSize: largeAsset?.totalSize,
                selectedSize: selectedVariant?.size ?? defaultProxy?.size,
                isSupported: true,
                isOpen: true,
              })
            }
          >
            {t('marketplace.largeAsset.choose')}
          </Button>
        )}
      </div>
    </div>
  );
};

function getPrimaryAction(item: MarketItem): {
  labelKey: string;
  variant: 'primary' | 'secondary';
  disabled: boolean;
  run(item: MarketItem): void;
} {
  if (item.status === 'expired') {
    return {
      labelKey: 'marketplace.action.renew',
      variant: 'primary',
      disabled: false,
      run: (pkg) => MarketMessages.checkout(pkg.id, 'renew'),
    };
  }

  if (item.installState === 'installed') {
    return {
      labelKey: 'marketplace.action.installed',
      variant: 'secondary',
      disabled: true,
      run: () => {},
    };
  }

  if (item.pricing === 'paid' && item.entitlementState !== 'owned-not-installed') {
    return {
      labelKey: 'marketplace.action.buy',
      variant: 'primary',
      disabled: false,
      run: (pkg) => MarketMessages.checkout(pkg.id),
    };
  }

  return {
    labelKey:
      item.installState === 'update-available'
        ? 'marketplace.action.update'
        : 'marketplace.action.install',
    variant: 'primary',
    disabled: false,
    run: (pkg) => MarketMessages.install(pkg.id, pkg.version),
  };
}
