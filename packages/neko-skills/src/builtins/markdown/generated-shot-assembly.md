# Generated Shot Assembly

Gather generated media refs, validate provenance, and summarize what can be assembled. Use timeline or Canvas tools only when the target is available and the user wants delivery.

## Structured Artifact Rules

- Markdown is presentation only. For storyboard, animation, Canvas, Cut, generated media, or execution summaries, emit validated structured payloads.
- Use actual tool-result or generated-asset references for media. Do not invent ids.
- Do not embed base64, blob URLs, localhost URLs, or absolute local cache paths.
- Ask for approval before bulk generation, colorization, destructive timeline replacement, or long export unless the user explicitly requested automatic execution and policy allows it.
