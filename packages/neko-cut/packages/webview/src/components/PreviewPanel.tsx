/**
 * PreviewPanel - GPU 加速预览面板
 * GPU-Accelerated Preview Panel
 *
 * 使用 GPURenderEngine (WebGPU/WebGL) 进行渲染，自动回退到 Canvas 2D
 * Uses GPURenderEngine (WebGPU/WebGL) for rendering, with Canvas 2D fallback
 *
 * 质量切换策略 (DaVinci Resolve style):
 * - 播放时使用选择的质量档位 (1, 0.75, 0.5, 0.25)
 * - 暂停时自动使用最高质量 (1)
 *
 * Compatible Mode:
 * - Extension decodes frames via FFmpeg and sends via postMessage
 * - Webview composites frames via WebGPU using CompatibleMediaFrameProvider
 */

import { useRef, useEffect, useCallback, useState, memo } from 'react';
import { useEditorStore } from '../stores/editor-store';
import { useTranslation } from '../i18n/I18nContext';
import { useRenderEngine } from '../hooks/useRenderEngine';
import { usePreviewAudio } from '../hooks/usePreviewAudio';
import { useKeyframeCacheManager } from '../hooks/useKeyframeCacheManager';
import { useMediaInfoCache } from '../hooks/useMediaInfoCache';
import { getFileUri } from '../hooks/useVSCodeMessaging';
import { getRemoteMediaProxy } from '../services/mediaProxyFactory';
import { PreviewOverlay } from './PreviewOverlay';
import { PREVIEW_QUALITY } from '../constants';
import { postMessage } from '../utils/vscodeApi';
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
      // 检查是否是视频类型
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

// Export renderer access for screenshot functionality
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
  const currentMode = useEditorStore((state) => state.currentMode);
  const setCurrentFps = useEditorStore((state) => state.setCurrentFps);
  const setPerformanceStats = useEditorStore((state) => state.setPerformanceStats);
  const setFrameServerPortInStore = useEditorStore((state) => state.setFrameServerPort);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaInfoRef = useRef({ bitrate: '', codec: '', resolution: '' });

  // Get media proxy for compatible mode
  const mediaProxy = getRemoteMediaProxy();

  // Mode getter for ModeAwareMediaFrameProvider
  // Use a stable callback that always reads from store (not captured value)
  const getMediaEngineMode = useCallback(() => useEditorStore.getState().currentMode, []);

  // Universal render engine hook (GPU/Canvas2D auto-switching)
  // Uses mode-aware frame provider to support both basic and compatible modes
  const renderer = useRenderEngine({
    preferredBackend: 'auto', // Auto-detect: WebGPU → WebGL → Canvas2D
    autoResize: false, // We'll handle resize manually for precise control
    frameProviderMode: 'mode-aware', // Route based on currentMode
    getMediaEngineMode,
    mediaProxy,
  });

  // Audio playback hook - used for side effect (audio sync during playback)
  // Disabled in compatible mode as audio is handled by Extension (Rust/WGPU)
  usePreviewAudio(project, currentTime, isPlaying, previewVolume, previewMuted, {
    enabled: currentMode !== 'compatible',
  });

  // Keyframe cache manager - handles preloading based on playhead and mode switch
  useKeyframeCacheManager();

  // Media info cache - provides bitrate, codec info for current playing media
  const mediaInfo = useMediaInfoCache();
  mediaInfoRef.current = mediaInfo;

  // ==========================================================================
  // Compatible Mode: Frame Server Port for CompatibleMediaFrameProvider
  // ==========================================================================

  // Listen for frame server configuration from Extension
  // This enables high-performance frame delivery for compatible mode
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'frameServer:config' && typeof message.port === 'number') {
        console.log(`[PreviewPanel] Received frame server config, port: ${message.port}`);
        setFrameServerPortInStore(message.port);  // Sync to store for cache warmup
        renderer.setFrameServerPort(message.port);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [renderer, setFrameServerPortInStore]);

  // Periodically fetch Extension performance stats for compatible mode
  useEffect(() => {
    if (currentMode !== 'compatible' || !isPlaying) {
      return;
    }

    const fetchStats = async () => {
      try {
        const stats = await mediaProxy.getPerformanceStats();
        setPerformanceStats({
          cpuLoad: stats.cpuUsage,
          memoryUsedMB: stats.memoryUsedMB,
          memoryTotalMB: stats.memoryTotalMB,
          cachedFrames: stats.cachedFrames,
          cacheHitRate: stats.cacheHitRate,
          droppedFrames: stats.droppedFrames,
          renderErrors: stats.decodeErrors,
        });
      } catch (error) {
        // Silently ignore errors - stats are optional
      }
    };

    // Fetch immediately and then every 1 second
    fetchStats();
    const intervalId = setInterval(fetchStats, 1000);

    return () => clearInterval(intervalId);
  }, [currentMode, isPlaying, mediaProxy, setPerformanceStats]);

  // Error state
  const [initError, setInitError] = useState<string | null>(null);

  // Preload ready state - tracks if buffer has enough frames to start playback
  const [preloadReady, setPreloadReady] = useState(false);
  const preloadReadyRef = useRef(false);

  // Create URL resolver for VSCode webview
  const urlResolver = useCallback(async (path: string): Promise<string> => {
    return getFileUri(path);
  }, []);

  /**
   * Capture current frame as screenshot using the render engine
   */
  const captureScreenshot = useCallback(async () => {
    if (!renderer.state.isInitialized || !project) {
      console.error('[PreviewPanel] Cannot capture: renderer not initialized or no project');
      return;
    }

    try {
      const canvas = canvasRef.current;
      if (!canvas) {
        throw new Error('Canvas not available');
      }

      console.log('[PreviewPanel] Capturing screenshot at time:', currentTime);
      console.log('[PreviewPanel] Canvas size:', canvas.width, 'x', canvas.height);
      console.log('[PreviewPanel] Project resolution:', project.resolution.width, 'x', project.resolution.height);

      // Ensure we render at full quality
      const { width, height } = project.resolution;
      if (canvas.width !== width || canvas.height !== height) {
        console.log('[PreviewPanel] Resizing canvas to full resolution');
        canvas.width = width;
        canvas.height = height;
        renderer.resize(width, height);
      }

      // Re-render current frame at full quality
      console.log('[PreviewPanel] Rendering frame at full quality');
      await renderer.renderProjectFrame(project, currentTime, 'preview', 'final');

      // Export to blob using renderer
      console.log('[PreviewPanel] Exporting to blob');
      const blob = await renderer.toBlob('image/png', 0.95);
      if (!blob) {
        throw new Error('Failed to export frame to blob');
      }

      console.log('[PreviewPanel] Blob created, size:', blob.size, 'bytes');

      // Generate filename with timestamp
      const timestamp = Math.floor(currentTime * 1000);
      const filename = `screenshot_${timestamp}ms.png`;

      // Convert blob to ArrayBuffer
      const arrayBuffer = await blob.arrayBuffer();

      // Send to extension for saving
      const { postMessage } = await import('../utils/vscodeApi');
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
  }, [renderer, project, currentTime]);

  // Expose captureScreenshot via callback
  useEffect(() => {
    if (onCaptureScreenshot) {
      // Replace the callback with our internal implementation
      (window as any).__previewPanelCaptureScreenshot = captureScreenshot;
    }
  }, [onCaptureScreenshot, captureScreenshot]);

  // Track initialization state to prevent race conditions
  const initializingRef = useRef(false);

  // Initialize renderer with race condition protection
  useEffect(() => {
    if (!canvasRef.current || !project) {
      return;
    }

    // Prevent multiple concurrent initializations
    if (initializingRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const { width, height } = project.resolution;

    // Set canvas dimensions
    canvas.width = width;
    canvas.height = height;

    // Track cancellation for async operations
    let cancelled = false;
    initializingRef.current = true;

    // Initialize renderer with cancellation check
    renderer.initialize(canvas).then((success: boolean) => {
      // Check if effect was cleaned up before Promise resolved
      if (cancelled) {
        console.log('[PreviewPanel] Init completed but effect was cleaned up');
        return;
      }

      if (success) {
        setInitError(null);
        // Set URL resolver for MediaFrameProvider
        renderer.setUrlResolver(urlResolver);
      } else {
        setInitError(t('preview.gpuInitFailed'));
      }
    }).catch((err: Error) => {
      // Check if effect was cleaned up before error
      if (cancelled) {
        console.log('[PreviewPanel] Init failed but effect was cleaned up');
        return;
      }
      console.error('[PreviewPanel] Init error:', err);
      setInitError(err instanceof Error ? err.message : t('preview.gpuInitFailed'));
    }).finally(() => {
      if (!cancelled) {
        initializingRef.current = false;
      }
    });

    return () => {
      cancelled = true;
      initializingRef.current = false;
      renderer.dispose();
    };
  }, [project?.resolution.width, project?.resolution.height]);

  // Render loop - only for playback
  // Use ref to track latest currentTime to avoid stale closure
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  // 渲染同步锁 - 防止并发渲染导致闪烁
  const isRenderingRef = useRef(false);

  // 上次渲染的帧索引 - 避免重复渲染同一帧
  const lastRenderedFrameRef = useRef<number>(-1);

  // 质量缩放因子 ref，用于避免闭包问题
  const qualityScaleRef = useRef(PREVIEW_QUALITY[previewQuality]);
  qualityScaleRef.current = PREVIEW_QUALITY[previewQuality];

  // 播放时的渲染循环 - 使用选择的质量档位
  // 只有当 preloadReady 为 true 时才开始渲染
  // Works for both basic and compatible modes (CompatibleMediaFrameProvider handles frame fetching)
  useEffect(() => {
    if (!renderer.state.isInitialized || !project || !isPlaying || !preloadReady) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // 播放时应用质量缩放
    const scale = qualityScaleRef.current;
    const scaledWidth = Math.round(project.resolution.width * scale);
    const scaledHeight = Math.round(project.resolution.height * scale);

    console.log(`[PreviewPanel] 🎬 Playback started, quality: ${previewQuality} (scale: ${scale}), resolution: ${scaledWidth}x${scaledHeight}`);

    // 只在分辨率变化时更新 Canvas
    if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;
      renderer.resize(scaledWidth, scaledHeight);
    }

    // 重置帧索引
    lastRenderedFrameRef.current = -1;

    let animationId: number | null = null;
    let cancelled = false;
    const fps = project.fps;
    const frameInterval = 1000 / fps; // Target frame interval in ms
    let lastFrameTime = performance.now();
    let frameCount = 0;
    let totalRenderTime = 0;
    let fpsStartTime = performance.now();
    let idleTime = 0; // Track idle time for CPU load estimation
    let lastIdleCheck = performance.now();

    // Helper to get memory info (Chrome/VSCode Webview only)
    const getMemoryInfo = () => {
      const perf = performance as Performance & {
        memory?: {
          usedJSHeapSize: number;
          totalJSHeapSize: number;
          jsHeapSizeLimit: number;
        };
      };
      if (perf.memory) {
        return {
          usedMB: Math.round(perf.memory.usedJSHeapSize / 1024 / 1024 * 10) / 10,
          totalMB: Math.round(perf.memory.totalJSHeapSize / 1024 / 1024 * 10) / 10,
        };
      }
      return { usedMB: 0, totalMB: 0 };
    };

    const render = () => {
      if (cancelled) return;

      const now = performance.now();
      const elapsed = now - lastFrameTime;

      // Frame rate limiting: only render if enough time has passed
      if (elapsed < frameInterval * 0.8) {
        // Not time for next frame yet, schedule and return
        if (!cancelled) {
          animationId = requestAnimationFrame(render);
        }
        return;
      }

      lastFrameTime = now;

      // 计算当前帧索引
      const currentTime = currentTimeRef.current;
      const currentFrame = Math.floor(currentTime * fps);

      // 如果是同一帧，跳过渲染（减少不必要的解码）
      if (currentFrame === lastRenderedFrameRef.current) {
        if (!cancelled) {
          animationId = requestAnimationFrame(render);
        }
        return;
      }

      // 如果有渲染正在进行，不等待，直接调度下一帧
      if (isRenderingRef.current) {
        if (!cancelled) {
          animationId = requestAnimationFrame(render);
        }
        return;
      }

      // 标记正在渲染并更新帧索引
      isRenderingRef.current = true;
      lastRenderedFrameRef.current = currentFrame;

      // 异步渲染，不阻塞主循环
      (async () => {
        const renderStart = performance.now();
        try {
          if (!cancelled) {
            await renderer.renderProjectFrame(project, currentTime, 'preview', 'preview');
          }
        } catch (err) {
          console.error('[PreviewPanel] Render error:', err);
        } finally {
          isRenderingRef.current = false;
          const renderTime = performance.now() - renderStart;
          totalRenderTime += renderTime;
          frameCount++;

          // Track idle time for CPU load estimation
          const nowTime = performance.now();
          const timeSinceLastCheck = nowTime - lastIdleCheck;
          idleTime += Math.max(0, timeSinceLastCheck - renderTime);
          lastIdleCheck = nowTime;

          // Update performance stats every 10 frames for smoother display
          if (frameCount % 10 === 0) {
            const elapsedSinceStart = performance.now() - fpsStartTime;
            const actualFps = (frameCount / elapsedSinceStart) * 1000;

            // Get detailed stats from render engine
            const frameStats = renderer.getLastFrameStats();
            const gpuStats = renderer.getGPUStats();

            // Get memory info
            const memInfo = getMemoryInfo();

            // Estimate CPU load (busy time / total time)
            const totalTime = elapsedSinceStart;
            const busyTime = totalTime - idleTime;
            const cpuLoad = Math.min(100, Math.max(0, Math.round((busyTime / totalTime) * 100)));

            // Estimate GPU load based on composite time vs frame budget
            const frameBudget = 1000 / fps; // ms per frame
            const gpuLoad = frameStats
              ? Math.min(100, Math.max(0, Math.round((frameStats.compositeTime / frameBudget) * 100)))
              : 0;

            // Update store with performance stats
            setCurrentFps(Math.round(actualFps * 10) / 10);
            const currentPlayTime = currentTimeRef.current;
            const currentFrameIdx = Math.floor(currentPlayTime * fps);
            if (frameStats) {
              setPerformanceStats({
                currentTime: Math.round(currentPlayTime * 100) / 100,
                frameIndex: currentFrameIdx,
                targetFps: fps,
                resolution: `${project.resolution.width}x${project.resolution.height}`,
                bitrate: mediaInfoRef.current.bitrate,
                mode: currentMode || 'basic',
                decodeTime: Math.round(frameStats.decodeTime * 10) / 10,
                renderTime: Math.round(frameStats.compositeTime * 10) / 10,
                compositeTime: Math.round(frameStats.totalTime * 10) / 10,
                memoryUsedMB: memInfo.usedMB,
                memoryTotalMB: memInfo.totalMB,
                cpuLoad,
                gpuBackend: renderer.state.backend?.toUpperCase() || 'N/A',
                gpuRenderer: gpuStats?.renderer || 'N/A',
                gpuLoad,
                vramUsedMB: gpuStats?.vramUsedMB || 0,
                cachedFrames: frameStats.cachedFrames || 0,
                cacheHitRate: frameStats.cacheHitRate,
                droppedFrames: frameStats.droppedFrames,
                renderErrors: frameStats.renderErrors,
              });
            } else {
              setPerformanceStats({
                currentTime: Math.round(currentPlayTime * 100) / 100,
                frameIndex: currentFrameIdx,
                targetFps: fps,
                resolution: `${project.resolution.width}x${project.resolution.height}`,
                bitrate: mediaInfoRef.current.bitrate,
                mode: currentMode || 'basic',
                decodeTime: 0,
                renderTime: Math.round((totalRenderTime / 10) * 10) / 10,
                compositeTime: 0,
                memoryUsedMB: memInfo.usedMB,
                memoryTotalMB: memInfo.totalMB,
                cpuLoad,
                gpuBackend: renderer.state.backend?.toUpperCase() || 'N/A',
                gpuLoad: 0,
              });
            }

            totalRenderTime = 0;
          }
        }
      })();

      // 立即调度下一帧，不等待渲染完成
      if (!cancelled) {
        animationId = requestAnimationFrame(render);
      }
    };

    // Start render loop
    animationId = requestAnimationFrame(render);

    return () => {
      cancelled = true;
      if (animationId !== null) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [renderer.state.isInitialized, project, isPlaying, previewQuality, preloadReady]);

  // ==========================================================================
  // 播放就绪状态管理（禁用 preload，依赖解码锁保证正确性）
  // ==========================================================================
  const lastPreloadTimeRef = useRef<number>(-1);

  useEffect(() => {
    if (!renderer.state.isInitialized || !project || !isPlaying) {
      // 暂停时重置就绪状态
      lastPreloadTimeRef.current = -1;
      setPreloadReady(false);
      preloadReadyRef.current = false;

      // Stop H264 push when paused (compatible mode)
      if (currentMode === 'compatible') {
        postMessage({
          type: 'media:frameServer:projectPlayback:stop',
        });
      }
      return;
    }

    // 获取当前时间点的活跃视频
    const currentPlayheadTime = currentTimeRef.current;
    const activeVideos = getActiveVideoElements(project, currentPlayheadTime);

    if (activeVideos.length === 0) {
      // 没有视频元素，直接标记为就绪
      setPreloadReady(true);
      preloadReadyRef.current = true;
      return;
    }

    // 直接标记为就绪，依赖解码锁保证帧获取的正确性
    // 不再进行 preload，避免与播放请求的并发冲突
    const scale = PREVIEW_QUALITY[previewQuality];
    console.log(`[PreviewPanel] 🎬 Playback started, quality: ${previewQuality} (scale: ${scale}), resolution: ${Math.round(project.resolution.width * scale)}x${Math.round(project.resolution.height * scale)}`);

    // Start H264 push for compatible mode
    if (currentMode === 'compatible') {
      console.log('[PreviewPanel] Starting H264 push for compatible mode');
      postMessage({
        type: 'media:frameServer:projectPlayback:start',
        payload: {
          projectData: project,
          startTime: currentPlayheadTime,
          speed: 1.0,
        },
      });
    }

    setPreloadReady(true);
    preloadReadyRef.current = true;
    lastPreloadTimeRef.current = currentPlayheadTime;

    return () => {
      lastPreloadTimeRef.current = -1;
      // Stop H264 push on cleanup
      if (currentMode === 'compatible') {
        postMessage({
          type: 'media:frameServer:projectPlayback:stop',
        });
      }
    };
  }, [renderer.state.isInitialized, project, isPlaying, previewQuality, currentMode]);

  // Handle container resize
  useEffect(() => {
    if (!containerRef.current || !canvasRef.current || !project) return;

    const container = containerRef.current;
    const canvas = canvasRef.current;

    const handleResize = () => {
      const containerRect = container.getBoundingClientRect();
      const { width: projectWidth, height: projectHeight } = project.resolution;
      const aspectRatio = projectWidth / projectHeight;

      // Available space (subtract padding: p-4 = 16px on each side = 32px total)
      const availableWidth = containerRect.width - 32;
      const availableHeight = containerRect.height - 32;

      // Calculate display size to fill available space while maintaining aspect ratio
      let displayWidth: number;
      let displayHeight: number;

      if (availableWidth / availableHeight > aspectRatio) {
        // Container is wider than video aspect ratio - fit by height
        displayHeight = availableHeight;
        displayWidth = displayHeight * aspectRatio;
      } else {
        // Container is taller than video aspect ratio - fit by width
        displayWidth = availableWidth;
        displayHeight = displayWidth / aspectRatio;
      }

      // Update canvas CSS size (display size)
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(container);
    handleResize(); // Initial call

    return () => observer.disconnect();
  }, [project?.resolution]);

  // Re-render when time changes (for scrubbing when paused)
  const lastRenderedTimeRef = useRef<number>(-1);
  const lastRenderedProjectHashRef = useRef<string>('');

  // 暂停时的渲染 - 使用最高质量 (full)
  useEffect(() => {
    if (!renderer.state.isInitialized || !project || isPlaying) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // 暂停时恢复到最高质量
    const { width, height } = project.resolution;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      renderer.resize(width, height);
    }

    // 生成 project 的哈希
    const projectHash = JSON.stringify({
      tracks: project.tracks.map(t => ({
        id: t.id,
        elements: t.elements.map(e => ({
          id: e.id,
          startTime: e.startTime,
          duration: e.duration,
          trimStart: e.trimStart,
          trimEnd: e.trimEnd,
          hidden: e.hidden,
        }))
      }))
    });
    const projectChanged = projectHash !== lastRenderedProjectHashRef.current;

    // 使用容差比较时间
    const TIME_TOLERANCE = 0.001;
    const timeUnchanged = Math.abs(currentTime - lastRenderedTimeRef.current) < TIME_TOLERANCE;

    if (timeUnchanged && !projectChanged) return;

    let cancelled = false;

    const doRender = async () => {
      if (isRenderingRef.current) {
        await new Promise<void>((resolve) => {
          const checkInterval = setInterval(() => {
            if (!isRenderingRef.current || cancelled) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 10);
          setTimeout(() => {
            clearInterval(checkInterval);
            resolve();
          }, 100);
        });
      }

      if (cancelled) return;

      // Send seek message for H264 frame in compatible mode (scrubbing)
      if (currentMode === 'compatible') {
        postMessage({
          type: 'media:frameServer:projectPlayback:seek',
          payload: {
            projectData: project,
            seekTime: currentTime,
          },
        });
      }

      try {
        await renderer.renderProjectFrame(project, currentTime, 'preview', 'final');
        if (!cancelled) {
          lastRenderedTimeRef.current = currentTime;
          lastRenderedProjectHashRef.current = projectHash;
        }
      } catch (err) {
        console.error('[PreviewPanel] Scrub render error:', err);
      }
    };

    doRender();

    return () => {
      cancelled = true;
    };
  }, [currentTime, isPlaying, renderer.state.isInitialized, project]);

  // No project loaded
  if (!project) {
    return (
      <div className="flex items-center justify-center h-full bg-black">
        <span className="text-vscode-description">{t('preview.noProjectLoaded')}</span>
      </div>
    );
  }

  // Initialization error - show error
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

  // Always render canvas, show loading overlay when not initialized
  return (
    <div ref={containerRef} className="flex flex-col h-full bg-vscode-bg">
      {/* Canvas Container */}
      <div className="flex-1 flex items-center justify-center p-4 relative">
        <div className="relative">
          {/* Canvas is always rendered so ref can be attached */}
          <canvas
            ref={canvasRef}
            className="border border-vscode-panel-border shadow-lg bg-black"
            style={{ display: renderer.state.isInitialized ? 'block' : 'none' }}
          />


          {/* FPS and Performance Stats indicator */}
          {renderer.state.isInitialized && showFpsCounter && (
            <div
              className="absolute top-2 right-2 px-2 py-1.5 rounded text-xs font-mono opacity-80 hover:opacity-100 transition-opacity"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
              }}
              title="Performance Stats"
            >
              <div className="flex flex-col gap-1">
                {/* Time Info */}
                <div className="text-[10px] leading-tight text-center text-gray-400 border-b border-gray-600 pb-1">
                  <span>{performanceStats.currentTime.toFixed(2)}s</span>
                  <span className="mx-1">|</span>
                  <span>F{performanceStats.frameIndex}</span>
                  <span className="mx-1">|</span>
                  <span>{performanceStats.targetFps}fps</span>
                </div>

                {/* Preview Info (docs/principle.md requirement) */}
                <div className="text-[10px] leading-tight space-y-0.5">
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Resolution</span>
                    <span className="text-gray-300">
                      {performanceStats.resolution || `${project.resolution.width}x${project.resolution.height}`}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Bitrate</span>
                    <span className="text-gray-300">
                      {performanceStats.bitrate || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Mode</span>
                    <span style={{ color: currentMode === 'basic' ? '#4a9' : '#49a' }}>
                      {currentMode || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Backend</span>
                    <span className="text-cyan-400">{performanceStats.gpuBackend || 'N/A'}</span>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-gray-600 my-0.5" />

                {/* FPS */}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-400">FPS</span>
                  <span style={{
                    color: currentFps >= project.fps * 0.9 ? '#4a9' : currentFps >= project.fps * 0.5 ? '#fa0' : '#f44',
                    fontWeight: 'bold',
                  }}>
                    {currentFps.toFixed(1)}
                  </span>
                </div>

                {/* Quality */}
                <div className="text-[10px] leading-tight space-y-0.5">
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Quality</span>
                    <span className="text-cyan-400">{previewQuality}</span>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-gray-600 my-0.5" />

                {/* Timing Stats */}
                <div className="text-[10px] leading-tight space-y-0.5">
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Decode</span>
                    <span className="text-gray-300">{performanceStats.decodeTime.toFixed(1)}ms</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Composite</span>
                    <span className="text-gray-300">{performanceStats.renderTime.toFixed(1)}ms</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Total</span>
                    <span className="text-gray-300">{performanceStats.compositeTime.toFixed(1)}ms</span>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-gray-600 my-0.5" />

                {/* System Stats */}
                <div className="text-[10px] leading-tight space-y-0.5">
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">CPU</span>
                    <span style={{
                      color: performanceStats.cpuLoad < 50 ? '#4a9' : performanceStats.cpuLoad < 80 ? '#fa0' : '#f44',
                    }}>
                      {performanceStats.cpuLoad}%
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">GPU</span>
                    <span style={{
                      color: performanceStats.gpuLoad < 50 ? '#4a9' : performanceStats.gpuLoad < 80 ? '#fa0' : '#f44',
                    }}>
                      {performanceStats.gpuLoad}%
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Memory</span>
                    <span className="text-gray-300">
                      {performanceStats.memoryUsedMB > 0
                        ? `${performanceStats.memoryUsedMB}MB`
                        : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">VRAM</span>
                    <span className="text-gray-300">
                      {performanceStats.vramUsedMB > 0
                        ? `${performanceStats.vramUsedMB}MB`
                        : 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-gray-600 my-0.5" />

                {/* GPU Renderer Info */}
                {performanceStats.gpuRenderer && performanceStats.gpuRenderer !== 'N/A' && performanceStats.gpuRenderer !== 'Unknown' && (
                  <div className="text-[10px] leading-tight">
                    <div className="text-gray-400 truncate max-w-[120px]" title={performanceStats.gpuRenderer}>
                      {performanceStats.gpuRenderer}
                    </div>
                  </div>
                )}

                {/* Divider */}
                <div className="border-t border-gray-600 my-0.5" />

                {/* Cache & Error Stats */}
                <div className="text-[10px] leading-tight space-y-0.5">
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Cached</span>
                    <span className="text-gray-300">
                      {performanceStats.cachedFrames} frames
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Cache Hit</span>
                    <span style={{
                      color: performanceStats.cacheHitRate >= 80 ? '#4a9' : performanceStats.cacheHitRate >= 50 ? '#fa0' : '#f44',
                    }}>
                      {performanceStats.cacheHitRate}%
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Dropped</span>
                    <span style={{
                      color: performanceStats.droppedFrames === 0 ? '#4a9' : '#f44',
                    }}>
                      {performanceStats.droppedFrames}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Errors</span>
                    <span style={{
                      color: performanceStats.renderErrors === 0 ? '#4a9' : '#f44',
                    }}>
                      {performanceStats.renderErrors}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Preview Overlay for interactive editing */}
          {renderer.state.isInitialized && (
            <PreviewOverlay
              canvasRef={canvasRef}
              enabled={!isPlaying}
            />
          )}

          {/* Loading overlay when not initialized */}
          {!renderer.state.isInitialized && (
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
