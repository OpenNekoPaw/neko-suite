/**
 * MarketClient — HTTP API client for marketplace backend.
 *
 * Handles search, package details, version listing, and download URL retrieval.
 * Zero vscode dependency (Layer 0).
 */

import type {
  AssetType,
  CheckoutUrlResult,
  DeltaDownloadDescriptor,
  DeprecationResult,
  DownloadDescriptor,
  EntitlementChangesResult,
  EntitlementCheck,
  EntitlementListResult,
  IntentOntologyResult,
  IMarketClient,
  MarketSearchQuery,
  MarketSearchResult,
  MarketPackage,
  MarketPackageVersion,
  MarketServerInfo,
  PermissionViolationAuditPayload,
  PermissionViolationAuditReportResult,
  PluginBuildRequest,
  PluginBuildResponse,
  PluginBuildResult,
  PluginBuildStatusResult,
  ProblemDetails,
  PublisherVerificationStatus,
  PublisherVerificationSubmission,
  PublisherVerificationSubmissionResult,
  ProxyVariant,
  SemanticOntologyResult,
  SparseManifestResult,
} from '@neko/shared';

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
  /** Maximum retries for rate-limited requests (default: 2). */
  maxRetries?: number;
  /** Override delay for tests or host-specific scheduling. */
  sleep?: (ms: number) => Promise<void>;
  /** Optional local retention hook for retryable plugin audit payloads. */
  auditRetention?: PermissionViolationAuditRetention;
}

export interface PermissionViolationAuditRetention {
  record(
    payload: PermissionViolationAuditPayload,
    reason: PermissionViolationAuditReportResult['reason'],
  ): Promise<void> | void;
}

/** Default official registry URL */
export const DEFAULT_REGISTRY_URL = 'https://market.neko.dev/api/v1';

// =============================================================================
// Implementation
// =============================================================================

export class MarketClient implements IMarketClient {
  private baseUrl: string;
  private readonly timeout: number;
  private readonly headers: Record<string, string>;
  private readonly maxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly auditRetention: PermissionViolationAuditRetention | undefined;
  private serverInfo?: MarketServerInfo;

  constructor(config?: Partial<MarketClientConfig>) {
    this.baseUrl = config?.registryUrl ?? DEFAULT_REGISTRY_URL;
    this.timeout = config?.timeout ?? 30000;
    this.maxRetries = config?.maxRetries ?? 2;
    this.sleep = config?.sleep ?? defaultSleep;
    this.auditRetention = config?.auditRetention;
    this.headers = {
      Accept: 'application/json, application/problem+json',
      'Content-Type': 'application/json',
      ...config?.headers,
    };
  }

  /** Update the registry base URL after settings change. */
  setRegistryUrl(registryUrl: string | null | undefined): void {
    const trimmed = registryUrl?.trim();
    this.baseUrl = trimmed && trimmed.length > 0 ? trimmed : DEFAULT_REGISTRY_URL;
    this.serverInfo = undefined;
  }

  /** Inspect the active registry base URL for host adapter diagnostics. */
  getRegistryUrl(): string {
    return this.baseUrl;
  }

  /** Inject or remove Bearer token for authenticated requests. */
  setAuthToken(token: string | null): void {
    if (token) {
      this.headers['Authorization'] = `Bearer ${token}`;
    } else {
      delete this.headers['Authorization'];
    }
  }

  async search(query: MarketSearchQuery): Promise<MarketSearchResult> {
    const params = new URLSearchParams();
    if (query.text) params.set('q', query.text);
    if (query.types) params.set('types', query.types.join(','));
    if (query.category) params.set('category', query.category);
    if (query.tags) params.set('tags', query.tags.join(','));
    if (query.visibility) params.set('visibility', query.visibility.join(','));
    if (query.pricing) params.set('pricing', query.pricing);
    if (query.publisher) params.set('publisher', query.publisher);
    if (query.sort) params.set('sort', query.sort);
    if (query.order) params.set('order', query.order);
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    if (query.offset !== undefined) params.set('offset', String(query.offset));
    if (query.cursor) params.set('cursor', query.cursor);
    this.appendFacetParams(params, 'semantic', query.semantic);
    this.appendIntentParams(params, query.intent);
    if (query.embedding) {
      params.set('embedding.modelId', query.embedding.modelId);
      params.set('embedding.query', query.embedding.query);
    }

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
    const response = await this.get<{ versions: MarketPackageVersion[] } | MarketPackageVersion[]>(
      `/packages/${encodeURIComponent(packageId)}/versions`,
    );
    return Array.isArray(response) ? response : response.versions;
  }

  async getDownloadDescriptor(packageId: string, version: string): Promise<DownloadDescriptor> {
    return this.get<DownloadDescriptor>(
      `/packages/${encodeURIComponent(packageId)}/versions/${encodeURIComponent(version)}/download`,
    );
  }

  async getDownloadUrl(packageId: string, version: string): Promise<string> {
    const result = await this.getDownloadDescriptor(packageId, version);
    return result.url;
  }

  async getFeatured(type?: AssetType): Promise<MarketPackage[]> {
    const params = type ? `?type=${type}` : '';
    const response = await this.get<{ items: MarketPackage[] } | MarketPackage[]>(
      `/featured${params}`,
    );
    return Array.isArray(response) ? response : response.items;
  }

  async getServerInfo(): Promise<MarketServerInfo> {
    if (this.serverInfo) return this.serverInfo;
    try {
      this.serverInfo = await this.get<MarketServerInfo>('/version');
      return this.serverInfo;
    } catch (error) {
      if (error instanceof MarketApiError && error.status === 404) {
        this.serverInfo = { version: '1.0.0', capabilities: [] };
        return this.serverInfo;
      }
      throw error;
    }
  }

  async getSparseManifest(packageId: string): Promise<SparseManifestResult> {
    await this.requireCapability('sparse');
    return this.get<SparseManifestResult>(
      `/packages/${encodeURIComponent(packageId)}/sparse-manifest`,
    );
  }

  async reportSparseSelection(
    packageId: string,
    version: string,
    selectedItems: string[],
  ): Promise<void> {
    await this.requireCapability('sparse');
    await this.post<void>('/me/downloads/select', { packageId, version, selectedItems });
  }

  async getVariantDownloadDescriptor(
    packageId: string,
    variantId: string,
  ): Promise<DownloadDescriptor> {
    await this.requireCapability('variant');
    return this.get<DownloadDescriptor>(
      `/packages/${encodeURIComponent(packageId)}/variants/${encodeURIComponent(variantId)}/download`,
    );
  }

  async getProxyVariantDownloadDescriptor(
    packageId: string,
    qualityTag: ProxyVariant['qualityTag'],
  ): Promise<DownloadDescriptor> {
    await this.requireCapability('proxy');
    return this.get<DownloadDescriptor>(
      `/packages/${encodeURIComponent(packageId)}/proxy-variants/${encodeURIComponent(
        qualityTag,
      )}/download`,
    );
  }

  async getDeltaDownloadDescriptor(
    packageId: string,
    fromVersion: string,
    toVersion: string,
  ): Promise<DeltaDownloadDescriptor> {
    await this.requireCapability('delta');
    const params = new URLSearchParams({ from: fromVersion, to: toVersion });
    return this.get<DeltaDownloadDescriptor>(
      `/packages/${encodeURIComponent(packageId)}/delta?${params.toString()}`,
    );
  }

  async listEntitlements(): Promise<EntitlementListResult> {
    return this.get<EntitlementListResult>('/me/entitlements');
  }

  async getEntitlementChanges(etag: string): Promise<EntitlementChangesResult | undefined> {
    try {
      return await this.get<EntitlementChangesResult>('/me/entitlements/changes', {
        'If-None-Match': etag,
      });
    } catch (error) {
      if (error instanceof MarketApiError && error.status === 304) {
        return undefined;
      }
      throw error;
    }
  }

  async refreshEntitlements(): Promise<EntitlementListResult> {
    return this.post<EntitlementListResult>('/me/entitlements/refresh', {});
  }

  async checkEntitlement(packageId: string, version: string): Promise<EntitlementCheck> {
    return this.post<EntitlementCheck>('/me/entitlements/check', { packageId, version });
  }

  async getCheckoutUrl(
    packageId: string,
    returnTo?: string,
    locale?: string,
  ): Promise<CheckoutUrlResult> {
    const params = new URLSearchParams({ packageId });
    if (returnTo) params.set('returnTo', returnTo);
    if (locale) params.set('locale', locale);
    return this.get<CheckoutUrlResult>(`/billing/checkout-url?${params.toString()}`);
  }

  async requestPluginBuild(
    packageId: string,
    request: PluginBuildRequest,
  ): Promise<PluginBuildResponse> {
    const entitlement = await this.checkEntitlement(packageId, request.version);
    if (!entitlement.allowed) {
      throw new MarketApiError(403, 'Entitlement Denied', '', {
        type: 'urn:neko:market:entitlement-denied',
        title: 'Plugin entitlement denied',
        status: 403,
        detail: entitlement.reason ?? 'Plugin entitlement is not allowed',
        packageId,
      });
    }

    return this.post<PluginBuildResponse>(
      `/plugins/${encodeURIComponent(packageId)}/build`,
      request,
    );
  }

  async getPluginBuildStatus(packageId: string, buildId: string): Promise<PluginBuildStatusResult> {
    const params = new URLSearchParams({ buildId });
    return this.get<PluginBuildStatusResult>(
      `/plugins/${encodeURIComponent(packageId)}/build-status?${params.toString()}`,
    );
  }

  async getPluginBuildResult(packageId: string, buildId: string): Promise<PluginBuildResult> {
    const params = new URLSearchParams({ buildId });
    return this.get<PluginBuildResult>(
      `/plugins/${encodeURIComponent(packageId)}/build-result?${params.toString()}`,
    );
  }

  async submitPublisherVerification(
    submission: PublisherVerificationSubmission,
  ): Promise<PublisherVerificationSubmissionResult> {
    return this.post<PublisherVerificationSubmissionResult>('/publishers/verify', submission);
  }

  async getPublisherVerificationStatus(publisherId: string): Promise<PublisherVerificationStatus> {
    return this.get<PublisherVerificationStatus>(
      `/publishers/${encodeURIComponent(publisherId)}/verification-status`,
    );
  }

  async reportPermissionViolation(
    payload: PermissionViolationAuditPayload,
  ): Promise<PermissionViolationAuditReportResult> {
    const capability = 'plugin-audit';
    if (!(await this.hasCapability(capability))) {
      await this.retainPermissionViolation(payload, 'unsupported-capability');
      return {
        delivered: false,
        retained: this.auditRetention !== undefined,
        reason: 'unsupported-capability',
      };
    }

    try {
      await this.post<void>('/audit/permission-violation', payload);
      return { delivered: true, retained: false };
    } catch (error) {
      if (isTransientAuditFailure(error)) {
        await this.retainPermissionViolation(payload, 'transient-failure');
        return {
          delivered: false,
          retained: this.auditRetention !== undefined,
          reason: 'transient-failure',
        };
      }
      throw error;
    }
  }

  async getSemanticOntology(type?: AssetType, kind?: string): Promise<SemanticOntologyResult> {
    await this.requireCapability('ontology');
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (kind) params.set('kind', kind);
    const suffix = params.toString();
    return this.get<SemanticOntologyResult>(`/ontology/semantic${suffix ? `?${suffix}` : ''}`);
  }

  async getIntentOntology(): Promise<IntentOntologyResult> {
    await this.requireCapability('ontology');
    return this.get<IntentOntologyResult>('/ontology/intent');
  }

  async getDeprecation(packageId: string): Promise<DeprecationResult> {
    await this.requireCapability('deprecation');
    return this.get<DeprecationResult>(`/packages/${encodeURIComponent(packageId)}/deprecation`);
  }

  // ===========================================================================
  // Private
  // ===========================================================================

  private async get<T>(
    path: string,
    headers?: Record<string, string>,
    options?: RequestOptions,
  ): Promise<T> {
    return this.request<T>('GET', path, undefined, headers, options);
  }

  private async post<T>(path: string, body: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('POST', path, body, undefined, options);
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
    options?: RequestOptions,
  ): Promise<T> {
    const maxAttempts = options?.skipRetry ? 1 : this.maxRetries + 1;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        return await this.requestOnce<T>(method, path, body, headers);
      } catch (error) {
        if (
          !(error instanceof MarketApiError) ||
          error.status !== 429 ||
          attempt >= maxAttempts - 1
        ) {
          throw error;
        }
        await this.sleep(this.getRetryDelayMs(error, attempt));
      }
    }

    throw new MarketApiError(429, 'Too Many Requests');
  }

  private async requestOnce<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { ...this.headers, ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw await this.createApiError(response);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async createApiError(response: Response): Promise<MarketApiError> {
    const body = await response.text().catch(() => '');
    const contentType =
      response.headers.get('Content-Type') ?? response.headers.get('content-type') ?? '';
    const retryAfter = parseRetryAfter(
      response.headers.get('Retry-After') ?? response.headers.get('retry-after'),
    );
    const problem = contentType.includes('application/problem+json')
      ? parseProblemDetails(body, response.status)
      : undefined;
    return new MarketApiError(response.status, response.statusText, body, problem, retryAfter);
  }

  private async requireCapability(capability: string): Promise<void> {
    const info = await this.getServerInfo();
    if (info.capabilities.includes(capability)) return;
    throw new MarketApiError(501, 'Unsupported Capability', '', {
      type: 'urn:neko:market:unsupported-capability',
      title: 'Unsupported registry capability',
      status: 501,
      detail: `Registry capability is not available: ${capability}`,
      capability,
    });
  }

  private async hasCapability(capability: string): Promise<boolean> {
    const info = await this.getServerInfo();
    return info.capabilities.includes(capability);
  }

  private async retainPermissionViolation(
    payload: PermissionViolationAuditPayload,
    reason: PermissionViolationAuditReportResult['reason'],
  ): Promise<void> {
    await this.auditRetention?.record(payload, reason);
  }

  private getRetryDelayMs(error: MarketApiError, attempt: number): number {
    const retryAfterMs = error.retryAfterMs;
    if (retryAfterMs !== undefined) return retryAfterMs;
    return Math.min(1000 * 2 ** attempt, 8000);
  }

  private appendFacetParams(
    params: URLSearchParams,
    prefix: string,
    facets?: MarketSearchQuery['semantic'],
  ): void {
    if (!facets) return;
    Object.entries(facets).forEach(([key, value]) => {
      if (isRangeFacet(value)) {
        if (value.min !== undefined) params.set(`${prefix}.${key}>=`, String(value.min));
        if (value.max !== undefined) params.set(`${prefix}.${key}<=`, String(value.max));
        return;
      }
      params.set(`${prefix}.${key}`, Array.isArray(value) ? value.join(',') : String(value));
    });
  }

  private appendIntentParams(params: URLSearchParams, intent?: MarketSearchQuery['intent']): void {
    if (!intent) return;
    Object.entries(intent).forEach(([key, value]) => {
      if (value === undefined) return;
      const normalizedKey = key === 'useCase' ? 'useCases' : key;
      params.set(`intent.${normalizedKey}`, Array.isArray(value) ? value.join(',') : value);
    });
  }
}

function isRangeFacet(value: unknown): value is { min?: number; max?: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    ('min' in value || 'max' in value)
  );
}

interface RequestOptions {
  skipRetry?: boolean;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return undefined;
  return Math.max(0, timestamp - Date.now());
}

function parseProblemDetails(body: string, fallbackStatus: number): ProblemDetails | undefined {
  if (!body) return undefined;
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!isRecord(parsed)) return undefined;
    return {
      ...parsed,
      status: typeof parsed['status'] === 'number' ? parsed['status'] : fallbackStatus,
    };
  } catch {
    return undefined;
  }
}

function isTransientAuditFailure(error: unknown): boolean {
  if (!(error instanceof MarketApiError)) return true;
  return (
    error.status === 408 || error.status === 409 || error.status === 429 || error.status >= 500
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// =============================================================================
// Error
// =============================================================================

export class MarketApiError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly body = '',
    readonly problem?: ProblemDetails,
    readonly retryAfterMs?: number,
  ) {
    super(problem?.detail ?? problem?.title ?? `Market API error: ${status} ${statusText}`);
    this.name = 'MarketApiError';
  }

  get type(): string | undefined {
    return this.problem?.type;
  }

  get title(): string | undefined {
    return this.problem?.title;
  }

  get detail(): string | undefined {
    return this.problem?.detail;
  }

  get instance(): string | undefined {
    return this.problem?.instance;
  }
}
