## 1. Contract and Boundary Audit

- [x] 1.1 Audit current Agent capability provider, tool result, Canvas Markdown capability, plugin transfer, Webview shortcut, and workflow/permission call paths.
- [x] 1.2 Decide whether lifecycle descriptors extend `getArtifactFacets()` or use a new optional `getLifecycleCapabilities()` provider method, and record the reason in the implementation summary.
- [x] 1.3 Define shared lifecycle phase, descriptor, invocation input, invocation result, diagnostic, artifact ref, action, approval, and status DTOs in the selected shared contract location.
- [x] 1.4 Add strict validators/type guards for lifecycle descriptors, invocations, results, actions, approval context, artifact refs, and runtime-only resource identity rejection.
- [x] 1.5 Add contract tests for valid lifecycle DTOs, invalid descriptor/result mismatches, unknown capability ids, missing handlers, and rejected runtime-only resource handles.

## 2. Provider Registration and Invocation Runtime

- [x] 2.1 Extend Agent capability registration to collect lifecycle descriptors alongside tools, prompt fragments, provider cards, and artifact facets.
- [x] 2.2 Add a lifecycle descriptor registry with provider id, capability id, phase support, schema ids, risk, approval, and target metadata.
- [x] 2.3 Implement a local lifecycle invocation service that resolves descriptors and handlers without importing feature package internals.
- [x] 2.4 Wire permission, `requiresConfirmation`, `safetyKind`, `targetRequirements`, and query-before-mutate checks into lifecycle apply/execute phases.
- [x] 2.5 Pass workflow/creation context through lifecycle invocations when available, and require explicit approval context for mutating apply phases.
- [x] 2.6 Adapt lifecycle invocation results into existing Agent tool/event rendering without relying on untyped `ToolResult.data` for generic diagnostics/actions.
- [x] 2.7 Add runtime tests for descriptor registration, missing handler failure, permission blocking, approved apply execution, and workflow/creation context propagation.

## 3. Canvas Markdown Lifecycle Adapter

- [x] 3.1 Register Canvas Markdown note, table, storyboard draft, storyboard apply, attach resource, and validate capabilities as lifecycle descriptors.
- [x] 3.2 Adapt existing Canvas Markdown input/output DTOs to the generic lifecycle invocation envelope while preserving Canvas-owned capability DTO validators.
- [x] 3.3 Ensure validation/review phases do not create production Canvas nodes, and apply phase revalidates before production node creation.
- [x] 3.4 Replace `mode: "create-nodes"` as the only production guard with lifecycle approval context plus Canvas revalidation.
- [x] 3.5 Return executable lifecycle actions from Canvas review results with capability id, phase, approval requirement, and source draft/artifact ref.
- [x] 3.6 Add Canvas tests for validate/review/apply phases, blocked unapproved apply, executable action metadata, and revalidation after source mismatch.

## 4. Canvas Table Profiles

- [x] 4.1 Introduce a Canvas-owned table profile descriptor and registry for Markdown table interpretation.
- [x] 4.2 Move storyboard column aliases, required/recommended fields, resource field hints, and review/apply action metadata behind a storyboard table profile.
- [x] 4.3 Add a generic table profile/path that preserves arbitrary columns and does not infer storyboard production semantics.
- [x] 4.4 Preserve unknown columns as review/display metadata unless the selected profile explicitly rejects them.
- [x] 4.5 Update Webview/Agent capability projection so generic tables do not depend on narrow storyboard header matching for correctness.
- [x] 4.6 Add table profile tests for storyboard, generic table, unknown columns, field alias variants, resource columns, and unsupported profile diagnostics.

## 5. Agent Webview Shortcut Routing

- [x] 5.1 Replace direct Canvas Markdown Webview invocation routing with the shared lifecycle invocation backend or an equivalent Extension facade that enforces the same descriptor and approval rules.
- [x] 5.2 Keep `Send to Canvas` as a UI shortcut, but make it send lifecycle invocation input rather than plugin transfer payloads or direct Canvas API calls.
- [x] 5.3 Surface lifecycle diagnostics, review artifacts, executable actions, changed refs, and approval-needed states in Agent Webview.
- [x] 5.4 Ensure Webview passes Markdown text, stable resource refs, target, provenance, and source format only; rendered HTML, projected URIs, DOM state, and runtime handles must not enter invocation payloads.
- [x] 5.5 Add Webview and Extension bridge tests proving shortcut requests hit the lifecycle backend and return lifecycle result envelopes.

## 6. Legacy Transfer Cleanup

- [x] 6.1 Identify remaining `canvasStoryboard`, `canvasText`, `canvasPrompt`, and `canvasStructuredContent` paths that can still create Canvas content from Agent output.
- [x] 6.2 Remove Markdown authoring draft requests from legacy plugin transfer and direct Canvas import command paths.
- [x] 6.3 Document removed structured-result transfer behavior with replacement path and validation command.
- [x] 6.4 Remove or poison old Markdown authoring presenter/compiler fixtures that let new lifecycle tests pass through legacy payloads.
- [x] 6.5 Add path-level tests proving lifecycle-enabled Markdown authoring cannot return success through plugin transfer fallback, direct import commands, or deleted draft-runtime/compiler paths.

## 7. Skill and Prompt Alignment

- [x] 7.1 Update relevant creative/storyboard skill prompts to describe lifecycle-backed Canvas actions instead of implying raw Canvas node JSON, fixed compiler payloads, or filename/order binding.
- [x] 7.2 Add prompt guidance for review-first drafts, executable next actions, stable resource tokens/refs, and profile hints where useful.
- [x] 7.3 Keep skill-added Markdown table fields extensible by explaining that unknown columns are review metadata unless the selected Canvas profile consumes them.
- [x] 7.4 Add prompt snapshot or built-in skill tests proving prompts do not ask models to output Webview URIs, blob URLs, cache paths, temp paths, Canvas node JSON, or legacy transfer payloads.

## 8. Validation

- [x] 8.1 Run focused tests for shared lifecycle DTO validators and type guards.
- [x] 8.2 Run Agent capability registry/invocation runtime tests.
- [x] 8.3 Run Canvas Markdown capability and table profile tests.
- [x] 8.4 Run Agent Webview shortcut, Markdown renderer, and Extension bridge tests.
- [x] 8.5 Run legacy poison-path tests for plugin transfer and old Markdown authoring paths.
- [x] 8.6 Run package compile/typecheck for affected packages: shared contract package, `neko-agent`, `neko-agent/webview`, and `neko-canvas`.
- [x] 8.7 Run boundary/debt checks relevant to legacy cleanup, including `pnpm check:legacy-debt` or the narrower guardrails available in the repository.
- [x] 8.8 Run VS Code Webview runtime smoke with `vscode-extension-debugger` for rendering a Markdown table with resources and invoking `Send to Canvas` through the lifecycle path.
- [x] 8.9 Run `openspec validate introduce-agent-capability-lifecycle --strict`.
