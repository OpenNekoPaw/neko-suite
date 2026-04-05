import { useEffect } from 'react';
import { Viewport3D } from './components/Viewport3D';
import { PuppetViewer } from './components/PuppetViewer';
import { TrackingPanel } from './components/TrackingPanel';
import { useLiveStore } from './stores/liveStore';
import type { LiveExtensionMessage } from './types/messages';
import { vscode } from './vscode-api';

/**
 * Root app component for neko-live webview.
 * Layout: avatar viewport fills available space, tracking panel at bottom.
 * Switches between 3D (VRM) and 2D (puppet) viewports based on avatarType.
 */
export function App() {
  const {
    avatarType,
    applyTrackingData,
    setAvatarUrl,
    setIsTracking,
    setPuppetParameters,
    applyPuppetDelta,
    setRecordingState,
    setRecordingElapsed,
    setLastRecordingPath,
    setAvatarLoaded,
  } = useLiveStore();

  // Message bridge: Extension Host → Webview
  useEffect(() => {
    const handler = (event: MessageEvent<LiveExtensionMessage>) => {
      const msg = event.data;

      switch (msg.type) {
        case 'vmcTrackingData':
          applyTrackingData(msg.data);
          break;

        case 'avatarSelected':
          setAvatarUrl(msg.uri, msg.avatarType);
          if (msg.avatarType === 'puppet') {
            setAvatarLoaded(true);
          }
          break;

        case 'puppetLoaded':
          setPuppetParameters(msg.parameters);
          break;

        case 'puppetDelta':
          applyPuppetDelta(msg.delta);
          break;

        case 'trackingStatus':
          setIsTracking(msg.active);
          break;

        case 'recordingStarted':
          setRecordingState('recording');
          setRecordingElapsed(0);
          break;

        case 'recordingStopped':
          setRecordingState('idle');
          setLastRecordingPath(msg.filePath);
          break;

        case 'recordingProgress':
          setRecordingElapsed(msg.elapsedMs);
          break;

        case 'enginePort':
          break;

        default:
          break;
      }
    };

    window.addEventListener('message', handler);
    vscode.postMessage({ type: 'ready' });

    return () => window.removeEventListener('message', handler);
  }, [
    applyTrackingData,
    setAvatarUrl,
    setIsTracking,
    setPuppetParameters,
    applyPuppetDelta,
    setRecordingState,
    setRecordingElapsed,
    setLastRecordingPath,
    setAvatarLoaded,
  ]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      {/* Avatar viewport — switches based on model type */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {avatarType === 'puppet' ? <PuppetViewer /> : <Viewport3D />}
      </div>

      {/* Control panel at bottom */}
      <TrackingPanel />
    </div>
  );
}
