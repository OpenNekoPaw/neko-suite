import type { EnabledStateRecord } from '@neko-agent/types';
import {
  buildConfigStateMessage,
  buildConfigStateWithStatusMessage,
  buildConnectionStatesMessage,
  buildConnectionStateChangedMessage,
  buildConfigChangedMessage,
  buildGlobalErrorMessage,
  buildHooksDataMessage,
  buildSkillsDataMessage,
  buildToolSkillsDataMessage,
  type ConnectionStateChangedMessage,
  type ConfigChangedMessage,
  type ConfigStateMessage,
  type ConfigStateWithStatusMessage,
  type ConnectionStatesMessage,
  type GlobalErrorMessage,
  type HooksDataMessage,
  type MarketplaceExecutionEventProjection,
  type MarketplaceProjectionMessage,
  type MarketplaceRequestProjection,
  type ProtocolConnectionStateMap,
  type ProtocolConnectionStatus,
  type SsoErrorMessage,
  type SsoSessionChangedMessage,
  type SsoSessionMessagePayload,
  type SkillsDataMessage,
  type ToolSkillsDataMessage,
  type WebviewToExtensionMessage,
} from '@neko-agent/types';
import type {
  ConfiguredHook,
  ConfiguredSkill,
  ConfiguredSlashCommand,
  ConfiguredToolGroup,
  IAuthSession,
} from '@neko/shared';

export const SKILL_ENABLED_STATE_STORAGE_KEY = 'skillEnabledState';
export const TOOL_SKILL_ENABLED_STATE_STORAGE_KEY = 'toolSkillEnabledState';
export const NEKO_AUTH_EXTENSION_ID = 'neko.neko-auth';

export interface ConfigBridgeRuntimeLogger {
  error(message: string, details?: unknown): void;
}

export type SsoRuntimeMessage = SsoSessionChangedMessage | SsoErrorMessage;

export interface SsoAuthBridge {
  login(options?: { force?: boolean }): Promise<IAuthSession>;
  logout(): Promise<void>;
}

export interface SsoRuntimeEffects {
  getAuth(): Promise<SsoAuthBridge | undefined>;
  postMessage(message: SsoRuntimeMessage): void | Promise<void>;
}

export type SsoLoginRuntimeResult =
  | { status: 'authenticated'; message: SsoSessionChangedMessage }
  | { status: 'unavailable'; message: SsoErrorMessage }
  | { status: 'failed'; message: SsoErrorMessage };

export type SsoLogoutRuntimeResult =
  | { status: 'cleared'; message: SsoSessionChangedMessage }
  | { status: 'failed'; message: SsoErrorMessage };

export type ConfigBridgeQueryMessage =
  | ConfigStateMessage
  | ConfigStateWithStatusMessage
  | SkillsDataMessage
  | HooksDataMessage
  | ConnectionStatesMessage
  | ToolSkillsDataMessage;

export type ConfigBridgeQueryRequest =
  | { type: 'getConfig' }
  | { type: 'getConfigWithStatus' }
  | { type: 'getSkills' }
  | { type: 'getHooks' }
  | { type: 'getConnectionStates' }
  | { type: 'getToolSkills' };

export type ConfigBridgeQueryConfigState = NonNullable<ConfigStateMessage['config']>;

export interface ConfigBridgeQueryRuntimeDeps<
  TConfigState extends ConfigBridgeQueryConfigState = ConfigBridgeQueryConfigState,
> {
  getConfigState(): TConfigState;
  getConnectionStates(): ProtocolConnectionStateMap;
  waitForSkillsInit?(): Promise<void>;
  getSkills(): readonly ConfiguredSkill[];
  getCommands(): readonly ConfiguredSlashCommand[];
  getHooks(): readonly ConfiguredHook[];
  getToolSkills(): readonly ConfiguredToolGroup[];
}

export interface ConfigBridgeQueryRuntimeResult {
  handled: boolean;
  message?: ConfigBridgeQueryMessage;
}

export function buildSkillConfigDataMessage(input: SkillConfigSyncState): SkillsDataMessage {
  return buildSkillsDataMessage(input);
}

export function buildHookConfigDataMessage(hooks: readonly ConfiguredHook[]): HooksDataMessage {
  return buildHooksDataMessage(hooks);
}

export function buildToolSkillConfigDataMessage(
  toolSkills: readonly ConfiguredToolGroup[],
): ToolSkillsDataMessage {
  return buildToolSkillsDataMessage(toolSkills);
}

export function buildConfigChangedRuntimeMessage(): ConfigChangedMessage {
  return buildConfigChangedMessage();
}

export function buildConfigBridgeSsoSessionChangedMessage(
  session: IAuthSession | null,
): SsoSessionChangedMessage {
  return buildSsoSessionChangedMessage(session);
}

export function buildConfigBridgeConnectionStateChangedMessage(input: {
  readonly id: string;
  readonly serviceType: ConnectionStateChangedMessage['serviceType'];
  readonly status: ProtocolConnectionStatus;
  readonly error?: string;
}): ConnectionStateChangedMessage {
  return buildConnectionStateChangedMessage(input);
}

export function buildConfigBridgeGlobalErrorMessage(input: {
  readonly action: string;
  readonly error: unknown;
}): GlobalErrorMessage {
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  return buildGlobalErrorMessage(`Failed to ${input.action}: ${message}`);
}

export function projectConfigBridgeMarketplaceRequest(
  message: WebviewToExtensionMessage,
): MarketplaceRequestProjection | null {
  return projectMarketplaceRequestMessage(message);
}

export function buildConfigBridgeMarketplaceExecutionMessage(
  event: MarketplaceExecutionEventProjection,
): MarketplaceProjectionMessage {
  return buildMarketplaceExecutionMessage(event);
}

export function runConfigBridgeSsoLoginRuntime(
  input: { force?: boolean },
  effects: SsoRuntimeEffects,
): Promise<SsoLoginRuntimeResult> {
  return runSsoLoginRuntime(input, effects);
}

export function runConfigBridgeSsoLogoutRuntime(
  effects: SsoRuntimeEffects,
): Promise<SsoLogoutRuntimeResult> {
  return runSsoLogoutRuntime(effects);
}

async function runSsoLoginRuntime(
  input: { force?: boolean },
  effects: SsoRuntimeEffects,
): Promise<SsoLoginRuntimeResult> {
  const auth = await effects.getAuth();
  if (!auth) {
    const message = buildSsoErrorMessage('neko-auth extension is not installed or active');
    await effects.postMessage(message);
    return { status: 'unavailable', message };
  }

  try {
    const session = await auth.login({
      ...(input.force !== undefined ? { force: input.force } : {}),
    });
    const message = buildSsoSessionChangedMessage(session);
    await effects.postMessage(message);
    return { status: 'authenticated', message };
  } catch (error) {
    const message = buildSsoErrorMessage(error);
    await effects.postMessage(message);
    return { status: 'failed', message };
  }
}

async function runSsoLogoutRuntime(effects: SsoRuntimeEffects): Promise<SsoLogoutRuntimeResult> {
  const auth = await effects.getAuth();

  try {
    await auth?.logout();
    const message = buildSsoSessionChangedMessage(null);
    await effects.postMessage(message);
    return { status: 'cleared', message };
  } catch (error) {
    const message = buildSsoErrorMessage(error);
    await effects.postMessage(message);
    return { status: 'failed', message };
  }
}

function projectAuthSessionToSsoSession(session: IAuthSession | null): SsoSessionMessagePayload {
  if (!session) return null;
  return {
    user: session.user,
    ...(session.plan !== undefined ? { plan: session.plan } : {}),
    ...(session.usage !== undefined ? { usage: session.usage } : {}),
  };
}

function buildSsoSessionChangedMessage(session: IAuthSession | null): SsoSessionChangedMessage {
  return {
    type: 'ssoSessionChanged',
    session: projectAuthSessionToSsoSession(session),
  };
}

function buildSsoErrorMessage(error: unknown): SsoErrorMessage {
  return {
    type: 'ssoError',
    error: error instanceof Error ? error.message : String(error),
  };
}

function projectMarketplaceRequestMessage(
  message: WebviewToExtensionMessage,
): MarketplaceRequestProjection | null {
  switch (message.type) {
    case 'market:search':
      return { kind: 'search', query: message.query };
    case 'market:install':
      return { kind: 'install', packageId: message.packageId, version: message.version };
    case 'market:uninstall':
      return { kind: 'uninstall', packageId: message.packageId };
    case 'market:listInstalled':
      return { kind: 'listInstalled' };
    case 'market:checkUpdates':
      return { kind: 'checkUpdates' };
    case 'market:getFeatured':
      return { kind: 'getFeatured' };
    default:
      return null;
  }
}

function buildMarketplaceExecutionMessage(
  event: MarketplaceExecutionEventProjection,
): MarketplaceProjectionMessage {
  switch (event.kind) {
    case 'searchResult':
      return { type: 'market:searchResult', data: event.data };
    case 'installProgress':
      return { type: 'market:installProgress', data: event.data };
    case 'installResult':
      return { type: 'market:installResult', data: event.data };
    case 'uninstallResult':
      return { type: 'market:uninstallResult', data: event.data };
    case 'installedList':
      return { type: 'market:installedList', data: [...event.data] };
    case 'updates':
      return { type: 'market:updates', data: [...event.data] };
    case 'featured':
      return { type: 'market:featured', data: event.data };
    case 'error':
      return { type: 'market:error', error: event.error };
  }
}

export interface EnabledStateRuntimeStorage {
  load(storageKey: string): EnabledStateRecord | undefined;
  save(storageKey: string, state: EnabledStateRecord): PromiseLike<unknown> | unknown;
}

export interface EnabledStateRuntimeStoreOptions {
  readonly storageKey: string;
  readonly storage?: EnabledStateRuntimeStorage;
  readonly logger?: Partial<ConfigBridgeRuntimeLogger>;
}

export interface EnabledStateRuntimeStore {
  get(key: string): boolean | undefined;
  set(key: string, enabled: boolean): void;
  applyTo<T extends { enabled?: boolean }>(items: readonly T[], keyFn: (item: T) => string): T[];
  toRecord(): EnabledStateRecord;
}

export interface SkillConfigSyncState {
  skills: ConfiguredSkill[];
  commands: ConfiguredSlashCommand[];
}

export interface SkillConfigSyncRuntimeOptions<TScanResult> {
  readonly enabledState: EnabledStateRuntimeStore;
  readonly scanSkills: () => Promise<TScanResult>;
  readonly toConfigured: (scanResult: TScanResult) => SkillConfigSyncState;
  readonly logger?: Partial<ConfigBridgeRuntimeLogger>;
}

export interface SkillConfigSyncRuntime<TScanResult> {
  init(): void;
  waitForInit(): Promise<void>;
  getSkills(): ConfiguredSkill[];
  getCommands(): ConfiguredSlashCommand[];
  handleChanged(scanResult: TScanResult): SkillConfigSyncState;
}

export interface HookConfigSyncRuntimeOptions<TScanResult> {
  readonly scanHooks: () => Promise<TScanResult>;
  readonly toConfigured: (scanResult: TScanResult) => ConfiguredHook[];
  readonly logger?: Partial<ConfigBridgeRuntimeLogger>;
}

export interface HookConfigSyncRuntime<TScanResult> {
  init(): Promise<void>;
  getHooks(): ConfiguredHook[];
  handleChanged(scanResult: TScanResult): ConfiguredHook[];
}

export interface ToolSkillConfigSyncRuntimeOptions {
  readonly enabledState: EnabledStateRuntimeStore;
}

export interface ToolSkillConfigSyncRuntime {
  setToolSkills(toolSkills: readonly ConfiguredToolGroup[]): ConfiguredToolGroup[];
  getToolSkills(): ConfiguredToolGroup[];
}

export function createEnabledStateRuntimeStore(
  options: EnabledStateRuntimeStoreOptions,
): EnabledStateRuntimeStore {
  return new DefaultEnabledStateRuntimeStore(options);
}

export function createSkillConfigSyncRuntime<TScanResult>(
  options: SkillConfigSyncRuntimeOptions<TScanResult>,
): SkillConfigSyncRuntime<TScanResult> {
  return new DefaultSkillConfigSyncRuntime(options);
}

export function createHookConfigSyncRuntime<TScanResult>(
  options: HookConfigSyncRuntimeOptions<TScanResult>,
): HookConfigSyncRuntime<TScanResult> {
  return new DefaultHookConfigSyncRuntime(options);
}

export function createToolSkillConfigSyncRuntime(
  options: ToolSkillConfigSyncRuntimeOptions,
): ToolSkillConfigSyncRuntime {
  return new DefaultToolSkillConfigSyncRuntime(options);
}

class EnabledStateModel {
  private readonly state = new Map<string, boolean>();

  constructor(record?: EnabledStateRecord) {
    if (!record) return;
    for (const [key, value] of Object.entries(record)) {
      this.state.set(key, value);
    }
  }

  get(key: string): boolean | undefined {
    return this.state.get(key);
  }

  set(key: string, enabled: boolean): void {
    this.state.set(key, enabled);
  }

  applyTo<T extends { enabled?: boolean }>(items: readonly T[], keyFn: (item: T) => string): T[] {
    return items.map((item) => {
      const stored = this.state.get(keyFn(item));
      return stored === undefined ? { ...item } : { ...item, enabled: stored };
    });
  }

  toRecord(): EnabledStateRecord {
    const record: EnabledStateRecord = {};
    for (const [key, value] of this.state) {
      record[key] = value;
    }
    return record;
  }
}

export async function runConfigBridgeQueryRuntime<
  TConfigState extends ConfigBridgeQueryConfigState = ConfigBridgeQueryConfigState,
>(
  request: ConfigBridgeQueryRequest,
  deps: ConfigBridgeQueryRuntimeDeps<TConfigState>,
): Promise<ConfigBridgeQueryRuntimeResult> {
  switch (request.type) {
    case 'getConfig':
      return {
        handled: true,
        message: buildConfigStateMessage(deps.getConfigState()),
      };
    case 'getConfigWithStatus':
      return {
        handled: true,
        message: buildConfigStateWithStatusMessage({
          ...deps.getConfigState(),
          connectionStates: deps.getConnectionStates(),
        }),
      };
    case 'getSkills':
      await deps.waitForSkillsInit?.();
      return {
        handled: true,
        message: buildSkillsDataMessage({
          skills: deps.getSkills(),
          commands: deps.getCommands(),
        }),
      };
    case 'getHooks':
      return {
        handled: true,
        message: buildHooksDataMessage(deps.getHooks()),
      };
    case 'getConnectionStates':
      return {
        handled: true,
        message: buildConnectionStatesMessage(deps.getConnectionStates()),
      };
    case 'getToolSkills':
      return {
        handled: true,
        message: buildToolSkillsDataMessage(deps.getToolSkills()),
      };
  }
}

class DefaultEnabledStateRuntimeStore implements EnabledStateRuntimeStore {
  private state = new EnabledStateModel();

  constructor(private readonly options: EnabledStateRuntimeStoreOptions) {
    this.load();
  }

  get(key: string): boolean | undefined {
    return this.state.get(key);
  }

  set(key: string, enabled: boolean): void {
    this.state.set(key, enabled);
    this.save();
  }

  applyTo<T extends { enabled?: boolean }>(items: readonly T[], keyFn: (item: T) => string): T[] {
    return this.state.applyTo(items, keyFn);
  }

  toRecord(): EnabledStateRecord {
    return this.state.toRecord();
  }

  private load(): void {
    try {
      const stored = this.options.storage?.load(this.options.storageKey);
      if (stored) {
        this.state = new EnabledStateModel(stored);
      }
    } catch (error) {
      this.options.logger?.error?.(
        `Failed to load enabled state (${this.options.storageKey}):`,
        error,
      );
    }
  }

  private save(): void {
    try {
      const result = this.options.storage?.save(this.options.storageKey, this.state.toRecord());
      if (isPromiseLike(result)) {
        void Promise.resolve(result).catch((error) => {
          this.options.logger?.error?.(
            `Failed to save enabled state (${this.options.storageKey}):`,
            error,
          );
        });
      }
    } catch (error) {
      this.options.logger?.error?.(
        `Failed to save enabled state (${this.options.storageKey}):`,
        error,
      );
    }
  }
}

class DefaultSkillConfigSyncRuntime<TScanResult> implements SkillConfigSyncRuntime<TScanResult> {
  private initialized = false;
  private syncPromise: Promise<void> | null = null;
  private state: SkillConfigSyncState = { skills: [], commands: [] };

  constructor(private readonly options: SkillConfigSyncRuntimeOptions<TScanResult>) {}

  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.syncPromise = this.doSync();
  }

  async waitForInit(): Promise<void> {
    if (this.syncPromise) {
      await this.syncPromise;
    }
  }

  getSkills(): ConfiguredSkill[] {
    return this.state.skills;
  }

  getCommands(): ConfiguredSlashCommand[] {
    return this.state.commands;
  }

  handleChanged(scanResult: TScanResult): SkillConfigSyncState {
    const configured = this.options.toConfigured(scanResult);
    return this.mergeAndCache(configured.skills, configured.commands);
  }

  private async doSync(): Promise<void> {
    try {
      this.handleChanged(await this.options.scanSkills());
    } catch (error) {
      this.options.logger?.error?.('Failed to initialize skill file sync:', error);
    }
  }

  private mergeAndCache(
    skills: readonly ConfiguredSkill[],
    commands: readonly ConfiguredSlashCommand[],
  ): SkillConfigSyncState {
    this.state = {
      skills: this.options.enabledState.applyTo(skills, (skill) => `skill:${skill.name}`),
      commands: this.options.enabledState.applyTo(
        commands,
        (command) => `command:${command.command}`,
      ),
    };
    return this.state;
  }
}

class DefaultHookConfigSyncRuntime<TScanResult> implements HookConfigSyncRuntime<TScanResult> {
  private initialized = false;
  private cachedHooks: ConfiguredHook[] = [];

  constructor(private readonly options: HookConfigSyncRuntimeOptions<TScanResult>) {}

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    try {
      this.cachedHooks = this.options.toConfigured(await this.options.scanHooks());
    } catch (error) {
      this.options.logger?.error?.('Failed to initialize hook file sync:', error);
    }
  }

  getHooks(): ConfiguredHook[] {
    return this.cachedHooks;
  }

  handleChanged(scanResult: TScanResult): ConfiguredHook[] {
    this.cachedHooks = this.options.toConfigured(scanResult);
    return this.cachedHooks;
  }
}

class DefaultToolSkillConfigSyncRuntime implements ToolSkillConfigSyncRuntime {
  private cachedToolSkills: ConfiguredToolGroup[] = [];

  constructor(private readonly options: ToolSkillConfigSyncRuntimeOptions) {}

  setToolSkills(toolSkills: readonly ConfiguredToolGroup[]): ConfiguredToolGroup[] {
    this.cachedToolSkills = this.options.enabledState.applyTo(
      toolSkills,
      (toolSkill) => toolSkill.name,
    );
    return this.cachedToolSkills;
  }

  getToolSkills(): ConfiguredToolGroup[] {
    return this.cachedToolSkills;
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  );
}
