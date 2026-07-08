export type NekoWorkbenchHostKind =
  | 'vscode'
  | 'electron'
  | 'tui'
  | 'tauri'
  | 'rust-native'
  | 'test';

export type NekoWorkbenchTrustLevel = 'core' | 'trusted' | 'community' | 'untrusted';

export type NekoWorkbenchOwnerKind =
  | 'core-package'
  | 'workspace-package'
  | 'plugin'
  | 'user-plugin'
  | 'vscode-compat';

export type NekoWorkbenchContributionKind =
  | 'command'
  | 'menu'
  | 'keybinding'
  | 'view-container'
  | 'view'
  | 'custom-editor'
  | 'webview'
  | 'resource-source'
  | 'agent-surface'
  | 'viewport-session'
  | 'theme'
  | 'icon'
  | 'skill'
  | 'agent-tool';

export type NekoWorkbenchHostCapability =
  | 'command.execute'
  | 'workbench.menus'
  | 'workbench.keybindings'
  | 'workbench.views'
  | 'workbench.customEditors'
  | 'workbench.webviews'
  | 'workbench.resourceSources'
  | 'workbench.agentSurfaces'
  | 'workbench.themes'
  | 'workbench.icons'
  | 'workspace.files'
  | 'resource.read'
  | 'resource.write'
  | 'agent.tool'
  | 'agent.skill'
  | 'engine.viewport'
  | 'engine.execute'
  | 'network.external'
  | 'secrets.read';

export type WorkbenchDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface WorkbenchDiagnostic {
  readonly code: string;
  readonly severity: WorkbenchDiagnosticSeverity;
  readonly message: string;
  readonly ownerId?: string;
  readonly contributionId?: string;
  readonly contributionKind?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface WorkbenchContributionOwner {
  readonly id: string;
  readonly kind: NekoWorkbenchOwnerKind;
  readonly displayName?: string;
  readonly version?: string;
  readonly trust: NekoWorkbenchTrustLevel;
}

export interface WorkbenchContributionBase {
  readonly id: string;
  readonly kind: NekoWorkbenchContributionKind;
  readonly owner: WorkbenchContributionOwner;
  readonly label?: string;
  readonly i18nKey?: string;
  readonly activationEvents?: readonly string[];
  readonly supportedHosts?: readonly NekoWorkbenchHostKind[];
  readonly requiredHostCapabilities?: readonly NekoWorkbenchHostCapability[];
  readonly when?: string;
}

export interface WorkbenchCommandContribution extends WorkbenchContributionBase {
  readonly kind: 'command';
  readonly category?: string;
}

export interface WorkbenchMenuContribution extends WorkbenchContributionBase {
  readonly kind: 'menu';
  readonly menuId: string;
  readonly commandId: string;
  readonly group?: string;
}

export interface WorkbenchKeybindingContribution extends WorkbenchContributionBase {
  readonly kind: 'keybinding';
  readonly commandId: string;
  readonly key: string;
  readonly mac?: string;
  readonly linux?: string;
  readonly win?: string;
}

export type WorkbenchViewContainerLocation =
  | 'activity-bar'
  | 'primary-sidebar'
  | 'secondary-sidebar'
  | 'panel'
  | 'editor'
  | 'floating';

export interface WorkbenchViewContainerContribution extends WorkbenchContributionBase {
  readonly kind: 'view-container';
  readonly location: WorkbenchViewContainerLocation;
  readonly icon?: string;
}

export type WorkbenchViewRuntime = 'host-adapter' | 'sandboxed-webview' | 'headless-projection';

export interface WorkbenchViewContribution extends WorkbenchContributionBase {
  readonly kind: 'view';
  readonly containerId: string;
  readonly runtime: WorkbenchViewRuntime;
  readonly icon?: string;
}

export interface WorkbenchDocumentSelector {
  readonly filenamePattern?: string;
  readonly extension?: string;
  readonly mediaType?: string;
  readonly language?: string;
}

export type WorkbenchCustomEditorRuntime =
  | 'package-host-adapter'
  | 'plugin-webview'
  | 'desktop-native'
  | 'engine-native'
  | 'headless-projection';

export interface WorkbenchCustomEditorContribution extends WorkbenchContributionBase {
  readonly kind: 'custom-editor';
  readonly viewType: string;
  readonly selectors: readonly WorkbenchDocumentSelector[];
  readonly runtime: WorkbenchCustomEditorRuntime;
  readonly priority?: 'default' | 'option' | 'builtin';
}

export interface WorkbenchWebviewContribution extends WorkbenchContributionBase {
  readonly kind: 'webview';
  readonly surface: 'panel' | 'editor' | 'side-panel' | 'floating';
  readonly sandbox: 'host-webview' | 'iframe' | 'isolated-webcontents';
}

export interface WorkbenchResourceSourceContribution extends WorkbenchContributionBase {
  readonly kind: 'resource-source';
  readonly sourceId: string;
  readonly surfaceId:
    | 'explorer'
    | 'assets'
    | 'generations'
    | 'market'
    | 'skills'
    | 'search'
    | 'custom';
  readonly providerKind: 'domain-provider' | 'plugin-provider' | 'bootstrap-temporary';
}

export interface WorkbenchStableResourceRef {
  readonly kind: string;
  readonly id: string;
  readonly source: string;
}

export interface WorkbenchResourceRuntimeProjection {
  readonly kind: 'thumbnail' | 'preview' | 'action-ui' | 'webview-uri' | 'engine-descriptor';
  readonly uri?: string;
  readonly descriptorId?: string;
  readonly currentSessionOnly: true;
}

export interface WorkbenchResourceNodeProjection {
  readonly id: string;
  readonly sourceId: string;
  readonly label: string;
  readonly stableRef: WorkbenchStableResourceRef;
  readonly runtimeProjections?: readonly WorkbenchResourceRuntimeProjection[];
}

export type WorkbenchAgentSurfacePlacement =
  | 'right-panel'
  | 'main-panel'
  | 'floating-composer'
  | 'command-palette'
  | 'status';

export interface WorkbenchAgentSurfaceContribution extends WorkbenchContributionBase {
  readonly kind: 'agent-surface';
  readonly placement: WorkbenchAgentSurfacePlacement;
  readonly runtime: 'agent-package-root' | 'plugin-agent-card' | 'headless-projection';
}

export interface WorkbenchViewportSessionContribution extends WorkbenchContributionBase {
  readonly kind: 'viewport-session';
  readonly ownerRuntime: 'neko-engine';
  readonly authoritative: true;
  readonly capabilities: readonly string[];
  readonly nonAuthoritativeWebSurfaces?: readonly string[];
}

export interface WorkbenchThemeContribution extends WorkbenchContributionBase {
  readonly kind: 'theme';
  readonly themeId: string;
  readonly kindHint: 'light' | 'dark' | 'high-contrast';
}

export interface WorkbenchIconContribution extends WorkbenchContributionBase {
  readonly kind: 'icon';
  readonly iconId: string;
}

export interface WorkbenchSkillContribution extends WorkbenchContributionBase {
  readonly kind: 'skill';
  readonly skillId: string;
  readonly source: 'workspace' | 'user' | 'plugin' | 'core';
}

export interface WorkbenchAgentToolContribution extends WorkbenchContributionBase {
  readonly kind: 'agent-tool';
  readonly toolId: string;
  readonly defaultInjection: 'disabled' | 'requires-approval' | 'enabled';
}

export type WorkbenchContributionDescriptor =
  | WorkbenchCommandContribution
  | WorkbenchMenuContribution
  | WorkbenchKeybindingContribution
  | WorkbenchViewContainerContribution
  | WorkbenchViewContribution
  | WorkbenchCustomEditorContribution
  | WorkbenchWebviewContribution
  | WorkbenchResourceSourceContribution
  | WorkbenchAgentSurfaceContribution
  | WorkbenchViewportSessionContribution
  | WorkbenchThemeContribution
  | WorkbenchIconContribution
  | WorkbenchSkillContribution
  | WorkbenchAgentToolContribution;

export interface WorkbenchContributionSnapshot {
  readonly contributions: readonly WorkbenchContributionDescriptor[];
  readonly diagnostics: readonly WorkbenchDiagnostic[];
  readonly temporaryBootstrapContributionIds: readonly string[];
}
