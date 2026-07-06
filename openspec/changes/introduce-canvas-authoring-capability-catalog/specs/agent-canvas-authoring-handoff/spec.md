## ADDED Requirements

### Requirement: Send to Canvas creates Agent handoff intent
Agent Webview SHALL treat `Send to Canvas` and equivalent chat shortcuts as Agent handoff affordances, not direct Canvas command buttons.

#### Scenario: User sends content to Canvas
- **WHEN** a user activates `Send to Canvas` on Markdown, generated text, structured content, or resource-backed content in Agent chat
- **THEN** Agent Webview MUST create an Agent-visible handoff intent containing source content, source kind, title, stable resource refs, provenance, optional target hints, and user intent
- **AND** Agent MUST decide whether to activate Canvas guidance, query Canvas context/catalog, call Canvas tools, ask approval, use asset import, or explain why Canvas is not appropriate

#### Scenario: Shortcut would otherwise call Canvas directly
- **WHEN** a Webview shortcut has enough data to invoke a Canvas command directly
- **THEN** it MUST still route authoring-capable content through Agent handoff unless the affordance is explicitly labeled as direct import/add-source
- **AND** tests MUST prove the shortcut does not mutate Canvas before Agent-selected Canvas tools or capabilities run

#### Scenario: Agent declines Canvas usage
- **WHEN** Agent determines that Canvas is not appropriate for the handoff content or current context
- **THEN** Agent MAY respond with an explanation or ask for clarification
- **AND** Canvas MUST NOT be mutated by the shortcut itself

#### Scenario: Markdown projection provides handoff refs
- **WHEN** `Send to Canvas` is activated on Markdown with resource, mention, creative table, or semantic prompt projections
- **THEN** the handoff intent MUST reuse `@neko/markdown` projection stable refs, diagnostics, and profile hints where available
- **AND** Webview MUST NOT re-resolve resources or mentions through a second incompatible parser before creating the handoff intent

### Requirement: Direct asset import is distinct from Agent authoring
Agent UI and Extension routes SHALL distinguish direct asset import/add-source behavior from Agent-led Canvas authoring.

#### Scenario: User imports a generated image asset
- **WHEN** a user chooses an explicitly labeled direct asset import/add-source action for Canvas
- **THEN** the Extension MAY call the Canvas asset import command with a stable promoted asset ref or authorized source
- **AND** the UI/result copy MUST NOT present that operation as Agent-authored Canvas node composition

#### Scenario: User uses Send to Canvas for an image or asset
- **WHEN** a user activates `Send to Canvas` rather than a direct import/add-source action for an image or asset
- **THEN** Agent MUST receive the handoff intent and decide whether to call Canvas media node creation, resource attachment, direct import, or another Canvas tool
- **AND** Webview MUST NOT silently collapse the shortcut into `neko.canvas.importAsset`

### Requirement: Agent owns Canvas Skill activation and tool selection
Agent SHALL own activation of Canvas authoring guidance and selection of Canvas tools for handoff requests.

#### Scenario: Handoff reaches Agent
- **WHEN** Agent receives a Canvas handoff intent
- **THEN** Agent MUST be able to inspect registered Skills/tools through context, activate the Canvas authoring Skill when useful, and choose Canvas query/mutation tools
- **AND** Extension or Webview MUST NOT pre-activate the Canvas Skill or choose a Canvas tool through keyword matching before Agent reasoning

#### Scenario: Agent needs Canvas semantics
- **WHEN** Agent lacks enough Canvas semantics to select a correct operation
- **THEN** Agent SHOULD query the Canvas authoring catalog or active context before mutating Canvas
- **AND** Canvas diagnostics MUST guide Agent toward additional queries or corrected calls when a mutation fails

### Requirement: Handoff results preserve Canvas feedback
Agent and Agent Webview SHALL preserve Canvas authoring feedback so the user can see results and Agent can continue the loop.

#### Scenario: Canvas mutation succeeds
- **WHEN** an Agent-selected Canvas tool returns created or updated nodes, connections, resources, or blocks
- **THEN** Agent Webview MUST render a structured result summary with stable Canvas refs and status
- **AND** Agent MUST be able to refer to those refs in follow-up reasoning

#### Scenario: Canvas returns diagnostics
- **WHEN** Canvas returns diagnostics, blocked reasons, or suggested next actions
- **THEN** Agent Webview MUST expose the user-visible diagnostics in the conversation or result projection
- **AND** Agent MUST be able to retry with corrected arguments, ask for approval, query more context, or stop based on the structured feedback

#### Scenario: Follow-up action requires approval
- **WHEN** Canvas feedback includes a mutating follow-up action or next action that requires approval
- **THEN** Agent Webview or the lifecycle backend MUST require explicit approval context before invocation
- **AND** the action MUST NOT execute as an automatic side effect of rendering the result

### Requirement: Hidden legacy Canvas mutation paths are fail-closed
New Agent-to-Canvas authoring handoffs SHALL NOT return success through hidden Webview commands, old structured plugin-transfer payloads, or storyboard-specific fallback paths.

#### Scenario: New handoff reaches legacy plugin transfer
- **WHEN** a new authoring handoff would route through old structured plugin-transfer payloads such as Canvas text, structured content, storyboard payloads, or direct import masquerading as authoring
- **THEN** the path MUST fail visibly or be migrated to Agent-selected Canvas tools before returning success
- **AND** tests MUST poison the legacy route for new authoring requests

#### Scenario: Markdown storyboard path remains available as a tool
- **WHEN** Agent selects a Canvas Markdown or storyboard capability as part of a handoff
- **THEN** that capability MAY remain available as a Canvas-owned tool
- **AND** it MUST be invoked through Agent tool selection or lifecycle approval rather than hidden Webview routing

#### Scenario: Result-only test could pass through fallback
- **WHEN** a test verifies a Send to Canvas outcome
- **THEN** the test MUST assert the canonical Agent handoff and Agent-selected Canvas tool path was hit
- **AND** it MUST NOT accept only the final Canvas state if a hidden fallback could have produced the same state
