## ADDED Requirements

### Requirement: Node card previews use preview descriptors and fixed render forms
The system SHALL represent compact node-card previews with a discriminated `CardPreviewSource` that uses the fixed render forms `asset-thumbnail`, `media-poster`, `waveform`, `text`, `icon`, and `none`. Asset-based card previews MUST reuse `PreviewSourceDescriptor` and runtime preview resolution instead of ad hoc asset path helpers.

#### Scenario: Media card resolves through preview descriptor
- **WHEN** a Media child node renders as an image or video card
- **THEN** its card policy emits a `PreviewSourceDescriptor` with the appropriate preview role and asset identity, and `CardPreviewSlot` resolves the runtime URL before rendering

#### Scenario: Shot card uses role-matched inline variant
- **WHEN** a Shot child node has a selected generation candidate with a safe inline data URL
- **THEN** its card policy exposes that URL through a role-matched `PreviewSourceDescriptor.variants[].sourcePath`, and `CardPreviewSlot` renders the safe variant before requesting resolver fallback

#### Scenario: New semantic preview reuses existing visual form
- **WHEN** a model or panoramic asset node needs a compact card summary
- **THEN** its policy maps the node to an existing render form and preview role without adding a new `CardPreviewSlot` branch

#### Scenario: Text preview stays runtime-free
- **WHEN** a Text or Annotation child node renders in a card
- **THEN** its policy emits a `text` render form with a bounded excerpt and no runtime URL resolution

### Requirement: Card preview runtime boundaries remain non-persistent
The system SHALL keep node-card preview runtime URLs, resolver outputs, object URLs, engine tokens, hover playback state, and player instances out of persisted Canvas data. Card preview sources MUST persist or derive only stable source metadata and selected candidate state.

#### Scenario: Save omits resolved card preview URL
- **WHEN** a Canvas file is saved after a node card preview resolves a runtime URL
- **THEN** the saved data contains stable preview source metadata or selected candidate IDs but no resolved Webview URL, object URL, or engine token

#### Scenario: Unsafe inline variant uses resolver fallback
- **WHEN** a card preview descriptor contains a role-matched variant whose `sourcePath` is not accepted by `isSafeWebviewUrl`
- **THEN** `CardPreviewSlot` ignores the unsafe fast path and uses the preview resolver fallback when a resolvable source is available
