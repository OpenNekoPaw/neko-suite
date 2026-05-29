/**
 * AudioEditor - Main audio editor component
 *
 * Creative workbench layout: left rail | main audio surface | side panel.
 * Transport remains part of the main audio surface.
 */

import { useCallback, useEffect, useRef } from 'react';
import {
  isKeyboardFocusMessage,
  useFocusedWebviewRoot,
  useReportWebviewKeyboardFocus,
} from '@neko/ui/keyboard';
import { useExtensionMessage, useVscodeReady, postMessage } from '../shared/useVscodeMessage';
import { useAudioStore } from '../stores/audioStore';
import { useAudioProjectStore } from '../stores/audioProjectStore';
import { useAudioPlayback } from '../hooks/useAudioPlayback';
import { useDragDrop } from '../hooks/useDragDrop';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { EditableWaveform } from '../components/EditableWaveform';
import { TransportBar } from '../components/TransportBar';
import { Toolbar } from '../components/Toolbar';
import { SidePanel } from '../components/SidePanel';
import { SpectrumAnalyzer } from '../components/SpectrumAnalyzer';
import { LoudnessPanel } from '../components/LoudnessPanel';
import { EmptyProject } from '../components/EmptyProject';
import { AudioTimeline } from '../components/Timeline/AudioTimeline';
import { MixerPanel } from '../components/MixerPanel';
import { Toast } from '../components/Toast';
import {
  isAudioUserCommand,
  readAudioCommandMessage,
  type AudioCommandMessage,
  type ExtensionMessage,
} from '../shared/types';
import { handleAudioResponseMessage } from '../shared/audioProtocolHandler';
import { t } from '../i18n';
import { CreativeWorkbenchShell } from '@neko/ui/workbench';
import '@neko/ui/keyboard/focus.css';
import '../styles/editor.css';

export function AudioEditor() {
  useVscodeReady();

  const {
    isLoading,
    error,
    audioInfo,
    projectMode,
    showSpectrum,
    activeSidePanel,
    openSidePanel,
    closeSidePanel,
    setFileInfo,
    setWaveform,
    setStreamInfo,
    setSilenceRegions,
    setProjectMode,
    setMarkers,
    setLoudness,
    showToast,
  } = useAudioStore();
  const { togglePlay, seek, stop, audioClientRef } = useAudioPlayback();
  const isSidePanelVisible = activeSidePanel !== null;

  const handleToggleSidePanel = useCallback(() => {
    if (activeSidePanel) {
      closeSidePanel();
      return;
    }
    openSidePanel('effects');
  }, [activeSidePanel, closeSidePanel, openSidePanel]);

  // Drag-drop support for importing audio into project
  const editorRef = useRef<HTMLDivElement>(null);
  const { isKeyboardFocused, isKeyboardFocusedRef, setKeyboardFocused } = useFocusedWebviewRoot(
    editorRef,
    false,
  );
  useReportWebviewKeyboardFocus(editorRef, { postMessage });
  const { isDragOver, handleDragOver, handleDragLeave, handleDrop } = useDragDrop(editorRef);

  useKeyboardShortcuts({ onTogglePlay: togglePlay, onStop: stop, isKeyboardFocusedRef });

  // v2 multi-track project state (must be before any early returns)
  const isV2 = useAudioProjectStore((s) => s.audioProjectData !== null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      useAudioProjectStore.getState().expireAiOperationHighlights();
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Handle messages from Extension Host
  const handleMessage = useCallback(
    (message: ExtensionMessage) => {
      if (isKeyboardFocusMessage(message)) {
        setKeyboardFocused(message.focused);
        return;
      }

      if (message.type.startsWith('audio:')) {
        const handled = handleAudioResponseMessage(
          message as Extract<ExtensionMessage, { type: `audio:${string}` }>,
          {
            setFileInfo,
            setWaveform,
            setStreamInfo,
            setSilenceRegions,
            setLoudness,
            showToast,
          },
        );
        if (handled) return;
      }

      switch (message.type) {
        case 'project:init': {
          const { projectData, waveforms } = message.payload;
          setProjectMode(true);
          setFileInfo(null, projectData.name ?? '', null);
          useAudioProjectStore.getState().initProject(projectData, waveforms);
          if (projectData.markers) {
            setMarkers(projectData.markers);
          }
          break;
        }

        case 'project:sync':
          setProjectMode(true);
          setFileInfo(null, message.projectData.name ?? '', null);
          useAudioProjectStore.getState().syncProject(message.projectData, message.operation);
          setMarkers(message.projectData.markers);
          if (message.warnings?.length) {
            showToast(message.warnings.join('\n'), 'info');
          }
          break;

        case 'project:importAudioResult':
          if (!message.payload.success && message.payload.error) {
            showToast(t('audio.import.failed', { error: message.payload.error }), 'error');
          }
          break;

        case 'save':
        case 'saveAs':
        case 'revert':
          break;

        case 'command': {
          if (!isKeyboardFocusedRef.current) {
            break;
          }
          if (!isAudioUserCommand(message.command)) {
            break;
          }
          handleUserCommand(message);
          break;
        }

        case 'keyboardAction': {
          if (!isKeyboardFocusedRef.current) {
            break;
          }
          if (!isAudioUserCommand(message.action)) {
            break;
          }
          handleUserCommand(message);
          break;
        }
      }
    },
    [
      setFileInfo,
      setWaveform,
      setStreamInfo,
      setSilenceRegions,
      setProjectMode,
      setMarkers,
      setLoudness,
      setKeyboardFocused,
      isKeyboardFocusedRef,
      showToast,
    ],
  );

  useExtensionMessage(handleMessage);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-[var(--editor-bg)] text-[var(--editor-fg)]">
        <div>{t('audio.loading')}</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-[var(--editor-bg)] text-red-400">
        <div>{error}</div>
      </div>
    );
  }

  // Single-file mode with no audio — show import prompt
  // .nka projects always show the timeline (even when empty)
  if (!isV2 && projectMode && !audioInfo) {
    return <EmptyProject />;
  }

  return (
    <div
      ref={editorRef}
      className="flex flex-col w-full h-full bg-[var(--editor-bg)] text-[var(--editor-fg)] overflow-hidden relative"
      data-neko-keyboard-focused={isKeyboardFocused ? 'true' : 'false'}
      onDragOver={projectMode ? handleDragOver : undefined}
      onDragLeave={projectMode ? handleDragLeave : undefined}
      onDrop={projectMode ? handleDrop : undefined}
    >
      <CreativeWorkbenchShell
        className="audio-workbench-shell"
        bodyClassName="audio-workbench-body"
        mainClassName="audio-main-panel"
        mainKind="waveform-timeline"
        leftRail={
          <Toolbar
            sidePanelVisible={isSidePanelVisible}
            onToggleSidePanel={handleToggleSidePanel}
          />
        }
        main={
          <>
            <TransportBar onTogglePlay={togglePlay} onSeek={seek} onStop={stop} />

            <div className="audio-main-surface">
              <div className="audio-main-content">
                {isV2 ? (
                  <div className="neko-project-workstation">
                    <AudioTimeline isKeyboardFocusedRef={isKeyboardFocusedRef} />
                    <MixerPanel />
                  </div>
                ) : (
                  <>
                    <EditableWaveform onSeek={seek} />
                    <SpectrumAnalyzer audioClientRef={audioClientRef} enabled={showSpectrum} />
                    <LoudnessPanel />
                  </>
                )}
              </div>
            </div>
          </>
        }
        rightPanel={activeSidePanel ? <SidePanel /> : undefined}
      />

      {isDragOver && projectMode && (
        <div className="absolute inset-0 z-50 flex items-center justify-center neko-drop-overlay-bg">
          <div className="text-lg font-medium text-[var(--editor-fg)]">
            {t('audio.import.drop')}
          </div>
        </div>
      )}

      <Toast />
    </div>
  );
}

function handleUserCommand(message: AudioCommandMessage): void {
  const cmd = readAudioCommandMessage(message);
  const store = useAudioStore.getState();

  switch (cmd) {
    case 'toggleRecording':
      store.toggleSidePanel('recording');
      break;
    case 'toggleSpectrum':
      store.toggleSpectrum();
      break;
    case 'toggleExport':
      store.toggleSidePanel('export');
      break;
    case 'denoise':
      postMessage({
        type: 'audio:effects',
        effects: [
          {
            id: crypto.randomUUID(),
            effectType: 'noise-gate',
            enabled: true,
            params: { threshold: -40, attack: 1, hold: 50, release: 100 },
          },
        ],
      });
      break;
    case 'normalize':
      postMessage({
        type: 'audio:effects',
        effects: [
          {
            id: crypto.randomUUID(),
            effectType: 'gain',
            enabled: true,
            params: { gainDb: 0 },
          },
        ],
      });
      break;
    case 'trim': {
      const sel = store.selection;
      if (sel) {
        postMessage({
          type: 'audio:trim',
          startTime: sel.start,
          endTime: sel.end,
          mode: store.projectMode ? 'project' : 'single-file',
        });
      }
      break;
    }
    case 'fadeIn':
      postMessage({
        type: 'audio:effects',
        effects: [
          {
            id: crypto.randomUUID(),
            effectType: 'gain',
            enabled: true,
            params: { gainDb: 0, automation: 'fadeIn', duration: 1.0 },
          },
        ],
      });
      break;
    case 'fadeOut':
      postMessage({
        type: 'audio:effects',
        effects: [
          {
            id: crypto.randomUUID(),
            effectType: 'gain',
            enabled: true,
            params: { gainDb: 0, automation: 'fadeOut', duration: 1.0 },
          },
        ],
      });
      break;
  }
}
