/**
 * PreviewPanel - H.264 流预览面板（音视频同步）
 *
 * 架构：
 * - Extension 通过 WebSocket 推送 H.264 视频流和 PCM 音频流
 * - Webview 使用 WebCodecs 解码视频，Web Audio API 播放音频
 * - FrameScheduler 基于音频主时钟进行帧调度（render/skip/wait）
 * - 无音频时降级到墙钟驱动
 */

import { useRef, useEffect, useCallback, useState, memo } from 'react';
import { useEditorStore } from '../stores/editor-store';
import { useTranslation } from '../i18n/I18nContext';
import { useMediaInfoCache } from '../hooks/useMediaInfoCache';
import { PREVIEW_QUALITY } from '../constants';
import { postMessage } from '../utils/vscodeApi';
import { getMediaProxy } from '../services/mediaProxyFactory';
import { H264StreamClient, AudioStreamClient, FrameScheduler, PlaybackPerformanceMonitor } from '@neko/neko-client';
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
  const { project, currentTime, isPlaying, previewQuality } = useEditorStore();
  const showFpsCounter = useEditorStore((state) => state.showFpsCounter);
  const currentFps = useEditorStore((state) => state.currentFps);
  const performanceStats = useEditorStore((state) => state.performanceStats);
  const setCurrentFps = useEditorStore((state) => state.setCurrentFps);
  const setPerformanceStats = useEditorStore((state) => state.setPerformanceStats);
  const setIsPiPActive = useEditorStore((state) => state.setIsPiPActive);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pipVideoRef = useRef<HTMLVideoElement>(null);
  const mediaInfoRef = useRef({ bitrate: '', codec: '', resolution: '' });

  // H.264 stream client
  const h264ClientRef = useRef<H264StreamClient | null>(null);
  // Audio stream client (master clock)
  const audioClientRef = useRef<AudioStreamClient | null>(null);
  // Frame scheduler (A/V sync)
  const schedulerRef = useRef<FrameScheduler | null>(null);
  // Shared AudioContext (created on user gesture)
  const audioCtxRef = useRef<AudioContext | null>(null);
  // rAF handle for playback loop
  const animFrameRef = useRef<number>(0);
  // Wall-clock fallback refs
  const playStartTimeRef = useRef<number>(0);
  const playWallTimeRef = useRef<number>(0);
  // Track clock source to detect wall→audio transition
  const clockSourceRef = useRef<'wall' | 'audio'>('wall');

  // Performance monitor
  const perfMonitorRef = useRef<PlaybackPerformanceMonitor>(new PlaybackPerformanceMonitor());
  const [frameServerPort, setFrameServerPort] = useState<number | null>(null);
  const [streamWsUrl, setStreamWsUrl] = useState<string | null>(null);
  const [audioWsUrl, setAudioWsUrl] = useState<string | null>(null);

  // State
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // Media info cache
  const mediaInfo = useMediaInfoCache();
  mediaInfoRef.current = mediaInfo;

  // Current time ref for closures
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  // isPlaying ref for rAF closure
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  // ==========================================================================
  // Frame Server Port & Stream Configuration
  // ==========================================================================

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'frameServer:config' && typeof message.port === 'number') {
        console.log(`[PreviewPanel] Received frame server config, port: ${message.port}`);
        setFrameServerPort(message.port);
      }
      if (message.type === 'frameServer:streamCreated') {
        console.log(`[PreviewPanel] Stream created: video=${message.streamId}, audio=${message.audioStreamId ?? 'none'}`);
        setStreamWsUrl(typeof message.wsUrl === 'string' ? message.wsUrl : null);
        setAudioWsUrl(typeof message.audioWsUrl === 'string' ? message.audioWsUrl : null);
      }
      if (message.type === 'frameServer:streamStopped') {
        console.log(`[PreviewPanel] Stream stopped: ${message.streamId}`);
        setStreamWsUrl(null);
        setAudioWsUrl(null);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // ==========================================================================
  // Frame Rendering
  // ==========================================================================

  const renderFrame = useCallback((frame: VideoFrame) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      frame.close();
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      frame.close();
      return;
    }

    perfMonitorRef.current.recordFrame();
    const renderStart = performance.now();
    ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
    perfMonitorRef.current.recordRenderTime(performance.now() - renderStart);
    frame.close();
  }, []);

  // ==========================================================================
  // H.264 + Audio Stream Client Setup
  // ==========================================================================

  useEffect(() => {
    if (!streamWsUrl || !project || !canvasRef.current) {
      return;
    }

    // Reset performance monitor for new stream
    const monitor = perfMonitorRef.current;
    monitor.reset();

    // Create frame scheduler for A/V sync
    schedulerRef.current = new FrameScheduler(project.fps || 25);

    // Create H.264 stream client — frames go to scheduler, not directly to canvas
    const client = new H264StreamClient({
      websocketUrl: streamWsUrl,
      width: project.resolution.width,
      height: project.resolution.height,
      onFrame: (frame: VideoFrame) => {
        const scheduler = schedulerRef.current;
        if (scheduler) {
          scheduler.enqueue(frame);
        } else {
          renderFrame(frame);
        }
      },
      onConnectionChange: (connected: boolean) => {
        console.log(`[PreviewPanel] H.264 stream ${connected ? 'connected' : 'disconnected'}`);
        setIsInitialized(connected);
        if (connected) {
          setInitError(null);
        }
      },
      onError: (error: Error) => {
        console.error('[PreviewPanel] H.264 stream error:', error);
        setInitError(error.message);
      },
      onPacketReceived: (sizeBytes: number) => {
        monitor.recordPacketSize(sizeBytes);
      },
    });

    h264ClientRef.current = client;
    client.connect();

    // Create audio stream client if audio URL is available
    let audioClient: AudioStreamClient | null = null;
    if (audioWsUrl) {
      // Create / resume AudioContext (may already exist from user gesture)
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext({ sampleRate: 48000 });
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }

      audioClient = new AudioStreamClient({
        websocketUrl: audioWsUrl,
        volume: 1.0,
        onConnectionChange: (connected) => {
          console.log(`[PreviewPanel] Audio stream ${connected ? 'connected' : 'disconnected'}`);
        },
        onError: (err) => {
          console.warn('[PreviewPanel] Audio stream error:', err);
        },
      });
      audioClientRef.current = audioClient;
      audioClient.connect(audioCtxRef.current ?? undefined);
    }

    // Reset clock source for new stream
    clockSourceRef.current = 'wall';
    playWallTimeRef.current = performance.now();
    playStartTimeRef.current = currentTimeRef.current;

    return () => {
      client.dispose();
      h264ClientRef.current = null;
      schedulerRef.current?.dispose();
      schedulerRef.current = null;
      if (audioClient) {
        audioClient.setVolume(0);
        audioClient.dispose();
        audioClientRef.current = null;
      }
      monitor.reset();
      setIsInitialized(false);
    };
  }, [streamWsUrl, audioWsUrl, project?.resolution.width, project?.resolution.height, project?.fps, renderFrame]);

  // ==========================================================================
  // rAF Playback Loop (A/V sync)
  // ==========================================================================

  const updatePlaybackTime = useCallback(() => {
    if (!isPlayingRef.current || !project) return;

    // Determine master clock time
    let newTime: number;
    const audioClient = audioClientRef.current;

    if (audioClient && audioClient.isClockReady) {
      // Detect wall→audio clock transition: flush scheduler to reset A/V offset
      if (clockSourceRef.current === 'wall') {
        clockSourceRef.current = 'audio';
        schedulerRef.current?.flush();
        console.log('[PreviewPanel] Clock source switched: wall → audio');
      }
      newTime = audioClient.getCurrentTime();
    } else {
      // Wall-clock fallback: don't advance until first video frame arrives
      const h264Stats = h264ClientRef.current?.getStats();
      if (!h264Stats || h264Stats.framesDecoded === 0) {
        playWallTimeRef.current = performance.now();
        newTime = playStartTimeRef.current;
      } else {
        const elapsed = (performance.now() - playWallTimeRef.current) / 1000;
        newTime = playStartTimeRef.current + elapsed;
      }
    }

    // Frame scheduling: render/skip/wait based on master clock
    const scheduler = schedulerRef.current;
    if (scheduler) {
      const masterClockUs = newTime * 1_000_000;
      const result = scheduler.schedule(masterClockUs);
      if (result.action === 'render' && result.frame) {
        renderFrame(result.frame);
      }
    }

    animFrameRef.current = requestAnimationFrame(updatePlaybackTime);
  }, [project, renderFrame]);

  useEffect(() => {
    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(updatePlaybackTime);
    }
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = 0;
      }
    };
  }, [isPlaying, updatePlaybackTime]);

  // ==========================================================================
  // Playback Control
  // ==========================================================================

  useEffect(() => {
    if (!frameServerPort || !project || !isPlaying) {
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

    // Create / resume AudioContext in user-gesture context (play button click)
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext({ sampleRate: 48000 });
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }

    // Initialize wall-clock refs
    playStartTimeRef.current = currentPlayheadTime;
    playWallTimeRef.current = performance.now();
    clockSourceRef.current = 'wall';

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
  }, [frameServerPort, project, isPlaying]);

  // ==========================================================================
  // Scrubbing (Seek when paused)
  // ==========================================================================

  const lastRenderedTimeRef = useRef<number>(-1);

  useEffect(() => {
    if (!frameServerPort || !project || isPlaying) return;

    const TIME_TOLERANCE = 0.001;
    if (Math.abs(currentTime - lastRenderedTimeRef.current) < TIME_TOLERANCE) return;

    // Flush stale frames and reset decoders on seek
    schedulerRef.current?.flush();
    h264ClientRef.current?.resetDecoder();
    audioClientRef.current?.resetClock();
    clockSourceRef.current = 'wall';

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

      postMessage({
        type: 'media:frameServer:projectPlayback:seek',
        payload: {
          projectData: project,
          seekTime: currentTime,
        },
      });

      await new Promise(resolve => setTimeout(resolve, 100));

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

  useEffect(() => {
    if (onCaptureScreenshot) {
      (window as unknown as { __previewPanelCaptureScreenshot: typeof captureScreenshot }).__previewPanelCaptureScreenshot = captureScreenshot;
    }
  }, [onCaptureScreenshot, captureScreenshot]);

  // ==========================================================================
  // Picture-in-Picture
  // ==========================================================================

  const togglePiP = useCallback(async () => {
    if (!canvasRef.current) return;

    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      return;
    }

    const video = pipVideoRef.current;
    if (!video) return;

    if (!video.srcObject) {
      const stream = canvasRef.current.captureStream();
      video.srcObject = stream;
      video.muted = true;
      await video.play();
    }

    await video.requestPictureInPicture();
  }, []);

  useEffect(() => {
    const video = pipVideoRef.current;
    if (!video) return;

    const handleEnterPiP = () => setIsPiPActive(true);
    const handleLeavePiP = () => {
      setIsPiPActive(false);
      const stream = video.srcObject as MediaStream | null;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
      }
    };

    video.addEventListener('enterpictureinpicture', handleEnterPiP);
    video.addEventListener('leavepictureinpicture', handleLeavePiP);
    return () => {
      video.removeEventListener('enterpictureinpicture', handleEnterPiP);
      video.removeEventListener('leavepictureinpicture', handleLeavePiP);
    };
  }, [setIsPiPActive]);

  useEffect(() => {
    (window as unknown as { __previewPanelTogglePiP: typeof togglePiP }).__previewPanelTogglePiP = togglePiP;
    return () => {
      delete (window as unknown as { __previewPanelTogglePiP?: typeof togglePiP }).__previewPanelTogglePiP;
    };
  }, [togglePiP]);

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
      const snapshot = perfMonitorRef.current.getSnapshot();
      const schedStats = schedulerRef.current?.getStats();

      perfMonitorRef.current.recordDroppedFrames(
        stats.framesDropped - snapshot.droppedFrames
      );

      setCurrentFps(snapshot.measuredFps);
      setPerformanceStats({
        currentTime: currentTimeRef.current,
        frameIndex: Math.floor(currentTimeRef.current * (project?.fps || 30)),
        targetFps: project?.fps || 30,
        resolution: `${project?.resolution.width}x${project?.resolution.height}`,
        bitrate: mediaInfoRef.current.bitrate,
        mode: 'compatible',
        decodeTime: stats.avgDecodeTimeMs,
        renderTime: snapshot.avgRenderTimeMs,
        compositeTime: stats.avgLatencyMs,
        frameTimeP50: snapshot.frameTimeP50,
        frameTimeP95: snapshot.frameTimeP95,
        frameTimeP99: snapshot.frameTimeP99,
        measuredFps: snapshot.measuredFps,
        bitrateKbps: snapshot.bitrateKbps,
        memoryUsedMB: snapshot.memoryUsedMB,
        memoryTotalMB: 0,
        cpuLoad: 0,
        gpuBackend: stats.hardwareAcceleration ? 'HW' : 'SW',
        gpuLoad: 0,
        cachedFrames: schedStats?.queueLength ?? 0,
        cacheHitRate: 0,
        droppedFrames: stats.framesDropped + (schedStats?.skipped ?? 0),
        renderErrors: 0,
      });

      // Fetch engine-side pipeline stats (async, non-blocking)
      getMediaProxy().getStreamStats().then((engineStats) => {
        if (engineStats) {
          setPerformanceStats({
            engineHwDecodeMs: engineStats.video.hwDecodeMs,
            engineNv12ImportMs: engineStats.video.nv12ImportMs,
            engineNv12ToRgbaMs: engineStats.video.nv12ToRgbaMs,
            engineCompositeMs: engineStats.video.compositeMs,
            engineRgbaToNv12Ms: engineStats.video.rgbaToNv12Ms,
            engineCpuReadbackMs: engineStats.video.cpuReadbackMs,
            engineEncodeSubmitMs: engineStats.video.encodeSubmitMs,
            engineAvgFps: engineStats.video.avgFps,
            engineAudioMixMs: engineStats.audioMixMs,
            engineCpuUsagePercent: engineStats.cpuUsagePercent,
            enginePeakMemoryBytes: engineStats.peakMemoryBytes,
          });
        }
      }).catch(() => {
        // Ignore — engine stats are best-effort
      });
    };

    // Run first fetch immediately, then every 1s
    fetchStats();
    const intervalId = setInterval(fetchStats, 1000);
    return () => clearInterval(intervalId);
  }, [isPlaying, streamWsUrl, project, setCurrentFps, setPerformanceStats]);

  // ==========================================================================
  // Cleanup on unmount
  // ==========================================================================

  useEffect(() => {
    return () => {
      schedulerRef.current?.dispose();
      h264ClientRef.current?.dispose();
      const ac = audioClientRef.current;
      if (ac) {
        ac.setVolume(0);
        ac.dispose();
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

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
                {/* Header: time / frame / target fps */}
                <div className="text-[10px] leading-tight text-center text-gray-400 border-b border-gray-600 pb-1">
                  <span>{performanceStats.currentTime.toFixed(2)}s</span>
                  <span className="mx-1">|</span>
                  <span>F{performanceStats.frameIndex}</span>
                  <span className="mx-1">|</span>
                  <span>{performanceStats.targetFps}fps</span>
                </div>

                {/* Stream info */}
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
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Clock</span>
                    <span className="text-cyan-400">{clockSourceRef.current}</span>
                  </div>
                </div>

                <div className="border-t border-gray-600 my-0.5" />

                {/* FPS & Bitrate */}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-400">FPS</span>
                  <span style={{
                    color: currentFps >= (project?.fps || 30) * 0.9 ? '#4a9' : currentFps >= (project?.fps || 30) * 0.5 ? '#fa0' : '#f44',
                    fontWeight: 'bold',
                  }}>
                    {currentFps.toFixed(1)}
                  </span>
                </div>
                <div className="text-[10px] leading-tight">
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Bitrate</span>
                    <span className="text-gray-300">
                      {performanceStats.bitrateKbps >= 1000
                        ? `${(performanceStats.bitrateKbps / 1000).toFixed(1)} Mbps`
                        : `${performanceStats.bitrateKbps.toFixed(0)} kbps`}
                    </span>
                  </div>
                </div>

                <div className="border-t border-gray-600 my-0.5" />

                {/* Timing stats */}
                <div className="text-[10px] leading-tight space-y-0.5">
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Decode</span>
                    <span className="text-gray-300">{performanceStats.decodeTime.toFixed(1)}ms</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Render</span>
                    <span className="text-gray-300">{performanceStats.renderTime.toFixed(1)}ms</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Latency</span>
                    <span className="text-gray-300">{performanceStats.compositeTime.toFixed(1)}ms</span>
                  </div>
                </div>

                <div className="border-t border-gray-600 my-0.5" />

                {/* Frame time percentiles & system */}
                <div className="text-[10px] leading-tight space-y-0.5">
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">P50</span>
                    <span className="text-gray-300">{performanceStats.frameTimeP50.toFixed(1)}ms</span>
                    <span className="text-gray-600 mx-0.5">|</span>
                    <span className="text-gray-500">P95</span>
                    <span className="text-gray-300">{performanceStats.frameTimeP95.toFixed(1)}ms</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Dropped</span>
                    <span style={{ color: performanceStats.droppedFrames === 0 ? '#4a9' : '#f44' }}>
                      {performanceStats.droppedFrames}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Queue</span>
                    <span className="text-gray-300">{performanceStats.cachedFrames}</span>
                  </div>
                  {performanceStats.memoryUsedMB > 0 && (
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-500">Memory</span>
                      <span className="text-gray-300">{performanceStats.memoryUsedMB.toFixed(0)} MB</span>
                    </div>
                  )}
                </div>

                {/* Engine Pipeline Stats (from timelines:stream_stats) */}
                {performanceStats.engineAvgFps > 0 && (
                  <>
                    <div className="border-t border-gray-600 my-0.5" />
                    <div className="text-[10px] leading-tight">
                      <div className="text-center text-gray-500 mb-0.5">Engine Pipeline</div>
                      <div className="space-y-0.5">
                        <div className="flex justify-between gap-2">
                          <span className="text-gray-500">HW Decode</span>
                          <span className="text-gray-300">{performanceStats.engineHwDecodeMs.toFixed(1)}ms</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-gray-500">Composite</span>
                          <span className="text-gray-300">{performanceStats.engineCompositeMs.toFixed(1)}ms</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-gray-500">Encode</span>
                          <span className="text-gray-300">{performanceStats.engineEncodeSubmitMs.toFixed(1)}ms</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-gray-500">Engine FPS</span>
                          <span className="text-gray-300">{performanceStats.engineAvgFps.toFixed(1)}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-gray-500">CPU</span>
                          <span className="text-gray-300">{performanceStats.engineCpuUsagePercent.toFixed(1)}%</span>
                        </div>
                        {performanceStats.enginePeakMemoryBytes > 0 && (
                          <div className="flex justify-between gap-2">
                            <span className="text-gray-500">Peak Mem</span>
                            <span className="text-gray-300">{(performanceStats.enginePeakMemoryBytes / 1024 / 1024).toFixed(0)} MB</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Hidden video element for PiP */}
          <video
            ref={pipVideoRef}
            style={{ display: 'none' }}
            playsInline
            muted
          />

          {/* Loading overlay */}
          {!isInitialized && (
            <div
              className="flex items-center justify-center bg-black border border-vscode-panel-border max-w-full max-h-full"
              style={{
                aspectRatio: `${project.resolution.width} / ${project.resolution.height}`,
                width: Math.min(project.resolution.width, 800),
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
