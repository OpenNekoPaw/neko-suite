/**
 * Media Engine Manager
 *
 * Core manager for the progressive media processing architecture.
 * Handles mode selection and engine lifecycle.
 *
 * Note: Compatible mode is now always available via Rust N-API (no download needed).
 */

import * as vscode from 'vscode';
import type {
  IMediaEngine,
  MediaEngineMode,
  MediaEngineInitOptions,
  ModeSelectionResult,
  MediaInfo,
  ResolveAutoModeContext,
  TimelineMediaAnalysisResult,
} from '@neko/shared';

// Basic mode (WebCodecs) supported codecs — used for mode selection heuristics.
// These functions determine if a codec can be handled by WebCodecs alone,
// or if compatible mode (Native FFmpeg) is needed.
const BASIC_VIDEO_CODECS = new Set(['h264', 'vp8', 'vp9', 'av1']);
const BASIC_AUDIO_CODECS = new Set(['aac', 'opus', 'vorbis', 'mp3', 'flac']);

function isBasicModeVideoCodec(codec: string): boolean {
  return BASIC_VIDEO_CODECS.has(codec.toLowerCase());
}

function isBasicModeAudioCodec(codec: string): boolean {
  return BASIC_AUDIO_CODECS.has(codec.toLowerCase());
}

import { NativeMediaEngine, createNativeMediaEngine } from './NativeMediaEngine';
import { getLogger } from '../base/logger';

const logger = getLogger('MediaEngineManager');

// =============================================================================
// Types
// =============================================================================

/**
 * Manager configuration
 */
export interface MediaEngineManagerConfig {
  /** Default mode preference */
  defaultMode?: 'auto' | 'basic' | 'compatible';
}

// =============================================================================
// Media Engine Manager
// =============================================================================

/**
 * Manages media engine instances and mode selection
 *
 * Responsibilities:
 * - Automatic mode selection based on media format
 * - Engine lifecycle management
 *
 * Note: Compatible mode is always available via Rust N-API (bundled FFmpeg).
 */
export class MediaEngineManager implements vscode.Disposable {
  private _config: MediaEngineManagerConfig;

  // Engine instances (lazy initialized)
  private _compatibleEngine: NativeMediaEngine | null = null;

  // Current state
  private _currentMode: MediaEngineMode | null = null;
  private _disposables: vscode.Disposable[] = [];

  constructor(config: MediaEngineManagerConfig = {}) {
    this._config = {
      defaultMode: 'auto',
      ...config,
    };
  }

  // =========================================================================
  // Properties
  // =========================================================================

  /**
   * Current active mode
   */
  get currentMode(): MediaEngineMode | null {
    return this._currentMode;
  }

  /**
   * Whether compatible mode is installed
   * Always true since Rust N-API bundles FFmpeg
   */
  get isCompatibleModeInstalled(): boolean {
    return true;
  }

  /**
   * Get the mode that auto mode would select for non-editor scenarios
   * For non-editor scenarios (AI chat, external API), always returns 'compatible'
   * For editor scenarios, use resolveAutoMode() instead
   */
  get autoSelectedMode(): MediaEngineMode {
    return 'compatible';
  }

  // =========================================================================
  // Context-Aware Auto Mode Selection
  // =========================================================================

  /**
   * Analyze timeline media files and determine if they all support basic mode
   *
   * @param mediaPaths - Array of media file paths from timeline
   * @param projectDir - Project directory for resolving relative paths
   * @returns Analysis result with support status and unsupported files list
   */
  async analyzeTimelineMedia(
    mediaPaths: string[],
    projectDir?: string,
  ): Promise<TimelineMediaAnalysisResult> {
    const unsupportedFiles: TimelineMediaAnalysisResult['unsupportedFiles'] = [];
    let supportedCount = 0;

    // Empty timeline - basic mode is sufficient
    if (mediaPaths.length === 0) {
      return {
        allSupportBasic: true,
        unsupportedFiles: [],
        totalFiles: 0,
        supportedCount: 0,
      };
    }

    // Get or create compatible engine for probing
    const engine = await this.getCompatibleEngine();

    for (const mediaPath of mediaPaths) {
      // Resolve relative path if projectDir is provided
      let absolutePath = mediaPath;
      if (projectDir && !mediaPath.startsWith('/')) {
        const path = await import('path');
        absolutePath = path.resolve(projectDir, mediaPath);
      }

      try {
        const mediaInfo = await engine.probeMedia(absolutePath);
        const analysis = this.analyzeMedia(mediaInfo);

        if (analysis.recommendedMode === 'basic') {
          supportedCount++;
        } else {
          // Build reason string
          const reasons: string[] = [];
          if (mediaInfo.codec && !isBasicModeVideoCodec(mediaInfo.codec)) {
            reasons.push(`视频编码 ${mediaInfo.codec} 不支持`);
          }
          if (mediaInfo.audioCodec && !isBasicModeAudioCodec(mediaInfo.audioCodec)) {
            reasons.push(`音频编码 ${mediaInfo.audioCodec} 不支持`);
          }

          unsupportedFiles.push({
            path: mediaPath,
            reason: reasons.join('; ') || '格式不兼容',
            videoCodec: mediaInfo.codec,
            audioCodec: mediaInfo.audioCodec,
          });
        }
      } catch (error) {
        // Probe failed - conservative approach: mark as unsupported
        logger.warn(`Failed to probe ${absolutePath}`, error);
        unsupportedFiles.push({
          path: mediaPath,
          reason: `无法分析文件: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    return {
      allSupportBasic: unsupportedFiles.length === 0,
      unsupportedFiles,
      totalFiles: mediaPaths.length,
      supportedCount,
    };
  }

  /**
   * Resolve auto mode based on context
   *
   * - Editor context: Analyze timeline media, use basic if all supported
   * - Non-editor context: Always use compatible mode
   *
   * @param context - 'editor' for video editor, 'non-editor' for AI chat/external API
   * @param mediaPaths - Media file paths (required for 'editor' context)
   * @param projectDir - Project directory for resolving relative paths
   * @returns Resolved mode ('basic' or 'compatible')
   */
  async resolveAutoMode(
    context: ResolveAutoModeContext,
    mediaPaths?: string[],
    projectDir?: string,
  ): Promise<MediaEngineMode> {
    // Non-editor context: always use compatible mode for maximum format support
    if (context === 'non-editor') {
      return 'compatible';
    }

    // Editor context: analyze timeline media
    if (!mediaPaths || mediaPaths.length === 0) {
      // Empty timeline - use basic mode (no need for compatible mode)
      return 'basic';
    }

    const analysis = await this.analyzeTimelineMedia(mediaPaths, projectDir);

    if (analysis.allSupportBasic) {
      logger.info(`All ${analysis.totalFiles} media files support basic mode`);
      return 'basic';
    }

    // Some files need compatible mode
    logger.info(
      `${analysis.unsupportedFiles.length}/${analysis.totalFiles} files require compatible mode`,
      analysis.unsupportedFiles.map((f) => `${f.path}: ${f.reason}`),
    );

    return 'compatible';
  }

  // =========================================================================
  // Mode Selection
  // =========================================================================

  /**
   * Analyze media and determine the best mode
   */
  analyzeMedia(mediaInfo: MediaInfo): ModeSelectionResult {
    const unsupportedFeatures: string[] = [];
    let needsCompatible = false;

    // Check video codec
    if (mediaInfo.codec && !isBasicModeVideoCodec(mediaInfo.codec)) {
      needsCompatible = true;
      unsupportedFeatures.push(`视频编码: ${mediaInfo.codec}`);
    }

    // Check audio codec
    if (mediaInfo.audioCodec && !isBasicModeAudioCodec(mediaInfo.audioCodec)) {
      needsCompatible = true;
      unsupportedFeatures.push(`音频编码: ${mediaInfo.audioCodec}`);
    }

    // Check resolution (4K+ may need compatible mode for performance)
    if (mediaInfo.width > 3840 || mediaInfo.height > 2160) {
      // 4K+ is supported but may benefit from compatible mode
      unsupportedFeatures.push(`高分辨率: ${mediaInfo.width}x${mediaInfo.height}`);
    }

    if (needsCompatible) {
      return {
        recommendedMode: 'compatible',
        reason: `媒体格式需要兼容模式: ${unsupportedFeatures.join(', ')}`,
        requiresDownload: false, // Always available via Rust N-API
        unsupportedFeatures,
      };
    }

    return {
      recommendedMode: 'basic',
      reason: '媒体格式支持基础模式',
      requiresDownload: false,
    };
  }

  /**
   * Select and return the appropriate engine for the given media
   */
  async selectEngine(mediaInfo: MediaInfo): Promise<IMediaEngine> {
    const analysis = this.analyzeMedia(mediaInfo);

    // If basic mode is sufficient, return a marker for Webview to use WebMediaEngine
    if (analysis.recommendedMode === 'basic') {
      this._currentMode = 'basic';
      // Basic mode engine runs in Webview, not here
      // Return a proxy or throw to indicate Webview should handle it
      throw new BasicModeRequiredError(
        'Basic mode should be used. Initialize WebMediaEngine in Webview.',
      );
    }

    // Compatible mode needed
    return this.getCompatibleEngine();
  }

  /**
   * Get or create compatible mode engine
   */
  async getCompatibleEngine(): Promise<NativeMediaEngine> {
    // Create or return existing engine
    if (!this._compatibleEngine) {
      this._compatibleEngine = await createNativeMediaEngine();
    }

    this._currentMode = 'compatible';
    return this._compatibleEngine;
  }

  /**
   * Force use of a specific mode
   */
  async forceMode(mode: MediaEngineMode): Promise<IMediaEngine | null> {
    if (mode === 'basic') {
      this._currentMode = 'basic';
      // Basic mode runs in Webview
      return null;
    }

    return this.getCompatibleEngine();
  }

  // =========================================================================
  // Engine Lifecycle
  // =========================================================================

  /**
   * Dispose current engines
   */
  async disposeEngines(): Promise<void> {
    if (this._compatibleEngine) {
      await this._compatibleEngine.dispose();
      this._compatibleEngine = null;
    }

    this._currentMode = null;
  }

  /**
   * Check if a media file can be processed
   */
  canProcess(_mediaInfo: MediaInfo): boolean {
    // Compatible mode is always available via Rust N-API
    return true;
  }

  /**
   * Get recommended mode for media without creating engine
   */
  getRecommendedMode(mediaInfo: MediaInfo): MediaEngineMode {
    return this.analyzeMedia(mediaInfo).recommendedMode;
  }

  // =========================================================================
  // Utility Methods
  // =========================================================================

  /**
   * Probe media file and return info with mode recommendation
   */
  async probeMediaWithRecommendation(
    source: string,
  ): Promise<{ mediaInfo: MediaInfo; recommendation: ModeSelectionResult }> {
    const engine = await this.getCompatibleEngine();
    const mediaInfo = await engine.probeMedia(source);
    const recommendation = this.analyzeMedia(mediaInfo);

    return { mediaInfo, recommendation };
  }

  // =========================================================================
  // Disposal
  // =========================================================================

  dispose(): void {
    this.disposeEngines().catch((err) => logger.error('Failed to dispose engines', err));
    this._disposables.forEach((d) => d.dispose());
  }
}

// =============================================================================
// Errors
// =============================================================================

/**
 * Error indicating basic mode should be used (in Webview)
 */
export class BasicModeRequiredError extends Error {
  readonly code = 'BASIC_MODE_REQUIRED';

  constructor(message: string) {
    super(message);
    this.name = 'BasicModeRequiredError';
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a MediaEngineManager instance
 */
export function createMediaEngineManager(
  _globalStorageUri?: vscode.Uri,
  config?: MediaEngineManagerConfig,
): MediaEngineManager {
  return new MediaEngineManager(config);
}
