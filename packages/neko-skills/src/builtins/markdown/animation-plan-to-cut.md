# Animation Plan to Cut

Convert animation plans into Cut-ready timeline payloads. Query timeline context first, preserve shot order, and avoid destructive replacement unless approved.

## Structured Artifact Rules

- Markdown is presentation only. For storyboard, animation, Canvas, Cut, generated media, or execution summaries, emit validated structured payloads.
- Use actual capability-result or generated-asset references for media. Do not invent ids.
- Do not embed base64, blob URLs, localhost URLs, or absolute local cache paths.
- Ask for approval before bulk generation, colorization, destructive timeline replacement, or long export unless the user explicitly requested automatic execution and policy allows it.

## Guidance

- Use existing generated media refs or `resultRef` values when available.
- If media is missing, produce a Cut payload draft and mark missing assets clearly.
- Ask before replacing an existing timeline or adding many elements.
