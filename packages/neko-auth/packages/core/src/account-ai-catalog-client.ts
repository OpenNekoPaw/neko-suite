import type { AccountAiCatalogSnapshot, IAuthSession, ProviderConfig } from '@neko/shared';
import {
  AuthEntitlementError,
  AuthNetworkError,
  AuthNotConfiguredError,
  AuthTokenError,
} from './types';

export interface AccountAiCatalogClientConfig {
  readonly catalogUrl?: string;
}

export interface AccountAiCatalogClientOptions {
  readonly fetchFn?: typeof fetch;
  readonly now?: () => number;
}

interface AccountAiCatalogResponse {
  readonly provider?: unknown;
  readonly models?: unknown;
  readonly entitlement?: unknown;
  readonly defaults?: unknown;
  readonly version?: unknown;
  readonly etag?: unknown;
  readonly expiresInMs?: unknown;
  readonly expiresAt?: unknown;
}

const DEFAULT_CATALOG_TTL_MS = 5 * 60 * 1000;

export class AccountAiCatalogClient {
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;

  constructor(
    private readonly config: AccountAiCatalogClientConfig,
    options: AccountAiCatalogClientOptions = {},
  ) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.now = options.now ?? Date.now;
  }

  async fetchCatalog(session: IAuthSession): Promise<AccountAiCatalogSnapshot> {
    const catalogUrl = this.config.catalogUrl?.trim();
    if (!catalogUrl) {
      throw new AuthNotConfiguredError('Neko account AI catalog endpoint is not configured');
    }

    let response: Response;
    try {
      response = await this.fetchFn(catalogUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
        },
      });
    } catch (error) {
      throw new AuthNetworkError(
        error instanceof Error ? error.message : 'AI catalog request failed',
      );
    }

    if (!response.ok) {
      const detail = await safeReadResponseText(response);
      if (response.status === 403) {
        throw new AuthEntitlementError(
          detail || `AI catalog entitlement denied with HTTP ${response.status}`,
          response.status,
        );
      }
      throw new AuthTokenError(
        detail || `AI catalog request failed with HTTP ${response.status}`,
        response.status,
      );
    }

    let payload: AccountAiCatalogResponse;
    try {
      payload = (await response.json()) as AccountAiCatalogResponse;
    } catch (error) {
      throw new AuthTokenError(
        error instanceof Error ? error.message : 'AI catalog response is not valid JSON',
        502,
      );
    }
    assertNoForbiddenSecretFields(payload, 'AI catalog response');
    return parseAccountAiCatalogResponse(payload, this.now());
  }
}

async function safeReadResponseText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function parseAccountAiCatalogResponse(
  payload: AccountAiCatalogResponse,
  now: number,
): AccountAiCatalogSnapshot {
  const provider = readProvider(payload.provider);
  const models = readModels(payload.models);
  const entitlement = readEntitlement(payload.entitlement);
  const expiresAt = readExpiresAt(payload, now);
  const version = readOptionalString(payload.version);
  const etag = readOptionalString(payload.etag);

  const defaults = readDefaults(payload.defaults);
  const snapshot = {
    source: 'account-gateway',
    provider,
    models,
    entitlement,
    status: 'available',
    expiresAt,
    ...(defaults ? { defaults } : {}),
    ...(version ? { version } : {}),
    ...(etag ? { etag } : {}),
  } satisfies AccountAiCatalogSnapshot;

  assertNoForbiddenSecretFields(snapshot, 'AI catalog projection');
  return snapshot;
}

function readProvider(value: unknown): AccountAiCatalogSnapshot['provider'] {
  const provider = asRecord(value);
  if (!provider) {
    throw new AuthTokenError('AI catalog response is missing provider metadata', 502);
  }

  const id = readString(provider.id);
  const name = readString(provider.name);
  const displayName = readString(provider.displayName);
  if (!id || !name || !displayName) {
    throw new AuthTokenError('AI catalog provider metadata is incomplete', 502);
  }

  return {
    id,
    name,
    displayName,
    type: readProviderType(provider.type),
    apiUrl: '',
    enabled: readBoolean(provider.enabled) ?? true,
    connectionKind: 'gateway',
    protocolProfile: 'newapi-compatible',
    supportLevel: 'verified',
    requiresApiKey: false,
    supportsBeta: readBoolean(provider.supportsBeta) ?? false,
    useBearerAuth: true,
  };
}

function readProviderType(value: unknown): ProviderConfig['type'] {
  const type = readString(value);
  return type === 'newapi' || type === 'generic' || type === 'openai' ? type : 'newapi';
}

function readModels(value: unknown): AccountAiCatalogSnapshot['models'] {
  if (!Array.isArray(value)) {
    throw new AuthTokenError('AI catalog response is missing models', 502);
  }
  return value.map((item) => {
    const model = asRecord(item);
    if (!model) {
      throw new AuthTokenError('AI catalog model entry is invalid', 502);
    }
    const id = readString(model.id);
    const name = readString(model.name);
    const providerId = readString(model.providerId);
    if (!id || !name || !providerId) {
      throw new AuthTokenError('AI catalog model entry is incomplete', 502);
    }
    const capabilities = readStringArray(model.capabilities);
    const displayName = readString(model.displayName);
    const type = readModelType(model.type);
    const contextWindow = readNumber(model.contextWindow);
    const maxOutputTokens = readNumber(model.maxOutputTokens);
    return {
      id,
      name,
      providerId,
      ...(displayName ? { displayName } : {}),
      ...(type ? { type } : {}),
      capabilities,
      enabled: readBoolean(model.enabled) ?? true,
      ...(contextWindow !== undefined ? { contextWindow } : {}),
      ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
    };
  });
}

function readEntitlement(value: unknown): AccountAiCatalogSnapshot['entitlement'] {
  const entitlement = asRecord(value);
  if (!entitlement) {
    throw new AuthTokenError('AI catalog response is missing entitlement', 502);
  }
  const allowedModelIds = readStringArray(entitlement.allowedModelIds);
  if (allowedModelIds.length === 0) {
    throw new AuthEntitlementError('AI catalog response has no entitled models', 403);
  }
  const plan = readString(entitlement.plan);
  const usage = readUsage(entitlement.usage);
  return {
    allowedModelIds,
    ...(plan ? { plan } : {}),
    ...(Array.isArray(entitlement.disabledModelIds)
      ? { disabledModelIds: readStringArray(entitlement.disabledModelIds) }
      : {}),
    ...(usage ? { usage } : {}),
  };
}

function readUsage(value: unknown): AccountAiCatalogSnapshot['entitlement']['usage'] | undefined {
  const usage = asRecord(value);
  if (!usage) return undefined;
  const tokens = readNumber(usage.tokens);
  const limit = readNumber(usage.limit);
  const resetAt = readString(usage.resetAt);
  return {
    ...(tokens !== undefined ? { tokens } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(resetAt ? { resetAt } : {}),
  };
}

function readDefaults(value: unknown): AccountAiCatalogSnapshot['defaults'] | undefined {
  const defaults = asRecord(value);
  if (!defaults) return undefined;
  const chat = readString(defaults.chat);
  const image = readString(defaults.image);
  const video = readString(defaults.video);
  const audio = readString(defaults.audio);
  const music = readString(defaults.music);
  const result = {
    ...(chat ? { chat } : {}),
    ...(image ? { image } : {}),
    ...(video ? { video } : {}),
    ...(audio ? { audio } : {}),
    ...(music ? { music } : {}),
  };
  return Object.keys(result).length > 0 ? result : undefined;
}

function readExpiresAt(payload: AccountAiCatalogResponse, now: number): number {
  const absolute = readNumber(payload.expiresAt);
  if (absolute !== undefined) return absolute;
  const ttl = readNumber(payload.expiresInMs);
  return now + (ttl ?? DEFAULT_CATALOG_TTL_MS);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function readModelType(value: unknown): AccountAiCatalogSnapshot['models'][number]['type'] {
  switch (value) {
    case 'llm':
    case 'image':
    case 'video':
    case 'audio':
    case 'music':
      return value;
    default:
      return undefined;
  }
}

function assertNoForbiddenSecretFields(value: unknown, label: string): void {
  const forbiddenKeys = new Set([
    'accessToken',
    'refreshToken',
    'apiKey',
    'authorization',
    'authHeader',
  ]);
  const stack: unknown[] = [value];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;

    for (const [key, child] of Object.entries(current)) {
      if (forbiddenKeys.has(key)) {
        throw new AuthTokenError(`${label} included forbidden secret field: ${key}`, 502);
      }
      if (child && typeof child === 'object') {
        stack.push(child);
      }
    }
  }
}
