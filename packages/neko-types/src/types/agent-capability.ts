/**
 * Agent Capability Provider Protocol
 *
 * Defines the contract for sub-packages to provide AI capabilities to neko-agent.
 * Uses a hybrid discovery mechanism:
 * - Static: Sub-packages declare capabilities in package.json `contributes.neko.agentCapabilities`
 * - Dynamic: Sub-packages register providers at runtime via VSCode Command
 *
 * This protocol replaces the centralized `createXxxTools()` pattern where neko-agent
 * manually imports and registers tools from every sub-package.
 */

import type { Tool, ToolCategory } from './tool';
import type { ToolGroup } from './tool-group';
import type { Skill } from './skill';
import type { LoadingTier } from './loading-tier';
import type { PromptFragment } from './prompt-fragment';
import type { ProviderCard } from './provider-card';

// =============================================================================
// Protocol v1 metadata
// =============================================================================

export type AgentCapabilityProtocolVersion = '1.0';

export type AgentCapabilityTrustLevel = 'core' | 'community' | 'untrusted';

export type AgentCapabilityHost = 'vscode' | 'cli' | 'tui';

export type AgentCapabilityLifecycleHook = 'register' | 'activate' | 'deactivate' | 'dispose';

export interface AgentCapabilityHostRequirement {
  readonly host: AgentCapabilityHost;
  readonly optional?: boolean;
  readonly reason?: string;
}

export interface AgentCapabilityProtocolMetadata {
  /** Capability protocol version. Omitted legacy providers are treated as 1.0-compatible. */
  readonly protocolVersion?: AgentCapabilityProtocolVersion;
  /** Trust tier used by future policy enforcement; omitted providers default to core. */
  readonly trustLevel?: AgentCapabilityTrustLevel;
  /** Hosts supported by this provider. Omitted means vscode-only for legacy compatibility. */
  readonly hostRequirements?: readonly AgentCapabilityHostRequirement[];
  /** Lifecycle hooks implemented by the provider. Informational in Stage 1. */
  readonly lifecycleHooks?: readonly AgentCapabilityLifecycleHook[];
}

export interface CapabilityContributionV1 extends AgentCapabilityProtocolMetadata {
  readonly id: string;
  readonly version: string;
  readonly displayName: string;
  readonly capabilities: readonly CapabilityDeclaration[];
}

// =============================================================================
// Static Manifest (package.json contributes)
// =============================================================================

/**
 * Declared in a sub-package's package.json under `contributes.neko.agentCapabilities`.
 * Used by neko-agent for static discovery at startup — before the sub-package activates.
 */
export interface AgentCapabilityManifest extends AgentCapabilityProtocolMetadata {
  /** Unique provider ID matching the extension's short name (e.g. "neko-cut") */
  id: string;

  /** Semantic version of the capability set */
  version: string;

  /** Human-readable display name */
  displayName: string;

  /** Static capability declarations (for AI tool discovery metadata) */
  capabilities: CapabilityDeclaration[];
}

/**
 * Static declaration of a single capability.
 * Only metadata — the actual Tool/Skill implementation is provided at runtime.
 */
export interface CapabilityDeclaration {
  /** Capability type */
  type: 'tool' | 'skill' | 'toolGroup';

  /** Name (must match the runtime Tool.name / Skill.name / ToolGroup.name) */
  name: string;

  /** Tool category for filtering */
  category?: ToolCategory;

  /** Human-readable description */
  description: string;

  /** Loading tier for tiered lazy loading */
  loadingTier?: LoadingTier;
}

// =============================================================================
// Platform service interfaces for capability providers (minimal L0 contracts)
// =============================================================================

/**
 * Minimal media generation interface exposed to capability providers.
 * Subset of MediaGenerationService — avoids sub-packages depending on @neko/platform.
 */
export interface ICapabilityMediaService {
  /**
   * Generate an image.
   *
   * Capability providers may pass base64 fields for legacy adapters, or
   * `referenceImageUri` / `maskUri` / `controlImageUri` for extension-host
   * file-backed inputs that the platform materializes before provider execution.
   */
  generateImage(request: { prompt: string; [key: string]: unknown }): Promise<{ id: string }>;
  generateVideo(request: { prompt: string; [key: string]: unknown }): Promise<{ id: string }>;
  waitForTask(
    taskId: string,
    timeout?: number,
  ): Promise<{
    status: string;
    outputs?: Array<{ url: string; mimeType?: string }>;
  }>;
  /** Cancel a running media task when the underlying platform supports it. */
  cancelTask?(taskId: string): Promise<boolean>;
}

/**
 * Minimal config interface exposed to capability providers.
 * Subset of ConfigManager — avoids sub-packages depending on @neko/platform.
 */
export interface ICapabilityConfigManager {
  getEnabledModels(): Array<{ id: string; name: string; type?: string }>;
}

// =============================================================================
// Runtime Provider (dynamic registration)
// =============================================================================

/**
 * Context passed to providers when requesting tools.
 * Keeps the provider decoupled from VSCode API and @neko/platform at the type level.
 *
 * Platform services are optional — providers that don't need them (e.g. neko-engine)
 * simply ignore them. Providers that need media generation (e.g. neko-canvas, neko-sketch)
 * use `mediaService` and `configManager`.
 */
export interface AgentCapabilityContext {
  /**
   * Extension context handle (opaque at L0; sub-packages cast to vscode.ExtensionContext at L1).
   */
  extensionContext: unknown;

  /** Media generation service (image/video/music/TTS). Injected by neko-agent when available. */
  mediaService?: ICapabilityMediaService;

  /** Config manager for model routing. Injected by neko-agent when available. */
  configManager?: ICapabilityConfigManager;

  /** Embedding function for semantic search. Injected by neko-agent when available. */
  embedFn?: (texts: string[]) => Promise<number[][]>;
}

/**
 * Runtime capability provider implemented by each sub-package.
 *
 * Sub-packages export a class implementing this interface and register it
 * via `vscode.commands.executeCommand('neko.agent.registerCapabilities', provider)`.
 *
 * neko-agent discovers providers through:
 * 1. Static manifest scan → identifies which extensions have capabilities
 * 2. Dynamic registration → receives the provider instance at runtime
 */
export interface AgentCapabilityProvider extends AgentCapabilityProtocolMetadata {
  /** Provider ID (must match manifest.id) */
  readonly id: string;

  /** Provider version (must match manifest.version) */
  readonly version: string;

  /**
   * Return tools provided by this sub-package.
   * Called once during registration; returned tools are registered in the ToolRegistry.
   */
  getTools(context: AgentCapabilityContext): Tool[];

  /**
   * Optional: Return skills provided by this sub-package.
   * Skills are workflow templates that reference tools from getTools().
   */
  getSkills?(): Skill[];

  /**
   * Optional: Return tool groups for tiered lazy loading.
   * Groups organize tools by domain for selective activation.
   */
  getToolGroups?(): ToolGroup[];

  /**
   * Optional: Return prompt fragments contributed by this sub-package.
   *
   * Fragments are domain-specific usage conventions for this provider's
   * tools (e.g. "timestamps are in milliseconds", "add tracks before
   * inserting elements"). They are injected into the agent's L3
   * environment layer — under any user-authored AGENTS.md override
   * (priority 80) but above project / global memory (60 / 50).
   *
   * Fragment ids must be globally unique across providers; convention is
   * `{package}:{local-id}` (e.g. `neko-cut:timeline-basics`).
   */
  getPromptFragments?(context: AgentCapabilityContext): PromptFragment[];

  /**
   * Optional: Return ProviderCards contributed by this sub-package.
   *
   * ProviderCards describe model syntax, concept coverage, and training-profile
   * preferences for ProviderExpressionContext. They are registered into the
   * ProviderCard registry when available, but remain optional for backward
   * compatibility with existing AgentCapabilityProvider implementations.
   */
  getProviderCards?(context: AgentCapabilityContext): ProviderCard[];

  /**
   * Optional: Cleanup when the provider is unregistered (extension deactivated).
   */
  dispose?(): void;
}
