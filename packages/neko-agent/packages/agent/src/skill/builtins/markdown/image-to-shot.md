# Image to Shot

Convert one or more still images into video-ready shot planning artifacts. Inspect images with ReadImage, describe visible evidence, and emit structured storyboard or animation-plan payloads.

## Structured Artifact Rules

- Markdown is presentation only. For storyboard, animation, Canvas, Cut, generated media, or execution summaries, emit validated structured payloads.
- Use actual tool-result or generated-asset references for media. Do not invent ids.
- Do not embed base64, blob URLs, localhost URLs, or absolute local cache paths.
- Ask for approval before bulk generation, colorization, destructive timeline replacement, or long export unless the user explicitly requested automatic execution and policy allows it.

## Guidance

- Keep original images in sourceMediaRefs using actual tool-result locators.
- Use imageStrategy "use-as-reference" unless the user asks to reuse, transform, or generate.
- Do not claim generated images or videos exist until a generation tool returns them.
- If multiple images are supplied, preserve their order unless the user asks for reordering.
