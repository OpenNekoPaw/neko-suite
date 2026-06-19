import type {
  MCPServerConfig,
  ModelConfig,
  ModelType,
  ProviderConfig,
  ProtocolVariant,
} from '../types/config';
import { parse, stringify } from 'smol-toml';
import type { AuthConfigJson, CredentialsConfig, MarketConfig, UnifiedConfig } from './types';

export const SUPPORTED_TOML_CONFIG_VERSION = 1;

export interface NekoTomlConfig {
  readonly version?: number;
  readonly default_provider?: string;
  readonly default_model?: string;
  readonly default_media_models?: Partial<Record<ModelType, string>>;
  readonly defaults?: TomlDefaultsConfig;
  readonly skills_dir?: string;
  readonly verbose?: boolean;
  readonly output_format?: 'text' | 'json' | 'markdown';
  readonly thinking_budget?: number;
  readonly custom_system_prompt?: string;
  readonly auto_execute_tools?: boolean;
  readonly stream_responses?: boolean;
  readonly show_tool_calls?: boolean;
  readonly execution_mode?: 'plan' | 'ask' | 'auto';
  readonly providers?: readonly TomlProviderConfig[];
  readonly models?: readonly TomlModelConfig[];
  readonly mcp_servers?: readonly TomlMcpServerConfig[];
  readonly provider_overrides?: Record<string, Partial<TomlProviderConfig>>;
  readonly model_overrides?: Record<string, Partial<TomlModelConfig>>;
  readonly mcp_server_overrides?: Record<string, Partial<TomlMcpServerConfig>>;
  readonly auth?: AuthConfigJson;
  readonly credentials?: CredentialsConfig;
  readonly market?: MarketConfig;
}

export interface TomlDefaultsConfig {
  readonly max_tokens?: number;
  readonly temperature?: number;
}

export interface TomlProviderConfig {
  readonly id: string;
  readonly name: string;
  readonly display_name?: string;
  readonly type: ProviderConfig['type'];
  readonly api_url?: string;
  readonly base_url?: string;
  readonly api_key?: string;
  readonly enabled?: boolean;
  readonly connection_kind?: ProviderConfig['connectionKind'];
  readonly protocol_profile?: ProviderConfig['protocolProfile'];
  readonly support_level?: ProviderConfig['supportLevel'];
  readonly requires_api_key?: boolean;
  readonly builtin?: boolean;
  readonly supports_beta?: boolean;
  readonly use_bearer_auth?: boolean;
  readonly options?: Record<string, unknown>;
  readonly protocol_variant?: TomlProtocolVariant;
}

export interface TomlProtocolVariant {
  readonly base_path?: string;
  readonly auth_type?: ProtocolVariant['authType'];
  readonly auth_header?: string;
  readonly stream_format?: ProtocolVariant['streamFormat'];
  readonly stream_done_marker?: string;
  readonly extra_headers?: Record<string, string>;
  readonly media_endpoints?: TomlMediaEndpoints;
}

export interface TomlMediaEndpoints {
  readonly image_generations?: string;
  readonly video_generations?: string;
  readonly video_status?: string;
  readonly video_cancel?: string;
}

export interface TomlModelConfig {
  readonly id: string;
  readonly name: string;
  readonly display_name?: string;
  readonly provider_id: string;
  readonly protocol?: ModelConfig['protocol'];
  readonly use_bearer_auth?: boolean;
  readonly supports_beta?: boolean;
  readonly type?: ModelConfig['type'];
  readonly capabilities: readonly string[];
  readonly context_window?: number;
  readonly max_output_tokens?: number;
  readonly input_cost_per_1k?: number;
  readonly output_cost_per_1k?: number;
  readonly enabled?: boolean;
  readonly options?: Record<string, unknown>;
}

export interface TomlMcpServerConfig {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: MCPServerConfig['category'];
  readonly transport: MCPServerConfig['transport'];
  readonly command?: string;
  readonly args?: readonly string[];
  readonly env?: Record<string, string>;
  readonly url?: string;
  readonly enabled?: boolean;
  readonly builtin?: boolean;
  readonly homepage?: string;
  readonly tools?: readonly NonNullable<MCPServerConfig['tools']>[number][];
  readonly request_timeout?: number;
}

export interface TomlConfigValidationIssue {
  readonly code: 'unsupportedVersion' | 'duplicateProviderId' | 'duplicateModelId';
  readonly path: string;
  readonly message: string;
}

export class TomlConfigValidationError extends Error {
  constructor(readonly issues: readonly TomlConfigValidationIssue[]) {
    super(issues.map((issue) => issue.message).join('\n'));
    this.name = 'TomlConfigValidationError';
  }
}

export function tomlToUnifiedConfig(config: NekoTomlConfig): UnifiedConfig {
  validateTomlConfig(config);
  return {
    ...(config.default_provider !== undefined ? { defaultProvider: config.default_provider } : {}),
    ...(config.default_model !== undefined ? { defaultModel: config.default_model } : {}),
    ...(config.default_media_models !== undefined
      ? { defaultMediaModels: config.default_media_models }
      : {}),
    ...(config.defaults?.max_tokens !== undefined ? { maxTokens: config.defaults.max_tokens } : {}),
    ...(config.defaults?.temperature !== undefined
      ? { temperature: config.defaults.temperature }
      : {}),
    ...(config.skills_dir !== undefined ? { skillsDir: config.skills_dir } : {}),
    ...(config.verbose !== undefined ? { verbose: config.verbose } : {}),
    ...(config.output_format !== undefined ? { outputFormat: config.output_format } : {}),
    ...(config.thinking_budget !== undefined ? { thinkingBudget: config.thinking_budget } : {}),
    ...(config.custom_system_prompt !== undefined
      ? { customSystemPrompt: config.custom_system_prompt }
      : {}),
    ...(config.auto_execute_tools !== undefined
      ? { autoExecuteTools: config.auto_execute_tools }
      : {}),
    ...(config.stream_responses !== undefined ? { streamResponses: config.stream_responses } : {}),
    ...(config.show_tool_calls !== undefined ? { showToolCalls: config.show_tool_calls } : {}),
    ...(config.execution_mode !== undefined ? { executionMode: config.execution_mode } : {}),
    ...(config.providers ? { providers: config.providers.map(tomlProviderToRuntime) } : {}),
    ...(config.models ? { models: config.models.map(tomlModelToRuntime) } : {}),
    ...(config.mcp_servers ? { mcpServers: config.mcp_servers.map(tomlMcpServerToRuntime) } : {}),
    ...(config.provider_overrides
      ? {
          providerOverrides: mapRecordValues(
            config.provider_overrides,
            tomlProviderOverrideToRuntime,
          ),
        }
      : {}),
    ...(config.model_overrides
      ? { modelOverrides: mapRecordValues(config.model_overrides, tomlModelOverrideToRuntime) }
      : {}),
    ...(config.mcp_server_overrides
      ? {
          mcpServerOverrides: mapRecordValues(
            config.mcp_server_overrides,
            tomlMcpServerOverrideToRuntime,
          ),
        }
      : {}),
    ...(config.auth !== undefined ? { auth: config.auth } : {}),
    ...(config.credentials !== undefined ? { credentials: config.credentials } : {}),
    ...(config.market !== undefined ? { market: config.market } : {}),
  };
}

export function parseTomlConfigText(source: string): UnifiedConfig {
  return tomlToUnifiedConfig(parse(source) as NekoTomlConfig);
}

export function unifiedConfigToToml(config: UnifiedConfig): NekoTomlConfig {
  return {
    version: SUPPORTED_TOML_CONFIG_VERSION,
    ...(config.defaultProvider !== undefined ? { default_provider: config.defaultProvider } : {}),
    ...(config.defaultModel !== undefined ? { default_model: config.defaultModel } : {}),
    ...(config.defaultMediaModels !== undefined
      ? { default_media_models: config.defaultMediaModels }
      : {}),
    ...(config.maxTokens !== undefined || config.temperature !== undefined
      ? {
          defaults: {
            ...(config.maxTokens !== undefined ? { max_tokens: config.maxTokens } : {}),
            ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
          },
        }
      : {}),
    ...(config.skillsDir !== undefined ? { skills_dir: config.skillsDir } : {}),
    ...(config.verbose !== undefined ? { verbose: config.verbose } : {}),
    ...(config.outputFormat !== undefined ? { output_format: config.outputFormat } : {}),
    ...(config.thinkingBudget !== undefined ? { thinking_budget: config.thinkingBudget } : {}),
    ...(config.customSystemPrompt !== undefined
      ? { custom_system_prompt: config.customSystemPrompt }
      : {}),
    ...(config.autoExecuteTools !== undefined
      ? { auto_execute_tools: config.autoExecuteTools }
      : {}),
    ...(config.streamResponses !== undefined ? { stream_responses: config.streamResponses } : {}),
    ...(config.showToolCalls !== undefined ? { show_tool_calls: config.showToolCalls } : {}),
    ...(config.executionMode !== undefined ? { execution_mode: config.executionMode } : {}),
    ...(config.providers ? { providers: config.providers.map(runtimeProviderToToml) } : {}),
    ...(config.models ? { models: config.models.map(runtimeModelToToml) } : {}),
    ...(config.mcpServers ? { mcp_servers: config.mcpServers.map(runtimeMcpServerToToml) } : {}),
    ...(config.providerOverrides
      ? {
          provider_overrides: mapRecordValues(
            config.providerOverrides,
            runtimeProviderOverrideToToml,
          ),
        }
      : {}),
    ...(config.modelOverrides
      ? { model_overrides: mapRecordValues(config.modelOverrides, runtimeModelOverrideToToml) }
      : {}),
    ...(config.mcpServerOverrides
      ? {
          mcp_server_overrides: mapRecordValues(
            config.mcpServerOverrides,
            runtimeMcpServerOverrideToToml,
          ),
        }
      : {}),
    ...(config.auth !== undefined ? { auth: config.auth } : {}),
    ...(config.credentials !== undefined ? { credentials: config.credentials } : {}),
    ...(config.market !== undefined ? { market: config.market } : {}),
  };
}

export function serializeUnifiedConfigToToml(config: UnifiedConfig): string {
  return stringify(unifiedConfigToToml(config));
}

export function validateTomlConfig(config: NekoTomlConfig): void {
  const issues: TomlConfigValidationIssue[] = [];
  const version = config.version ?? SUPPORTED_TOML_CONFIG_VERSION;
  if (!Number.isInteger(version) || version > SUPPORTED_TOML_CONFIG_VERSION) {
    issues.push({
      code: 'unsupportedVersion',
      path: 'version',
      message: `Unsupported Agent config version ${String(version)}. Supported version is ${SUPPORTED_TOML_CONFIG_VERSION}.`,
    });
  }
  collectDuplicateIdIssues(config.providers, 'providers', 'duplicateProviderId', issues);
  collectDuplicateIdIssues(config.models, 'models', 'duplicateModelId', issues);
  if (issues.length > 0) {
    throw new TomlConfigValidationError(issues);
  }
}

function tomlProviderToRuntime(provider: TomlProviderConfig): ProviderConfig {
  return removeUndefined({
    id: provider.id,
    name: provider.name,
    displayName: provider.display_name ?? provider.name,
    type: provider.type,
    apiUrl: provider.api_url ?? provider.base_url ?? '',
    apiKey: provider.api_key,
    enabled: provider.enabled ?? true,
    connectionKind: provider.connection_kind,
    protocolProfile: provider.protocol_profile,
    supportLevel: provider.support_level,
    requiresApiKey: provider.requires_api_key,
    builtin: provider.builtin,
    supportsBeta: provider.supports_beta,
    useBearerAuth: provider.use_bearer_auth,
    options: provider.options,
    protocolVariant: provider.protocol_variant
      ? tomlProtocolVariantToRuntime(provider.protocol_variant)
      : undefined,
  }) as ProviderConfig;
}

function runtimeProviderToToml(provider: ProviderConfig): TomlProviderConfig {
  return removeUndefined({
    id: provider.id,
    name: provider.name,
    display_name: provider.displayName,
    type: provider.type,
    api_url: provider.apiUrl,
    api_key: provider.apiKey,
    enabled: provider.enabled,
    connection_kind: provider.connectionKind,
    protocol_profile: provider.protocolProfile,
    support_level: provider.supportLevel,
    requires_api_key: provider.requiresApiKey,
    builtin: provider.builtin,
    supports_beta: provider.supportsBeta,
    use_bearer_auth: provider.useBearerAuth,
    options: provider.options,
    protocol_variant: provider.protocolVariant
      ? runtimeProtocolVariantToToml(provider.protocolVariant)
      : undefined,
  }) as TomlProviderConfig;
}

function tomlProviderOverrideToRuntime(
  provider: Partial<TomlProviderConfig>,
): Partial<ProviderConfig> {
  return removeUndefined({
    id: provider.id,
    name: provider.name,
    displayName: provider.display_name,
    type: provider.type,
    apiUrl: provider.api_url ?? provider.base_url,
    apiKey: provider.api_key,
    enabled: provider.enabled,
    connectionKind: provider.connection_kind,
    protocolProfile: provider.protocol_profile,
    supportLevel: provider.support_level,
    requiresApiKey: provider.requires_api_key,
    builtin: provider.builtin,
    supportsBeta: provider.supports_beta,
    useBearerAuth: provider.use_bearer_auth,
    options: provider.options,
    protocolVariant: provider.protocol_variant
      ? tomlProtocolVariantToRuntime(provider.protocol_variant)
      : undefined,
  });
}

function runtimeProviderOverrideToToml(
  provider: Partial<ProviderConfig>,
): Partial<TomlProviderConfig> {
  return removeUndefined({
    id: provider.id,
    name: provider.name,
    display_name: provider.displayName,
    type: provider.type,
    api_url: provider.apiUrl,
    api_key: provider.apiKey,
    enabled: provider.enabled,
    connection_kind: provider.connectionKind,
    protocol_profile: provider.protocolProfile,
    support_level: provider.supportLevel,
    requires_api_key: provider.requiresApiKey,
    builtin: provider.builtin,
    supports_beta: provider.supportsBeta,
    use_bearer_auth: provider.useBearerAuth,
    options: provider.options,
    protocol_variant: provider.protocolVariant
      ? runtimeProtocolVariantToToml(provider.protocolVariant)
      : undefined,
  });
}

function tomlProtocolVariantToRuntime(variant: TomlProtocolVariant): ProtocolVariant {
  return removeUndefined({
    basePath: variant.base_path,
    authType: variant.auth_type,
    authHeader: variant.auth_header,
    streamFormat: variant.stream_format,
    streamDoneMarker: variant.stream_done_marker,
    extraHeaders: variant.extra_headers,
    mediaEndpoints: variant.media_endpoints
      ? {
          imageGenerations: variant.media_endpoints.image_generations,
          videoGenerations: variant.media_endpoints.video_generations,
          videoStatus: variant.media_endpoints.video_status,
          videoCancel: variant.media_endpoints.video_cancel,
        }
      : undefined,
  });
}

function runtimeProtocolVariantToToml(variant: ProtocolVariant): TomlProtocolVariant {
  return removeUndefined({
    base_path: variant.basePath,
    auth_type: variant.authType,
    auth_header: variant.authHeader,
    stream_format: variant.streamFormat,
    stream_done_marker: variant.streamDoneMarker,
    extra_headers: variant.extraHeaders,
    media_endpoints: variant.mediaEndpoints
      ? {
          image_generations: variant.mediaEndpoints.imageGenerations,
          video_generations: variant.mediaEndpoints.videoGenerations,
          video_status: variant.mediaEndpoints.videoStatus,
          video_cancel: variant.mediaEndpoints.videoCancel,
        }
      : undefined,
  });
}

function tomlModelToRuntime(model: TomlModelConfig): ModelConfig {
  return removeUndefined({
    id: model.id,
    name: model.name,
    displayName: model.display_name,
    providerId: model.provider_id,
    protocol: model.protocol,
    useBearerAuth: model.use_bearer_auth,
    supportsBeta: model.supports_beta,
    type: model.type,
    capabilities: [...model.capabilities],
    contextWindow: model.context_window,
    maxOutputTokens: model.max_output_tokens,
    inputCostPer1k: model.input_cost_per_1k,
    outputCostPer1k: model.output_cost_per_1k,
    enabled: model.enabled ?? true,
    options: model.options,
  }) as ModelConfig;
}

function runtimeModelToToml(model: ModelConfig): TomlModelConfig {
  return removeUndefined({
    id: model.id,
    name: model.name,
    display_name: model.displayName,
    provider_id: model.providerId,
    protocol: model.protocol,
    use_bearer_auth: model.useBearerAuth,
    supports_beta: model.supportsBeta,
    type: model.type,
    capabilities: model.capabilities,
    context_window: model.contextWindow,
    max_output_tokens: model.maxOutputTokens,
    input_cost_per_1k: model.inputCostPer1k,
    output_cost_per_1k: model.outputCostPer1k,
    enabled: model.enabled,
    options: model.options,
  }) as TomlModelConfig;
}

function tomlModelOverrideToRuntime(model: Partial<TomlModelConfig>): Partial<ModelConfig> {
  return removeUndefined({
    id: model.id,
    name: model.name,
    displayName: model.display_name,
    providerId: model.provider_id,
    protocol: model.protocol,
    useBearerAuth: model.use_bearer_auth,
    supportsBeta: model.supports_beta,
    type: model.type,
    capabilities: model.capabilities ? [...model.capabilities] : undefined,
    contextWindow: model.context_window,
    maxOutputTokens: model.max_output_tokens,
    inputCostPer1k: model.input_cost_per_1k,
    outputCostPer1k: model.output_cost_per_1k,
    enabled: model.enabled,
    options: model.options,
  });
}

function runtimeModelOverrideToToml(model: Partial<ModelConfig>): Partial<TomlModelConfig> {
  return removeUndefined({
    id: model.id,
    name: model.name,
    display_name: model.displayName,
    provider_id: model.providerId,
    protocol: model.protocol,
    use_bearer_auth: model.useBearerAuth,
    supports_beta: model.supportsBeta,
    type: model.type,
    capabilities: model.capabilities,
    context_window: model.contextWindow,
    max_output_tokens: model.maxOutputTokens,
    input_cost_per_1k: model.inputCostPer1k,
    output_cost_per_1k: model.outputCostPer1k,
    enabled: model.enabled,
    options: model.options,
  });
}

function tomlMcpServerToRuntime(server: TomlMcpServerConfig): MCPServerConfig {
  return removeUndefined({
    id: server.id,
    name: server.name,
    description: server.description,
    category: server.category,
    transport: server.transport,
    command: server.command,
    args: server.args ? [...server.args] : undefined,
    env: server.env,
    url: server.url,
    enabled: server.enabled ?? true,
    builtin: server.builtin,
    homepage: server.homepage,
    tools: server.tools ? [...server.tools] : undefined,
    requestTimeout: server.request_timeout,
  }) as MCPServerConfig;
}

function runtimeMcpServerToToml(server: MCPServerConfig): TomlMcpServerConfig {
  return removeUndefined({
    id: server.id,
    name: server.name,
    description: server.description,
    category: server.category,
    transport: server.transport,
    command: server.command,
    args: server.args,
    env: server.env,
    url: server.url,
    enabled: server.enabled,
    builtin: server.builtin,
    homepage: server.homepage,
    tools: server.tools,
    request_timeout: server.requestTimeout,
  }) as TomlMcpServerConfig;
}

function tomlMcpServerOverrideToRuntime(
  server: Partial<TomlMcpServerConfig>,
): Partial<MCPServerConfig> {
  return removeUndefined({
    id: server.id,
    name: server.name,
    description: server.description,
    category: server.category,
    transport: server.transport,
    command: server.command,
    args: server.args ? [...server.args] : undefined,
    env: server.env,
    url: server.url,
    enabled: server.enabled,
    builtin: server.builtin,
    homepage: server.homepage,
    tools: server.tools ? [...server.tools] : undefined,
    requestTimeout: server.request_timeout,
  });
}

function runtimeMcpServerOverrideToToml(
  server: Partial<MCPServerConfig>,
): Partial<TomlMcpServerConfig> {
  return removeUndefined({
    id: server.id,
    name: server.name,
    description: server.description,
    category: server.category,
    transport: server.transport,
    command: server.command,
    args: server.args,
    env: server.env,
    url: server.url,
    enabled: server.enabled,
    builtin: server.builtin,
    homepage: server.homepage,
    tools: server.tools,
    request_timeout: server.requestTimeout,
  });
}

function collectDuplicateIdIssues(
  entries: readonly { readonly id: string }[] | undefined,
  section: string,
  code: TomlConfigValidationIssue['code'],
  issues: TomlConfigValidationIssue[],
): void {
  if (!entries) return;
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.id)) {
      issues.push({
        code,
        path: `${section}.${entry.id}`,
        message: `Duplicate ${section} id: ${entry.id}`,
      });
      continue;
    }
    seen.add(entry.id);
  }
}

function mapRecordValues<TInput, TOutput>(
  value: Record<string, TInput>,
  mapper: (input: TInput) => TOutput,
): Record<string, TOutput> {
  const output: Record<string, TOutput> = {};
  for (const [key, recordValue] of Object.entries(value)) {
    output[key] = mapper(recordValue);
  }
  return output;
}

function removeUndefined<T extends Record<string, unknown>>(value: T): T {
  const output: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value)) {
    if (entryValue !== undefined) {
      output[key] = entryValue;
    }
  }
  return output as T;
}
