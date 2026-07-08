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
import { AudioToolBridge } from './services/audioToolBridge';
import {
  createAudioInteractiveEditorForwardedResult,
  createAudioInteractiveEditorRequiredResult,
} from './services/audioRuntimeDiagnostics';
import { createNekoAudioCapabilityProvider } from './agentCapabilityProvider';
import { AudioOutlineProvider } from './views/audioOutlineProvider';
import { AudioStatusBar } from './views/audioStatusBar';
import type { NekoAudioAPI } from './types/api';
import {
  createVSCodeLogger,
  createNewFile,
  VSCodeErrorHandler,
  resolveLogLevelSetting,
  watchLogLevel,
} from '@neko/shared/vscode/extension';
import { CURRENT_NKA_VERSION } from '@neko/shared/nka';
import { setRootLogger, getLogger } from './utils/logger';
import { setErrorHandler, handleError } from './utils/errorHandler';

const logger = getLogger('Extension');

// =============================================================================
// Template
// =============================================================================

/** Default .nka project template for new audio projects. */
function getAudioProjectTemplate(name: string): string {
  const data = {
    version: CURRENT_NKA_VERSION,
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
  const rootLogger = createVSCodeLogger(
    'Neko Audio',
    'NekoAudio',
    context,
    resolveLogLevelSetting(context.extensionMode),
  );
  setRootLogger(rootLogger);
  setErrorHandler(new VSCodeErrorHandler(rootLogger));
  watchLogLevel(rootLogger, context);

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

  // Register agent capability provider
  if (sharedAudioService && projectProvider) {
    const toolBridge = new AudioToolBridge(projectProvider, sharedAudioService);
    const capabilityProvider = createNekoAudioCapabilityProvider(toolBridge);
    void vscode.commands.executeCommand('neko.agent.registerCapabilities', capabilityProvider);
  }

  // Helper: forward command to active audio webview
  const forwardCommand = async (command: string): Promise<boolean> => {
    if (await audioProvider?.postCommandToFocusedPanel(command)) {
      return true;
    }
    return Boolean(await projectProvider?.postCommandToFocusedPanel(command));
  };
  const runInteractiveCommand = async (
    command: string,
    operationId: string,
    noActiveEditorMessage: string,
  ) => {
    if (await forwardCommand(command)) {
      return createAudioInteractiveEditorForwardedResult(operationId);
    }
    void vscode.window.showInformationMessage(noActiveEditorMessage);
    return createAudioInteractiveEditorRequiredResult(operationId, noActiveEditorMessage);
  };

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.audio.record', () =>
      runInteractiveCommand(
        'toggleRecording',
        'audio.record',
        'Audio recording — open an audio file to start',
      ),
    ),
    vscode.commands.registerCommand('neko.audio.denoise', () =>
      runInteractiveCommand('denoise', 'audio.denoise', 'Denoise — open an audio file first'),
    ),
    vscode.commands.registerCommand('neko.audio.normalize', () =>
      runInteractiveCommand(
        'normalize',
        'audio.normalize',
        'Normalize — open an audio file first',
      ),
    ),
    vscode.commands.registerCommand('neko.audio.showSpectrum', () =>
      runInteractiveCommand(
        'toggleSpectrum',
        'audio.showSpectrum',
        'Spectrum — open an audio file first',
      ),
    ),
    vscode.commands.registerCommand('neko.audio.trim', () =>
      runInteractiveCommand('trim', 'audio.trim', 'Trim — select a region in the waveform first'),
    ),
    vscode.commands.registerCommand('neko.audio.fadeIn', () =>
      runInteractiveCommand('fadeIn', 'audio.fadeIn', 'Fade In — select a region first'),
    ),
    vscode.commands.registerCommand('neko.audio.fadeOut', () =>
      runInteractiveCommand('fadeOut', 'audio.fadeOut', 'Fade Out — select a region first'),
    ),

    // New Audio Project — create .nka file with inline rename (unified pattern)
    vscode.commands.registerCommand('neko.audio.new', async (uri?: vscode.Uri) => {
      try {
        await createNewFile({
          targetFolder: uri,
          ext: '.nka',
          template: (title) => getAudioProjectTemplate(title),
          noFolderErrorMessage: vscode.l10n.t('neko.audio.new.noFolder'),
          onCreated: async (fileUri) => {
            await vscode.commands.executeCommand(
              'vscode.openWith',
              fileUri,
              AudioProjectProvider.viewType,
            );
          },
          onError: (error) => void handleError(error, { showToUser: true }),
        });
        logger.info('Created audio project');
      } catch (error) {
        void handleError(error instanceof Error ? error : new Error(String(error)), {
          showToUser: true,
        });
      }
    }),

    vscode.commands.registerCommand('neko.audio.exportAs', () =>
      runInteractiveCommand(
        'toggleExport',
        'audio.exportAs',
        'Export As — open an audio file first',
      ),
    ),
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
