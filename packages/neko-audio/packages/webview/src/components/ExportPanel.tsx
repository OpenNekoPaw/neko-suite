/**
 * ExportPanel - Audio export configuration UI
 *
 * Allows users to select output format, sample rate, bitrate, and channels
 * before exporting audio. Sends editor:exportAs message to extension.
 */

import { useState, useCallback } from 'react';
import { useAudioStore } from '../stores/audioStore';
import { postMessage } from '../shared/useVscodeMessage';
import { t } from '../i18n';

// =============================================================================
// Format definitions
// =============================================================================

interface FormatOption {
  value: string;
  label: string;
  lossy: boolean;
}

const FORMATS: FormatOption[] = [
  { value: 'wav', label: 'WAV (PCM)', lossy: false },
  { value: 'mp3', label: 'MP3', lossy: true },
  { value: 'aac', label: 'AAC', lossy: true },
  { value: 'flac', label: 'FLAC', lossy: false },
  { value: 'opus', label: 'Opus', lossy: true },
];

const SAMPLE_RATES = [8000, 16000, 22050, 44100, 48000, 96000];
const BITRATES = [96, 128, 192, 256, 320];

// =============================================================================
// ExportPanel
// =============================================================================

export function ExportPanel() {
  const { audioInfo } = useAudioStore();

  const [format, setFormat] = useState('wav');
  const [sampleRate, setSampleRate] = useState(audioInfo?.sampleRate ?? 44100);
  const [bitrate, setBitrate] = useState(192);
  const [channels, setChannels] = useState(audioInfo?.channels ?? 2);

  const selectedFormat = FORMATS.find((f) => f.value === format);
  const isLossy = selectedFormat?.lossy ?? false;

  const handleExport = useCallback(() => {
    postMessage({
      type: 'editor:exportAs',
      format,
      sampleRate,
      ...(isLossy ? { bitrate: bitrate * 1000 } : {}),
      channels,
    });
  }, [format, sampleRate, bitrate, channels, isLossy]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Format */}
      <div className="form-group">
        <label className="form-label">{t('audio.export.format')}</label>
        <select className="form-select" value={format} onChange={(e) => setFormat(e.target.value)}>
          {FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {/* Sample Rate */}
      <div className="form-group">
        <label className="form-label">{t('audio.export.sampleRate')}</label>
        <select
          className="form-select"
          value={sampleRate}
          onChange={(e) => setSampleRate(Number(e.target.value))}
        >
          {SAMPLE_RATES.map((r) => (
            <option key={r} value={r}>
              {r >= 1000 ? `${r / 1000}kHz` : `${r}Hz`}
            </option>
          ))}
        </select>
      </div>

      {/* Bitrate (lossy only) */}
      {isLossy && (
        <div className="form-group">
          <label className="form-label">{t('audio.export.bitrate')}</label>
          <select
            className="form-select"
            value={bitrate}
            onChange={(e) => setBitrate(Number(e.target.value))}
          >
            {BITRATES.map((b) => (
              <option key={b} value={b}>
                {b} kbps
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Channels */}
      <div className="form-group">
        <label className="form-label">{t('audio.export.channels')}</label>
        <select
          className="form-select"
          value={channels}
          onChange={(e) => setChannels(Number(e.target.value))}
        >
          <option value={1}>{t('audio.export.mono')}</option>
          <option value={2}>{t('audio.export.stereo')}</option>
        </select>
      </div>

      {/* Export button */}
      <button className="btn" onClick={handleExport}>
        {t('audio.export.export')}
      </button>
    </div>
  );
}
