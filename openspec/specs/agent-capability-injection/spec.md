# agent-capability-injection Specification

## Purpose
TBD - created by archiving change unify-neko-agent-runtime-workflow-boundaries. Update Purpose after archive.
## Requirements
### Requirement: Capability registration and injection are separate phases
The system SHALL distinguish capability registration from capability injection. Registered capabilities MUST be discoverable and queryable without automatically entering LLM context. Injection MUST be decided per turn or workflow node by runtime policy.

#### Scenario: Installed skill is registered but not injected
- **WHEN** a market skill is installed and discovered
- **THEN** it appears in the capability registry but its prompt/tool fragments are not injected until activation or policy selection

#### Scenario: Ablation disables injection only
- **WHEN** an experiment disables skill injection but leaves skill discovery enabled
- **THEN** skills remain discoverable while their prompt/tool/rule fragments are omitted from the LLM context

### Requirement: Market and local skills use one normalized schema
The system SHALL normalize market-installed skills, workspace-local skills, plugin-contributed skills, and built-in skills into one skill/capability schema. The schema MUST include identity, source, trust level, manifest version, prompt fragments, allowed tools/tool groups, slash commands, workflow fragments, host requirements, and optional media capabilities.

#### Scenario: Market skill installs into registry
- **WHEN** `neko-market` installs a skill package
- **THEN** agent platform discovers the installed files and registers a normalized capability contribution

#### Scenario: Local skill uses same runtime path
- **WHEN** a workspace-local skill is saved or rescanned
- **THEN** runtime normalizes it through the same schema path used by market skills

### Requirement: Capability conflicts are deterministic
The system SHALL define deterministic conflict handling for tool names, slash commands, skill ids, prompt fragment ids, and workflow fragment ids. Core capabilities MUST outrank community capabilities, community MUST outrank untrusted capabilities, and same-priority conflicts MUST require explicit namespace or alias.

#### Scenario: Slash command collision preserves builtin command
- **WHEN** a skill or plugin contributes a slash command with the same short name as a builtin command
- **THEN** the builtin command remains canonical and the contributed command requires namespace or disambiguation

#### Scenario: Tool short-name conflict is rejected or disambiguated
- **WHEN** two same-priority capabilities contribute the same short tool name
- **THEN** runtime does not inject an ambiguous short name and requires a fully qualified name or configured alias

### Requirement: Injection policy respects trust and host requirements
The system SHALL enforce trust level, permission policy, host requirements, workflow node requirements, active skill constraints, and tool budget before injecting tools or prompt fragments.

#### Scenario: Untrusted irreversible operation requires approval
- **WHEN** an untrusted capability contributes an irreversible operation
- **THEN** runtime does not auto-inject or auto-execute it without explicit policy approval

#### Scenario: Missing host requirement prevents activation
- **WHEN** a capability requires VSCode Extension API but the host is CLI
- **THEN** runtime keeps the capability registered but marks it unavailable for injection in that host

### Requirement: Slash command catalog is a projection
The system SHALL build Webview slash command catalog entries from runtime-normalized builtin, skill, and plugin command metadata. Webview MUST NOT decide command semantics beyond filtering, display, and sending typed invocation messages.

#### Scenario: Skill command appears after registration
- **WHEN** a skill with a slash command is registered and enabled
- **THEN** Webview receives a projected command catalog item with display metadata and command id

### Requirement: Capability runtime exposes introspection
The system SHALL expose runtime introspection for registered capabilities, injected capabilities, skipped capabilities, and skip reasons. The introspection MUST support debugging and evaluation without leaking host-only objects into core runtime.

#### Scenario: Skipped capability reports reason
- **WHEN** a capability is not injected due to trust, host requirement, workflow node, or ablation policy
- **THEN** runtime can report the skip reason in diagnostics or experiment output

