/**
 * Capability Filter Strategy
 *
 * Filters providers based on required capabilities
 */

import type {
  MediaRoutingStrategy,
  MediaRoutingCandidate,
  MediaRoutingContext,
  MediaGenerationType,
} from '../../types';
import type { ModelCapability } from '../../../types/provider';

/**
 * Map generation type to model capability
 */
function generationTypeToCapability(type: MediaGenerationType): ModelCapability {
  const mapping: Record<MediaGenerationType, ModelCapability> = {
    'text-to-image': 'text_to_image',
    'image-to-image': 'image_to_image',
    'text-to-video': 'text_to_video',
    'image-to-video': 'image_to_video',
    'video-to-video': 'video_to_video',
    'text-to-audio': 'text_to_audio',
    'text-to-music': 'text_to_music',
    'workflow': 'workflow',
  };
  return mapping[type] || 'text_to_image';
}

/**
 * Capability filter strategy - filters by required capabilities
 */
export class CapabilityFilterStrategy implements MediaRoutingStrategy {
  readonly name = 'capability-filter';
  readonly priority = 80;

  filter(
    candidates: MediaRoutingCandidate[],
    context: MediaRoutingContext
  ): MediaRoutingCandidate[] {
    const requiredCapability = generationTypeToCapability(context.generationType);

    console.log('[CapabilityFilter] Filtering for capability:', requiredCapability);

    return candidates.filter((c) => {
      const capabilities = c.model.capabilities as string[] || [];

      console.log('[CapabilityFilter] Model:', c.model.id, 'capabilities:', capabilities);

      // Check if model has the required capability
      let hasCapability = capabilities.includes(requiredCapability);

      // Also check alternative capability names for backwards compatibility
      if (!hasCapability) {
        if (requiredCapability === 'text_to_image') {
          // Support various naming conventions: image_generation, image-generation
          hasCapability = capabilities.includes('image_generation') ||
                          capabilities.includes('image-generation') ||
                          capabilities.includes('text-to-image');
        } else if (requiredCapability === 'text_to_video') {
          hasCapability = capabilities.includes('video_generation') ||
                          capabilities.includes('video-generation') ||
                          capabilities.includes('text-to-video');
        } else if (requiredCapability === 'text_to_audio') {
          hasCapability = capabilities.includes('audio_generation') ||
                          capabilities.includes('audio-generation') ||
                          capabilities.includes('text-to-audio') ||
                          capabilities.includes('tts');
        }
      }

      if (!hasCapability) {
        console.log('[CapabilityFilter] Model', c.model.id, 'rejected: missing capability', requiredCapability);
        return false;
      }

      // Check additional required capabilities
      if (context.requiredCapabilities?.length) {
        for (const cap of context.requiredCapabilities) {
          if (!capabilities.includes(cap)) {
            console.log('[CapabilityFilter] Model', c.model.id, 'rejected: missing additional capability', cap);
            return false;
          }
        }
      }

      console.log('[CapabilityFilter] Model', c.model.id, 'passed');
      return true;
    });
  }

  score(
    candidates: MediaRoutingCandidate[],
    _context: MediaRoutingContext
  ): MediaRoutingCandidate[] {
    // No scoring, just filtering
    return candidates.map((c) => ({
      ...c,
      scoreBreakdown: {
        ...c.scoreBreakdown,
        [this.name]: 0,
      },
    }));
  }
}
