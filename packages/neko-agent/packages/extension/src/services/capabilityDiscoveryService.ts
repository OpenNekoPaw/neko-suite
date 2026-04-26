/**
 * Capability Discovery Service — Hybrid manifest + command discovery
 *
 * Discovers AgentCapabilityProviders from sub-packages via two mechanisms:
 *
 * 1. **Static (manifest)**: Scans installed extensions for
 *    `contributes.neko.agentCapabilities` at startup. This populates metadata
 *    (tool names, descriptions, loading tiers) before sub-packages activate.
 *
 * 2. **Dynamic (command)**: Sub-packages register their provider instance at
 *    runtime via `vscode.commands.executeCommand('neko.agent.registerCapabilities', provider)`.
 *    This delivers the actual Tool/Skill implementations.
 *
 * When a provider is registered, its tools/skills/toolGroups are automatically
 * injected into the ToolRegistry and SkillRegistry.
 *
 * When a sub-package deactivates, its provider is automatically unregistered
 * and all injected tools/skills are removed.
 */

import * as vscode from 'vscode';
import { emitDiagnostic } from '@neko/shared';
import type {
  AgentCapabilityProvider,
  AgentCapabilityManifest,
  AgentCapabilityContext,
  AgentCapabilityHostRequirement,
  AgentCapabilityLifecycleHook,
  AgentCapabilityProtocolVersion,
  AgentCapabilityTrustLevel,
  IToolRegistry,
  IToolCategoryRegistry,
  Tool,
  ToolGroup,
  Skill,
  ISkillRegistry,
  PromptFragment,
  ProviderCard,
  IProviderCardRegistry,
} from '@neko/shared';
import { getRootLogger } from '../base';

// =============================================================================
// Types
// =============================================================================

export interface CapabilityProtocolInfo {
  readonly providerId: string;
  readonly protocolVersion: AgentCapabilityProtocolVersion;
  readonly trustLevel: AgentCapabilityTrustLevel;
  readonly hostRequirements: readonly AgentCapabilityHostRequirement[];
  readonly lifecycleHooks: readonly AgentCapabilityLifecycleHook[];
  readonly source: 'provider' | 'manifest';
}

interface ProviderCardTarget {
  readonly providerId: string;
  readonly modelId?: string;
}

interface RegisteredProvider {
  provider: AgentCapabilityProvider;
  protocol: CapabilityProtocolInfo;
  /** Tool names registered by this provider (for cleanup) */
  registeredTools: string[];
  /** Skill names registered by this provider (for cleanup) */
  registeredSkills: string[];
  /** ToolGroup names registered by this provider (for cleanup) */
  registeredToolGroups: string[];
  /** ProviderCard targets registered by this provider (for cleanup) */
  registeredProviderCards: ProviderCardTarget[];
}

export interface CapabilityDiscoveryDeps {
  toolRegistry: IToolRegistry;
  skillRegistry?: ISkillRegistry;
  toolGroupRegistry?: {
    register(group: ToolGroup): void;
    unregister(name: string): void;
    listEnabled?(): ToolGroup[];
  };
  toolCategoryRegistry?: Pick<IToolCategoryRegistry, 'categorizeTool'> & {
    clearTools?(): void;
  };
  providerCardRegistry?: Pick<IProviderCardRegistry, 'register' | 'unregister'>;
}

// =============================================================================
// Service
// =============================================================================

export class CapabilityDiscoveryService implements vscode.Disposable {
  private readonly _providers = new Map<string, RegisteredProvider>();
  private readonly _manifests = new Map<string, AgentCapabilityManifest>();
  private readonly _toolOwners = new Map<string, string>();
  private readonly _skillOwners = new Map<string, string>();
  private readonly _toolGroupOwners = new Map<string, string>();
  private readonly _providerCardOwners = new Map<string, string>();
  private readonly _deps: CapabilityDiscoveryDeps;
  private readonly _disposables: vscode.Disposable[] = [];
  private readonly _logger = getRootLogger().child('CapabilityDiscovery');
  private _capabilityContext: AgentCapabilityContext | null = null;
  private _warnedMissingCapabilityContextForFragments = false;

  private readonly _onDidRegister = new vscode.EventEmitter<AgentCapabilityProvider>();
  readonly onDidRegister = this._onDidRegister.event;

  private readonly _onDidUnregister = new vscode.EventEmitter<string>();
  readonly onDidUnregister = this._onDidUnregister.event;

  constructor(deps: CapabilityDiscoveryDeps) {
    this._deps = deps;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Initialize: scan manifests + register command handler.
   * Call this during extension activation.
   *
   * @param context VSCode extension context
   * @param capabilityContext Platform services context passed to all providers
   */
  activate(
    context: vscode.ExtensionContext,
    capabilityContext?: Omit<AgentCapabilityContext, 'extensionContext'>,
  ): void {
    this._capabilityContext = {
      extensionContext: context,
      ...capabilityContext,
    };

    // Register the command that sub-packages call to provide their capabilities
    this._disposables.push(
      vscode.commands.registerCommand(
        'neko.agent.registerCapabilities',
        (provider: AgentCapabilityProvider) => {
          this.registerProvider(provider, this._capabilityContext!);
        },
      ),
    );

    // Scan installed extensions for static manifests
    this._discoverManifests();

    // Re-scan when extensions change (install/uninstall/enable/disable)
    this._disposables.push(
      vscode.extensions.onDidChange(() => {
        this._discoverManifests();
        this._cleanupRemovedExtensions();
      }),
    );

    this.syncToolCategories();
  }

  dispose(): void {
    // Unregister all providers
    for (const [id] of this._providers) {
      this.unregisterProvider(id);
    }
    for (const d of this._disposables) {
      d.dispose();
    }
    this._onDidRegister.dispose();
    this._onDidUnregister.dispose();
  }

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  /**
   * Register a capability provider and inject its tools/skills into registries.
   */
  registerProvider(provider: AgentCapabilityProvider, context: AgentCapabilityContext): void {
    const { id } = provider;

    // If already registered, unregister first (handles re-registration)
    if (this._providers.has(id)) {
      this._logger.info(`Re-registering provider: ${id}`);
      this.unregisterProvider(id);
    }

    const registeredTools: string[] = [];
    const registeredSkills: string[] = [];
    const registeredToolGroups: string[] = [];
    const registeredProviderCards: ProviderCardTarget[] = [];

    // Inject tools
    try {
      const tools: Tool[] = provider.getTools(context);
      for (const tool of tools) {
        this._recordCapabilityNameCollision({
          kind: 'tool',
          name: tool.name,
          providerId: id,
          existingOwner: this._toolOwners.get(tool.name),
          existsInRuntime: this._deps.toolRegistry.get(tool.name) !== undefined,
        });
        this._deps.toolRegistry.register(tool);
        this._toolOwners.set(tool.name, id);
        registeredTools.push(tool.name);
      }
    } catch (err) {
      this._logger.warn(`Failed to get tools from provider "${id}"`, { error: err });
    }

    // Inject skills
    if (provider.getSkills && this._deps.skillRegistry) {
      try {
        const skills: Skill[] = provider.getSkills();
        for (const skill of skills) {
          this._recordCapabilityNameCollision({
            kind: 'skill',
            name: skill.name,
            providerId: id,
            existingOwner: this._skillOwners.get(skill.name),
            existsInRuntime: this._deps.skillRegistry.getSkill(skill.name) !== undefined,
          });
          this._deps.skillRegistry.registerSkill(skill);
          this._skillOwners.set(skill.name, id);
          registeredSkills.push(skill.name);
        }
      } catch (err) {
        this._logger.warn(`Failed to get skills from provider "${id}"`, { error: err });
      }
    }

    // Inject tool groups
    if (provider.getToolGroups && this._deps.toolGroupRegistry) {
      try {
        const groups: ToolGroup[] = provider.getToolGroups();
        for (const group of groups) {
          this._recordCapabilityNameCollision({
            kind: 'tool-group',
            name: group.name,
            providerId: id,
            existingOwner: this._toolGroupOwners.get(group.name),
            existsInRuntime: false,
          });
          this._deps.toolGroupRegistry.register(group);
          this._toolGroupOwners.set(group.name, id);
          registeredToolGroups.push(group.name);
        }
      } catch (err) {
        this._logger.warn(`Failed to get tool groups from provider "${id}"`, { error: err });
      }
    }

    // Inject provider cards
    if (provider.getProviderCards && this._deps.providerCardRegistry) {
      try {
        const cards: ProviderCard[] = provider.getProviderCards(context);
        for (const card of cards) {
          this._recordCapabilityNameCollision({
            kind: 'provider-card',
            name: formatProviderCardTarget(card),
            providerId: id,
            existingOwner: this._providerCardOwners.get(toProviderCardOwnerKey(card)),
            existsInRuntime: false,
          });
          this._deps.providerCardRegistry.register(card);
          this._providerCardOwners.set(toProviderCardOwnerKey(card), id);
          registeredProviderCards.push(toProviderCardTarget(card));
        }
      } catch (err) {
        this._logger.warn(`Failed to get provider cards from provider "${id}"`, { error: err });
      }
    }

    this._providers.set(id, {
      provider,
      protocol: resolveCapabilityProtocolInfo(id, provider, 'provider'),
      registeredTools,
      registeredSkills,
      registeredToolGroups,
      registeredProviderCards,
    });

    this._logger.info(
      `Provider "${id}" v${provider.version} registered: ` +
        `${registeredTools.length} tools, ${registeredSkills.length} skills, ` +
        `${registeredToolGroups.length} tool groups, ${registeredProviderCards.length} provider cards`,
    );

    this.syncToolCategories();
    this._onDidRegister.fire(provider);
  }

  /**
   * Unregister a provider and remove all its injected tools/skills.
   */
  unregisterProvider(id: string): void {
    const entry = this._providers.get(id);
    if (!entry) return;

    // Remove tools
    for (const toolName of entry.registeredTools) {
      this._deps.toolRegistry.unregister(toolName);
      if (this._toolOwners.get(toolName) === id) {
        this._toolOwners.delete(toolName);
      }
    }

    // Remove skills
    if (this._deps.skillRegistry) {
      for (const skillName of entry.registeredSkills) {
        this._deps.skillRegistry.unregisterSkill(skillName);
        if (this._skillOwners.get(skillName) === id) {
          this._skillOwners.delete(skillName);
        }
      }
    }

    // Remove tool groups
    if (this._deps.toolGroupRegistry) {
      for (const groupName of entry.registeredToolGroups) {
        this._deps.toolGroupRegistry.unregister(groupName);
        if (this._toolGroupOwners.get(groupName) === id) {
          this._toolGroupOwners.delete(groupName);
        }
      }
    }

    // Remove provider cards
    if (this._deps.providerCardRegistry) {
      for (const target of entry.registeredProviderCards) {
        this._deps.providerCardRegistry.unregister(target.providerId, undefined, target.modelId);
        const key = toProviderCardOwnerKey(target);
        if (this._providerCardOwners.get(key) === id) {
          this._providerCardOwners.delete(key);
        }
      }
    }

    // Dispose provider
    entry.provider.dispose?.();
    this._providers.delete(id);

    this.syncToolCategories();
    this._logger.info(`Provider "${id}" unregistered`);
    this._onDidUnregister.fire(id);
  }

  /**
   * Rebuild tool categorization from the current tool + tool-group registries.
   *
   * Provider registration is incremental, but the category plane drives tool
   * injection/filtering and needs deterministic state after register, refresh,
   * and unregister. Rebuilding from the runtime source of truth keeps layer
   * assignment stable even when providers hot-reload or overlapping groups
   * change the effective loading tier for a tool.
   */
  syncToolCategories(
    targetRegistry: CapabilityDiscoveryDeps['toolCategoryRegistry'] = this._deps
      .toolCategoryRegistry,
  ): void {
    if (!targetRegistry) {
      return;
    }

    targetRegistry.clearTools?.();

    const layersByTool = this._resolveToolLayers();
    for (const tool of this._deps.toolRegistry.list()) {
      targetRegistry.categorizeTool(tool.name, tool.category, layersByTool.get(tool.name));
    }
  }

  // ---------------------------------------------------------------------------
  // Discovery
  // ---------------------------------------------------------------------------

  /**
   * Scan all installed extensions for capability manifests.
   */
  private _discoverManifests(): void {
    for (const ext of vscode.extensions.all) {
      const manifest = (
        ext.packageJSON as {
          contributes?: { 'neko.agentCapabilities'?: AgentCapabilityManifest };
        }
      )?.contributes?.['neko.agentCapabilities'];

      if (manifest?.id) {
        const protocol = resolveCapabilityProtocolInfo(manifest.id, manifest, 'manifest');
        if (!isSupportedCapabilityProtocol(protocol.protocolVersion)) {
          emitDiagnostic(this._logger, 'warn', {
            code: 'extension.capability.protocol.unsupported',
            reason: 'unsupported-protocol-version',
            message: 'Skipping unsupported capability manifest protocol version.',
            context: {
              providerId: manifest.id,
              protocolVersion: protocol.protocolVersion,
            },
          });
          continue;
        }
        this._manifests.set(manifest.id, manifest);
      }
    }

    this._logger.debug(`Discovered ${this._manifests.size} capability manifest(s)`);
  }

  /**
   * Remove providers whose extensions have been uninstalled.
   */
  private _cleanupRemovedExtensions(): void {
    const installedIds = new Set<string>();
    for (const ext of vscode.extensions.all) {
      const manifest = (
        ext.packageJSON as {
          contributes?: { 'neko.agentCapabilities'?: AgentCapabilityManifest };
        }
      )?.contributes?.['neko.agentCapabilities'];
      if (manifest?.id) {
        installedIds.add(manifest.id);
      }
    }

    for (const [id] of this._providers) {
      if (!installedIds.has(id)) {
        this._logger.info(`Extension for provider "${id}" removed — unregistering`);
        this.unregisterProvider(id);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  /** Get all registered providers */
  getAllProviders(): AgentCapabilityProvider[] {
    return Array.from(this._providers.values()).map((e) => e.provider);
  }

  /**
   * Aggregate `PromptFragment` contributions from every registered
   * provider. Providers that don't implement `getPromptFragments` are
   * skipped silently.
   *
   * Called once per session bring-up (by agentRunner) and passed through
   * to the agent as `AgentSessionConfig.promptFragments`. The agent's
   * SubpackageFragmentsModule projects them into the L3 environment
   * layer at priority 70.
   *
   * Ordering mirrors provider registration order. Duplicate fragment ids
   * across providers are dropped at the module layer (first-writer-wins).
   */
  getAllPromptFragments(): PromptFragment[] {
    if (!this._capabilityContext) {
      if (!this._warnedMissingCapabilityContextForFragments) {
        emitDiagnostic(this._logger, 'warn', {
          code: 'extension.capability.prompt-fragments-skipped',
          reason: 'missing-capability-context',
          message:
            'Skipping capability prompt fragment aggregation because capability context is not initialized.',
          context: {
            providerCount: this._providers.size,
          },
        });
        this._warnedMissingCapabilityContextForFragments = true;
      }
      return [];
    }
    const aggregated: PromptFragment[] = [];
    for (const { provider } of this._providers.values()) {
      if (!provider.getPromptFragments) continue;
      try {
        const fragments = provider.getPromptFragments(this._capabilityContext);
        if (fragments && fragments.length > 0) aggregated.push(...fragments);
      } catch (err) {
        this._logger.warn(`Provider "${provider.id}" getPromptFragments threw; skipping`, err);
      }
    }
    return aggregated;
  }

  /** Get all discovered manifests (including unregistered) */
  getAllManifests(): AgentCapabilityManifest[] {
    return Array.from(this._manifests.values());
  }

  getCapabilityProtocolInfo(id: string): CapabilityProtocolInfo | null {
    const registered = this._providers.get(id);
    if (registered) {
      return registered.protocol;
    }
    const manifest = this._manifests.get(id);
    return manifest ? resolveCapabilityProtocolInfo(id, manifest, 'manifest') : null;
  }

  /** Check if a provider is registered */
  hasProvider(id: string): boolean {
    return this._providers.has(id);
  }

  /** Get provider count */
  get providerCount(): number {
    return this._providers.size;
  }

  private _resolveToolLayers(): Map<string, 'always' | 'dynamic'> {
    const layersByTool = new Map<string, 'always' | 'dynamic'>();
    const groups = this._deps.toolGroupRegistry?.listEnabled?.() ?? [];

    for (const group of groups) {
      const layer = resolveGroupLayer(group);
      for (const toolName of group.tools) {
        const existing = layersByTool.get(toolName);
        if (existing === 'always') {
          continue;
        }
        layersByTool.set(toolName, layer);
      }
    }

    return layersByTool;
  }

  private _recordCapabilityNameCollision(input: {
    kind: 'tool' | 'skill' | 'tool-group' | 'provider-card';
    name: string;
    providerId: string;
    existingOwner?: string;
    existsInRuntime: boolean;
  }): void {
    let reason:
      | 'duplicate-name-in-provider'
      | 'provider-name-collision'
      | 'preexisting-name-collision'
      | null = null;

    if (input.existingOwner === input.providerId) {
      reason = 'duplicate-name-in-provider';
    } else if (input.existingOwner) {
      reason = 'provider-name-collision';
    } else if (input.existsInRuntime) {
      reason = 'preexisting-name-collision';
    }

    if (!reason) {
      return;
    }

    emitDiagnostic(this._logger, 'warn', {
      code: `extension.capability.${input.kind}.name-collision`,
      reason,
      message: 'Capability registration is overwriting a shared runtime name.',
      context: {
        capabilityKind: input.kind,
        name: input.name,
        providerId: input.providerId,
        existingOwner: input.existingOwner ?? null,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Subpackage resolution (ADR §5.2.10)
  // ---------------------------------------------------------------------------

  /**
   * Snapshot of a subpackage from this service's perspective.
   *
   *   - `enabled: true` iff the provider is currently registered (i.e. the
   *     sub-package has activated and contributed its capabilities).
   *   - `enabled: false` when only a manifest has been discovered but
   *     activation hasn't happened (provider not yet registered).
   *
   * Returns null when the id is unknown to both provider + manifest maps.
   * Used by SkillService via the ISubpackageResolver contract to block
   * / warn on requiredSubpackages at Skill activation time.
   */
  getSubpackage(id: string): { id: string; version: string; enabled: boolean } | null {
    const registered = this._providers.get(id);
    if (registered) {
      return {
        id,
        version: registered.provider.version,
        enabled: true,
      };
    }
    const manifest = this._manifests.get(id);
    if (manifest) {
      return {
        id,
        version: manifest.version,
        enabled: false,
      };
    }
    return null;
  }
}

function toProviderCardTarget(card: ProviderCard): ProviderCardTarget {
  return {
    providerId: card.providerId,
    ...(card.modelId ? { modelId: card.modelId } : {}),
  };
}

function toProviderCardOwnerKey(target: ProviderCardTarget): string {
  return target.modelId ? `${target.providerId}\u0000${target.modelId}` : target.providerId;
}

function formatProviderCardTarget(target: ProviderCardTarget): string {
  return target.modelId ? `${target.providerId}/${target.modelId}` : target.providerId;
}

function resolveCapabilityProtocolInfo(
  providerId: string,
  metadata: {
    readonly protocolVersion?: AgentCapabilityProtocolVersion;
    readonly trustLevel?: AgentCapabilityTrustLevel;
    readonly hostRequirements?: readonly AgentCapabilityHostRequirement[];
    readonly lifecycleHooks?: readonly AgentCapabilityLifecycleHook[];
  },
  source: 'provider' | 'manifest',
): CapabilityProtocolInfo {
  return {
    providerId,
    protocolVersion: metadata.protocolVersion ?? '1.0',
    trustLevel: metadata.trustLevel ?? 'core',
    hostRequirements:
      metadata.hostRequirements && metadata.hostRequirements.length > 0
        ? metadata.hostRequirements
        : [{ host: 'vscode' }],
    lifecycleHooks: metadata.lifecycleHooks ?? [],
    source,
  };
}

function isSupportedCapabilityProtocol(version: AgentCapabilityProtocolVersion): boolean {
  return version === '1.0';
}

function resolveGroupLayer(group: ToolGroup): 'always' | 'dynamic' {
  if (group.loadingTier === 'resident') {
    return 'always';
  }
  if (group.loadingTier === 'eager' || group.loadingTier === 'lazy') {
    return 'dynamic';
  }
  if (!group.alwaysActive) {
    return 'dynamic';
  }
  return group.priority !== undefined && group.priority >= 100 ? 'always' : 'dynamic';
}
