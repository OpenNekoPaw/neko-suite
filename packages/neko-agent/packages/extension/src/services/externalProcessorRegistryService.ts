import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  NEKO_AGENT_REFRESH_EXTERNAL_PROCESSORS_COMMAND,
  NEKO_AGENT_REGISTER_EXTERNAL_PROCESSOR_CONTRIBUTION_COMMAND,
  NEKO_AGENT_UNREGISTER_EXTERNAL_PROCESSOR_PACKAGE_COMMAND,
  createExternalProcessorRegistry,
  parseExternalProcessorManifestJson,
  registerExtensionExternalProcessorContributions,
  registerMarketExternalProcessorPackages,
  registerPersonalExternalProcessorManifests,
  registerProjectExternalProcessorManifests,
  validateExternalProcessorManifest,
  type ExternalProcessorDiagnostic,
  type ExternalProcessorDiscoveryResult,
  type ExternalProcessorExtensionContribution,
  type ExternalProcessorManifest,
  type ExternalProcessorMarketPackageProjection,
  type ExternalProcessorPersonalRegistry,
  type ExternalProcessorRegistry,
} from '@neko-agent/types';
import {
  createAgentExternalProcessorRuntime,
  type AgentExternalProcessorRuntime,
} from '@neko/agent/runtime';
import { resolveGlobalStorageLayout } from '@neko/shared';
import type { AgentCapabilityTrustLevel, AssetManifest, InstalledPackage } from '@neko/shared';
import { NEKO_MARKET_EXTENSION_ID, type NekoMarketAPI } from '../market/marketApi';

const PERSONAL_PROCESSOR_REGISTRY_FILE = 'registry.json';

export interface ExternalProcessorRegistryServiceLogger {
  info(message: string, details?: unknown): void;
  warn(message: string, details?: unknown): void;
  debug?(message: string, details?: unknown): void;
}

export interface ExternalProcessorRegistryServiceOptions {
  readonly context: vscode.ExtensionContext;
  readonly registry?: ExternalProcessorRegistry;
  readonly homeDir?: string;
  readonly fs?: ExternalProcessorRegistryServiceFs;
  readonly logger?: ExternalProcessorRegistryServiceLogger;
  readonly getMarketApi?: () => Promise<NekoMarketAPI | undefined>;
}

export interface ExternalProcessorRegistryServiceFs {
  readFile(filePath: string, encoding: 'utf-8'): Promise<string>;
  readdir(
    path: string,
    options: { withFileTypes: true },
  ): Promise<readonly ExternalProcessorRegistryDirent[]>;
}

export interface ExternalProcessorRegistryDirent {
  readonly name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

export interface ExternalProcessorRefreshResult {
  readonly project: ExternalProcessorDiscoveryResult;
  readonly personal: ExternalProcessorDiscoveryResult;
  readonly market: ExternalProcessorDiscoveryResult;
  readonly diagnostics: readonly ExternalProcessorDiagnostic[];
}

export interface ExternalProcessorContributionRegistrationInput {
  readonly extensionId: string;
  readonly contributionId?: string;
  readonly trustLevel?: AgentCapabilityTrustLevel;
  readonly manifest: ExternalProcessorManifest | unknown;
}

export interface ExternalProcessorContributionRegistrationResult {
  readonly registrationId: string;
  dispose(): void;
}

export class ExternalProcessorRegistryService implements vscode.Disposable {
  readonly registry: ExternalProcessorRegistry;
  readonly runtime: AgentExternalProcessorRuntime;

  private readonly fs: ExternalProcessorRegistryServiceFs;
  private readonly homeDir: string;
  private readonly getMarketApi: () => Promise<NekoMarketAPI | undefined>;
  private readonly logger?: ExternalProcessorRegistryServiceLogger;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly extensionContributionRegistrationIds = new Map<string, string>();

  constructor(options: ExternalProcessorRegistryServiceOptions) {
    this.registry = options.registry ?? createExternalProcessorRegistry();
    this.runtime = createAgentExternalProcessorRuntime({ registry: this.registry });
    this.fs = options.fs ?? fs;
    this.homeDir = options.homeDir ?? os.homedir();
    this.logger = options.logger;
    this.getMarketApi = options.getMarketApi ?? resolveMarketApi;
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        void this.refresh().catch((error) => {
          this.logger?.warn('Failed to refresh external processors after workspace change', {
            error,
          });
        });
      }),
    );
    this.registerCommands();
    this.registerMarketEventRefresh();
  }

  async refresh(): Promise<ExternalProcessorRefreshResult> {
    const [project, personal, market] = await Promise.all([
      this.refreshProjectProcessors(),
      this.refreshPersonalProcessors(),
      this.refreshMarketProcessors(),
    ]);
    const diagnostics = [...project.diagnostics, ...personal.diagnostics, ...market.diagnostics];
    if (diagnostics.length > 0) {
      this.logger?.warn('External processor refresh completed with diagnostics', {
        diagnostics,
      });
    } else {
      this.logger?.debug?.('External processor registry refreshed', {
        project: project.registrations.length,
        personal: personal.registrations.length,
        market: market.registrations.length,
      });
    }
    return { project, personal, market, diagnostics };
  }

  unregisterMarketPackage(packageId: string): void {
    for (const registration of this.registry.list({ includeDisabled: true }).processors) {
      if (registration.sourceScope === 'market' && registration.packageId === packageId) {
        this.registry.unregister(
          { registrationId: registration.registrationId },
          `Market processor package uninstalled: ${packageId}`,
        );
      }
    }
  }

  registerExtensionContribution(
    input: ExternalProcessorContributionRegistrationInput,
  ): ExternalProcessorContributionRegistrationResult {
    const manifest = this.validateContributionManifest(input.manifest);
    const contribution: ExternalProcessorExtensionContribution = {
      extensionId: input.extensionId,
      ...(input.contributionId ? { contributionId: input.contributionId } : {}),
      ...(input.trustLevel ? { trustLevel: input.trustLevel } : {}),
      manifest,
    };
    const result = registerExtensionExternalProcessorContributions({
      registry: this.registry,
      contributions: [contribution],
    });
    const registration = result.registrations[0];
    if (!registration) {
      throw new Error('External processor contribution did not produce a registration.');
    }
    const key = createExtensionContributionKey(input);
    const previous = this.extensionContributionRegistrationIds.get(key);
    if (previous && previous !== registration.registrationId) {
      this.registry.unregister(
        { registrationId: previous },
        `Extension processor contribution replaced: ${key}`,
      );
    }
    this.extensionContributionRegistrationIds.set(key, registration.registrationId);
    return {
      registrationId: registration.registrationId,
      dispose: () => {
        const current = this.extensionContributionRegistrationIds.get(key);
        if (current !== registration.registrationId) return;
        this.extensionContributionRegistrationIds.delete(key);
        this.registry.unregister(
          { registrationId: registration.registrationId },
          `Extension processor contribution disposed: ${key}`,
        );
      },
    };
  }

  dispose(): void {
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
  }

  private async refreshProjectProcessors(): Promise<ExternalProcessorDiscoveryResult> {
    const workspaceSourceId = this.getWorkspaceSourceId();
    const previous = this.listRegistrationIdsByPrefix(`project:${workspaceSourceId}:`);
    const files = await this.loadProjectManifestFiles();
    const result = registerProjectExternalProcessorManifests({
      registry: this.registry,
      workspaceSourceId,
      files,
    });
    this.unregisterStaleRegistrations(
      previous,
      result.registrations.map((registration) => registration.registrationId),
      'Project processor manifest removed',
    );
    return result;
  }

  private async refreshPersonalProcessors(): Promise<ExternalProcessorDiscoveryResult> {
    const previous = this.listRegistrationIdsByPrefix('personal:user-local:');
    const registry = await this.loadPersonalRegistry();
    const result = registerPersonalExternalProcessorManifests({
      registry: this.registry,
      personalSourceId: 'user-local',
      entries: registry.entries,
    });
    this.unregisterStaleRegistrations(
      previous,
      result.registrations.map((registration) => registration.registrationId),
      'Personal processor manifest removed',
    );
    return result;
  }

  private async refreshMarketProcessors(): Promise<ExternalProcessorDiscoveryResult> {
    const previous = this.listRegistrationIdsByPrefix('market:');
    const market = await this.getMarketApi();
    const installed = market?.getInstalled
      ? await market.getInstalled({ types: ['processor'] })
      : [];
    const packages = await Promise.all(
      installed
        .filter((item) => item.type === 'processor')
        .map((item) => this.projectMarketProcessorPackage(item)),
    );
    const result = registerMarketExternalProcessorPackages({
      registry: this.registry,
      packages: packages.filter(
        (item): item is ExternalProcessorMarketPackageProjection => item !== undefined,
      ),
    });
    this.unregisterStaleRegistrations(
      previous,
      result.registrations.map((registration) => registration.registrationId),
      'Market processor package removed or invalid',
    );
    return result;
  }

  private async loadProjectManifestFiles(): Promise<
    readonly { readonly path: string; readonly contents: string }[]
  > {
    const files: Array<{ path: string; contents: string }> = [];
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const processorDir = path.join(folder.uri.fsPath, '.neko', 'processors');
      const entries = await this.readDirOrEmpty(processorDir);
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.neko-processor.json')) continue;
        const manifestPath = path.join(processorDir, entry.name);
        files.push({
          path: path.relative(folder.uri.fsPath, manifestPath),
          contents: await this.fs.readFile(manifestPath, 'utf-8'),
        });
      }
    }
    return files;
  }

  private async loadPersonalRegistry(): Promise<ExternalProcessorPersonalRegistry> {
    const registryPath = path.join(
      resolveGlobalStorageLayout(this.homeDir).processors,
      PERSONAL_PROCESSOR_REGISTRY_FILE,
    );
    let parsed: unknown;
    try {
      parsed = JSON.parse(await this.fs.readFile(registryPath, 'utf-8')) as unknown;
    } catch (error) {
      if (isMissingFileError(error)) {
        return { version: 1, entries: [] };
      }
      throw error;
    }
    if (!isPersonalRegistryFile(parsed)) {
      throw new Error(`Invalid external processor personal registry: ${registryPath}`);
    }
    const entries = await Promise.all(
      parsed.entries.map(async (entry) => {
        const manifestPath = resolvePersonalManifestPath(entry.manifestPath, this.homeDir);
        return {
          id: entry.id,
          manifestPath: entry.manifestPath,
          contents: await this.fs.readFile(manifestPath, 'utf-8'),
          ...(entry.enabled !== undefined ? { enabled: entry.enabled } : {}),
        };
      }),
    );
    return { version: 1, entries };
  }

  private async projectMarketProcessorPackage(
    installed: InstalledPackage,
  ): Promise<ExternalProcessorMarketPackageProjection | undefined> {
    const metadata =
      installed.manifest.typeMetadata?.type === 'processor'
        ? installed.manifest.typeMetadata.data
        : undefined;
    if (!metadata) return undefined;
    const manifestPath = path.join(installed.installedPath, metadata.processorManifestPath);
    const parsed = parseExternalProcessorManifestJson(
      await this.fs.readFile(manifestPath, 'utf-8'),
      manifestPath,
    );
    if (!parsed.value) {
      this.logger?.warn('Invalid Market processor manifest JSON', {
        packageId: installed.packageId,
        diagnostics: parsed.diagnostics,
      });
      return undefined;
    }
    const validated = validateExternalProcessorManifest(parsed.value);
    if (!validated.manifest) {
      this.logger?.warn('Invalid Market processor manifest', {
        packageId: installed.packageId,
        diagnostics: validated.diagnostics,
      });
      return undefined;
    }
    return {
      packageId: installed.packageId,
      publisherId: installed.manifest.distribution?.publisherId,
      version: installed.version,
      trustLevel: resolveMarketProcessorTrustLevel(installed.manifest),
      entitlement: installed.enabled === false ? 'denied' : 'allowed',
      revoked: metadata.revoked === true || installed.status === 'expired',
      manifest: validated.manifest,
    };
  }

  private validateContributionManifest(manifest: unknown): ExternalProcessorManifest {
    const result = validateExternalProcessorManifest(manifest);
    if (!result.manifest) {
      const error = result.diagnostics.find((diagnostic) => diagnostic.severity === 'error');
      throw new Error(error?.message ?? 'Invalid external processor contribution manifest.');
    }
    return result.manifest;
  }

  private registerCommands(): void {
    const refreshCommand = vscode.commands.registerCommand(
      NEKO_AGENT_REFRESH_EXTERNAL_PROCESSORS_COMMAND,
      async () => this.refresh(),
    );
    const unregisterCommand = vscode.commands.registerCommand(
      NEKO_AGENT_UNREGISTER_EXTERNAL_PROCESSOR_PACKAGE_COMMAND,
      async (packageId: string) => {
        this.unregisterMarketPackage(packageId);
      },
    );
    const contributionCommand = vscode.commands.registerCommand(
      NEKO_AGENT_REGISTER_EXTERNAL_PROCESSOR_CONTRIBUTION_COMMAND,
      async (input: ExternalProcessorContributionRegistrationInput) =>
        this.registerExtensionContribution(input),
    );
    this.disposables.push(refreshCommand, unregisterCommand, contributionCommand);
  }

  private registerMarketEventRefresh(): void {
    void this.getMarketApi()
      .then((market) => {
        if (!market) return;
        const refresh = (event: { readonly type?: string }) => {
          if (event.type === 'processor') {
            void this.refresh().catch((error) => {
              this.logger?.warn('Failed to refresh external processors after Market event', {
                error,
              });
            });
          }
        };
        const disposables = [
          market.onDidInstall?.(refresh),
          market.onDidEnable?.(refresh),
          market.onDidDisable?.(refresh),
          market.onDidUninstall?.((event) => {
            if (event.type === 'processor') {
              this.unregisterMarketPackage(event.packageId);
            }
          }),
        ].filter((item): item is vscode.Disposable => item !== undefined);
        this.disposables.push(...disposables);
      })
      .catch((error) => {
        this.logger?.warn('Failed to subscribe to Market processor events', { error });
      });
  }

  private async readDirOrEmpty(
    dirPath: string,
  ): Promise<readonly ExternalProcessorRegistryDirent[]> {
    try {
      return await this.fs.readdir(dirPath, { withFileTypes: true });
    } catch (error) {
      if (isMissingFileError(error)) return [];
      throw error;
    }
  }

  private getWorkspaceSourceId(): string {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? 'no-workspace';
  }

  private listRegistrationIdsByPrefix(prefix: string): readonly string[] {
    return this.registry
      .list({ includeDisabled: true })
      .processors.filter((registration) => registration.registrationId.startsWith(prefix))
      .map((registration) => registration.registrationId);
  }

  private unregisterStaleRegistrations(
    previous: readonly string[],
    current: readonly string[],
    reason: string,
  ): void {
    const currentSet = new Set(current);
    for (const registrationId of previous) {
      if (currentSet.has(registrationId)) continue;
      this.registry.unregister({ registrationId }, reason);
    }
  }
}

async function resolveMarketApi(): Promise<NekoMarketAPI | undefined> {
  const extension = vscode.extensions.getExtension<NekoMarketAPI>(NEKO_MARKET_EXTENSION_ID);
  if (!extension) return undefined;
  return extension.isActive ? extension.exports : extension.activate();
}

function createExtensionContributionKey(
  input: Pick<ExternalProcessorContributionRegistrationInput, 'extensionId' | 'contributionId'>,
): string {
  return `${input.extensionId}:${input.contributionId ?? 'default'}`;
}

function resolvePersonalManifestPath(manifestPath: string, homeDir: string): string {
  return manifestPath
    .replace(/^\$\{NEKO_HOME\}(?=\/|$)/, path.join(homeDir, '.neko'))
    .replace(/^\$\{HOME\}(?=\/|$)/, homeDir);
}

function resolveMarketProcessorTrustLevel(
  manifest: AssetManifest,
): Exclude<AgentCapabilityTrustLevel, 'core'> {
  const metadataTrust =
    manifest.typeMetadata?.type === 'processor' ? manifest.typeMetadata.data.trustLevel : undefined;
  const distributionTrust = manifest.distribution?.trustLevel;
  const trust = metadataTrust ?? distributionTrust;
  return trust === 'community' ? 'community' : 'untrusted';
}

function isPersonalRegistryFile(value: unknown): value is {
  readonly version: 1;
  readonly entries: ReadonlyArray<{
    readonly id: string;
    readonly manifestPath: string;
    readonly enabled?: boolean;
  }>;
} {
  if (!isRecord(value) || value['version'] !== 1 || !Array.isArray(value['entries'])) {
    return false;
  }
  return value['entries'].every(
    (entry) =>
      isRecord(entry) &&
      typeof entry['id'] === 'string' &&
      typeof entry['manifestPath'] === 'string' &&
      (entry['enabled'] === undefined || typeof entry['enabled'] === 'boolean'),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}
