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
import type { Platform } from '@uniedit/platform';
import type {
  ConfigState,
  MCPServerConfig,
  WorkflowConfig,
  PromptPresetConfig,
  ProviderConfig,
  ModelConfig,
  ConfiguredSkill,
  ConfiguredSlashCommand,
  ConfiguredHook,
  ConfiguredToolSkill,
} from '@uniedit/shared';
import type {
  ConnectionStateManager,
  ConnectionStateChangeEvent,
  ConnectionStatus,
} from './connectionStateManager';
import { getPromptFileService, type PromptFileService } from './PromptFileService';
import { getSkillFileService, type SkillFileService, type SkillScanResult } from './SkillFileService';
import { getHookFileService, type HookFileService, type HookScanResult } from './HookFileService';

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

        case 'createSkill': {
          const skillName = message.skillName as string;
          const source = message.source as 'personal' | 'project';
          
          try {
            // Create the skill file
            await this.skillFileService.createSkillFile(skillName, source);
            
            // Rescan skills to pick up the new skill and update cache
            const scanResult = await this.skillFileService.scanSkills();
            const { skills, commands } = this.skillFileService.toConfigured(scanResult);
            const merged = this.mergeSkillsWithEnabledState(skills, commands);
            this.cachedSkills = merged.skills;
            this.cachedCommands = merged.commands;
            this.broadcastSkillsUpdate();
          } catch (err) {
            console.error('[ConfigBridge] Failed to create skill:', err);
          }
          return true;
        }

        case 'updateSkill': {
          const skill = message.skill as ConfiguredSkill;
          // Store enabled state in the map and persist
          this.skillEnabledState.set(`skill:${skill.name}`, skill.enabled !== false);
          this.saveSkillEnabledState();
          // Update cached skill
          const skillIndex = this.cachedSkills.findIndex(s => s.name === skill.name);
          if (skillIndex >= 0) {
            this.cachedSkills[skillIndex] = skill;
          } else {
            this.cachedSkills.push(skill);
          }

          // Create file for non-builtin skills (personal or project)
          if (skill.source !== 'builtin') {
            try {
              await this.skillFileService.createSkillFile(
                skill.name,
                skill.source as 'personal' | 'project',
                skill.content,
                skill.description
              );
            } catch (err) {
              console.error('[ConfigBridge] Failed to create skill file:', err);
            }
          }

          // Broadcast update
          this.broadcastSkillsUpdate();
          return true;
        }

        case 'deleteSkill': {
          const skillName = message.skillName as string;
          
          // Find the skill to get its source and directory path
          const skillToDelete = this.cachedSkills.find(s => s.name === skillName);
          
          // Delete the skill directory if it exists
          if (skillToDelete && skillToDelete.source !== 'builtin') {
            const source = skillToDelete.source as 'personal' | 'project';
            try {
              await this.skillFileService.deleteSkillDirectory(skillName, source);
            } catch (err) {
              console.error('[ConfigBridge] Failed to delete skill directory:', err);
            }
          }
          
          // Update enabled state and cache
          this.skillEnabledState.delete(`skill:${skillName}`);
          this.saveSkillEnabledState();
          this.cachedSkills = this.cachedSkills.filter(s => s.name !== skillName);
          this.broadcastSkillsUpdate();
          return true;
        }

        case 'duplicateSkill': {
          const skill = message.skill as ConfiguredSkill;
          const newName = message.newName as string;
          const targetSource = message.targetSource as 'personal' | 'project';

          // Check if source skill has a directory path
          if (!skill.directoryPath) {
            // Fallback to createSkillFile for skills without directory
            console.log('[ConfigBridge] Skill has no directoryPath, using createSkillFile');
            try {
              await this.skillFileService.createSkillFile(
                newName,
                targetSource,
                skill.content,
                skill.description
              );
            } catch (err) {
              console.error('[ConfigBridge] Failed to create skill file:', err);
            }
          } else {
            // Duplicate the entire skill directory
            try {
              await this.skillFileService.duplicateSkillDirectory(
                skill.directoryPath,
                newName,
                targetSource
              );
            } catch (err) {
              console.error('[ConfigBridge] Failed to duplicate skill directory:', err);
            }
          }

          // Rescan skills to pick up the new skill and update cache
          const scanResult = await this.skillFileService.scanSkills();
          const { skills, commands } = this.skillFileService.toConfigured(scanResult);
          const merged = this.mergeSkillsWithEnabledState(skills, commands);
          this.cachedSkills = merged.skills;
          this.cachedCommands = merged.commands;
          this.broadcastSkillsUpdate();
          return true;
        }

        case 'updateCommand': {
          const command = message.command as ConfiguredSlashCommand;
          // Store enabled state in the map and persist
          this.skillEnabledState.set(`command:${command.command}`, command.enabled !== false);
          this.saveSkillEnabledState();
          // Update cached command
          const commandIndex = this.cachedCommands.findIndex(c => c.command === command.command);
          if (commandIndex >= 0) {
            this.cachedCommands[commandIndex] = command;
          } else {
            this.cachedCommands.push(command);
          }

          // Create file for non-builtin commands (personal or project)
          if (command.source !== 'builtin') {
            try {
              await this.skillFileService.createCommandFile(
                command.command,
                command.source as 'personal' | 'project',
                command.content
              );
            } catch (err) {
              console.error('[ConfigBridge] Failed to create command file:', err);
            }
          }

          // Broadcast update
          this.broadcastSkillsUpdate();
          return true;
        }

        case 'deleteCommand': {
          const commandName = message.commandName as string;
          
          // Find the command to get its source
          const commandToDelete = this.cachedCommands.find(c => c.command === commandName);
          
          // Delete the command file if it exists
          if (commandToDelete && commandToDelete.source !== 'builtin') {
            const source = commandToDelete.source as 'personal' | 'project';
            try {
              await this.skillFileService.deleteCommandFile(commandName, source);
            } catch (err) {
              console.error('[ConfigBridge] Failed to delete command file:', err);
            }
          }
          
          // Update enabled state and cache
          this.skillEnabledState.delete(`command:${commandName}`);
          this.saveSkillEnabledState();
          this.cachedCommands = this.cachedCommands.filter(c => c.command !== commandName);
          this.broadcastSkillsUpdate();
          return true;
        }

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

        case 'updateToolSkill': {
          const toolSkill = message.toolSkill as ConfiguredToolSkill;
          // Store enabled state in the map and persist
          this.toolSkillEnabledState.set(toolSkill.name, toolSkill.enabled !== false);
          this.saveToolSkillEnabledState();
          // Update cached ToolSkill
          const tsIndex = this.cachedToolSkills.findIndex(ts => ts.name === toolSkill.name);
          if (tsIndex >= 0) {
            this.cachedToolSkills[tsIndex] = toolSkill;
          }
          // Broadcast update
          this.broadcastToolSkillsUpdate();
          return true;
        }

        case 'updateMCPServer':
          await cm.setMCPServer(message.server as MCPServerConfig);
          this.notifyChange(postMessage, 'mcp', (message.server as MCPServerConfig).id);
          return true;

        case 'updateWorkflow':
          await cm.setWorkflow(message.workflow as WorkflowConfig);
          this.notifyChange(postMessage, 'workflow', (message.workflow as WorkflowConfig).id);
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
              console.log('[ConfigBridge] Deleted old prompt file after source change:', oldFilePath);
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

        case 'deleteMCPServer':
          await cm.removeMCPServer((message.serverId || message.id) as string);
          this.notifyChange(postMessage, 'mcp', (message.serverId || message.id) as string);
          return true;

        case 'deleteWorkflow':
          await cm.removeWorkflow((message.workflowId || message.id) as string);
          this.notifyChange(postMessage, 'workflow', (message.workflowId || message.id) as string);
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
      console.error(`[ConfigBridge] Error handling ${message.type}:`, error);
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
      workflows: cm.getWorkflows(),
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
    changeType: 'provider' | 'model' | 'mcp' | 'workflow' | 'prompt',
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
      console.error(`[ConfigBridge] Error listing models for ${providerId}:`, error);
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
      console.error(`[ConfigBridge] Error validating API key for ${providerId}${modelId ? ` model ${modelId}` : ''}:`, error);
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
        console.error('[ConfigBridge] Failed to broadcast state change:', error);
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
      console.error('[ConfigBridge] Failed to initialize prompt file sync:', error);
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
      console.error('[ConfigBridge] Failed to sync prompt to file:', error);
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
      console.error('[ConfigBridge] Failed to initialize skill file sync:', error);
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
        console.error('[ConfigBridge] Failed to broadcast skills change:', error);
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
      console.error('[ConfigBridge] Failed to load skill enabled state:', error);
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
      console.error('[ConfigBridge] Failed to save skill enabled state:', error);
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
        console.error('[ConfigBridge] Failed to broadcast skills update:', error);
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
      console.error('[ConfigBridge] Failed to initialize hook file sync:', error);
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
        console.error('[ConfigBridge] Failed to broadcast hooks change:', error);
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
      console.error('[ConfigBridge] Failed to load ToolSkill enabled state:', error);
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
      console.error('[ConfigBridge] Failed to save ToolSkill enabled state:', error);
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
        console.error('[ConfigBridge] Failed to broadcast ToolSkills update:', error);
      }
    }
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
    this.activeWebviews.clear();
  }
}
