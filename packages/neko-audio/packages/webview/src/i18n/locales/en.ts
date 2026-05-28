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
  'audio.controls.record': 'Record',
  'audio.controls.bpm': 'BPM',
  'audio.controls.zoom': 'Zoom',
  'audio.controls.solo': 'Solo',

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

  // Layout
  'audio.toolbar.leftRail': 'Audio editor toolbar',
  'audio.sidePanel.show': 'Show side panel',
  'audio.sidePanel.hide': 'Hide side panel',
  'audio.sidePanel.tabs': 'Side panel sections',

  // Effects
  'audio.effects.title': 'Effects',
  'audio.effects.add': 'Add Effect',
  'audio.effects.remove': 'Remove',
  'audio.effects.apply': 'Apply Effects',
  'audio.effects.bypass': 'Bypass',
  'audio.effects.noEffects': 'No effects added',
  'audio.effects.clear': 'Clear All',

  // Effect categories
  'audioEffects.category.dynamics': 'Dynamics',
  'audioEffects.category.filter': 'Filter',
  'audioEffects.category.spatial': 'Spatial',
  'audioEffects.category.modulation': 'Modulation',
  'audioEffects.category.utility': 'Utility',

  // Effect names
  'audioEffects.noiseReduction': 'Noise Reduction',
  'audioEffects.compressor': 'Compressor',
  'audioEffects.limiter': 'Limiter',
  'audioEffects.reverb': 'Reverb',
  'audioEffects.delay': 'Delay',
  'audioEffects.chorus': 'Chorus',
  'audioEffects.distortion': 'Distortion',
  'audioEffects.pitchShift': 'Pitch Shift',
  'audioEffects.timeStretch': 'Time Stretch',
  'audioEffects.highPass': 'High-Pass Filter',
  'audioEffects.lowPass': 'Low-Pass Filter',
  'audioEffects.bandPass': 'Band-Pass Filter',

  // Effect descriptions
  'audioEffects.noiseReduction.description': 'Reduce background noise',
  'audioEffects.compressor.description': 'Dynamic range compression',
  'audioEffects.limiter.description': 'Peak limiting',
  'audioEffects.reverb.description': 'Add reverberation',
  'audioEffects.delay.description': 'Echo and delay effect',
  'audioEffects.chorus.description': 'Chorus modulation',
  'audioEffects.distortion.description': 'Distortion effect',
  'audioEffects.pitchShift.description': 'Shift pitch up or down',
  'audioEffects.timeStretch.description': 'Stretch or compress time',
  'audioEffects.highPass.description': 'High-pass frequency filter',
  'audioEffects.lowPass.description': 'Low-pass frequency filter',
  'audioEffects.bandPass.description': 'Band-pass frequency filter',

  // Effect parameters
  'audioEffects.params.amount': 'Amount',
  'audioEffects.params.threshold': 'Threshold',
  'audioEffects.params.smoothing': 'Smoothing',
  'audioEffects.params.ratio': 'Ratio',
  'audioEffects.params.attack': 'Attack',
  'audioEffects.params.release': 'Release',
  'audioEffects.params.knee': 'Knee',
  'audioEffects.params.makeupGain': 'Makeup Gain',
  'audioEffects.params.ceiling': 'Ceiling',
  'audioEffects.params.type': 'Type',
  'audioEffects.params.roomSize': 'Room Size',
  'audioEffects.params.damping': 'Damping',
  'audioEffects.params.wetDry': 'Wet/Dry',
  'audioEffects.params.width': 'Width',
  'audioEffects.params.preDelay': 'Pre-Delay',
  'audioEffects.params.delayTime': 'Delay Time',
  'audioEffects.params.feedback': 'Feedback',
  'audioEffects.params.stereo': 'Stereo',
  'audioEffects.params.pingPong': 'Ping-Pong',
  'audioEffects.params.rate': 'Rate',
  'audioEffects.params.depth': 'Depth',
  'audioEffects.params.delay': 'Delay',
  'audioEffects.params.drive': 'Drive',
  'audioEffects.params.outputGain': 'Output Gain',
  'audioEffects.params.semitones': 'Semitones',
  'audioEffects.params.preserveFormants': 'Preserve Formants',
  'audioEffects.params.preservePitch': 'Preserve Pitch',
  'audioEffects.params.frequency': 'Frequency',
  'audioEffects.params.resonance': 'Resonance',
  'audioEffects.params.bandwidth': 'Bandwidth',
  'audioEffects.params.gain': 'Gain',

  // Reverb types
  'audioEffects.reverbType.room': 'Room',
  'audioEffects.reverbType.hall': 'Hall',
  'audioEffects.reverbType.plate': 'Plate',
  'audioEffects.reverbType.spring': 'Spring',
  'audioEffects.reverbType.chamber': 'Chamber',

  // Distortion types
  'audioEffects.distortionType.soft': 'Soft',
  'audioEffects.distortionType.hard': 'Hard',
  'audioEffects.distortionType.tube': 'Tube',
  'audioEffects.distortionType.fuzz': 'Fuzz',

  // Presets
  'audio.presets.title': 'Presets',
  'audio.presets.empty': 'No presets available',
  'audio.presets.apply': 'Apply',
  'audio.presets.applyMaster': 'Master Bus',
  'audio.presets.category.voiceOver': 'Voice Over',
  'audio.presets.category.music': 'Music',
  'audio.presets.category.soundDesign': 'Sound Design',

  // Common UI
  'audio.common.close': 'Close',
  'audio.common.mono': 'Mono',
  'audio.common.stereo': 'Stereo',

  // Spectrum
  'audio.spectrum.noData': 'No spectrum data',

  // Timeline
  'audio.timeline.empty': 'No tracks — import audio files to get started',

  // Recording
  'audio.recording.micFallback': 'Microphone {id}',

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
  'audio.toast.exportSuccess': 'Exported {path}',
  'audio.toast.exportSuccessNoPath': 'Export complete',
  'audio.toast.exportError': 'Export failed',
  'audio.toast.recordingSaved': 'Recording saved: {path}',
  'audio.toast.recordingError': 'Save recording failed: {error}',
  'audio.toast.recordingStartError': 'Recording failed: {error}',
  'audio.toast.denoiseStarted': 'Denoise processing...',
  'audio.toast.normalizeStarted': 'Normalizing...',
  'audio.toast.exportStarted': 'Exporting...',
  'audio.toast.trimmed': 'Audio trimmed',

  // Track operations (context menu)
  'audio.track.mute': 'Mute Track',
  'audio.track.unmute': 'Unmute Track',
  'audio.track.solo': 'Solo Track',
  'audio.track.lock': 'Lock Track',
  'audio.track.unlock': 'Unlock Track',
  'audio.track.moveUp': 'Move Up',
  'audio.track.moveDown': 'Move Down',
  'audio.track.delete': 'Delete Track',
  'audio.automation.toggle': 'Automation',

  // Clip operations (context menu)
  'audio.clip.mute': 'Mute Clip',
  'audio.clip.unmute': 'Unmute Clip',
  'audio.clip.duplicate': 'Duplicate Clip',
  'audio.clip.split': 'Split at Playhead',
  'audio.clip.delete': 'Delete Clip',

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

  // Mixer
  'audio.mixer.volumeShort': 'Vol',
  'audio.mixer.panShort': 'Pan',
  'audio.mixer.center': 'Center',
  'audio.mixer.levelDb': 'Level {value} dB',
  'audio.mixer.volumePercent': 'Volume: {value}%',
  'audio.mixer.panValue': 'Pan: {value}',
};

export const bundles: Record<string, MessageBundle> = { audio };
