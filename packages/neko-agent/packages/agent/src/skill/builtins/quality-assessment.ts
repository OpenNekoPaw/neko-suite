/**
 * Quality Assessment Skill — Evaluate AI-generated media and auto-fix issues
 *
 * Triggered by semantic matching (quality check, evaluate media, 质量检查, etc.)
 * or slash command: /quality-check
 *
 * Uses QualityCheck tool (VisionEvaluator for images, AudioEvaluator for audio)
 * and RemediationPlanner for deterministic fix suggestions.
 */

import type { Skill } from '@neko/shared';

export const qualityAssessmentSkill: Skill = {
  name: 'quality-assessment',
  description:
    'Evaluate quality of AI-generated images, videos, and audio. ' +
    'Detect issues (artifacts, blur, noise, style drift, clipping, loudness) and suggest auto-fixes. ' +
    'Use when user mentions: check quality, evaluate media, assess image, review generated, ' +
    'quality issues, is this good enough, rate this, 质量检查, 评估质量, 画面质量, 音频质量, ' +
    '检查画面, 有没有问题.',
  content: `# Media Quality Assessment Assistant

You help users evaluate the quality of AI-generated media and fix detected issues.

## Workflow

### Step 1: Evaluate Media
Call **QualityCheck** with the scenes to evaluate.

Parameters:
- \`scenes\`: Array of \`{ index, mediaPath, prompt, description? }\`
- \`minScore\`: Minimum passing score (default 60, range 0-100)
- \`maxRetries\`: Auto-retry count for failed image scenes (default 2; audio skips retry)
- \`style\`: Global style context (e.g., "anime", "cinematic")
- \`sceneDialogue\`: Dialogue lines for script adherence check

Example:
\`\`\`json
{
  "scenes": [
    { "index": 0, "mediaPath": "/tmp/scene-0.png", "prompt": "A sunset over mountains" }
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
Based on remediations, use the corresponding tools:

| Remediation Type | Tool | Example |
|------------------|------|---------|
| \`apply-effect\` | **AddEffect** | Denoise filter: \`{ effectType: "denoise", strength: 0.7 }\` |
| \`color-correct\` | **SetColorCorrection** | Auto correct: \`{ autoCorrect: true }\` |
| \`adjust-audio\` | **SetAudioProperties** | Normalize: \`{ normalize: true, targetLufs: -14 }\` |
| \`regenerate\` | **GenerateImage** / **GenerateVideo** | Re-generate with improved prompt |
| \`regenerate-ref\` | **GenerateImage** | Re-generate with IP-Adapter reference |
| \`manual-review\` | — | Flag for user review, no auto-fix |

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
- Image scenes that fail will auto-retry with optimized prompts (up to maxRetries)
- Audio scenes never retry — issues are fixed deterministically via ToolSet tools
- Show concrete scores, issue categories, and specific remediation steps — don't be vague
`,
  allowedTools: [
    // Quality evaluation
    'QualityCheck',
    // Remediation: effects
    'AddEffect',
    'UpdateEffect',
    // Remediation: color correction
    'SetColorCorrection',
    // Remediation: audio
    'SetAudioProperties',
    // Remediation: regeneration
    'GenerateImage',
    'GenerateVideo',
    // Read-only context
    'GetTimelineInfo',
    'ListElements',
    'GetElementInfo',
  ],
  icon: '📊',
  source: 'builtin',
  enabled: true,
  // Slash command: /quality-check
  command: 'quality-check',
  argumentHint: '[media path or scene indices]',
  supportsArguments: true,
};
