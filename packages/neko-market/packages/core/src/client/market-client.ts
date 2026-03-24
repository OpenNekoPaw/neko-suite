/**
 * MarketClient — HTTP API client for marketplace backend.
 *
 * Handles search, package details, version listing, and download URL retrieval.
 * Zero vscode dependency (Layer 0).
 */

import type { AssetType } from '@neko/shared/types/asset/manifest';
import type {
  IMarketClient,
  MarketSearchQuery,
  MarketSearchResult,
  MarketPackage,
  MarketPackageVersion,
} from '@neko/shared/types/asset/market';

// =============================================================================
// Configuration
// =============================================================================

export interface MarketClientConfig {
  /** Registry base URL */
  registryUrl: string;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Custom headers (e.g., auth tokens) */
  headers?: Record<string, string>;
}

/** Default official registry URL */
export const DEFAULT_REGISTRY_URL = 'https://market.neko.dev/api/v1';

// =============================================================================
// Implementation
// =============================================================================

export class MarketClient implements IMarketClient {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly headers: Record<string, string>;

  constructor(config?: Partial<MarketClientConfig>) {
    this.baseUrl = config?.registryUrl ?? DEFAULT_REGISTRY_URL;
    this.timeout = config?.timeout ?? 30000;
    this.headers = {
      'Content-Type': 'application/json',
      ...config?.headers,
    };
  }

  async search(query: MarketSearchQuery): Promise<MarketSearchResult> {
    const params = new URLSearchParams();
    if (query.text) params.set('q', query.text);
    if (query.types) params.set('types', query.types.join(','));
    if (query.tags) params.set('tags', query.tags.join(','));
    if (query.visibility) params.set('visibility', query.visibility.join(','));
    if (query.sort) params.set('sort', query.sort);
    if (query.page !== undefined) params.set('page', String(query.page));
    if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize));

    return this.get<MarketSearchResult>(`/packages?${params.toString()}`);
  }

  async getPackage(packageId: string): Promise<MarketPackage | undefined> {
    try {
      return await this.get<MarketPackage>(`/packages/${encodeURIComponent(packageId)}`);
    } catch (error) {
      if (error instanceof MarketApiError && error.status === 404) {
        return undefined;
      }
      throw error;
    }
  }

  async getVersions(packageId: string): Promise<MarketPackageVersion[]> {
    return this.get<MarketPackageVersion[]>(`/packages/${encodeURIComponent(packageId)}/versions`);
  }

  async getDownloadUrl(packageId: string, version: string): Promise<string> {
    const result = await this.get<{ url: string }>(
      `/packages/${encodeURIComponent(packageId)}/versions/${encodeURIComponent(version)}/download`,
    );
    return result.url;
  }

  async getFeatured(type?: AssetType): Promise<MarketPackage[]> {
    const params = type ? `?type=${type}` : '';
    return this.get<MarketPackage[]>(`/featured${params}`);
  }

  // ===========================================================================
  // Private
  // ===========================================================================

  private async get<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'GET',
        headers: this.headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new MarketApiError(response.status, response.statusText, body);
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// =============================================================================
// Error
// =============================================================================

export class MarketApiError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly body: string,
  ) {
    super(`Market API error: ${status} ${statusText}`);
    this.name = 'MarketApiError';
  }
}
