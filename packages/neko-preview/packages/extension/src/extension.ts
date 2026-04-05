/**
 * Neko Preview Extension
 *
 * Lightweight media preview for video and audio files,
 * powered by neko-engine's hardware-accelerated pipeline.
 *
 * Architecture:
 * extension.ts → VideoPreviewProvider / AudioPreviewProvider
 *   → PreviewService → EngineClient (HTTP) → neko-engine Frame Server
 *   → Webview (H264StreamClient / Web Audio API)
 *
 * Exports NekoPreviewAPI for other extensions (e.g. neko-canvas)
 * to share the same engine connection and frame server.
 */

import * as vscode from 'vscode';
import { VideoPreviewProvider } from './providers/VideoPreviewProvider';
import { AudioPreviewProvider } from './providers/AudioPreviewProvider';
import { PdfPreviewProvider } from './providers/document/PdfPreviewProvider';
import { CbzPreviewProvider } from './providers/document/CbzPreviewProvider';
import { EpubPreviewProvider } from './providers/document/EpubPreviewProvider';
import { DocxPreviewProvider } from './providers/document/DocxPreviewProvider';
import { registerOpenCommand } from './providers/document/documentProviderHelper';
import { EpubSymbolProvider } from './epub/EpubSymbolProvider';
import { PreviewService } from './services/PreviewService';
import { StatusBarManager } from './ui/StatusBarManager';
import type { NekoPreviewAPI } from './types/api';
import { createVSCodeLogger } from '@neko/shared/vscode/extension';
import { setRootLogger, getLogger } from './utils/logger';

const logger = getLogger('Extension');

// =============================================================================
// Extension State
// =============================================================================

let videoProvider: VideoPreviewProvider | null = null;
let audioProvider: AudioPreviewProvider | null = null;
let pdfProvider: PdfPreviewProvider | null = null;
let cbzProvider: CbzPreviewProvider | null = null;
let epubProvider: EpubPreviewProvider | null = null;
let docxProvider: DocxPreviewProvider | null = null;
let statusBarManager: StatusBarManager | null = null;
let sharedPreviewService: PreviewService | null = null;

// =============================================================================
// Activation
// =============================================================================

export async function activate(context: vscode.ExtensionContext): Promise<NekoPreviewAPI> {
  const rootLogger = createVSCodeLogger('Neko Preview', 'NekoPreview', context);
  setRootLogger(rootLogger);

  logger.info('Activating extension...');

  // Create shared PreviewService singleton (NativeEngine + frame server)
  sharedPreviewService = await PreviewService.tryCreate();
  if (sharedPreviewService) {
    context.subscriptions.push(sharedPreviewService);
    logger.info(`Shared PreviewService ready (port: ${sharedPreviewService.port})`);
  } else {
    logger.warn('Failed to create PreviewService — native engine unavailable');
  }

  // Create shared status bar
  statusBarManager = new StatusBarManager();
  context.subscriptions.push(statusBarManager);

  // Create providers and inject shared PreviewService
  videoProvider = new VideoPreviewProvider(context.extensionUri, statusBarManager);
  audioProvider = new AudioPreviewProvider(context.extensionUri, statusBarManager);

  if (sharedPreviewService) {
    videoProvider.setPreviewService(sharedPreviewService);
    audioProvider.setPreviewService(sharedPreviewService);
  }

  // Register custom editors
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(VideoPreviewProvider.viewType, videoProvider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    }),
  );

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(AudioPreviewProvider.viewType, audioProvider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    }),
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.preview.openVideo', async () => {
      const fileUri = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectMany: false,
        filters: {
          'Video Files': ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'ts', 'flv', 'wmv'],
        },
        title: 'Open Video Preview',
      });

      if (fileUri && fileUri.length > 0) {
        await vscode.commands.executeCommand(
          'vscode.openWith',
          fileUri[0],
          VideoPreviewProvider.viewType,
        );
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.preview.openAudio', async () => {
      const fileUri = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectMany: false,
        filters: {
          'Audio Files': ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'],
        },
        title: 'Open Audio Preview',
      });

      if (fileUri && fileUri.length > 0) {
        await vscode.commands.executeCommand(
          'vscode.openWith',
          fileUri[0],
          AudioPreviewProvider.viewType,
        );
      }
    }),
  );

  // Register providers for disposal
  context.subscriptions.push(videoProvider);
  context.subscriptions.push(audioProvider);

  // =========================================================================
  // Document Preview Providers (no engine dependency)
  // =========================================================================

  pdfProvider = new PdfPreviewProvider(context.extensionUri, statusBarManager);
  cbzProvider = new CbzPreviewProvider(context.extensionUri, statusBarManager);
  epubProvider = new EpubPreviewProvider(context.extensionUri, statusBarManager);
  docxProvider = new DocxPreviewProvider(context.extensionUri, statusBarManager);

  // Register document custom editors
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(PdfPreviewProvider.viewType, pdfProvider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    }),
    vscode.window.registerCustomEditorProvider(CbzPreviewProvider.viewType, cbzProvider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    }),
    vscode.window.registerCustomEditorProvider(EpubPreviewProvider.viewType, epubProvider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    }),
    vscode.window.registerCustomEditorProvider(DocxPreviewProvider.viewType, docxProvider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    }),
  );

  // Register document open commands
  registerOpenCommand(
    context,
    'neko.preview.openPdf',
    PdfPreviewProvider.viewType,
    {
      'PDF Files': ['pdf'],
    },
    'Open PDF Preview',
  );
  registerOpenCommand(
    context,
    'neko.preview.openCbz',
    CbzPreviewProvider.viewType,
    {
      'CBZ Files': ['cbz'],
    },
    'Open CBZ Preview',
  );
  registerOpenCommand(
    context,
    'neko.preview.openEpub',
    EpubPreviewProvider.viewType,
    {
      'EPUB Files': ['epub'],
    },
    'Open EPUB Preview',
  );
  registerOpenCommand(
    context,
    'neko.preview.openDocx',
    DocxPreviewProvider.viewType,
    {
      'Word Files': ['docx', 'doc'],
    },
    'Open DOCX Preview',
  );

  // Register document providers for disposal
  context.subscriptions.push(pdfProvider, cbzProvider, epubProvider, docxProvider);

  // =========================================================================
  // EPUB Outline (DocumentSymbolProvider) + goToChapter command
  // =========================================================================

  const epubSymbolProvider = new EpubSymbolProvider();

  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider({ pattern: '**/*.epub' }, epubSymbolProvider),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.epub.goToChapter', async () => {
      const activeUri = epubProvider.getActiveUri();
      if (!activeUri) {
        vscode.window.showInformationMessage('No EPUB file is currently open.');
        return;
      }
      const toc = await epubSymbolProvider.getToc(activeUri.fsPath);
      if (toc.length === 0) {
        vscode.window.showInformationMessage('No table of contents found in this EPUB.');
        return;
      }
      const items = toc.map((entry) => ({
        label: '  '.repeat(entry.depth) + entry.label,
        description: entry.href,
        href: entry.href,
      }));
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Go to chapter…',
        matchOnDescription: true,
      });
      if (picked) {
        epubProvider.navigateToChapter(picked.href);
      }
    }),
  );

  logger.info('Extension activated');

  // Build and return public API for other extensions
  const api: NekoPreviewAPI = {
    get isAvailable() {
      return sharedPreviewService?.isAvailable ?? false;
    },
    get port() {
      return sharedPreviewService?.port ?? null;
    },
    getStreamWebSocketUrl(streamId: string) {
      return sharedPreviewService?.getStreamWebSocketUrl(streamId) ?? null;
    },
    probeMedia(filePath: string) {
      if (!sharedPreviewService?.isAvailable) {
        return Promise.reject(new Error('PreviewService not available'));
      }
      return sharedPreviewService.probeMedia(filePath);
    },
    startPlayback(filePath, mediaInfo, startTime = 0, speed = 1.0) {
      if (!sharedPreviewService?.isAvailable) {
        return Promise.reject(new Error('PreviewService not available'));
      }
      return sharedPreviewService.startVideoPlayback(filePath, mediaInfo, startTime, speed);
    },
    stopStreams(videoStreamId, audioStreamId) {
      if (!sharedPreviewService?.isAvailable) {
        return Promise.resolve();
      }
      return sharedPreviewService.stopStreams(videoStreamId, audioStreamId);
    },
    seekStreams(videoStreamId, audioStreamId, time) {
      if (!sharedPreviewService?.isAvailable) {
        return Promise.resolve();
      }
      return sharedPreviewService.seekStreams(videoStreamId, audioStreamId, time);
    },
    pauseStreams(videoStreamId, audioStreamId) {
      if (!sharedPreviewService?.isAvailable) {
        return Promise.resolve();
      }
      return sharedPreviewService.pauseStreams(videoStreamId, audioStreamId);
    },
    resumeStreams(videoStreamId, audioStreamId) {
      if (!sharedPreviewService?.isAvailable) {
        return Promise.resolve();
      }
      return sharedPreviewService.resumeStreams(videoStreamId, audioStreamId);
    },
    setStreamSpeed(videoStreamId, audioStreamId, speed) {
      if (!sharedPreviewService?.isAvailable) {
        return Promise.resolve();
      }
      return sharedPreviewService.setStreamSpeed(videoStreamId, audioStreamId, speed);
    },
    captureFrame(filePath, time, quality = 80) {
      if (!sharedPreviewService?.isAvailable) {
        return Promise.reject(new Error('PreviewService not available'));
      }
      return sharedPreviewService.captureFrame(filePath, time, quality);
    },
  };

  return api;
}

// =============================================================================
// Deactivation
// =============================================================================

export function deactivate(): void {
  logger.info('Deactivating extension...');

  videoProvider?.dispose();
  videoProvider = null;

  audioProvider?.dispose();
  audioProvider = null;

  pdfProvider?.dispose();
  pdfProvider = null;

  cbzProvider?.dispose();
  cbzProvider = null;

  epubProvider?.dispose();
  epubProvider = null;

  docxProvider?.dispose();
  docxProvider = null;

  statusBarManager?.dispose();
  statusBarManager = null;

  // sharedPreviewService is disposed via context.subscriptions
  sharedPreviewService = null;

  logger.info('Extension deactivated');
}
