/**
 * Quality Assessment Skill — Evaluate AI-generated media and propose fixes
 *
 * Invoked explicitly or by Agent `ActivateSkill` after the Agent decides a
 * quality-assessment workflow is needed.
 *
 * Uses QualityCheck tool (VisionEvaluator for images, AudioEvaluator for audio)
 * and RemediationPlanner for deterministic fix suggestions.
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

You help users evaluate the quality of AI-generated media and fix detected issues after approval.

## Workflow

### Step 1: Evaluate Media
Call **QualityCheck** with the scenes to evaluate.

Parameters:
- \`scenes\`: Array of \`{ index, mediaPath, prompt, description? }\`
- \`minScore\`: Minimum passing score (default 60, range 0-100)
- \`maxRetries\`: Ignored by read-only QualityCheck. Use QualityRepairCheck for retry/regeneration.
- \`style\`: Global style context (e.g., "anime", "cinematic")
- \`sceneDialogue\`: Dialogue lines for script adherence check

Example:
\`\`\`json
{
  "scenes": [
    { "index": 0, "mediaPath": "generated-assets/scene-0.png", "prompt": "A sunset over mountains" }
  ],
  "minScore": 70,
  "style": "cinematic"
}
\`\`\`

### Step 2: Interpret Results
The tool returns structured evaluation results:

- **overallScore** (0-100): Composite quality score
- **dimensions**: Per-dimension breakdown
  - \`technicalQuality\`: Clarity, sharpness, artifacts
  - \`promptAdherence\`: How well it matches the prompt
  - \`aesthetics\`: Visual appeal, composition
  - \`audioQuality\`: Audio-only — loudness, clipping, noise
- **issues[]**: Structured problems detected
  - Each has \`category\`, \`severity\` (critical/major/minor/info), \`description\`
- **remediations[]**: Suggested fixes with tool names and parameters

### Step 3: Apply Fixes
QualityCheck is read-only evidence. Based on remediations, ask for approval or use an approved repair path before modifying media or timeline state:

| Remediation Type | Tool | Example |
|------------------|------|---------|
| \`apply-effect\` | **AddEffect** | Denoise filter: \`{ effectType: "denoise", strength: 0.7 }\` |
| \`color-correct\` | **SetColorCorrection** | Auto correct: \`{ autoCorrect: true }\` |
| \`adjust-audio\` | **SetAudioProperties** | Normalize: \`{ normalize: true, targetLufs: -14 }\` |
| \`regenerate\` | **GenerateImage** / **GenerateVideo** | Re-generate with improved prompt |
| \`regenerate-ref\` | **GenerateImage** | Re-generate with IP-Adapter reference |
| \`manual-review\` | — | Flag for user review, no auto-fix |

For regeneration repair attempts, use **QualityRepairCheck** only after explicit approval or policy opt-in. It may regenerate failed image/video scenes and reports those outputs as repair attempts.

### Step 4: Report
Summarize results in a clear table:
- Total scenes, passed/failed counts
- Per-scene score, top issues, and applied fixes
- Overall recommendation (approve / fix specific scenes / regenerate all)

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
- Only evaluate when user explicitly requests — each **image** evaluation costs a vision LLM call
- **Audio evaluation is free** — uses Engine technical metrics (LUFS, true peak, silence), no LLM
- QualityCheck never regenerates media; failed scenes remain evidence for Agent rationale
- Audio scenes never retry — issues are fixed deterministically via ToolSet tools after approval
- Do not pass .neko/.cache, Webview URI, blob URL, or scratch paths as media identity; use stable generated asset refs, source refs, or host-resolved media refs.
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
  // Slash command: /quality-check
  command: 'quality-check',
  argumentHint: '[media path or scene indices]',
  supportsArguments: true,
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
