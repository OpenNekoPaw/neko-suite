import { useEffect } from 'react';
import { Viewport3D } from './components/Viewport3D';
import { TrackingPanel } from './components/TrackingPanel';
import { useLiveStore } from './stores/liveStore';
import type { LiveExtensionMessage } from './types/messages';
import { vscode } from './vscode-api';

/**
 * Root app component for neko-live webview.
 * Layout: 3D viewport fills available space, tracking panel at bottom.
 */
export function App() {
  const { applyTrackingData, setAvatarUrl, setIsTracking } = useLiveStore();

  // Message bridge: Extension Host → Webview
  useEffect(() => {
    const handler = (event: MessageEvent<LiveExtensionMessage>) => {
      const msg = event.data;

      switch (msg.type) {
        case 'vmcTrackingData':
          applyTrackingData(msg.data);
          break;

        case 'avatarSelected':
          setAvatarUrl(msg.uri);
          break;

        case 'trackingStatus':
          setIsTracking(msg.active);
          break;

        case 'enginePort':
          // Reserved for future P5.1.2 camera integration
          break;

        default:
          break;
      }
    };

    window.addEventListener('message', handler);

    // Signal ready to Extension Host
    vscode.postMessage({ type: 'ready' });

    return () => window.removeEventListener('message', handler);
  }, [applyTrackingData, setAvatarUrl, setIsTracking]);

  return (
    <div className="flex flex-col w-full h-full">
      {/* 3D viewport takes remaining space */}
      <div className="flex-1 min-h-0">
        <Viewport3D />
      </div>

      {/* Control panel at bottom */}
      <TrackingPanel />
    </div>
  );
}
