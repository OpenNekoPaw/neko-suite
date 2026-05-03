/**
 * File Operation Handler - Handles file/URL opening and download messages
 *
 * Responsible for:
 * - Opening files in VSCode (with media routing)
 * - Opening URLs in external browser
 * - Opening prompt config, agents, settings, skill, and command files
 * - Downloading SVG files
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import {
  buildAgentsFilePlan,
  buildCommandFileOpenPlan,
  buildPromptConfigFilePlan,
  buildSkillSupportFileOpenPlan,
} from '@neko/agent';
import type { Platform } from '@neko/platform';
import {
  buildConfigFilePath,
  buildSettingsFilePlan,
  buildSvgDownloadPlan,
  buildSvgDownloadSavedMessage,
  createOpenFilePlan,
  ensureFileOperationPlan,
  stripFileProtocol,
  type FileOperationPlan,
  type SaveDialogFilterPlan,
} from '@neko/platform/files';
import { getLogger, handleError } from '../../base';

const logger = getLogger('FileOperationHandler');

/**
 * Dependencies for FileOperationHandler
 */
export interface FileOperationHandlerDeps {
  platform?: Platform;
}

/**
 * Handler for file operation webview messages
 */
export class FileOperationHandler {
  constructor(private deps: FileOperationHandlerDeps) {}

  updateDeps(partial: Partial<FileOperationHandlerDeps>): void {
    Object.assign(this.deps, partial);
  }

  async handleOpenFile(filePath: string): Promise<void> {
    const plan = createOpenFilePlan(filePath);
    if (!plan) return;

    try {
      const uri = this._uriForOpenFilePath(plan.cleanPath);

      if (plan.viewer === 'video') {
        await vscode.commands.executeCommand('vscode.openWith', uri, 'neko.videoPreview');
      } else if (plan.viewer === 'audio') {
        await vscode.commands.executeCommand('vscode.openWith', uri, 'neko.audioPreview');
      } else {
        await vscode.commands.executeCommand('vscode.open', uri);
      }
    } catch (error) {
      logger.error('Failed to open file:', error);
      handleError(error, { showToUser: true, severity: 'error' });
    }
  }

  async handleOpenUrl(url: string): Promise<void> {
    if (!url) return;

    try {
      await vscode.env.openExternal(vscode.Uri.parse(url));
    } catch (error) {
      logger.error('Failed to open URL:', error);
      handleError(error, { showToUser: true, severity: 'error' });
    }
  }

  async handleOpenPromptConfig(source: 'personal' | 'project', promptId?: string): Promise<void> {
    try {
      const plan = buildPromptConfigFilePlan({
        source,
        homeDir: this._getHomeDir(),
        unavailableError: 'No workspace folder open',
        ...(promptId !== undefined ? { promptId } : {}),
        ...this._workspaceRootInput(),
      });

      await this._ensureFileAndOpen(plan);
    } catch (error) {
      logger.error('Failed to open prompt config:', error);
      handleError(error, { showToUser: true, severity: 'error' });
    }
  }

  async handleOpenAgentsFile(source: 'personal' | 'project'): Promise<void> {
    try {
      const plan = buildAgentsFilePlan({
        source,
        homeDir: this._getHomeDir(),
        ...this._workspaceRootInput(),
      });

      await this._ensureFileAndOpen(plan);
    } catch (error) {
      logger.error('Failed to open AGENTS.md:', error);
      handleError(error, { showToUser: true, severity: 'error' });
    }
  }

  async handleOpenSettingsFile(source: 'personal' | 'project' | 'local'): Promise<void> {
    try {
      const plan = buildSettingsFilePlan({
        source,
        homeDir: this._getHomeDir(),
        ...this._workspaceRootInput(),
      });

      await this._ensureFileAndOpen(plan);
    } catch (error) {
      logger.error('Failed to open settings.json:', error);
      handleError(error, { showToUser: true, severity: 'error' });
    }
  }

  async handleOpenSkillFile(
    skillName: string,
    source: 'personal' | 'project',
    fileType: 'skill' | 'reference' | 'script',
    filePath?: string,
  ): Promise<void> {
    try {
      const plan = buildSkillSupportFileOpenPlan({
        skillName,
        source,
        fileType,
        ...(filePath !== undefined ? { filePath } : {}),
        homeDir: this._getHomeDir(),
        ...this._workspaceRootInput(),
      });
      if (!this._ensurePlanOk(plan)) return;

      await this._openExistingFile(plan.filePath);
    } catch (error) {
      logger.error('Failed to open skill file:', error);
      handleError(error, { showToUser: true, severity: 'error' });
    }
  }

  async handleOpenCommandFile(commandName: string, source: 'personal' | 'project'): Promise<void> {
    try {
      const plan = buildCommandFileOpenPlan({
        commandName,
        source,
        homeDir: this._getHomeDir(),
        ...this._workspaceRootInput(),
      });
      if (!this._ensurePlanOk(plan)) return;

      await this._openExistingFile(plan.filePath);
    } catch (error) {
      logger.error('Failed to open command file:', error);
      handleError(error, { showToUser: true, severity: 'error' });
    }
  }

  async handleOpenConfigFile(): Promise<void> {
    try {
      const configPath = buildConfigFilePath(os.homedir());
      const uri = vscode.Uri.file(configPath);
      await vscode.commands.executeCommand('vscode.open', uri);
    } catch (error) {
      logger.error('Failed to open config file:', error);
      handleError(error, { showToUser: true, severity: 'error' });
    }
  }

  async handleRevealFile(filePath: string): Promise<void> {
    if (!filePath) return;

    try {
      const cleanPath = stripFileProtocol(filePath);
      const uri = vscode.Uri.file(cleanPath);
      await vscode.commands.executeCommand('revealFileInOS', uri);
    } catch (error) {
      logger.error('Failed to reveal file:', error);
      handleError(error, { showToUser: true, severity: 'error' });
    }
  }

  async handleDownloadSvg(svg: string, filename: string): Promise<void> {
    const plan = buildSvgDownloadPlan({ svg, filename });
    if (!plan) return;

    try {
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(plan.defaultFileName),
        filters: this._toVscodeSaveFilters(plan.filters),
      });

      if (uri) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(plan.content, 'utf-8'));
        vscode.window.showInformationMessage(buildSvgDownloadSavedMessage(uri.fsPath));
      }
    } catch (error) {
      logger.error('Failed to save SVG:', error);
      handleError(error, { showToUser: true, severity: 'error' });
    }
  }

  private _uriForOpenFilePath(cleanPath: string): vscode.Uri {
    if (cleanPath.startsWith('/')) {
      return vscode.Uri.file(cleanPath);
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      return vscode.Uri.joinPath(workspaceFolders[0].uri, cleanPath);
    }

    return vscode.Uri.file(cleanPath);
  }

  private _getHomeDir(): string {
    return process.env.HOME || process.env.USERPROFILE || os.homedir();
  }

  private _workspaceRootInput(): { workspaceRoot: string } | Record<string, never> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    return workspaceRoot ? { workspaceRoot } : {};
  }

  private _ensurePlanOk<TPlan extends FileOperationPlan>(
    plan: TPlan,
  ): plan is Extract<TPlan, { ok: true }> {
    if (!('error' in plan)) return true;

    void handleError(new Error(plan.error), { showToUser: true });
    return false;
  }

  private async _ensureFileAndOpen(
    plan: Parameters<typeof ensureFileOperationPlan>[0]['plan'],
  ): Promise<void> {
    const result = await ensureFileOperationPlan({
      plan,
      fs: {
        mkdir: async (dirPath, options) => {
          await fs.promises.mkdir(dirPath, options);
        },
        access: async (filePath) => {
          await fs.promises.access(filePath);
        },
        writeFile: async (filePath, content, encoding) => {
          await fs.promises.writeFile(filePath, content, encoding);
        },
      },
    });
    if ('error' in result) {
      void handleError(new Error(result.error), { showToUser: true });
      return;
    }

    await this._openFilePath(result.filePath);
  }

  private async _openExistingFile(filePath: string): Promise<void> {
    try {
      await fs.promises.access(filePath);
    } catch {
      void handleError(new Error(`File not found: ${filePath}`), { showToUser: true });
      return;
    }

    await this._openFilePath(filePath);
  }

  private async _openFilePath(filePath: string): Promise<void> {
    const uri = vscode.Uri.file(filePath);
    await vscode.commands.executeCommand('vscode.open', uri);
  }

  private _toVscodeSaveFilters(filters: readonly SaveDialogFilterPlan[]): Record<string, string[]> {
    return Object.fromEntries(filters.map((filter) => [filter.name, filter.extensions]));
  }
}
