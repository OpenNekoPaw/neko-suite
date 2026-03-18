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
import * as path from 'path';
import { AudioEditorProvider } from './providers/AudioEditorProvider';
import { AudioProjectProvider } from './providers/AudioProjectProvider';
import { AudioService } from './services/AudioService';
import type { NekoAudioAPI } from './types/api';
import { createVSCodeLogger } from '@neko/shared/vscode/extension';
import { setRootLogger, getLogger } from './utils/logger';

const logger = getLogger('Extension');

// =============================================================================
// Extension State
// =============================================================================

let audioProvider: AudioEditorProvider | null = null;
let projectProvider: AudioProjectProvider | null = null;
let sharedAudioService: AudioService | null = null;

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

    // New Audio Project command
    vscode.commands.registerCommand('neko.audio.new', async () => {
      // 1. Pick source audio file
      const sourceUris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'Audio Files': ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'] },
        title: 'Select Source Audio File',
      });
      if (!sourceUris || sourceUris.length === 0) return;
      const sourceUri = sourceUris[0]!;

      // 2. Probe audio metadata
      if (!sharedAudioService?.isAvailable) {
        vscode.window.showErrorMessage('Audio engine not available');
        return;
      }

      try {
        const audioInfo = await sharedAudioService.probeAudio(sourceUri.fsPath);

        // 3. Determine output location
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const targetDir = workspaceFolder ?? path.dirname(sourceUri.fsPath);

        // Generate unique name
        const baseName = 'Untitled';
        let counter = 0;
        let nkaPath = path.join(targetDir, `${baseName}.nka`);
        try {
          while (true) {
            await vscode.workspace.fs.stat(vscode.Uri.file(nkaPath));
            counter++;
            nkaPath = path.join(targetDir, `${baseName}-${counter}.nka`);
          }
        } catch {
          // File doesn't exist, use this path
        }

        // 4. Compute relative path from .nka to audio source
        const relativePath = path.relative(targetDir, sourceUri.fsPath);

        // 5. Create .nka JSON
        const project = {
          version: '1.0',
          name: path.basename(sourceUri.fsPath, path.extname(sourceUri.fsPath)),
          audioSource: {
            filePath: relativePath,
            duration: audioInfo.duration,
            sampleRate: audioInfo.sampleRate,
            channels: audioInfo.channels,
            format: audioInfo.format,
          },
          effectsChain: [],
          markers: [],
        };

        const content = JSON.stringify(project, null, 2);
        const nkaUri = vscode.Uri.file(nkaPath);
        await vscode.workspace.fs.writeFile(nkaUri, Buffer.from(content, 'utf-8'));

        // 6. Open the .nka file
        await vscode.commands.executeCommand(
          'vscode.openWith',
          nkaUri,
          AudioProjectProvider.viewType,
        );
        logger.info(`Created audio project: ${nkaPath}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to create audio project: ${msg}`);
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
