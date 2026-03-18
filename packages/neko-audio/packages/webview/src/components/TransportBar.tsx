/**
 * TransportBar - Top toolbar with file info and action buttons
 *
 * Displays file metadata and provides quick access to
 * editing actions, spectrum toggle, effects panel, and recording.
 */

import { useCallback } from 'react';
import { useAudioStore } from '../stores/audioStore';
import { postMessage } from '../shared/useVscodeMessage';
import { t } from '../i18n';

export function TransportBar() {
  const {
    fileName,
    audioInfo,
    selection,
    showSpectrum,
    showEffects,
    showRecording,
    showExport,
    toggleSpectrum,
    toggleEffects,
    toggleRecording,
    toggleExport,
  } = useAudioStore();

  const handleTrim = useCallback(() => {
    if (!selection) return;
    postMessage({
      type: 'editor:trim',
      startTime: selection.start,
      endTime: selection.end,
    });
  }, [selection]);

  const handleAnalyzeLoudness = useCallback(() => {
    postMessage({ type: 'editor:analyzeLoudness' });
  }, []);

  const handleDetectSilence = useCallback(() => {
    postMessage({ type: 'editor:detectSilence' });
  }, []);

  const handleDenoise = useCallback(() => {
    postMessage({ type: 'editor:denoise' });
  }, []);

  const handleNormalize = useCallback(() => {
    postMessage({ type: 'editor:normalize' });
  }, []);

  return (
    <div className="audio-editor__toolbar">
      {/* File name */}
      <span className="file-info" title={fileName ?? ''}>
        {fileName}
      </span>

      {/* Format info */}
      {audioInfo && (
        <>
          <span className="divider" />
          <span className="file-info">
            {audioInfo.codec.toUpperCase()} · {(audioInfo.sampleRate / 1000).toFixed(1)}kHz ·{' '}
            {audioInfo.channels === 1
              ? 'Mono'
              : audioInfo.channels === 2
                ? 'Stereo'
                : `${audioInfo.channels}ch`}
            {audioInfo.bitrate ? ` · ${Math.round(audioInfo.bitrate / 1000)}kbps` : ''}
          </span>
        </>
      )}

      <span style={{ flex: 1 }} />

      {/* Edit buttons (visible when selection exists) */}
      {selection && (
        <>
          <button className="btn" onClick={handleTrim} title={t('audio.edit.trim')}>
            {t('audio.edit.trim')}
          </button>
          <span className="divider" />
        </>
      )}

      {/* Analysis */}
      <button
        className="btn btn--icon"
        onClick={handleAnalyzeLoudness}
        title={t('audio.analysis.loudness')}
      >
        📏
      </button>

      <button
        className="btn btn--icon"
        onClick={handleDetectSilence}
        title={t('audio.analysis.silence')}
      >
        🔇
      </button>

      <button className="btn btn--icon" onClick={handleDenoise} title={t('audio.analysis.denoise')}>
        🧹
      </button>

      <button
        className="btn btn--icon"
        onClick={handleNormalize}
        title={t('audio.analysis.normalize')}
      >
        📐
      </button>

      <span className="divider" />

      {/* Panel toggles */}
      <button
        className={`btn btn--icon ${showSpectrum ? 'btn--active' : ''}`}
        onClick={toggleSpectrum}
        title={t('audio.spectrum.toggle')}
      >
        📊
      </button>

      <button
        className={`btn btn--icon ${showEffects ? 'btn--active' : ''}`}
        onClick={toggleEffects}
        title={t('audio.effects.title')}
      >
        🎛
      </button>

      <button
        className={`btn btn--icon ${showRecording ? 'btn--active' : ''}`}
        onClick={toggleRecording}
        title={t('audio.recording.title')}
      >
        🎙
      </button>

      <button
        className={`btn btn--icon ${showExport ? 'btn--active' : ''}`}
        onClick={toggleExport}
        title={t('audio.export.toggle')}
      >
        💾
      </button>
    </div>
  );
}
