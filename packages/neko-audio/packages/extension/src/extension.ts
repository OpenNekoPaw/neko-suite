/**
 * Neko Audio Extension
 *
 * Full-featured audio workstation: waveform editing, spectrum analysis,
 * effects chain, microphone recording, and AI noise reduction.
 *
 * Architecture:
 * extension.ts → AudioEditorProvider
 *   → AudioService → EngineClient (HTTP) → neko-engine Frame Server
 *   → Webview (AudioStreamClient / Web Audio API)
 */

import * as vscode from 'vscode';
import { AudioEditorProvider } from './providers/AudioEditorProvider';
import { AudioProjectProvider } from './providers/AudioProjectProvider';
import { AudioService } from './services/AudioService';
import { AudioOutlineProvider } from './views/audioOutlineProvider';
import { AudioStatusBar } from './views/audioStatusBar';
import type { NekoAudioAPI } from './types/api';
import { createVSCodeLogger } from '@neko/shared/vscode/extension';
import { setRootLogger, getLogger } from './utils/logger';

const logger = getLogger('Extension');

// =============================================================================
// Template
// =============================================================================

/** Default .nka project template for new audio projects (v2 multi-track) */
function getAudioProjectTemplate(name: string): string {
  const data = {
    version: '2.0',
    name,
    sampleRate: 48000,
    channels: 2,
    tracks: [],
    masterEffectsChain: [],
    markers: [],
  };
  return JSON.stringify(data, null, 2);
}

// =============================================================================
// Extension State
// =============================================================================

let audioProvider: AudioEditorProvider | null = null;
let projectProvider: AudioProjectProvider | null = null;
let sharedAudioService: AudioService | null = null;
let outlineProvider: AudioOutlineProvider | null = null;
let statusBar: AudioStatusBar | null = null;

// =============================================================================
// Activation
// =============================================================================

export async function activate(context: vscode.ExtensionContext): Promise<NekoAudioAPI> {
  const rootLogger = createVSCodeLogger('Neko Audio', 'NekoAudio', context);
  setRootLogger(rootLogger);

  logger.info('Activating extension...');

  // Create shared AudioService singleton
  sharedAudioService = await AudioService.tryCreate();
  if (sharedAudioService) {
    context.subscriptions.push(sharedAudioService);
    logger.info(`Shared AudioService ready (port: ${sharedAudioService.port})`);
  } else {
    logger.warn('Failed to create AudioService — native engine unavailable');
  }

  // Create provider and inject shared AudioService
  audioProvider = new AudioEditorProvider(context.extensionUri);

  if (sharedAudioService) {
    audioProvider.setAudioService(sharedAudioService);
  }

  // Register custom editors
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(AudioEditorProvider.viewType, audioProvider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    }),
  );

  // Register .nka project editor
  projectProvider = new AudioProjectProvider(context.extensionUri);
  if (sharedAudioService) {
    projectProvider.setAudioService(sharedAudioService);
  }
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(AudioProjectProvider.viewType, projectProvider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    }),
  );
  context.subscriptions.push(projectProvider);

  // Register outline view
  outlineProvider = new AudioOutlineProvider();
  const outlineView = vscode.window.createTreeView('nekoAudio.outline', {
    treeDataProvider: outlineProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(outlineView, outlineProvider);

  // Connect outline to audio provider
  audioProvider.setOutlineProvider(outlineProvider);

  // Register status bar
  statusBar = new AudioStatusBar();
  context.subscriptions.push(statusBar);
  audioProvider.setStatusBar(statusBar);

  // Helper: forward command to active audio webview
  const forwardCommand = (command: string): boolean => {
    const msg = { type: 'command', command };
    const sent = audioProvider?.postToActivePanels(msg) || projectProvider?.postToActivePanels(msg);
    return !!sent;
  };

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.audio.record', () => {
      if (!forwardCommand('toggleRecording')) {
        vscode.window.showInformationMessage('Audio recording — open an audio file to start');
      }
    }),
    vscode.commands.registerCommand('neko.audio.denoise', () => {
      if (!forwardCommand('denoise')) {
        vscode.window.showInformationMessage('Denoise — open an audio file first');
      }
    }),
    vscode.commands.registerCommand('neko.audio.normalize', () => {
      if (!forwardCommand('normalize')) {
        vscode.window.showInformationMessage('Normalize — open an audio file first');
      }
    }),
    vscode.commands.registerCommand('neko.audio.showSpectrum', () => {
      if (!forwardCommand('toggleSpectrum')) {
        vscode.window.showInformationMessage('Spectrum — open an audio file first');
      }
    }),
    vscode.commands.registerCommand('neko.audio.trim', () => {
      if (!forwardCommand('trim')) {
        vscode.window.showInformationMessage('Trim — select a region in the waveform first');
      }
    }),
    vscode.commands.registerCommand('neko.audio.fadeIn', () => {
      if (!forwardCommand('fadeIn')) {
        vscode.window.showInformationMessage('Fade In — select a region first');
      }
    }),
    vscode.commands.registerCommand('neko.audio.fadeOut', () => {
      if (!forwardCommand('fadeOut')) {
        vscode.window.showInformationMessage('Fade Out — select a region first');
      }
    }),

    // New Audio Project — create .nka file with inline rename (unified pattern)
    vscode.commands.registerCommand('neko.audio.new', async (uri?: vscode.Uri) => {
      // Determine target folder from context menu uri or workspace root
      let targetFolder: vscode.Uri | undefined = uri;
      if (!targetFolder) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
          targetFolder = workspaceFolders[0]?.uri;
        }
      }
      if (!targetFolder) {
        vscode.window.showErrorMessage(vscode.l10n.t('neko.audio.new.noFolder'));
        return;
      }

      // Generate a unique default file name (Untitled.nka, Untitled-1.nka, ...)
      const baseName = 'Untitled';
      const ext = '.nka';
      let fileName = `${baseName}${ext}`;
      let fileUri = vscode.Uri.joinPath(targetFolder, fileName);
      let counter = 1;
      while (true) {
        try {
          await vscode.workspace.fs.stat(fileUri);
          // File exists, try next name
          fileName = `${baseName}-${counter}${ext}`;
          fileUri = vscode.Uri.joinPath(targetFolder, fileName);
          counter++;
        } catch {
          // File does not exist — use this name
          break;
        }
      }

      try {
        // Create .nka file with default template
        const title = fileName.replace(/\.nka$/, '');
        const content = getAudioProjectTemplate(title);
        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf-8'));

        // Reveal in explorer, wait for file tree to refresh, then trigger inline rename
        await vscode.commands.executeCommand('revealInExplorer', fileUri);
        await new Promise((resolve) => setTimeout(resolve, 200));
        await vscode.commands.executeCommand('renameFile');

        logger.info(`Created audio project: ${fileUri.fsPath}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(vscode.l10n.t('neko.audio.new.failed', msg));
      }
    }),

    vscode.commands.registerCommand('neko.audio.exportAs', () => {
      if (!forwardCommand('toggleExport')) {
        vscode.window.showInformationMessage('Export As — open an audio file first');
      }
    }),
  );

  // Register provider for disposal
  context.subscriptions.push(audioProvider);

  logger.info('Extension activated');

  // Build and return public API
  const api: NekoAudioAPI = {
    get isAvailable() {
      return sharedAudioService?.isAvailable ?? false;
    },
    get port() {
      return sharedAudioService?.port ?? null;
    },
    probeAudio(filePath: string) {
      if (!sharedAudioService?.isAvailable) {
        return Promise.reject(new Error('AudioService not available'));
      }
      return sharedAudioService.probeAudio(filePath);
    },
    getWaveform(filePath: string) {
      if (!sharedAudioService?.isAvailable) {
        return Promise.reject(new Error('AudioService not available'));
      }
      return sharedAudioService.getWaveform(filePath);
    },
  };

  return api;
}

// =============================================================================
// Deactivation
// =============================================================================

export function deactivate(): void {
  logger.info('Deactivating extension...');

  audioProvider?.dispose();
  audioProvider = null;

  projectProvider?.dispose();
  projectProvider = null;

  // sharedAudioService is disposed via context.subscriptions
  sharedAudioService = null;

  logger.info('Extension deactivated');
}
