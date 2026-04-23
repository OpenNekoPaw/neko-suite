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
import type {
  AgentCapabilityProvider,
  AgentCapabilityManifest,
  AgentCapabilityContext,
  IToolRegistry,
  Tool,
  ToolGroup,
  Skill,
  ISkillRegistry,
  PromptFragment,
} from '@neko/shared';
import { getRootLogger } from '../base';

// =============================================================================
// Types
// =============================================================================

interface RegisteredProvider {
  provider: AgentCapabilityProvider;
  /** Tool names registered by this provider (for cleanup) */
  registeredTools: string[];
  /** Skill names registered by this provider (for cleanup) */
  registeredSkills: string[];
  /** ToolGroup names registered by this provider (for cleanup) */
  registeredToolGroups: string[];
}

export interface CapabilityDiscoveryDeps {
  toolRegistry: IToolRegistry;
  skillRegistry?: ISkillRegistry;
  toolGroupRegistry?: {
    register(group: ToolGroup): void;
    unregister(name: string): void;
  };
}

// =============================================================================
// Service
// =============================================================================

export class CapabilityDiscoveryService implements vscode.Disposable {
  private readonly _providers = new Map<string, RegisteredProvider>();
  private readonly _manifests = new Map<string, AgentCapabilityManifest>();
  private readonly _deps: CapabilityDiscoveryDeps;
  private readonly _disposables: vscode.Disposable[] = [];
  private readonly _logger = getRootLogger().child('CapabilityDiscovery');
  private _capabilityContext: AgentCapabilityContext | null = null;

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

    // Inject tools
    try {
      const tools: Tool[] = provider.getTools(context);
      for (const tool of tools) {
        this._deps.toolRegistry.register(tool);
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
          this._deps.skillRegistry.registerSkill(skill);
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
          this._deps.toolGroupRegistry.register(group);
          registeredToolGroups.push(group.name);
        }
      } catch (err) {
        this._logger.warn(`Failed to get tool groups from provider "${id}"`, { error: err });
      }
    }

    this._providers.set(id, {
      provider,
      registeredTools,
      registeredSkills,
      registeredToolGroups,
    });

    this._logger.info(
      `Provider "${id}" v${provider.version} registered: ` +
        `${registeredTools.length} tools, ${registeredSkills.length} skills, ` +
        `${registeredToolGroups.length} tool groups`,
    );

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
    }

    // Remove skills
    if (this._deps.skillRegistry) {
      for (const skillName of entry.registeredSkills) {
        this._deps.skillRegistry.unregisterSkill(skillName);
      }
    }

    // Remove tool groups
    if (this._deps.toolGroupRegistry) {
      for (const groupName of entry.registeredToolGroups) {
        this._deps.toolGroupRegistry.unregister(groupName);
      }
    }

    // Dispose provider
    entry.provider.dispose?.();
    this._providers.delete(id);

    this._logger.info(`Provider "${id}" unregistered`);
    this._onDidUnregister.fire(id);
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
    if (!this._capabilityContext) return [];
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

  /** Check if a provider is registered */
  hasProvider(id: string): boolean {
    return this._providers.has(id);
  }

  /** Get provider count */
  get providerCount(): number {
    return this._providers.size;
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
