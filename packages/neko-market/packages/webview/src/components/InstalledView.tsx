/**
 * InstalledView — List of installed packages with enable/disable toggle and uninstall action.
 */

import React, { useCallback } from 'react';
import {
  useMarketplaceStore,
  type GovernanceWarning,
  type InstalledItem,
} from '../stores/marketplaceStore';
import { MarketMessages } from '../messages';
import { useTranslation } from '../i18n/I18nContext';

export const InstalledView: React.FC = () => {
  const { governance, installed, localInstallDraft } = useMarketplaceStore();
  const { t } = useTranslation();

  const handleToggleEnabled = useCallback((packageId: string, currentEnabled: boolean) => {
    if (currentEnabled) {
      MarketMessages.disable(packageId);
    } else {
      MarketMessages.enable(packageId);
    }
  }, []);

  return (
    <div className="installed-view">
      <section className="management-strip" aria-label="Marketplace governance">
        <div className="management-strip__group">
          <span className={developerModeClass(governance.developerMode.active)}>
            {governance.developerMode.active
              ? t('marketplace.developerMode.active')
              : t('marketplace.developerMode.inactive')}
          </span>
          {governance.developerMode.expiresAt && (
            <span className="management-strip__meta">
              {t('marketplace.developerMode.expires', {
                time: new Date(governance.developerMode.expiresAt).toLocaleString(),
              })}
            </span>
          )}
          <button
            className="asset-action-btn asset-action-btn--secondary"
            onClick={() =>
              MarketMessages.setDeveloperMode({
                enabled: !governance.developerMode.active,
                riskAccepted: !governance.developerMode.active,
              })
            }
          >
            {governance.developerMode.active
              ? t('marketplace.developerMode.disable')
              : t('marketplace.developerMode.enable')}
          </button>
        </div>
        <div className="management-strip__group">
          <span className={workspaceTrustClass(governance.workspaceTrust.level)}>
            {t(`marketplace.workspaceTrust.${governance.workspaceTrust.level}`)}
          </span>
          {governance.workspaceTrust.canPromote && (
            <button
              className="asset-action-btn asset-action-btn--secondary"
              onClick={() => MarketMessages.promoteWorkspaceTrust()}
            >
              {t('marketplace.workspaceTrust.promote')}
            </button>
          )}
        </div>
        <div className="management-strip__group management-strip__group--end">
          <button
            className="asset-action-btn asset-action-btn--primary"
            onClick={() => MarketMessages.requestLocalInstall('copy-managed')}
          >
            {t('marketplace.localInstall.copy')}
          </button>
          <button
            className="asset-action-btn asset-action-btn--secondary"
            onClick={() => MarketMessages.requestLocalInstall('local-link')}
          >
            {t('marketplace.localInstall.link')}
          </button>
        </div>
      </section>

      {localInstallDraft && (
        <section className="local-install-confirm">
          <div className="local-install-confirm__body">
            <span className="installed-item__id">{localInstallDraft.assetName}</span>
            <span className="installed-item__type">
              {localInstallDraft.assetType} ·{' '}
              {t(`marketplace.localInstall.mode.${localInstallDraft.storageMode}`)}
            </span>
            <span className="installed-item__dependency">{localInstallDraft.sourcePathLabel}</span>
            <WarningList warnings={localInstallDraft.warnings} />
          </div>
          <div className="installed-item__actions">
            <button
              className="asset-action-btn asset-action-btn--primary"
              onClick={() =>
                MarketMessages.confirmLocalInstall({
                  draftId: localInstallDraft.draftId,
                  storageMode: localInstallDraft.storageMode,
                })
              }
            >
              {t('marketplace.localInstall.confirm')}
            </button>
            <button
              className="asset-action-btn asset-action-btn--secondary"
              onClick={() => MarketMessages.cancelLocalInstall(localInstallDraft.draftId)}
            >
              {t('marketplace.largeAsset.cancel')}
            </button>
          </div>
        </section>
      )}

      {installed.length === 0 ? (
        <div className="empty-state">
          <span className="codicon codicon-inbox empty-state__icon" />
          <p className="empty-state__text">{t('marketplace.installed.empty')}</p>
          <p className="empty-state__hint">{t('marketplace.installed.hint')}</p>
        </div>
      ) : (
        groupInstalled(installed).map(([category, items]) => (
          <section key={category} className="installed-group">
            <h3 className="section-title">
              {t(`marketplace.category.${category}`)} ({items.length})
            </h3>
            <div className="installed-list">
              {items.map((item) => (
                <div
                  key={item.packageId}
                  className={`installed-item${!item.enabled ? ' installed-item--disabled' : ''}`}
                >
                  <div className="installed-item__info">
                    <span className="installed-item__id">{item.packageId}</span>
                    <span className="installed-item__version">v{item.version}</span>
                    <span className="installed-item__type">
                      {item.type}
                      {item.kind ? ` · ${item.kind}` : ''}
                    </span>
                    <div className="status-row">
                      {!item.enabled && (
                        <span className="status-badge">{t('marketplace.installed.disabled')}</span>
                      )}
                      <span className={statusClass(item.status ?? 'active')}>
                        {t(`marketplace.status.${item.status ?? 'active'}`)}
                      </span>
                      {isLocalItem(item) && (
                        <span className="status-badge status-badge--local">
                          {t('marketplace.installed.local')}
                        </span>
                      )}
                      {item.largeAsset && (
                        <span className="status-badge">
                          {t(`marketplace.largeAsset.state.${item.largeAsset.state}`)}
                        </span>
                      )}
                    </div>
                    <WarningList warnings={item.governanceWarnings ?? []} />
                    {item.refs && Object.keys(item.refs).length > 0 && (
                      <span className="installed-item__dependency">
                        {t('marketplace.installed.dependencies', {
                          count: String(Object.keys(item.refs).length),
                        })}
                      </span>
                    )}
                  </div>
                  <div className="installed-item__actions">
                    <button
                      className="asset-action-btn asset-action-btn--ghost"
                      onClick={() => handleToggleEnabled(item.packageId, item.enabled)}
                      title={
                        item.enabled
                          ? t('marketplace.action.disable')
                          : t('marketplace.action.enable')
                      }
                    >
                      <span
                        className={`codicon ${item.enabled ? 'codicon-eye' : 'codicon-eye-closed'}`}
                      />
                    </button>
                    {!isLocalItem(item) && (
                      <button
                        className="asset-action-btn asset-action-btn--secondary"
                        onClick={() => MarketMessages.getPackage(item.packageId)}
                      >
                        {t('marketplace.action.detail')}
                      </button>
                    )}
                    {isLocalItem(item) && (
                      <button
                        className="asset-action-btn asset-action-btn--secondary"
                        onClick={() => MarketMessages.revealLocal(item.packageId)}
                      >
                        {t('marketplace.action.reveal')}
                      </button>
                    )}
                    <button
                      className="asset-action-btn asset-action-btn--secondary"
                      onClick={() => MarketMessages.uninstall(item.packageId)}
                    >
                      {t('marketplace.action.uninstall')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
};

function groupInstalled(items: InstalledItem[]): Array<[string, InstalledItem[]]> {
  const groups = new Map<string, InstalledItem[]>();
  for (const item of items) {
    const category = item.category ?? 'tooling';
    groups.set(category, [...(groups.get(category) ?? []), item]);
  }
  return Array.from(groups.entries());
}

function statusClass(status: NonNullable<InstalledItem['status']>): string {
  if (status === 'expired' || status === 'incompatible')
    return 'status-badge status-badge--blocked';
  if (status === 'expiring-soon' || status === 'deprecated')
    return 'status-badge status-badge--warning';
  return 'status-badge status-badge--active';
}

function isLocalItem(item: InstalledItem): boolean {
  return item.sourceKind === 'local' || item.sourceKind === 'local-link';
}

function developerModeClass(active: boolean): string {
  return active ? 'status-badge status-badge--warning' : 'status-badge';
}

function workspaceTrustClass(level: string): string {
  if (level === 'trusted') return 'status-badge status-badge--active';
  if (level === 'limited') return 'status-badge status-badge--blocked';
  return 'status-badge status-badge--warning';
}

const warningKeyByCode: Record<GovernanceWarning['code'], string> = {
  'native-plugin': 'marketplace.sideloadWarning.plugin',
  'shader-validation': 'marketplace.sideloadWarning.shader',
  'model-resource': 'marketplace.sideloadWarning.model',
  'local-source': 'marketplace.sideloadWarning.local',
  'workspace-trust': 'marketplace.sideloadWarning.workspace',
  'developer-mode': 'marketplace.sideloadWarning.developerMode',
};

const warningClassBySeverity: Record<GovernanceWarning['severity'], string> = {
  info: 'status-badge',
  warning: 'status-badge status-badge--warning',
  blocked: 'status-badge status-badge--blocked',
};

const WarningList: React.FC<{ warnings: GovernanceWarning[] }> = ({ warnings }) => {
  const { t } = useTranslation();
  if (warnings.length === 0) return null;
  return (
    <div className="status-row">
      {warnings.map((warning, index) => (
        <span key={`${warning.code}-${index}`} className={warningClassBySeverity[warning.severity]}>
          {warning.message ?? t(warningKeyByCode[warning.code])}
        </span>
      ))}
    </div>
  );
};
