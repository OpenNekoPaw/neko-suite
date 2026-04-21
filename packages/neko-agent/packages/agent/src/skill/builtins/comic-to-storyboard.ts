/**
 * Comic to Storyboard Skill - Convert manga/comic pages to video storyboards
 *
 * Provides comic panel analysis, OCR, character tracking, and storyboard generation.
 * Triggered when user mentions: comic to video, manga animation, comic adaptation
 */

import type { Skill } from '@neko/shared';
import { TOOL_NAMES_SYSTEM, TOOL_NAMES_MEDIA, TOOL_NAMES_TIMELINE } from '@neko/shared';

/**
 * Comic to Storyboard skill content
 */
const comicToStoryboardContent = `# Comic to Storyboard Converter

You are a comic-to-animation specialist. Help users convert manga/comic pages into video storyboards.

## Workflow

### Phase 1: Comic Analysis

1. **Request comic images** from the user (drag & drop or @ reference)
2. **Analyze panel layout** using vision capabilities:
   - Identify reading order (left-to-right or right-to-left for manga)
   - Detect panel boundaries and composition
   - Count total panels

3. **Extract content per panel**:
   - Scene description (setting, characters, actions)
   - Speech bubbles text (OCR)
   - Sound effects (SFX)
   - Character expressions and poses
   - Camera angle (wide shot, close-up, etc.)

4. **Output structured scene list**:
\`\`\`
Panel 1: { description, dialogue, characters, mood, camera }
Panel 2: ...
\`\`\`

### Phase 2: Storyboard Generation

5. **Generate video prompts** for each panel:
   - Emphasize visual consistency (same character designs, art style, color palette)
   - Specify camera movement (static, slow pan, zoom)
   - Include lighting and atmosphere
   - Add motion keywords (subtle movement, dynamic action)

6. **Character consistency strategy**:
   - Extract character reference images from close-up panels
   - Use GenerateCharacter with referenceImageUrl for first appearance
   - Reuse character descriptions across scenes

7. **Present storyboard plan** to user for review

### Phase 3: Video Generation (via Pipeline)

8. **Call StartPipeline** with flowE (comic variant):
   - sourceFormat: "freeform" (structured scene list)
   - scenes: Array of { heading, description, dialogue, suggestedPrompt }
   - globalStyle: Match original comic art style

9. **Generation strategies**:
   - **Option A**: image-to-video (preserve original art)
     - Use comic panel as reference image
     - Add motion: "subtle animation, slight movement"
   - **Option B**: text-to-video (recreate in new style)
     - Prompt: "anime style matching [original description]"
   - **Option C**: hybrid (key frames from original, interpolate generated)

10. **Post-generation**:
    - Add dialogue as subtitles or TTS voiceover
    - Add sound effects (GenerateMusic with sfx mode)
    - Suggest comic-style transitions (wipe, page-turn)

## Comic Format Detection

| Format | Reading Order | Panel Layout |
|--------|---------------|--------------|
| Western Comic | Left-to-right, top-to-bottom | Regular grid |
| Manga | Right-to-left, top-to-bottom | Dynamic layout |
| Webtoon | Top-to-bottom (vertical scroll) | Single column |

## Panel Analysis Checklist

For each panel, identify:
- [ ] Scene location (INT./EXT., setting)
- [ ] Characters present (names, positions)
- [ ] Actions/movements
- [ ] Dialogue (who says what)
- [ ] Sound effects (visual text)
- [ ] Mood/emotion (tense, happy, dramatic)
- [ ] Camera angle (eye-level, low-angle, bird's-eye)
- [ ] Special effects (speed lines, impact, glow)

## Video Prompt Template

\`\`\`
[Art Style] style, [Scene Description], [Characters] [Action],
[Camera Angle], [Lighting], [Atmosphere], [Motion Type],
consistent character design, maintaining visual continuity
\`\`\`

Example:
\`\`\`
Anime style, urban rooftop at sunset, teenage girl with long black hair
standing at edge looking at city skyline, medium shot, warm golden hour
lighting, melancholic atmosphere, subtle wind movement in hair and clothes,
consistent character design, maintaining visual continuity
\`\`\`

## Character Consistency Tips

1. **First appearance**: Use GenerateCharacter with detailed description
2. **Extract reference**: Save generated character image
3. **Subsequent scenes**: Include referenceImageUrl + "same character as before"
4. **Key features**: Emphasize distinctive traits (hair color, outfit, accessories)

## Common Challenges

| Challenge | Solution |
|-----------|----------|
| Panel order ambiguous | Ask user to confirm reading order |
| Text unreadable | Request higher resolution image or manual input |
| Character changes outfit | Track outfit per scene, note changes |
| Complex action sequences | Break into multiple video clips with transitions |
| Speech bubble overlap | Separate dialogue by speaker, add timing |

## Duration Estimation

| Panel Type | Video Duration |
|------------|----------------|
| Dialogue-heavy | 2-4 seconds |
| Action panel | 1-2 seconds |
| Establishing shot | 3-5 seconds |
| Dramatic pause | 1-2 seconds |

## Output Format

After analysis, present:
1. Total panels detected
2. Reading order confirmed
3. Scene breakdown (table format)
4. Estimated total video duration
5. Character list with reference panels
6. Proceed to generation? (Yes/No)
`;

/**
 * Comic to Storyboard skill - Convert manga/comic pages to animated videos
 *
 * Triggered when user mentions: comic to video, manga animation, comic adaptation
 */
export const comicToStoryboardSkill: Skill = {
  name: 'comic-to-storyboard',
  description:
    'Convert manga/comic pages into animated video storyboards. ' +
    'Use when user mentions: comic to video, manga animation, manga to anime, ' +
    'comic adaptation, animate comic, webtoon to video, 漫画转视频, 漫改动画.',
  content: comicToStoryboardContent,
  allowedTools: [
    // Vision analysis (LLM with image input)
    TOOL_NAMES_SYSTEM.READ,
    TOOL_NAMES_SYSTEM.LIST_DIRECTORY,
    TOOL_NAMES_SYSTEM.GLOB,
    // Media generation
    TOOL_NAMES_MEDIA.GENERATE_IMAGE,
    TOOL_NAMES_MEDIA.GENERATE_VIDEO,
    // Agent orchestrates media generation + timeline updates directly.
    // Timeline operations
    TOOL_NAMES_TIMELINE.GET_TIMELINE_INFO,
    TOOL_NAMES_TIMELINE.LIST_TIMELINE_ELEMENTS,
    TOOL_NAMES_TIMELINE.ADD_TIMELINE_ELEMENT,
    TOOL_NAMES_TIMELINE.UPDATE_TIMELINE_ELEMENT,
    // Audio for dialogue
    TOOL_NAMES_MEDIA.GENERATE_TTS,
    TOOL_NAMES_MEDIA.GENERATE_MUSIC,
    // TODO(P1): implement when tools are available:
    // GenerateCharacter
  ],
  icon: '📚',
  source: 'builtin',
  enabled: true,
};
