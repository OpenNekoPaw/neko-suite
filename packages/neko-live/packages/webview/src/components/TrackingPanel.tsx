import { useLiveStore } from '../stores/liveStore';
import type { TrackingMode } from '../types/tracking';
import { vscode } from '../vscode-api';

/**
 * Compact control panel for tracking settings and status.
 * Designed for the bottom panel layout (horizontal, narrow).
 */
export function TrackingPanel() {
  const {
    trackingMode,
    isTracking,
    trackingFps,
    isAvatarLoaded,
    showSkeletonOverlay,
    setTrackingMode,
    toggleSkeletonOverlay,
  } = useLiveStore();

  const handleModeChange = (mode: TrackingMode) => {
    setTrackingMode(mode);
    vscode.postMessage({ type: 'setTrackingMode', mode });
  };

  const handleToggleTracking = () => {
    if (isTracking) {
      vscode.postMessage({ type: 'stopVmcReceiver' });
    } else {
      vscode.postMessage({ type: 'startVmcReceiver' });
    }
  };

  const handleSelectAvatar = () => {
    vscode.postMessage({ type: 'selectAvatar' });
  };

  return (
    <div
      className="flex flex-col gap-2 p-2 border-t border-[var(--vscode-panel-border)]"
      style={{ background: 'var(--vscode-sideBar-background)' }}
    >
      {/* Status bar */}
      <div className="flex items-center gap-2 text-xs">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: isTracking ? '#4ade80' : '#6b7280' }}
        />
        <span style={{ color: 'var(--vscode-descriptionForeground)' }}>
          {isTracking ? `VMC ${trackingFps} fps` : 'Disconnected'}
        </span>

        {isAvatarLoaded && (
          <span className="ml-auto" style={{ color: 'var(--vscode-descriptionForeground)' }}>
            Avatar loaded
          </span>
        )}
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-2">
        {/* Tracking mode */}
        <select
          value={trackingMode}
          onChange={(e) => handleModeChange(e.target.value as TrackingMode)}
          className="px-1 py-0.5 text-xs rounded"
          style={{
            background: 'var(--vscode-dropdown-background)',
            color: 'var(--vscode-dropdown-foreground)',
            border: '1px solid var(--vscode-dropdown-border)',
          }}
        >
          <option value="vmc">VMC</option>
          <option value="mediapipe" disabled>
            MediaPipe (P5.1.3)
          </option>
          <option value="hybrid" disabled>
            Hybrid (P5.1.3)
          </option>
        </select>

        {/* Start/Stop */}
        <button
          onClick={handleToggleTracking}
          className="px-2 py-0.5 text-xs rounded"
          style={{
            background: isTracking
              ? 'var(--vscode-statusBarItem-errorBackground, #c53030)'
              : 'var(--vscode-button-background)',
            color: isTracking
              ? 'var(--vscode-statusBarItem-errorForeground, #fff)'
              : 'var(--vscode-button-foreground)',
          }}
        >
          {isTracking ? 'Stop' : 'Start'}
        </button>

        {/* Select Avatar */}
        <button
          onClick={handleSelectAvatar}
          className="px-2 py-0.5 text-xs rounded"
          style={{
            background: 'var(--vscode-button-secondaryBackground)',
            color: 'var(--vscode-button-secondaryForeground)',
          }}
        >
          Avatar
        </button>

        {/* Skeleton overlay toggle */}
        <label
          className="flex items-center gap-1 ml-auto text-xs cursor-pointer"
          style={{ color: 'var(--vscode-descriptionForeground)' }}
        >
          <input
            type="checkbox"
            checked={showSkeletonOverlay}
            onChange={toggleSkeletonOverlay}
            className="w-3 h-3"
          />
          Bones
        </label>
      </div>
    </div>
  );
}
