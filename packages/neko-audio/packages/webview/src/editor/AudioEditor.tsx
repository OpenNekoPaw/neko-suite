/**
 * AudioEditor - Main audio editor component
 *
 * Orchestrates webview message handling, playback, and renders the editor layout.
 * Phase B: waveform display + playback + controls + keyboard shortcuts.
 */

import { useCallback, useRef } from 'react';
import { useExtensionMessage, useVscodeReady, postMessage } from '../shared/useVscodeMessage';
import { useAudioStore } from '../stores/audioStore';
import { useAudioPlayback } from '../hooks/useAudioPlayback';
import { useEffectsChain } from '../hooks/useEffectsChain';
import type { AudioEffectInstance } from '../types/audioEffects';
import { EditableWaveform } from '../components/EditableWaveform';
import { AudioControls } from '../components/AudioControls';
import { TransportBar } from '../components/TransportBar';
import { SpectrumAnalyzer } from '../components/SpectrumAnalyzer';
import { EffectsPanel } from '../components/EffectsPanel';
import { RecordingPanel } from '../components/RecordingPanel';
import { ExportPanel } from '../components/ExportPanel';
import { LoudnessPanel } from '../components/LoudnessPanel';
import { Toast } from '../components/Toast';
import type { ExtensionMessage } from '../shared/types';
import { t } from '../i18n';
import '../styles/editor.css';

export function AudioEditor() {
  useVscodeReady();

  const {
    isLoading,
    error,
    showSpectrum,
    showEffects,
    showRecording,
    showExport,
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

  // Keep ref to latest effects/markers for serialization in save handler
  const effectsRef = useRef(effectsChain.effects);
  effectsRef.current = effectsChain.effects;

  const markersRef = useRef(useAudioStore.getState().markers);
  // Sync markers ref on render
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

        case 'project:init':
          // .nka project initialization — restore saved state
          setFileInfo(
            message.payload.filePath,
            message.payload.fileName,
            message.payload.audioInfo,
          );
          setProjectMode(true);
          if (message.payload.project.markers) {
            setMarkers(message.payload.project.markers);
          }
          if (message.payload.project.effectsChain) {
            effectsChain.replaceAll(
              message.payload.project.effectsChain as unknown as AudioEffectInstance[],
            );
          }
          break;

        case 'save':
        case 'saveAs': {
          // Extension requesting project data for save
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
          // Extension will re-send project:init after revert
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

        case 'command': {
          const cmd = (message as { command: string }).command;
          const store = useAudioStore.getState();
          switch (cmd) {
            case 'toggleRecording':
              store.toggleRecording();
              break;
            case 'toggleSpectrum':
              store.toggleSpectrum();
              break;
            case 'toggleExport':
              store.toggleExport();
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

  return (
    <div className="audio-editor">
      <TransportBar />

      <div className="audio-editor__main">
        <EditableWaveform onSeek={seek} />
        <SpectrumAnalyzer audioClientRef={audioClientRef} enabled={showSpectrum} />
      </div>

      <LoudnessPanel />

      {showEffects && <EffectsPanel chain={effectsChain} />}
      {showRecording && <RecordingPanel />}
      {showExport && <ExportPanel />}

      <AudioControls onTogglePlay={togglePlay} onSeek={seek} onStop={stop} />

      <Toast />
    </div>
  );
}
