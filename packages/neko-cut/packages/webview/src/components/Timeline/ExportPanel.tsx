import { useState, useCallback, useEffect, useRef } from 'react';
import { useEditorStore } from '../../stores/editor-store';
import { useTranslation } from '../../i18n/I18nContext';
import { useToast } from './../Toast';
import { useVSCodeMessaging } from '../../hooks/useVSCodeMessaging';
import { postMessage as vscodePostMessage } from '../../utils/vscodeApi';
import type { ProjectData } from '@neko/shared';
import {
  getExportEngine,
  isExportFormatSupported,
  getExportUnsupportedReason,
  ExportEngineFactory,
  type ExportFormat,
  type ExportProgress,
  type GifExportConfig,
} from '../../utils/export';
import { isLibavAvailable } from '../../mediaEngine/libav';
import { GPURenderEngine } from '../../rendering/gpu';
import { getFileUri } from '../../hooks/useVSCodeMessaging';

// =============================================================================
// Helper: Validate Project Media Files
// =============================================================================

/**
 * Preload webview URIs for all media files in the project
 * This ensures URL resolver cache is warm before export starts
 */
async function preloadMediaUris(project: ProjectData): Promise<void> {
  const paths = new Set<string>();

  // Extract all media file paths from project
  for (const track of project.tracks) {
    if (!track?.elements) continue;
    for (const element of track.elements) {
      if ((element.type === 'media' || element.type === 'audio') && element.src) {
        paths.add(element.src);
      }
    }
  }

  if (paths.size === 0) return;

  console.log(`[ExportPanel] Preloading ${paths.size} media URIs...`);

  // Request all URIs in parallel
  const promises = Array.from(paths).map(async (path) => {
    try {
      const uri = await getFileUri(path);
      console.log(`[ExportPanel] Preloaded URI for ${path}: ${uri.substring(0, 50)}...`);
      return { path, uri, success: true };
    } catch (error) {
      console.warn(`[ExportPanel] Failed to preload URI for ${path}:`, error);
      return { path, uri: null, success: false };
    }
  });

  // Wait for all with timeout
  const timeoutPromise = new Promise<void>((resolve) => {
    setTimeout(() => {
      console.warn('[ExportPanel] URI preload timeout, continuing...');
      resolve();
    }, 10000); // 10 second timeout
  });

  await Promise.race([
    Promise.all(promises),
    timeoutPromise,
  ]);

  console.log('[ExportPanel] Media URI preload complete');
}

/**
 * Validate all media files used in the project
 * @returns Array of missing file paths
 */
async function validateProjectMediaFiles(project: ProjectData): Promise<string[]> {
  const missingFiles: string[] = [];
  const checkedPaths = new Set<string>();

  // Extract all media file paths from project
  for (const track of project.tracks) {
    if (!track?.elements) continue;

    for (const element of track.elements) {
      // Check media elements (video/image) and audio elements
      if (element.type === 'media' || element.type === 'audio') {
        const filePath = element.src;
        if (!filePath || checkedPaths.has(filePath)) continue;
        checkedPaths.add(filePath);

        // Request file validation from Extension Host
        // Extension will resolve relative paths based on .jvi file location
        try {
          console.log('[ExportPanel] Validating file:', filePath);

          const response = await new Promise<{ exists: boolean }>((resolve) => {
            const messageHandler = (event: MessageEvent) => {
              const message = event.data;
              if (message.type === 'fileValidation' && message.path === filePath) {
                console.log('[ExportPanel] Validation response:', message);
                window.removeEventListener('message', messageHandler);
                resolve({ exists: message.exists });
              }
            };
            window.addEventListener('message', messageHandler);

            // Send validation request using correct VSCode API
            vscodePostMessage({
              type: 'validateFile',
              path: filePath,
            });

            // Timeout after 5 seconds
            setTimeout(() => {
              console.warn('[ExportPanel] Validation timeout for:', filePath);
              window.removeEventListener('message', messageHandler);
              resolve({ exists: false });
            }, 5000);
          });

          if (!response.exists) {
            console.warn('[ExportPanel] File not found:', filePath);
            missingFiles.push(filePath);
          } else {
            console.log('[ExportPanel] File exists:', filePath);
          }
        } catch (error) {
          console.error('[ExportPanel] File validation error:', error);
          missingFiles.push(filePath);
        }
      }
    }
  }

  return missingFiles;
}

// =============================================================================
// Helper: Convert Blob to Base64
// =============================================================================

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      // Remove the data URL prefix (e.g., "data:video/mp4;base64,")
      const base64 = dataUrl.split(',')[1];
      resolve(base64 ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * 获取导出阶段的本地化标签
 */
function getStageLabel(stage?: string): string {
  const labels: Record<string, string> = {
    initializing: '正在初始化...',
    rendering: '正在渲染帧...',
    encoding: '正在编码视频...',
    muxing: '正在合成音视频...',
    finalizing: '正在保存文件...',
    completed: '导出完成',
    error: '导出失败',
    cancelled: '已取消',
  };
  return labels[stage || ''] || '准备中...';
}

/**
 * 格式化剩余时间
 */
function formatTimeRemaining(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) {
    return `约 ${seconds} 秒`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `约 ${minutes}分${remainingSeconds}秒` : `约 ${minutes} 分钟`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `约 ${hours}小时${remainingMinutes}分`;
}

/**
 * 格式化已用时间
 */
function formatElapsedTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes === 0) {
    return `${remainingSeconds} 秒`;
  }
  if (minutes < 60) {
    return `${minutes}分${remainingSeconds.toString().padStart(2, '0')}秒`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}小时${remainingMinutes.toString().padStart(2, '0')}分${remainingSeconds.toString().padStart(2, '0')}秒`;
}

// =============================================================================
// Types
// =============================================================================

interface ExportPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

// =============================================================================
// ExportPanel Component
// =============================================================================

export function ExportPanel({ isOpen, onClose }: ExportPanelProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { project } = useEditorStore();
  const { sendMessage, sendExportProgress } = useVSCodeMessaging();

  // Ref to track export state
  const exportRef = useRef<{
    isActive: boolean;
    engineInstance: ReturnType<typeof getExportEngine> | null;
  }>({ isActive: false, engineInstance: null });

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const RESOLUTIONS = [
    { label: '4K (3840x2160)', width: 3840, height: 2160 },
    { label: '2K (2560x1440)', width: 2560, height: 1440 },
    { label: '1080p (1920x1080)', width: 1920, height: 1080 },
    { label: '720p (1280x720)', width: 1280, height: 720 },
  ];

  const QUALITY_OPTIONS = [
    { label: '高', value: 'high' as const },
    { label: '中', value: 'medium' as const },
    { label: '低', value: 'low' as const },
  ];

  const FPS_OPTIONS = [24, 25, 30, 50, 60];

  // 获取支持的格式
  const supportedFormats = ExportEngineFactory.getRecommendedFormats();

  // 常用视频格式选项
  const FORMAT_OPTIONS = [
    { label: 'MP4 (H.264)', value: 'mp4' as ExportFormat },
    { label: 'WebM (VP9)', value: 'webm' as ExportFormat },
    { label: 'GIF', value: 'gif' as ExportFormat },
  ].filter(opt => supportedFormats.includes(opt.value));

  const [format, setFormat] = useState<ExportFormat>(supportedFormats[0] || 'mp4');
  const [resolution, setResolution] = useState(RESOLUTIONS[2]); // Default 1080p
  const [quality, setQuality] = useState<'low' | 'medium' | 'high'>('medium');
  const [fps, setFps] = useState(project?.fps || 30);
  const [audioBitrate, setAudioBitrate] = useState(192000); // Default 192kbps (in bps)
  // CRITICAL FIX: Add videoBitrate state - will be auto-calculated if undefined
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [videoBitrate, _setVideoBitrate] = useState<number | undefined>(undefined);
  const [isExporting, setIsExporting] = useState(false);

  // GIF-specific settings
  const [gifColors, setGifColors] = useState(256);
  const [gifDither, setGifDither] = useState(true);
  const [gifQuality, setGifQuality] = useState(80);

  // Enhanced progress
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);

  // Pre-selected export path (used internally, not displayed)
  const [, setSelectedExportPath] = useState<string | null>(null);

  // Global export status (from other webviews)
  const [hasGlobalExport, setHasGlobalExport] = useState(false);

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  // Listen for global export status messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'export:globalStatus') {
        setHasGlobalExport(message.hasActiveExport);
      }
    };

    window.addEventListener('message', handleMessage);

    // Request initial status
    sendMessage({ type: 'export:queryGlobalStatus' });

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [sendMessage]);

  // Sync FPS from project
  useEffect(() => {
    if (project?.fps) {
      setFps(project.fps);
    }
  }, [project?.fps]);

  // ---------------------------------------------------------------------------
  // Progress update helper (with throttling)
  // ---------------------------------------------------------------------------

  const lastProgressUpdateRef = useRef<number>(0);
  const PROGRESS_UPDATE_INTERVAL = 100; // ms - throttle UI updates

  const updateProgress = useCallback((progress: ExportProgress) => {
    const now = performance.now();
    const timeSinceLastUpdate = now - lastProgressUpdateRef.current;

    // Always update on stage change or completion, throttle otherwise
    const shouldUpdate =
      progress.stage === 'completed' ||
      progress.stage === 'error' ||
      progress.stage === 'initializing' ||
      progress.stage === 'finalizing' ||
      timeSinceLastUpdate >= PROGRESS_UPDATE_INTERVAL;

    if (shouldUpdate) {
      lastProgressUpdateRef.current = now;
      setExportProgress(progress);
      // 同时发送到状态栏
      sendExportProgress({
        isExporting: true,
        percent: progress.percent,
        message: progress.message || getStageLabel(progress.stage),
        currentFrame: progress.currentFrame,
        totalFrames: progress.totalFrames,
        currentFps: progress.currentFps,
        estimatedTimeRemaining: progress.estimatedTimeRemaining,
      });
    }
  }, [sendExportProgress]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /**
   * Request export path selection from Extension Host
   */
  const selectExportPath = useCallback(async (): Promise<string | null> => {
    const ext = format === 'gif' ? 'gif' : format === 'webm' ? 'webm' : 'mp4';
    const filename = `${project?.name || 'export'}.${ext}`;

    return new Promise((resolve) => {
      const messageHandler = (event: MessageEvent) => {
        const message = event.data;
        if (message.type === 'exportPathSelected') {
          window.removeEventListener('message', messageHandler);
          if (message.success && message.path) {
            resolve(message.path);
          } else {
            resolve(null);
          }
        }
      };
      window.addEventListener('message', messageHandler);

      // Send path selection request
      vscodePostMessage({
        type: 'selectExportPath',
        filename,
        format: ext,
      });

      // Timeout after 60 seconds (user might take time to select)
      setTimeout(() => {
        window.removeEventListener('message', messageHandler);
        resolve(null);
      }, 60000);
    });
  }, [format, project?.name]);

  const handleExport = useCallback(async () => {
    if (!project) {
      showToast(t('export.errors.noProject'), 'error');
      return;
    }

    // Step 1: Select export path first
    const exportPath = await selectExportPath();
    if (!exportPath) {
      // User cancelled or timeout
      return;
    }
    setSelectedExportPath(exportPath);

    // CRITICAL: Validate all media files before export
    const missingFiles = await validateProjectMediaFiles(project);
    if (missingFiles.length > 0) {
      const fileList = missingFiles.map(f => `• ${f}`).join('\n');
      showToast(
        `导出失败：以下媒体文件不存在或无法访问：\n${fileList}\n\n请检查文件路径或重新导入媒体。`,
        'error',
        10000
      );
      setSelectedExportPath(null);
      return;
    }

    // 检查格式支持
    if (!isExportFormatSupported(format)) {
      const reason = getExportUnsupportedReason(format);
      showToast(reason || t('export.errors.formatNotSupported'), 'error');
      setSelectedExportPath(null);
      return;
    }

    setIsExporting(true);
    setExportProgress(null);
    exportRef.current.isActive = true;

    // 初始进度
    updateProgress({
      stage: 'initializing',
      percent: 0,
      message: '准备导出...',
      currentFrame: 0,
      totalFrames: 0,
      elapsedTime: 0,
      estimatedTimeRemaining: 0,
      currentFps: 0,
    });

    try {
      // Select export mode based on currentMode
      let currentMode = useEditorStore.getState().currentMode;
      let isCompatible = currentMode === 'compatible';

      // For basic mode video export, check if libav.js is available
      // NOTE: Basic mode does NOT fallback to compatible mode - they are independent
      if (!isCompatible && (format === 'mp4' || format === 'webm')) {
        const libavAvailable = await isLibavAvailable();
        if (!libavAvailable) {
          console.error('[ExportPanel] libav.js not available in basic mode');
          // Do NOT fallback to compatible mode - throw error and let user switch manually
          throw new Error(
            '基础模式导出失败：libav.js 音频编码器加载失败。\n\n' +
            '可能的解决方案：\n' +
            '1. 重新加载窗口（Cmd/Ctrl+Shift+P → Reload Window）\n' +
            '2. 切换到兼容模式导出（设置 → 媒体引擎模式 → 兼容模式）\n' +
            '3. 检查扩展是否正确安装'
          );
        } else {
          console.log('[ExportPanel] Using libav.js for audio encoding');
        }
      }

      console.log(`[ExportPanel] Export mode: ${currentMode ?? 'basic'}, engine: ${isCompatible ? 'compatible (Extension FFmpeg)' : 'webview (WebCodecs)'}`);

      // Configure export engine factory based on mode
      ExportEngineFactory.setUseCompatibleMode(isCompatible);

      // Basic mode: set up Webview render engine factory (pure Web export)
      if (!isCompatible && (format === 'mp4' || format === 'webm')) {
        // Preload all media URIs before export to ensure URL resolver cache is warm
        await preloadMediaUris(project);

        ExportEngineFactory.setWebviewRenderEngineFactory(async (canvas: HTMLCanvasElement | OffscreenCanvas) => {
          const engine = new GPURenderEngine();
          const success = await engine.initialize(canvas, {
            preferredBackend: 'auto',
          });

          if (!success) {
            throw new Error('Failed to initialize GPU render engine for export');
          }

          // Set URL resolver for media file access in webview
          const frameProvider = engine.frameProvider;
          if (frameProvider && 'setUrlResolver' in frameProvider) {
            (frameProvider as { setUrlResolver: (r: (path: string) => Promise<string>) => void })
              .setUrlResolver(getFileUri);
          }

          return engine;
        });
      }

      // Get appropriate export engine based on format and mode
      const engine = getExportEngine(format);
      exportRef.current.engineInstance = engine;

      const config = format === 'gif' ? {
        width: resolution.width,
        height: resolution.height,
        fps,
        format: 'gif' as const,
        quality,
        colors: gifColors,
        dither: gifDither,
        gifQuality,
      } as GifExportConfig : {
        width: resolution.width,
        height: resolution.height,
        fps,
        format: format as 'mp4' | 'webm',
        quality,
        audioBitrate,
        videoBitrate,
        urlResolver: getFileUri, // URL resolver for webview file access
      };

      // 执行导出
      const result = await engine.export(project, config, (progress) => {
        updateProgress(progress);
      });

      if (result.success) {
        // Save file to pre-selected path
        if (result.blob) {
          updateProgress({
            stage: 'finalizing',
            percent: 100,
            message: t('export.progress.saving'),
            currentFrame: 0,
            totalFrames: 0,
            elapsedTime: 0,
            estimatedTimeRemaining: 0,
            currentFps: 0,
          });

          const base64Data = await blobToBase64(result.blob);
          const mime = format === 'gif' ? 'image/gif' : format === 'webm' ? 'video/webm' : 'video/mp4';

          // Save to pre-selected path (no dialog)
          sendMessage({
            type: 'saveBlobToPath',
            data: base64Data,
            path: exportPath,
            mimeType: mime,
          });
        }

        showToast(t('export.success.completed'), 'success');
      } else {
        showToast(t('export.errors.exportFailed', { error: result.error || 'Unknown error' }), 'error', 5000);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('Export failed:', err);

      // Check if it's a concurrent export error
      if (errorMessage.includes('已有导出任务正在进行中')) {
        showToast('导出失败：已有其他导出任务正在进行中。请等待完成或取消后再试。', 'error', 5000);
      } else {
        showToast(t('export.errors.exportFailed', { error: errorMessage }), 'error', 5000);
      }
    }

    setIsExporting(false);
    setExportProgress(null);
    setSelectedExportPath(null);
    sendExportProgress({ isExporting: false, percent: 0, message: '' });
    exportRef.current.isActive = false;
    exportRef.current.engineInstance = null;
  }, [project, format, resolution, quality, fps, audioBitrate, videoBitrate, gifColors, gifDither, gifQuality, t, showToast, sendMessage, updateProgress, sendExportProgress, selectExportPath]);

  const handleCancel = useCallback(() => {
    try {
      if (exportRef.current.engineInstance) {
        exportRef.current.engineInstance.cancel();
      }
    } catch {
      // Ignore
    }
    setIsExporting(false);
    setExportProgress(null);
    setSelectedExportPath(null);
    sendExportProgress({ isExporting: false, percent: 0, message: '' });
    showToast(t('export.cancelled'), 'info');
    exportRef.current.isActive = false;
    exportRef.current.engineInstance = null;
  }, [showToast, t, sendExportProgress]);

  // 后台导出：关闭面板但不取消导出
  const handleBackgroundExport = useCallback(() => {
    showToast('导出将在后台继续，请查看状态栏进度', 'info');
    onClose();
  }, [onClose, showToast]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!isOpen) return null;

  // 导出中时只显示精简的进度界面
  if (isExporting) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-[var(--vscode-sideBar-background)] rounded-lg shadow-xl w-[400px] max-w-full border border-vscode-panel-border">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-vscode-panel-border">
            <h2 className="text-lg font-semibold text-vscode-editor-foreground">正在导出</h2>
            <button
              onClick={handleBackgroundExport}
              className="p-1 rounded hover:bg-vscode-list-hoverBackground text-vscode-foreground"
              title="后台导出"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {/* Progress Content */}
          <div className="p-4 space-y-4">
            {/* Stage Header */}
            <div className="flex items-center gap-3">
              {/* Spinning Icon */}
              <div
                className="w-8 h-8 border-[3px] border-t-transparent rounded-full animate-spin"
                style={{ borderColor: 'var(--vscode-progressBar-background)', borderTopColor: 'transparent' }}
              />

              {/* Stage Info */}
              <div className="flex-1">
                <div className="text-sm font-medium text-vscode-foreground">
                  {exportProgress?.message || getStageLabel(exportProgress?.stage)}
                </div>
                <div className="text-xs text-vscode-descriptionForeground">
                  {exportProgress && exportProgress.totalFrames > 0 && (
                    <span>{exportProgress.currentFrame}/{exportProgress.totalFrames} 帧</span>
                  )}
                </div>
              </div>

              {/* Percentage */}
              <div
                className="text-2xl font-bold"
                style={{ color: 'var(--vscode-progressBar-background)' }}
              >
                {Math.round(exportProgress?.percent || 0)}%
              </div>
            </div>

            {/* Progress Bar */}
            <div className="relative h-3 bg-vscode-input-background rounded-full overflow-hidden">
              <div
                className="h-full transition-all duration-300 ease-out"
                style={{
                  width: `${exportProgress?.percent || 0}%`,
                  backgroundColor: 'var(--vscode-progressBar-background)'
                }}
              />
              {/* Shimmer effect */}
              <div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                style={{
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 2s infinite linear'
                }}
              />
            </div>

            {/* Stats Row */}
            <div
              className="flex items-center justify-between px-3 py-2 rounded-md text-xs"
              style={{ backgroundColor: 'var(--vscode-editor-inactiveSelectionBackground)' }}
            >
              <div className="flex items-center gap-4">
                {/* FPS */}
                {exportProgress && exportProgress.currentFps > 0 && (
                  <div className="flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--vscode-charts-yellow)' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span className="font-mono font-semibold" style={{ color: 'var(--vscode-charts-yellow)' }}>
                      {exportProgress.currentFps.toFixed(1)}
                    </span>
                    <span style={{ color: 'var(--vscode-foreground)', opacity: 0.7 }}>fps</span>
                  </div>
                )}
                {/* Elapsed Time */}
                {exportProgress && exportProgress.elapsedTime > 0 && (
                  <div className="flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--vscode-foreground)', opacity: 0.6 }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span style={{ color: 'var(--vscode-foreground)' }}>
                      {formatElapsedTime(exportProgress.elapsedTime)}
                    </span>
                  </div>
                )}
              </div>
              {/* Remaining Time */}
              {exportProgress && exportProgress.estimatedTimeRemaining > 0 && (
                <div className="flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--vscode-charts-green)' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-semibold" style={{ color: 'var(--vscode-charts-green)' }}>
                    {formatTimeRemaining(exportProgress.estimatedTimeRemaining)}
                  </span>
                </div>
              )}
            </div>

            {/* Performance Stats */}
            {exportProgress?.performanceStats && (
              <div
                className="rounded-md p-3 mt-2"
                style={{ backgroundColor: 'var(--vscode-editor-inactiveSelectionBackground)' }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--vscode-foreground)', opacity: 0.7 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <span className="text-xs font-medium" style={{ color: 'var(--vscode-foreground)' }}>性能统计</span>
                  {exportProgress.performanceStats.pipelineMode && (
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                      style={{
                        backgroundColor: 'var(--vscode-charts-blue)',
                        color: 'var(--vscode-editor-background)',
                      }}
                    >
                      Pipeline
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-xs">
                  {/* Decode Time */}
                  {exportProgress.performanceStats.avgDecodeTime != null && exportProgress.performanceStats.avgDecodeTime > 0 && (
                    <div className="flex justify-between items-center">
                      <span style={{ color: 'var(--vscode-foreground)', opacity: 0.6 }}>解码</span>
                      <span className="font-mono" style={{ color: 'var(--vscode-foreground)' }}>
                        {exportProgress.performanceStats.avgDecodeTime.toFixed(1)}
                        <span style={{ opacity: 0.5 }}>ms</span>
                      </span>
                    </div>
                  )}
                  {/* Render Time */}
                  {exportProgress.performanceStats.avgRenderTime != null && (
                    <div className="flex justify-between items-center">
                      <span style={{ color: 'var(--vscode-foreground)', opacity: 0.6 }}>渲染</span>
                      <span className="font-mono" style={{ color: 'var(--vscode-foreground)' }}>
                        {exportProgress.performanceStats.avgRenderTime.toFixed(1)}
                        <span style={{ opacity: 0.5 }}>ms</span>
                      </span>
                    </div>
                  )}
                  {/* Encode Time */}
                  {exportProgress.performanceStats.avgEncodeTime != null && (
                    <div className="flex justify-between items-center">
                      <span style={{ color: 'var(--vscode-foreground)', opacity: 0.6 }}>编码</span>
                      <span className="font-mono" style={{ color: 'var(--vscode-foreground)' }}>
                        {exportProgress.performanceStats.avgEncodeTime.toFixed(1)}
                        <span style={{ opacity: 0.5 }}>ms</span>
                      </span>
                    </div>
                  )}
                  {exportProgress.performanceStats.memoryUsedMB != null && exportProgress.performanceStats.memoryUsedMB > 0 && (
                    <div className="flex justify-between items-center">
                      <span style={{ color: 'var(--vscode-foreground)', opacity: 0.6 }}>内存</span>
                      <span className="font-mono" style={{ color: 'var(--vscode-foreground)' }}>
                        {exportProgress.performanceStats.memoryUsedMB}
                        <span style={{ opacity: 0.5 }}>MB</span>
                      </span>
                    </div>
                  )}
                  {/* VRAM Usage */}
                  {exportProgress.performanceStats.vramUsedMB != null && exportProgress.performanceStats.vramUsedMB > 0 && (
                    <div className="flex justify-between items-center">
                      <span style={{ color: 'var(--vscode-foreground)', opacity: 0.6 }}>显存</span>
                      <span className="font-mono" style={{ color: 'var(--vscode-foreground)' }}>
                        {exportProgress.performanceStats.vramUsedMB}
                        <span style={{ opacity: 0.5 }}>MB</span>
                      </span>
                    </div>
                  )}
                  {/* CPU Usage */}
                  {exportProgress.performanceStats.cpuUsage != null && exportProgress.performanceStats.cpuUsage > 0 && (
                    <div className="flex justify-between items-center">
                      <span style={{ color: 'var(--vscode-foreground)', opacity: 0.6 }}>CPU</span>
                      <span className="font-mono" style={{ color: 'var(--vscode-foreground)' }}>
                        {exportProgress.performanceStats.cpuUsage.toFixed(0)}
                        <span style={{ opacity: 0.5 }}>%</span>
                      </span>
                    </div>
                  )}
                  {/* GPU Usage */}
                  {exportProgress.performanceStats.gpuUsage != null && exportProgress.performanceStats.gpuUsage > 0 && (
                    <div className="flex justify-between items-center">
                      <span style={{ color: 'var(--vscode-foreground)', opacity: 0.6 }}>GPU</span>
                      <span className="font-mono" style={{ color: 'var(--vscode-foreground)' }}>
                        {exportProgress.performanceStats.gpuUsage.toFixed(0)}
                        <span style={{ opacity: 0.5 }}>%</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Hint */}
            <div className="text-xs text-center text-vscode-descriptionForeground opacity-60">
              提示：点击右上角可最小化到状态栏继续后台导出
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-between gap-2 px-4 py-3 border-t border-vscode-panel-border">
            <button
              onClick={handleBackgroundExport}
              className="px-4 py-2 bg-vscode-button-secondaryBackground hover:bg-vscode-button-secondaryHoverBackground rounded text-vscode-button-secondaryForeground transition-colors text-sm"
            >
              后台运行
            </button>
            <button
              onClick={handleCancel}
              className="px-4 py-2 rounded text-sm transition-colors"
              style={{
                backgroundColor: 'var(--vscode-inputValidation-errorBackground, #5a1d1d)',
                color: 'var(--vscode-inputValidation-errorForeground, #ffffff)',
                border: '1px solid var(--vscode-inputValidation-errorBorder, #be1100)'
              }}
            >
              取消导出
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 配置面板（非导出状态）
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-[var(--vscode-sideBar-background)] rounded-lg shadow-xl w-[480px] max-w-full border border-vscode-panel-border opacity-100">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-vscode-panel-border">
          <h2 className="text-lg font-semibold text-vscode-editor-foreground">导出视频</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-vscode-list-hoverBackground text-vscode-foreground"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Global Export Warning */}
          {hasGlobalExport && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 flex items-start gap-2">
              <svg className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="flex-1">
                <div className="text-sm font-medium text-yellow-500">其他编辑器正在导出视频</div>
                <div className="text-xs text-vscode-descriptionForeground mt-1">
                  请等待当前导出完成后再试，或切换到正在导出的编辑器查看进度。
                </div>
              </div>
            </div>
          )}

          {/* Format */}
          <div>
            <label className="block text-sm font-medium text-vscode-foreground mb-2">格式</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as ExportFormat)}
              className="w-full px-3 py-2 bg-vscode-input-background border border-vscode-input-border rounded text-vscode-input-foreground focus:outline-none focus:border-vscode-focusBorder"
            >
              {FORMAT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Resolution */}
          <div>
            <label className="block text-sm font-medium text-vscode-foreground mb-2">分辨率</label>
            <select
              value={`${resolution.width}x${resolution.height}`}
              onChange={(e) => {
                const [w, h] = e.target.value.split('x').map(Number);
                const res = RESOLUTIONS.find(r => r.width === w && r.height === h);
                if (res) setResolution(res);
              }}
              className="w-full px-3 py-2 bg-vscode-input-background border border-vscode-input-border rounded text-vscode-input-foreground focus:outline-none focus:border-vscode-focusBorder"
            >
              {RESOLUTIONS.map((res) => (
                <option key={res.label} value={`${res.width}x${res.height}`}>{res.label}</option>
              ))}
            </select>
          </div>

          {/* Quality */}
          <div>
            <label className="block text-sm font-medium text-vscode-foreground mb-2">质量</label>
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value as 'low' | 'medium' | 'high')}
              className="w-full px-3 py-2 bg-vscode-input-background border border-vscode-input-border rounded text-vscode-input-foreground focus:outline-none focus:border-vscode-focusBorder"
            >
              {QUALITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Audio Bitrate - Only for MP4/WebM */}
          {(format === 'mp4' || format === 'webm') && (
            <div>
              <label className="block text-sm font-medium text-vscode-foreground mb-2">音频比特率</label>
              <select
                value={audioBitrate}
                onChange={(e) => setAudioBitrate(Number(e.target.value))}
                className="w-full px-3 py-2 bg-vscode-input-background border border-vscode-input-border rounded text-vscode-input-foreground focus:outline-none focus:border-vscode-focusBorder"
              >
                <option value={96000}>96 kbps</option>
                <option value={128000}>128 kbps</option>
                <option value={192000}>192 kbps</option>
                <option value={256000}>256 kbps</option>
                <option value={320000}>320 kbps</option>
              </select>
            </div>
          )}

          {/* FPS */}
          <div>
            <label className="block text-sm font-medium text-vscode-foreground mb-2">帧率: {fps} FPS</label>
            <select
              value={fps}
              onChange={(e) => setFps(Number(e.target.value))}
              className="w-full px-3 py-2 bg-vscode-input-background border border-vscode-input-border rounded text-vscode-input-foreground focus:outline-none focus:border-vscode-focusBorder"
            >
              {FPS_OPTIONS.map((fpsValue) => (
                <option key={fpsValue} value={fpsValue}>{fpsValue} FPS</option>
              ))}
            </select>
          </div>

          {/* GIF-specific settings */}
          {format === 'gif' && (
            <>
              <div>
                <label className="block text-sm font-medium text-vscode-foreground mb-2">
                  颜色数量: {gifColors}
                </label>
                <input
                  type="range"
                  min={2}
                  max={256}
                  step={1}
                  value={gifColors}
                  onChange={(e) => setGifColors(Number(e.target.value))}
                  className="w-full accent-vscode-focusBorder"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-vscode-foreground mb-2">
                  GIF 质量: {gifQuality}
                </label>
                <input
                  type="range"
                  min={1}
                  max={100}
                  step={1}
                  value={gifQuality}
                  onChange={(e) => setGifQuality(Number(e.target.value))}
                  className="w-full accent-vscode-focusBorder"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="gif-dither"
                  checked={gifDither}
                  onChange={(e) => setGifDither(e.target.checked)}
                  className="w-4 h-4 accent-vscode-focusBorder"
                />
                <label htmlFor="gif-dither" className="text-sm text-vscode-foreground">
                  抖动处理
                </label>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-vscode-panel-border">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-vscode-button-secondaryBackground hover:bg-vscode-button-secondaryHoverBackground rounded text-vscode-button-secondaryForeground transition-colors"
          >
            关闭
          </button>
          <button
            onClick={handleExport}
            disabled={!isExportFormatSupported(format) || hasGlobalExport}
            className="px-4 py-2 bg-vscode-button-background hover:bg-vscode-button-hoverBackground disabled:bg-vscode-button-secondaryBackground disabled:cursor-not-allowed disabled:opacity-50 rounded text-vscode-button-foreground transition-colors"
          >
            {hasGlobalExport ? '导出中...' : '导出'}
          </button>
        </div>
      </div>
    </div>
  );
}
