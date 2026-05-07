# agent-provider-aware-perception-delivery Specification

## Purpose
Define provider-aware projection of PerceptionCard and multimodal packet data through the AI SDK boundary. This capability keeps executor messages provider-neutral while allowing adapters to choose text, image, video, or fallback projections based on runtime and ProviderCard input modality support.

## Requirements
### Requirement: Provider input modalities are modeled separately from generation capabilities
The system SHALL represent provider input modality support with a `ProviderInputModalities` contract independent from provider generation capabilities. The resolver MUST prefer runtime adapter capabilities, then ProviderCard input modality metadata, then built-in provider defaults, then text-only fallback.

#### Scenario: Runtime adapter reports image support
- **WHEN** the selected provider adapter reports image input support at runtime
- **THEN** provider-aware projection treats image perceptual references as eligible for image content parts

#### Scenario: Unknown provider falls back to text
- **WHEN** no runtime capability, ProviderCard input metadata, or built-in default exists for a provider
- **THEN** projection uses text-only PerceptionCard summaries

### Requirement: Perception cards project through AI SDK async message projection
The system SHALL add an asynchronous multimodal projection path in `@neko/ai-sdk` that converts `MultimodalContextPacket` plus optional `PerceptionCard` values into provider-ready chat messages. The existing synchronous projection MUST remain compatible for callers that do not need async asset loading.

#### Scenario: Async projection includes perception summary
- **WHEN** a packet contains a perception card for a generated image
- **THEN** async projection includes a textual summary of structural and semantic card content in the provider message

#### Scenario: Sync projection remains usable
- **WHEN** existing code calls the synchronous multimodal packet projection without perception cards
- **THEN** it receives the same provider-neutral chat message behavior as before this change

### Requirement: Asset loading is bounded and adapter-owned
The system SHALL load image or video payloads for provider projection through an injected bounded asset loader. The loader MUST resolve `PerceptualAssetRef` values, apply media preprocessing policy, and return provider-ready payloads without storing base64 in PerceptionCard or conversation history.

#### Scenario: Image-capable provider receives thumbnail payload
- **WHEN** a provider supports image input and a perception card contains a thumbnail reference
- **THEN** async projection calls the asset loader and emits an image content part using the bounded processed payload

#### Scenario: Loader failure degrades to text
- **WHEN** asset loading fails for a perceptual reference
- **THEN** projection still emits the PerceptionCard text summary and records or returns a projection diagnostic

### Requirement: Audio uses text fallback until shared audio content exists
The system SHALL project audio perception through transcript, loudness, duration, and diagnostics text unless shared `ContentPart` and the selected provider adapter both support audio payloads. The system MUST NOT invent provider-specific audio payload shapes in agent executor code.

#### Scenario: Audio card projects as text
- **WHEN** a provider does not support shared audio content parts
- **THEN** projection emits transcript, loudness, duration, and confidence information as text content

#### Scenario: Realtime-only audio is not sent as stored payload
- **WHEN** provider input modality reports audio as `realtime-only`
- **THEN** projection treats stored audio assets as text fallback rather than sending an audio payload

### Requirement: Provider-specific rules stay out of agent executor
The system SHALL keep provider-specific media payload conversion in AI SDK or platform adapters. Agent executor code MUST only build generic chat/tool result messages and MUST NOT encode provider-specific PerceptionCard payload rules.

#### Scenario: Tool result messages remain provider-neutral
- **WHEN** `buildToolResultMessages()` serializes a tool result containing perception cards
- **THEN** it emits generic chat message content without selecting Claude, GPT, Gemini, or local-model media payload shapes

#### Scenario: Adapter chooses provider format
- **WHEN** a provider requires a specific image or video message shape
- **THEN** the AI SDK or platform adapter performs the final conversion from shared content parts to provider wire format
