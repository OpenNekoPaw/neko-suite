/**
 * FileOperationHandler unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import { FileOperationHandler } from '../fileOperationHandler';

// Mock fs.promises
vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock the logger
vi.mock('../../../base', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  handleError: vi.fn(),
}));

describe('FileOperationHandler', () => {
  let handler: FileOperationHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new FileOperationHandler({});
  });

  describe('handleOpenFile', () => {
    it('should do nothing for empty path', async () => {
      const { commands } = await import('vscode');
      await handler.handleOpenFile('');

      expect(commands.executeCommand).not.toHaveBeenCalled();
    });

    it('should strip file:// protocol', async () => {
      const { commands } = await import('vscode');
      await handler.handleOpenFile('file:///tmp/test.txt');

      expect(commands.executeCommand).toHaveBeenCalledWith(
        'vscode.open',
        expect.objectContaining({ fsPath: '/tmp/test.txt' }),
      );
    });

    it('should open video with neko preview', async () => {
      const { commands } = await import('vscode');
      await handler.handleOpenFile('/tmp/video.mp4');

      expect(commands.executeCommand).toHaveBeenCalledWith(
        'vscode.openWith',
        expect.any(Object),
        'neko.videoPreview',
      );
    });

    it('should open audio with neko audio preview', async () => {
      const { commands } = await import('vscode');
      await handler.handleOpenFile('/tmp/audio.mp3');

      expect(commands.executeCommand).toHaveBeenCalledWith(
        'vscode.openWith',
        expect.any(Object),
        'neko.audioPreview',
      );
    });

    it('should open non-media files with default editor', async () => {
      const { commands } = await import('vscode');
      await handler.handleOpenFile('/tmp/readme.md');

      expect(commands.executeCommand).toHaveBeenCalledWith(
        'vscode.open',
        expect.any(Object),
      );
    });

    it('should route various video extensions correctly', async () => {
      const { commands } = await import('vscode');
      for (const ext of ['mov', 'avi', 'mkv', 'webm']) {
        vi.clearAllMocks();
        await handler.handleOpenFile(`/tmp/video.${ext}`);
        expect(commands.executeCommand).toHaveBeenCalledWith(
          'vscode.openWith',
          expect.any(Object),
          'neko.videoPreview',
        );
      }
    });

    it('should route various audio extensions correctly', async () => {
      const { commands } = await import('vscode');
      for (const ext of ['wav', 'ogg', 'flac', 'aac']) {
        vi.clearAllMocks();
        await handler.handleOpenFile(`/tmp/audio.${ext}`);
        expect(commands.executeCommand).toHaveBeenCalledWith(
          'vscode.openWith',
          expect.any(Object),
          'neko.audioPreview',
        );
      }
    });
  });

  describe('handleOpenUrl', () => {
    it('should do nothing for empty url', async () => {
      const { env } = await import('vscode');
      await handler.handleOpenUrl('');

      expect(env.openExternal).not.toHaveBeenCalled();
    });

    it('should open url in external browser', async () => {
      const { env } = await import('vscode');
      await handler.handleOpenUrl('https://example.com');

      expect(env.openExternal).toHaveBeenCalled();
    });
  });

  describe('handleOpenPromptConfig', () => {
    it('should create personal prompt directory', async () => {
      await handler.handleOpenPromptConfig('personal');

      expect(fs.promises.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('.neko'),
        { recursive: true },
      );
    });

    it('should show error for project source without workspace', async () => {
      const vscode = await import('vscode');
      (vscode.workspace as any).workspaceFolders = undefined;

      await handler.handleOpenPromptConfig('project');

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('No workspace folder open');
    });

    it('should create template file if not exists', async () => {
      vi.mocked(fs.promises.access).mockRejectedValueOnce(new Error('ENOENT'));

      await handler.handleOpenPromptConfig('personal');

      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('new-prompt.md'),
        expect.stringContaining('# New Prompt'),
        'utf-8',
      );
    });
  });

  describe('handleOpenSettingsFile', () => {
    it('should create settings file with template if not exists', async () => {
      vi.mocked(fs.promises.access).mockRejectedValueOnce(new Error('ENOENT'));

      await handler.handleOpenSettingsFile('personal');

      expect(fs.promises.mkdir).toHaveBeenCalled();
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('settings.json'),
        expect.stringContaining('hooks'),
        'utf-8',
      );
    });

    it('should use settings.local.json for local source', async () => {
      const vscode = await import('vscode');
      (vscode.workspace as any).workspaceFolders = [
        { uri: { fsPath: '/workspace' } },
      ];

      await handler.handleOpenSettingsFile('local');

      expect(fs.promises.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('.neko'),
        { recursive: true },
      );
    });
  });

  describe('handleOpenSkillFile', () => {
    it('should open SKILL.md for skill fileType', async () => {
      const { commands } = await import('vscode');
      await handler.handleOpenSkillFile('my-skill', 'personal', 'skill');

      expect(commands.executeCommand).toHaveBeenCalledWith(
        'vscode.open',
        expect.objectContaining({ fsPath: expect.stringContaining('SKILL.md') }),
      );
    });

    it('should show error when reference filePath missing', async () => {
      const { window } = await import('vscode');
      await handler.handleOpenSkillFile('my-skill', 'personal', 'reference');

      expect(window.showErrorMessage).toHaveBeenCalledWith('No file path provided for reference');
    });

    it('should show error when script filePath missing', async () => {
      const { window } = await import('vscode');
      await handler.handleOpenSkillFile('my-skill', 'personal', 'script');

      expect(window.showErrorMessage).toHaveBeenCalledWith('No file path provided for script');
    });

    it('should show error when file not found', async () => {
      vi.mocked(fs.promises.access).mockRejectedValueOnce(new Error('ENOENT'));
      const { window } = await import('vscode');

      await handler.handleOpenSkillFile('my-skill', 'personal', 'skill');

      expect(window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('File not found'));
    });
  });

  describe('handleOpenCommandFile', () => {
    it('should open command markdown file', async () => {
      const { commands } = await import('vscode');
      await handler.handleOpenCommandFile('my-cmd', 'personal');

      expect(commands.executeCommand).toHaveBeenCalledWith(
        'vscode.open',
        expect.objectContaining({ fsPath: expect.stringContaining('my-cmd.md') }),
      );
    });

    it('should show error when command file not found', async () => {
      vi.mocked(fs.promises.access).mockRejectedValueOnce(new Error('ENOENT'));
      const { window } = await import('vscode');

      await handler.handleOpenCommandFile('missing', 'personal');

      expect(window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('File not found'));
    });
  });

  describe('handleDownloadSvg', () => {
    it('should do nothing for empty svg', async () => {
      const { window } = await import('vscode');
      await handler.handleDownloadSvg('', 'test.svg');

      expect(window.showSaveDialog).not.toHaveBeenCalled();
    });

    it('should show save dialog and write file', async () => {
      const { window, workspace } = await import('vscode');
      const mockUri = { fsPath: '/tmp/diagram.svg' };
      (window.showSaveDialog as any).mockResolvedValue(mockUri);

      await handler.handleDownloadSvg('<svg>test</svg>', 'diagram.svg');

      expect(window.showSaveDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({ 'SVG Files': ['svg'] }),
        }),
      );
      expect(workspace.fs.writeFile).toHaveBeenCalledWith(
        mockUri,
        expect.any(Buffer),
      );
    });

    it('should not write when user cancels save dialog', async () => {
      const { window, workspace } = await import('vscode');
      (window.showSaveDialog as any).mockResolvedValue(undefined);

      await handler.handleDownloadSvg('<svg>test</svg>', 'diagram.svg');

      expect(workspace.fs.writeFile).not.toHaveBeenCalled();
    });
  });
});
