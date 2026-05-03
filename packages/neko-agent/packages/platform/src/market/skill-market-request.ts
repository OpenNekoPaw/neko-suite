import type {
  InstallProgress,
  InstallResult,
  InstalledPackage,
  MarketSearchResult,
  UpdateInfo,
} from '@neko/shared';
import type { SkillMarketSearchQuery } from './skill-market-service';

export const SKILL_MARKET_UNAVAILABLE_ERROR = 'Skill marketplace is not configured.';

export interface SkillMarketRuntime {
  search(query: SkillMarketSearchQuery): Promise<MarketSearchResult>;
  install(
    packageId: string,
    version: string,
    onProgress?: (progress: InstallProgress) => void,
  ): Promise<InstallResult>;
  uninstall(packageId: string): Promise<void>;
  listInstalled(): Promise<InstalledPackage[]>;
  checkUpdates(): Promise<UpdateInfo[]>;
  getFeatured(): Promise<MarketSearchResult>;
}

export type SkillMarketExecutionRequest =
  | {
      readonly kind: 'search';
      readonly query: SkillMarketSearchQuery & { readonly types?: readonly string[] };
    }
  | { readonly kind: 'install'; readonly packageId: string; readonly version: string }
  | { readonly kind: 'uninstall'; readonly packageId: string }
  | { readonly kind: 'listInstalled' }
  | { readonly kind: 'checkUpdates' }
  | { readonly kind: 'getFeatured' };

export type SkillMarketExecutionEvent =
  | { readonly kind: 'searchResult'; readonly data: MarketSearchResult }
  | { readonly kind: 'installProgress'; readonly data: InstallProgress }
  | { readonly kind: 'installResult'; readonly data: InstallResult }
  | {
      readonly kind: 'uninstallResult';
      readonly data: { readonly packageId: string; readonly success: true };
    }
  | { readonly kind: 'installedList'; readonly data: readonly InstalledPackage[] }
  | { readonly kind: 'updates'; readonly data: readonly UpdateInfo[] }
  | { readonly kind: 'featured'; readonly data: MarketSearchResult }
  | { readonly kind: 'error'; readonly error: string };

export interface SkillMarketExecutionLogger {
  error(message: string, error?: unknown): void;
}

export interface ExecuteSkillMarketRequestInput {
  readonly market?: SkillMarketRuntime | null;
  readonly request: SkillMarketExecutionRequest;
  readonly onEvent?: (event: SkillMarketExecutionEvent) => void;
  readonly logger?: SkillMarketExecutionLogger;
}

export async function executeSkillMarketRequest(
  input: ExecuteSkillMarketRequestInput,
): Promise<readonly SkillMarketExecutionEvent[]> {
  const events: SkillMarketExecutionEvent[] = [];
  const emit = (event: SkillMarketExecutionEvent): void => {
    events.push(event);
    input.onEvent?.(event);
  };

  if (!input.market) {
    emit({ kind: 'error', error: SKILL_MARKET_UNAVAILABLE_ERROR });
    return events;
  }

  try {
    await executeWithMarket(input.market, input.request, emit);
  } catch (error) {
    input.logger?.error('Skill marketplace request failed', error);
    emit({ kind: 'error', error: formatSkillMarketError(error) });
  }

  return events;
}

async function executeWithMarket(
  market: SkillMarketRuntime,
  request: SkillMarketExecutionRequest,
  emit: (event: SkillMarketExecutionEvent) => void,
): Promise<void> {
  switch (request.kind) {
    case 'search': {
      emit({
        kind: 'searchResult',
        data: await market.search(normalizeSearchQuery(request.query)),
      });
      return;
    }

    case 'install': {
      const result = await market.install(request.packageId, request.version, (progress) => {
        emit({ kind: 'installProgress', data: progress });
      });
      emit({ kind: 'installResult', data: result });
      return;
    }

    case 'uninstall':
      await market.uninstall(request.packageId);
      emit({
        kind: 'uninstallResult',
        data: { packageId: request.packageId, success: true },
      });
      return;

    case 'listInstalled':
      emit({ kind: 'installedList', data: await market.listInstalled() });
      return;

    case 'checkUpdates':
      emit({ kind: 'updates', data: await market.checkUpdates() });
      return;

    case 'getFeatured':
      emit({ kind: 'featured', data: await market.getFeatured() });
      return;
  }
}

function normalizeSearchQuery(
  query: SkillMarketSearchQuery & { readonly types?: readonly string[] },
): SkillMarketSearchQuery {
  const { text, tags, page, pageSize, sort } = query;
  return {
    ...(text !== undefined ? { text } : {}),
    ...(tags !== undefined ? { tags: [...tags] } : {}),
    ...(page !== undefined ? { page } : {}),
    ...(pageSize !== undefined ? { pageSize } : {}),
    ...(sort !== undefined ? { sort } : {}),
  };
}

function formatSkillMarketError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
