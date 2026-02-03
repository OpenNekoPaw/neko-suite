/**
 * Video Export Engine
 * 视频导出引擎 - 支持变换、转场、音频属性的完整导出
 */

import type {
  ProjectData,
  TimelineTrack,
  TimelineElement,
  MediaElement,
  AudioElement,
  Transition,
  AudioProperties,
  BlendModeType,
  AnimatableProperty,
} from '../types';
import type { ColorCorrection } from '../types/colorCorrection';
import type { ComputedTransform } from '../types/animation';
import { getComputedTransform, getAnimatedValue } from './animation';
import { applyEasing } from './animation';

// =============================================================================
// Export Types
// =============================================================================

export interface ExportSettings {
  width: number;
  height: number;
  fps: number;
  format: 'mp4' | 'webm' | 'gif' | 'png-sequence' | 'jpeg-sequence' | 'webp-sequence';
  quality: 'low' | 'medium' | 'high';
  audioBitrate: number;
  videoBitrate?: number;
  // GIF specific
  gifColors?: number;
  gifDither?: boolean;
  gifQuality?: number;
  // Image sequence specific
  imageQuality?: number;
  frameNumberPadding?: number;
}

export interface ExportableElement {
  element: TimelineElement;
  track: TimelineTrack;
  trackIndex: number;
  zIndex: number;
}

export interface FrameRenderData {
  time: number;
  frameIndex: number;
  elements: Array<{
    element: TimelineElement;
    localTime: number;
    transform: ComputedTransform;
    opacity: number; // Combined transform + transition opacity
    inTransitionProgress?: number;
    outTransitionProgress?: number;
    zIndex: number;
    colorCorrection?: ColorCorrection;
    blendMode?: BlendModeType;
  }>;
  audioElements: Array<{
    element: TimelineElement;
    localTime: number;
    volume: number;
    pan: number;
  }>;
}

// =============================================================================
// Timeline Analysis
// =============================================================================

/**
 * Calculate total duration of the project
 */
export function calculateProjectDuration(project: ProjectData): number {
  let maxEnd = 0;

  for (const track of project.tracks) {
    for (const element of track.elements) {
      if (element.hidden) continue;
      const effectiveDuration = element.duration - element.trimStart - element.trimEnd;
      const endTime = element.startTime + effectiveDuration;
      maxEnd = Math.max(maxEnd, endTime);
    }
  }

  return maxEnd;
}

/**
 * Get all elements visible at a specific time, sorted by z-index
 */
export function getVisibleElementsAtTime(
  project: ProjectData,
  time: number
): ExportableElement[] {
  const elements: ExportableElement[] = [];

  project.tracks.forEach((track, trackIndex) => {
    if (track.muted) return;

    track.elements.forEach((element, elementIndex) => {
      if (element.hidden || element.muted) return;

      const effectiveDuration = element.duration - element.trimStart - element.trimEnd;
      const endTime = element.startTime + effectiveDuration;

      if (time >= element.startTime && time < endTime) {
        elements.push({
          element,
          track,
          trackIndex,
          zIndex: trackIndex * 100 + elementIndex,
        });
      }
    });
  });

  // Sort by z-index (lower tracks render first, higher tracks on top)
  return elements.sort((a, b) => a.zIndex - b.zIndex);
}

// =============================================================================
// Transition Calculations
// =============================================================================

/**
 * Calculate transition opacity based on transition type and progress
 */
export function calculateTransitionOpacity(
  transition: Transition | undefined,
  progress: number,
  isIn: boolean
): number {
  if (!transition || transition.type === 'none') return 1;

  const easedProgress = applyEasing(progress, transition.easing);

  switch (transition.type) {
    case 'fade':
    case 'dissolve':
      return isIn ? easedProgress : easedProgress;
    default:
      // For other transitions, handle opacity differently
      return isIn ? easedProgress : easedProgress;
  }
}

/**
 * Calculate transition transform values
 */
export function calculateTransitionTransform(
  transition: Transition | undefined,
  progress: number,
  isIn: boolean,
  canvasWidth: number,
  canvasHeight: number
): { translateX: number; translateY: number; scale: number } {
  if (!transition || transition.type === 'none') {
    return { translateX: 0, translateY: 0, scale: 1 };
  }

  const easedProgress = applyEasing(progress, transition.easing);
  const reverseProgress = isIn ? (1 - easedProgress) : (1 - easedProgress);

  switch (transition.type) {
    case 'slide-left':
      return {
        translateX: isIn ? -canvasWidth * reverseProgress : canvasWidth * reverseProgress,
        translateY: 0,
        scale: 1,
      };
    case 'slide-right':
      return {
        translateX: isIn ? canvasWidth * reverseProgress : -canvasWidth * reverseProgress,
        translateY: 0,
        scale: 1,
      };
    case 'slide-up':
      return {
        translateX: 0,
        translateY: isIn ? -canvasHeight * reverseProgress : canvasHeight * reverseProgress,
        scale: 1,
      };
    case 'slide-down':
      return {
        translateX: 0,
        translateY: isIn ? canvasHeight * reverseProgress : -canvasHeight * reverseProgress,
        scale: 1,
      };
    case 'zoom-in':
      return {
        translateX: 0,
        translateY: 0,
        scale: isIn ? easedProgress : (2 - easedProgress),
      };
    case 'zoom-out':
      return {
        translateX: 0,
        translateY: 0,
        scale: isIn ? (2 - easedProgress) : easedProgress,
      };
    default:
      return { translateX: 0, translateY: 0, scale: 1 };
  }
}

// =============================================================================
// Audio Calculations
// =============================================================================

/**
 * Helper function to get value from number or AnimatableProperty
 */
function getAnimatableValue(
  prop: number | { baseValue: number; keyframes?: unknown[] } | undefined,
  localTime: number,
  defaultValue: number
): number {
  if (prop === undefined) return defaultValue;
  if (typeof prop === 'number') return prop;
  // It's an AnimatableProperty
  if ('baseValue' in prop) {
    // Use getAnimatedValue if it has keyframes
    if (prop.keyframes && prop.keyframes.length > 0) {
      return getAnimatedValue(prop as AnimatableProperty, localTime);
    }
    return prop.baseValue;
  }
  return defaultValue;
}

/**
 * Calculate audio volume at a specific time, including fades
 */
export function calculateAudioVolume(
  audio: AudioProperties | undefined,
  localTime: number,
  effectiveDuration: number
): number {
  if (!audio) return 1;
  if (audio.muted) return 0;

  // Get animated volume value - handle both number and AnimatableProperty
  let volume = getAnimatableValue(audio.volume, localTime, 1);

  // Apply fade in
  if (audio.fadeIn > 0 && localTime < audio.fadeIn) {
    const fadeProgress = localTime / audio.fadeIn;
    const easedFade = applyEasing(fadeProgress, audio.fadeInCurve ?? 'linear');
    volume *= easedFade;
  }

  // Apply fade out
  const timeUntilEnd = effectiveDuration - localTime;
  if (audio.fadeOut > 0 && timeUntilEnd < audio.fadeOut) {
    const fadeProgress = timeUntilEnd / audio.fadeOut;
    const easedFade = applyEasing(fadeProgress, audio.fadeOutCurve ?? 'linear');
    volume *= easedFade;
  }

  // Apply gain (dB to linear)
  if (audio.gain !== 0) {
    volume *= Math.pow(10, audio.gain / 20);
  }

  return Math.max(0, Math.min(2, volume));
}

/**
 * Calculate audio pan at a specific time
 */
export function calculateAudioPan(
  audio: AudioProperties | undefined,
  localTime: number
): number {
  if (!audio) return 0;
  return getAnimatableValue(audio.pan, localTime, 0);
}

// =============================================================================
// Frame Data Generation
// =============================================================================

/**
 * Generate render data for a specific frame
 */
export function generateFrameData(
  project: ProjectData,
  time: number,
  frameIndex: number,
  _settings: ExportSettings
): FrameRenderData {
  const visibleElements = getVisibleElementsAtTime(project, time);
  const frameData: FrameRenderData = {
    time,
    frameIndex,
    elements: [],
    audioElements: [],
  };

  for (const { element, zIndex } of visibleElements) {
    const effectiveDuration = element.duration - element.trimStart - element.trimEnd;
    const elementTime = time - element.startTime;
    const localTime = elementTime + element.trimStart;
    const endTime = element.startTime + effectiveDuration;

    // Calculate transform - prefer animTransform for keyframe animation, fallback to static transform
    const transform = getComputedTransform(element.animTransform, localTime);

    // Calculate transition effects
    let opacity = transform.opacity;
    let inTransitionProgress: number | undefined;
    let outTransitionProgress: number | undefined;

    // In transition
    const inTransition = element.transitionIn;
    if (inTransition && inTransition.type !== 'none' && elementTime < inTransition.duration) {
      inTransitionProgress = elementTime / inTransition.duration;
      opacity *= calculateTransitionOpacity(inTransition, inTransitionProgress, true);
    }

    // Out transition
    const outTransition = element.transitionOut;
    if (outTransition && outTransition.type !== 'none') {
      const timeUntilEnd = endTime - time;
      if (timeUntilEnd < outTransition.duration) {
        outTransitionProgress = timeUntilEnd / outTransition.duration;
        opacity *= calculateTransitionOpacity(outTransition, outTransitionProgress, false);
      }
    }

    // Add to render list (for media and text)
    // Note: ShapeElement is not stored in TimelineTrack.elements in current architecture
    if (element.type === 'media' || element.type === 'text') {
      frameData.elements.push({
        element,
        localTime,
        transform,
        opacity,
        inTransitionProgress,
        outTransitionProgress,
        zIndex,
        colorCorrection: element.colorCorrection,
        blendMode: element.blendMode,
      });
    }

    // Add to audio list (for media and audio)
    if ((element.type === 'media' || element.type === 'audio') && element.audio) {
      const volume = calculateAudioVolume(element.audio, localTime, effectiveDuration);
      const pan = calculateAudioPan(element.audio, localTime);

      frameData.audioElements.push({
        element,
        localTime,
        volume,
        pan,
      });
    }
  }

  return frameData;
}

// =============================================================================
// FFmpeg Filter Generation
// =============================================================================

/**
 * Generate FFmpeg filter complex for video processing
 * This creates filters for transforms, transitions, and compositing
 */
export function generateVideoFilterComplex(
  elements: Array<{
    inputIndex: number;
    element: MediaElement;
    startTime: number;
    effectiveDuration: number;
    zIndex: number;
  }>,
  settings: ExportSettings
): string {
  if (elements.length === 0) return '';
  if (elements.length === 1) {
    const el = elements[0];
    const filters: string[] = [];

    // Scale to output resolution
    filters.push(`scale=${settings.width}:${settings.height}:force_original_aspect_ratio=decrease`);
    filters.push(`pad=${settings.width}:${settings.height}:(ow-iw)/2:(oh-ih)/2`);

    // Trim
    if (el.element.trimStart > 0 || el.element.trimEnd > 0) {
      const effectiveDuration = el.element.duration - el.element.trimStart - el.element.trimEnd;
      filters.push(`trim=start=${el.element.trimStart}:duration=${effectiveDuration}`);
      filters.push('setpts=PTS-STARTPTS');
    }

    // Set fps
    filters.push(`fps=${settings.fps}`);

    return `[0:v]${filters.join(',')}[outv]`;
  }

  // Multiple elements - need complex filter graph
  const filterParts: string[] = [];
  const scaledInputs: string[] = [];

  // First, scale and trim each input
  elements.forEach((el, i) => {
    const inputLabel = `[${el.inputIndex}:v]`;
    const scaledLabel = `[v${i}]`;
    const filters: string[] = [];

    // Scale
    filters.push(`scale=${settings.width}:${settings.height}:force_original_aspect_ratio=decrease`);
    filters.push(`pad=${settings.width}:${settings.height}:(ow-iw)/2:(oh-ih)/2`);

    // Trim
    if (el.element.trimStart > 0 || el.element.trimEnd > 0) {
      filters.push(`trim=start=${el.element.trimStart}:duration=${el.effectiveDuration}`);
      filters.push('setpts=PTS-STARTPTS');
    }

    // Apply transform if present
    const animTransform = el.element.animTransform;
    const staticTransform = el.element.transform;
    if (animTransform) {
      // Use animTransform for keyframe animations (use base values)
      const opacity = animTransform.opacity.baseValue;
      const scaleX = animTransform.scaleX.baseValue;
      const scaleY = animTransform.scaleY.baseValue;
      const rotation = animTransform.rotation.baseValue;

      if (opacity < 1) {
        filters.push(`colorchannelmixer=aa=${opacity}`);
      }
      if (scaleX !== 1 || scaleY !== 1) {
        filters.push(`scale=iw*${scaleX}:ih*${scaleY}`);
      }
      if (rotation !== 0) {
        filters.push(`rotate=${rotation}*PI/180:c=none`);
      }
    } else if (staticTransform) {
      // Fallback to static transform
      const opacity = staticTransform.opacity ?? 1;
      const scaleX = staticTransform.scaleX;
      const scaleY = staticTransform.scaleY;
      const rotation = staticTransform.rotation;

      if (opacity < 1) {
        filters.push(`colorchannelmixer=aa=${opacity}`);
      }
      if (scaleX !== 1 || scaleY !== 1) {
        filters.push(`scale=iw*${scaleX}:ih*${scaleY}`);
      }
      if (rotation !== 0) {
        filters.push(`rotate=${rotation}*PI/180:c=none`);
      }
    }

    // Apply in/out transitions
    if (el.element.transitionIn && el.element.transitionIn.type !== 'none') {
      const transition = el.element.transitionIn;
      if (transition.type === 'fade') {
        filters.push(`fade=in:st=0:d=${transition.duration}`);
      }
    }
    if (el.element.transitionOut && el.element.transitionOut.type !== 'none') {
      const transition = el.element.transitionOut;
      if (transition.type === 'fade') {
        filters.push(`fade=out:st=${el.effectiveDuration - transition.duration}:d=${transition.duration}`);
      }
    }

    filters.push(`fps=${settings.fps}`);

    filterParts.push(`${inputLabel}${filters.join(',')}${scaledLabel}`);
    scaledInputs.push(scaledLabel);
  });

  // Concatenate all videos
  const concatInput = scaledInputs.join('');
  filterParts.push(`${concatInput}concat=n=${elements.length}:v=1:a=0[outv]`);

  return filterParts.join(';');
}

/**
 * Generate FFmpeg audio filter complex
 */
export function generateAudioFilterComplex(
  elements: Array<{
    inputIndex: number;
    element: MediaElement | AudioElement;
    startTime: number;
    effectiveDuration: number;
    audio?: AudioProperties;
  }>,
  _settings: ExportSettings
): string {
  if (elements.length === 0) return '';

  const filterParts: string[] = [];
  const processedInputs: string[] = [];

  elements.forEach((el, i) => {
    const inputLabel = `[${el.inputIndex}:a]`;
    const outputLabel = `[a${i}]`;
    const filters: string[] = [];

    // Trim audio
    if (el.element.trimStart > 0 || el.element.trimEnd > 0) {
      filters.push(`atrim=start=${el.element.trimStart}:duration=${el.effectiveDuration}`);
      filters.push('asetpts=PTS-STARTPTS');
    }

    // Apply audio properties
    if (el.audio) {
      // Volume - handle both number and AnimatableProperty
      const volumeProp = el.audio.volume;
      const volume = typeof volumeProp === 'number' ? volumeProp : (volumeProp?.baseValue ?? 1);
      if (volume !== 1) {
        filters.push(`volume=${volume}`);
      }

      // Fade in/out
      if (el.audio.fadeIn > 0) {
        filters.push(`afade=in:st=0:d=${el.audio.fadeIn}`);
      }
      if (el.audio.fadeOut > 0) {
        filters.push(`afade=out:st=${el.effectiveDuration - el.audio.fadeOut}:d=${el.audio.fadeOut}`);
      }

      // Pan - handle both number and AnimatableProperty
      const panProp = el.audio.pan;
      const pan = typeof panProp === 'number' ? panProp : (panProp?.baseValue ?? 0);
      if (pan !== 0) {
        // Convert -1..1 to stereo pan
        const leftVol = pan < 0 ? 1 : 1 - pan;
        const rightVol = pan > 0 ? 1 : 1 + pan;
        filters.push(`pan=stereo|c0=${leftVol}*c0|c1=${rightVol}*c1`);
      }

      // Gain
      if (el.audio.gain !== 0) {
        const gainLinear = Math.pow(10, el.audio.gain / 20);
        filters.push(`volume=${gainLinear}`);
      }
    }

    if (filters.length > 0) {
      filterParts.push(`${inputLabel}${filters.join(',')}${outputLabel}`);
      processedInputs.push(outputLabel);
    } else {
      processedInputs.push(inputLabel);
    }
  });

  // Mix/concat audio
  if (processedInputs.length === 1) {
    if (filterParts.length > 0) {
      // Replace output label with [outa]
      filterParts[filterParts.length - 1] = filterParts[filterParts.length - 1].replace(/\[a\d+\]$/, '[outa]');
    } else {
      filterParts.push(`${processedInputs[0]}anull[outa]`);
    }
  } else if (processedInputs.length > 1) {
    const mixInput = processedInputs.join('');
    filterParts.push(`${mixInput}concat=n=${processedInputs.length}:v=0:a=1[outa]`);
  }

  return filterParts.join(';');
}

// =============================================================================
// Export Configuration Builder
// =============================================================================

/**
 * Build FFmpeg arguments for export
 */
export function buildFFmpegArgs(
  inputPaths: string[],
  outputPath: string,
  videoFilter: string,
  audioFilter: string,
  settings: ExportSettings
): string[] {
  const args: string[] = [];

  // Add inputs
  for (const inputPath of inputPaths) {
    args.push('-i', inputPath);
  }

  // Add filter complex
  const filters: string[] = [];
  if (videoFilter) filters.push(videoFilter);
  if (audioFilter) filters.push(audioFilter);

  if (filters.length > 0) {
    args.push('-filter_complex', filters.join(';'));
    args.push('-map', '[outv]');
    if (audioFilter) {
      args.push('-map', '[outa]');
    }
  }

  // Video codec settings
  if (settings.format === 'mp4') {
    args.push('-c:v', 'libx264');
    const crf = settings.quality === 'high' ? 18 : settings.quality === 'medium' ? 23 : 28;
    args.push('-crf', crf.toString());
    args.push('-preset', 'medium');
    args.push('-pix_fmt', 'yuv420p');
  } else {
    args.push('-c:v', 'libvpx-vp9');
    const crf = settings.quality === 'high' ? 28 : settings.quality === 'medium' ? 33 : 38;
    args.push('-crf', crf.toString());
    args.push('-b:v', '0');
  }

  // Audio codec settings
  if (settings.format === 'mp4') {
    args.push('-c:a', 'aac');
  } else {
    args.push('-c:a', 'libopus');
  }
  args.push('-b:a', `${settings.audioBitrate}k`);

  // Output
  args.push('-y', outputPath);

  return args;
}

/**
 * Prepare export data from project
 */
export function prepareExportData(project: ProjectData, settings: ExportSettings) {
  const mediaElements: Array<{
    element: MediaElement;
    track: TimelineTrack;
    trackIndex: number;
    startTime: number;
    effectiveDuration: number;
  }> = [];

  const audioElements: Array<{
    element: MediaElement | AudioElement;
    track: TimelineTrack;
    trackIndex: number;
    startTime: number;
    effectiveDuration: number;
  }> = [];

  project.tracks.forEach((track, trackIndex) => {
    if (track.muted) return;

    for (const element of track.elements) {
      if (element.hidden || element.muted) continue;

      const effectiveDuration = element.duration - element.trimStart - element.trimEnd;

      if (element.type === 'media') {
        mediaElements.push({
          element,
          track,
          trackIndex,
          startTime: element.startTime,
          effectiveDuration,
        });
      }

      if (element.type === 'media' || element.type === 'audio') {
        audioElements.push({
          element: element as MediaElement | AudioElement,
          track,
          trackIndex,
          startTime: element.startTime,
          effectiveDuration,
        });
      }
    }
  });

  // Sort by start time
  mediaElements.sort((a, b) => a.startTime - b.startTime);
  audioElements.sort((a, b) => a.startTime - b.startTime);

  return {
    mediaElements,
    audioElements,
    duration: calculateProjectDuration(project),
    frameCount: Math.ceil(calculateProjectDuration(project) * settings.fps),
  };
}
