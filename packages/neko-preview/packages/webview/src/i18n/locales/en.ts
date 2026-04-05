/**
 * English translations for neko-preview webview
 */
import type { MessageBundle } from '@neko/shared';

const preview: MessageBundle = {
  // Video player
  'preview.video.loading': 'Loading video...',
  'preview.video.error': 'Error: {error}',
  'preview.video.noMediaInfo': 'No media info available',
  'preview.video.pipActive': 'Playing in Picture-in-Picture',
  'preview.video.pauseButton': 'Pause (Space)',
  'preview.video.playButton': 'Play (Space)',
  'preview.video.mute': 'Mute',
  'preview.video.unmute': 'Unmute',
  'preview.video.volumeLabel': 'Volume: {percent}%',
  'preview.video.speedLabel': 'Playback speed',
  'preview.video.showStats': 'Show Stats (D)',
  'preview.video.hideStats': 'Hide Stats (D)',
  'preview.video.pipButton': 'Picture-in-Picture',
  'preview.video.exitPip': 'Exit Picture-in-Picture',
  'preview.video.disconnected': 'Disconnected',
  // Audio player
  'preview.audio.loading': 'Loading audio...',
  'preview.audio.error': 'Error: {error}',
  'preview.audio.noMediaInfo': 'No media info available',
  'preview.audio.defaultFilename': 'Audio File',
  'preview.audio.unknownCodec': 'Unknown',
  'preview.audio.mono': 'Mono',
  'preview.audio.stereo': 'Stereo',
  'preview.audio.pauseButton': 'Pause (Space)',
  'preview.audio.playButton': 'Play (Space)',
  'preview.audio.mute': 'Mute',
  'preview.audio.unmute': 'Unmute',
  'preview.audio.volumeLabel': 'Volume: {percent}%',
  'preview.audio.skipBack': 'Skip back 10s',
  'preview.audio.skipForward': 'Skip forward 10s',
  'preview.audio.speedLabel': 'Playback speed',
  'preview.audio.noLyrics': 'No lyrics available',
  'preview.audio.viewCover': 'Cover',
  'preview.audio.viewLyrics': 'Lyrics',
  'preview.audio.viewWaveform': 'Waveform',
  'preview.audio.viewSpectrum': 'Spectrum',
  // Document shared
  'preview.document.sendToAi': 'Send to AI',
  'preview.document.sendPageToAi': 'Analyze Page',
  'preview.document.loading': 'Loading...',
  'preview.document.error': 'Error: {error}',
  'preview.document.pageOf': 'Page {current} of {total}',
  'preview.document.zoomIn': 'Zoom in',
  'preview.document.zoomOut': 'Zoom out',
  'preview.document.fitWidth': 'Fit width',
  'preview.document.fitPage': 'Fit page',
  'preview.document.modeDual': 'Switch to dual-page mode',
  // PDF
  'preview.pdf.loading': 'Loading PDF...',
  // CBZ
  'preview.cbz.loading': 'Loading comic...',
  'preview.cbz.spreadMode': 'Two-page spread',
  'preview.cbz.selectRegion': 'Select region for AI',
  // Document mode toggle (PDF / CBZ)
  'preview.document.modeScroll': 'Switch to scroll mode',
  'preview.document.modePage': 'Switch to page mode',
  // EPUB
  'preview.epub.loading': 'Loading book...',
  'preview.epub.toc': 'Table of Contents',
  'preview.epub.theme': 'Reading theme',
  'preview.epub.fontSize': 'Font size',
  'preview.epub.modeScrolled': 'Switch to scroll mode',
  'preview.epub.modePaginated': 'Switch to page mode',
  'preview.epub.modeSpread': 'Switch to spread mode',
  'preview.epub.modeWaterfall': 'Switch to waterfall mode',
  'preview.epub.sendPage': 'Send page to AI',
  // DOCX
  'preview.docx.loading': 'Loading document...',
};

export const bundles: Record<string, MessageBundle> = {
  preview,
};
