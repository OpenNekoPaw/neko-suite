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
import { emitDiagnostic, resolveGlobalStorageLayout, resolveStorageLayout } from '@neko/shared';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import type {
  ICapabilityMediaService,
  ICapabilityConfigManager,
  IProviderCardRegistry,
} from '@neko/shared';
import {
  ProviderCardRegistry,
  registerProviderCardDirectory,
  ToolCategoryRegistry,
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
let _runtimeBindings: CapabilityRuntimeBindings = {};
const logger = getLogger('CapabilityBootstrap');

const CAPABILITY_RUNTIME_BINDING_KEYS = [
  'skillRegistry',
  'toolGroupRegistry',
  'toolCategoryRegistry',
  'skillService',
  'providerCardRegistry',
] as const;

export interface CapabilityRuntimeBindings {
  /** Shared registry that provider-contributed skills are injected into. */
  skillRegistry?: SkillRegistry;
  /** Shared ToolGroup registry used by runtime bootstrap + UI projections. */
  toolGroupRegistry?: ToolGroupRegistry;
  /** Shared ToolCategory registry used by tool injection + filtering. */
  toolCategoryRegistry?: ToolCategoryRegistry;
  /** Shared SkillService layered on top of the shared SkillRegistry. */
  skillService?: SkillService;
  /** Shared ProviderCard registry used by ProviderExpressionContext. */
  providerCardRegistry?: IProviderCardRegistry;
}

export interface CapabilityBootstrapOptions extends Omit<
  CapabilityDiscoveryDeps,
  'providerCardRegistry'
> {
  /** Media generation service from Platform */
  mediaService?: ICapabilityMediaService;
  /** Config manager from Platform */
  configManager?: ICapabilityConfigManager;
  /** Embedding function for semantic search */
  embedFn?: (texts: string[]) => Promise<number[][]>;
  /** Shared ProviderCard registry used by ProviderExpressionContext. */
  providerCardRegistry?: IProviderCardRegistry;
  /** Workspace root used to load project-level .neko/providers/*.card.md overrides. */
  workspaceRoot?: string;
}

function mergeCapabilityRuntimeBindings(
  next: Partial<CapabilityRuntimeBindings>,
): CapabilityRuntimeBindings {
  const merged: CapabilityRuntimeBindings = { ..._runtimeBindings };

  for (const key of CAPABILITY_RUNTIME_BINDING_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) {
      continue;
    }

    const value = next[key];
    const previous = merged[key];
    if (value === undefined) {
      if (previous !== undefined) {
        emitDiagnostic(logger, 'warn', {
          code: 'extension.capability-runtime.binding-update-ignored',
          reason: 'undefined-value-ignored',
          message:
            'Ignoring undefined capability runtime binding update to avoid clearing shared singleton state.',
          context: {
            binding: key,
          },
        });
      }
      continue;
    }

    if (previous !== undefined && previous !== value) {
      emitDiagnostic(logger, 'warn', {
        code: 'extension.capability-runtime.binding-replaced',
        reason: 'shared-singleton-replaced',
        message: 'Replacing a shared capability runtime binding reference.',
        context: {
          binding: key,
        },
      });
    }

    assignCapabilityRuntimeBinding(merged, key, value);
  }

  return merged;
}

function assignCapabilityRuntimeBinding<K extends keyof CapabilityRuntimeBindings>(
  bindings: CapabilityRuntimeBindings,
  key: K,
  value: NonNullable<CapabilityRuntimeBindings[K]>,
): void {
  bindings[key] = value;
}

/**
 * Initialize and activate the capability discovery system.
 * Returns the service instance for query access.
 */
export function bootstrapCapabilities(
  options: CapabilityBootstrapOptions,
  context: vscode.ExtensionContext,
): CapabilityDiscoveryService {
  const toolCategoryRegistry =
    (options.toolCategoryRegistry as ToolCategoryRegistry | undefined) ??
    _runtimeBindings.toolCategoryRegistry ??
    new ToolCategoryRegistry();
  const providerCardRegistry: IProviderCardRegistry =
    options.providerCardRegistry ??
    _runtimeBindings.providerCardRegistry ??
    new ProviderCardRegistry();

  _runtimeBindings = {
    ...mergeCapabilityRuntimeBindings({
      skillRegistry: options.skillRegistry as SkillRegistry | undefined,
      toolGroupRegistry: options.toolGroupRegistry as ToolGroupRegistry | undefined,
      toolCategoryRegistry,
      providerCardRegistry,
    }),
  };

  void registerProviderCardDirectory({
    registry: providerCardRegistry,
    root: resolveGlobalStorageLayout(os.homedir()).providerCards,
    sourceLayer: 'market',
    fs,
    recursive: true,
    sourceRefPrefix: '${NEKO_HOME}/providers',
    onError: (error) => emitProviderCardLoadWarning(error, 'market'),
  });

  const workspaceRoot = options.workspaceRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceRoot) {
    void registerProviderCardDirectory({
      registry: providerCardRegistry,
      root: resolveStorageLayout(workspaceRoot, os.homedir()).project.providerCards,
      sourceLayer: 'project',
      fs,
      recursive: false,
      sourceRefPrefix: '.neko/providers',
      onError: (error) => emitProviderCardLoadWarning(error, 'project'),
    });
  }

  _instance = new CapabilityDiscoveryService({
    ...options,
    toolCategoryRegistry,
    providerCardRegistry,
  });
  _instance.activate(context, {
    mediaService: options.mediaService,
    configManager: options.configManager,
    embedFn: options.embedFn,
  });
  context.subscriptions.push(_instance);
  return _instance;
}

function emitProviderCardLoadWarning(
  error: { readonly path: string; readonly reason: string; readonly cause: unknown },
  layer: 'market' | 'project',
): void {
  emitDiagnostic(logger, 'warn', {
    code: 'extension.provider-card.load-failed',
    reason: error.reason,
    message: 'Failed to load provider expression card.',
    context: {
      layer,
      path: error.path,
      error: String(error.cause),
    },
  });
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
  return _runtimeBindings;
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
  _runtimeBindings = {
    ...mergeCapabilityRuntimeBindings({
      skillService,
    }),
  };
}
