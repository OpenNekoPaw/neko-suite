/**
 * ExportPanel - Audio export configuration UI
 *
 * Allows users to select output format, sample rate, bitrate, and channels
 * before exporting audio. Sends audio:export intent messages to extension.
 */

import { useState, useCallback } from 'react';
import type { AudioExportFormat } from '@neko/shared';
import { useAudioStore } from '../stores/audioStore';
import { postMessage } from '../shared/useVscodeMessage';
import { MacButton } from '@neko/shared/components';
import { t } from '../i18n';

// =============================================================================
// Format definitions
// =============================================================================

interface FormatOption {
  value: AudioExportFormat;
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

const selectClass =
  'w-full text-[11px] px-2 py-1 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded';

// =============================================================================
// ExportPanel
// =============================================================================

export function ExportPanel() {
  const { audioInfo, projectMode } = useAudioStore();

  const [format, setFormat] = useState<AudioExportFormat>('wav');
  const [sampleRate, setSampleRate] = useState(audioInfo?.sampleRate ?? 44100);
  const [bitrate, setBitrate] = useState(192);
  const [channels, setChannels] = useState(audioInfo?.channels ?? 2);

  const selectedFormat = FORMATS.find((f) => f.value === format);
  const isLossy = selectedFormat?.lossy ?? false;

  const handleExport = useCallback(() => {
    postMessage({
      type: 'audio:export',
      mode: projectMode ? 'project' : 'single-file',
      format,
      sampleRate,
      ...(isLossy ? { bitrate: bitrate * 1000 } : {}),
      channels,
    });
  }, [format, projectMode, sampleRate, bitrate, channels, isLossy]);

  return (
    <div className="flex flex-col gap-2 p-2">
      {/* Format */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] opacity-70">{t('audio.export.format')}</label>
        <select
          className={selectClass}
          value={format}
          onChange={(e) => setFormat(e.target.value as AudioExportFormat)}
        >
          {FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {/* Sample Rate */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] opacity-70">{t('audio.export.sampleRate')}</label>
        <select
          className={selectClass}
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
        <div className="flex flex-col gap-1">
          <label className="text-[10px] opacity-70">{t('audio.export.bitrate')}</label>
          <select
            className={selectClass}
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
      <div className="flex flex-col gap-1">
        <label className="text-[10px] opacity-70">{t('audio.export.channels')}</label>
        <select
          className={selectClass}
          value={channels}
          onChange={(e) => setChannels(Number(e.target.value))}
        >
          <option value={1}>{t('audio.export.mono')}</option>
          <option value={2}>{t('audio.export.stereo')}</option>
        </select>
      </div>

      {/* Export button */}
      <MacButton variant="primary" size="sm" onClick={handleExport} className="mt-1">
        {t('audio.export.export')}
      </MacButton>
    </div>
  );
}
