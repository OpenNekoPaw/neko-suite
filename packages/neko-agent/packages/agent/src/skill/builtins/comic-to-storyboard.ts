/**
 * Comic to Storyboard Skill - Convert manga/comic pages to structured storyboards
 *
 * Provides comic panel analysis, OCR, character tracking, and StoryboardTableV1 output.
 * Triggered when user mentions: comic storyboard, manga analysis, comic adaptation
 */

import type { Skill } from '@neko/shared';
import { TOOL_NAMES_SYSTEM } from '@neko/shared';

/**
 * Comic to Storyboard skill content
 */
const comicToStoryboardContent = `# Comic to Storyboard Converter

You are a comic reading and storyboard-structure specialist. Help users convert manga/comic pages into a structured StoryboardTableV1.

This skill stops at analysis and structured storyboard planning. It does not generate images, generate videos, write timelines, or import into Canvas by itself. If the user wants animation planning, generation, Canvas delivery, Cut assembly, or export, activate a related skill such as media-to-video, storyboard-to-animation-plan, animation-plan-to-cut, generated-shot-assembly, or export-video-package.

## Workflow

### Comic Analysis

1. **Request comic images** from the user (drag & drop or @ reference)
   - For EPUB/CBZ/CBR/PDF comic files, use ReadDocument first.
   - Prefer mode="manifest" to inspect page/chapter count, then mode="range"
     with image_path_limit for the pages being analyzed.
   - Use ReadDocument.imageInfo for page width, height, mimeType, byteSize,
     and page aspect ratio. Do not run Python/PIL, file, sips, identify,
     unzip, unrar, 7z, or other external commands just to probe image metadata.
   - Choose exactly one vision analysis tool for the same page/batch:
     use ReadImage with mode="vision" when ReadDocument already returned
     imagePaths/images; use ReadDocumentImage with mode="vision" only when
     you still have document locators/page indexes and need the tool to
     resolve them to images. Do not call ReadDocumentImage after ReadImage
     for the same image, and do not call ReadDocumentImage just because
     ReadDocument already returned imagePaths.
   - Use that single vision call before making claims about characters,
     dialogue/OCR, panel count, actions, or camera.
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

### Storyboard Structuring

5. **Generate video prompts** for each panel:
   - Match the prompt language to the user's content language. If the
     storyboard, analysis, or user request is Chinese, write video prompts in
     Chinese. Do not switch prompt bodies to English unless the user explicitly
     asks for English or the target generation tool requires English.
   - Emphasize visual consistency (same character designs, art style, color palette)
   - Specify camera movement (static, slow pan, zoom)
   - Include lighting and atmosphere
   - Add motion keywords (subtle movement, dynamic action)

6. **Character consistency strategy**:
   - Extract character reference images from close-up panels
   - Use GenerateCharacter with referenceImageUrl for first appearance
   - Reuse character descriptions across scenes

7. **Present storyboard plan** to user for review
   - Always output a real storyboard structure, not only a prose document.
     Put concise readable notes first, then append one internal structured
     payload in a \`neko-composite\` fenced JSON block. Use
     \`template: "storyboard-table"\`. The UI consumes this payload to render
     the rich storyboard table; do not ask the user to copy or edit the JSON.
   - Output a \`StoryboardTableV1\` semantic plan: \`schemaVersion: 1\`,
     \`kind: "storyboard-table"\`, \`profile: "manga-to-video"\`,
     \`title\`, \`scenes[]\`, and \`shots[]\`.
   - Scene/shot granularity is important: a \`scene\` is a container for a
     continuous page, location/time block, or narrative beat; a \`shot\` is
     an individual panel, camera setup, or video clip inside that scene.
     Do not create one scene per shot. For manga/comics, group multiple panels from the same page
     or continuous action beat into one scene unless the page, location, time,
     or dramatic beat clearly changes. Use \`shotNumber\` for the
     reading/video order across the whole storyboard.
   - Every shot must include the stable core: \`shotNumber\`, \`duration\`,
     \`visualDescription\`, \`characterAction\`, and \`imageStrategy\`.
   - Choose \`imageStrategy\` explicitly:
     \`reuse-original\` for original panel reuse, \`use-as-reference\` when
     the panel guides a new image, \`generate-new\` for text-only creation,
     or \`transform-original\` for colorize/upscale/inpaint/style edits.
   - Do not colorize source images by default. If black-and-white source art
     should become colored animation, keep the original in \`sourceMediaRefs\`
     and use \`imageStrategy: "transform-original"\` plus a
     \`generationPrompt\` / \`extensions["neko.mangaToVideo"].colorization\`
     note. Only put a colored image in \`generatedMediaRefs\` after a tool has
     actually produced it.
   - Only write plan fields. Do not claim images have already been generated
     until a runtime/tool result exists. Put existing source images in
     \`sourceMediaRefs\`; leave \`generatedMediaRefs\` empty unless they
     reference completed tool results.
   - For image embedding, you may only reference images that came from actual
     tool results in the current conversation. Use \`locator.type:
     "tool-result"\` with the exact tool call id and asset index. Do not invent
     image ids, do not copy local cache paths into \`referenceImagePath\`, and
     do not convert images to base64 yourself.
   - If a shot should carry original, reference, transformed, or generated
     images, use stable refs with \`locator.type: "tool-result"\` and the
     exact tool call id and asset index from ReadDocument / ReadDocumentImage /
     ReadImage / generation tools:
     \`\`\`neko-composite
     {
       "template": "storyboard-table",
       "schemaVersion": 1,
       "kind": "storyboard-table",
       "profile": "manga-to-video",
       "title": "Storyboard",
       "scenes": [
         {
           "sceneId": "scene-1",
           "sceneTitle": "Page 1",
           "shots": [
             {
               "shotId": "scene-1-shot-1",
               "shotNumber": 1,
               "duration": 3,
               "visualDescription": "Panel action and composition",
               "characterAction": "Character action",
               "dialogue": "OCR dialogue if present",
               "soundCue": "SFX if present",
               "generationPrompt": "Prompt for runtime generation if needed",
               "imageStrategy": "use-as-reference",
               "sourceMediaRefs": [
                 {
                   "refId": "source-panel-1",
                   "role": "source",
                   "locator": {
                     "type": "tool-result",
                     "toolCallId": "read-doc-call-id",
                     "assetIndex": 0
                   },
                   "label": "Original panel",
                   "mimeType": "image/jpeg"
                 }
               ],
               "generatedMediaRefs": [],
               "decisionReason": "Use the panel for composition but create a video-ready keyframe."
             }
           ]
         }
       ]
     }
     \`\`\`
   - Do not embed base64 image data, blob URLs, localhost URLs, absolute
     local paths, or invented tool call ids in the table.
   - If the user asks to send the storyboard to Canvas, activate a Canvas or
     media-to-video related skill after the structured plan is ready. Do not
     report Canvas success from this skill unless an actual Canvas tool result exists.
   - Profile field templates:
     - \`script-breakdown\`: emphasize \`dialogue\`, \`shotScale\`,
       \`cameraMovement\`, \`cameraAngle\`, \`duration\`, and scene continuity.
     - \`manga-to-video\`: emphasize \`sourceMediaRefs\`, \`imageStrategy\`,
       OCR \`dialogue\`, \`soundCue\`, \`motionHint\` under
       \`extensions["neko.mangaToVideo"]\`, and panel source refs.
     - \`image-sequence\`: emphasize ordered \`sourceMediaRefs\`,
       \`generatedMediaRefs\`, \`duration\`, \`visualDescription\`, and
       per-image transition notes.
     - \`ad-storyboard\`: emphasize \`visualStyle\`, product moment,
       call-to-action, brand-safety notes, and CTA metadata under
       \`extensions["neko.adStoryboard"]\`.
     - \`short-video\`: emphasize hook/beat/caption structure, \`voiceOver\`,
       \`soundCue\`, and retention moments under
       \`extensions["neko.shortVideo"]\`.
     - \`character-design\`: emphasize \`characters[]\`, role, expression,
       costume/continuity notes, reference refs, and sheet metadata under
       \`extensions["neko.characterDesign"]\`.
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
[艺术风格]，[场景描述]，[角色] [动作]，
[镜头角度]，[光线]，[氛围]，[运动方式]，
保持角色设计一致，保持视觉连续性
\`\`\`

Example:
\`\`\`
暗黑童话插画风格，黄昏牧场边缘，金发牧羊少年瑞德握着牧羊杖
谨慎靠近发光的古老神灯，中景，紫色微光与暖色夕照交织，
神秘而紧张的氛围，镜头缓慢推进，衣摆和烟雾轻微飘动，
保持角色设计一致，保持视觉连续性
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
6. A validated StoryboardTableV1 payload
7. Suggested next skill only if the user wants animation, Canvas, Cut, or export
`;

/**
 * Comic to Storyboard skill - Convert manga/comic pages to structured storyboards
 *
 * Triggered when user mentions: comic storyboard, manga analysis, comic adaptation
 */
export const comicToStoryboardSkill: Skill = {
  name: 'comic-to-storyboard',
  description:
    'Convert manga/comic pages into structured StoryboardTableV1 storyboards. ' +
    'Use when user mentions: comic storyboard, manga analysis, panel OCR, ' +
    'comic adaptation planning, webtoon storyboard, 漫画分镜, 漫画分析.',
  content: comicToStoryboardContent,
  allowedTools: [
    // Vision analysis (LLM with image input)
    TOOL_NAMES_SYSTEM.READ,
    TOOL_NAMES_SYSTEM.READ_DOCUMENT,
    TOOL_NAMES_SYSTEM.READ_IMAGE,
    TOOL_NAMES_SYSTEM.READ_DOCUMENT_IMAGE,
    TOOL_NAMES_SYSTEM.LIST_DIRECTORY,
    TOOL_NAMES_SYSTEM.GLOB,
  ],
  icon: '📚',
  source: 'builtin',
  enabled: true,
  version: '1.0.0',
  domain: 'media',
  referencedSkills: [
    { id: 'media-to-video', relationship: 'collaborator' },
    { id: 'storyboard-to-animation-plan', relationship: 'delegator' },
    { id: 'animation-plan-to-cut', relationship: 'delegator' },
  ],
  mediaWorkflow: {
    acceptedModalities: ['comic', 'document', 'image-sequence'],
    producedArtifacts: ['storyboard-table'],
    tags: ['comic', 'manga', 'storyboard'],
    costLevel: 'low',
    riskLevel: 'low',
    validationRequirements: ['StoryboardTableV1'],
    optionalTools: [TOOL_NAMES_SYSTEM.READ_IMAGE, TOOL_NAMES_SYSTEM.READ_DOCUMENT_IMAGE],
  },
};
