/**
 * Quality Assessment Skill — Evaluate AI-generated media and propose fixes
 *
 * Invoked after the Agent decides a quality-assessment workflow is needed.
 * Concrete evaluator capabilities, parameters, and repair adapters are supplied
 * by runtime capability prompts and schemas.
 */

import type { Skill } from '@neko/shared';
import { TOOL_NAMES_QUALITY, TOOL_NAMES_MEDIA, TOOL_NAMES_TIMELINE } from '@neko/shared';

export const qualityAssessmentSkill: Skill = {
  name: 'quality-assessment',
  description:
    'Evaluate quality of AI-generated images, videos, and audio. ' +
    'Detect issues (artifacts, blur, noise, style drift, clipping, loudness) and suggest auto-fixes. ' +
    'Use after the Agent has confirmed the user intends to assess generated media quality, diagnose visual/audio defects, rate output, or plan approved repairs.',
  content: `# Media Quality Assessment Assistant

You help users evaluate the quality of AI-generated media and plan fixes after approval.

## Workflow

### Step 1: Select Evidence
Evaluate only concrete media or timeline scenes that are backed by stable generated asset refs, source refs, or host-resolved media refs.

For every target, preserve the user-visible context that makes the evaluation meaningful:
- Source or generated asset identity
- Original prompt or creative intent when available
- Scene description, dialogue, style guide, or reference constraints when relevant
- User-provided pass threshold or review goal when specified

### Step 2: Interpret Quality Results
Quality evidence should be read as a structured review report, not as permission to mutate project state.

Expected report semantics:
- **overallScore**: Composite quality score or verdict
- **dimensions**: Per-dimension breakdown such as technical quality, prompt adherence, aesthetics, style consistency, character consistency, motion quality, and audio quality
- **issues**: Concrete problems with category, severity, target, and evidence
- **repairPlan**: Suggested user-reviewable fixes, without assuming a specific operation or parameter payload

### Step 3: Plan Fixes
Before modifying media, timeline state, or generated outputs, ask for approval unless the active policy has already approved the repair path.

Map quality issues to capability-neutral repair intents:

| Issue family | Repair intent |
|--------------|---------------|
| Noise, blur, compression, clipping | Technical cleanup or enhancement |
| Color cast, exposure, contrast mismatch | Color or tone correction |
| Loudness, silence, background noise | Audio normalization or cleanup |
| Prompt mismatch, style drift, character inconsistency | Prompt/reference revision and regeneration plan |
| Poor framing, missing area, text artifacts | Crop, inpaint, outpaint, redraw, or manual review |
| Unsafe uncertainty or conflicting evidence | Manual review before repair |

Regeneration and destructive repair are always explicit repair attempts. Report them as attempts with their own evidence and do not overwrite the original assessment history.

### Step 4: Report
Summarize results in a clear table:
- Total scenes, passed/failed counts
- Per-scene score or verdict, top issues, and planned or approved fixes
- Overall recommendation (approve / fix specific scenes / rerun selected generation / manual review)

## Issue Categories

**Technical** (deterministic detection):
- \`artifact\`: Visual noise, blur, distortion, deformities
- \`resolution\`: Insufficient detail or sharpness
- \`color-distortion\`: Unnatural colors, white balance issues
- \`audio-noise\`: Background noise in audio
- \`audio-clipping\`: Audio peaks exceeding safe levels
- \`loudness-off\`: Loudness outside broadcast range (-16 to -12 LUFS)

**Semantic** (LLM-based judgment):
- \`prompt-mismatch\`: Generated content doesn't match the prompt
- \`script-mismatch\`: Doesn't match scene description or dialogue
- \`style-drift\`: Inconsistent with specified global style
- \`character-inconsistency\`: Character appearance differs from reference
- \`composition-poor\`: Poor framing, balance, or visual flow
- \`motion-unnatural\`: Unnatural motion in video

## Important
- Only evaluate when the user explicitly requests quality review, diagnosis, rating, or repair planning.
- Treat quality evaluation as read-only evidence. It never silently regenerates media.
- Audio issues may be assessed with technical metrics; visual and semantic issues may require perception evidence.
- Repair execution belongs to runtime capabilities and their schemas, not this skill text.
- Do not use cache paths, Webview URIs, blob URLs, or scratch paths as durable media identity.
- Show concrete scores, issue categories, and specific remediation steps — don't be vague
`,
  allowedTools: [
    // Quality evaluation
    TOOL_NAMES_QUALITY.QUALITY_CHECK,
    TOOL_NAMES_QUALITY.QUALITY_REPAIR_CHECK,
    // Remediation: regeneration
    TOOL_NAMES_MEDIA.GENERATE_IMAGE,
    TOOL_NAMES_MEDIA.GENERATE_VIDEO,
    // Read-only context
    TOOL_NAMES_TIMELINE.GET_TIMELINE_INFO,
    TOOL_NAMES_TIMELINE.GET_ELEMENT_INFO,
    TOOL_NAMES_TIMELINE.LIST_TIMELINE_ELEMENTS,
    TOOL_NAMES_TIMELINE.ADD_EFFECT,
    TOOL_NAMES_TIMELINE.UPDATE_EFFECT,
    TOOL_NAMES_TIMELINE.SET_COLOR_CORRECTION,
    TOOL_NAMES_TIMELINE.SET_AUDIO_PROPERTIES,
  ],
  icon: '📊',
  source: 'builtin',
  enabled: true,
  domain: 'media',
  mediaWorkflow: {
    useCases: [
      'Evaluate quality of generated images, videos, audio, or timeline scenes',
      'Detect artifacts, prompt mismatch, style drift, blur, noise, clipping, or loudness issues',
      'Plan approved quality repair or regeneration for generated media',
    ],
    nonGoals: [
      'Generate new media without a quality evaluation or repair request',
      'Create storyboards, animation plans, Cut payloads, or export packages',
    ],
    acceptedModalities: ['image', 'video', 'audio', 'timeline'],
    inputArtifacts: ['generated-media-ref', 'timeline-scene', 'quality-evidence'],
    producedArtifacts: ['quality-report', 'repair-plan'],
    tags: ['quality', 'evaluation', 'repair', 'generated-media'],
    operations: ['quality-check', 'quality-repair', 'evaluate-media', 'plan-remediation'],
    optionalTools: [TOOL_NAMES_MEDIA.GENERATE_IMAGE, TOOL_NAMES_MEDIA.GENERATE_VIDEO],
    costLevel: 'medium',
    riskLevel: 'medium',
    validationRequirements: ['quality-report'],
  },
};
