/**
 * MarketplaceHandler — Routes market:* messages from webview to MarketplaceService.
 *
 * Returns true if the message was handled, allowing provider to chain handlers.
 */

import type { ILogger } from '@neko/shared';
import { toBaseError } from '@neko/shared';
import type { MarketplaceService } from './MarketplaceService';
import type {
  Entitlement,
  MarketSearchQuery,
  MarketPackage,
  InstalledPackage,
} from '@neko/shared/types/asset/market';
import {
  ASSET_TYPES,
  CATEGORY_MAP,
  type AssetManifest,
  type AssetType,
  type LocalAssetStorageMode,
} from '@neko/shared/types/asset/manifest';

export interface WebviewMessage {
  type: string;
  [key: string]: unknown;
}

type PostMessageFn = (msg: unknown) => void;

type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

// =============================================================================
// DTO Mappers — flatten backend types to webview-friendly shapes
// =============================================================================

/** Flatten MarketPackage (nested manifest) → webview MarketItem */
function toMarketItem(pkg: MarketPackage): Record<string, unknown> {
  const m = pkg.manifest;
  const d = m.distribution;
  return {
    id: pkg.id,
    name: m.name,
    description: d?.description,
    author: d?.author,
    publisherId: d?.publisherId,
    version: m.version,
    type: m.type,
    category: CATEGORY_MAP[m.type],
    kind: getManifestKind(m),
    thumbnail: m.thumbnail,
    tags: d?.tags,
    downloadCount: pkg.downloadCount ?? d?.downloads,
    rating: d?.rating?.average,
    installState: pkg.installState,
    installedVersion: pkg.installedVersion,
    status: pkg.installState === 'installed' ? 'active' : undefined,
    largeAsset: m.largeAsset,
  };
}

/** Flatten InstalledPackage → webview InstalledItem */
function toInstalledItem(pkg: InstalledPackage): Record<string, unknown> {
  return {
    packageId: pkg.packageId,
    name: pkg.manifest?.name ?? pkg.packageId,
    version: pkg.version,
    type: pkg.type,
    category: CATEGORY_MAP[pkg.type],
    kind: getManifestKind(pkg.manifest),
    installedAt: new Date(pkg.installedAt).toISOString(),
    installedPath: pkg.installedPath,
    enabled: pkg.enabled,
    requested: pkg.requested,
    status: pkg.status ?? 'active',
    expiresAt: pkg.expiresAt,
    refs: pkg.refs,
    largeAsset: pkg.largeAsset,
    sourceKind: pkg.source?.kind,
    storageMode: pkg.source?.storageMode,
    localPath: pkg.source?.path,
    localOriginalPath: pkg.source?.originalPath,
    governanceWarnings: buildGovernanceWarnings(pkg),
  };
}

function buildGovernanceWarnings(pkg: InstalledPackage): Array<Record<string, unknown>> {
  if (pkg.source?.kind !== 'local' && pkg.source?.kind !== 'local-link') return [];

  const warnings: Array<Record<string, unknown>> = [{ code: 'local-source', severity: 'info' }];
  if (pkg.type === 'plugin') {
    warnings.push({ code: 'native-plugin', severity: 'warning' });
  }
  if (pkg.type === 'shader') {
    warnings.push({ code: 'shader-validation', severity: 'warning' });
  }
  if (pkg.type === 'model') {
    warnings.push({ code: 'model-resource', severity: 'warning' });
  }
  return warnings;
}

/** Project registry entitlements into webview Owned rows. */
function toOwnedItem(
  entitlement: Entitlement,
  installed: readonly InstalledPackage[],
): Record<string, unknown> {
  const record = installed.find((pkg) => pkg.packageId === entitlement.packageId);
  const now = Date.now();
  const expiringSoonMs = 7 * 24 * 60 * 60 * 1000;
  const state = entitlement.expiresAt
    ? entitlement.expiresAt <= now
      ? 'expired'
      : entitlement.expiresAt - now <= expiringSoonMs
        ? 'expiring'
        : record
          ? 'owned-installed'
          : 'owned-not-installed'
    : record
      ? 'owned-installed'
      : 'owned-not-installed';

  return {
    packageId: entitlement.packageId,
    name: record?.manifest?.name,
    version: record?.version,
    type: record?.type,
    grantedAt: entitlement.grantedAt,
    expiresAt: entitlement.expiresAt,
    source: entitlement.source,
    state,
    installedPackageId: record?.packageId,
  };
}

export class MarketplaceHandler {
  constructor(
    private readonly _service: MarketplaceService,
    private readonly _logger: ILogger,
  ) {}

  async handleMessage(message: unknown, postMessage: PostMessageFn): Promise<boolean> {
    if (!isRecord(message) || typeof message.type !== 'string') {
      this._postValidationError(postMessage, 'Invalid marketplace message');
      return true;
    }

    switch (message.type) {
      case 'market:search': {
        const parsed = parseSearchQuery(message['query']);
        if (!parsed.ok) return this._rejectInvalidMessage(parsed.error, postMessage);
        return this._handleSearch(parsed.value, postMessage);
      }

      case 'market:getFeatured': {
        const parsed = parseOptionalAssetType(message['assetType'], 'assetType');
        if (!parsed.ok) return this._rejectInvalidMessage(parsed.error, postMessage);
        return this._handleGetFeatured(parsed.value, postMessage);
      }

      case 'market:getPackage': {
        const parsed = parseRequiredString(message['packageId'], 'packageId');
        if (!parsed.ok) return this._rejectInvalidMessage(parsed.error, postMessage);
        return this._handleGetPackage(parsed.value, postMessage);
      }

      case 'market:getServerInfo':
        return this._handleGetServerInfo(postMessage);

      case 'market:getGovernanceState':
        return this._handleGetGovernanceState(postMessage);

      case 'market:install': {
        const packageId = parseRequiredString(message['packageId'], 'packageId');
        const version = parseRequiredString(message['version'], 'version');
        if (!packageId.ok) return this._rejectInvalidMessage(packageId.error, postMessage);
        if (!version.ok) return this._rejectInvalidMessage(version.error, postMessage);
        return this._handleInstall(packageId.value, version.value, postMessage);
      }

      case 'market:update': {
        const packageId = parseRequiredString(message['packageId'], 'packageId');
        const version = parseRequiredString(message['version'], 'version');
        if (!packageId.ok) return this._rejectInvalidMessage(packageId.error, postMessage);
        if (!version.ok) return this._rejectInvalidMessage(version.error, postMessage);
        return this._handleUpdate(packageId.value, version.value, postMessage);
      }

      case 'market:uninstall': {
        const parsed = parseRequiredString(message['packageId'], 'packageId');
        if (!parsed.ok) return this._rejectInvalidMessage(parsed.error, postMessage);
        return this._handleUninstall(parsed.value, postMessage);
      }

      case 'market:cancelInstall': {
        const parsed = parseRequiredString(message['packageId'], 'packageId');
        if (!parsed.ok) return this._rejectInvalidMessage(parsed.error, postMessage);
        return this._handleCancelInstall(parsed.value, postMessage);
      }

      case 'market:listInstalled':
        return this._handleListInstalled(postMessage);

      case 'market:listEntitlements':
        return this._handleListEntitlements(postMessage);

      case 'market:checkUpdates':
        return this._handleCheckUpdates(postMessage);

      case 'market:enable': {
        const parsed = parseRequiredString(message['packageId'], 'packageId');
        if (!parsed.ok) return this._rejectInvalidMessage(parsed.error, postMessage);
        return this._handleEnable(parsed.value, postMessage);
      }

      case 'market:disable': {
        const parsed = parseRequiredString(message['packageId'], 'packageId');
        if (!parsed.ok) return this._rejectInvalidMessage(parsed.error, postMessage);
        return this._handleDisable(parsed.value, postMessage);
      }

      case 'market:revealLocal': {
        const parsed = parseRequiredString(message['packageId'], 'packageId');
        if (!parsed.ok) return this._rejectInvalidMessage(parsed.error, postMessage);
        return this._handleRevealLocal(parsed.value, postMessage);
      }

      case 'market:requestLocalInstall': {
        const parsed = parseLocalAssetStorageMode(message['storageMode']);
        if (!parsed.ok) return this._rejectInvalidMessage(parsed.error, postMessage);
        return this._handleRequestLocalInstall(parsed.value, postMessage);
      }

      case 'market:confirmLocalInstall': {
        const draftId = parseRequiredString(message['draftId'], 'draftId');
        const storageMode = parseLocalAssetStorageMode(message['storageMode']);
        if (!draftId.ok) return this._rejectInvalidMessage(draftId.error, postMessage);
        if (!storageMode.ok) return this._rejectInvalidMessage(storageMode.error, postMessage);
        return this._handleConfirmLocalInstall(draftId.value, storageMode.value, postMessage);
      }

      case 'market:cancelLocalInstall': {
        const parsed = parseRequiredString(message['draftId'], 'draftId');
        if (!parsed.ok) return this._rejectInvalidMessage(parsed.error, postMessage);
        return this._handleCancelLocalInstall(parsed.value, postMessage);
      }

      case 'market:setDeveloperMode': {
        const parsed = parseDeveloperModeRequest(message);
        if (!parsed.ok) return this._rejectInvalidMessage(parsed.error, postMessage);
        return this._handleSetDeveloperMode(parsed.value, postMessage);
      }

      case 'market:promoteWorkspaceTrust':
        return this._handlePromoteWorkspaceTrust(postMessage);

      case 'market:checkout': {
        const parsed = parseRequiredString(message['packageId'], 'packageId');
        if (!parsed.ok) return this._rejectInvalidMessage(parsed.error, postMessage);
        return this._handleCheckout(parsed.value, postMessage);
      }

      case 'market:renew': {
        const parsed = parseRequiredString(message['packageId'], 'packageId');
        if (!parsed.ok) return this._rejectInvalidMessage(parsed.error, postMessage);
        return this._handleRenew(parsed.value, postMessage);
      }

      case 'market:invoice': {
        const parsed = parseRequiredString(message['orderId'], 'orderId');
        if (!parsed.ok) return this._rejectInvalidMessage(parsed.error, postMessage);
        return this._handleInvoice(parsed.value, postMessage);
      }

      case 'market:support': {
        const parsed = parseRequiredString(message['orderId'], 'orderId');
        if (!parsed.ok) return this._rejectInvalidMessage(parsed.error, postMessage);
        return this._handleSupport(parsed.value, postMessage);
      }

      case 'market:refreshEntitlements': {
        const parsed = parseOptionalString(message['packageId'], 'packageId');
        if (!parsed.ok) return this._rejectInvalidMessage(parsed.error, postMessage);
        return this._handleRefreshEntitlements(parsed.value, postMessage);
      }

      case 'market:filterByType': {
        const parsed = parseAssetTypeFilter(message['assetType']);
        if (!parsed.ok) return this._rejectInvalidMessage(parsed.error, postMessage);
        postMessage({ type: 'market:filterByType', data: parsed.value });
        return true;
      }

      default:
        return false;
    }
  }

  private async _handleSearch(
    query: MarketSearchQuery,
    postMessage: PostMessageFn,
  ): Promise<boolean> {
    try {
      const result = await this._service.search(query);
      postMessage({
        type: 'market:searchResult',
        data: {
          items: result.items.map(toMarketItem),
          total: result.total,
        },
      });
    } catch (err) {
      const e = toBaseError(err);
      this._logger.error('Search failed', e);
      postMessage({ type: 'market:error', error: e.message });
    }
    return true;
  }

  private async _handleGetFeatured(
    assetType: AssetType | undefined,
    postMessage: PostMessageFn,
  ): Promise<boolean> {
    try {
      const items = await this._service.getFeatured(assetType);
      postMessage({ type: 'market:featuredResult', data: items.map(toMarketItem) });
    } catch (err) {
      const e = toBaseError(err);
      this._logger.error('getFeatured failed', e);
      postMessage({ type: 'market:error', error: e.message });
    }
    return true;
  }

  private async _handleGetPackage(packageId: string, postMessage: PostMessageFn): Promise<boolean> {
    try {
      const pkg = await this._service.getPackage(packageId);
      postMessage({ type: 'market:packageResult', data: pkg ? toMarketItem(pkg) : undefined });
    } catch (err) {
      const e = toBaseError(err);
      this._logger.error(`getPackage failed: ${packageId}`, e);
      postMessage({ type: 'market:error', error: e.message });
    }
    return true;
  }

  private async _handleGetServerInfo(postMessage: PostMessageFn): Promise<boolean> {
    try {
      postMessage({ type: 'market:serverInfoResult', data: await this._service.getServerInfo() });
    } catch (err) {
      const e = toBaseError(err);
      this._logger.error('getServerInfo failed', e);
      postMessage({ type: 'market:error', error: e.message });
    }
    return true;
  }

  private async _handleGetGovernanceState(postMessage: PostMessageFn): Promise<boolean> {
    try {
      postMessage({ type: 'market:governanceState', data: this._service.getGovernanceState() });
    } catch (err) {
      const e = toBaseError(err);
      this._logger.error('getGovernanceState failed', e);
      postMessage({ type: 'market:error', error: e.message });
    }
    return true;
  }

  private async _handleInstall(
    packageId: string,
    version: string,
    postMessage: PostMessageFn,
  ): Promise<boolean> {
    const disposable = this._service.onInstallProgress((progress) => {
      postMessage({ type: 'market:installProgress', data: progress });
    });

    try {
      const result = await this._service.install(packageId, version);
      postMessage({ type: 'market:installResult', data: result });

      // Refresh installed list after success
      if (result.success) {
        const installed = await this._service.listInstalled();
        postMessage({ type: 'market:installedResult', data: installed.map(toInstalledItem) });
      }
    } catch (err) {
      const e = toBaseError(err);
      this._logger.error(`Install failed: ${packageId}`, e);
      postMessage({ type: 'market:error', error: e.message });
    } finally {
      disposable.dispose();
    }
    return true;
  }

  private async _handleUninstall(packageId: string, postMessage: PostMessageFn): Promise<boolean> {
    try {
      await this._service.uninstall(packageId);
      postMessage({ type: 'market:uninstallResult', data: { packageId, success: true } });

      // Refresh installed list
      const installed = await this._service.listInstalled();
      postMessage({ type: 'market:installedResult', data: installed.map(toInstalledItem) });
    } catch (err) {
      const e = toBaseError(err);
      this._logger.error(`Uninstall failed: ${packageId}`, e);
      postMessage({ type: 'market:error', error: e.message });
    }
    return true;
  }

  private async _handleUpdate(
    packageId: string,
    version: string,
    postMessage: PostMessageFn,
  ): Promise<boolean> {
    const disposable = this._service.onInstallProgress((progress) => {
      postMessage({ type: 'market:installProgress', data: progress });
    });

    try {
      const result = await this._service.update(packageId, version);
      postMessage({ type: 'market:updateResult', data: result });

      if (result.success) {
        const installed = await this._service.listInstalled();
        postMessage({ type: 'market:installedResult', data: installed.map(toInstalledItem) });
      }
    } catch (err) {
      const e = toBaseError(err);
      this._logger.error(`Update failed: ${packageId}`, e);
      postMessage({ type: 'market:error', error: e.message });
    } finally {
      disposable.dispose();
    }
    return true;
  }

  private async _handleCancelInstall(
    packageId: string,
    postMessage: PostMessageFn,
  ): Promise<boolean> {
    try {
      const cancelled = this._service.cancelInstall(packageId);
      postMessage({ type: 'market:cancelInstallResult', data: { packageId, cancelled } });
    } catch (err) {
      const e = toBaseError(err);
      this._logger.error(`Cancel install failed: ${packageId}`, e);
      postMessage({ type: 'market:error', error: e.message });
    }
    return true;
  }

  private async _handleListInstalled(postMessage: PostMessageFn): Promise<boolean> {
    try {
      const installed = await this._service.listInstalled();
      postMessage({ type: 'market:installedResult', data: installed.map(toInstalledItem) });
    } catch (err) {
      const e = toBaseError(err);
      this._logger.error('listInstalled failed', e);
      postMessage({ type: 'market:error', error: e.message });
    }
    return true;
  }

  private async _handleListEntitlements(postMessage: PostMessageFn): Promise<boolean> {
    try {
      const [entitlements, installed] = await Promise.all([
        this._service.listEntitlements(),
        this._service.listInstalled(),
      ]);
      postMessage({
        type: 'market:entitlementsResult',
        data: {
          items: entitlements.entitlements.map((entitlement) =>
            toOwnedItem(entitlement, installed),
          ),
          etag: entitlements.etag,
        },
      });
    } catch (err) {
      const e = toBaseError(err);
      this._logger.error('listEntitlements failed', e);
      postMessage({ type: 'market:error', error: e.message });
    }
    return true;
  }

  private async _handleCheckUpdates(postMessage: PostMessageFn): Promise<boolean> {
    try {
      const updates = await this._service.checkUpdates();
      postMessage({ type: 'market:updatesResult', data: updates });
    } catch (err) {
      const e = toBaseError(err);
      this._logger.error('checkUpdates failed', e);
      postMessage({ type: 'market:error', error: e.message });
    }
    return true;
  }

  private async _handleEnable(packageId: string, postMessage: PostMessageFn): Promise<boolean> {
    try {
      await this._service.enable(packageId);
      postMessage({ type: 'market:enableResult', data: { packageId, success: true } });

      // Refresh installed list
      const installed = await this._service.listInstalled();
      postMessage({ type: 'market:installedResult', data: installed.map(toInstalledItem) });
    } catch (err) {
      const e = toBaseError(err);
      this._logger.error(`Enable failed: ${packageId}`, e);
      postMessage({ type: 'market:error', error: e.message });
    }
    return true;
  }

  private async _handleDisable(packageId: string, postMessage: PostMessageFn): Promise<boolean> {
    try {
      await this._service.disable(packageId);
      postMessage({ type: 'market:disableResult', data: { packageId, success: true } });

      // Refresh installed list
      const installed = await this._service.listInstalled();
      postMessage({ type: 'market:installedResult', data: installed.map(toInstalledItem) });
    } catch (err) {
      const e = toBaseError(err);
      this._logger.error(`Disable failed: ${packageId}`, e);
      postMessage({ type: 'market:error', error: e.message });
    }
    return true;
  }

  private async _handleRevealLocal(
    packageId: string,
    postMessage: PostMessageFn,
  ): Promise<boolean> {
    try {
      await this._service.revealLocalPackage(packageId);
      postMessage({ type: 'market:revealLocalResult', data: { packageId, success: true } });
    } catch (err) {
      const e = toBaseError(err);
      this._logger.error(`Reveal local package failed: ${packageId}`, e);
      postMessage({ type: 'market:error', error: e.message });
    }
    return true;
  }

  private async _handleRequestLocalInstall(
    storageMode: LocalAssetStorageMode,
    postMessage: PostMessageFn,
  ): Promise<boolean> {
    try {
      const draft = await this._service.prepareLocalInstallDraft(storageMode);
      postMessage({ type: 'market:localInstallDraft', data: draft });
    } catch (err) {
      const e = toBaseError(err);
      this._logger.error('Prepare local install failed', e);
      postMessage({ type: 'market:error', error: e.message });
    }
    return true;
  }

  private async _handleConfirmLocalInstall(
    draftId: string,
    storageMode: LocalAssetStorageMode,
    postMessage: PostMessageFn,
  ): Promise<boolean> {
    try {
      const record = await this._service.confirmLocalInstallDraft(draftId, storageMode);
      postMessage({
        type: 'market:localInstallResult',
        data: { draftId, packageId: record?.packageId, success: true },
      });
      const installed = await this._service.listInstalled();
      postMessage({ type: 'market:installedResult', data: installed.map(toInstalledItem) });
    } catch (err) {
      const e = toBaseError(err);
      this._logger.error(`Confirm local install failed: ${draftId}`, e);
      postMessage({ type: 'market:error', error: e.message });
    }
    return true;
  }

  private async _handleCancelLocalInstall(
    draftId: string,
    postMessage: PostMessageFn,
  ): Promise<boolean> {
    try {
      await this._service.cancelLocalInstallDraft(draftId);
      postMessage({ type: 'market:localInstallDraft', data: undefined });
    } catch (err) {
      const e = toBaseError(err);
      this._logger.error(`Cancel local install failed: ${draftId}`, e);
      postMessage({ type: 'market:error', error: e.message });
    }
    return true;
  }

  private async _handleSetDeveloperMode(
    request: { enabled: boolean; riskAccepted: boolean; durationMs?: number },
    postMessage: PostMessageFn,
  ): Promise<boolean> {
    try {
      const state = await this._service.setDeveloperMode(request);
      postMessage({ type: 'market:developerModeResult', data: state });
    } catch (err) {
      const e = toBaseError(err);
      this._logger.error('Set Developer Mode failed', e);
      postMessage({ type: 'market:error', error: e.message });
    }
    return true;
  }

  private async _handlePromoteWorkspaceTrust(postMessage: PostMessageFn): Promise<boolean> {
    try {
      const state = await this._service.promoteWorkspaceTrust();
      postMessage({ type: 'market:workspaceTrustResult', data: state });
    } catch (err) {
      const e = toBaseError(err);
      this._logger.error('Promote Workspace Trust failed', e);
      postMessage({ type: 'market:error', error: e.message });
    }
    return true;
  }

  private async _handleCheckout(packageId: string, postMessage: PostMessageFn): Promise<boolean> {
    try {
      const result = await this._service.openCheckout(packageId);
      postMessage({
        type: 'market:checkoutResult',
        data: { packageId, sessionId: result.sessionId },
      });
    } catch (err) {
      const e = toBaseError(err);
      this._logger.error(`Checkout failed: ${packageId}`, e);
      postMessage({ type: 'market:error', error: e.message });
    }
    return true;
  }

  private async _handleRenew(packageId: string, postMessage: PostMessageFn): Promise<boolean> {
    try {
      const result = await this._service.openRenewal(packageId);
      postMessage({ type: 'market:renewResult', data: { packageId, sessionId: result.sessionId } });
    } catch (err) {
      const e = toBaseError(err);
      this._logger.error(`Renewal failed: ${packageId}`, e);
      postMessage({ type: 'market:error', error: e.message });
    }
    return true;
  }

  private async _handleInvoice(orderId: string, postMessage: PostMessageFn): Promise<boolean> {
    try {
      await this._service.openInvoice(orderId);
      postMessage({ type: 'market:invoiceResult', data: { orderId, success: true } });
    } catch (err) {
      const e = toBaseError(err);
      this._logger.error(`Invoice deep-link failed: ${orderId}`, e);
      postMessage({ type: 'market:error', error: e.message });
    }
    return true;
  }

  private async _handleSupport(orderId: string, postMessage: PostMessageFn): Promise<boolean> {
    try {
      await this._service.openSupport(orderId);
      postMessage({ type: 'market:supportResult', data: { orderId, success: true } });
    } catch (err) {
      const e = toBaseError(err);
      this._logger.error(`Support deep-link failed: ${orderId}`, e);
      postMessage({ type: 'market:error', error: e.message });
    }
    return true;
  }

  private async _handleRefreshEntitlements(
    packageId: string | undefined,
    postMessage: PostMessageFn,
  ): Promise<boolean> {
    try {
      const result = await this._service.refreshEntitlements(packageId);
      postMessage({
        type: 'market:entitlementsRefreshed',
        data: { packageId, count: result.entitlements.length, etag: result.etag },
      });
    } catch (err) {
      const e = toBaseError(err);
      this._logger.error('Entitlement refresh failed', e);
      postMessage({ type: 'market:error', error: e.message });
    }
    return true;
  }

  private _rejectInvalidMessage(error: string | undefined, postMessage: PostMessageFn): boolean {
    this._postValidationError(postMessage, error ?? 'Invalid marketplace message');
    return true;
  }

  private _postValidationError(postMessage: PostMessageFn, error: string): void {
    this._logger.warn('Invalid marketplace webview message', { error });
    postMessage({
      type: 'market:error',
      code: 'invalid-message',
      error,
    });
  }
}

function parseSearchQuery(value: unknown): ValidationResult<MarketSearchQuery> {
  if (value === undefined) return { ok: true, value: {} };
  if (!isRecord(value)) return { ok: false, error: 'query must be an object' };

  const query: MarketSearchQuery = {};
  if (!assignOptionalSearchString(query, 'text', value['text'])) return invalidField('query.text');
  if (!assignOptionalSearchStringArray(query, 'tags', value['tags'])) {
    return invalidField('query.tags');
  }
  if (!assignOptionalSearchString(query, 'publisher', value['publisher'])) {
    return invalidField('query.publisher');
  }
  if (!assignOptionalSearchString(query, 'cursor', value['cursor']))
    return invalidField('query.cursor');
  if (!assignOptionalSearchNumber(query, 'limit', value['limit']))
    return invalidField('query.limit');
  if (!assignOptionalSearchNumber(query, 'offset', value['offset']))
    return invalidField('query.offset');
  if (value['types'] !== undefined) {
    if (!Array.isArray(value['types']) || !value['types'].every(isAssetType)) {
      return invalidField('query.types');
    }
    query.types = value['types'];
  }

  if (value['category'] !== undefined) {
    if (!isAssetCategory(value['category'])) return invalidField('query.category');
    query.category = value['category'];
  }

  if (value['visibility'] !== undefined) {
    const allowed = new Set(['public', 'private', 'shared', 'paid']);
    if (
      !Array.isArray(value['visibility']) ||
      !value['visibility'].every((entry) => typeof entry === 'string' && allowed.has(entry))
    ) {
      return invalidField('query.visibility');
    }
    query.visibility = value['visibility'] as MarketSearchQuery['visibility'];
  }

  if (value['pricing'] !== undefined) {
    if (!['free', 'paid', 'all'].includes(String(value['pricing']))) {
      return invalidField('query.pricing');
    }
    query.pricing = value['pricing'] as MarketSearchQuery['pricing'];
  }

  if (value['sort'] !== undefined) {
    if (
      !['featured', 'trending', 'created', 'downloads', 'rating'].includes(String(value['sort']))
    ) {
      return invalidField('query.sort');
    }
    query.sort = value['sort'] as MarketSearchQuery['sort'];
  }

  if (value['order'] !== undefined) {
    if (!['asc', 'desc'].includes(String(value['order']))) return invalidField('query.order');
    query.order = value['order'] as MarketSearchQuery['order'];
  }

  if (value['semantic'] !== undefined) {
    if (!isRecord(value['semantic'])) return invalidField('query.semantic');
    query.semantic = value['semantic'] as MarketSearchQuery['semantic'];
  }

  if (value['intent'] !== undefined) {
    if (!isRecord(value['intent'])) return invalidField('query.intent');
    query.intent = value['intent'] as MarketSearchQuery['intent'];
  }

  if (value['embedding'] !== undefined) {
    if (
      !isRecord(value['embedding']) ||
      typeof value['embedding']['modelId'] !== 'string' ||
      typeof value['embedding']['query'] !== 'string'
    ) {
      return invalidField('query.embedding');
    }
    query.embedding = {
      modelId: value['embedding']['modelId'],
      query: value['embedding']['query'],
    };
  }

  return { ok: true, value: query };
}

function getManifestKind(manifest: AssetManifest): string | undefined {
  const metadata = manifest.typeMetadata;
  if (!metadata) return undefined;
  switch (metadata.type) {
    case 'media':
      return metadata.data.mediaKind;
    case 'starter':
      return metadata.data.targetEditor;
    case 'identity':
      return metadata.data.identityKind;
    case 'model':
      return metadata.data.modelKind;
    case 'shader':
      return metadata.data.shaderKind;
    case 'preset':
      return metadata.data.presetKind;
    default:
      return undefined;
  }
}

function parseRequiredString(value: unknown, field: string): ValidationResult<string> {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { ok: false, error: `${field} must be a non-empty string` };
  }
  return { ok: true, value };
}

function parseOptionalString(value: unknown, field: string): ValidationResult<string | undefined> {
  if (value === undefined) return { ok: true, value: undefined };
  if (typeof value !== 'string') return { ok: false, error: `${field} must be a string` };
  return { ok: true, value: value.trim().length > 0 ? value : undefined };
}

function parseOptionalAssetType(
  value: unknown,
  field: string,
): ValidationResult<AssetType | undefined> {
  if (value === undefined) return { ok: true, value: undefined };
  if (!isAssetType(value)) return { ok: false, error: `${field} must be a v4 asset type` };
  return { ok: true, value };
}

function parseAssetTypeFilter(value: unknown): ValidationResult<AssetType | 'all'> {
  if (value === 'all') return { ok: true, value: 'all' };
  if (!isAssetType(value)) return { ok: false, error: 'assetType must be all or a v4 asset type' };
  return { ok: true, value };
}

function parseLocalAssetStorageMode(value: unknown): ValidationResult<LocalAssetStorageMode> {
  if (value === undefined || value === 'copy-managed') {
    return { ok: true, value: 'copy-managed' };
  }
  if (value === 'local-link') return { ok: true, value: 'local-link' };
  return { ok: false, error: 'storageMode must be copy-managed or local-link' };
}

function parseDeveloperModeRequest(
  value: Record<string, unknown>,
): ValidationResult<{ enabled: boolean; riskAccepted: boolean; durationMs?: number }> {
  if (typeof value['enabled'] !== 'boolean') {
    return { ok: false, error: 'enabled must be boolean' };
  }
  if (typeof value['riskAccepted'] !== 'boolean') {
    return { ok: false, error: 'riskAccepted must be boolean' };
  }
  if (
    value['durationMs'] !== undefined &&
    (typeof value['durationMs'] !== 'number' || !Number.isFinite(value['durationMs']))
  ) {
    return { ok: false, error: 'durationMs must be a finite number' };
  }
  return {
    ok: true,
    value: {
      enabled: value['enabled'],
      riskAccepted: value['riskAccepted'],
      durationMs: value['durationMs'] as number | undefined,
    },
  };
}

function invalidField(field: string): ValidationResult<never> {
  return { ok: false, error: `${field} is invalid` };
}

function assignOptionalSearchString(
  target: MarketSearchQuery,
  field: 'text' | 'publisher' | 'cursor',
  value: unknown,
): boolean {
  if (value === undefined) return true;
  if (typeof value !== 'string') return false;
  target[field] = value;
  return true;
}

function assignOptionalSearchStringArray(
  target: MarketSearchQuery,
  field: 'tags',
  value: unknown,
): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) return false;
  target[field] = value;
  return true;
}

function assignOptionalSearchNumber(
  target: MarketSearchQuery,
  field: 'limit' | 'offset',
  value: unknown,
): boolean {
  if (value === undefined) return true;
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  target[field] = value;
  return true;
}

function isAssetType(value: unknown): value is AssetType {
  return typeof value === 'string' && ASSET_TYPES.includes(value as AssetType);
}

function isAssetCategory(value: unknown): value is MarketSearchQuery['category'] {
  return typeof value === 'string' && Object.values(CATEGORY_MAP).includes(value as never);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
