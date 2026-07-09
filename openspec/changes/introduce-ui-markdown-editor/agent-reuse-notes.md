## Agent Webview Markdown Reuse Notes

Agent Webview can consume `@neko/ui/markdown` as presentational React/Webview
primitives, but Agent policy remains in Agent-owned presenters, components, and
message handlers.

## Reusable Primitives

- `MarkdownInlineText` can render compact inline Markdown in message summaries,
  previews, and rich content labels when Agent injects mention/resource token
  renderers.
- `MarkdownPreview` can host lightweight preview text when Agent already has a
  projected resource/mention context from its presenters.
- `MarkdownGenerationPromptParts` can render generation/storyboard prompt
  strings as semantic inline chips over `@neko/markdown` prompt-part projection,
  while Agent still owns table layout, handoff policy, and action routing.
- `MarkdownDiagnostics` can display Agent-owned projection or handoff
  diagnostics, but it does not decide whether handoff, approval, or action
  execution succeeds.
- `InlineMarkdownEditor` can be considered later for prompt-like text inputs
  only when Agent can keep command routing, slash commands, attachment policy,
  selected files, and send behavior in the existing Agent InputArea boundary.

## Adapter Boundary

Agent adapters must provide:

- mention/resource renderers and labels;
- display URLs or preview metadata that were already authorized by Agent/host
  resource presenters;
- caller diagnostics from Agent presenter logic;
- completion providers that return text edits only.

`@neko/ui/markdown` must not import Agent components, resolve files, inspect
selected files, call send/handoff actions, invoke Canvas capabilities, or project
Extension/Webview resource URIs.

## Surfaces Not Migrated In This Change

- Agent Header, model/account/profile selectors, send-to menus, and chat session
  controls are not Markdown editing/rendering primitives and remain Agent-owned.
- Chat `InputArea` remains Agent-owned because it combines slash commands,
  attachment selection, model/provider state, send policy, and keyboard
  choreography.
- Existing Agent rich content and message renderers are not moved into
  `@neko/ui/markdown`; they may wrap shared Markdown primitives later through
  Agent-local adapters.

## Coverage

The `@neko/ui` markdown tests include a caller-rendered resource/mention example
that verifies shared UI exposes projected tokens to the renderer while leaving
resource resolution and mention policy unresolved and caller-owned.
They also cover generation prompt part chips so Agent and Canvas can converge on
the same visual vocabulary without sharing feature-package components.
