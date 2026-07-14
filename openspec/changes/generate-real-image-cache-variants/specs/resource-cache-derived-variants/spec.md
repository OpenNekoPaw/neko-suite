## MODIFIED Requirements

### Requirement: Generated derivatives may be cached
The system SHALL allow ResourceCache to store materially transformed derivatives of a promoted generated source asset, including bounded thumbnails, proxies, and metadata, while keeping the promoted generated source outside cache. An untransformed generated image preview MUST resolve from the generated source and MUST NOT be copied into ResourceCache as a successful derivative.

#### Scenario: Thumbnail for generated asset
- **WHEN** Webview or Canvas requests a bounded thumbnail for a promoted generated image
- **THEN** ResourceCache MAY materialize a resized thumbnail keyed by the promoted source ref and thumbnail parameters and MUST NOT return a byte-for-byte source copy as the thumbnail

#### Scenario: Full generated image preview
- **WHEN** Webview or Agent requests an untransformed full-image preview for a promoted generated image
- **THEN** the Host MUST resolve and authorize the generated source and MUST NOT copy that source into ResourceCache solely for display or byte access

#### Scenario: Thumbnail generator is unavailable
- **WHEN** a generated image thumbnail is requested and the Host has no image variant generator
- **THEN** the request MUST return an unsupported or failed diagnostic and MUST NOT fall back to copying the source file

#### Scenario: Cache is cleared after generated asset promotion
- **WHEN** `.neko/.cache` is deleted after a generated asset has been promoted
- **THEN** the promoted generated source asset MUST remain available and generated derivatives MUST be rebuilt from the promoted source when requested
