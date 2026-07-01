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
import { MasterLoudnessStrip } from './MasterLoudnessStrip';
import { AudioButton, AudioSelect } from './shared/AudioUiPrimitives';
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
      <MasterLoudnessStrip variant="export" />

      {/* Format */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] opacity-70">{t('audio.export.format')}</label>
        <AudioSelect
          className="w-full"
          label={t('audio.export.format')}
          value={format}
          onChange={setFormat}
          options={FORMATS.map((f) => ({ value: f.value, label: f.label }))}
        />
      </div>

      {/* Sample Rate */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] opacity-70">{t('audio.export.sampleRate')}</label>
        <AudioSelect
          className="w-full"
          label={t('audio.export.sampleRate')}
          value={sampleRate}
          onChange={setSampleRate}
          options={SAMPLE_RATES.map((r) => ({
            value: r,
            label: r >= 1000 ? `${r / 1000}kHz` : `${r}Hz`,
          }))}
        />
      </div>

      {/* Bitrate (lossy only) */}
      {isLossy && (
        <div className="flex flex-col gap-1">
          <label className="text-[10px] opacity-70">{t('audio.export.bitrate')}</label>
          <AudioSelect
            className="w-full"
            label={t('audio.export.bitrate')}
            value={bitrate}
            onChange={setBitrate}
            options={BITRATES.map((b) => ({ value: b, label: `${b} kbps` }))}
          />
        </div>
      )}

      {/* Channels */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] opacity-70">{t('audio.export.channels')}</label>
        <AudioSelect
          className="w-full"
          label={t('audio.export.channels')}
          value={channels}
          onChange={setChannels}
          options={[
            { value: 1, label: t('audio.export.mono') },
            { value: 2, label: t('audio.export.stereo') },
          ]}
        />
      </div>

      {/* Export button */}
      <AudioButton variant="primary" onClick={handleExport} className="mt-1">
        {t('audio.export.export')}
      </AudioButton>
    </div>
  );
}
