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
- Use the same prompt-slot-aware storyboard headers as comic-to-storyboard when the output is a storyboard table: `scene`, `shot`, `source`, `sourcePanel`, `decision`, `duration`, `visual`, `motion`, `audio`, `characters`, `dialogue`, `imagePrompt`, `videoPrompt`, `reviewStatus`, `nextAction`, `contentType`, `decisionReason`, `requiresSplit`, `duplicateOf`.
- For chat output, include `scene` + `shot` and either `source` or at least one prompt slot / legacy `prompt`; open review metadata columns are allowed when useful.
- Use `imagePrompt` for all image generation, image editing, redraw, and inpaint/outpaint intents; use `videoPrompt` only for scene-level video generation/editing intents. Do not write shot-level or single-shot video prompts in new output; put shot motion as ordered beats inside the scene-level `videoPrompt`. `nextAction` is plan text only, not an execution action.
- Resource references must state their purpose. Do not write only `P1`, `P2`, or `@character`; prompt text should say whether they are first-frame, composition, character-appearance, scene/background, action, camera, SFX, dialogue, or style references. Markdown table resource identity still belongs in the `source` column.
- For `imagePrompt`, generation should follow "subject and character appearance / scene location / composition and camera / style, color, and light / reference-consistency constraints"; editing should follow "input resource / preserved content / edit goal / ordered steps / output constraints", with explicit crop, rotate, remove text, inpaint, colorize, redraw, outpaint, upscale, or style-normalization steps.
- For `videoPrompt`, write scene-level "scene intent / reference resource roles / subject characters and emotion / scene environment / shot-numbered or time-coded action beats / camera transitions / environmental change or effects / dialogue, SFX, or silence / total duration / constraints". Prefer time-coded beats for long scenes or intents over 10 seconds.
- Every non-empty prompt must answer "which reference is used, what is being made, who the subject is, where it happens, how it moves or changes, how the camera behaves, how long it lasts, and what must be preserved or avoided"; otherwise leave it blank and use `nextAction` to request visual analysis or prompt optimization.
- Add extension columns such as `decisionReason`, `referenceImage`, `styleRef`, `requiresInpaint`, `requiresOutpaint`, or `risk` only when they help review or planning.
- Do not claim generated images or videos exist until a generation tool returns them.
