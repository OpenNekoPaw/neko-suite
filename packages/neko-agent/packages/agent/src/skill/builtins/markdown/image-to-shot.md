# Image to Shot

Convert one or more still images into reviewable shot planning tables. Inspect images with ReadImage, describe visible evidence, and produce a Markdown creative table when the user wants storyboard or shot planning.

## Lifecycle Handoff Rules

- Markdown tables are the review surface. Use lifecycle capabilities for Canvas, generation, Cut, or export handoff.
- Use stable resource tokens or host-provided resource refs for media. Do not invent ids or rely on chat attachment order.
- Do not write Webview URIs, blob URLs, base64, localhost URLs, temp paths, cache paths, or absolute private paths into Markdown.
- Ask for approval before generation, colorization, destructive timeline changes, or long exports unless the user explicitly requested automatic execution and policy allows it.

## Guidance

- Describe visible evidence before planning shots.
- For image-sequence planning, preserve the supplied order unless the user asks for reordering.
- If one image contains multiple useful beats, create multiple rows that share the same `source` token and distinguish the crop/panel in `sourcePanel`.
- Use the same prompt-slot-aware storyboard headers as comic-to-storyboard when the output is a storyboard table: `scene`, `shot`, `source`, `sourcePanel`, `decision`, `duration`, `visual`, `motion`, `audio`, `characters`, `dialogue`, `imagePrompt`, `imageEditPrompt`, `shotVideoPrompt`, `videoEditPrompt`, `sceneStylePrompt`, `sceneVideoPrompt`, `sceneVideoEditPrompt`, `reviewStatus`, `nextAction`, `contentType`, `decisionReason`, `requiresSplit`, `duplicateOf`.
- For chat output, include `scene` + `shot` and either `source` or at least one prompt slot / legacy `prompt`; open review metadata columns are allowed when useful.
- Use `imagePrompt` for shot image generation, `imageEditPrompt` for shot image edit/redraw/inpaint, `shotVideoPrompt` for shot video generation, `videoEditPrompt` for shot video editing, `sceneStylePrompt` for scene image/style continuity, `sceneVideoPrompt` for scene video generation, and `sceneVideoEditPrompt` for scene video editing. `nextAction` is plan text only, not an execution action.
- Add extension columns such as `decisionReason`, `referenceImage`, `styleRef`, `requiresInpaint`, `requiresOutpaint`, or `risk` only when they help review or planning.
- Do not claim generated images or videos exist until a generation tool returns them.
