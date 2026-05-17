## ADDED Requirements

### Requirement: Agent Document Context Preserves Source And Locator
The Agent multimodal context system SHALL preserve structured document source, locator, range, and excerpt metadata for document-selection payloads so runtime and tools can request additional document evidence through the shared document reading service.

#### Scenario: Document selection is not reduced to plain text
- **WHEN** Agent receives a document-selection context payload containing a structured document source and locator
- **THEN** runtime preserves those fields in the context packet instead of reducing the payload to only inline text

#### Scenario: Provider context references follow-up tool path
- **WHEN** runtime formats a document-selection payload for a model turn
- **THEN** the formatted context includes enough source and locator information for the model to call `ReadDocument` with a manifest, range, or cursor request

#### Scenario: Legacy document selection remains compatible
- **WHEN** Agent receives a legacy document-selection payload containing only file path, text, image data, content kind, and simple context
- **THEN** runtime continues to format and deliver that payload without requiring the new structured document fields
