/**
 * Capability Bootstrap — Initialize the AgentCapabilityProvider discovery system.
 *
 * Sets up the CapabilityDiscoveryService which allows sub-packages to register
 * their AI capabilities (Tools, Skills, ToolGroups) via:
 * - Static manifest in package.json `contributes.neko.agentCapabilities`
 * - Dynamic registration via `neko.agent.registerCapabilities` Command
 *
 * Platform services (media, config, embedFn) are injected into the capability
 * context so sub-packages can use them without depending on @neko/platform.
 */

import * as vscode from 'vscode';
import type {
  ICapabilityMediaService,
  ICapabilityConfigManager,
  IArtifactProfileRegistry,
  IProviderCardRegistry,
  IProviderExpressionProfileRegistry,
} from '@neko/shared';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import {
  createCapabilityRuntimeBindingStore,
  type CapabilityRuntimeBindings,
} from '@neko/agent/runtime';
import type { AgentContentAccessRuntime, AgentExternalProcessorRuntime } from '@neko/agent/runtime';
import {
  ProviderCardRegistry,
  registerRuntimeProviderCardDirectories,
  ToolCategoryRegistry,
  type SkillLifecycleRuntime,
  type SkillService,
  type SkillRegistry,
  type ToolGroupRegistry,
} from '@neko/agent';
import {
  CapabilityDiscoveryService,
  type CapabilityDiscoveryDeps,
} from '../services/capabilityDiscoveryService';
import { getLogger } from '../base';

let _instance: CapabilityDiscoveryService | undefined;
const logger = getLogger('CapabilityBootstrap');
const runtimeBindingStore = createCapabilityRuntimeBindingStore(logger);

export interface CapabilityBootstrapOptions extends Omit<
  CapabilityDiscoveryDeps,
  'providerCardRegistry' | 'artifactProfileRegistry' | 'providerExpressionProfileRegistry'
> {
  /** Media generation service from Platform */
  mediaService?: ICapabilityMediaService;
  /** Config manager from Platform */
  configManager?: ICapabilityConfigManager;
  /** Embedding function for semantic search */
  embedFn?: (texts: string[]) => Promise<number[][]>;
  /** Shared ProviderCard registry used by ProviderExpressionContext. */
  providerCardRegistry?: IProviderCardRegistry;
  /** Shared Artifact Profile registry used by runtime prompt/schema composition. */
  artifactProfileRegistry?: IArtifactProfileRegistry;
  /** Shared Provider/model Expression Profile registry used by runtime prompt composition. */
  providerExpressionProfileRegistry?: IProviderExpressionProfileRegistry;
  /** Workspace root used to load project-level .neko/providers/*.card.md overrides. */
  workspaceRoot?: string;
}

/**
 * Initialize and activate the capability discovery system.
 * Returns the service instance for query access.
 */
export function bootstrapCapabilities(
  options: CapabilityBootstrapOptions,
  context: vscode.ExtensionContext,
): CapabilityDiscoveryService {
  const runtimeBindings = runtimeBindingStore.get();
  const toolCategoryRegistry =
    (options.toolCategoryRegistry as ToolCategoryRegistry | undefined) ??
    runtimeBindings.toolCategoryRegistry ??
    new ToolCategoryRegistry();
  const providerCardRegistry: IProviderCardRegistry =
    options.providerCardRegistry ??
    runtimeBindings.providerCardRegistry ??
    new ProviderCardRegistry();

  runtimeBindingStore.update({
    skillRegistry: options.skillRegistry as SkillRegistry | undefined,
    toolGroupRegistry: options.toolGroupRegistry as ToolGroupRegistry | undefined,
    toolCategoryRegistry,
    providerCardRegistry,
    artifactProfileRegistry: options.artifactProfileRegistry,
    providerExpressionProfileRegistry: options.providerExpressionProfileRegistry,
  });

  void registerRuntimeProviderCardDirectories({
    registry: providerCardRegistry,
    providerExpressionProfileRegistry: options.providerExpressionProfileRegistry,
    fs,
    homeDir: os.homedir(),
    workspaceRoot: options.workspaceRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    logger,
  });

  _instance = new CapabilityDiscoveryService({
    ...options,
    toolCategoryRegistry,
    providerCardRegistry,
    artifactProfileRegistry: options.artifactProfileRegistry,
    providerExpressionProfileRegistry: options.providerExpressionProfileRegistry,
  });
  _instance.activate(context, {
    mediaService: options.mediaService,
    configManager: options.configManager,
    embedFn: options.embedFn,
    locale: normalizeCapabilityLocale(vscode.env.language),
  });
  context.subscriptions.push(_instance);
  return _instance;
}

function normalizeCapabilityLocale(locale?: string): 'en' | 'zh' {
  const normalized = locale?.trim().toLowerCase().replace('_', '-');
  return normalized?.startsWith('zh') ? 'zh' : 'en';
}

/**
 * Get the capability discovery service instance.
 * Throws if not yet bootstrapped.
 */
export function getCapabilityDiscoveryService(): CapabilityDiscoveryService {
  if (!_instance) {
    throw new Error(
      'CapabilityDiscoveryService not initialized — call bootstrapCapabilities first',
    );
  }
  return _instance;
}

/**
 * Shared capability/runtime objects that extension hosts reuse when
 * bootstrapping AgentSession. These bindings stay optional so tests and
 * partial bootstraps can fall back gracefully.
 */
export function getCapabilityRuntimeBindings(): Readonly<CapabilityRuntimeBindings> {
  return runtimeBindingStore.get();
}

/**
 * Late-bind the shared SkillService after ChatProvider constructs it on top
 * of the shared SkillRegistry. AgentRunner reads this during session bring-up
 * so stage-tracking + dynamic skills share the same service instance.
 *
 * Passing `undefined` is treated as a no-op on purpose: we warn and keep the
 * previous shared singleton binding instead of silently clearing it.
 */
export function setCapabilityRuntimeSkillService(skillService: SkillService | undefined): void {
  runtimeBindingStore.setSkillService(skillService);
}

export function setCapabilityRuntimeSkillLifecycleRuntime(
  skillLifecycleRuntime: SkillLifecycleRuntime | undefined,
): void {
  runtimeBindingStore.setSkillLifecycleRuntime(skillLifecycleRuntime);
}

export function setCapabilityRuntimeExternalProcessorRuntime(
  externalProcessorRuntime: AgentExternalProcessorRuntime | undefined,
): void {
  runtimeBindingStore.update({ externalProcessorRuntime });
}

export function setCapabilityRuntimeContentAccessRuntime(
  contentAccessRuntime: AgentContentAccessRuntime | undefined,
): void {
  runtimeBindingStore.update({ contentAccessRuntime });
}
