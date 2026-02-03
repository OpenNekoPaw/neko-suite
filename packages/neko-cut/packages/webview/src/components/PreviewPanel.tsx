/**
 * PreviewPanel - H.264 流预览面板
 * H.264 Stream Preview Panel
 *
 * 使用 neko-engine 的 H.264 流进行预览渲染
 * Uses neko-engine H.264 stream for preview rendering
 *
 * 架构：
 * - Extension 通过 WebSocket 推送 H.264 流
 * - Webview 使用 WebCodecs 解码并渲染到 Canvas
 */

import { useRef, useEffect, useCallback, useState, memo } from 'react';
import { useEditorStore } from '../stores/editor-store';
import { useTranslation } from '../i18n/I18nContext';
import { usePreviewAudio } from '../hooks/usePreviewAudio';
import { useMediaInfoCache } from '../hooks/useMediaInfoCache';
import { PreviewOverlay } from './PreviewOverlay';
import { PREVIEW_QUALITY } from '../constants';
import { postMessage } from '../utils/vscodeApi';
import { H264StreamClient } from '../services/H264StreamClient';
import type { ProjectData, MediaElement } from '@neko/shared';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * 获取指定时间点的活跃视频元素
 */
function getActiveVideoElements(project: ProjectData, time: number): MediaElement[] {
  const videos: MediaElement[] = [];
  for (const track of project.tracks) {
    for (const element of track.elements) {
      if (element.type !== 'media') continue;
      const mediaElement = element as MediaElement;
      if (mediaElement.mediaType === 'image') continue;
      if (element.hidden) continue;
      const elementEnd = element.startTime + element.duration;
      if (time >= element.startTime && time < elementEnd) {
        videos.push(mediaElement);
      }
    }
  }
  return videos;
}

// =============================================================================
// PreviewPanel Component
// =============================================================================

export interface PreviewPanelProps {
  onCaptureScreenshot?: () => Promise<void>;
  isCapturingScreenshot?: boolean;
}

export interface PreviewPanelRef {
  captureScreenshot: () => Promise<void>;
}

export const PreviewPanel = memo(function PreviewPanel({
  onCaptureScreenshot,
  isCapturingScreenshot: _isCapturingScreenshot,
}: PreviewPanelProps = {}) {
  const { t } = useTranslation();
  const { project, currentTime, isPlaying, previewQuality, previewVolume, previewMuted } = useEditorStore();
  const showFpsCounter = useEditorStore((state) => state.showFpsCounter);
  const currentFps = useEditorStore((state) => state.currentFps);
  const performanceStats = useEditorStore((state) => state.performanceStats);
  const setCurrentFps = useEditorStore((state) => state.setCurrentFps);
  const setPerformanceStats = useEditorStore((state) => state.setPerformanceStats);
  const setFrameServerPortInStore = useEditorStore((state) => state.setFrameServerPort);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaInfoRef = useRef({ bitrate: '', codec: '', resolution: '' });

  // H.264 stream client
  const h264ClientRef = useRef<H264StreamClient | null>(null);
  const [frameServerPort, setFrameServerPort] = useState<number | null>(null);

  // State
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // Audio playback hook - disabled as audio is handled by Extension (Rust/WGPU)
  usePreviewAudio(project, currentTime, isPlaying, previewVolume, previewMuted, {
    enabled: false,
  });

  // Media info cache
  const mediaInfo = useMediaInfoCache();
  mediaInfoRef.current = mediaInfo;

  // Current time ref for closures
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  // ==========================================================================
  // Frame Server Port Configuration
  // ==========================================================================

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'frameServer:config' && typeof message.port === 'number') {
        console.log(`[PreviewPanel] Received frame server config, port: ${message.port}`);
        setFrameServerPort(message.port);
        setFrameServerPortInStore(message.port);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [setFrameServerPortInStore]);

  // ==========================================================================
  // H.264 Stream Client Setup
  // ==========================================================================

  useEffect(() => {
    if (!frameServerPort || !project || !canvasRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setInitError('Failed to get canvas context');
      return;
    }

    // Create H.264 stream client
    const client = new H264StreamClient({
      websocketUrl: `ws://127.0.0.1:${frameServerPort}/ws/h264`,
      width: project.resolution.width,
      height: project.resolution.height,
      onFrame: (frame: VideoFrame) => {
        // Draw frame to canvas
        ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
        frame.close();
      },
      onConnectionChange: (connected: boolean) => {
        console.log(`[PreviewPanel] H.264 stream ${connected ? 'connected' : 'disconnected'}`);
        setIsInitialized(connected);
      },
      onError: (error: Error) => {
        console.error('[PreviewPanel] H.264 stream error:', error);
        setInitError(error.message);
      },
      preferHardware: true,
    });

    h264ClientRef.current = client;
    client.connect();

    return () => {
      client.disconnect();
      h264ClientRef.current = null;
    };
  }, [frameServerPort, project?.resolution.width, project?.resolution.height]);

  // ==========================================================================
  // Playback Control
  // ==========================================================================

  useEffect(() => {
    if (!isInitialized || !project || !isPlaying) {
      // Stop H264 push when paused
      postMessage({
        type: 'media:frameServer:projectPlayback:stop',
      });
      return;
    }

    const currentPlayheadTime = currentTimeRef.current;
    const activeVideos = getActiveVideoElements(project, currentPlayheadTime);

    if (activeVideos.length === 0) {
      return;
    }

    // Start H264 push for playback
    console.log('[PreviewPanel] Starting H264 push for playback');
    postMessage({
      type: 'media:frameServer:projectPlayback:start',
      payload: {
        projectData: project,
        startTime: currentPlayheadTime,
        speed: 1.0,
      },
    });

    return () => {
      postMessage({
        type: 'media:frameServer:projectPlayback:stop',
      });
    };
  }, [isInitialized, project, isPlaying]);

  // ==========================================================================
  // Scrubbing (Seek when paused)
  // ==========================================================================

  const lastRenderedTimeRef = useRef<number>(-1);

  useEffect(() => {
    if (!isInitialized || !project || isPlaying) return;

    const TIME_TOLERANCE = 0.001;
    if (Math.abs(currentTime - lastRenderedTimeRef.current) < TIME_TOLERANCE) return;

    // Send seek message for H264 frame (scrubbing)
    postMessage({
      type: 'media:frameServer:projectPlayback:seek',
      payload: {
        projectData: project,
        seekTime: currentTime,
      },
    });

    lastRenderedTimeRef.current = currentTime;
  }, [currentTime, isPlaying, isInitialized, project]);

  // ==========================================================================
  // Canvas Resize
  // ==========================================================================

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current || !project) return;

    const container = containerRef.current;
    const canvas = canvasRef.current;

    const handleResize = () => {
      const containerRect = container.getBoundingClientRect();
      const { width: projectWidth, height: projectHeight } = project.resolution;
      const aspectRatio = projectWidth / projectHeight;

      const availableWidth = containerRect.width - 32;
      const availableHeight = containerRect.height - 32;

      let displayWidth: number;
      let displayHeight: number;

      if (availableWidth / availableHeight > aspectRatio) {
        displayHeight = availableHeight;
        displayWidth = displayHeight * aspectRatio;
      } else {
        displayWidth = availableWidth;
        displayHeight = displayWidth / aspectRatio;
      }

      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(container);
    handleResize();

    return () => observer.disconnect();
  }, [project?.resolution]);

  // Set canvas internal resolution
  useEffect(() => {
    if (!canvasRef.current || !project) return;

    const canvas = canvasRef.current;
    const scale = PREVIEW_QUALITY[previewQuality];
    const scaledWidth = Math.round(project.resolution.width * scale);
    const scaledHeight = Math.round(project.resolution.height * scale);

    if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;
    }
  }, [project?.resolution, previewQuality]);

  // ==========================================================================
  // Screenshot Capture
  // ==========================================================================

  const captureScreenshot = useCallback(async () => {
    if (!isInitialized || !project || !canvasRef.current) {
      console.error('[PreviewPanel] Cannot capture: not initialized or no project');
      return;
    }

    try {
      const canvas = canvasRef.current;

      // Request full quality frame from Extension
      postMessage({
        type: 'media:frameServer:projectPlayback:seek',
        payload: {
          projectData: project,
          seekTime: currentTime,
        },
      });

      // Wait a bit for frame to render
      await new Promise(resolve => setTimeout(resolve, 100));

      // Export to blob
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/png', 0.95);
      });

      if (!blob) {
        throw new Error('Failed to export frame to blob');
      }

      const timestamp = Math.floor(currentTime * 1000);
      const filename = `screenshot_${timestamp}ms.png`;
      const arrayBuffer = await blob.arrayBuffer();

      postMessage({
        type: 'saveBlob',
        data: arrayBuffer,
        filename,
        mimeType: 'image/png',
      });

      console.log('[PreviewPanel] Screenshot sent to extension');
    } catch (error) {
      console.error('[PreviewPanel] Screenshot capture failed:', error);
      throw error;
    }
  }, [isInitialized, project, currentTime]);

  // Expose captureScreenshot via callback
  useEffect(() => {
    if (onCaptureScreenshot) {
      (window as unknown as { __previewPanelCaptureScreenshot: typeof captureScreenshot }).__previewPanelCaptureScreenshot = captureScreenshot;
    }
  }, [onCaptureScreenshot, captureScreenshot]);

  // ==========================================================================
  // Performance Stats
  // ==========================================================================

  useEffect(() => {
    if (!isPlaying || !h264ClientRef.current) {
      return;
    }

    const fetchStats = () => {
      const client = h264ClientRef.current;
      if (!client) return;

      const stats = client.getStats();
      setCurrentFps(stats.framesDecoded > 0 ? project?.fps || 30 : 0);
      setPerformanceStats({
        currentTime: currentTimeRef.current,
        frameIndex: Math.floor(currentTimeRef.current * (project?.fps || 30)),
        targetFps: project?.fps || 30,
        resolution: `${project?.resolution.width}x${project?.resolution.height}`,
        bitrate: mediaInfoRef.current.bitrate,
        mode: 'compatible',
        decodeTime: stats.avgDecodeTimeMs,
        renderTime: 0,
        compositeTime: stats.avgLatencyMs,
        memoryUsedMB: 0,
        memoryTotalMB: 0,
        cpuLoad: 0,
        gpuBackend: stats.hardwareAcceleration ? 'HW' : 'SW',
        gpuLoad: 0,
        cachedFrames: 0,
        cacheHitRate: 0,
        droppedFrames: stats.framesDropped,
        renderErrors: 0,
      });
    };

    const intervalId = setInterval(fetchStats, 1000);
    return () => clearInterval(intervalId);
  }, [isPlaying, project, setCurrentFps, setPerformanceStats]);

  // ==========================================================================
  // Render
  // ==========================================================================

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full bg-black">
        <span className="text-vscode-description">{t('preview.noProjectLoaded')}</span>
      </div>
    );
  }

  if (initError) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-black gap-4">
        <div className="text-vscode-error flex items-center gap-2">
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span>{initError}</span>
        </div>
        <span className="text-vscode-description text-sm">{t('preview.gpuRequired')}</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col h-full bg-vscode-bg">
      <div className="flex-1 flex items-center justify-center p-4 relative">
        <div className="relative">
          <canvas
            ref={canvasRef}
            className="border border-vscode-panel-border shadow-lg bg-black"
            style={{ display: isInitialized ? 'block' : 'none' }}
          />

          {/* FPS Counter */}
          {isInitialized && showFpsCounter && (
            <div
              className="absolute top-2 right-2 px-2 py-1.5 rounded text-xs font-mono opacity-80 hover:opacity-100 transition-opacity"
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.8)' }}
              title="Performance Stats"
            >
              <div className="flex flex-col gap-1">
                <div className="text-[10px] leading-tight text-center text-gray-400 border-b border-gray-600 pb-1">
                  <span>{performanceStats.currentTime.toFixed(2)}s</span>
                  <span className="mx-1">|</span>
                  <span>F{performanceStats.frameIndex}</span>
                  <span className="mx-1">|</span>
                  <span>{performanceStats.targetFps}fps</span>
                </div>

                <div className="text-[10px] leading-tight space-y-0.5">
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Resolution</span>
                    <span className="text-gray-300">{performanceStats.resolution}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Mode</span>
                    <span style={{ color: '#49a' }}>H.264 Stream</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Decoder</span>
                    <span className="text-cyan-400">{performanceStats.gpuBackend}</span>
                  </div>
                </div>

                <div className="border-t border-gray-600 my-0.5" />

                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-400">FPS</span>
                  <span style={{
                    color: currentFps >= (project?.fps || 30) * 0.9 ? '#4a9' : currentFps >= (project?.fps || 30) * 0.5 ? '#fa0' : '#f44',
                    fontWeight: 'bold',
                  }}>
                    {currentFps.toFixed(1)}
                  </span>
                </div>

                <div className="text-[10px] leading-tight space-y-0.5">
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Decode</span>
                    <span className="text-gray-300">{performanceStats.decodeTime.toFixed(1)}ms</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Latency</span>
                    <span className="text-gray-300">{performanceStats.compositeTime.toFixed(1)}ms</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Dropped</span>
                    <span style={{ color: performanceStats.droppedFrames === 0 ? '#4a9' : '#f44' }}>
                      {performanceStats.droppedFrames}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Preview Overlay */}
          {isInitialized && (
            <PreviewOverlay
              canvasRef={canvasRef}
              enabled={!isPlaying}
            />
          )}

          {/* Loading overlay */}
          {!isInitialized && (
            <div
              className="flex items-center justify-center bg-black border border-vscode-panel-border"
              style={{
                width: project.resolution.width,
                height: project.resolution.height,
                maxWidth: '100%',
                maxHeight: '100%',
              }}
            >
              <div className="flex flex-col items-center gap-2 text-vscode-description">
                <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-xs">{t('preview.initializingGpu')}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
