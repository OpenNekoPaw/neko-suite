import type {
  NekoWorkbenchHostCapability,
  NekoWorkbenchHostKind,
  NekoWorkbenchTrustLevel,
  WorkbenchContributionDescriptor,
  WorkbenchContributionOwner,
  WorkbenchCustomEditorRuntime,
  WorkbenchDocumentSelector,
  WorkbenchResourceSourceContribution,
  WorkbenchViewRuntime,
  WorkbenchWebviewContribution,
} from './types';
import {
  WorkbenchContributionRegistrationError,
  createWorkbenchContributionRegistry,
} from './registry';

export const NEKO_PLUGIN_MANIFEST_SCHEMA_VERSION = '1.0.0';

export type NekoPluginPermission =
  | 'command.execute'
  | 'ui.view'
  | 'ui.webview'
  | 'resource.read'
  | 'resource.write'
  | 'agent.tool'
  | 'agent.skill'
  | 'engine.viewport'
  | 'engine.execute'
  | 'network.external'
  | 'secrets.read';

export type NekoPluginContributionGroup =
  | 'commands'
  | 'menus'
  | 'keybindings'
  | 'views'
  | 'customEditors'
  | 'webviews'
  | 'resourceSources'
  | 'agentTools'
  | 'skills'
  | 'themes'
  | 'icons';

export interface NekoPluginManifest {
  readonly schemaVersion: typeof NEKO_PLUGIN_MANIFEST_SCHEMA_VERSION;
  readonly id: string;
  readonly displayName: string;
  readonly version: string;
  readonly publisher?: string;
  readonly trust: NekoWorkbenchTrustLevel;
  readonly supportedHosts?: readonly NekoWorkbenchHostKind[];
  readonly activationEvents?: readonly string[];
  readonly permissions?: readonly NekoPluginPermission[];
  readonly contributes?: NekoPluginContributes;
}

export interface NekoPluginContributes {
  readonly commands?: readonly NekoPluginCommandContribution[];
  readonly menus?: readonly NekoPluginMenuContribution[];
  readonly keybindings?: readonly NekoPluginKeybindingContribution[];
  readonly views?: readonly NekoPluginViewContribution[];
  readonly customEditors?: readonly NekoPluginCustomEditorContribution[];
  readonly webviews?: readonly NekoPluginWebviewContribution[];
  readonly resourceSources?: readonly NekoPluginResourceSourceContribution[];
  readonly agentTools?: readonly NekoPluginAgentToolContribution[];
  readonly skills?: readonly NekoPluginSkillContribution[];
  readonly themes?: readonly NekoPluginThemeContribution[];
  readonly icons?: readonly NekoPluginIconContribution[];
}

export interface NekoPluginCommandContribution {
  readonly id: string;
  readonly label: string;
  readonly category?: string;
}

export interface NekoPluginMenuContribution {
  readonly id: string;
  readonly menuId: string;
  readonly commandId: string;
  readonly group?: string;
  readonly when?: string;
}

export interface NekoPluginKeybindingContribution {
  readonly id: string;
  readonly commandId: string;
  readonly key: string;
  readonly mac?: string;
  readonly linux?: string;
  readonly win?: string;
  readonly when?: string;
}

export interface NekoPluginViewContribution {
  readonly id: string;
  readonly label: string;
  readonly containerId: string;
  readonly runtime: WorkbenchViewRuntime;
  readonly icon?: string;
  readonly when?: string;
}

export interface NekoPluginCustomEditorContribution {
  readonly id: string;
  readonly label: string;
  readonly viewType: string;
  readonly selectors: readonly WorkbenchDocumentSelector[];
  readonly runtime: WorkbenchCustomEditorRuntime;
  readonly priority?: 'default' | 'option' | 'builtin';
}

export interface NekoPluginWebviewContribution {
  readonly id: string;
  readonly label: string;
  readonly surface: WorkbenchWebviewContribution['surface'];
  readonly sandbox: WorkbenchWebviewContribution['sandbox'];
}

export interface NekoPluginResourceSourceContribution {
  readonly id: string;
  readonly label: string;
  readonly sourceId: string;
  readonly surfaceId: WorkbenchResourceSourceContribution['surfaceId'];
}

export interface NekoPluginAgentToolContribution {
  readonly id: string;
  readonly label: string;
  readonly toolId: string;
  readonly defaultInjection?: 'disabled' | 'requires-approval' | 'enabled';
}

export interface NekoPluginSkillContribution {
  readonly id: string;
  readonly label: string;
  readonly skillId: string;
  readonly source?: 'workspace' | 'user' | 'plugin' | 'core';
}

export interface NekoPluginThemeContribution {
  readonly id: string;
  readonly label: string;
  readonly themeId: string;
  readonly kindHint: 'light' | 'dark' | 'high-contrast';
}

export interface NekoPluginIconContribution {
  readonly id: string;
  readonly label: string;
  readonly iconId: string;
}

export interface NekoPluginDescriptor {
  readonly manifest: NekoPluginManifest;
  readonly owner: WorkbenchContributionOwner;
  readonly contributions: readonly WorkbenchContributionDescriptor[];
}

export interface NekoPluginManifestProjectionOptions {
  readonly hostCapabilities?: readonly NekoWorkbenchHostCapability[];
}

export interface VscodeSubsetCompatibilityDescriptor {
  readonly source: 'vscode-manifest-subset';
  readonly supportedContributionGroups: readonly NekoPluginContributionGroup[];
  readonly unsupportedContributionGroups: readonly string[];
}

export class NekoPluginManifestValidationError extends Error {
  readonly diagnostic: PluginManifestDiagnostic;

  constructor(diagnostic: PluginManifestDiagnostic) {
    super(diagnostic.message);
    this.name = 'NekoPluginManifestValidationError';
    this.diagnostic = diagnostic;
  }
}

export interface PluginManifestDiagnostic {
  readonly code: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
  readonly pluginId?: string;
  readonly contributionId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

const CONTRIBUTION_GROUPS: readonly NekoPluginContributionGroup[] = [
  'commands',
  'menus',
  'keybindings',
  'views',
  'customEditors',
  'webviews',
  'resourceSources',
  'agentTools',
  'skills',
  'themes',
  'icons',
] as const;

const PLUGIN_TRUST_LEVELS: readonly NekoWorkbenchTrustLevel[] = [
  'core',
  'trusted',
  'community',
  'untrusted',
] as const;

export function projectNekoPluginManifest(
  rawManifest: unknown,
  options: NekoPluginManifestProjectionOptions = {},
): NekoPluginDescriptor {
  const manifest = parseNekoPluginManifest(rawManifest);
  validateManifestPermissions(manifest);

  const owner: WorkbenchContributionOwner = {
    id: manifest.id,
    kind: manifest.trust === 'core' ? 'core-package' : 'plugin',
    displayName: manifest.displayName,
    version: manifest.version,
    trust: manifest.trust,
  };
  const contributions = projectManifestContributions(manifest, owner);
  const registry = createWorkbenchContributionRegistry({
    hostCapabilities: options.hostCapabilities,
  });

  try {
    registry.registerMany(contributions);
  } catch (error: unknown) {
    if (error instanceof WorkbenchContributionRegistrationError) {
      throw new NekoPluginManifestValidationError({
        code: error.diagnostic.code,
        severity: 'error',
        message: error.diagnostic.message,
        pluginId: manifest.id,
        contributionId: error.diagnostic.contributionId,
        metadata: error.diagnostic.metadata,
      });
    }
    throw error;
  }

  return {
    manifest,
    owner,
    contributions: registry.snapshot().contributions,
  };
}

export function describeVscodeSubsetCompatibility(
  contributionGroups: readonly string[],
): VscodeSubsetCompatibilityDescriptor {
  const supportedContributionGroups: NekoPluginContributionGroup[] = [];
  const unsupportedContributionGroups: string[] = [];
  for (const group of contributionGroups) {
    if (isNekoPluginContributionGroup(group)) {
      supportedContributionGroups.push(group);
    } else {
      unsupportedContributionGroups.push(group);
    }
  }
  return {
    source: 'vscode-manifest-subset',
    supportedContributionGroups,
    unsupportedContributionGroups,
  };
}

function parseNekoPluginManifest(rawManifest: unknown): NekoPluginManifest {
  const manifest = readRecord(rawManifest, 'Neko plugin manifest must be an object.');
  const schemaVersion = readRequiredString(manifest, 'schemaVersion');
  if (schemaVersion !== NEKO_PLUGIN_MANIFEST_SCHEMA_VERSION) {
    throw manifestError(
      'unsupportedManifestVersion',
      `Unsupported Neko plugin manifest version: ${schemaVersion}`,
      readOptionalString(manifest, 'id'),
      { schemaVersion },
    );
  }

  const id = readRequiredString(manifest, 'id');
  const displayName = readRequiredString(manifest, 'displayName');
  const version = readRequiredString(manifest, 'version');
  const trust = readTrustLevel(manifest['trust'], id);
  const contributes = readOptionalRecord(manifest['contributes'], 'contributes', id);
  if (contributes) {
    assertKnownContributionGroups(contributes, id);
  }

  return {
    schemaVersion: NEKO_PLUGIN_MANIFEST_SCHEMA_VERSION,
    id,
    displayName,
    version,
    ...(readOptionalString(manifest, 'publisher')
      ? { publisher: readOptionalString(manifest, 'publisher') }
      : {}),
    trust,
    ...(readOptionalStringArray(manifest, 'supportedHosts')
      ? { supportedHosts: readHostKinds(readOptionalStringArray(manifest, 'supportedHosts') ?? [], id) }
      : {}),
    ...(readOptionalStringArray(manifest, 'activationEvents')
      ? { activationEvents: readOptionalStringArray(manifest, 'activationEvents') }
      : {}),
    ...(readOptionalStringArray(manifest, 'permissions')
      ? { permissions: readPermissions(readOptionalStringArray(manifest, 'permissions') ?? [], id) }
      : {}),
    ...(contributes ? { contributes: parseContributes(contributes, id) } : {}),
  };
}

function parseContributes(
  contributes: Readonly<Record<string, unknown>>,
  pluginId: string,
): NekoPluginContributes {
  return {
    ...readCommandContributions(contributes, pluginId),
    ...readMenuContributions(contributes, pluginId),
    ...readKeybindingContributions(contributes, pluginId),
    ...readViewContributions(contributes, pluginId),
    ...readCustomEditorContributions(contributes, pluginId),
    ...readWebviewContributions(contributes, pluginId),
    ...readResourceSourceContributions(contributes, pluginId),
    ...readAgentToolContributions(contributes, pluginId),
    ...readSkillContributions(contributes, pluginId),
    ...readThemeContributions(contributes, pluginId),
    ...readIconContributions(contributes, pluginId),
  };
}

function projectManifestContributions(
  manifest: NekoPluginManifest,
  owner: WorkbenchContributionOwner,
): readonly WorkbenchContributionDescriptor[] {
  const contributes = manifest.contributes;
  if (!contributes) {
    return [];
  }
  const shared = {
    owner,
    activationEvents: manifest.activationEvents,
    supportedHosts: manifest.supportedHosts,
  };
  return [
    ...(contributes.commands ?? []).map(
      (command): WorkbenchContributionDescriptor => ({
        ...shared,
        kind: 'command',
        id: command.id,
        label: command.label,
        category: command.category,
        requiredHostCapabilities: ['command.execute'],
      }),
    ),
    ...(contributes.menus ?? []).map(
      (menu): WorkbenchContributionDescriptor => ({
        ...shared,
        kind: 'menu',
        id: menu.id,
        menuId: menu.menuId,
        commandId: menu.commandId,
        group: menu.group,
        when: menu.when,
        requiredHostCapabilities: ['workbench.menus'],
      }),
    ),
    ...(contributes.keybindings ?? []).map(
      (keybinding): WorkbenchContributionDescriptor => ({
        ...shared,
        kind: 'keybinding',
        id: keybinding.id,
        commandId: keybinding.commandId,
        key: keybinding.key,
        mac: keybinding.mac,
        linux: keybinding.linux,
        win: keybinding.win,
        when: keybinding.when,
        requiredHostCapabilities: ['workbench.keybindings'],
      }),
    ),
    ...(contributes.views ?? []).map(
      (view): WorkbenchContributionDescriptor => ({
        ...shared,
        kind: 'view',
        id: view.id,
        label: view.label,
        containerId: view.containerId,
        runtime: view.runtime,
        icon: view.icon,
        when: view.when,
        requiredHostCapabilities: ['workbench.views'],
      }),
    ),
    ...(contributes.customEditors ?? []).map(
      (editor): WorkbenchContributionDescriptor => ({
        ...shared,
        kind: 'custom-editor',
        id: editor.id,
        label: editor.label,
        viewType: editor.viewType,
        selectors: editor.selectors,
        runtime: editor.runtime,
        priority: editor.priority,
        requiredHostCapabilities: ['workbench.customEditors'],
      }),
    ),
    ...(contributes.webviews ?? []).map(
      (webview): WorkbenchContributionDescriptor => ({
        ...shared,
        kind: 'webview',
        id: webview.id,
        label: webview.label,
        surface: webview.surface,
        sandbox: webview.sandbox,
        requiredHostCapabilities: ['workbench.webviews'],
      }),
    ),
    ...(contributes.resourceSources ?? []).map(
      (resourceSource): WorkbenchContributionDescriptor => ({
        ...shared,
        kind: 'resource-source',
        id: resourceSource.id,
        label: resourceSource.label,
        sourceId: resourceSource.sourceId,
        surfaceId: resourceSource.surfaceId,
        providerKind: 'plugin-provider',
        requiredHostCapabilities: ['workbench.resourceSources', 'resource.read'],
      }),
    ),
    ...(contributes.agentTools ?? []).map(
      (tool): WorkbenchContributionDescriptor => ({
        ...shared,
        kind: 'agent-tool',
        id: tool.id,
        label: tool.label,
        toolId: tool.toolId,
        defaultInjection:
          manifest.trust === 'untrusted'
            ? 'disabled'
            : tool.defaultInjection ?? 'requires-approval',
        requiredHostCapabilities: ['agent.tool'],
      }),
    ),
    ...(contributes.skills ?? []).map(
      (skill): WorkbenchContributionDescriptor => ({
        ...shared,
        kind: 'skill',
        id: skill.id,
        label: skill.label,
        skillId: skill.skillId,
        source: skill.source ?? 'plugin',
        requiredHostCapabilities: ['agent.skill'],
      }),
    ),
    ...(contributes.themes ?? []).map(
      (theme): WorkbenchContributionDescriptor => ({
        ...shared,
        kind: 'theme',
        id: theme.id,
        label: theme.label,
        themeId: theme.themeId,
        kindHint: theme.kindHint,
        requiredHostCapabilities: ['workbench.themes'],
      }),
    ),
    ...(contributes.icons ?? []).map(
      (icon): WorkbenchContributionDescriptor => ({
        ...shared,
        kind: 'icon',
        id: icon.id,
        label: icon.label,
        iconId: icon.iconId,
        requiredHostCapabilities: ['workbench.icons'],
      }),
    ),
  ];
}

function validateManifestPermissions(manifest: NekoPluginManifest): void {
  const permissions = new Set(manifest.permissions ?? []);
  requirePermissionIfPresent(manifest, 'views', 'ui.view', permissions);
  requirePermissionIfPresent(manifest, 'customEditors', 'ui.webview', permissions);
  requirePermissionIfPresent(manifest, 'webviews', 'ui.webview', permissions);
  requirePermissionIfPresent(manifest, 'resourceSources', 'resource.read', permissions);
  requirePermissionIfPresent(manifest, 'agentTools', 'agent.tool', permissions);
  requirePermissionIfPresent(manifest, 'skills', 'agent.skill', permissions);
}

function requirePermissionIfPresent(
  manifest: NekoPluginManifest,
  group: NekoPluginContributionGroup,
  permission: NekoPluginPermission,
  permissions: ReadonlySet<NekoPluginPermission>,
): void {
  const value = manifest.contributes?.[group];
  if (Array.isArray(value) && value.length > 0 && !permissions.has(permission)) {
    throw manifestError(
      'missingPluginPermission',
      `Plugin '${manifest.id}' contributes '${group}' but does not declare permission '${permission}'.`,
      manifest.id,
      { group, permission },
    );
  }
}

function assertKnownContributionGroups(
  contributes: Readonly<Record<string, unknown>>,
  pluginId: string,
): void {
  for (const key of Object.keys(contributes)) {
    if (!isNekoPluginContributionGroup(key)) {
      throw manifestError(
        'unsupportedContributionKind',
        `Unsupported Neko plugin contribution group: ${key}`,
        pluginId,
        { contributionGroup: key },
      );
    }
  }
}

function isNekoPluginContributionGroup(value: string): value is NekoPluginContributionGroup {
  return CONTRIBUTION_GROUPS.includes(value as NekoPluginContributionGroup);
}

function readCommandContributions(
  contributes: Readonly<Record<string, unknown>>,
  pluginId: string,
): { readonly commands?: readonly NekoPluginCommandContribution[] } {
  const entries = readContributionArray(contributes, 'commands', pluginId);
  return entries
    ? {
        commands: entries.map((entry) => ({
          id: readRequiredString(entry, 'id'),
          label: readRequiredString(entry, 'label'),
          ...(readOptionalString(entry, 'category')
            ? { category: readOptionalString(entry, 'category') }
            : {}),
        })),
      }
    : {};
}

function readMenuContributions(
  contributes: Readonly<Record<string, unknown>>,
  pluginId: string,
): { readonly menus?: readonly NekoPluginMenuContribution[] } {
  const entries = readContributionArray(contributes, 'menus', pluginId);
  return entries
    ? {
        menus: entries.map((entry) => ({
          id: readRequiredString(entry, 'id'),
          menuId: readRequiredString(entry, 'menuId'),
          commandId: readRequiredString(entry, 'commandId'),
          ...(readOptionalString(entry, 'group') ? { group: readOptionalString(entry, 'group') } : {}),
          ...(readOptionalString(entry, 'when') ? { when: readOptionalString(entry, 'when') } : {}),
        })),
      }
    : {};
}

function readKeybindingContributions(
  contributes: Readonly<Record<string, unknown>>,
  pluginId: string,
): { readonly keybindings?: readonly NekoPluginKeybindingContribution[] } {
  const entries = readContributionArray(contributes, 'keybindings', pluginId);
  return entries
    ? {
        keybindings: entries.map((entry) => ({
          id: readRequiredString(entry, 'id'),
          commandId: readRequiredString(entry, 'commandId'),
          key: readRequiredString(entry, 'key'),
          ...(readOptionalString(entry, 'mac') ? { mac: readOptionalString(entry, 'mac') } : {}),
          ...(readOptionalString(entry, 'linux') ? { linux: readOptionalString(entry, 'linux') } : {}),
          ...(readOptionalString(entry, 'win') ? { win: readOptionalString(entry, 'win') } : {}),
          ...(readOptionalString(entry, 'when') ? { when: readOptionalString(entry, 'when') } : {}),
        })),
      }
    : {};
}

function readViewContributions(
  contributes: Readonly<Record<string, unknown>>,
  pluginId: string,
): { readonly views?: readonly NekoPluginViewContribution[] } {
  const entries = readContributionArray(contributes, 'views', pluginId);
  return entries
    ? {
        views: entries.map((entry) => ({
          id: readRequiredString(entry, 'id'),
          label: readRequiredString(entry, 'label'),
          containerId: readRequiredString(entry, 'containerId'),
          runtime: readViewRuntime(entry['runtime'], pluginId),
          ...(readOptionalString(entry, 'icon') ? { icon: readOptionalString(entry, 'icon') } : {}),
          ...(readOptionalString(entry, 'when') ? { when: readOptionalString(entry, 'when') } : {}),
        })),
      }
    : {};
}

function readCustomEditorContributions(
  contributes: Readonly<Record<string, unknown>>,
  pluginId: string,
): { readonly customEditors?: readonly NekoPluginCustomEditorContribution[] } {
  const entries = readContributionArray(contributes, 'customEditors', pluginId);
  return entries
    ? {
        customEditors: entries.map((entry) => ({
          id: readRequiredString(entry, 'id'),
          label: readRequiredString(entry, 'label'),
          viewType: readRequiredString(entry, 'viewType'),
          selectors: readDocumentSelectors(entry['selectors'], pluginId),
          runtime: readCustomEditorRuntime(entry['runtime'], pluginId),
          ...(readPriority(entry['priority'], pluginId)
            ? { priority: readPriority(entry['priority'], pluginId) }
            : {}),
        })),
      }
    : {};
}

function readWebviewContributions(
  contributes: Readonly<Record<string, unknown>>,
  pluginId: string,
): { readonly webviews?: readonly NekoPluginWebviewContribution[] } {
  const entries = readContributionArray(contributes, 'webviews', pluginId);
  return entries
    ? {
        webviews: entries.map((entry) => ({
          id: readRequiredString(entry, 'id'),
          label: readRequiredString(entry, 'label'),
          surface: readWebviewSurface(entry['surface'], pluginId),
          sandbox: readWebviewSandbox(entry['sandbox'], pluginId),
        })),
      }
    : {};
}

function readResourceSourceContributions(
  contributes: Readonly<Record<string, unknown>>,
  pluginId: string,
): { readonly resourceSources?: readonly NekoPluginResourceSourceContribution[] } {
  const entries = readContributionArray(contributes, 'resourceSources', pluginId);
  return entries
    ? {
        resourceSources: entries.map((entry) => ({
          id: readRequiredString(entry, 'id'),
          label: readRequiredString(entry, 'label'),
          sourceId: readRequiredString(entry, 'sourceId'),
          surfaceId: readResourceSurfaceId(entry['surfaceId'], pluginId),
        })),
      }
    : {};
}

function readAgentToolContributions(
  contributes: Readonly<Record<string, unknown>>,
  pluginId: string,
): { readonly agentTools?: readonly NekoPluginAgentToolContribution[] } {
  const entries = readContributionArray(contributes, 'agentTools', pluginId);
  return entries
    ? {
        agentTools: entries.map((entry) => ({
          id: readRequiredString(entry, 'id'),
          label: readRequiredString(entry, 'label'),
          toolId: readRequiredString(entry, 'toolId'),
          ...(readDefaultInjection(entry['defaultInjection'], pluginId)
            ? { defaultInjection: readDefaultInjection(entry['defaultInjection'], pluginId) }
            : {}),
        })),
      }
    : {};
}

function readSkillContributions(
  contributes: Readonly<Record<string, unknown>>,
  pluginId: string,
): { readonly skills?: readonly NekoPluginSkillContribution[] } {
  const entries = readContributionArray(contributes, 'skills', pluginId);
  return entries
    ? {
        skills: entries.map((entry) => ({
          id: readRequiredString(entry, 'id'),
          label: readRequiredString(entry, 'label'),
          skillId: readRequiredString(entry, 'skillId'),
          ...(readSkillSource(entry['source'], pluginId) ? { source: readSkillSource(entry['source'], pluginId) } : {}),
        })),
      }
    : {};
}

function readThemeContributions(
  contributes: Readonly<Record<string, unknown>>,
  pluginId: string,
): { readonly themes?: readonly NekoPluginThemeContribution[] } {
  const entries = readContributionArray(contributes, 'themes', pluginId);
  return entries
    ? {
        themes: entries.map((entry) => ({
          id: readRequiredString(entry, 'id'),
          label: readRequiredString(entry, 'label'),
          themeId: readRequiredString(entry, 'themeId'),
          kindHint: readThemeKindHint(entry['kindHint'], pluginId),
        })),
      }
    : {};
}

function readIconContributions(
  contributes: Readonly<Record<string, unknown>>,
  pluginId: string,
): { readonly icons?: readonly NekoPluginIconContribution[] } {
  const entries = readContributionArray(contributes, 'icons', pluginId);
  return entries
    ? {
        icons: entries.map((entry) => ({
          id: readRequiredString(entry, 'id'),
          label: readRequiredString(entry, 'label'),
          iconId: readRequiredString(entry, 'iconId'),
        })),
      }
    : {};
}

function readContributionArray(
  contributes: Readonly<Record<string, unknown>>,
  key: NekoPluginContributionGroup,
  pluginId: string,
): readonly Readonly<Record<string, unknown>>[] | undefined {
  const value = contributes[key];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw manifestError(
      'invalidContributionGroup',
      `Plugin '${pluginId}' contribution group '${key}' must be an array.`,
      pluginId,
      { key },
    );
  }
  return value.map((entry) => readRecord(entry, `Plugin '${pluginId}' contribution '${key}' entries must be objects.`));
}

function readDocumentSelectors(value: unknown, pluginId: string): readonly WorkbenchDocumentSelector[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw manifestError(
      'invalidDocumentSelectors',
      `Plugin '${pluginId}' custom editor selectors must be a non-empty array.`,
      pluginId,
    );
  }
  return value.map((entry) => {
    const selector = readRecord(entry, `Plugin '${pluginId}' document selector must be an object.`);
    return {
      ...(readOptionalString(selector, 'filenamePattern')
        ? { filenamePattern: readOptionalString(selector, 'filenamePattern') }
        : {}),
      ...(readOptionalString(selector, 'extension')
        ? { extension: readOptionalString(selector, 'extension') }
        : {}),
      ...(readOptionalString(selector, 'mediaType')
        ? { mediaType: readOptionalString(selector, 'mediaType') }
        : {}),
      ...(readOptionalString(selector, 'language')
        ? { language: readOptionalString(selector, 'language') }
        : {}),
    };
  });
}

function readRequiredString(record: Readonly<Record<string, unknown>>, field: string): string {
  const value = record[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw manifestError(
      'invalidManifestField',
      `Neko plugin manifest field '${field}' must be a non-empty string.`,
      readOptionalString(record, 'id'),
      { field },
    );
  }
  return value;
}

function readOptionalString(
  record: Readonly<Record<string, unknown>>,
  field: string,
): string | undefined {
  const value = record[field];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readOptionalStringArray(
  record: Readonly<Record<string, unknown>>,
  field: string,
): readonly string[] | undefined {
  const value = record[field];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw manifestError(
      'invalidManifestField',
      `Neko plugin manifest field '${field}' must be a string array.`,
      readOptionalString(record, 'id'),
      { field },
    );
  }
  return value;
}

function readRecord(value: unknown, message: string): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) {
    throw manifestError('invalidManifestShape', message);
  }
  return value;
}

function readOptionalRecord(
  value: unknown,
  field: string,
  pluginId: string,
): Readonly<Record<string, unknown>> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw manifestError(
      'invalidManifestField',
      `Plugin '${pluginId}' manifest field '${field}' must be an object.`,
      pluginId,
      { field },
    );
  }
  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readTrustLevel(value: unknown, pluginId: string): NekoWorkbenchTrustLevel {
  if (typeof value === 'string' && PLUGIN_TRUST_LEVELS.includes(value as NekoWorkbenchTrustLevel)) {
    return value as NekoWorkbenchTrustLevel;
  }
  throw manifestError(
    'invalidTrustLevel',
    `Plugin '${pluginId}' must declare a valid trust level.`,
    pluginId,
    { trust: value },
  );
}

function readHostKinds(
  values: readonly string[],
  pluginId: string,
): readonly NekoWorkbenchHostKind[] {
  const supported: readonly NekoWorkbenchHostKind[] = [
    'vscode',
    'electron',
    'tui',
    'tauri',
    'rust-native',
    'test',
  ];
  return values.map((value) => {
    if (supported.includes(value as NekoWorkbenchHostKind)) {
      return value as NekoWorkbenchHostKind;
    }
    throw manifestError('unsupportedHost', `Unsupported plugin host '${value}'.`, pluginId, {
      host: value,
    });
  });
}

function readPermissions(
  values: readonly string[],
  pluginId: string,
): readonly NekoPluginPermission[] {
  const supported: readonly NekoPluginPermission[] = [
    'command.execute',
    'ui.view',
    'ui.webview',
    'resource.read',
    'resource.write',
    'agent.tool',
    'agent.skill',
    'engine.viewport',
    'engine.execute',
    'network.external',
    'secrets.read',
  ];
  return values.map((value) => {
    if (supported.includes(value as NekoPluginPermission)) {
      return value as NekoPluginPermission;
    }
    throw manifestError('unsupportedPermission', `Unsupported plugin permission '${value}'.`, pluginId, {
      permission: value,
    });
  });
}

function readViewRuntime(value: unknown, pluginId: string): WorkbenchViewRuntime {
  if (value === 'host-adapter' || value === 'sandboxed-webview' || value === 'headless-projection') {
    return value;
  }
  throw manifestError('invalidViewRuntime', `Plugin '${pluginId}' view runtime is invalid.`, pluginId, {
    runtime: value,
  });
}

function readCustomEditorRuntime(value: unknown, pluginId: string): WorkbenchCustomEditorRuntime {
  if (
    value === 'package-host-adapter' ||
    value === 'package-webview-root' ||
    value === 'plugin-webview' ||
    value === 'desktop-native' ||
    value === 'engine-native' ||
    value === 'headless-projection'
  ) {
    return value;
  }
  throw manifestError(
    'invalidCustomEditorRuntime',
    `Plugin '${pluginId}' custom editor runtime is invalid.`,
    pluginId,
    { runtime: value },
  );
}

function readPriority(
  value: unknown,
  pluginId: string,
): NekoPluginCustomEditorContribution['priority'] | undefined {
  if (value === undefined) return undefined;
  if (value === 'default' || value === 'option' || value === 'builtin') {
    return value;
  }
  throw manifestError('invalidCustomEditorPriority', `Plugin '${pluginId}' editor priority is invalid.`, pluginId, {
    priority: value,
  });
}

function readWebviewSurface(
  value: unknown,
  pluginId: string,
): WorkbenchWebviewContribution['surface'] {
  if (value === 'panel' || value === 'editor' || value === 'side-panel' || value === 'floating') {
    return value;
  }
  throw manifestError('invalidWebviewSurface', `Plugin '${pluginId}' webview surface is invalid.`, pluginId, {
    surface: value,
  });
}

function readWebviewSandbox(
  value: unknown,
  pluginId: string,
): WorkbenchWebviewContribution['sandbox'] {
  if (value === 'host-webview' || value === 'iframe' || value === 'isolated-webcontents') {
    return value;
  }
  throw manifestError('invalidWebviewSandbox', `Plugin '${pluginId}' webview sandbox is invalid.`, pluginId, {
    sandbox: value,
  });
}

function readResourceSurfaceId(
  value: unknown,
  pluginId: string,
): WorkbenchResourceSourceContribution['surfaceId'] {
  if (
    value === 'explorer' ||
    value === 'assets' ||
    value === 'generations' ||
    value === 'market' ||
    value === 'skills' ||
    value === 'search' ||
    value === 'custom'
  ) {
    return value;
  }
  throw manifestError('invalidResourceSurface', `Plugin '${pluginId}' resource surface is invalid.`, pluginId, {
    surfaceId: value,
  });
}

function readDefaultInjection(
  value: unknown,
  pluginId: string,
): NekoPluginAgentToolContribution['defaultInjection'] | undefined {
  if (value === undefined) return undefined;
  if (value === 'disabled' || value === 'requires-approval' || value === 'enabled') {
    return value;
  }
  throw manifestError(
    'invalidAgentToolInjection',
    `Plugin '${pluginId}' agent tool injection policy is invalid.`,
    pluginId,
    { defaultInjection: value },
  );
}

function readSkillSource(
  value: unknown,
  pluginId: string,
): NekoPluginSkillContribution['source'] | undefined {
  if (value === undefined) return undefined;
  if (value === 'workspace' || value === 'user' || value === 'plugin' || value === 'core') {
    return value;
  }
  throw manifestError('invalidSkillSource', `Plugin '${pluginId}' skill source is invalid.`, pluginId, {
    source: value,
  });
}

function readThemeKindHint(
  value: unknown,
  pluginId: string,
): NekoPluginThemeContribution['kindHint'] {
  if (value === 'light' || value === 'dark' || value === 'high-contrast') {
    return value;
  }
  throw manifestError('invalidThemeKind', `Plugin '${pluginId}' theme kind is invalid.`, pluginId, {
    kindHint: value,
  });
}

function manifestError(
  code: string,
  message: string,
  pluginId?: string,
  metadata?: Readonly<Record<string, unknown>>,
): NekoPluginManifestValidationError {
  return new NekoPluginManifestValidationError({
    code,
    severity: 'error',
    message,
    ...(pluginId ? { pluginId } : {}),
    ...(metadata ? { metadata } : {}),
  });
}
