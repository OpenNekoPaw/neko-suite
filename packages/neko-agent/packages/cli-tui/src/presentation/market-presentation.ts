import type { AgentTerminalPresentationContext } from './context';
import type { AgentTerminalCommandProjection } from './model-family-presentation';
import type { AgentTerminalMessageKey } from './terminal-messages';

export interface MarketSearchItem {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly installState?: 'installed' | 'update-available';
}

export interface MarketInstalledPackage {
  readonly packageId: string;
  readonly version: string;
  readonly type: string;
  readonly installedPath: string;
}

export interface MarketUpdateRow {
  readonly packageId: string;
  readonly currentVersion: string;
  readonly latestVersion: string;
  readonly success: boolean;
  readonly detail?: string;
}

export type MarketCommandSemanticResult =
  | Readonly<{ readonly kind: 'help' }>
  | Readonly<{
      readonly kind: 'search-results';
      readonly query: string;
      readonly total: number;
      readonly items: readonly MarketSearchItem[];
      readonly remainingCount: number;
    }>
  | Readonly<{
      readonly kind: 'install-result';
      readonly packageId: string;
      readonly version: string;
      readonly phases: readonly { readonly phase: string; readonly percent: number }[];
      readonly success: boolean;
      readonly installedPath?: string;
      readonly detail?: string;
    }>
  | Readonly<{ readonly kind: 'installed'; readonly packages: readonly MarketInstalledPackage[] }>
  | Readonly<{
      readonly kind: 'updates-current';
      readonly packageId?: string;
    }>
  | Readonly<{ readonly kind: 'updates'; readonly updates: readonly MarketUpdateRow[] }>
  | Readonly<{ readonly kind: 'uninstalled'; readonly packageId: string }>
  | Readonly<{
      readonly kind: 'diagnostic';
      readonly code: 'search-usage' | 'install-usage' | 'uninstall-usage' | 'operation-failed';
      readonly operation?: 'search' | 'install' | 'list' | 'update' | 'uninstall';
      readonly detail?: string;
    }>;

type PresentationContext = AgentTerminalPresentationContext<AgentTerminalMessageKey>;

export function presentMarketCommand(
  result: MarketCommandSemanticResult,
  context: PresentationContext,
): AgentTerminalCommandProjection {
  switch (result.kind) {
    case 'help':
      return { kind: 'output', output: presentHelp(context) };
    case 'search-results':
      return { kind: 'output', output: presentSearchResults(result, context) };
    case 'install-result':
      return { kind: 'output', output: presentInstallResult(result, context) };
    case 'installed':
      return { kind: 'output', output: presentInstalled(result.packages, context) };
    case 'updates-current':
      return {
        kind: 'output',
        output: result.packageId
          ? context.t('agent.terminal.market.update.noneScoped', { packageId: result.packageId })
          : context.t('agent.terminal.market.update.current'),
      };
    case 'updates':
      return { kind: 'output', output: presentUpdates(result.updates, context) };
    case 'uninstalled':
      return {
        kind: 'output',
        output: context.t('agent.terminal.market.uninstalled', { packageId: result.packageId }),
      };
    case 'diagnostic':
      return presentMarketDiagnostic(result, context);
  }
}

function presentHelp(context: PresentationContext): string {
  return [
    context.t('agent.terminal.market.help.header'),
    context.t('agent.terminal.market.help.search'),
    context.t('agent.terminal.market.help.install'),
    context.t('agent.terminal.market.help.installVersion'),
    context.t('agent.terminal.market.help.list'),
    context.t('agent.terminal.market.help.update'),
    context.t('agent.terminal.market.help.updateScoped'),
    context.t('agent.terminal.market.help.uninstall'),
  ].join('\n');
}

function presentSearchResults(
  result: Extract<MarketCommandSemanticResult, { readonly kind: 'search-results' }>,
  context: PresentationContext,
): string {
  if (result.items.length === 0) {
    return context.t('agent.terminal.market.search.empty', { query: result.query });
  }
  const lines = [
    context.t('agent.terminal.market.search.header', {
      query: result.query,
      total: context.format.count(result.total),
    }),
  ];
  for (const item of result.items) {
    const state = item.installState
      ? context.t(`agent.terminal.market.state.${item.installState}`)
      : '';
    lines.push(
      state
        ? context.t('agent.terminal.market.search.rowWithState', {
            name: item.name,
            version: item.version,
            state,
          })
        : context.t('agent.terminal.market.search.row', {
            name: item.name,
            version: item.version,
          }),
    );
    if (item.description) lines.push(item.description);
    lines.push(context.t('agent.terminal.market.search.id', { packageId: item.id }));
  }
  if (result.remainingCount > 0) {
    lines.push(
      context.t('agent.terminal.market.search.more', {
        count: context.format.count(result.remainingCount),
      }),
    );
  }
  return lines.join('\n');
}

function presentInstallResult(
  result: Extract<MarketCommandSemanticResult, { readonly kind: 'install-result' }>,
  context: PresentationContext,
): string {
  return [
    context.t('agent.terminal.market.install.start', {
      packageId: result.packageId,
      version: result.version,
    }),
    ...result.phases.map((phase) =>
      context.t('agent.terminal.market.install.progress', {
        phase: phase.phase,
        percent: context.format.count(phase.percent),
      }),
    ),
    result.success
      ? context.t('agent.terminal.market.install.success', {
          packageId: result.packageId,
          installedPath: result.installedPath ?? context.t('agent.terminal.value.done'),
        })
      : context.t('agent.terminal.market.install.failed', {
          detail: result.detail ?? context.t('agent.terminal.value.unknown'),
        }),
  ].join('\n');
}

function presentInstalled(
  packages: readonly MarketInstalledPackage[],
  context: PresentationContext,
): string {
  if (packages.length === 0) return context.t('agent.terminal.market.list.empty');
  return [
    context.t(
      packages.length === 1
        ? 'agent.terminal.market.list.headerOne'
        : 'agent.terminal.market.list.headerMany',
      { count: context.format.count(packages.length) },
    ),
    ...packages.flatMap((item) => [
      context.t('agent.terminal.market.list.row', {
        packageId: item.packageId,
        version: item.version,
        type: item.type,
      }),
      context.t('agent.terminal.market.list.path', { path: item.installedPath }),
    ]),
  ].join('\n');
}

function presentUpdates(updates: readonly MarketUpdateRow[], context: PresentationContext): string {
  return [
    context.t(
      updates.length === 1
        ? 'agent.terminal.market.update.headerOne'
        : 'agent.terminal.market.update.headerMany',
      { count: context.format.count(updates.length) },
    ),
    ...updates.flatMap((update) => [
      context.t('agent.terminal.market.update.row', {
        packageId: update.packageId,
        currentVersion: update.currentVersion,
        latestVersion: update.latestVersion,
      }),
      update.success
        ? context.t('agent.terminal.market.update.success', { packageId: update.packageId })
        : context.t('agent.terminal.market.update.failed', {
            detail: update.detail ?? context.t('agent.terminal.value.unknown'),
          }),
    ]),
  ].join('\n');
}

function presentMarketDiagnostic(
  result: Extract<MarketCommandSemanticResult, { readonly kind: 'diagnostic' }>,
  context: PresentationContext,
): AgentTerminalCommandProjection {
  switch (result.code) {
    case 'search-usage':
      return error('market.search-usage', 'agent.terminal.diagnostic.market.searchUsage', context);
    case 'install-usage':
      return error(
        'market.install-usage',
        'agent.terminal.diagnostic.market.installUsage',
        context,
      );
    case 'uninstall-usage':
      return error(
        'market.uninstall-usage',
        'agent.terminal.diagnostic.market.uninstallUsage',
        context,
      );
    case 'operation-failed':
      return error(
        `market.${required(result.operation, result.code)}-failed`,
        'agent.terminal.diagnostic.market.operationFailed',
        context,
        {
          operation: context.t(
            `agent.terminal.market.operation.${required(result.operation, result.code)}`,
          ),
          detail: required(result.detail, result.code),
        },
      );
  }
}

function error(
  diagnosticCode: string,
  key: AgentTerminalMessageKey,
  context: PresentationContext,
  params?: Readonly<Record<string, string | number>>,
): AgentTerminalCommandProjection {
  return { kind: 'error', diagnosticCode, error: context.t(key, params) };
}

function required<T>(value: T | undefined, code: string): T {
  if (value === undefined)
    throw new Error(`Missing semantic data for terminal diagnostic: ${code}`);
  return value;
}
