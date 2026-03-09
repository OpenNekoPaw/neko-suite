/**
 * PromptSyncHandler - Prompt CRUD + file system sync
 */

import type { Platform } from '@neko/platform';
import type { PromptPresetConfig } from '@neko/shared';
import { getLogger } from '../../base';
import type { PromptFileService } from '../PromptFileService';
import type { PostMessageFn } from './types';

const logger = getLogger('PromptSyncHandler');

export class PromptSyncHandler {
  private initialized = false;

  constructor(
    private readonly platform: Platform,
    private readonly promptFileService: PromptFileService,
  ) {}

  /**
   * Initialize prompt file sync on startup.
   * Scans user and workspace directories for prompt files and syncs with ConfigManager.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const scanResult = await this.promptFileService.scanPromptFiles();

      // Build set of scanned file paths
      const scannedFilePaths = new Set<string>();
      for (const info of scanResult.personal) {
        scannedFilePaths.add(info.filePath);
      }
      for (const info of scanResult.project) {
        scannedFilePaths.add(info.filePath);
      }

      // Clean up prompts whose files no longer exist
      const existingPrompts = this.platform.config.getPrompts();
      for (const existingPrompt of existingPrompts) {
        if (existingPrompt.filePath && !existingPrompt.builtin) {
          const resolvedPath = await this.resolveFilePath(existingPrompt);
          if (!resolvedPath || !scannedFilePaths.has(resolvedPath)) {
            this.platform.config.removePrompt(existingPrompt.id);
          }
        }
      }

      // Sync new prompts from files
      const cleanedPrompts = this.platform.config.getPrompts();
      const newPrompts = await this.promptFileService.syncWithConfig(scanResult, cleanedPrompts);
      for (const prompt of newPrompts) {
        await this.platform.config.setPrompt(prompt);
      }

      // Update existing prompts with latest file content
      for (const existingPrompt of cleanedPrompts) {
        if (existingPrompt.filePath && !existingPrompt.builtin) {
          const resolvedPath = await this.resolveFilePath(existingPrompt);
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
   * Handle updatePrompt message
   */
  async handleUpdate(prompt: PromptPresetConfig, postMessage: PostMessageFn): Promise<void> {
    const cm = this.platform.config;

    // Check if source changed - need to delete old file and create in new location
    const existingPrompt = cm.getPrompts().find((p) => p.id === prompt.id);
    if (existingPrompt && existingPrompt.filePath && existingPrompt.source !== prompt.source) {
      const oldFilePath = await this.resolveFilePath(existingPrompt);
      if (oldFilePath) {
        await this.promptFileService.deletePromptFile(oldFilePath);
        logger.info('Deleted old prompt file after source change:', oldFilePath);
      }
      const pathModule = await import('path');
      prompt.filePath = pathModule.basename(existingPrompt.filePath);
    }

    // Sync to file system for non-builtin prompts
    if (!prompt.builtin && (prompt.source === 'personal' || prompt.source === 'project')) {
      await this.syncToFile(prompt);
    }
    await cm.setPrompt(prompt);
    postMessage({ type: 'configChanged', changeType: 'prompt', id: prompt.id });
  }

  /**
   * Handle deletePrompt message
   */
  async handleDelete(promptId: string, postMessage: PostMessageFn): Promise<void> {
    const cm = this.platform.config;
    const existingPrompt = cm.getPrompts().find((p) => p.id === promptId);

    if (existingPrompt && !existingPrompt.builtin && existingPrompt.filePath) {
      const filePath = await this.resolveFilePath(existingPrompt);
      if (filePath) {
        await this.promptFileService.deletePromptFile(filePath);
      }
    }
    await cm.removePrompt(promptId);
    postMessage({ type: 'configChanged', changeType: 'prompt', id: promptId });
  }

  /**
   * Sync a prompt config to file system
   */
  private async syncToFile(prompt: PromptPresetConfig): Promise<void> {
    if (prompt.builtin) return;

    const source = prompt.source as 'personal' | 'project';
    if (source !== 'personal' && source !== 'project') return;

    try {
      let existingFileName: string | undefined;
      if (prompt.filePath) {
        const path = await import('path');
        existingFileName = path.basename(prompt.filePath);
      }

      const result = await this.promptFileService.savePromptFile(
        source,
        prompt.name,
        prompt.systemPrompt || `# ${prompt.name}\n\n`,
        existingFileName,
      );
      prompt.filePath = result.filePath;
    } catch (error) {
      logger.error('Failed to sync prompt to file:', error);
    }
  }

  /**
   * Resolve full file path for a prompt (handles both full paths and filename-only)
   */
  async resolveFilePath(prompt: PromptPresetConfig): Promise<string | null> {
    if (!prompt.filePath) return null;

    const pathModule = await import('path');
    const fsModule = await import('fs');

    if (pathModule.isAbsolute(prompt.filePath)) {
      try {
        await fsModule.promises.access(prompt.filePath);
        return prompt.filePath;
      } catch {
        // File doesn't exist at this path
      }
    }

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
}
