/**
 * Export Module
 *
 * 导出工具函数
 */

// =============================================================================
// Export Utilities
// =============================================================================

export {
  // Timeline analysis
  calculateProjectDuration,
  getVisibleElementsAtTime,
  // Transitions
  calculateTransitionOpacity,
  calculateTransitionTransform,
  // Audio
  calculateAudioVolume,
  calculateAudioPan,
  // Frame data
  generateFrameData,
  // FFmpeg filters
  generateVideoFilterComplex,
  generateAudioFilterComplex,
  buildFFmpegArgs,
  prepareExportData,
} from '../utils/exportEngine';

export type {
  ExportSettings,
  ExportableElement,
  FrameRenderData,
} from '../utils/exportEngine';
