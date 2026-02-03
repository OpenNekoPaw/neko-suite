import { useState, useCallback, useEffect, useRef } from 'react';
import { useEditorStore } from '../../stores/editor-store';
import { useTranslation } from '../../i18n/I18nContext';
import { useToast } from './../Toast';
import { useVSCodeMessaging } from '../../hooks/useVSCodeMessaging';
import { postMessage as vscodePostMessage } from '../../utils/vscodeApi';
import type { ProjectData } from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

type ExportFormat = 'mp4' | 'webm' | 'gif';

interface ExportProgress {
  stage: 'initializing' | 'rendering' | 'encoding' | 'muxing' | 'finalizing' | 'completed' | 'error' | 'cancelled';
  percent: number;
  message?: string;
  currentFrame: number;
  totalFrames: number;
  elapsedTime: number;
  estimatedTimeRemaining: number;
  currentFps: number;
  performanceStats?: {
    avgDecodeTime?: number;
    avgRenderTime?: number;
    avgEncodeTime?: number;
    memoryUsedMB?: number;
    vramUsedMB?: number;
    cpuUsage?: number;
    gpuUsage?: number;
    pipelineMode?: boolean;
  };
}

interface ExportPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

// =============================================================================
// Helper: Validate Project Media Files
// =============================================================================

async function validateProjectMediaFiles(project: ProjectData): Promise<string[]> {
  const missingFiles: string[] = [];
  const checkedPaths = new Set<string>();

  for (const track of project.tracks) {
    if (!track?.elements) continue;

    for (const element of track.elements) {
      if (element.type === 'media' || element.type === 'audio') {
        const filePath = element.src;
        if (!filePath || checkedPaths.has(filePath)) continue;
        checkedPaths.add(filePath);

        try {
          const response = await new Promise<{ exists: boolean }>((resolve) => {
            const messageHandler = (event: MessageEvent) => {
              const message = event.data;
              if (message.type === 'fileValidation' && message.path === filePath) {
                window.removeEventListener('message', messageHandler);
                resolve({ exists: message.exists });
              }
            };
            window.addEventListener('message', messageHandler);

            vscodePostMessage({
              type: 'validateFile',
              path: filePath,
            });

            setTimeout(() => {
              window.removeEventListener('message', messageHandler);
              resolve({ exists: false });
            }, 5000);
          });

          if (!response.exists) {
            missingFiles.push(filePath);
          }
        } catch {
          missingFiles.push(filePath);
        }
      }
    }
  }

  return missingFiles;
}

// =============================================================================
// Helper Functions
// =============================================================================

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
// ExportPanel Component
// =============================================================================

export function ExportPanel({ isOpen, onClose }: ExportPanelProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { project } = useEditorStore();
  const { sendMessage, sendExportProgress } = useVSCodeMessaging();

  // Export state ref
  const exportRef = useRef<{ isActive: boolean }>({ isActive: false });

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

  const FORMAT_OPTIONS: Array<{ label: string; value: ExportFormat }> = [
    { label: 'MP4 (H.264)', value: 'mp4' },
    { label: 'WebM (VP9)', value: 'webm' },
    { label: 'GIF', value: 'gif' },
  ];

  const [format, setFormat] = useState<ExportFormat>('mp4');
  const [resolution, setResolution] = useState(RESOLUTIONS[2]); // Default 1080p
  const [quality, setQuality] = useState<'low' | 'medium' | 'high'>('medium');
  const [fps, setFps] = useState(project?.fps || 30);
  const [audioBitrate, setAudioBitrate] = useState(192000);
  const [isExporting, setIsExporting] = useState(false);

  // GIF-specific settings
  const [gifColors, setGifColors] = useState(256);
  const [gifDither, setGifDither] = useState(true);
  const [gifQuality, setGifQuality] = useState(80);

  // Progress state
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);

  // Global export status
  const [hasGlobalExport, setHasGlobalExport] = useState(false);

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  // Listen for export progress from Extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;

      switch (message.type) {
        case 'export:globalStatus':
          setHasGlobalExport(message.hasActiveExport);
          break;

        case 'export:progress':
          if (exportRef.current.isActive) {
            setExportProgress(message.progress);
            sendExportProgress({
              isExporting: true,
              percent: message.progress.percent,
              message: message.progress.message || getStageLabel(message.progress.stage),
              currentFrame: message.progress.currentFrame,
              totalFrames: message.progress.totalFrames,
              currentFps: message.progress.currentFps,
              estimatedTimeRemaining: message.progress.estimatedTimeRemaining,
            });
          }
          break;

        case 'export:completed':
          if (exportRef.current.isActive) {
            setIsExporting(false);
            setExportProgress(null);
            sendExportProgress({ isExporting: false, percent: 0, message: '' });
            exportRef.current.isActive = false;
            showToast(t('export.success.completed'), 'success');
          }
          break;

        case 'export:error':
          if (exportRef.current.isActive) {
            setIsExporting(false);
            setExportProgress(null);
            sendExportProgress({ isExporting: false, percent: 0, message: '' });
            exportRef.current.isActive = false;
            showToast(t('export.errors.exportFailed', { error: message.error || 'Unknown error' }), 'error', 5000);
          }
          break;

        case 'export:cancelled':
          if (exportRef.current.isActive) {
            setIsExporting(false);
            setExportProgress(null);
            sendExportProgress({ isExporting: false, percent: 0, message: '' });
            exportRef.current.isActive = false;
            showToast(t('export.cancelled'), 'info');
          }
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    sendMessage({ type: 'export:queryGlobalStatus' });

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [sendMessage, sendExportProgress, showToast, t]);

  // Sync FPS from project
  useEffect(() => {
    if (project?.fps) {
      setFps(project.fps);
    }
  }, [project?.fps]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

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

      vscodePostMessage({
        type: 'selectExportPath',
        filename,
        format: ext,
      });

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

    // Step 1: Select export path
    const exportPath = await selectExportPath();
    if (!exportPath) {
      return;
    }

    // Step 2: Validate media files
    const missingFiles = await validateProjectMediaFiles(project);
    if (missingFiles.length > 0) {
      const fileList = missingFiles.map(f => `• ${f}`).join('\n');
      showToast(
        `导出失败：以下媒体文件不存在或无法访问：\n${fileList}\n\n请检查文件路径或重新导入媒体。`,
        'error',
        10000
      );
      return;
    }

    // Step 3: Start export via Extension (neko-engine)
    setIsExporting(true);
    setExportProgress({
      stage: 'initializing',
      percent: 0,
      message: '准备导出...',
      currentFrame: 0,
      totalFrames: 0,
      elapsedTime: 0,
      estimatedTimeRemaining: 0,
      currentFps: 0,
    });
    exportRef.current.isActive = true;

    // Send export request to Extension
    const exportConfig = {
      outputPath: exportPath,
      format,
      width: resolution.width,
      height: resolution.height,
      fps,
      quality,
      audioBitrate,
      ...(format === 'gif' && {
        gifColors,
        gifDither,
        gifQuality,
      }),
    };

    vscodePostMessage({
      type: 'export:start',
      project,
      config: exportConfig,
    });
  }, [project, format, resolution, quality, fps, audioBitrate, gifColors, gifDither, gifQuality, t, showToast, selectExportPath]);

  const handleCancel = useCallback(() => {
    vscodePostMessage({ type: 'export:cancel' });
    setIsExporting(false);
    setExportProgress(null);
    sendExportProgress({ isExporting: false, percent: 0, message: '' });
    exportRef.current.isActive = false;
  }, [sendExportProgress]);

  const handleBackgroundExport = useCallback(() => {
    showToast('导出将在后台继续，请查看状态栏进度', 'info');
    onClose();
  }, [onClose, showToast]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!isOpen) return null;

  // Exporting: show progress UI
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
              <div
                className="w-8 h-8 border-[3px] border-t-transparent rounded-full animate-spin"
                style={{ borderColor: 'var(--vscode-progressBar-background)', borderTopColor: 'transparent' }}
              />
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
            </div>

            {/* Stats Row */}
            <div
              className="flex items-center justify-between px-3 py-2 rounded-md text-xs"
              style={{ backgroundColor: 'var(--vscode-editor-inactiveSelectionBackground)' }}
            >
              <div className="flex items-center gap-4">
                {exportProgress && exportProgress.currentFps > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-semibold" style={{ color: 'var(--vscode-charts-yellow)' }}>
                      {exportProgress.currentFps.toFixed(1)}
                    </span>
                    <span style={{ color: 'var(--vscode-foreground)', opacity: 0.7 }}>fps</span>
                  </div>
                )}
                {exportProgress && exportProgress.elapsedTime > 0 && (
                  <span style={{ color: 'var(--vscode-foreground)' }}>
                    {formatElapsedTime(exportProgress.elapsedTime)}
                  </span>
                )}
              </div>
              {exportProgress && exportProgress.estimatedTimeRemaining > 0 && (
                <span className="font-semibold" style={{ color: 'var(--vscode-charts-green)' }}>
                  {formatTimeRemaining(exportProgress.estimatedTimeRemaining)}
                </span>
              )}
            </div>

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

  // Config panel
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
            disabled={hasGlobalExport}
            className="px-4 py-2 bg-vscode-button-background hover:bg-vscode-button-hoverBackground disabled:bg-vscode-button-secondaryBackground disabled:cursor-not-allowed disabled:opacity-50 rounded text-vscode-button-foreground transition-colors"
          >
            {hasGlobalExport ? '导出中...' : '导出'}
          </button>
        </div>
      </div>
    </div>
  );
}
