## ADDED Requirements

### Requirement: Local Skill identity reuses portable and Host facts

Skill development history SHALL identify a local Skill by portable name plus Host-owned source, provenance, root id, and relative location, and SHALL use the existing Host-computed package fingerprint for each content checkpoint.

#### Scenario: Same name exists in multiple sources

- **WHEN** multiple project, personal, builtin, plugin, or Marketplace Skills share a portable name
- **THEN** history lookup MUST require the full Host identity
- **AND** it MUST NOT merge entries by name, active selection, Market package version, or hidden source precedence

### Requirement: Development history records explicit checkpoints

History SHALL append an immutable checkpoint when a Skill fingerprint becomes an Evaluation baseline, candidate, evaluated result, accepted decision, rejected decision, or superseded development state.

#### Scenario: Files are saved without an Evaluation checkpoint

- **WHEN** a developer edits or saves a Skill but does not create an Evaluation baseline, candidate, result, or decision
- **THEN** the history system MUST NOT create per-save versions
- **AND** the current Host fingerprint MUST remain available for the next explicit checkpoint

### Requirement: Checkpoints preserve evidence-linked lineage

Each checkpoint SHALL record Skill identity, fingerprint, parent entry/fingerprint when applicable, origin, evidence report ids, decision, actor/time, and residual risk without copying hidden prompts or raw reports.

#### Scenario: Candidate is evaluated

- **WHEN** an approved candidate completes Evaluation
- **THEN** history MUST link the candidate fingerprint to its base fingerprint, optimization plan, Evaluation reports, and accepted or rejected result
- **AND** the decision MUST NOT rewrite an earlier immutable checkpoint

### Requirement: Rename and move lineage is explicit

Changing portable name, root, source, or relative location SHALL create a new Host identity and SHALL preserve continuity only through an explicit rename/move lineage record.

#### Scenario: Similar Skill appears at another location

- **WHEN** a Skill with identical or similar content appears under a different Host identity without an explicit rename/move record
- **THEN** history MUST treat it as a distinct Skill
- **AND** it MUST NOT infer lineage from name similarity or fingerprint alone

### Requirement: Development history stays outside the portable package

Development history SHALL remain Host/Evaluation metadata and MUST NOT be serialized into `SKILL.md` or `agents/neko.yaml`.

#### Scenario: Local checkpoint is accepted

- **WHEN** a candidate becomes the accepted local development checkpoint
- **THEN** history MAY mark that fingerprint accepted for subsequent Evaluation baselines
- **AND** it MUST NOT create or update Market package id, semver, publication, installation, or distribution state
