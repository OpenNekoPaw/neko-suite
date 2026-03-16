/**
 * PuppetApp - Root component for the puppet editor
 *
 * Manages Inochi2D puppet loading, parameter control, and animation playback.
 * Communicates with the extension host via postMessage protocol.
 */
import { useEffect, useCallback, useRef } from 'react';
import type { ExtensionToWebviewMessage } from './types';
import { usePuppetStore } from './stores/puppet-store';
import { AnimationPanel } from './components/AnimationPanel';
import { ParameterPanel } from './components/ParameterPanel';
import { PuppetNodeTree } from './components/PuppetNodeTree';
import { Inochi2DController } from './animation';
import { usePuppetPlayback } from './hooks/usePuppetPlayback';
import { i18nService, setLocale } from './i18n';
import { I18nProvider } from './i18n/I18nContext';
import type { SupportedLocale } from '@neko/shared';
import { EngineClient } from '@neko/neko-client';

// Acquire VSCode API once
const vscode = (window as unknown as { acquireVsCodeApi: () => VsCodeApi }).acquireVsCodeApi();

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

export function PuppetApp() {
  const controllerRef = useRef<Inochi2DController | null>(null);
  const { onPlay, onStop, onSeek } = usePuppetPlayback(controllerRef.current);
  const puppetLoaded = usePuppetStore((s) => s.puppetLoaded);

  // Notify extension that webview is ready
  useEffect(() => {
    vscode.postMessage({ type: 'ready' });
  }, []);

  // Handle messages from extension
  const handleMessage = useCallback((event: MessageEvent<ExtensionToWebviewMessage>) => {
    const msg = event.data;
    switch (msg.type) {
      case 'enginePort': {
        const engine = new EngineClient(msg.port);
        controllerRef.current = new Inochi2DController(engine);
        break;
      }

      case 'loadPuppet': {
        const ctrl = controllerRef.current;
        if (!ctrl) {
          // Request engine port first, then retry
          vscode.postMessage({ type: 'requestEnginePort' });
          break;
        }

        // Decode base64 → ArrayBuffer and load puppet
        const binaryStr = atob(msg.data);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }

        void ctrl.load(bytes.buffer).then(async (snapshot) => {
          const store = usePuppetStore.getState();
          store.setPuppetSnapshot(snapshot);
          store.setPuppetLoaded(true);

          // Load parameters and animations
          const params = await ctrl.getParameters();
          store.setPuppetParameters(params);

          const anims = await ctrl.getAnimations();
          store.setAnimations(anims);
        });
        break;
      }

      case 'setLocale': {
        setLocale(msg.locale as SupportedLocale);
        break;
      }

      default:
        break;
    }
  }, []);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  return (
    <I18nProvider service={i18nService}>
      <div className="flex flex-col h-screen w-screen overflow-hidden">
        <div className="flex flex-1 overflow-hidden">
          {/* Future: mesh rendering canvas goes here */}
          <div className="flex-1 flex items-center justify-center text-sm opacity-50">
            {puppetLoaded ? 'Puppet loaded — mesh rendering TODO' : 'Waiting for puppet data...'}
          </div>

          {/* Right side panels */}
          <div className="flex flex-col w-60 border-l border-[var(--sketch-border)] overflow-y-auto">
            {puppetLoaded && (
              <>
                <PuppetNodeTree />
                <ParameterPanel controller={controllerRef.current} />
                <AnimationPanel onPlay={onPlay} onStop={onStop} onSeek={onSeek} />
              </>
            )}
          </div>
        </div>
      </div>
    </I18nProvider>
  );
}
