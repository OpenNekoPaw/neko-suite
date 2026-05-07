## ADDED Requirements

### Requirement: Multimodal context uses one typed packet
The system SHALL represent text, image, audio, video, canvas, timeline, editor selection, files, URLs, generated artifacts, and engine perception evidence in a single `MultimodalContextPacket` or equivalent typed contract. The packet MUST preserve provenance, media type, URI/path policy, size/duration metadata, and conversation/workflow linkage.

#### Scenario: Image and timeline context share one packet
- **WHEN** a user sends an image attachment while a timeline selection is active
- **THEN** runtime receives one multimodal context packet containing both evidence sources with provenance

#### Scenario: Audio and video are not reduced to plain text only
- **WHEN** a user attaches audio or video
- **THEN** runtime records media metadata and optional perception evidence in the packet instead of only appending a textual filename

### Requirement: Tools declare accepted and produced modalities
The system SHALL let tools and operations declare accepted modalities, produced modalities, required evidence, output artifact types, and provider/model constraints. Runtime MUST use these declarations during tool injection, workflow planning, prompt/schema generation, and validation.

#### Scenario: Video quality tool requires video evidence
- **WHEN** a workflow node wants to invoke a video quality tool
- **THEN** runtime verifies that the multimodal packet contains video evidence or an available extractor before injecting or calling the tool

#### Scenario: Image generator produces artifact projection
- **WHEN** an image generation tool completes
- **THEN** runtime projects an image artifact with media type, path/URI, metadata, and workflow/task linkage to Webview

### Requirement: AI SDK adapters project multimodal packets to provider messages
The system SHALL keep provider-specific multimodal message conversion inside AI SDK/platform adapters. Runtime MUST remain provider-neutral and MUST NOT encode provider-specific media payload rules directly in Extension or Webview.

#### Scenario: Provider-specific image message is adapter-owned
- **WHEN** a selected provider expects image input in a provider-specific shape
- **THEN** the AI SDK adapter converts the typed packet into that shape

### Requirement: Host adapters own file and URI access
The system SHALL keep local file reading, VSCode URI conversion, Extension API calls, and workspace path resolution in host adapters. Runtime MAY request media payloads or evidence through typed adapter functions but MUST NOT import VSCode or directly assume absolute paths.

#### Scenario: Runtime requests base64 image through adapter
- **WHEN** a tool needs image bytes from a workspace file
- **THEN** runtime calls an injected adapter and receives typed media payload without importing VSCode

### Requirement: Multimodal tool calls are observable
The system SHALL project multimodal tool calls, progress, results, generated artifacts, and validation evidence to conversation-scoped Webview state. Projection MUST avoid leaking raw large payloads unless explicitly requested by UI.

#### Scenario: Tool result contains media artifact reference
- **WHEN** a multimodal tool returns a generated video
- **THEN** Webview receives a compact artifact reference and metadata rather than an unbounded binary payload

### Requirement: Multimodal context supports evaluation
The system SHALL expose evidence references from multimodal packets to evaluator and ablation runs so output quality can be compared with and without specific evidence sources.

#### Scenario: Ablation disables video evidence
- **WHEN** an experiment disables video evidence injection
- **THEN** the run still records that video evidence existed but was withheld from the model/context
