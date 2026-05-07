# agent-multimodal-evidence-feedback Specification

## Purpose
TBD - created by archiving change harden-neko-agent-runtime-workflow-closure. Update Purpose after archive.
## Requirements
### Requirement: Multimodal tool results become traceable evidence references
The system SHALL convert multimodal tool results into traceable artifact and evidence references. Tool-produced image, video, audio, document, and data artifacts MUST be linkable to conversation id, workflow identity, task id, tool call id, media metadata, and provenance.

#### Scenario: Image tool result becomes next-turn evidence
- **WHEN** an image generation tool produces an artifact during a workflow node
- **THEN** runtime records an artifact projection and evidence reference linked to the originating conversation, workflow run, workflow node, task, and tool call

#### Scenario: Video perception result preserves provenance
- **WHEN** a video perception tool extracts evidence from a video segment
- **THEN** the evidence reference preserves the source artifact id, perception input id, modality, summary, and workflow linkage

### Requirement: Evidence feedback can be injected into later turns by policy
The system SHALL allow workflow node policy, tool modality declarations, and ablation toggles to decide whether prior tool-produced evidence enters a later turn or workflow node. Runtime MUST support injecting summary-only references by default and payloads only through host adapter loading.

#### Scenario: Later node receives summary evidence
- **WHEN** a later workflow node requires image evidence produced by an earlier tool
- **THEN** runtime includes a summary and evidence reference in the `MultimodalContextPacket` without embedding unbounded binary payload

#### Scenario: Ablation withholds feedback evidence
- **WHEN** an experiment disables multimodal evidence feedback
- **THEN** runtime records that evidence existed but marks it withheld from the generated packet and prompt/schema context

### Requirement: Host adapters own payload loading for feedback evidence
The system SHALL keep file reads, URI conversion, base64 conversion, and byte loading for feedback evidence inside host adapters. Runtime MAY request a payload through typed adapter functions but MUST NOT import VSCode or assume absolute file paths.

#### Scenario: Runtime requests payload through adapter
- **WHEN** a provider requires image bytes for a feedback evidence reference
- **THEN** runtime calls a typed host adapter and receives a bounded media payload without reading files directly

### Requirement: Feedback evidence is observable without leaking large payloads
The system SHALL project feedback evidence and generated artifacts to Webview as compact references and metadata. Webview MUST NOT receive raw large payloads unless explicitly requested through a host-mediated action.

#### Scenario: Webview receives compact artifact reference
- **WHEN** a tool-produced video artifact is available for feedback
- **THEN** Webview receives an artifact id, URI, media type, metadata, and workflow linkage rather than raw video bytes

