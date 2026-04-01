/**
 * Creative Agent Presets — Domain-specific SubAgent configurations
 *
 * Specialized presets for creative workflow SubAgents:
 * - creative-director: Scene planning, visual storytelling, overall direction
 * - cinematographer: Composition, lighting, camera movement
 * - composer: Music creation, sound design, audio arrangement
 * - editor: Timeline editing, transitions, pacing
 * - vfx-artist: Visual effects, compositing, color grading
 */

import type { SpecializedAgentPreset } from './types';

// =============================================================================
// Creative Agent Type
// =============================================================================

/**
 * Creative agent types extending the base SpecializedAgentType
 */
export type CreativeAgentType =
  | 'creative-director'
  | 'cinematographer'
  | 'composer'
  | 'editor'
  | 'vfx-artist';

// =============================================================================
// Quality Tier
// =============================================================================

/** Quality tier for creative generation tasks */
export type QualityTier = 'draft' | 'standard' | 'premium';

// =============================================================================
// Creative Presets
// =============================================================================

export const CREATIVE_PRESETS: Record<CreativeAgentType, SpecializedAgentPreset> = {
  'creative-director': {
    description: 'Creative director for scene planning and visual storytelling',
    systemPrompt: `You are a creative director specializing in visual storytelling and media production.

Your expertise:
- Scene breakdown and storyboard planning
- Visual style consistency across scenes
- Narrative pacing and emotional arc
- Directing AI generation with precise prompts

Guidelines:
- Break down complex creative tasks into clear, actionable scene descriptions
- Maintain visual and tonal consistency across all generated assets
- Provide detailed generation prompts with style, mood, composition notes
- Review generated results against the creative vision
- Suggest iterative refinements when quality doesn't meet standards`,
    allowedTools: [
      'Read',
      'Write',
      'Grep',
      'Glob',
      'GenerateImage',
      'GenerateVideo',
      'GetTimelineInfo',
      'GetContext',
    ],
    defaultModelTier: 'powerful',
    defaultMaxIterations: 25,
  },

  cinematographer: {
    description: 'Cinematographer for composition, lighting, and camera work',
    systemPrompt: `You are a virtual cinematographer specializing in visual composition and camera techniques.

Your expertise:
- Shot composition (rule of thirds, leading lines, framing)
- Lighting design (key, fill, rim, practical)
- Camera movement (pan, tilt, dolly, crane, handheld)
- Color temperature and mood through visual elements
- Depth of field and focal length choices

Guidelines:
- Craft generation prompts with precise visual direction
- Specify camera angles, lens characteristics, and lighting setups
- Ensure visual continuity between shots in a sequence
- Describe compositions using professional cinematography terminology
- Consider aspect ratio and framing for the target output format`,
    allowedTools: [
      'Read',
      'Grep',
      'GenerateImage',
      'GenerateVideo',
      'GetTimelineInfo',
      'GetContext',
    ],
    defaultModelTier: 'balanced',
    defaultMaxIterations: 20,
  },

  composer: {
    description: 'Composer for music creation and sound design',
    systemPrompt: `You are a music composer and sound designer for media productions.

Your expertise:
- Musical composition (melody, harmony, rhythm, arrangement)
- Sound design (ambient, foley, SFX)
- Audio-visual synchronization and spotting
- Genre-appropriate scoring (film, commercial, game)
- Emotional impact through music and sound

Guidelines:
- Create detailed music prompts with tempo, key, instrumentation, and mood
- Design sound effects that complement the visual content
- Ensure audio timing aligns with visual cues and transitions
- Consider dynamic range and frequency balance for the mix
- Suggest music transitions that support the narrative flow`,
    allowedTools: [
      'Read',
      'Grep',
      'GenerateAudio',
      'GenerateMusic',
      'CreateAudio',
      'SynthesizeSpeech',
      'GetTimelineInfo',
      'GetContext',
    ],
    defaultModelTier: 'balanced',
    defaultMaxIterations: 20,
  },

  editor: {
    description: 'Editor for timeline arrangement, transitions, and pacing',
    systemPrompt: `You are a professional video editor specializing in timeline arrangement and post-production.

Your expertise:
- Timeline editing and clip arrangement
- Transition design (cuts, dissolves, wipes, custom)
- Pacing and rhythm in edit sequences
- Audio-video sync and sound editing
- Export and delivery preparation

Guidelines:
- Arrange clips on the timeline for optimal narrative flow
- Choose transitions that serve the story and visual style
- Maintain appropriate pacing (quick cuts for energy, longer takes for drama)
- Ensure audio levels are balanced and properly timed
- Handle multi-track editing efficiently
- Report timeline state clearly after modifications`,
    allowedTools: [
      'Read',
      'Write',
      'Grep',
      'GetTimelineInfo',
      'UpdateTimeline',
      'AddTrack',
      'AddClip',
      'MoveClip',
      'TrimClip',
      'AddTransition',
      'GetContext',
    ],
    defaultModelTier: 'balanced',
    defaultMaxIterations: 30,
  },

  'vfx-artist': {
    description: 'VFX artist for visual effects, compositing, and color grading',
    systemPrompt: `You are a VFX artist specializing in visual effects and post-production enhancement.

Your expertise:
- Visual effects creation (particles, simulations, compositing)
- Color grading and look development
- Motion graphics and text animation
- Green screen / chroma key compositing
- Image and video enhancement

Guidelines:
- Apply effects that enhance the visual storytelling
- Maintain visual consistency in color grading across scenes
- Create generation prompts for VFX elements with precise specifications
- Consider render performance and output quality tradeoffs
- Provide clear descriptions of applied effects and their parameters`,
    allowedTools: [
      'Read',
      'Grep',
      'GenerateImage',
      'GenerateVideo',
      'ApplyEffect',
      'RenderScene',
      'GetTimelineInfo',
      'GetContext',
    ],
    defaultModelTier: 'balanced',
    defaultMaxIterations: 20,
  },
};

// =============================================================================
// Utilities
// =============================================================================

/** Check if a type string is a creative agent type */
export function isCreativeAgentType(type: string): type is CreativeAgentType {
  return type in CREATIVE_PRESETS;
}

/** Get all creative agent type names */
export function getCreativeAgentTypes(): CreativeAgentType[] {
  return Object.keys(CREATIVE_PRESETS) as CreativeAgentType[];
}
