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
import * as path from 'path';
import * as os from 'os';
import type { Platform } from '@neko/platform';
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
    if (!filePath) return;

    try {
      // Handle file:// protocol
      const cleanPath = filePath.replace(/^file:\/\//, '');

      // Check if it's a relative path (resolve against workspace)
      let uri: vscode.Uri;
      if (cleanPath.startsWith('/')) {
        uri = vscode.Uri.file(cleanPath);
      } else {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
          uri = vscode.Uri.joinPath(workspaceFolders[0].uri, cleanPath);
        } else {
          uri = vscode.Uri.file(cleanPath);
        }
      }

      // Route media files to neko-preview's customEditor
      const ext = cleanPath.split('.').pop()?.toLowerCase() ?? '';
      const videoExts = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'ts', 'flv', 'wmv'];
      const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'];

      if (videoExts.includes(ext)) {
        await vscode.commands.executeCommand('vscode.openWith', uri, 'neko.videoPreview');
      } else if (audioExts.includes(ext)) {
        await vscode.commands.executeCommand('vscode.openWith', uri, 'neko.audioPreview');
      } else {
        // Non-media files: open with default editor
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
      let basePath: string;

      if (source === 'personal') {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        basePath = path.join(homeDir, '.neko', 'prompts');
      } else {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
          vscode.window.showErrorMessage('No workspace folder open');
          return;
        }
        basePath = path.join(workspaceFolders[0].uri.fsPath, '.neko', 'prompts');
      }

      // Create directory if not exists
      await fs.promises.mkdir(basePath, { recursive: true });

      // Determine file name from prompt ID
      const promptName: string = promptId || 'New Prompt';
      const fileName = promptId
        ? `${promptId.toLowerCase().replace(/[^a-z0-9-]/g, '-')}.md`
        : 'new-prompt.md';

      const filePath = path.join(basePath, fileName);

      // Create file with template if not exists
      try {
        await fs.promises.access(filePath);
      } catch {
        const template = `# ${promptName}\n\n<!-- Write your prompt content here -->\n\n`;
        await fs.promises.writeFile(filePath, template, 'utf-8');
      }

      // Open the file in VSCode
      const uri = vscode.Uri.file(filePath);
      await vscode.commands.executeCommand('vscode.open', uri);
    } catch (error) {
      logger.error('Failed to open prompt config:', error);
      handleError(error, { showToUser: true, severity: 'error' });
    }
  }

  async handleOpenAgentsFile(source: 'personal' | 'project'): Promise<void> {
    try {
      const { getPromptFileService } = await import('../../services/PromptFileService');
      const promptFileService = getPromptFileService();
      await promptFileService.openAgentsFile(source);
    } catch (error) {
      logger.error('Failed to open AGENTS.md:', error);
      handleError(error, { showToUser: true, severity: 'error' });
    }
  }

  async handleOpenSettingsFile(source: 'personal' | 'project' | 'local'): Promise<void> {
    try {
      let filePath: string;

      if (source === 'personal') {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        filePath = path.join(homeDir, '.neko', 'settings.json');
      } else {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
          vscode.window.showErrorMessage('No workspace folder open');
          return;
        }
        const fileName = source === 'local' ? 'settings.local.json' : 'settings.json';
        filePath = path.join(workspaceFolders[0].uri.fsPath, '.neko', fileName);
      }

      // Create directory if not exists
      const dirPath = path.dirname(filePath);
      await fs.promises.mkdir(dirPath, { recursive: true });

      // Create file with default template if not exists
      try {
        await fs.promises.access(filePath);
      } catch {
        const template = `{\n  "hooks": {\n    "PreToolUse": [],\n    "PostToolUse": []\n  }\n}\n`;
        await fs.promises.writeFile(filePath, template, 'utf-8');
      }

      // Open the file in VSCode
      const uri = vscode.Uri.file(filePath);
      await vscode.commands.executeCommand('vscode.open', uri);
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
      let basePath: string;

      if (source === 'personal') {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        basePath = path.join(homeDir, '.neko', 'skills');
      } else {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
          vscode.window.showErrorMessage('No workspace folder open');
          return;
        }
        basePath = path.join(workspaceFolders[0].uri.fsPath, '.neko', 'skills');
      }

      // Build full path based on file type
      let fullPath: string;

      switch (fileType) {
        case 'skill':
          fullPath = path.join(basePath, skillName, 'SKILL.md');
          break;
        case 'reference':
          if (!filePath) {
            vscode.window.showErrorMessage('No file path provided for reference');
            return;
          }
          fullPath = path.join(basePath, skillName, 'references', filePath);
          break;
        case 'script':
          if (!filePath) {
            vscode.window.showErrorMessage('No file path provided for script');
            return;
          }
          fullPath = path.join(basePath, skillName, 'scripts', filePath);
          break;
        default:
          vscode.window.showErrorMessage(`Unknown file type: ${fileType}`);
          return;
      }

      // Check if file exists
      try {
        await fs.promises.access(fullPath);
      } catch {
        vscode.window.showErrorMessage(`File not found: ${fullPath}`);
        return;
      }

      // Open the file in VSCode
      const uri = vscode.Uri.file(fullPath);
      await vscode.commands.executeCommand('vscode.open', uri);
    } catch (error) {
      logger.error('Failed to open skill file:', error);
      handleError(error, { showToUser: true, severity: 'error' });
    }
  }

  async handleOpenCommandFile(commandName: string, source: 'personal' | 'project'): Promise<void> {
    try {
      let basePath: string;

      if (source === 'personal') {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        basePath = path.join(homeDir, '.neko', 'commands');
      } else {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
          vscode.window.showErrorMessage('No workspace folder open');
          return;
        }
        basePath = path.join(workspaceFolders[0].uri.fsPath, '.neko', 'commands');
      }

      // Command file: <name>.md
      const fullPath = path.join(basePath, `${commandName}.md`);

      // Check if file exists
      try {
        await fs.promises.access(fullPath);
      } catch {
        vscode.window.showErrorMessage(`File not found: ${fullPath}`);
        return;
      }

      // Open the file in VSCode
      const uri = vscode.Uri.file(fullPath);
      await vscode.commands.executeCommand('vscode.open', uri);
    } catch (error) {
      logger.error('Failed to open command file:', error);
      handleError(error, { showToUser: true, severity: 'error' });
    }
  }

  async handleOpenConfigFile(): Promise<void> {
    try {
      const configPath = path.join(os.homedir(), '.neko', 'config.json');
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
      const cleanPath = filePath.replace(/^file:\/\//, '');
      const uri = vscode.Uri.file(cleanPath);
      await vscode.commands.executeCommand('revealFileInOS', uri);
    } catch (error) {
      logger.error('Failed to reveal file:', error);
      handleError(error, { showToUser: true, severity: 'error' });
    }
  }

  async handleDownloadSvg(svg: string, filename: string): Promise<void> {
    if (!svg) return;

    try {
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(filename || 'diagram.svg'),
        filters: {
          'SVG Files': ['svg'],
          'All Files': ['*'],
        },
      });

      if (uri) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(svg, 'utf-8'));
        vscode.window.showInformationMessage(`SVG saved to ${uri.fsPath}`);
      }
    } catch (error) {
      logger.error('Failed to save SVG:', error);
      handleError(error, { showToUser: true, severity: 'error' });
    }
  }
}
