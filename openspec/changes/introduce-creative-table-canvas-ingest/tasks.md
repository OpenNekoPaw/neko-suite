## 1. Contract And Boundary Audit

- [x] 1.1 Audit current Canvas Markdown DTOs, Webview messages, lifecycle result actions, and plugin-transfer leftovers; record which types are reused, extended, removed, or kept Canvas-private.
- [x] 1.2 Define the minimal shared ingest DTOs in the selected boundary (`@neko/shared` or Canvas public API): ingest input, resolved kind, table preview, creative profile id, field role, diagnostics, and action refs.
- [x] 1.3 Add validators/type guards for ingest DTOs, creative field roles, resolved kinds, profile hints, resources, diagnostics, and runtime-only resource rejection.
- [x] 1.4 Add contract tests proving invalid capability ids, invalid profile hints, runtime-only resource identities, and malformed action refs fail visibly.

## 2. Canvas Table Core

- [x] 2.1 Extract or refactor Markdown table parsing into a Canvas-owned Table Core helper that returns original Markdown, columns, rows, cells, row locations where available, and parse diagnostics.
- [x] 2.2 Generalize media/resource token extraction so generic tables and creative tables can bind resource-like cells and CommonMark image targets when stable resources are provided.
- [x] 2.3 Preserve unknown columns and raw cells in Canvas table metadata for both generic and creative tables.
- [x] 2.4 Add tests for generic table media binding, missing/ambiguous resource diagnostics, unknown-column preservation, and rejection of Webview/blob/cache/temp/Engine handles.

## 3. Creative Table Profiles

- [x] 3.1 Define Canvas-owned `CreativeTableProfile` descriptors with profile id, aliases, fields, aliases, value type, field role, resource/prompt/action metadata, validation rules, and follow-up action descriptors.
- [x] 3.2 Implement profile validation for duplicate profile aliases, duplicate field ids, conflicting field aliases, unsupported field roles/types, and unknown execution action ids.
- [x] 3.3 Add a generic table profile that has no creative roles but can still use Table Core media display.
- [x] 3.4 Convert the current storyboard draft aliases and validation behavior into a built-in `storyboard` Creative Table profile, with `storyboard-draft` as an alias.
- [x] 3.5 Add tests proving storyboard maps fields into approval/plan/execution roles and no longer depends on `@neko/storyboard-draft`, `@neko/draft-runtime`, or `StoryboardDraftNormalized`.

## 4. Canvas Markdown Ingest

- [x] 4.1 Implement `canvas.ingestMarkdown` or an equivalent Canvas Markdown facade that resolves Markdown to note, generic table, or creative table using source format, hints, and safe detection.
- [x] 4.2 Implement generic display fallback for unsupported/invalid creative profiles with diagnostics and without creative actions or execution readiness.
- [x] 4.3 Keep existing specific capabilities (`createMarkdownNote`, `createTableFromMarkdown`, `createStoryboardDraftFromMarkdown`, `createStoryboardFromMarkdown`) working as wrappers or lower-level handlers where still needed.
- [x] 4.4 Ensure production storyboard node creation remains explicit, approval-gated, and blocked when required fields/resources/actions are missing.
- [x] 4.5 Add Canvas capability tests for note ingest, generic table ingest, creative/storyboard ingest, fallback, approval-required production creation, and path-level old-route poisoning.

## 5. Agent Webview Handoff

- [x] 5.1 Replace Webview-default Canvas ingest projection with an Agent handoff request projection for assistant Markdown blocks.
- [x] 5.2 Pass stable resource refs from Markdown resource rendering projections into the Agent handoff context while excluding render URIs and runtime-only handles.
- [x] 5.3 Move intent/profile hint interpretation to Agent tool selection; Webview may preserve declared hints as context but MUST NOT choose the final Canvas capability/profile.
- [x] 5.4 Keep the visible UI as one primary `Send to Canvas` action; the button is a fast trigger for Agent operation, not a Canvas command shortcut.
- [x] 5.5 Add Webview presenter/component tests proving Markdown handoffs route through Agent tool selection, not direct Canvas ingest, direct generic/storyboard menu branching, or old plugin-transfer payloads.

## 6. Lifecycle Action UI

- [x] 6.1 Replace inert `Next actions` text-only rendering for Canvas lifecycle results with a structured result projection that includes status, diagnostics, refs, and action controls.
- [x] 6.2 Add Webview controls for supported lifecycle follow-up actions that invoke the Agent/capability lifecycle backend with required approval context rather than calling Canvas directly.
- [x] 6.3 Add disabled/diagnostic rendering for unsupported follow-up actions instead of inventing fallback commands.
- [x] 6.4 Add Extension route tests proving mutating follow-up actions without approval return `waiting-approval` and approved actions re-enter the lifecycle backend.
- [x] 6.5 Add Webview tests proving follow-up actions are actionable through Agent/capability lifecycle and generic fallback does not present creative execution controls.

## 7. Skill And Prompt Alignment

- [x] 7.1 Update comic/storyboard Skill guidance to describe creative table approval fields, plan fields, execution fields, media tokens, prompt fields, and Canvas ingest intent.
- [x] 7.2 Update media-to-video and related Skill prompts to avoid presenting `StoryboardDraft` as a fixed protocol or old compiler path.
- [x] 7.3 Add prompt/Skill tests proving guidance mentions Creative Table roles, stable resource refs, Canvas ingest/capability handoff, and forbidden runtime handles.

## 8. Legacy Cleanup

- [x] 8.1 Remove or fail-close any remaining new-request routes that target `canvasStructuredContent`, `canvasStoryboard`, direct storyboard compiler payloads, `@neko/storyboard-draft`, `@neko/draft-runtime`, or `StoryboardDraftNormalized`.
- [x] 8.2 Rename current `storyboard-draft` implementation identifiers that imply a standalone runtime where practical, keeping aliases only at profile/capability boundaries.
- [x] 8.3 Update ADR/OpenSpec references or package docs touched by this change so new documentation says `storyboard` is a Creative Table profile, not the canonical protocol.
- [x] 8.4 Add poison-path tests proving old handoff/compiler routes cannot return success for new Markdown Send to Canvas requests.

## 9. Validation

- [x] 9.1 Run focused shared contract tests covering Canvas Markdown/creative table DTO validators.
- [x] 9.2 Run focused Canvas extension tests for Markdown ingest, Table Core, Creative Table profiles, and production storyboard gating.
- [x] 9.3 Run focused Agent Webview tests for resource rendering, Send to Canvas ingest projection, and lifecycle action UI.
- [x] 9.4 Run focused Agent Extension route tests for Canvas ingest invocation and approval-gated follow-up actions.
- [x] 9.5 Run `openspec validate introduce-creative-table-canvas-ingest --strict`.
- [x] 9.6 Run affected package typechecks/compiles for `@neko/shared`, `neko-agent`, Agent Webview, and `neko-canvas`.
- [x] 9.7 Run a real VS Code Webview functional scenario for Markdown table rendering, media thumbnails, primary Send to Canvas, generic fallback diagnostics, and one approval-gated follow-up action.
