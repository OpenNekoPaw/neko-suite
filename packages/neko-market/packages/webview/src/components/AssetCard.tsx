/**
 * AssetCard — Unified card component for marketplace items.
 *
 * Handles install/uninstall/update actions and shows install progress.
 */

import React, { useCallback } from 'react';
import { Badge, Button, Progress } from '@neko/ui/primitives';
import { toCodiconClassName, type CodiconName } from '@neko/ui/icons';
import { useMarketplaceStore, type MarketItem } from '../stores/marketplaceStore';
import { MarketMessages } from '../messages';
import { useTranslation } from '../i18n/I18nContext';

interface AssetCardProps {
  item: MarketItem;
}

const TYPE_ICONS: Record<string, CodiconName> = {
  skill: 'symbol-misc',
  shader: 'symbol-color',
  model: 'symbol-namespace',
  preset: 'gear',
};

export const AssetCard: React.FC<AssetCardProps> = ({ item }) => {
  const { installProgress, setSelectedPackage } = useMarketplaceStore();
  const { t } = useTranslation();
  const progress = installProgress.get(item.id);
  const isInstalling = progress !== undefined;

  const handleAction = useCallback(() => {
    if (isInstalling) return;

    if (item.installState === 'not-installed') {
      MarketMessages.install(item.id, item.version);
    } else if (item.installState === 'update-available') {
      MarketMessages.install(item.id, item.version);
    } else {
      MarketMessages.uninstall(item.id);
    }
  }, [item, isInstalling]);

  const actionLabel = isInstalling
    ? `${progress.percent}%`
    : item.installState === 'not-installed'
      ? t('marketplace.action.install')
      : item.installState === 'update-available'
        ? t('marketplace.action.update')
        : t('marketplace.action.uninstall');

  const actionVariant = item.installState === 'installed' ? 'secondary' : 'default';

  const iconName = TYPE_ICONS[item.type] ?? 'package';

  return (
    <div className="asset-card">
      {/* Thumbnail / Icon */}
      <div className="asset-card__icon">
        {item.thumbnail ? (
          <img src={item.thumbnail} alt={item.name} className="asset-card__thumbnail" />
        ) : (
          <span className={`${toCodiconClassName(iconName)} asset-card__type-icon`} />
        )}
      </div>

      {/* Content */}
      <div className="asset-card__content">
        <div className="asset-card__header">
          <Button
            className="asset-card__name asset-card__name-btn"
            size="xs"
            variant="ghost"
            onClick={() => setSelectedPackage(item)}
          >
            {item.name}
          </Button>
          <span className="asset-card__version">v{item.version}</span>
        </div>

        {item.author && <span className="asset-card__author">{item.author}</span>}

        {item.description && <p className="asset-card__description">{item.description}</p>}

        {item.tags && item.tags.length > 0 && (
          <div className="asset-card__tags">
            {item.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} className="tag-chip h-auto px-1.5 py-0.5">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <div className="asset-card__footer">
          {item.downloadCount !== undefined && (
            <span className="asset-card__meta">
              <span className={toCodiconClassName('cloud-download')} />
              {item.downloadCount.toLocaleString()}
            </span>
          )}

          {/* Progress bar during install */}
          {isInstalling && (
            <div className="install-progress">
              <Progress
                className="install-progress__bar"
                label={progress.phase}
                value={progress.percent}
              />
              <span className="install-progress__phase">{progress.phase}</span>
            </div>
          )}

          <Button
            className="asset-action-btn"
            size="xs"
            variant={actionVariant}
            onClick={handleAction}
            disabled={isInstalling}
          >
            {actionLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};
