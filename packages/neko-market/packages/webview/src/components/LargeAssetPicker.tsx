/**
 * LargeAssetPicker — state surface for variant, sparse, proxy, and delta controls.
 */

import React, { useEffect } from 'react';
import { Badge, Button, IconButton, Progress } from '@neko/ui/primitives';
import { toCodiconClassName } from '@neko/ui/icons';
import { useMarketplaceStore, type LargeAssetPickerState } from '../stores/marketplaceStore';
import { MarketMessages } from '../messages';
import { useTranslation } from '../i18n/I18nContext';

export const LargeAssetPicker: React.FC = () => {
  const {
    clearInstallProgress,
    closeLargeAssetPicker,
    installProgress,
    largeAssetPicker,
    updateLargeAssetPicker,
  } = useMarketplaceStore();
  const { t } = useTranslation();

  useEffect(() => {
    if (
      !largeAssetPicker?.isOpen ||
      largeAssetPicker.mode !== 'variant' ||
      largeAssetPicker.selectedVariantId ||
      !largeAssetPicker.variants?.length
    ) {
      return;
    }

    const selected =
      largeAssetPicker.variants.find((variant) => variant.recommended) ??
      largeAssetPicker.variants[0];
    if (!selected) return;
    updateLargeAssetPicker({
      selectedVariantId: selected.variantId,
      selectedSize: selected.size,
    });
  }, [
    largeAssetPicker?.isOpen,
    largeAssetPicker?.mode,
    largeAssetPicker?.selectedVariantId,
    largeAssetPicker?.variants,
    updateLargeAssetPicker,
  ]);

  if (!largeAssetPicker?.isOpen) return null;

  const selectedSize = getSelectedSize(largeAssetPicker);
  const totalSize = largeAssetPicker.totalSize ?? selectedSize;
  const progress = installProgress.get(largeAssetPicker.packageId);

  const setSparseSelection = (mode: 'all' | 'recommended' | 'clear'): void => {
    const items = largeAssetPicker.sparseItems ?? [];
    const selectedItems =
      mode === 'all'
        ? items.map((item) => item.itemId)
        : mode === 'recommended'
          ? items.filter((item) => item.defaultSelected).map((item) => item.itemId)
          : [];
    updateLargeAssetPicker({
      selectedItems,
      selectedSize: sumSparseItems(items, selectedItems),
    });
  };

  const toggleSparseItem = (itemId: string): void => {
    const current = largeAssetPicker.selectedItems;
    const selectedItems = current.includes(itemId)
      ? current.filter((entry) => entry !== itemId)
      : [...current, itemId];
    updateLargeAssetPicker({
      selectedItems,
      selectedSize: sumSparseItems(largeAssetPicker.sparseItems, selectedItems),
    });
  };

  return (
    <div
      className="large-asset-panel"
      role="dialog"
      aria-label={t('marketplace.largeAsset.choose')}
    >
      <div className="detail-panel__header">
        <div>
          <h2 className="detail-panel__title">{t('marketplace.largeAsset.choose')}</h2>
          <span className="detail-panel__meta">{largeAssetPicker.packageId}</span>
        </div>
        <IconButton
          className="search-clear"
          label={t('marketplace.action.dismiss')}
          icon={<span className={toCodiconClassName('close')} />}
          onClick={closeLargeAssetPicker}
        />
      </div>

      <div className="large-asset-panel__body">
        <Badge className="status-badge h-auto px-1.5 py-0.5">{largeAssetPicker.mode}</Badge>
        {totalSize !== undefined && (
          <span className="owned-item__meta">
            {formatBytes(selectedSize ?? totalSize)} / {formatBytes(totalSize)}
          </span>
        )}
        {!largeAssetPicker.isSupported && (
          <Badge className="status-badge status-badge--blocked h-auto px-1.5 py-0.5" tone="danger">
            {t('marketplace.largeAsset.unsupported')}
          </Badge>
        )}
      </div>

      {largeAssetPicker.mode === 'variant' && largeAssetPicker.variants && (
        <div className="large-asset-table" role="table">
          <div className="large-asset-table__row large-asset-table__row--header" role="row">
            <span>{t('marketplace.largeAsset.variant')}</span>
            <span>{t('marketplace.largeAsset.size')}</span>
            <span>{t('marketplace.largeAsset.minVram')}</span>
            <span />
          </div>
          {largeAssetPicker.variants.map((variant) => (
            <button
              key={variant.variantId}
              className={`large-asset-table__row large-asset-table__row--button ${
                largeAssetPicker.selectedVariantId === variant.variantId
                  ? 'large-asset-option--selected'
                  : ''
              }`}
              onClick={() =>
                updateLargeAssetPicker({
                  selectedVariantId: variant.variantId,
                  selectedSize: variant.size,
                })
              }
            >
              <span>{variant.variantId}</span>
              <span className="owned-item__meta">{formatBytes(variant.size)}</span>
              <span className="owned-item__meta">
                {variant.minVram ? `${variant.minVram} MB` : '-'}
              </span>
              {variant.recommended ? (
                <Badge className="status-badge h-auto px-1.5 py-0.5">
                  {t('marketplace.largeAsset.recommended')}
                </Badge>
              ) : (
                <span />
              )}
            </button>
          ))}
        </div>
      )}

      {largeAssetPicker.mode === 'sparse' && largeAssetPicker.sparseItems && (
        <div className="large-asset-options">
          <div className="large-asset-toolbar">
            <Button
              className="type-chip"
              size="xs"
              variant="secondary"
              onClick={() => setSparseSelection('all')}
            >
              {t('marketplace.largeAsset.selectAll')}
            </Button>
            <Button
              className="type-chip"
              size="xs"
              variant="secondary"
              onClick={() => setSparseSelection('recommended')}
            >
              {t('marketplace.largeAsset.selectRecommended')}
            </Button>
            <Button
              className="type-chip"
              size="xs"
              variant="ghost"
              onClick={() => setSparseSelection('clear')}
            >
              {t('marketplace.largeAsset.clear')}
            </Button>
          </div>
          {largeAssetPicker.sparseItems.map((item) => {
            const selected = largeAssetPicker.selectedItems.includes(item.itemId);
            return (
              <button
                key={item.itemId}
                className={`large-asset-option large-asset-option--button ${
                  selected ? 'large-asset-option--selected' : ''
                }`}
                onClick={() => toggleSparseItem(item.itemId)}
              >
                <span>{item.name}</span>
                <span className="owned-item__meta">{formatBytes(item.size)}</span>
                {item.defaultSelected && (
                  <Badge className="status-badge h-auto px-1.5 py-0.5">
                    {t('marketplace.largeAsset.default')}
                  </Badge>
                )}
              </button>
            );
          })}
          <span className="owned-item__meta">
            {t('marketplace.largeAsset.selectedCount', {
              count: String(largeAssetPicker.selectedItems.length),
            })}
          </span>
        </div>
      )}

      {largeAssetPicker.mode === 'proxy' && largeAssetPicker.proxyVariants && (
        <div className="large-asset-options">
          {progress && (
            <div className="large-asset-progress">
              <Progress
                className="large-asset-progress__bar"
                label={progress.phase}
                value={progress.percent}
              />
              <span className="owned-item__meta">
                {progress.phase} · {progress.percent}%
              </span>
              <Button
                className="type-chip"
                size="xs"
                variant="secondary"
                onClick={() => {
                  MarketMessages.cancelInstall(largeAssetPicker.packageId);
                  clearInstallProgress(largeAssetPicker.packageId);
                }}
              >
                {t('marketplace.largeAsset.cancel')}
              </Button>
            </div>
          )}
          {largeAssetPicker.proxyVariants.map((variant) => (
            <div
              key={variant.qualityTag}
              className={`large-asset-option ${variant.default ? 'large-asset-option--selected' : ''}`}
            >
              <span>{variant.qualityTag}</span>
              <span className="owned-item__meta">{formatBytes(variant.size)}</span>
              {variant.default && (
                <Badge className="status-badge h-auto px-1.5 py-0.5">
                  {t('marketplace.largeAsset.default')}
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

function getSelectedSize(picker: LargeAssetPickerState): number | undefined {
  if (picker.mode === 'variant') {
    return (
      picker.variants?.find((variant) => variant.variantId === picker.selectedVariantId)?.size ??
      picker.selectedSize
    );
  }
  if (picker.mode === 'sparse') {
    return sumSparseItems(picker.sparseItems, picker.selectedItems);
  }
  return picker.selectedSize;
}

function sumSparseItems(
  items: LargeAssetPickerState['sparseItems'],
  selectedItems: readonly string[],
): number {
  const selected = new Set(selectedItems);
  return (items ?? []).reduce(
    (total, item) => (selected.has(item.itemId) ? total + item.size : total),
    0,
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}
