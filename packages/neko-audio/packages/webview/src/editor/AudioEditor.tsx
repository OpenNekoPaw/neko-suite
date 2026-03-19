/**
 * AudioEditor - Main audio editor component
 *
 * 3-column layout: Toolbar | Center (waveform + spectrum + loudness) | SidePanel
 * Unified TransportBar at top with playback controls.
 */

import { useCallback, useRef } from 'react';
import { useExtensionMessage, useVscodeReady, postMessage } from '../shared/useVscodeMessage';
import { useAudioStore } from '../stores/audioStore';
import { useAudioPlayback } from '../hooks/useAudioPlayback';
import { useEffectsChain } from '../hooks/useEffectsChain';
import { useDragDrop } from '../hooks/useDragDrop';
import type { AudioEffectInstance } from '../types/audioEffects';
import { EditableWaveform } from '../components/EditableWaveform';
import { TransportBar } from '../components/TransportBar';
import { Toolbar } from '../components/Toolbar';
import { SidePanel } from '../components/SidePanel';
import { SpectrumAnalyzer } from '../components/SpectrumAnalyzer';
import { LoudnessPanel } from '../components/LoudnessPanel';
import { EmptyProject } from '../components/EmptyProject';
import { Toast } from '../components/Toast';
import type { ExtensionMessage } from '../shared/types';
import { t } from '../i18n';
import '../styles/editor.css';

export function AudioEditor() {
  useVscodeReady();

  const {
    isLoading,
    error,
    audioInfo,
    projectMode,
    showSpectrum,
    setFileInfo,
    setWaveform,
    setStreamInfo,
    setError,
    setSilenceRegions,
    setProjectMode,
    setMarkers,
    setLoudness,
    showToast,
  } = useAudioStore();

  const { togglePlay, seek, stop, audioClientRef } = useAudioPlayback();
  const effectsChain = useEffectsChain();

  // Drag-drop support for importing audio into project
  const editorRef = useRef<HTMLDivElement>(null);
  const { isDragOver, handleDragOver, handleDragLeave, handleDrop } = useDragDrop(editorRef);

  // Keep ref to latest effects/markers for serialization in save handler
  const effectsRef = useRef(effectsChain.effects);
  effectsRef.current = effectsChain.effects;

  const markersRef = useRef(useAudioStore.getState().markers);
  markersRef.current = useAudioStore.getState().markers;

  // Handle messages from Extension Host
  const handleMessage = useCallback(
    (message: ExtensionMessage) => {
      switch (message.type) {
        case 'editor:init':
          setFileInfo(
            message.payload.filePath,
            message.payload.fileName,
            message.payload.audioInfo,
          );
          break;

        case 'project:init': {
          const payload = message.payload;
          // v2 format: has projectData
          if ('projectData' in payload) {
            const { projectData, waveforms } = payload;
            setProjectMode(true);
            setFileInfo(null, projectData.name, null);
            // Initialize project store with v2 data
            const { useAudioProjectStore } = require('../stores/audioProjectStore');
            useAudioProjectStore.getState().initProject(projectData as any, waveforms);
            if (projectData.markers) {
              setMarkers(projectData.markers as any);
            }
          } else {
            // v1 format (legacy)
            setFileInfo(
              (payload as any).filePath,
              (payload as any).fileName,
              (payload as any).audioInfo,
            );
            setProjectMode(true);
            if ((payload as any).project?.markers) {
              setMarkers((payload as any).project.markers);
            }
            if ((payload as any).project?.effectsChain) {
              effectsChain.replaceAll(
                (payload as any).project.effectsChain as unknown as AudioEffectInstance[],
              );
            }
          }
          break;
        }

        case 'save':
        case 'saveAs': {
          const store = useAudioStore.getState();
          const saveData = {
            effectsChain: effectsRef.current.map((e) => ({
              id: e.id,
              type: e.type,
              name: e.name,
              enabled: e.enabled,
              params: e.params as unknown as Record<string, unknown>,
            })),
            markers: store.markers,
          };
          postMessage({
            type: 'project:saveData',
            data: saveData,
            ...(message.type === 'saveAs' ? { path: (message as { path?: string }).path } : {}),
          });
          break;
        }

        case 'revert':
          break;

        case 'editor:waveform':
          setWaveform(message.payload);
          break;

        case 'editor:streamReady':
          setStreamInfo(message.payload.streamId, message.payload.streamUrl);
          break;

        case 'editor:silenceResult':
          setSilenceRegions(message.payload.regions);
          break;

        case 'editor:trimResult':
          if (message.payload.success) {
            showToast(t('audio.toast.trimSuccess'), 'success');
          } else {
            showToast(t('audio.toast.trimError', { error: message.payload.error ?? '' }), 'error');
          }
          break;

        case 'editor:effectsResult':
          if (message.payload.success) {
            showToast(t('audio.toast.effectsSuccess'), 'success');
          } else {
            showToast(
              t('audio.toast.effectsError', { error: message.payload.error ?? '' }),
              'error',
            );
          }
          break;

        case 'editor:loudnessResult':
          setLoudness(message.payload);
          break;

        case 'editor:recordingSaved':
          if (message.payload.success) {
            showToast(
              t('audio.toast.recordingSaved', { path: message.payload.path ?? '' }),
              'success',
            );
          } else {
            showToast(
              t('audio.toast.recordingError', { error: message.payload.error ?? '' }),
              'error',
            );
          }
          break;

        case 'editor:inputDevices':
        case 'editor:recordStartResult':
        case 'editor:recordStopResult':
          break;

        case 'command': {
          const cmd = (message as { command: string }).command;
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
              postMessage({ type: 'editor:denoise' });
              break;
            case 'normalize':
              postMessage({ type: 'editor:normalize' });
              break;
            case 'trim': {
              const sel = store.selection;
              if (sel) {
                postMessage({ type: 'editor:trim', startTime: sel.start, endTime: sel.end });
              }
              break;
            }
            case 'fadeIn':
              postMessage({
                type: 'editor:applyEffects',
                effects: [{ type: 'fade-in', params: { duration: 1.0 } }],
              });
              break;
            case 'fadeOut':
              postMessage({
                type: 'editor:applyEffects',
                effects: [{ type: 'fade-out', params: { duration: 1.0 } }],
              });
              break;
          }
          break;
        }
      }
    },
    [
      setFileInfo,
      setWaveform,
      setStreamInfo,
      setError,
      setSilenceRegions,
      setProjectMode,
      setMarkers,
      setLoudness,
      showToast,
      effectsChain,
    ],
  );

  useExtensionMessage(handleMessage);

  // Loading state
  if (isLoading) {
    return (
      <div className="audio-editor__loading">
        <div>{t('audio.loading')}</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="audio-editor__error">
        <div>{error}</div>
      </div>
    );
  }

  // Empty project — no audio source yet
  if (projectMode && !audioInfo) {
    return <EmptyProject />;
  }

  return (
    <div
      ref={editorRef}
      className="audio-editor"
      onDragOver={projectMode ? handleDragOver : undefined}
      onDragLeave={projectMode ? handleDragLeave : undefined}
      onDrop={projectMode ? handleDrop : undefined}
    >
      <TransportBar onTogglePlay={togglePlay} onSeek={seek} onStop={stop} />

      <div className="audio-editor__body">
        <Toolbar />

        <div className="audio-editor__center">
          <EditableWaveform onSeek={seek} />
          <SpectrumAnalyzer audioClientRef={audioClientRef} enabled={showSpectrum} />
          <LoudnessPanel />
        </div>

        <SidePanel />
      </div>

      {isDragOver && projectMode && (
        <div className="audio-editor__drop-overlay">
          <div className="audio-editor__drop-overlay-text">{t('audio.import.drop')}</div>
        </div>
      )}

      <Toast />
    </div>
  );
}
