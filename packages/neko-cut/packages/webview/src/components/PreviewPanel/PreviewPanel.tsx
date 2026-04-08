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
import { useEditorStore } from '../../stores/editor-store';
import { useTranslation } from '../../i18n/I18nContext';
import { getLogger } from '../../utils/logger';

const logger = getLogger('PreviewPanel');
import { useMediaInfoCache } from '../../hooks/useMediaInfoCache';
import { PREVIEW_QUALITY } from '../../constants';
import { postMessage } from '../../utils/vscodeApi';
import { getMediaProxy } from '../../services/mediaProxyFactory';
import {
  H264StreamClient,
  AudioStreamClient,
  FrameScheduler,
  PlaybackPerformanceMonitor,
} from '@neko/neko-client';
import { buildCompositeLayers } from './compositeUtils';
import { PerformanceOverlay } from './PerformanceOverlay';

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
  const {
    project,
    currentTime,
    isPlaying,
    playbackSpeed,
    previewQuality,
    previewVolume,
    previewMuted,
  } = useEditorStore();
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
        logger.info(`Received frame server config, port: ${message.port}`);
        setFrameServerPort(message.port);
      }
      if (message.type === 'frameServer:streamCreated') {
        logger.info(
          `Stream created: video=${message.streamId}, audio=${message.audioStreamId ?? 'none'}`,
        );
        setStreamWsUrl(typeof message.wsUrl === 'string' ? message.wsUrl : null);
        setAudioWsUrl(typeof message.audioWsUrl === 'string' ? message.audioWsUrl : null);
      }
      if (message.type === 'frameServer:streamStopped') {
        logger.info(`Stream stopped: ${message.streamId}`);
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
        logger.info(`H.264 stream ${connected ? 'connected' : 'disconnected'}`);
        setIsInitialized(connected);
        if (connected) {
          setInitError(null);
        }
      },
      onError: (error: Error) => {
        logger.error('H.264 stream error:', error);
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
          logger.info(`Audio stream ${connected ? 'connected' : 'disconnected'}`);
        },
        onError: (err) => {
          logger.warn('Audio stream error:', err);
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
  }, [
    streamWsUrl,
    audioWsUrl,
    project?.resolution.width,
    project?.resolution.height,
    project?.fps,
    renderFrame,
  ]);

  // ==========================================================================
  // rAF Playback Loop (A/V sync)
  // ==========================================================================

  const updatePlaybackTime = useCallback(() => {
    if (!isPlayingRef.current || !project) return;

    // Determine master clock time
    let newTime: number;
    const audioClient = audioClientRef.current;

    if (audioClient && audioClient.isClockReady) {
      // Detect wall→audio clock transition: re-align scheduler offset without flushing
      if (clockSourceRef.current === 'wall') {
        clockSourceRef.current = 'audio';
        const audioTimeUs = audioClient.getCurrentTime() * 1_000_000;
        schedulerRef.current?.switchClock(audioTimeUs);
        logger.info('Clock source switched: wall -> audio');
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
        newTime = playStartTimeRef.current + elapsed * playbackSpeed;
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

  // Project ref for non-reactive checks in effects that should not re-trigger on project changes
  const projectRef = useRef(project);
  projectRef.current = project;

  useEffect(() => {
    if (!frameServerPort || !projectRef.current) return;

    if (!isPlaying) {
      // Pause: engine stops encoding loop, stream stays alive
      postMessage({ type: 'media:frameServer:projectPlayback:pause' });
      return;
    }

    // Resume playback (stream already created at editor open)
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext({ sampleRate: 48000 });
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }

    // Initialize wall-clock refs
    playStartTimeRef.current = currentTimeRef.current;
    playWallTimeRef.current = performance.now();
    clockSourceRef.current = 'wall';

    logger.info('Resuming H264 push for playback');
    postMessage({
      type: 'media:frameServer:projectPlayback:resume',
      payload: {
        startTime: currentTimeRef.current,
        speed: playbackSpeed,
      },
    });

    return () => {
      postMessage({ type: 'media:frameServer:projectPlayback:pause' });
    };
  }, [frameServerPort, isPlaying, playbackSpeed]);

  // ==========================================================================
  // Scrubbing & Seek (paused or during playback)
  // ==========================================================================

  const lastRenderedTimeRef = useRef<number>(-1);

  useEffect(() => {
    if (!frameServerPort || !project) return;

    const TIME_TOLERANCE = 0.001;
    const delta = currentTime - lastRenderedTimeRef.current;
    if (Math.abs(delta) < TIME_TOLERANCE) return;

    // During live playback, App.tsx advances currentTime by ~1 frame (~33ms) every
    // rAF tick for playhead display. These small forward increments must NOT reset
    // the decoder or restart the stream — the server is already pushing frames at
    // the correct PTS and resetting would cause perpetual seek loops.
    //
    // Only treat the change as a real seek (reset + restart) when:
    //   - paused (any change is a user scrub), OR
    //   - playing but delta is negative (backward seek), OR
    //   - playing but delta is large (>0.5 s: user jumped to a new position)
    const isNormalPlaybackAdvance = isPlaying && delta > 0 && delta <= 0.5;

    lastRenderedTimeRef.current = currentTime;

    if (isNormalPlaybackAdvance) return;

    // Actual seek: flush stale frames and reset decoders
    schedulerRef.current?.flush();
    h264ClientRef.current?.resetDecoder();
    audioClientRef.current?.resetClock();
    clockSourceRef.current = 'wall';

    if (isPlaying) {
      // Seek during playback: restart stream from new position
      playStartTimeRef.current = currentTime;
      playWallTimeRef.current = performance.now();

      postMessage({
        type: 'media:frameServer:projectPlayback:resume',
        payload: {
          startTime: currentTime,
          speed: playbackSpeed,
        },
      });
    } else {
      // Seek when paused: request single frame at target time
      postMessage({
        type: 'media:frameServer:projectPlayback:seek',
        payload: {
          projectData: project,
          seekTime: currentTime,
        },
      });
    }
  }, [currentTime, isPlaying, isInitialized, project, playbackSpeed]);

  // ==========================================================================
  // Composite High-Quality Frame (when paused)
  // ==========================================================================

  useEffect(() => {
    if (!project || isPlaying || !isInitialized) return;

    const abortController = new AbortController();

    const fetchCompositeFrame = async () => {
      try {
        const layers = buildCompositeLayers(project, currentTime);
        if (layers.length === 0) return;

        const bitmap = await getMediaProxy().renderCompositeFrame(
          layers,
          currentTime,
          project.resolution.width,
          project.resolution.height,
          [0, 0, 0, 255],
          { signal: abortController.signal },
        );

        // Race check: ensure still paused and not aborted
        if (abortController.signal.aborted) {
          bitmap.close();
          return;
        }

        // Render composite frame to Canvas
        const canvas = canvasRef.current;
        if (!canvas) {
          bitmap.close();
          return;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          bitmap.close();
          return;
        }
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        logger.warn('Composite frame failed:', err);
      }
    };

    fetchCompositeFrame();

    return () => {
      abortController.abort();
    };
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

  // Notify engine of quality change (resolution/bitrate hot-update)
  // Also fires after stream creation (streamWsUrl change) to apply initial quality
  useEffect(() => {
    if (!project || !frameServerPort || !streamWsUrl) return;

    const scale = PREVIEW_QUALITY[previewQuality];
    const width = Math.round(project.resolution.width * scale);
    const height = Math.round(project.resolution.height * scale);

    logger.info(
      `Sending quality update: ${width}x${height} (scale=${scale}, quality=${previewQuality})`,
    );
    postMessage({
      type: 'media:frameServer:projectPlayback:quality',
      payload: { width, height },
    });
  }, [previewQuality, project?.resolution, frameServerPort, streamWsUrl]);

  // ==========================================================================
  // Preview Volume Sync — apply previewVolume/previewMuted to AudioStreamClient
  // ==========================================================================

  useEffect(() => {
    const audioClient = audioClientRef.current;
    if (!audioClient) return;
    audioClient.setVolume(previewMuted ? 0 : previewVolume);
  }, [previewVolume, previewMuted]);

  // ==========================================================================
  // Timeline Hot-Update — send project changes to engine during playback
  // ==========================================================================

  useEffect(() => {
    if (!frameServerPort || !project || !isPlaying) return;
    postMessage({
      type: 'media:frameServer:projectPlayback:update',
      payload: { projectData: project },
    });
  }, [project, isPlaying, frameServerPort]);

  useEffect(() => {
    if (!frameServerPort || !isPlaying) return;

    playStartTimeRef.current = currentTimeRef.current;
    playWallTimeRef.current = performance.now();

    postMessage({
      type: 'media:frameServer:projectPlayback:speed',
      payload: { speed: playbackSpeed },
    });
  }, [playbackSpeed, frameServerPort, isPlaying]);

  // ==========================================================================
  // Screenshot Capture
  // ==========================================================================

  const captureScreenshot = useCallback(async () => {
    if (!isInitialized || !project || !canvasRef.current) {
      logger.error('Cannot capture: not initialized or no project');
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

      await new Promise((resolve) => setTimeout(resolve, 100));

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

      logger.info('Screenshot sent to extension');
    } catch (error) {
      logger.error('Screenshot capture failed:', error);
      throw error;
    }
  }, [isInitialized, project, currentTime]);

  useEffect(() => {
    if (onCaptureScreenshot) {
      (
        window as unknown as { __previewPanelCaptureScreenshot: typeof captureScreenshot }
      ).__previewPanelCaptureScreenshot = captureScreenshot;
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
    (window as unknown as { __previewPanelTogglePiP: typeof togglePiP }).__previewPanelTogglePiP =
      togglePiP;
    return () => {
      delete (window as unknown as { __previewPanelTogglePiP?: typeof togglePiP })
        .__previewPanelTogglePiP;
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

      perfMonitorRef.current.recordDroppedFrames(stats.framesDropped - snapshot.droppedFrames);

      setCurrentFps(snapshot.measuredFps);
      setPerformanceStats({
        currentTime: currentTimeRef.current,
        frameIndex: Math.floor(currentTimeRef.current * (project?.fps || 30)),
        targetFps: project?.fps || 30,
        resolution: (() => {
          const scale = PREVIEW_QUALITY[previewQuality];
          const w = Math.round((project?.resolution.width ?? 0) * scale);
          const h = Math.round((project?.resolution.height ?? 0) * scale);
          return `${w}x${h}`;
        })(),
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
        droppedFrames:
          stats.framesDropped + (schedStats?.skipped ?? 0) + (schedStats?.backpressure ?? 0),
        renderErrors: 0,
      });

      // Fetch engine-side pipeline stats (async, non-blocking)
      getMediaProxy()
        .getStreamStats()
        .then((engineStats) => {
          if (engineStats) {
            setPerformanceStats({
              engineHwDecodeMs: engineStats.video.hwDecodeMs,
              engineNv12ImportMs: engineStats.video.nv12ImportMs,
              engineNv12ToRgbaMs: engineStats.video.nv12ToRgbaMs,
              engineCompositeMs: engineStats.video.compositeMs,
              engineRgbaToNv12Ms: engineStats.video.rgbaToNv12Ms,
              engineCpuReadbackMs: engineStats.video.cpuReadbackMs,
              engineEncodeSubmitMs: engineStats.video.encodeSubmitMs,
              engineEncodeTimeMs: engineStats.video.encodeTimeMs ?? 0,
              engineAvgFps: engineStats.video.avgFps,
              engineAudioMixMs: engineStats.audioMixMs,
              engineCpuUsagePercent: engineStats.cpuUsagePercent,
              enginePeakMemoryBytes: engineStats.peakMemoryBytes,
            });
          }
        })
        .catch(() => {
          // Ignore — engine stats are best-effort
        });
    };

    // Run first fetch immediately, then every 1s
    fetchStats();
    const intervalId = setInterval(fetchStats, 1000);
    return () => clearInterval(intervalId);
  }, [isPlaying, streamWsUrl, project, setCurrentFps, setPerformanceStats, previewQuality]);

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
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
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
            <PerformanceOverlay
              performanceStats={performanceStats}
              currentFps={currentFps}
              targetFps={project?.fps || 30}
              clockSource={clockSourceRef.current}
            />
          )}

          {/* Hidden video element for PiP */}
          <video ref={pipVideoRef} style={{ display: 'none' }} playsInline muted />

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
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
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
