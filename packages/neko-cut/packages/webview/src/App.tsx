import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useShallowStore } from './hooks/useShallowStore';
import { useVSCodeMessaging } from './hooks/useVSCodeMessaging';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { PreviewPanel } from './components/PreviewPanel';
import { PreviewControls } from './components/PreviewControls';
import { Timeline } from './components/Timeline';
import type { TimelineElement } from './types';
import { useEditorStore } from './stores/editor-store';

// Split ratio: Preview占比 (0.0 ~ 1.0)
const DEFAULT_PREVIEW_RATIO = 0.5; // 默认 Preview 占 50%
const MIN_PREVIEW_RATIO = 0.2;     // Preview 最小 20%
const MAX_PREVIEW_RATIO = 0.8;     // Preview 最大 80%

function App() {
  const {
    project,
    isPlaying,
    currentTime,
    seek,
    pause,
    getTotalDuration,
    togglePlayback,
    previewQuality,
    setPreviewQuality,
    previewVolume,
    previewMuted,
    setPreviewVolume,
    togglePreviewMute,
  } = useShallowStore(
    (state) => ({
      project: state.project,
      isPlaying: state.isPlaying,
      currentTime: state.currentTime,
      seek: state.seek,
      pause: state.pause,
      getTotalDuration: state.getTotalDuration,
      togglePlayback: state.togglePlayback,
      previewQuality: state.previewQuality,
      setPreviewQuality: state.setPreviewQuality,
      previewVolume: state.previewVolume,
      previewMuted: state.previewMuted,
      setPreviewVolume: state.setPreviewVolume,
      togglePreviewMute: state.togglePreviewMute,
    })
  );
  const selectedElements = useEditorStore((state) => state.selectedElements);
  const updateElement = useEditorStore((state) => state.updateElement);
  const updateProject = useEditorStore((state) => state.updateProject);
  const addKeyframe = useEditorStore((state) => state.addKeyframe);
  const removeKeyframe = useEditorStore((state) => state.removeKeyframe);
  const { sendMessage } = useVSCodeMessaging();
  const animationFrameRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastSeekTimeRef = useRef<number>(currentTime); // Track last known currentTime
  const [previewRatio, setPreviewRatio] = useState(DEFAULT_PREVIEW_RATIO);
  const [isResizing, setIsResizing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false);

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
      const captureFunc = (window as any).__previewPanelCaptureScreenshot;
      if (captureFunc) {
        await captureFunc();
      } else {
        console.error('[App] PreviewPanel capture function not available');
      }

    } catch (error) {
      console.error('[App] Screenshot capture failed:', error);
    } finally {
      setIsCapturingScreenshot(false);
    }
  }, [project, isCapturingScreenshot]);

  // Get the first selected element for property panel
  const selectedElement = useMemo((): TimelineElement | null => {
    if (!project || selectedElements.length === 0) return null;
    const { trackId, elementId } = selectedElements[0];
    const track = project.tracks.find((t) => t.id === trackId);
    return track?.elements.find((e) => e.id === elementId) ?? null;
  }, [project, selectedElements]);

  // Get the track ID of the selected element
  const selectedTrackId = selectedElements.length > 0 ? selectedElements[0].trackId : null;

  // Send element selection to extension for Property Panel
  useEffect(() => {
    sendMessage({
      type: 'elementSelected',
      element: selectedElement,
      trackId: selectedTrackId,
      currentTime: currentTime,
    });
  }, [selectedElement, selectedTrackId, sendMessage]);

  // Send current time updates to extension for Property Panel (throttled)
  const lastTimeRef = useRef(currentTime);
  useEffect(() => {
    // Only send if time changed significantly (avoid spamming)
    if (Math.abs(currentTime - lastTimeRef.current) > 0.01) {
      lastTimeRef.current = currentTime;
      sendMessage({
        type: 'currentTimeUpdate',
        currentTime: currentTime,
      });
    }
  }, [currentTime, sendMessage]);

  // Listen for property changes from the Property Panel
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;

      switch (message.type) {
        case 'updateElementFromPropertyPanel':
          if (message.trackId && message.elementId && message.changes) {
            updateElement(message.trackId, message.elementId, message.changes);
          }
          break;

        case 'updateDefaultsFromPropertyPanel':
          if (message.changes) {
            updateProject({ defaults: { ...project?.defaults, ...message.changes } });
          }
          break;

        case 'addKeyframeFromPropertyPanel':
          if (message.trackId && message.elementId && message.propertyPath) {
            // Add keyframe at current time with the provided value
            addKeyframe(
              message.trackId,
              message.elementId,
              message.propertyPath,
              currentTime,
              message.value
            );
          }
          break;

        case 'removeKeyframeFromPropertyPanel':
          if (message.trackId && message.elementId && message.propertyPath) {
            // Remove keyframe at current time
            removeKeyframe(
              message.trackId,
              message.elementId,
              message.propertyPath,
              currentTime
            );
          }
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [updateElement, updateProject, project?.defaults, addKeyframe, removeKeyframe, currentTime]);

  // Handle resize with pointer capture to prevent cursor sticking when mouse leaves webview
  const resizeHandleRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    // Capture pointer to receive events even when pointer leaves the element/window
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsResizing(true);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isResizing || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const containerHeight = containerRect.height - 4; // 4px for resize handle

    // Calculate preview ratio based on pointer position
    const pointerY = e.clientY - containerRect.top;
    const newRatio = pointerY / containerHeight;

    // Clamp to min/max
    setPreviewRatio(Math.max(MIN_PREVIEW_RATIO, Math.min(MAX_PREVIEW_RATIO, newRatio)));
  }, [isResizing]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    // Release pointer capture
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    setIsResizing(false);
  }, []);

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
      const newTime = startPlaybackTime + elapsed;

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
  }, [isPlaying]); // Only restart loop when play state changes

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
    <div ref={containerRef} className="flex flex-col h-full bg-vscode-bg">
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
          seek={seek}
          togglePlayback={togglePlayback}
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
        />
      </div>

      {/* Resize Handle - hidden in fullscreen */}
      {!isFullscreen && (
        <div
          ref={resizeHandleRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className={`h-1 flex-shrink-0 cursor-ns-resize border-t border-vscode-panel-border transition-colors ${
            isResizing ? 'bg-vscode-accent' : 'hover:bg-vscode-accent/50'
          }`}
          style={{ touchAction: 'none' }}
        />
      )}

      {/* Timeline with Controls - hidden in fullscreen */}
      {!isFullscreen && (
        <div
          className="overflow-hidden flex flex-col min-h-0"
          style={{ flex: 1 - previewRatio }}
        >
          <Timeline />
        </div>
      )}
    </div>
  );
}

export default App;
