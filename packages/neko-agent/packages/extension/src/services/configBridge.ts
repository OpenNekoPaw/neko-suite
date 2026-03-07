/**
 * ConfigBridge - 统一配置消息处理服务
 *
 * 职责：处理 Webview → Platform.ConfigManager 的配置 CRUD 操作
 * 被 VideoEditor 和 Chat 两个 Webview 共用，消除重复代码
 * 支持连接状态同步到 Webview
 * 支持提示词文件系统持久化
 * 支持 Skill 文件系统加载与监听
 */

import * as vscode from 'vscode';
import type { Platform } from '@neko/platform';
import { getLogger } from '../base';
import type {
  ConfigState,
  PromptPresetConfig,
  ProviderConfig,
  ModelConfig,
  ConfiguredSkill,
  ConfiguredSlashCommand,
  ConfiguredHook,
  ConfiguredToolSkill,
  TaskDefaults,
} from '@neko/shared';
import type { UnifiedConfig } from '@neko/shared';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type {
  ConnectionStateManager,
  ConnectionStateChangeEvent,
  ConnectionStatus,
} from './connectionStateManager';
import { getPromptFileService, type PromptFileService } from './PromptFileService';
import { getSkillFileService, type SkillFileService, type SkillScanResult } from './SkillFileService';
import { getHookFileService, type HookFileService, type HookScanResult } from './HookFileService';

const logger = getLogger('ConfigBridge');

/**
 * 消息发送函数类型
 */
type PostMessageFn = (message: Record<string, unknown>) => void;

/**
 * 扩展的配置状态（包含连接状态）
 */
export interface ConfigStateWithStatus extends ConfigState {
  connectionStates: Record<string, { status: ConnectionStatus; error?: string }>;
}

/**
 * 扩展的配置状态（包含 Skills 和 Hooks）
 */
export interface ConfigStateWithSkills extends ConfigState {
  configuredSkills: ConfiguredSkill[];
  configuredCommands: ConfiguredSlashCommand[];
  configuredHooks: ConfiguredHook[];
  configuredToolSkills: ConfiguredToolSkill[];
}

/**
 * Storage key for skill enabled state
 */
const SKILL_ENABLED_STATE_KEY = 'skillEnabledState';

/**
 * 配置消息桥接器
 */
export class ConfigBridge implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private activeWebviews: Set<PostMessageFn> = new Set();
  private promptFileService: PromptFileService;
  private skillFileService: SkillFileService;
  private hookFileService: HookFileService;
  private promptSyncInitialized = false;
  private skillSyncInitialized = false;
  private hookSyncInitialized = false;

  // Promise to track skill initialization completion
  private skillSyncPromise: Promise<void> | null = null;

  // Cached skills data
  private cachedSkills: ConfiguredSkill[] = [];
  private cachedCommands: ConfiguredSlashCommand[] = [];

  // Persisted enabled state for skills and commands
  // Key format: 'skill:<name>' or 'command:<name>'
  private skillEnabledState: Map<string, boolean> = new Map();

  // Cached hooks data
  private cachedHooks: ConfiguredHook[] = [];

  // Cached ToolSkills data (from ToolSkillRegistry)
  private cachedToolSkills: ConfiguredToolSkill[] = [];

  // ToolSkill enabled state persistence key
  private static readonly TOOL_SKILL_ENABLED_STATE_KEY = 'toolSkillEnabledState';
  private toolSkillEnabledState: Map<string, boolean> = new Map();

  // Config file watcher cleanup functions
  private configFileWatcherCleanups: Array<() => void> = [];

  constructor(
    private readonly platform: Platform,
    private readonly connectionStateManager?: ConnectionStateManager,
    private readonly context?: vscode.ExtensionContext
  ) {
    // Initialize prompt file service
    this.promptFileService = getPromptFileService();

    // Initialize skill file service
    this.skillFileService = getSkillFileService();

    // Initialize hook file service
    this.hookFileService = getHookFileService();

    // Load persisted skill enabled state from globalState
    this.loadSkillEnabledState();

    // Load persisted ToolSkill enabled state from globalState
    this.loadToolSkillEnabledState();

    // 监听连接状态变化，广播给所有注册的 Webview
    if (connectionStateManager) {
      const listener = connectionStateManager.addListener((event) => {
        this.broadcastConnectionStateChange(event);
      });
      this.disposables.push(listener);
    }

    // 监听 skill 变更，广播给所有注册的 Webview
    this.disposables.push(
      this.skillFileService.onSkillsChanged((result) => {
        this.handleSkillsChanged(result);
      })
    );

    // 监听 hook 变更，广播给所有注册的 Webview
    this.disposables.push(
      this.hookFileService.onHooksChanged((result) => {
        this.handleHooksChanged(result);
      })
    );

    // Initialize prompt file sync
    this.initPromptFileSync();

    // Initialize skill file sync
    this.initSkillFileSync();

    // Initialize hook file sync
    this.initHookFileSync();

    // Initialize config file import and watching
    void this.initConfigFileImport();
    this.watchConfigFiles();
  }

  /**
   * 注册 Webview 接收连接状态更新
   */
  registerWebview(postMessage: PostMessageFn): vscode.Disposable {
    this.activeWebviews.add(postMessage);

    // 立即发送当前连接状态
    if (this.connectionStateManager) {
      postMessage({
        type: 'connectionStates',
        states: this.connectionStateManager.getStatesMap(),
      });
    }

    return {
      dispose: () => {
        this.activeWebviews.delete(postMessage);
      },
    };
  }

  /**
   * 处理配置相关消息
   * @param message 来自 Webview 的消息
   * @param postMessage 发送消息回 Webview 的函数
   * @returns true 如果消息被处理，false 表示不是配置消息
   */
  async handleMessage(
    message: { type: string; [key: string]: unknown },
    postMessage: PostMessageFn
  ): Promise<boolean> {
    const cm = this.platform.config;

    try {
      switch (message.type) {
        case 'getConfig':
          postMessage({ type: 'configState', config: this.buildConfigState() });
          return true;

        case 'getConfigWithStatus':
          postMessage({
            type: 'configStateWithStatus',
            config: this.buildConfigStateWithStatus(),
          });
          return true;

        case 'getSkills':
          // Wait for skill sync to complete before returning data
          if (this.skillSyncPromise) {
            await this.skillSyncPromise;
          }
          postMessage({
            type: 'skillsData',
            skills: this.cachedSkills,
            commands: this.cachedCommands,
          });
          return true;

        case 'getHooks':
          postMessage({
            type: 'hooksData',
            hooks: this.cachedHooks,
          });
          return true;

        case 'getConnectionStates':
          if (this.connectionStateManager) {
            postMessage({
              type: 'connectionStates',
              states: this.connectionStateManager.getStatesMap(),
            });
          }
          return true;

        case 'getToolSkills':
          postMessage({
            type: 'toolSkillsData',
            toolSkills: this.cachedToolSkills,
          });
          return true;

        case 'updatePrompt': {
          const prompt = message.prompt as PromptPresetConfig;

          // Check if source changed - need to delete old file and create in new location
          const existingPrompt = cm.getPrompts().find(p => p.id === prompt.id);
          if (existingPrompt && existingPrompt.filePath && existingPrompt.source !== prompt.source) {
            // Source changed, delete old file
            const oldFilePath = await this.resolvePromptFilePath(existingPrompt);
            if (oldFilePath) {
              await this.promptFileService.deletePromptFile(oldFilePath);
              logger.info('Deleted old prompt file after source change:', oldFilePath);
            }
            // Keep just the filename for creating in new location
            const pathModule = await import('path');
            prompt.filePath = pathModule.basename(existingPrompt.filePath);
          }

          // Sync to file system for non-builtin prompts
          if (!prompt.builtin && (prompt.source === 'personal' || prompt.source === 'project')) {
            await this.syncPromptToFile(prompt);
          }
          await cm.setPrompt(prompt);
          this.notifyChange(postMessage, 'prompt', prompt.id);
          return true;
        }

        case 'updateProvider':
          await cm.setProvider(message.provider as ProviderConfig);
          this.notifyChange(postMessage, 'provider', (message.provider as ProviderConfig).id);
          return true;

        case 'updateModel':
          await cm.setModel(message.model as ModelConfig);
          this.notifyChange(postMessage, 'model', (message.model as ModelConfig).id);
          return true;

        case 'deletePrompt': {
          const promptId = (message.promptId || message.id) as string;
          // Get prompt config to check if we need to delete file
          const existingPrompt = cm.getPrompts().find(p => p.id === promptId);
          if (existingPrompt && !existingPrompt.builtin && existingPrompt.filePath) {
            // Resolve full path if only filename is stored
            const filePath = await this.resolvePromptFilePath(existingPrompt);
            if (filePath) {
              await this.promptFileService.deletePromptFile(filePath);
            }
          }
          await cm.removePrompt(promptId);
          this.notifyChange(postMessage, 'prompt', promptId);
          return true;
        }

        case 'deleteProvider':
          await cm.removeProvider((message.providerId || message.id) as string);
          this.notifyChange(postMessage, 'provider', (message.providerId || message.id) as string);
          return true;

        case 'deleteModel':
          await cm.removeModel((message.modelId || message.id) as string);
          this.notifyChange(postMessage, 'model', (message.modelId || message.id) as string);
          return true;

        case 'listProviderModels': {
          const providerId = message.providerId as string;
          const requestId = message.requestId as string;
          this.handleListProviderModels(providerId, requestId, postMessage);
          return true;
        }

        case 'validateApiKey': {
          const providerId = message.providerId as string;
          const modelId = message.modelId as string | undefined;
          const requestId = message.requestId as string;
          this.handleValidateApiKey(providerId, modelId, requestId, postMessage);
          return true;
        }

        default:
          return false;
      }
    } catch (error) {
      logger.error(`Error handling ${message.type}:`, error);
      postMessage({
        type: 'error',
        message: `Failed to ${message.type}: ${error instanceof Error ? error.message : String(error)}`,
      });
      return true;
    }
  }

  /**
   * 构建完整的配置状态
   */
  private buildConfigState(): ConfigState {
    const cm = this.platform.config;

    return {
      providers: cm.getProviders(),
      models: cm.getModels(),
      mcpServers: cm.getMCPServers(),
      workflows: [], // TODO: workflow support removed from platform
      prompts: cm.getPrompts(),
      skills: this.cachedSkills,
      commands: this.cachedCommands,
    };
  }

  /**
   * 构建包含连接状态的配置状态
   */
  private buildConfigStateWithStatus(): ConfigStateWithStatus {
    return {
      ...this.buildConfigState(),
      connectionStates: this.connectionStateManager?.getStatesMap() || {},
    };
  }

  /**
   * 通知配置变更
   */
  private notifyChange(
    postMessage: PostMessageFn,
    changeType: 'provider' | 'model' | 'mcp' | 'workflow' | 'prompt', // TODO: remove 'workflow' when ConfigState.workflows is removed
    id: string
  ): void {
    postMessage({ type: 'configChanged', changeType, id });
  }

  /**
   * 处理 listProviderModels 请求
   * 从 Provider API 获取可用的模型列表（包含能力信息）
   */
  private async handleListProviderModels(
    providerId: string,
    requestId: string,
    postMessage: PostMessageFn
  ): Promise<void> {
    try {
      const service = this.platform.createService();
      const models = await service.listProviderModelsDetailed(providerId);
      postMessage({
        type: 'providerModelsResult',
        requestId,
        providerId,
        success: true,
        models,
      });
    } catch (error) {
      logger.error(`Error listing models for ${providerId}:`, error);
      postMessage({
        type: 'providerModelsResult',
        requestId,
        providerId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 处理 validateApiKey 请求
   * 验证 Provider 的 API Key 是否有效
   * @param providerId Provider ID
   * @param modelId Optional model ID - when specified, uses this model for validation test
   * @param requestId Request ID for correlation
   * @param postMessage Function to send response
   */
  private async handleValidateApiKey(
    providerId: string,
    modelId: string | undefined,
    requestId: string,
    postMessage: PostMessageFn
  ): Promise<void> {
    try {
      const service = this.platform.createService();
      const result = await service.validateProviderApiKey(providerId, modelId);
      postMessage({
        type: 'validateApiKeyResult',
        requestId,
        providerId,
        modelId,
        success: true,
        valid: result.valid,
        error: result.error,
      });
    } catch (error) {
      logger.error(`Error validating API key for ${providerId}${modelId ? ` model ${modelId}` : ''}:`, error);
      postMessage({
        type: 'validateApiKeyResult',
        requestId,
        providerId,
        modelId,
        success: false,
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 广播连接状态变化给所有注册的 Webview
   */
  private broadcastConnectionStateChange(event: ConnectionStateChangeEvent): void {
    const message = {
      type: 'connectionStateChanged',
      id: event.id,
      serviceType: event.type,
      status: event.newStatus,
      error: event.error,
    };

    for (const postMessage of this.activeWebviews) {
      try {
        postMessage(message);
      } catch (error) {
        logger.error('Failed to broadcast state change:', error);
      }
    }
  }

  // ==========================================================================
  // Prompt File Sync Methods
  // ==========================================================================

  /**
   * Initialize prompt file sync on startup
   * Scans user and workspace directories for prompt files
   * and syncs them with ConfigManager
   */
  private async initPromptFileSync(): Promise<void> {
    if (this.promptSyncInitialized) return;
    this.promptSyncInitialized = true;

    try {
      // Scan prompt files from file system
      const scanResult = await this.promptFileService.scanPromptFiles();

      // Build set of existing file paths from scan
      const scannedFilePaths = new Set<string>();
      for (const info of scanResult.personal) {
        scannedFilePaths.add(info.filePath);
      }
      for (const info of scanResult.project) {
        scannedFilePaths.add(info.filePath);
      }

      // Get existing prompts from config
      const existingPrompts = this.platform.config.getPrompts();

      // Clean up prompts that have filePath but file doesn't exist
      for (const existingPrompt of existingPrompts) {
        if (existingPrompt.filePath && !existingPrompt.builtin) {
          const resolvedPath = await this.resolvePromptFilePath(existingPrompt);
          if (!resolvedPath || !scannedFilePaths.has(resolvedPath)) {
            // File doesn't exist, remove the prompt record
            this.platform.config.removePrompt(existingPrompt.id);
          }
        }
      }

      // Re-fetch existing prompts after cleanup
      const cleanedPrompts = this.platform.config.getPrompts();

      // Find new prompts that need to be added
      const newPrompts = await this.promptFileService.syncWithConfig(scanResult, cleanedPrompts);

      // Add new prompts to config
      for (const prompt of newPrompts) {
        await this.platform.config.setPrompt(prompt);
      }

      // Update existing prompts with file content if file exists
      for (const existingPrompt of cleanedPrompts) {
        if (existingPrompt.filePath && !existingPrompt.builtin) {
          const resolvedPath = await this.resolvePromptFilePath(existingPrompt);
          if (resolvedPath) {
            const content = await this.promptFileService.readPromptFile(resolvedPath);
            if (content && content !== existingPrompt.systemPrompt) {
              await this.platform.config.setPrompt({
                ...existingPrompt,
                systemPrompt: content,
              });
            }
          }
        }
      }
    } catch (error) {
      logger.error('Failed to initialize prompt file sync:', error);
    }
  }

  /**
   * Sync a prompt config to file system
   */
  private async syncPromptToFile(prompt: PromptPresetConfig): Promise<void> {
    if (prompt.builtin) return;

    const source = prompt.source as 'personal' | 'project';
    if (source !== 'personal' && source !== 'project') return;

    try {
      // Extract filename from existing filePath or generate new one
      let existingFileName: string | undefined;
      if (prompt.filePath) {
        const path = await import('path');
        existingFileName = path.basename(prompt.filePath);
      }

      // Save prompt content to file
      const result = await this.promptFileService.savePromptFile(
        source,
        prompt.name,
        prompt.systemPrompt || `# ${prompt.name}\n\n`,
        existingFileName
      );

      // Update prompt config with file path
      prompt.filePath = result.filePath;
    } catch (error) {
      logger.error('Failed to sync prompt to file:', error);
    }
  }

  /**
   * Resolve full file path for a prompt
   * Handles both full paths and filename-only paths
   */
  private async resolvePromptFilePath(prompt: PromptPresetConfig): Promise<string | null> {
    if (!prompt.filePath) return null;

    const pathModule = await import('path');
    const fsModule = await import('fs');

    // If it's already a full path and exists, return it
    if (pathModule.isAbsolute(prompt.filePath)) {
      try {
        await fsModule.promises.access(prompt.filePath);
        return prompt.filePath;
      } catch {
        // File doesn't exist at this path
      }
    }

    // Try to resolve based on source
    const source = prompt.source as 'personal' | 'project';
    const fileName = pathModule.basename(prompt.filePath);
    const resolvedPath = this.promptFileService.getPromptFilePath(source, fileName);

    if (resolvedPath) {
      try {
        await fsModule.promises.access(resolvedPath);
        return resolvedPath;
      } catch {
        // File doesn't exist
      }
    }

    return null;
  }

  // ==========================================================================
  // Skill File Sync Methods
  // ==========================================================================

  /**
   * Initialize skill file sync on startup
   * Scans user and workspace directories for skill files
   */
  private initSkillFileSync(): void {
    if (this.skillSyncInitialized) return;
    this.skillSyncInitialized = true;

    // Store the promise so getSkills can wait for it
    this.skillSyncPromise = this.doSkillFileSync();
  }

  /**
   * Perform the actual skill file sync
   */
  private async doSkillFileSync(): Promise<void> {
    try {
      // Scan skill files from file system
      const scanResult = await this.skillFileService.scanSkills();

      // Convert to configured format
      const { skills, commands } = this.skillFileService.toConfigured(scanResult);

      // Merge with stored enabled state and cache
      const merged = this.mergeSkillsWithEnabledState(skills, commands);
      this.cachedSkills = merged.skills;
      this.cachedCommands = merged.commands;
    } catch (error) {
      logger.error('Failed to initialize skill file sync:', error);
    }
  }

  /**
   * Handle skills changed event from SkillFileService
   */
  private handleSkillsChanged(result: SkillScanResult): void {
    // Convert to configured format
    const { skills, commands } = this.skillFileService.toConfigured(result);

    // Merge with stored enabled state and cache
    const merged = this.mergeSkillsWithEnabledState(skills, commands);
    this.cachedSkills = merged.skills;
    this.cachedCommands = merged.commands;

    // Broadcast to all webviews
    const message = {
      type: 'skillsChanged',
      skills: this.cachedSkills,
      commands: this.cachedCommands,
    };

    for (const postMessage of this.activeWebviews) {
      try {
        postMessage(message);
      } catch (error) {
        logger.error('Failed to broadcast skills change:', error);
      }
    }
  }

  /**
   * Get cached skills
   */
  getSkills(): ConfiguredSkill[] {
    return this.cachedSkills;
  }

  /**
   * Get cached commands
   */
  getCommands(): ConfiguredSlashCommand[] {
    return this.cachedCommands;
  }

  /**
   * Load skill enabled state from persistent storage
   */
  private loadSkillEnabledState(): void {
    if (!this.context) {
      return;
    }

    try {
      const stored = this.context.globalState.get<Record<string, boolean>>(SKILL_ENABLED_STATE_KEY);
      if (stored) {
        this.skillEnabledState = new Map(Object.entries(stored));
      }
    } catch (error) {
      logger.error('Failed to load skill enabled state:', error);
    }
  }

  /**
   * Save skill enabled state to persistent storage
   */
  private saveSkillEnabledState(): void {
    if (!this.context) return;

    try {
      const obj: Record<string, boolean> = {};
      for (const [key, value] of this.skillEnabledState) {
        obj[key] = value;
      }
      this.context.globalState.update(SKILL_ENABLED_STATE_KEY, obj);
    } catch (error) {
      logger.error('Failed to save skill enabled state:', error);
    }
  }

  /**
   * Merge skills with stored enabled state
   */
  private mergeSkillsWithEnabledState(
    skills: ConfiguredSkill[],
    commands: ConfiguredSlashCommand[]
  ): { skills: ConfiguredSkill[]; commands: ConfiguredSlashCommand[] } {
    // Merge skills with stored enabled state
    const mergedSkills = skills.map(s => {
      const storedEnabled = this.skillEnabledState.get(`skill:${s.name}`);
      if (storedEnabled !== undefined) {
        return { ...s, enabled: storedEnabled };
      }
      return s;
    });

    // Merge commands with stored enabled state
    const mergedCommands = commands.map(c => {
      const storedEnabled = this.skillEnabledState.get(`command:${c.command}`);
      if (storedEnabled !== undefined) {
        return { ...c, enabled: storedEnabled };
      }
      return c;
    });

    return { skills: mergedSkills, commands: mergedCommands };
  }

  /**
   * Broadcast skills update to all webviews
   */
  private broadcastSkillsUpdate(): void {
    const message = {
      type: 'skillsChanged',
      skills: this.cachedSkills,
      commands: this.cachedCommands,
    };

    for (const postMessage of this.activeWebviews) {
      try {
        postMessage(message);
      } catch (error) {
        logger.error('Failed to broadcast skills update:', error);
      }
    }
  }

  // ==========================================================================
  // Hook File Sync Methods
  // ==========================================================================

  /**
   * Initialize hook file sync on startup
   * Scans user and workspace directories for hook files
   */
  private async initHookFileSync(): Promise<void> {
    if (this.hookSyncInitialized) return;
    this.hookSyncInitialized = true;

    try {
      // Scan hook files from file system
      const scanResult = await this.hookFileService.scanHooks();

      // Convert to configured format and cache
      this.cachedHooks = this.hookFileService.toConfigured(scanResult);
    } catch (error) {
      logger.error('Failed to initialize hook file sync:', error);
    }
  }

  /**
   * Handle hooks changed event from HookFileService
   */
  private handleHooksChanged(result: HookScanResult): void {
    // Update cache
    this.cachedHooks = this.hookFileService.toConfigured(result);

    // Broadcast to all webviews
    const message = {
      type: 'hooksChanged',
      hooks: this.cachedHooks,
    };

    for (const postMessage of this.activeWebviews) {
      try {
        postMessage(message);
      } catch (error) {
        logger.error('Failed to broadcast hooks change:', error);
      }
    }
  }

  /**
   * Get cached hooks
   */
  getHooks(): ConfiguredHook[] {
    return this.cachedHooks;
  }

  // ==========================================================================
  // ToolSkill Methods
  // ==========================================================================

  /**
   * Set ToolSkills from ToolSkillRegistry
   * Called by AgentRunner after initialization
   */
  setToolSkills(toolSkills: ConfiguredToolSkill[]): void {
    // Merge with stored enabled state
    this.cachedToolSkills = toolSkills.map(ts => {
      const storedEnabled = this.toolSkillEnabledState.get(ts.name);
      if (storedEnabled !== undefined) {
        return { ...ts, enabled: storedEnabled };
      }
      return ts;
    });
  }

  /**
   * Get cached ToolSkills
   */
  getToolSkills(): ConfiguredToolSkill[] {
    return this.cachedToolSkills;
  }

  /**
   * Load ToolSkill enabled state from persistent storage
   */
  private loadToolSkillEnabledState(): void {
    if (!this.context) {
      return;
    }

    try {
      const stored = this.context.globalState.get<Record<string, boolean>>(ConfigBridge.TOOL_SKILL_ENABLED_STATE_KEY);
      if (stored) {
        this.toolSkillEnabledState = new Map(Object.entries(stored));
      }
    } catch (error) {
      logger.error('Failed to load ToolSkill enabled state:', error);
    }
  }

  /**
   * Save ToolSkill enabled state to persistent storage
   */
  private saveToolSkillEnabledState(): void {
    if (!this.context) return;

    try {
      const obj: Record<string, boolean> = {};
      for (const [key, value] of this.toolSkillEnabledState) {
        obj[key] = value;
      }
      this.context.globalState.update(ConfigBridge.TOOL_SKILL_ENABLED_STATE_KEY, obj);
    } catch (error) {
      logger.error('Failed to save ToolSkill enabled state:', error);
    }
  }

  /**
   * Broadcast ToolSkills update to all webviews
   */
  private broadcastToolSkillsUpdate(): void {
    const message = {
      type: 'toolSkillsChanged',
      toolSkills: this.cachedToolSkills,
    };

    for (const postMessage of this.activeWebviews) {
      try {
        postMessage(message);
      } catch (error) {
        logger.error('Failed to broadcast ToolSkills update:', error);
      }
    }
  }

  // ==========================================================================
  // Config File Import Methods
  // ==========================================================================

  /**
   * Import providers with API keys from config file data into the platform.
   * Workspace config overrides user config (last entry in array wins).
   */
  private async importProvidersFromConfigs(configs: Array<UnifiedConfig>): Promise<void> {
    const cm = this.platform.config;

    // Build merged set: later entries override earlier (workspace > user)
    const keyMap = new Map<string, { apiKey: string; raw: Record<string, unknown> }>();
    for (const config of configs) {
      for (const provider of config.providers ?? []) {
        if (provider.apiKey) {
          keyMap.set(provider.id, {
            apiKey: provider.apiKey,
            raw: provider as unknown as Record<string, unknown>,
          });
        }
      }
    }

    for (const [id, { apiKey, raw }] of keyMap) {
      try {
        if (cm.getProvider(id)) {
          // Builtin provider: just update the API key
          await cm.setProviderApiKey(id, apiKey);
        } else {
          // Custom provider: add it fully
          await cm.setProvider(raw as unknown as Parameters<typeof cm.setProvider>[0]);
        }
      } catch (error) {
        logger.error(`Failed to import provider ${id} from config file:`, error);
      }
    }

    // Import taskDefaults from the last (highest priority) config that has them
    const lastConfig = configs.at(-1);
    if (lastConfig?.taskDefaults) {
      const userCfg = cm.getUserConfig();
      userCfg.taskDefaults = lastConfig.taskDefaults as TaskDefaults;
      await cm.saveUserConfig(userCfg);
    }
  }

  /**
   * Read a config.json file from the given path.
   * Returns null if the file does not exist or cannot be parsed.
   */
  private readConfigFile(filePath: string): UnifiedConfig | null {
    try {
      if (!fs.existsSync(filePath)) return null;
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as UnifiedConfig;
    } catch {
      return null;
    }
  }

  /**
   * Watch a config.json file for changes.
   * Returns a cleanup function to stop watching.
   */
  private watchConfigFile(
    filePath: string,
    callback: (config: UnifiedConfig | null) => void
  ): () => void {
    let watcher: fs.FSWatcher | null = null;
    try {
      watcher = fs.watch(filePath, (eventType) => {
        if (eventType === 'change') {
          callback(this.readConfigFile(filePath));
        }
      });
    } catch {
      // File doesn't exist yet — watch parent directory instead
      const dir = path.dirname(filePath);
      const filename = path.basename(filePath);
      if (fs.existsSync(dir)) {
        watcher = fs.watch(dir, (_eventType, changedFilename) => {
          if (changedFilename === filename) {
            callback(this.readConfigFile(filePath));
          }
        });
      }
    }
    return () => {
      watcher?.close();
    };
  }

  /**
   * Read provider API keys from ~/.neko/config.json and workspace .neko/config.json.
   * Imports into platform ConfigManager so the webview sees them immediately.
   */
  private async initConfigFileImport(): Promise<void> {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    const userConfigPath = path.join(os.homedir(), '.neko', 'config.json');
    const configs: Array<UnifiedConfig> = [];
    const userConfig = this.readConfigFile(userConfigPath);
    if (userConfig) configs.push(userConfig);

    if (workspacePath) {
      const wsConfigPath = path.join(workspacePath, '.neko', 'config.json');
      const wsConfig = this.readConfigFile(wsConfigPath);
      if (wsConfig) configs.push(wsConfig);
    }

    if (configs.length > 0) {
      await this.importProvidersFromConfigs(configs);
    }
  }

  /**
   * Watch ~/.neko/config.json and workspace .neko/config.json for changes.
   * Re-imports providers and broadcasts updated config to all webviews.
   */
  private watchConfigFiles(): void {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    const handleChange = (_config: UnifiedConfig | null) => {
      void this.initConfigFileImport().then(() => {
        for (const postMessage of this.activeWebviews) {
          try {
            postMessage({ type: 'configChanged', source: 'configFile' });
          } catch (error) {
            logger.error('Failed to broadcast config file change:', error);
          }
        }
      });
    };

    const userConfigPath = path.join(os.homedir(), '.neko', 'config.json');
    const userWatcherCleanup = this.watchConfigFile(userConfigPath, handleChange);
    this.configFileWatcherCleanups.push(userWatcherCleanup);

    if (workspacePath) {
      const wsConfigPath = path.join(workspacePath, '.neko', 'config.json');
      const wsWatcherCleanup = this.watchConfigFile(wsConfigPath, handleChange);
      this.configFileWatcherCleanups.push(wsWatcherCleanup);
    }
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
    this.activeWebviews.clear();
    // Clean up config file watchers
    for (const cleanup of this.configFileWatcherCleanups) {
      cleanup();
    }
    this.configFileWatcherCleanups = [];
  }
}
