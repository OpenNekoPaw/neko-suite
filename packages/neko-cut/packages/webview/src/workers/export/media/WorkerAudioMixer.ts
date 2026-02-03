/**
 * Worker Audio Mixer
 *
 * Mixes multiple audio tracks into a single stereo output.
 * Supports volume control, fade in/out, and time alignment.
 */

import type { SerializedAudioParams } from '../protocol/messages';

// =============================================================================
// Types
// =============================================================================

export interface AudioMixerConfig {
  /** Output sample rate */
  sampleRate: number;
  /** Output channels (1 = mono, 2 = stereo) */
  channels: number;
}

export interface AudioTrackInput {
  /** Track ID */
  id: string;
  /** PCM audio data (interleaved if stereo) */
  pcm: Float32Array;
  /** Source sample rate */
  sourceSampleRate: number;
  /** Source channels */
  sourceChannels: number;
  /** Timeline start position (seconds) */
  timelineStart: number;
  /** Duration on timeline (seconds) */
  duration: number;
  /** Media internal offset (seconds) */
  mediaOffset: number;
  /** Audio parameters */
  params: SerializedAudioParams;
}

// =============================================================================
// WorkerAudioMixer
// =============================================================================

export class WorkerAudioMixer {
  private _config: AudioMixerConfig | null = null;

  // ===========================================================================
  // Initialization
  // ===========================================================================

  /**
   * Initialize mixer with output configuration
   */
  initialize(config: AudioMixerConfig): void {
    this._config = config;
  }

  // ===========================================================================
  // Mixing
  // ===========================================================================

  /**
   * Mix multiple audio tracks for a time range
   * @param tracks Audio tracks to mix
   * @param startTime Start time in seconds
   * @param duration Duration in seconds
   * @returns Mixed PCM data (interleaved stereo Float32Array)
   */
  mix(tracks: AudioTrackInput[], startTime: number, duration: number): Float32Array {
    if (!this._config) {
      throw new Error('Mixer not initialized');
    }

    const { sampleRate, channels } = this._config;
    const totalSamples = Math.ceil(duration * sampleRate);
    const output = new Float32Array(totalSamples * channels);

    // Mix each track
    for (const track of tracks) {
      if (track.params.muted) continue;

      this._mixTrack(output, track, startTime, duration);
    }

    // Clamp output to [-1, 1]
    for (let i = 0; i < output.length; i++) {
      output[i] = Math.max(-1, Math.min(1, output[i]!));
    }

    return output;
  }

  /**
   * Mix single track into output buffer
   */
  private _mixTrack(
    output: Float32Array,
    track: AudioTrackInput,
    mixStartTime: number,
    mixDuration: number
  ): void {
    if (!this._config) return;

    const { sampleRate, channels } = this._config;

    // Calculate time overlap
    const trackStart = track.timelineStart;
    const trackEnd = track.timelineStart + track.duration;
    const mixEnd = mixStartTime + mixDuration;

    // Check if track overlaps with mix range
    if (trackEnd <= mixStartTime || trackStart >= mixEnd) {
      return; // No overlap
    }

    // Calculate actual overlap
    const overlapStart = Math.max(trackStart, mixStartTime);
    const overlapEnd = Math.min(trackEnd, mixEnd);
    const overlapDuration = overlapEnd - overlapStart;

    if (overlapDuration <= 0) return;

    // Calculate sample positions
    const outputStartSample = Math.floor((overlapStart - mixStartTime) * sampleRate);
    const outputSamples = Math.ceil(overlapDuration * sampleRate);

    // Calculate source position
    const sourceStartTime = overlapStart - trackStart + track.mediaOffset;
    const sourceStartSample = Math.floor(sourceStartTime * track.sourceSampleRate);

    // Resample and mix
    for (let i = 0; i < outputSamples; i++) {
      const outputIdx = outputStartSample + i;
      if (outputIdx < 0 || outputIdx * channels >= output.length) continue;

      // Calculate time for this sample
      const time = overlapStart + (i / sampleRate);
      const timeInTrack = time - trackStart;

      // Calculate volume with fade
      let volume = track.params.volume;
      volume *= this._calculateFade(timeInTrack, track.duration, track.params);

      // Get source sample (with resampling)
      const sourceIdx = sourceStartSample + Math.floor(i * (track.sourceSampleRate / sampleRate));

      if (track.sourceChannels === 1) {
        // Mono source
        const sample = track.pcm[sourceIdx] ?? 0;
        for (let ch = 0; ch < channels; ch++) {
          output[outputIdx * channels + ch]! += sample * volume;
        }
      } else if (track.sourceChannels === 2) {
        // Stereo source
        if (channels === 2) {
          const leftSample = track.pcm[sourceIdx * 2] ?? 0;
          const rightSample = track.pcm[sourceIdx * 2 + 1] ?? 0;
          output[outputIdx * 2]! += leftSample * volume;
          output[outputIdx * 2 + 1]! += rightSample * volume;
        } else {
          // Downmix to mono
          const leftSample = track.pcm[sourceIdx * 2] ?? 0;
          const rightSample = track.pcm[sourceIdx * 2 + 1] ?? 0;
          output[outputIdx]! += ((leftSample + rightSample) / 2) * volume;
        }
      }
    }
  }

  /**
   * Calculate fade multiplier for given time
   */
  private _calculateFade(
    timeInTrack: number,
    duration: number,
    params: SerializedAudioParams
  ): number {
    let fade = 1;

    // Fade in
    if (params.fadeIn > 0 && timeInTrack < params.fadeIn) {
      fade *= timeInTrack / params.fadeIn;
    }

    // Fade out
    const fadeOutStart = duration - params.fadeOut;
    if (params.fadeOut > 0 && timeInTrack > fadeOutStart) {
      fade *= (duration - timeInTrack) / params.fadeOut;
    }

    return Math.max(0, Math.min(1, fade));
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Dispose mixer resources
   */
  dispose(): void {
    this._config = null;
  }
}
