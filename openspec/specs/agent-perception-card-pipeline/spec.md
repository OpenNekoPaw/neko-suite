# agent-perception-card-pipeline Specification

## Purpose
Define the shared PerceptionCard contract and runtime perception pipeline boundaries used to turn generated or referenced media assets into provider-agnostic structured observations. This capability keeps persisted perception data host-agnostic and confines file, Webview, and provider payload adaptation to injected ports or adapters.

## Requirements
### Requirement: Perception card is a shared structured media observation
The system SHALL define `PerceptionCard` in the shared layer as a provider-agnostic media observation. A card MUST include schema version, asset id, modality, creation metadata, layer status, structural metadata, optional semantic evidence entries, optional perceptual asset references, optional cost metadata, and optional cache key.

#### Scenario: Image asset produces layer zero card
- **WHEN** perception runs for a generated image with no deep analysis requested
- **THEN** the resulting card contains version, asset id, image modality, complete Layer 0 status, MIME type, byte size, width, and height

#### Scenario: Semantic evidence carries independent confidence
- **WHEN** perception produces a description and a transcript for the same asset
- **THEN** each evidence entry carries its own confidence and diagnostics instead of relying on a single card-level confidence score

### Requirement: Perceptual assets use stable references
The system SHALL represent derived perceptual outputs such as keyframes, thumbnails, waveforms, and multi-view renders as `PerceptualAssetRef` values. These references MUST use stable relative URI or `${VAR}/path` values and MUST NOT persist inline base64, webview URI, `file://` URI, or absolute path values.

#### Scenario: Video keyframes are referenced by asset refs
- **WHEN** Layer 2 perception extracts keyframes from a video
- **THEN** the card stores keyframe references with asset id, stable URI, MIME type, label or timestamp metadata

#### Scenario: Host URI is adapter-only
- **WHEN** a Webview needs to render a perceptual thumbnail
- **THEN** the Extension adapter resolves the stable asset reference to a webview-safe URI outside the persisted PerceptionCard

### Requirement: Perception pipeline uses runtime service ports
The system SHALL implement perception as a runtime service that depends on injected ports for asset resolution, media probing, perception clients, and derived perceptual asset generation. The runtime service MUST NOT import VSCode APIs, React, or Webview APIs.

#### Scenario: Runtime resolves stable asset ref through port
- **WHEN** the pipeline needs to probe a generated asset
- **THEN** it calls `PerceptualAssetResolverPort` and passes the resolved process-local asset only to port implementations

#### Scenario: Pipeline composes layer one evidence
- **WHEN** policy requests Layer 1 for a video asset
- **THEN** the pipeline composes available transcription, description, shot detection, or scoring evidence through injected perception clients

### Requirement: Perception policy controls timing and depth
The system SHALL resolve perception timing and requested layers from task context, workflow context, modality, and explicit user or LLM requests. The policy MUST support `on-completion`, `on-reference`, and `on-demand` timing.

#### Scenario: Workflow step triggers completion perception
- **WHEN** a media generation task is part of a workflow step with a following node
- **THEN** the policy requests on-completion perception with at least Layer 0 and policy-selected Layer 1 evidence

#### Scenario: Single image generation can defer deeper perception
- **WHEN** a standalone image generation task completes without an explicit follow-up dependency
- **THEN** the policy can record Layer 0 immediately and defer deeper perception until reference or demand

### Requirement: PerceiveTool provides aggregate on-demand perception
The system SHALL expose an aggregate `PerceiveTool` that accepts asset id, depth, optional focus, and optional analysis options. The tool MUST orchestrate the perception pipeline internally and MUST NOT require the LLM to call low-level transcription, classification, scoring, or shot-detection tools separately.

#### Scenario: LLM requests deeper visual analysis
- **WHEN** the LLM calls `PerceiveTool` with focus `visual` and depth `2`
- **THEN** the runtime executes the necessary perception clients and derived asset ports and returns an updated PerceptionCard

#### Scenario: Low confidence evidence is marked for recovery
- **WHEN** a perception evidence entry remains below the reliability threshold after retry
- **THEN** the returned card marks that evidence as unreliable through confidence and diagnostics while preserving other high-confidence evidence
