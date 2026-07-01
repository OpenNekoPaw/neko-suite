## ADDED Requirements

### Requirement: Agent Webview Send to Canvas triggers Agent-led handoff
Agent Webview SHALL expose a single primary `Send to Canvas` action for Markdown content, but the action SHALL trigger an Agent-led Canvas handoff operation instead of directly invoking a Canvas Markdown capability from Webview.

#### Scenario: User sends Markdown to Canvas
- **WHEN** a user activates the primary `Send to Canvas` action on an Agent Markdown block
- **THEN** Agent Webview MUST send the Markdown, stable resource refs, target context, provenance, and user intent to the Agent handoff route
- **AND** Agent MUST decide whether to call Canvas, which Canvas capability to call, and which intent/profile hints to provide
- **AND** Agent Webview MUST NOT directly invoke Canvas Markdown capabilities, send old plugin-transfer storyboard payloads, or send Canvas node JSON

#### Scenario: Advanced send choices exist
- **WHEN** Agent Webview exposes secondary validation or debug choices for Markdown handoff
- **THEN** those choices MUST remain optional secondary actions
- **AND** the primary user path MUST still use Agent-led tool selection rather than a Webview default Canvas command

### Requirement: Agent owns Canvas tool selection while Canvas validates execution
Agent and Skill output SHALL be allowed to provide Markdown intent, preferred Canvas action, and profile hints. Agent SHALL own Canvas tool selection for Markdown handoffs, while Canvas SHALL remain the authority for resolving table kind, profile, validation, resource binding, and follow-up actions after a Canvas capability is invoked.

#### Scenario: Skill suggests a creative profile
- **WHEN** a Skill-generated Markdown block includes or implies a supported creative profile such as storyboard
- **THEN** Agent MAY pass that profile hint when it chooses a Canvas Markdown capability
- **AND** Canvas MUST validate the hint before returning a creative table result

#### Scenario: Skill adds fields not known to Canvas
- **WHEN** a Skill-generated Markdown table contains extra columns not declared by the resolved Canvas profile
- **THEN** Agent Webview MUST preserve the Markdown for the Agent handoff request
- **AND** Canvas MUST preserve those fields as table metadata or return profile diagnostics without requiring Agent Webview to normalize them

#### Scenario: Agent suggests an execution action
- **WHEN** Agent text or table content suggests an execution action such as split image, redraw image, generate video, or create storyboard nodes
- **THEN** Agent MAY include the suggestion as intent metadata when it selects a trusted local capability
- **AND** Canvas or the lifecycle backend MUST resolve the action to a trusted registered capability before it can be presented as executable

### Requirement: Webview resource projection remains display-only
Agent Webview SHALL use resource projections for thumbnails and status display, but SHALL send only stable resource identities to Canvas ingest.

#### Scenario: Markdown references a bound image token
- **WHEN** Agent Webview renders a Markdown table containing a token that matches a tool-result resource projection
- **THEN** Webview MAY display a thumbnail or status badge for that token
- **AND** the Agent handoff context MUST carry the corresponding `ResourceRef`, document resource ref, or authorized stable source path rather than the Webview render URI

#### Scenario: Markdown references an unresolved image token
- **WHEN** Agent Webview cannot map a table token or image target to a stable resource identity
- **THEN** Webview MUST preserve the Markdown text and may show a diagnostic
- **AND** any Agent-selected Canvas ingest request MUST return missing-resource diagnostics instead of binding by chat attachment order or filename guessing

### Requirement: Canvas ingest results are shown as structured results
Agent Webview SHALL render Agent-selected Canvas capability results with status, diagnostics, created/review artifact refs, resource summaries, and follow-up actions without requiring users to inspect raw JSON.

#### Scenario: Canvas creates a review table
- **WHEN** Canvas ingest returns a review artifact or created table node
- **THEN** Agent Webview MUST display the result status and node/reference summary
- **AND** diagnostics MUST be visible to the user in the conversation result

#### Scenario: Canvas returns generic fallback
- **WHEN** Canvas ingest displays an unsupported creative table as a generic table fallback
- **THEN** Agent Webview MUST communicate that creative semantics or execution actions are unavailable
- **AND** Agent Webview MUST NOT present the fallback as a successful creative-table execution path

### Requirement: Lifecycle follow-up actions are actionable
Agent Webview SHALL render trusted Canvas lifecycle follow-up actions as actionable controls that invoke the lifecycle backend with approval context when required.

#### Scenario: Review result returns follow-up action
- **WHEN** Canvas ingest or creative table review returns a follow-up action such as create storyboard nodes, generate image, generate video, or attach resource
- **THEN** Agent Webview MUST render the action as a user-triggerable control when the action is supported by the local lifecycle contract
- **AND** Agent Webview MUST NOT leave the only representation of the action as inert `Next actions` text

#### Scenario: Follow-up action requires approval
- **WHEN** a follow-up action has a mutating lifecycle phase or requires approval
- **THEN** Agent Webview MUST collect explicit user confirmation or route through an existing Agent/capability approval mechanism before invoking it
- **AND** the lifecycle backend MUST block the invocation if approval context is missing

#### Scenario: Follow-up action is unsupported
- **WHEN** Canvas returns an action that Agent Webview or the lifecycle backend cannot invoke
- **THEN** Agent Webview MUST display a disabled action or diagnostic
- **AND** it MUST NOT invent a fallback command or silently ignore the unsupported action

### Requirement: Skills describe creative table roles without fixed draft protocols
Agent Skills that generate creative Markdown tables SHALL describe approval, plan, and execution field roles, media reference policy, and preferred Canvas ingest intent without requiring a standalone StoryboardDraft protocol or Canvas node JSON.

#### Scenario: Comic storyboard Skill creates a table
- **WHEN** the comic/storyboard Skill asks the model to produce a Markdown storyboard table
- **THEN** the guidance MUST describe review facts, planning fields, prompts, and execution suggestions as creative table fields
- **AND** it MUST instruct Agent to choose an appropriate Canvas capability/profile for Canvas delivery rather than relying on a Webview default command, fixed `StoryboardDraftNormalized`, or old compiler payload

#### Scenario: Skill output references media
- **WHEN** a Skill instructs the model to reference images or media in Markdown tables
- **THEN** the guidance MUST require stable user-readable tokens backed by host-provided resource refs where available
- **AND** it MUST forbid Webview URIs, blob URLs, cache paths, temp paths, Engine tokens, base64 payloads, and invented resource refs
