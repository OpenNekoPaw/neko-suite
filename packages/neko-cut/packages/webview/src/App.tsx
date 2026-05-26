import { useEffect, useRef, useState, useCallback } from 'react';
import { useResizable } from '@neko/ui/hooks';
import { ResizeHandle } from '@neko/ui/primitives';
import { useShallowStore } from './hooks/useShallowStore';
import { useVSCodeMessaging } from './hooks/useVSCodeMessaging';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { PreviewPanel } from './components/PreviewPanel';
import { PreviewControls } from './components/PreviewControls';
import { Timeline } from './components/Timeline';
import { PropertyPanelInline } from './components/PropertyPanel/PropertyPanelInline';
import { CUT_PROPERTY_PANEL_WIDTH_BOUNDS } from './components/PreviewControls.presenter';
import { useEditorStore } from './stores/editor-store';
import { getLogger } from './utils/logger';
const logger = getLogger('App');

// Split ratio: Preview占比 (0.0 ~ 1.0)
const DEFAULT_PREVIEW_RATIO = 0.5; // 默认 Preview 占 50%
const MIN_PREVIEW_RATIO = 0.2; // Preview 最小 20%
const MAX_PREVIEW_RATIO = 0.8; // Preview 最大 80%

function App() {
  const {
    project,
    isPlaying,
    currentTime,
    playbackSpeed,
    seek,
    pause,
    getTotalDuration,
    togglePlayback,
    setPlaybackSpeed,
    previewQuality,
    setPreviewQuality,
    previewVolume,
    previewMuted,
    setPreviewVolume,
    togglePreviewMute,
  } = useShallowStore((state) => ({
    project: state.project,
    isPlaying: state.isPlaying,
    currentTime: state.currentTime,
    playbackSpeed: state.playbackSpeed,
    seek: state.seek,
    pause: state.pause,
    getTotalDuration: state.getTotalDuration,
    togglePlayback: state.togglePlayback,
    setPlaybackSpeed: state.setPlaybackSpeed,
    previewQuality: state.previewQuality,
    setPreviewQuality: state.setPreviewQuality,
    previewVolume: state.previewVolume,
    previewMuted: state.previewMuted,
    setPreviewVolume: state.setPreviewVolume,
    togglePreviewMute: state.togglePreviewMute,
  }));
  const propertyPanelVisible = useEditorStore((state) => state.propertyPanelVisible);
  const propertyPanelWidth = useEditorStore((state) => state.propertyPanelWidth);
  const setPropertyPanelWidth = useEditorStore((state) => state.setPropertyPanelWidth);
  const togglePropertyPanel = useEditorStore((state) => state.togglePropertyPanel);
  const { sendMessage } = useVSCodeMessaging();
  const animationFrameRef = useRef<number>(0);
  const lastSeekTimeRef = useRef<number>(currentTime); // Track last known currentTime
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false);

  // Cross-extension drag-and-drop: allow dropping generated assets from agent (ADR-5 P1)
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      sendMessage({ type: 'dnd:drop' });
    },
    [sendMessage],
  );

  // Sync lastSeekTimeRef when manually seeking while paused
  useEffect(() => {
    if (!isPlaying) {
      lastSeekTimeRef.current = currentTime;
    }
  }, [currentTime, isPlaying]);

  // Enable keyboard shortcuts
  useKeyboardShortcuts();

  // Fullscreen toggle handler (CSS-based, since VS Code Webview doesn't support Fullscreen API)
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  /**
   * Capture screenshot handler
   */
  const handleCaptureScreenshot = useCallback(async () => {
    if (!project || isCapturingScreenshot) {
      return;
    }

    try {
      setIsCapturingScreenshot(true);

      // Call the PreviewPanel's capture function via window global
      const captureFunc = window.__previewPanelCaptureScreenshot;
      if (captureFunc) {
        await captureFunc();
      } else {
        logger.error('PreviewPanel capture function not available');
      }
    } catch (error) {
      logger.error('Screenshot capture failed:', error);
    } finally {
      setIsCapturingScreenshot(false);
    }
  }, [project, isCapturingScreenshot]);

  const {
    size: previewRatio,
    isResizing,
    containerRef,
    handleProps: previewResizeHandleProps,
  } = useResizable<HTMLDivElement>({
    edge: 'top',
    mode: 'ratio',
    initialSize: DEFAULT_PREVIEW_RATIO,
    minSize: MIN_PREVIEW_RATIO,
    maxSize: MAX_PREVIEW_RATIO,
    // Preserve the previous split math: the 4px resize handle is outside the
    // two flex panels, so the draggable height excludes the handle itself.
    calculateSize: (event, containerRect) =>
      (event.clientY - containerRect.top) / (containerRect.height - 4),
  });

  const {
    isResizing: isHResizing,
    containerRef: rootRef,
    handleProps: propertyPanelResizeHandleProps,
  } = useResizable<HTMLDivElement>({
    edge: 'right',
    mode: 'pixel',
    size: propertyPanelWidth,
    minSize: CUT_PROPERTY_PANEL_WIDTH_BOUNDS.minSize,
    maxSize: CUT_PROPERTY_PANEL_WIDTH_BOUNDS.maxSize,
    onSizeChange: setPropertyPanelWidth,
  });

  // Playback loop with optimized timing (avoid excessive seek calls)
  // Use refs to avoid restarting the loop when currentTime changes
  const seekRef = useRef(seek);
  const pauseRef = useRef(pause);
  const getTotalDurationRef = useRef(getTotalDuration);
  seekRef.current = seek;
  pauseRef.current = pause;
  getTotalDurationRef.current = getTotalDuration;

  useEffect(() => {
    if (!isPlaying) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    // Record the start time and initial playback position
    const startWallTime = performance.now();
    const startPlaybackTime = lastSeekTimeRef.current;
    let lastUpdateTime = startPlaybackTime;

    const tick = (now: number) => {
      // Calculate elapsed time from playback start for more accurate timing
      const elapsed = (now - startWallTime) / 1000;
      const newTime = startPlaybackTime + elapsed * playbackSpeed;

      const totalDuration = getTotalDurationRef.current();

      if (newTime >= totalDuration) {
        // Stop at the end
        seekRef.current(totalDuration);
        pauseRef.current();
        lastSeekTimeRef.current = totalDuration;
      } else {
        // Only call seek when time changed by at least 1 frame (~33ms for 30fps)
        // This reduces seek calls from 60/sec to ~30/sec, reducing race conditions
        if (Math.abs(newTime - lastUpdateTime) >= 0.033) {
          seekRef.current(newTime);
          lastUpdateTime = newTime;
          lastSeekTimeRef.current = newTime;
        }
        animationFrameRef.current = requestAnimationFrame(tick);
      }
    };

    animationFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, playbackSpeed]); // Restart when play state or preview speed changes

  useEffect(() => {
    // Notify VSCode that webview is ready
    sendMessage({ type: 'ready' });
  }, [sendMessage]);

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full bg-vscode-bg">
        <div className="text-center text-vscode-description">
          <div className="text-lg mb-2">Loading project...</div>
          <div className="text-sm opacity-75">Waiting for project data</div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="flex h-full bg-vscode-bg"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Left: Preview + Timeline (vertical split) */}
      <div ref={containerRef} className="flex flex-col flex-1 min-w-0">
        {/* Preview Panel with Controls */}
        <div
          className="flex flex-col overflow-hidden min-h-0"
          style={{ flex: isFullscreen ? 1 : previewRatio }}
        >
          <div className="flex-1 min-h-0 overflow-hidden">
            <PreviewPanel onCaptureScreenshot={handleCaptureScreenshot} />
          </div>
          <PreviewControls
            currentTime={currentTime}
            totalDuration={getTotalDuration()}
            isPlaying={isPlaying}
            playbackSpeed={playbackSpeed}
            seek={seek}
            togglePlayback={togglePlayback}
            setPlaybackSpeed={setPlaybackSpeed}
            previewQuality={previewQuality}
            setPreviewQuality={setPreviewQuality}
            previewVolume={previewVolume}
            previewMuted={previewMuted}
            setPreviewVolume={setPreviewVolume}
            togglePreviewMute={togglePreviewMute}
            resolution={project.resolution}
            fps={project.fps}
            isFullscreen={isFullscreen}
            onFullscreenToggle={toggleFullscreen}
            onCaptureScreenshot={handleCaptureScreenshot}
            isCapturingScreenshot={isCapturingScreenshot}
            propertyPanelVisible={propertyPanelVisible}
            onTogglePropertyPanel={togglePropertyPanel}
          />
        </div>

        {/* Vertical Resize Handle - hidden in fullscreen */}
        {!isFullscreen && (
          <ResizeHandle
            handleProps={previewResizeHandleProps}
            className={`h-1 flex-shrink-0 cursor-ns-resize border-t border-vscode-panel-border transition-colors ${
              isResizing ? 'bg-vscode-accent' : 'hover:bg-vscode-accent/50'
            }`}
          />
        )}

        {/* Timeline with Controls - hidden in fullscreen */}
        {!isFullscreen && (
          <div className="overflow-hidden flex flex-col min-h-0" style={{ flex: 1 - previewRatio }}>
            <Timeline />
          </div>
        )}
      </div>

      {/* Right: Inline PropertyPanel (collapsible) */}
      {propertyPanelVisible && (
        <>
          {/* Horizontal Resize Handle */}
          <ResizeHandle
            handleProps={propertyPanelResizeHandleProps}
            className={`w-1 flex-shrink-0 cursor-ew-resize transition-colors ${
              isHResizing
                ? 'bg-[var(--vscode-button-background)]'
                : 'bg-[var(--vscode-panel-border)] hover:bg-[var(--vscode-button-background)]'
            }`}
          />
          {/* PropertyPanel */}
          <div
            className="flex-shrink-0 overflow-hidden border-l border-[var(--vscode-panel-border)]"
            style={{
              width: propertyPanelWidth,
              background: 'var(--vscode-sideBar-background)',
            }}
          >
            <PropertyPanelInline />
          </div>
        </>
      )}
    </div>
  );
}

export default App;
