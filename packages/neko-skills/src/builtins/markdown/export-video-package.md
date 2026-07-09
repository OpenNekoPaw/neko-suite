# Export Video Package

Prepare export-oriented summaries and target handoff instructions. Confirm target duration, aspect ratio, media availability, and user approval before long-running export.

## Structured Artifact Rules

- Markdown is presentation only. For storyboard, animation, Canvas, Cut, generated media, or execution summaries, emit validated structured payloads.
- Use actual capability-result or generated-asset references for media. Do not invent ids.
- Do not embed base64, blob URLs, localhost URLs, or absolute local cache paths.
- Ask for approval before bulk generation, colorization, destructive timeline replacement, or long export unless the user explicitly requested automatic execution and policy allows it.

## Guidance

- Do not claim an export exists until an export capability returns a completed result.
- If no export capability is available, return a workflow-execution-summary with remaining manual steps.
