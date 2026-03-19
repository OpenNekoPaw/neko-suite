import type { MessageBundle } from '@neko/shared';

const audio: MessageBundle = {
  // Loading & errors
  'audio.loading': 'Loading audio...',
  'audio.error.load': 'Failed to load audio file',
  'audio.error.engine': 'Audio engine not available',
  'audio.error.stream': 'Failed to start audio stream',

  // File info
  'audio.info.format': '{codec} · {sampleRate}Hz · {channels}ch',
  'audio.info.duration': 'Duration: {duration}',

  // Transport controls
  'audio.controls.play': 'Play',
  'audio.controls.pause': 'Pause',
  'audio.controls.stop': 'Stop',
  'audio.controls.volume': 'Volume',
  'audio.controls.mute': 'Mute',
  'audio.controls.speed': 'Speed',
  'audio.controls.loop': 'Loop',

  // Waveform
  'audio.waveform.loading': 'Generating waveform...',
  'audio.waveform.selection': 'Selection: {start} - {end}',
  'audio.waveform.noSelection': 'No selection',

  // Editing
  'audio.edit.trim': 'Trim',
  'audio.edit.fadeIn': 'Fade In',
  'audio.edit.fadeOut': 'Fade Out',
  'audio.edit.selectAll': 'Select All',
  'audio.edit.clearSelection': 'Clear Selection',
  'audio.edit.trimSuccess': 'Audio trimmed successfully',
  'audio.edit.trimError': 'Failed to trim audio: {error}',

  // Spectrum
  'audio.spectrum.title': 'Spectrum Analyzer',
  'audio.spectrum.toggle': 'Toggle Spectrum',

  // Effects
  'audio.effects.title': 'Effects',
  'audio.effects.add': 'Add Effect',
  'audio.effects.remove': 'Remove',
  'audio.effects.apply': 'Apply Effects',
  'audio.effects.bypass': 'Bypass',
  'audio.effects.noEffects': 'No effects added',
  'audio.effects.clear': 'Clear All',

  // Empty project
  'audio.import.empty': 'No audio source. Import a file to start editing.',
  'audio.import.drop': 'Drop audio file here',
  'audio.import.button': 'Select Audio File',
  'audio.import.failed': 'Failed to import audio: {error}',

  // Recording
  'audio.recording.title': 'Recording',
  'audio.recording.start': 'Start Recording',
  'audio.recording.stop': 'Stop Recording',
  'audio.recording.save': 'Save Recording',
  'audio.recording.device': 'Input Device',
  'audio.recording.level': 'Level',
  'audio.recording.duration': 'Duration: {duration}',

  // Properties
  'audio.properties.title': 'Properties',
  'audio.properties.volume': 'Volume',
  'audio.properties.pan': 'Pan',
  'audio.properties.gain': 'Gain',

  // Analysis
  'audio.analysis.loudness': 'Loudness Analysis',
  'audio.analysis.silence': 'Silence Detection',
  'audio.analysis.denoise': 'AI Denoise',
  'audio.analysis.normalize': 'Normalize',
  'audio.analysis.integrated': 'Integrated',
  'audio.analysis.truePeak': 'True Peak',
  'audio.analysis.range': 'Loudness Range',
  'audio.analysis.noData': 'Click 📏 to analyze loudness',

  // Toast
  'audio.toast.trimSuccess': 'Trim complete',
  'audio.toast.trimError': 'Trim failed: {error}',
  'audio.toast.effectsSuccess': 'Effects applied',
  'audio.toast.effectsError': 'Effects failed: {error}',
  'audio.toast.recordingSaved': 'Recording saved: {path}',
  'audio.toast.recordingError': 'Save recording failed: {error}',
  'audio.toast.denoiseStarted': 'Denoise processing...',
  'audio.toast.normalizeStarted': 'Normalizing...',
  'audio.toast.exportStarted': 'Exporting...',

  // Export
  'audio.export.title': 'Export As',
  'audio.export.format': 'Format',
  'audio.export.quality': 'Quality',
  'audio.export.sampleRate': 'Sample Rate',
  'audio.export.bitrate': 'Bitrate',
  'audio.export.channels': 'Channels',
  'audio.export.mono': 'Mono',
  'audio.export.stereo': 'Stereo',
  'audio.export.export': 'Export',
  'audio.export.toggle': 'Export As...',
};

export const bundles: Record<string, MessageBundle> = { audio };
