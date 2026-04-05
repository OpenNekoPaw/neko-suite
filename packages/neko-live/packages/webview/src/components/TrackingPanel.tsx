import { useLiveStore } from '../stores/liveStore';
import type { TrackingMode } from '../types/tracking';
import { vscode } from '../vscode-api';

/**
 * Compact control panel for tracking settings and status.
 * Designed for sidebar layout (vertical, narrow).
 * Uses inline styles — no Tailwind dependency.
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
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 8,
        borderTop: '1px solid var(--vscode-panel-border)',
        background: 'var(--vscode-sideBar-background)',
      }}
    >
      {/* Status bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
        <span
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: isTracking ? '#4ade80' : '#6b7280',
          }}
        />
        <span style={{ color: 'var(--vscode-descriptionForeground)' }}>
          {isTracking ? `VMC ${trackingFps} fps` : 'Disconnected'}
        </span>

        {isAvatarLoaded && (
          <span style={{ marginLeft: 'auto', color: 'var(--vscode-descriptionForeground)' }}>
            Avatar loaded
          </span>
        )}
      </div>

      {/* Controls row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Tracking mode */}
        <select
          value={trackingMode}
          onChange={(e) => handleModeChange(e.target.value as TrackingMode)}
          style={{
            padding: '2px 4px',
            fontSize: 11,
            borderRadius: 3,
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
          style={{
            padding: '2px 8px',
            fontSize: 11,
            borderRadius: 3,
            border: 'none',
            cursor: 'pointer',
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
          style={{
            padding: '2px 8px',
            fontSize: 11,
            borderRadius: 3,
            border: 'none',
            cursor: 'pointer',
            background: 'var(--vscode-button-secondaryBackground)',
            color: 'var(--vscode-button-secondaryForeground)',
          }}
        >
          Avatar
        </button>

        {/* Skeleton overlay toggle */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            marginLeft: 'auto',
            fontSize: 11,
            cursor: 'pointer',
            color: 'var(--vscode-descriptionForeground)',
          }}
        >
          <input
            type="checkbox"
            checked={showSkeletonOverlay}
            onChange={toggleSkeletonOverlay}
            style={{ width: 12, height: 12 }}
          />
          Bones
        </label>
      </div>
    </div>
  );
}
